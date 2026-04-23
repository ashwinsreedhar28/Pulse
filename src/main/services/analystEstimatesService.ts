// Forward-looking analyst consensus: price targets, forward EPS estimates,
// and a 30-day upgrade/downgrade tally. Refreshed on its own cadence (weekly
// is plenty — analyst updates don't move as fast as quarterly earnings).
//
// Mirrors the financialsService shape: a scheduler sweeps stale symbols in
// the background, the renderer reads a cached snapshot, and one-off force
// refreshes bypass the staleness gate.

import { BrowserWindow } from 'electron'

import {
  getAllEstimatesFetchedAt,
  getEstimates,
  upsertEstimates
} from '../database/tickerEstimates'
import { listTickers } from '../database/tickers'
import {
  getAnalystEstimates,
  type AnalystEstimates
} from './yahooFinanceService'

// Analyst coverage moves slowly — a weekly sweep catches upgrade/downgrade
// cycles without wasting Yahoo crumbs. Price-target revisions cluster after
// earnings; the financials scheduler's post-earnings refresh and the weekly
// sweep overlap enough that we'll catch those within a few days.
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
const TICK_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12h
const SYMBOLS_PER_TICK = 6
const INTRA_TICK_DELAY_MS = 400

export function getEstimatesSnapshot(symbol: string): AnalystEstimates | null {
  return getEstimates(symbol)
}

// Batch read for the value-chain mount. Preserves order + uniqueness so the
// renderer can zip results against its tile list.
export function getEstimatesSnapshotsForSymbols(symbols: string[]): AnalystEstimates[] {
  const seen = new Set<string>()
  const out: AnalystEstimates[] = []
  for (const s of symbols) {
    const key = s.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    const row = getEstimates(key)
    if (row) out.push(row)
  }
  return out
}

export async function refreshEstimates(symbol: string): Promise<AnalystEstimates | null> {
  const value = await getAnalystEstimates(symbol)
  if (!value) return null
  upsertEstimates(value)
  broadcastUpdated(symbol)
  return value
}

function broadcastUpdated(symbol: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('estimates:updated', symbol.toUpperCase())
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sweep(): Promise<void> {
  // Only active (watchlist) tickers. Passive graph nodes get estimates on
  // demand when the user promotes them or hits "Compare peers" against them.
  const tickers = listTickers().filter((t) => t.isActive)
  if (tickers.length === 0) return
  const lastFetched = getAllEstimatesFetchedAt()
  const now = Date.now()
  const queued = tickers
    .map((t) => ({ symbol: t.symbol, last: lastFetched.get(t.symbol.toUpperCase()) ?? 0 }))
    .filter((x) => now - x.last >= REFRESH_INTERVAL_MS)
    .sort((a, b) => a.last - b.last)
    .slice(0, SYMBOLS_PER_TICK)

  for (const entry of queued) {
    try {
      await refreshEstimates(entry.symbol)
    } catch (err) {
      console.warn(
        `[estimates] refresh failed for ${entry.symbol}:`,
        err instanceof Error ? err.message : err
      )
    }
    await sleep(INTRA_TICK_DELAY_MS)
  }
}

let timer: NodeJS.Timeout | null = null
let started = false

export function startEstimatesScheduler(): void {
  if (started) return
  started = true
  // Wait past the initial boot storm + financials scheduler kickoff (which
  // fires at 20s) so Yahoo isn't hit with three bursts back-to-back.
  setTimeout(() => {
    void sweep()
  }, 45_000)
  timer = setInterval(() => {
    void sweep()
  }, TICK_INTERVAL_MS)
}

export function stopEstimatesScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}

export async function forceRefreshEstimates(symbol: string): Promise<AnalystEstimates | null> {
  return refreshEstimates(symbol)
}
