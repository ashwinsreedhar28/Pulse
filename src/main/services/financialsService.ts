// Cashflow + income derived metrics for every ticker in the graph, feeding
// the value-chain "cash flow" overlay. Pulls quarterly statements from
// Yahoo, upserts them into ticker_financials, then computes TTM / QoQ / YoY
// on demand.
//
// Refresh cadence is decoupled from the price scheduler (stocksScheduler
// runs every minute during market hours; financial statements only change
// on earnings). A symbol is considered "fresh" if we've fetched its
// statements within REFRESH_INTERVAL_MS; the nightly sweep re-fetches
// anything stale. The per-request getFinancialsSnapshot path does not trigger
// a fetch — the scheduler is the single writer.

import { BrowserWindow } from 'electron'

import { listTickers } from '../database/tickers'
import {
  getAllLastFetched,
  getQuarters,
  upsertQuarters,
  type TickerFinancialRow
} from '../database/tickerFinancials'
import { getQuarterlyFinancials } from './yahooFinanceService'

// Quarters older than this don't roll forward into TTM. Yahoo ships up to
// 4 Q history per module; we store up to 8 so YoY comparisons work even
// after we start skipping ultra-stale rows.
const MAX_QUARTERS = 8

// How stale a symbol's row can get before the scheduler re-fetches it.
// Statements only change after earnings, so 3 days is plenty of headroom
// while still catching restatements and new prints within a day of release.
const REFRESH_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000

// How often the scheduler wakes up to look for stale symbols. Keep low enough
// to catch post-earnings prints quickly but high enough that we don't
// hammer Yahoo on cold boots with many tickers.
const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h

// Max symbols refreshed per tick. Each call is a quoteSummary hit against
// Yahoo; bursting them risks the 401 handshake path. Staggered over
// multiple ticks rather than all at once.
const SYMBOLS_PER_TICK = 8

// Minimum gap between two Yahoo calls during a sweep. Yahoo's unauthenticated
// quoteSummary endpoint tolerates a few calls per second; 350ms keeps us
// below any rate flag while still finishing a 10-symbol sweep in <4s.
const INTRA_TICK_DELAY_MS = 350

export interface FinancialQuarter {
  periodEnd: number
  revenue: number | null
  operatingCashFlow: number | null
  capex: number | null
  freeCashFlow: number | null
  netIncome: number | null
  grossProfit: number | null
}

export interface FinancialsSnapshot {
  symbol: string
  currency: string | null
  quarters: FinancialQuarter[] // most-recent first
  ttm: {
    revenue: number | null
    freeCashFlow: number | null
    operatingCashFlow: number | null
    netIncome: number | null
    fcfMargin: number | null // ratio 0..1
    ocfMargin: number | null
  }
  qoq: {
    revenue: number | null // ratio (e.g. 0.05 = +5%)
    freeCashFlow: number | null
  }
  yoy: {
    revenue: number | null
    freeCashFlow: number | null
  }
  fetchedAt: number | null
}

// Sum a field across the last N quarters, returning null if any quarter's
// value is null — TTM rolls forward partial numbers as "unknown" rather than
// understating.
function sumLast(
  quarters: TickerFinancialRow[],
  n: number,
  pick: (q: TickerFinancialRow) => number | null
): number | null {
  if (quarters.length < n) return null
  let total = 0
  for (let i = 0; i < n; i++) {
    const v = pick(quarters[i])
    if (v === null) return null
    total += v
  }
  return total
}

function safeRatio(num: number | null, den: number | null): number | null {
  if (num === null || den === null) return null
  if (den === 0) return null
  return (num - den) / Math.abs(den)
}

export function computeSnapshot(symbol: string): FinancialsSnapshot {
  const rows = getQuarters(symbol, MAX_QUARTERS)
  const currency = rows.find((r) => r.currency)?.currency ?? null

  const quarters: FinancialQuarter[] = rows.map((r) => ({
    periodEnd: r.periodEnd,
    revenue: r.revenue,
    operatingCashFlow: r.operatingCashFlow,
    capex: r.capex,
    freeCashFlow: r.freeCashFlow,
    netIncome: r.netIncome,
    grossProfit: r.grossProfit
  }))

  const ttmRevenue = sumLast(rows, 4, (r) => r.revenue)
  const ttmFcf = sumLast(rows, 4, (r) => r.freeCashFlow)
  const ttmOcf = sumLast(rows, 4, (r) => r.operatingCashFlow)
  const ttmNet = sumLast(rows, 4, (r) => r.netIncome)

  const fcfMargin =
    ttmFcf !== null && ttmRevenue !== null && ttmRevenue !== 0 ? ttmFcf / ttmRevenue : null
  const ocfMargin =
    ttmOcf !== null && ttmRevenue !== null && ttmRevenue !== 0 ? ttmOcf / ttmRevenue : null

  // QoQ compares most recent quarter (index 0) against the one before (1).
  // YoY compares index 0 against index 4 (four quarters back).
  const q0 = rows[0]
  const q1 = rows[1]
  const q4 = rows[4]

  const qoqRevenue = safeRatio(q0?.revenue ?? null, q1?.revenue ?? null)
  const qoqFcf = safeRatio(q0?.freeCashFlow ?? null, q1?.freeCashFlow ?? null)
  const yoyRevenue = safeRatio(q0?.revenue ?? null, q4?.revenue ?? null)
  const yoyFcf = safeRatio(q0?.freeCashFlow ?? null, q4?.freeCashFlow ?? null)

  return {
    symbol: symbol.toUpperCase(),
    currency,
    quarters,
    ttm: {
      revenue: ttmRevenue,
      freeCashFlow: ttmFcf,
      operatingCashFlow: ttmOcf,
      netIncome: ttmNet,
      fcfMargin,
      ocfMargin
    },
    qoq: { revenue: qoqRevenue, freeCashFlow: qoqFcf },
    yoy: { revenue: yoyRevenue, freeCashFlow: yoyFcf },
    fetchedAt: rows[0]?.fetchedAt ?? null
  }
}

// Snapshot-batch for the renderer. The value-chain view wants every symbol
// it has a tile for, not one-at-a-time — this lets it paint all KPIs in a
// single IPC round-trip.
export function computeSnapshotsForSymbols(symbols: string[]): FinancialsSnapshot[] {
  const out: FinancialsSnapshot[] = []
  const seen = new Set<string>()
  for (const s of symbols) {
    const key = s.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(computeSnapshot(key))
  }
  return out
}

// Refresh one symbol's quarterly statements from Yahoo and persist. Returns
// the count of quarters written, or null on fetch failure (cached row stays).
export async function refreshFinancials(symbol: string): Promise<number | null> {
  const points = await getQuarterlyFinancials(symbol)
  if (points.length === 0) return null
  const rows = points.map((p) => ({
    symbol: symbol.toUpperCase(),
    periodEnd: p.endDate,
    revenue: p.revenue,
    operatingCashFlow: p.operatingCashFlow,
    capex: p.capex,
    freeCashFlow: p.freeCashFlow,
    netIncome: p.netIncome,
    grossProfit: p.grossProfit,
    currency: p.currency
  }))
  const count = upsertQuarters(rows)
  broadcastUpdated(symbol)
  return count
}

function broadcastUpdated(symbol: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('financials:updated', symbol.toUpperCase())
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Pick the N most-stale symbols (or never-fetched) and refresh. Runs on a
// long interval so we're not fighting the minute-cadence price scheduler
// for the Yahoo crumb+cookie pair.
async function sweep(): Promise<void> {
  // Only sweep active (watchlist) tickers. Passive graph-seeded rows back
  // non-watchlist value-chain tiles — we don't proactively fetch those to
  // avoid burning Yahoo quoteSummary calls on ~65 symbols the user doesn't
  // actively follow. If a passive ticker gets promoted to the watchlist,
  // `db:tickers:activate` will pick it up on the next sweep; a user can
  // also force a single-symbol refresh via `forceRefreshFinancials`.
  const tickers = listTickers().filter((t) => t.isActive)
  if (tickers.length === 0) return
  const lastFetched = getAllLastFetched()
  const now = Date.now()

  // Rank: never-fetched first, then oldest-first. Skip anything refreshed
  // within REFRESH_INTERVAL_MS — nothing has changed there.
  const queued = tickers
    .map((t) => ({ symbol: t.symbol, last: lastFetched.get(t.symbol.toUpperCase()) ?? 0 }))
    .filter((x) => now - x.last >= REFRESH_INTERVAL_MS)
    .sort((a, b) => a.last - b.last)
    .slice(0, SYMBOLS_PER_TICK)

  for (const entry of queued) {
    try {
      await refreshFinancials(entry.symbol)
    } catch (err) {
      console.warn(
        `[financials] refresh failed for ${entry.symbol}:`,
        err instanceof Error ? err.message : err
      )
    }
    await sleep(INTRA_TICK_DELAY_MS)
  }
}

let timer: NodeJS.Timeout | null = null
let started = false

export function startFinancialsScheduler(): void {
  if (started) return
  started = true
  // Initial kick after a short delay so the boot storm (first feeds poll,
  // first stocks tick, profile warm-ups) clears before we add Yahoo traffic.
  setTimeout(() => {
    void sweep()
  }, 20_000)
  timer = setInterval(() => {
    void sweep()
  }, TICK_INTERVAL_MS)
}

export function stopFinancialsScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}

// Forced single-symbol refresh, e.g. for a user-triggered "refresh" button
// on the value-chain overlay. Bypasses the staleness gate but still rides
// the same fetch path.
export async function forceRefreshFinancials(symbol: string): Promise<FinancialsSnapshot> {
  await refreshFinancials(symbol)
  return computeSnapshot(symbol)
}
