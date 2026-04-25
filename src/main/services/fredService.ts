// FRED (Federal Reserve Economic Data) client + scheduler.
//
// API: https://api.stlouisfed.org/fred/series/observations?series_id=...&api_key=...
// Free key (sign up at fredaccount.stlouisfed.org). 120 requests/min limit
// — comfortably covers the 9-series daily refresh.
//
// We surface a small curated set of series rather than letting the user
// pick from FRED's ~800k. The set is opinionated: what an investor checks
// pre-market when answering "is this a rate trade or a sector trade".

import { BrowserWindow } from 'electron'

import { getPreferences } from '../database/preferences'
import {
  getAllSeriesMeta,
  getObservations,
  getSeriesMeta,
  setSeriesMeta,
  upsertObservations,
  type FredObservation
} from '../database/fredObservations'
import { dispatchNotification } from './notificationService'

const FRED_BASE = 'https://api.stlouisfed.org/fred'
const FETCH_TIMEOUT_MS = 12_000
// FRED daily updates land mid-morning ET. Refresh every 6h so a Pulse
// running through the day catches each new print without spamming.
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
// Boot delay long enough for feeds + financials backfill to clear.
const BOOT_DELAY_MS = 4 * 60 * 1000

// Minimum gap between FRED calls. Their 120/min ceiling is generous, but
// pacing to ~3/sec leaves headroom and matches the manners we use for
// SEC + Yahoo elsewhere.
const INTRA_CALL_DELAY_MS = 350

// ---- Series catalog --------------------------------------------------------
// Hand-picked indicators across rates / inflation / labor / volatility.
// `group` drives section grouping in the renderer; `format` tells the
// renderer how to print the latest value (percent vs index vs count).
// `transform` lets us derive YoY% from a level series (CPI) without a
// second API call — applied at read time, not stored.

export type FredFormat = 'percent' | 'percent-change-yoy' | 'index' | 'count-thousands'

export interface FredSeriesDef {
  id: string
  label: string
  group: 'rates' | 'inflation' | 'labor' | 'volatility'
  format: FredFormat
  // Higher / lower / either: how to color the delta. 'lower' = falling is
  // good (unemployment, claims, inflation, VIX). 'higher' = rising is
  // good (almost nothing on this list). 'either' = neutral, no color.
  preferredDirection: 'higher' | 'lower' | 'either'
}

export const FRED_SERIES: FredSeriesDef[] = [
  { id: 'DFF', label: 'Fed Funds', group: 'rates', format: 'percent', preferredDirection: 'either' },
  { id: 'DGS10', label: '10Y Treasury', group: 'rates', format: 'percent', preferredDirection: 'either' },
  { id: 'DGS2', label: '2Y Treasury', group: 'rates', format: 'percent', preferredDirection: 'either' },
  { id: 'T10Y2Y', label: '10Y–2Y Spread', group: 'rates', format: 'percent', preferredDirection: 'either' },
  { id: 'CPIAUCSL', label: 'CPI (YoY)', group: 'inflation', format: 'percent-change-yoy', preferredDirection: 'lower' },
  { id: 'CPILFESL', label: 'Core CPI (YoY)', group: 'inflation', format: 'percent-change-yoy', preferredDirection: 'lower' },
  { id: 'UNRATE', label: 'Unemployment', group: 'labor', format: 'percent', preferredDirection: 'lower' },
  { id: 'ICSA', label: 'Initial Claims', group: 'labor', format: 'count-thousands', preferredDirection: 'lower' },
  { id: 'VIXCLS', label: 'VIX', group: 'volatility', format: 'index', preferredDirection: 'lower' }
]

// ---- Fetching --------------------------------------------------------------

interface FredObservationsResponse {
  observations?: Array<{ date: string; value: string }>
}

interface FredSeriesInfoResponse {
  seriess?: Array<{
    id: string
    title: string
    units: string
    frequency: string
  }>
}

async function fetchFredJson<T>(path: string): Promise<T | null> {
  const apiKey = getPreferences().fredApiKey
  if (!apiKey) return null
  const sep = path.includes('?') ? '&' : '?'
  const url = `${FRED_BASE}${path}${sep}api_key=${apiKey}&file_type=json`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) {
      console.warn(`[fred] ${path} failed: HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[fred] ${path} fetch failed:`, err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// 730 days ≈ 24 months; enough for a YoY transform with the prior year
// of context. We let FRED return everything in that window — small for
// daily series (~500 rows), tiny for monthly (24 rows).
function observationStart(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 730)
  return d.toISOString().slice(0, 10)
}

async function fetchSeriesObservations(seriesId: string): Promise<FredObservation[] | null> {
  const start = observationStart()
  const json = await fetchFredJson<FredObservationsResponse>(
    `/series/observations?series_id=${seriesId}&observation_start=${start}&sort_order=asc`
  )
  if (!json?.observations) return null
  const out: FredObservation[] = []
  for (const obs of json.observations) {
    if (!obs.date) continue
    // FRED uses '.' for missing observations (holidays, etc.).
    const value = obs.value === '.' || obs.value === '' ? null : Number(obs.value)
    out.push({
      observationDate: obs.date,
      value: Number.isFinite(value) ? (value as number) : null
    })
  }
  return out
}

async function fetchSeriesInfo(seriesId: string): Promise<{
  title: string
  units: string
  frequency: string
} | null> {
  const json = await fetchFredJson<FredSeriesInfoResponse>(`/series?series_id=${seriesId}`)
  const entry = json?.seriess?.[0]
  if (!entry) return null
  return { title: entry.title, units: entry.units, frequency: entry.frequency }
}

// ---- Refresh orchestration -------------------------------------------------

let inFlight: Promise<void> | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function refreshAllFredSeries(): Promise<void> {
  if (inFlight) return inFlight
  if (!getPreferences().fredApiKey) {
    console.log('[fred] skip refresh — no API key configured')
    return
  }
  inFlight = (async (): Promise<void> => {
    try {
      let updated = 0
      let failed = 0
      for (const series of FRED_SERIES) {
        // Skip if last fetch was within the refresh interval — a manual
        // restart shouldn't burn fresh API calls. (Caller can pass
        // force=true via clearing the meta row, but that's an admin path
        // we don't surface yet.)
        const meta = getSeriesMeta(series.id)
        if (meta && Date.now() - meta.lastFetchedAt < REFRESH_INTERVAL_MS / 2) {
          continue
        }
        // Fetch observations first; if that succeeds and we don't already
        // have meta, lazily fetch series info too. Saves an API call on
        // refreshes when we already have the human-readable label.
        const observations = await fetchSeriesObservations(series.id)
        if (observations === null) {
          setSeriesMeta({
            seriesId: series.id,
            title: meta?.title ?? null,
            units: meta?.units ?? null,
            frequency: meta?.frequency ?? null,
            lastFetchedAt: Date.now(),
            lastObservationDate: meta?.lastObservationDate ?? null,
            fetchError: 'observations fetch failed'
          })
          failed += 1
          continue
        }
        upsertObservations(series.id, observations)
        const lastDate =
          observations.length > 0 ? observations[observations.length - 1].observationDate : null
        // Phase 4: macro shock detection. Compares the latest observation
        // to the prior one and dispatches a notification when a configured
        // threshold is crossed. Identity-keyed by observation date so a
        // re-fetch can't double-fire — and so a 6-month-old past spike
        // discovered on first cold-start doesn't notify.
        try {
          notifyMacroShock(series.id, observations)
        } catch (err) {
          console.warn(
            `[fred] macro notify failed for ${series.id}:`,
            err instanceof Error ? err.message : err
          )
        }
        let info: { title: string; units: string; frequency: string } | null = null
        if (!meta?.title) {
          await sleep(INTRA_CALL_DELAY_MS)
          info = await fetchSeriesInfo(series.id)
        }
        setSeriesMeta({
          seriesId: series.id,
          title: info?.title ?? meta?.title ?? series.label,
          units: info?.units ?? meta?.units ?? null,
          frequency: info?.frequency ?? meta?.frequency ?? null,
          lastFetchedAt: Date.now(),
          lastObservationDate: lastDate,
          fetchError: null
        })
        updated += 1
        await sleep(INTRA_CALL_DELAY_MS)
      }
      console.log(
        `[fred] refresh complete — ${updated} updated, ${failed} failed, ` +
          `${FRED_SERIES.length - updated - failed} skipped (recent)`
      )
      broadcastUpdated()
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

function broadcastUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('fred:updated')
  }
}

// ---- Snapshot for renderer -------------------------------------------------

export interface FredSeriesSnapshot {
  id: string
  label: string
  group: FredSeriesDef['group']
  format: FredFormat
  preferredDirection: FredSeriesDef['preferredDirection']
  // Most recent value (after format transform — e.g. CPI YoY% rather than
  // the raw index level). null when no data exists yet.
  latestValue: number | null
  latestDate: string | null
  // Change since the previous observation. For YoY-format series, this is
  // the change in the YoY% itself ("inflation accelerated by 0.2pp this
  // month"), which is the metric an investor actually tracks.
  delta: number | null
  // Sparkline points, oldest-first, transform-applied. Capped at 60 to
  // keep payloads small; the renderer's sparkline width is bounded
  // anyway.
  series: Array<{ date: string; value: number | null }>
  // Metadata for the renderer's tooltip / footer.
  units: string | null
  frequency: string | null
  lastFetchedAt: number | null
}

// Apply the per-series format transform. Pure function over the raw
// observation list; the DB never stores transformed values so we can
// re-format historical data when the series definition changes.
function applyTransform(
  raw: Array<{ date: string; value: number | null }>,
  format: FredFormat
): Array<{ date: string; value: number | null }> {
  if (format !== 'percent-change-yoy') return raw
  // YoY = (current - 12-months-ago) / 12-months-ago. CPI is monthly so
  // 12 indices back is exactly 12 months. We accept slight inaccuracy
  // when the series has a missing month (we still subtract 12 indices
  // back; a missing observation just yields null at that point).
  const out: Array<{ date: string; value: number | null }> = []
  for (let i = 0; i < raw.length; i++) {
    if (i < 12) {
      out.push({ date: raw[i].date, value: null })
      continue
    }
    const cur = raw[i].value
    const prior = raw[i - 12].value
    if (cur === null || prior === null || prior === 0) {
      out.push({ date: raw[i].date, value: null })
    } else {
      out.push({ date: raw[i].date, value: ((cur - prior) / prior) * 100 })
    }
  }
  return out
}

export function getMacroSnapshot(): FredSeriesSnapshot[] {
  const allMeta = new Map(getAllSeriesMeta().map((m) => [m.seriesId, m]))
  return FRED_SERIES.map((def) => {
    // applyTransform works on a {date, value} shape so it can be reused
    // for any time-series with the same shape — map the DB row's
    // observationDate over to date for that interface.
    const raw = getObservations(def.id, 240).map((o) => ({
      date: o.observationDate,
      value: o.value
    }))
    const transformed = applyTransform(raw, def.format)
    // Trim leading nulls (YoY transform's first 12 rows are always null)
    // so the sparkline starts at the first usable point.
    const firstReal = transformed.findIndex((p) => p.value !== null)
    const trimmed = firstReal === -1 ? [] : transformed.slice(firstReal)
    const sparkline = trimmed.slice(-60)
    const last = trimmed.length > 0 ? trimmed[trimmed.length - 1] : null
    const prev = trimmed.length > 1 ? trimmed[trimmed.length - 2] : null
    const meta = allMeta.get(def.id) ?? null
    return {
      id: def.id,
      label: def.label,
      group: def.group,
      format: def.format,
      preferredDirection: def.preferredDirection,
      latestValue: last?.value ?? null,
      latestDate: last?.date ?? null,
      delta:
        last && prev && last.value !== null && prev.value !== null
          ? last.value - prev.value
          : null,
      series: sparkline,
      units: meta?.units ?? null,
      frequency: meta?.frequency ?? null,
      lastFetchedAt: meta?.lastFetchedAt ?? null
    }
  })
}

// ---- Boot scheduler --------------------------------------------------------

let timer: NodeJS.Timeout | null = null
let started = false

export function startFredScheduler(): void {
  if (started) return
  started = true
  setTimeout(() => {
    void refreshAllFredSeries().catch((err) => {
      console.warn('[fred] boot refresh failed:', err instanceof Error ? err.message : err)
    })
  }, BOOT_DELAY_MS)
  timer = setInterval(() => {
    void refreshAllFredSeries().catch((err) => {
      console.warn('[fred] periodic refresh failed:', err instanceof Error ? err.message : err)
    })
  }, REFRESH_INTERVAL_MS)
}

export function stopFredScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}

// Phase 4: macro-shock detection. Compares the latest observation to the
// prior valid one and fires a notification when a configured threshold
// is crossed. Identity-keyed by observation date so a re-fetch can't
// double-fire and a stale historic spike rediscovered on cold start
// doesn't notify.
//
// Thresholds (chosen to match retail-investor "this is news" intuition):
//   VIXCLS: ±15% day-over-day → "VIX spiked / fell"
//   DGS10:  ±10 basis points day-over-day → "10Y yield moved"
// Other series are silent for v1; user can add more in a future config UI.
function notifyMacroShock(seriesId: string, observations: FredObservation[]): void {
  const valid = observations.filter((o) => o.value !== null) as Array<{
    observationDate: string
    value: number
  }>
  if (valid.length < 2) return
  const latest = valid[valid.length - 1]
  const prev = valid[valid.length - 2]

  if (seriesId === 'VIXCLS') {
    const pct = ((latest.value - prev.value) / prev.value) * 100
    if (Math.abs(pct) < 15) return
    const dir = pct >= 0 ? 'spiked' : 'fell'
    const sign = pct >= 0 ? '+' : ''
    dispatchNotification({
      category: 'macro',
      identityKey: `macro:VIXCLS:${latest.observationDate}:shock`,
      title: `VIX ${dir} ${sign}${pct.toFixed(1)}%`,
      body: `${prev.value.toFixed(2)} → ${latest.value.toFixed(2)} on ${latest.observationDate}.`,
      importance: 'urgent',
      clickAction: { kind: 'route', route: 'home' }
    })
    return
  }
  if (seriesId === 'DGS10') {
    // DGS10 is in percent (e.g., 4.30 = 4.30%). 1bp = 0.01.
    const bps = (latest.value - prev.value) * 100
    if (Math.abs(bps) < 10) return
    const sign = bps >= 0 ? '+' : ''
    dispatchNotification({
      category: 'macro',
      identityKey: `macro:DGS10:${latest.observationDate}:shock`,
      title: `10Y yield ${bps >= 0 ? 'jumped' : 'dropped'} ${sign}${bps.toFixed(0)}bps`,
      body: `${prev.value.toFixed(2)}% → ${latest.value.toFixed(2)}% on ${latest.observationDate}.`,
      importance: 'urgent',
      clickAction: { kind: 'route', route: 'home' }
    })
    return
  }
}
