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
  getSymbolsMissingCashflow,
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

// Max symbols refreshed per maintenance tick. With ~300 tickers on a
// 6h cadence we need ~50 refreshes/tick to fully cycle every 36h; 30
// keeps each sweep under 15s of wall-clock and leaves headroom.
const SYMBOLS_PER_TICK = 30

// Minimum gap between two Yahoo calls. Yahoo's unauthenticated timeseries
// endpoint tolerates a few calls per second; 350ms keeps us comfortably
// below any rate flag. Used by both the maintenance sweep and the boot
// backfill.
const INTRA_TICK_DELAY_MS = 350

// Boot-time backfill runs through every ticker that's missing financials
// entirely or has the old cashflow-degraded rows. ~300 symbols × 350ms is
// ~2 minutes total, which is acceptable for the "first few minutes after
// launch, all tiles light up" feel. Bounded so a runaway list doesn't
// infinite-loop; in practice we'll never hit this ceiling.
const BACKFILL_MAX_SYMBOLS = 500

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
  // Sweep the full ticker list — watchlist and passive graph nodes alike.
  // Passive tiles (Value Chain + peer-compare peers) consume these rows
  // just as aggressively as the watchlist does, so only fetching the
  // watchlist left 80% of the graph blank. Yahoo's timeseries endpoint is
  // anonymous and cheap; 30 symbols per tick over 6h leaves headroom.
  const tickers = listTickers()
  if (tickers.length === 0) return
  const lastFetched = getAllLastFetched()
  const missingCashflow = getSymbolsMissingCashflow()
  const now = Date.now()

  // Rank: never-fetched first, then rows stuck with missing cashflow data
  // (treated as fetchedAt=0 so they jump ahead of the staleness gate), then
  // oldest-first. Skip anything refreshed within REFRESH_INTERVAL_MS whose
  // cashflow IS populated — that row is genuinely fresh.
  const queued = tickers
    .map((t) => {
      const sym = t.symbol.toUpperCase()
      const rawLast = lastFetched.get(sym) ?? 0
      // Force cashflow-missing symbols to the top of the queue regardless
      // of when they were last fetched. Most hit this once after the
      // timeseries-fetcher swap, then never again.
      const last = missingCashflow.has(sym) ? 0 : rawLast
      return { symbol: t.symbol, last }
    })
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

// Boot-time backfill. Processes every ticker that has no financials rows
// yet plus everyone still stuck with the old cashflow-degraded rows,
// throttled to INTRA_TICK_DELAY_MS between Yahoo calls. Unlike sweep(),
// this isn't bounded by SYMBOLS_PER_TICK — the idea is that within a
// couple minutes of launch every tile has its FCF / YoY data ready
// instead of backfilling one sweep (30 symbols) at a time over weeks.
// Idempotent: safe to re-run, skips symbols that are already fresh.
async function runInitialBackfill(): Promise<void> {
  const tickers = listTickers()
  if (tickers.length === 0) return
  const lastFetched = getAllLastFetched()
  const missingCashflow = getSymbolsMissingCashflow()
  const queue: string[] = []
  for (const t of tickers) {
    const sym = t.symbol.toUpperCase()
    if (!lastFetched.has(sym)) {
      queue.push(sym)
    } else if (missingCashflow.has(sym)) {
      queue.push(sym)
    }
    if (queue.length >= BACKFILL_MAX_SYMBOLS) break
  }
  if (queue.length === 0) return
  console.log(
    `[financials] initial backfill: ${queue.length} symbol(s) (empty or cashflow-missing)`
  )
  let done = 0
  for (const sym of queue) {
    try {
      await refreshFinancials(sym)
    } catch (err) {
      console.warn(
        `[financials] backfill refresh failed for ${sym}:`,
        err instanceof Error ? err.message : err
      )
    }
    done += 1
    if (done % 25 === 0) {
      console.log(`[financials] backfill progress: ${done}/${queue.length}`)
    }
    await sleep(INTRA_TICK_DELAY_MS)
  }
  console.log(`[financials] initial backfill complete (${done} symbols)`)
}

let timer: NodeJS.Timeout | null = null
let started = false

export function startFinancialsScheduler(): void {
  if (started) return
  started = true
  // First kick after the boot storm clears: aggressive backfill that
  // processes every ticker missing data in one go (~2 min for 300
  // symbols), so Value Chain + peer-compare tiles light up quickly
  // instead of waiting days for the 6h sweep cadence to get around to
  // each passive ticker.
  setTimeout(() => {
    void runInitialBackfill()
  }, 20_000)
  // Maintenance sweep: catches earnings-print refreshes + anyone who
  // aged past the 3-day staleness window. Fires on the normal interval
  // regardless of backfill state — the two coexist safely since refresh
  // is idempotent and the "already fresh" filter short-circuits redundant
  // work.
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
