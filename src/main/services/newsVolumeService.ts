// Keeps news_volume_daily current from GDELT GKG on BigQuery (the series
// Experiment 1 validated: Timestral-28M beat seasonal naive and empirical
// 28-day quantiles on it; see the Runpod project's pulse-timestral-plan).
//
// First run per held ticker backfills 2017-01-01 onward (a full scan measured
// ~66 GB, inside the BigQuery free tier); afterwards each refresh recounts
// the last few UTC days. maximum_bytes_billed caps every query so a bug fails
// the query instead of scanning past the cap.
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import patternsFile from '../../data/gdeltOrgPatterns.json'
import { listTickers } from '../database/tickers'
import {
  GKG_SOURCE,
  forecastSymbolsFor,
  getNewsVolumeForecasts,
  getNewsVolumeMatrix,
  getSymbolForecasts,
  newsVolumeLastDay,
  newsVolumeSymbols,
  upsertNewsVolume,
  upsertNewsVolumeForecasts
} from '../database/newsVolume'
import type { NewsVolumeBoard, NewsVolumeBoardRow, NewsVolumeSnapshot, NewsVolumeSnapshotDay } from '../../preload'
import { cdfAt, isSurge, quantileAt } from './newsVolumeMath'
import { callWorker } from './timestralWorker'

const HISTORY_START = '2017-01-01'
const REFRESH_MS = 6 * 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 3 * 60 * 1000
const REFETCH_DAYS = 3
const BACKFILL_MAX_BYTES = 120e9
const INCREMENTAL_MAX_BYTES = 5e9
const BACKFILL_MIN_GAP_MS = 24 * 60 * 60 * 1000

// Forecasting: the configuration Experiment 1 validated (bench/NEWSFLOW_RESULTS.md):
// Timestral-28M, <= 1024 days of context, day of week as a known-future
// categorical, one UTC day ahead. 209M scored no better at 4.8x the CPU.
const MODEL = '28M'
const CONTEXT_DAYS = 1024
// Wait until 02:00 UTC of the target day before forecasting it, so the
// previous day's count has had time to land in GDELT (it trails by ~15 min
// and keeps growing for a while).
const FORECAST_SETTLE_MS = 2 * 60 * 60 * 1000

const PATTERNS = (patternsFile as { patterns: Record<string, string> }).patterns

interface ForecastResult {
  model: string
  levels: number[]
  quantiles: Record<string, number[][]>
  ms: number
}

interface GkgResult {
  rows: Array<[string, string, number, number]>
  bytes_processed: number | null
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// The backfill is the expensive query; record attempts on disk so a crash
// loop or repeated relaunches can't re-run it more than once a day.
function stampPath(): string {
  return join(app.getPath('userData'), 'news-volume-backfill.json')
}
function lastBackfillAttempt(): number {
  try {
    const p = stampPath()
    return existsSync(p) ? Number(JSON.parse(readFileSync(p, 'utf8')).attemptedAt) || 0 : 0
  } catch {
    return 0
  }
}
function markBackfillAttempt(): void {
  try {
    writeFileSync(stampPath(), JSON.stringify({ attemptedAt: Date.now() }))
  } catch {
    // best-effort
  }
}

function pick(symbols: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of symbols) out[s] = PATTERNS[s]
  return out
}

async function fetchInto(symbols: string[], start: string, end: string, maxBytes: number, timeoutMs: number): Promise<{ rows: number; bytes: number }> {
  const r = await callWorker<GkgResult>(
    'gkg_daily',
    { patterns: pick(symbols), start, end, max_bytes: maxBytes },
    timeoutMs
  )
  const rows = upsertNewsVolume(
    GKG_SOURCE,
    r.rows.map(([symbol, day, count, norm]) => ({ symbol, day, count, norm }))
  )
  return { rows, bytes: r.bytes_processed ?? 0 }
}

let running = false
let disabledReason: string | null = null
let warnedMissing = ''
let lastRunAt: number | null = null
let lastError: string | null = null

// Python's weekday (Mon=0), as the backtest encoded it. Codes are target-
// encoded per series, so only consistency matters.
function dowCode(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
}

// One-step forecast of `targetDay` from counts through `lastContextDay`, for
// the symbols that don't have one yet. Missing days go to the model as NaN.
async function forecastTarget(symbols: string[], lastContextDay: string, targetDay: string): Promise<number> {
  const done = forecastSymbolsFor(GKG_SOURCE, targetDay, MODEL)
  const todo = symbols.filter((s) => !done.has(s))
  if (todo.length === 0) return 0
  const firstDay = addDays(lastContextDay, -(CONTEXT_DAYS - 1))
  const days: string[] = []
  for (let d = firstDay; d <= lastContextDay; d = addDays(d, 1)) days.push(d)
  const matrix = getNewsVolumeMatrix(GKG_SOURCE, todo, firstDay, lastContextDay)
  const series: Record<string, Array<number | null>> = {}
  for (const s of todo) {
    const m = matrix.get(s)
    if (!m || m.size < 28) continue
    series[s] = days.map((d) => m.get(d) ?? null)
  }
  if (Object.keys(series).length === 0) return 0
  const r = await callWorker<ForecastResult>(
    'forecast',
    { model: MODEL, series, dow: [...days, targetDay].map(dowCode), horizon: 1, threads: 4 },
    10 * 60_000
  )
  const rows = Object.entries(r.quantiles).map(([symbol, steps]) => ({
    symbol,
    targetDay,
    model: MODEL,
    quantiles: steps[0],
    levels: r.levels
  }))
  upsertNewsVolumeForecasts(GKG_SOURCE, rows)
  console.log(`[news-volume] Timestral-${MODEL}: ${rows.length} forecasts for ${targetDay} in ${r.ms} ms`)
  return rows.length
}

export async function refreshNewsVolume(): Promise<{ rows: number; bytes: number } | null> {
  if (running || disabledReason) return null
  running = true
  try {
    const held = listTickers()
      .filter((t) => t.isActive)
      .map((t) => t.symbol.toUpperCase())
    const covered = held.filter((s) => PATTERNS[s])
    const missing = held.filter((s) => !PATTERNS[s]).join(', ')
    if (missing && missing !== warnedMissing) {
      warnedMissing = missing
      console.log(`[news-volume] no GDELT pattern for ${missing} (add to src/data/gdeltOrgPatterns.json)`)
    }
    if (covered.length === 0) return null
    const end = utcToday() // exclusive: yesterday is the last full UTC day
    let rows = 0
    let bytes = 0

    const have = new Set(newsVolumeSymbols(GKG_SOURCE))
    const needHistory = covered.filter((s) => !have.has(s))
    if (needHistory.length > 0 && Date.now() - lastBackfillAttempt() >= BACKFILL_MIN_GAP_MS) {
      markBackfillAttempt()
      console.log(`[news-volume] backfilling ${needHistory.length} ticker(s) from ${HISTORY_START}`)
      const r = await fetchInto(needHistory, HISTORY_START, end, BACKFILL_MAX_BYTES, 30 * 60_000)
      rows += r.rows
      bytes += r.bytes
    }

    const withHistory = new Set(newsVolumeSymbols(GKG_SOURCE))
    const tail = covered.filter((s) => withHistory.has(s))
    const last = newsVolumeLastDay(GKG_SOURCE)
    if (tail.length > 0 && last) {
      const start = addDays(last, -(REFETCH_DAYS - 1))
      if (start < end) {
        const r = await fetchInto(tail, start, end, INCREMENTAL_MAX_BYTES, 10 * 60_000)
        rows += r.rows
        bytes += r.bytes
      }
    }
    console.log(`[news-volume] refreshed ${rows} rows, ${(bytes / 1e9).toFixed(2)} GB scanned`)

    const lastDay = newsVolumeLastDay(GKG_SOURCE)
    const ready = covered.filter((s) => withHistory.has(s) || needHistory.includes(s))
    if (lastDay && ready.length > 0) {
      // Yesterday as a live run would have forecast it (context through the
      // day before), so the board can score it immediately; then today.
      await forecastTarget(ready, addDays(lastDay, -1), lastDay)
      const target = addDays(lastDay, 1)
      if (Date.now() >= Date.parse(`${target}T00:00:00Z`) + FORECAST_SETTLE_MS) {
        await forecastTarget(ready, lastDay, target)
      }
    }
    lastError = null
    return { rows, bytes }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not found at')) disabledReason = msg // no Python env: stop retrying until restart
    console.warn('[news-volume] refresh failed:', msg)
    lastError = msg
    return null
  } finally {
    running = false
    lastRunAt = Date.now()
  }
}

let firstTimer: NodeJS.Timeout | null = null
let timer: NodeJS.Timeout | null = null

export function startNewsVolumeScheduler(): void {
  stopNewsVolumeScheduler()
  firstTimer = setTimeout(() => void refreshNewsVolume(), FIRST_RUN_DELAY_MS)
  timer = setInterval(() => void refreshNewsVolume(), REFRESH_MS)
}

export function stopNewsVolumeScheduler(): void {
  if (firstTimer) clearTimeout(firstTimer)
  if (timer) clearInterval(timer)
  firstTimer = null
  timer = null
}

export function getNewsVolumeBoard(): NewsVolumeBoard {
  const held = listTickers()
    .filter((t) => t.isActive)
    .map((t) => t.symbol.toUpperCase())
  const covered = held.filter((s) => PATTERNS[s])
  const status = {
    running,
    lastRunAt,
    lastError,
    disabled: disabledReason,
    missingPatterns: held.filter((s) => !PATTERNS[s])
  }
  const asOf = newsVolumeLastDay(GKG_SOURCE)
  if (!asOf) return { source: GKG_SOURCE, model: MODEL, asOf: null, rows: [], surges: 0, status }

  const from = addDays(asOf, -29)
  const days: string[] = []
  for (let d = from; d <= asOf; d = addDays(d, 1)) days.push(d)
  const matrix = getNewsVolumeMatrix(GKG_SOURCE, covered, from, asOf)
  const fYest = getNewsVolumeForecasts(GKG_SOURCE, asOf, MODEL)
  const today = addDays(asOf, 1)
  const fToday = getNewsVolumeForecasts(GKG_SOURCE, today, MODEL)

  const rows: NewsVolumeBoardRow[] = covered.map((symbol) => {
    const m = matrix.get(symbol)
    const recent = days.map((d) => m?.get(d) ?? null)
    const last28 = recent.slice(-28).filter((v): v is number => v !== null)
    const mean28 = last28.length ? last28.reduce((a, b) => a + b, 0) / last28.length : null
    const actual = m?.get(asOf)
    const fy = fYest.get(symbol)
    const yesterday =
      fy && actual !== undefined
        ? {
            day: asOf,
            actual,
            q10: quantileAt(fy.levels, fy.quantiles, 0.1),
            q50: quantileAt(fy.levels, fy.quantiles, 0.5),
            q90: quantileAt(fy.levels, fy.quantiles, 0.9),
            pct: cdfAt(fy.levels, fy.quantiles, actual),
            surge: isSurge(fy.levels, fy.quantiles, actual)
          }
        : null
    const ft = fToday.get(symbol)
    const todayRow = ft
      ? {
          day: today,
          q10: quantileAt(ft.levels, ft.quantiles, 0.1),
          q50: quantileAt(ft.levels, ft.quantiles, 0.5),
          q90: quantileAt(ft.levels, ft.quantiles, 0.9)
        }
      : null
    return { symbol, recent, mean28, yesterday, today: todayRow }
  })
  rows.sort(
    (a, b) =>
      Number(b.yesterday?.surge ?? false) - Number(a.yesterday?.surge ?? false) ||
      (b.yesterday?.pct ?? -1) - (a.yesterday?.pct ?? -1) ||
      (b.mean28 ?? 0) - (a.mean28 ?? 0)
  )
  return {
    source: GKG_SOURCE,
    model: MODEL,
    asOf,
    rows,
    surges: rows.filter((r) => r.yesterday?.surge).length,
    status
  }
}

// ---- Per-ticker snapshot (StockDetail) ----
const SNAPSHOT_DAYS = 90
const BACKCAST_DAYS = 60
const OUTLOOK_DAYS = 7
const SNAPSHOT_TTL_MS = 10 * 60 * 1000
const snapshotCache = new Map<string, { at: number; value: NewsVolumeSnapshot }>()

function dayRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

// Fills in 1-step forecasts for the last BACKCAST_DAYS target days that don't
// have one, each from the CONTEXT_DAYS before it, in one batched worker call.
// Same definition as the nightly forecast, so stored rows are interchangeable.
async function backcast(symbol: string, counts: Map<string, number>, targets: string[]): Promise<void> {
  if (targets.length === 0) return
  const series: Record<string, Array<number | null>> = {}
  const dow: Record<string, number[]> = {}
  for (const target of targets) {
    const ctxDays = dayRange(addDays(target, -CONTEXT_DAYS), addDays(target, -1))
    const key = `${symbol}@${target}`
    series[key] = ctxDays.map((d) => counts.get(d) ?? null)
    dow[key] = [...ctxDays, target].map(dowCode)
  }
  const r = await callWorker<ForecastResult>('forecast', { model: MODEL, series, dow, horizon: 1, threads: 4 }, 5 * 60_000)
  upsertNewsVolumeForecasts(
    GKG_SOURCE,
    Object.entries(r.quantiles).map(([key, steps]) => ({
      symbol,
      targetDay: key.split('@')[1],
      model: MODEL,
      quantiles: steps[0],
      levels: r.levels
    }))
  )
}

export async function getNewsVolumeSnapshot(rawSymbol: string): Promise<NewsVolumeSnapshot> {
  const symbol = rawSymbol.toUpperCase()
  const empty = (reason: string): NewsVolumeSnapshot => ({
    symbol, available: false, reason, model: MODEL, asOf: null, days: [], today: null, outlook: [],
    calib: { n: 0, coverage: null, surges: [] }, mean28: null
  })
  if (!PATTERNS[symbol]) return empty('No GDELT pattern for this ticker yet (src/data/gdeltOrgPatterns.json).')
  if (disabledReason) return empty(disabledReason)
  const asOf = newsVolumeLastDay(GKG_SOURCE)
  if (!asOf) return empty('No news-volume data yet; the first BigQuery pull runs 3 minutes after launch.')
  const hit = snapshotCache.get(symbol)
  if (hit && hit.value.asOf === asOf && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.value

  const first = addDays(asOf, -(SNAPSHOT_DAYS + CONTEXT_DAYS))
  const counts = getNewsVolumeMatrix(GKG_SOURCE, [symbol], first, asOf).get(symbol) ?? new Map<string, number>()
  if (counts.size < 28) return empty('Not enough history for this ticker yet.')

  const btFrom = addDays(asOf, -(BACKCAST_DAYS - 1))
  const have = getSymbolForecasts(GKG_SOURCE, symbol, MODEL, btFrom, asOf)
  await backcast(symbol, counts, dayRange(btFrom, asOf).filter((d) => !have.has(d)))
  const fc = getSymbolForecasts(GKG_SOURCE, symbol, MODEL, btFrom, addDays(asOf, 1))

  const days: NewsVolumeSnapshotDay[] = dayRange(addDays(asOf, -(SNAPSHOT_DAYS - 1)), asOf).map((day) => {
    const c = counts.get(day) ?? null
    const f = fc.get(day)
    const q = (a: number): number | null => (f ? quantileAt(f.levels, f.quantiles, a) : null)
    return { day, count: c, q10: q(0.1), q50: q(0.5), q90: q(0.9), surge: !!f && c !== null && isSurge(f.levels, f.quantiles, c) }
  })
  const scored = days.filter((d) => d.count !== null && d.q10 !== null && d.q90 !== null)
  const inside = scored.filter((d) => (d.count as number) >= (d.q10 as number) && (d.count as number) <= (d.q90 as number))
  const last28 = days.slice(-28).map((d) => d.count).filter((v): v is number => v !== null)

  // Today and the 7-day outlook from one horizon-7 call on the context through asOf.
  // Step 1 is the validated one-day-ahead forecast; steps 2-7 were never backtested.
  const ctxDays = dayRange(addDays(asOf, -(CONTEXT_DAYS - 1)), asOf)
  const future = dayRange(addDays(asOf, 1), addDays(asOf, OUTLOOK_DAYS))
  const ahead = await callWorker<ForecastResult>(
    'forecast',
    {
      model: MODEL,
      series: { [symbol]: ctxDays.map((d) => counts.get(d) ?? null) },
      dow: [...ctxDays, ...future].map(dowCode),
      horizon: OUTLOOK_DAYS,
      threads: 4
    },
    2 * 60_000
  )
  const steps = ahead.quantiles[symbol] ?? []
  const outlook = steps.map((qs, i) => ({
    day: future[i],
    q10: quantileAt(ahead.levels, qs, 0.1),
    q50: quantileAt(ahead.levels, qs, 0.5),
    q90: quantileAt(ahead.levels, qs, 0.9)
  }))
  const stored = fc.get(addDays(asOf, 1))
  const today = stored
    ? {
        day: addDays(asOf, 1),
        q10: quantileAt(stored.levels, stored.quantiles, 0.1),
        q50: quantileAt(stored.levels, stored.quantiles, 0.5),
        q90: quantileAt(stored.levels, stored.quantiles, 0.9)
      }
    : (outlook[0] ?? null)

  const value: NewsVolumeSnapshot = {
    symbol,
    available: true,
    reason: null,
    model: MODEL,
    asOf,
    days,
    today,
    outlook,
    calib: {
      n: scored.length,
      coverage: scored.length ? inside.length / scored.length : null,
      surges: days
        .filter((d) => d.surge)
        .map((d) => ({ day: d.day, count: d.count as number, q90: d.q90 as number }))
    },
    mean28: last28.length ? last28.reduce((a, b) => a + b, 0) / last28.length : null
  }
  snapshotCache.set(symbol, { at: Date.now(), value })
  return value
}
