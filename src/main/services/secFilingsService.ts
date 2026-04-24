// SEC filings scheduler. Two concerns bundled into one service because the
// CIK map is a prerequisite for every filings fetch:
//
//   1. Refresh the bulk ticker→CIK map monthly (issuers rarely change CIKs,
//      but new listings trickle in and old ones get reclassified).
//
//   2. Pull the last 1000 filings for each watchlist ticker daily. SEC's
//      submissions endpoint is paginated; the first page covers ~2 years of
//      filings for most issuers, which is way more than we need.
//
// Passive graph nodes aren't fetched — filings are mostly interesting for
// tickers the user actually tracks. Promotion to the watchlist triggers a
// single-symbol refresh via forceRefreshFilings.

import { BrowserWindow } from 'electron'

import {
  getAllFilingsLastFetched,
  getCikMapLastFetched,
  lookupCik,
  replaceFormerNames,
  upsertCikMap,
  upsertFilings
} from '../database/secFilings'
import { listTickers } from '../database/tickers'
import { normalizeCompanyName } from './companyNameResolver'
import { processRecentEarnings } from './earningsReleasesService'
import { fetchSubmissions, fetchTickerMap } from './secService'
import { processRecentTenKs } from './tenKConcentrationService'

// CIK map refreshes monthly — new listings are rare enough that a stale
// mapping hurts only recent IPOs, which tend to show up on earnings
// calendars before they hit watchlists anyway.
const CIK_MAP_TTL_MS = 30 * 24 * 60 * 60 * 1000

// Filings per-symbol staleness gate. 24h is aggressive enough to catch same-
// day 8-Ks (SEC publishes them within hours of filing) without spamming.
const FILINGS_REFRESH_MS = 24 * 60 * 60 * 1000

// Scheduler wake-up + fan-out.
const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000
const SYMBOLS_PER_TICK = 10

// SEC enforces a 10/sec rate limit. 350ms between calls keeps us comfortably
// below that with headroom for occasional retries.
const INTRA_TICK_DELAY_MS = 350

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function refreshCikMapIfStale(force = false): Promise<void> {
  const last = getCikMapLastFetched()
  if (!force && last !== null && Date.now() - last < CIK_MAP_TTL_MS) return
  try {
    const entries = await fetchTickerMap()
    if (entries.length > 0) upsertCikMap(entries)
  } catch (err) {
    console.warn(
      '[sec] ticker map refresh failed:',
      err instanceof Error ? err.message : err
    )
  }
}

export async function refreshFilings(symbol: string): Promise<number | null> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return null
  const cik = lookupCik(sym)
  if (!cik) return null
  try {
    const { filings, formerNames } = await fetchSubmissions(cik)
    // Persist former names before filings so a concurrent resolver call on
    // a rebrand sees the alias even if upsertFilings fails later.
    if (formerNames.length > 0) {
      replaceFormerNames(
        cik,
        formerNames.map((f) => ({
          cik,
          originalName: f.name,
          normalizedName: normalizeCompanyName(f.name),
          fromDate: f.fromDate,
          toDate: f.toDate
        }))
      )
    }
    if (filings.length === 0) return 0
    const count = upsertFilings(sym, filings)
    broadcastUpdated(sym)
    // Kick the earnings-release summary pipeline for any newly-landed 8-K
    // 2.02s, and the 10-K customer-concentration extractor for any newly-
    // landed 10-K. Both are no-ops if the filing was already processed —
    // only truly new filings trigger fresh Ollama calls.
    const ticker = listTickers().find((t) => t.symbol.toUpperCase() === sym)
    if (ticker?.isActive) {
      void processRecentEarnings(sym, ticker.companyName ?? sym)
      void processRecentTenKs(sym, ticker.companyName ?? sym)
    }
    return count
  } catch (err) {
    console.warn(
      `[sec] filings fetch failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
    return null
  }
}

function broadcastUpdated(symbol: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('secFilings:updated', symbol.toUpperCase())
    }
  }
}

async function sweep(): Promise<void> {
  // Keep the CIK map fresh before using it; a missing mapping for a recent
  // listing would silently drop that ticker's filings from the sweep.
  await refreshCikMapIfStale()

  const tickers = listTickers().filter((t) => t.isActive)
  if (tickers.length === 0) return
  const lastFetched = getAllFilingsLastFetched()
  const now = Date.now()
  const queued = tickers
    .map((t) => ({ symbol: t.symbol, last: lastFetched.get(t.symbol.toUpperCase()) ?? 0 }))
    .filter((x) => now - x.last >= FILINGS_REFRESH_MS)
    .sort((a, b) => a.last - b.last)
    .slice(0, SYMBOLS_PER_TICK)

  for (const entry of queued) {
    try {
      await refreshFilings(entry.symbol)
    } catch (err) {
      console.warn(
        `[sec] refresh failed for ${entry.symbol}:`,
        err instanceof Error ? err.message : err
      )
    }
    await sleep(INTRA_TICK_DELAY_MS)
  }
}

let timer: NodeJS.Timeout | null = null
let started = false

export function startSecFilingsScheduler(): void {
  if (started) return
  started = true
  // Defer until after other boot schedulers (stocks, financials, estimates)
  // so we don't fan out concurrent network bursts at startup.
  setTimeout(() => {
    void sweep()
  }, 90_000)
  timer = setInterval(() => {
    void sweep()
  }, TICK_INTERVAL_MS)
}

export function stopSecFilingsScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}

// Forced single-symbol refresh — bypasses the staleness gate. Called when a
// user promotes a passive graph node to the watchlist, and from the future
// "Refresh" button in the ticker detail UI.
export async function forceRefreshFilings(symbol: string): Promise<number | null> {
  await refreshCikMapIfStale()
  return refreshFilings(symbol)
}
