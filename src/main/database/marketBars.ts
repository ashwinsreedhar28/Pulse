// Persisted OHLCV bars (migration v55).
//
// Pulse fetches a full day of 1-minute bars for every watchlist ticker on
// each 60s quote poll and, before this table existed, kept two numbers from
// it. Storing them costs one small transaction per poll and is the only way
// to ever compute a return — nothing else in the app persists a price.
//
// Write volume is kept sane by a per-symbol high-water mark: after the first
// poll of a session only the handful of genuinely new minute bars are
// written, not all ~390 of them.

import { getDb } from './connection'

export type BarInterval = '1m' | '5m' | '1h' | '1d'

export interface MarketBar {
  symbol: string
  intervalLabel: BarInterval
  tsMs: number
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

// symbol|interval -> newest tsMs already persisted. Lazily seeded from the
// DB so a restart doesn't re-write the whole day back over itself.
const highWater = new Map<string, number>()
let seeded = false

function seedHighWater(): void {
  if (seeded) return
  seeded = true
  try {
    const rows = getDb()
      .prepare<[], { symbol: string; intervalLabel: string; maxTs: number }>(
        `SELECT symbol, intervalLabel, MAX(tsMs) AS maxTs
           FROM market_bars GROUP BY symbol, intervalLabel`
      )
      .all()
    for (const r of rows) highWater.set(`${r.symbol}|${r.intervalLabel}`, r.maxTs)
  } catch {
    // Table missing (pre-v55) — treat as empty and let the insert path fail
    // loudly instead of silently pretending everything is already stored.
  }
}

// INSERT OR IGNORE rather than upsert: a closed bar never changes, and the
// in-flight current-minute bar is better left at its first-seen value than
// rewritten on every poll.
export function upsertBars(bars: MarketBar[]): number {
  if (bars.length === 0) return 0
  const db = getDb()
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO market_bars
       (symbol, intervalLabel, tsMs, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const txn = db.transaction((batch: MarketBar[]) => {
    let n = 0
    for (const b of batch) {
      const info = stmt.run(
        b.symbol,
        b.intervalLabel,
        b.tsMs,
        b.open,
        b.high,
        b.low,
        b.close,
        b.volume
      )
      n += info.changes
    }
    return n
  })
  return txn(bars)
}

// Filters `bars` down to those newer than what's already stored for that
// symbol+interval, writes them, and advances the mark. Returns rows written.
export function persistNewBars(
  symbol: string,
  intervalLabel: BarInterval,
  bars: MarketBar[]
): number {
  if (bars.length === 0) return 0
  seedHighWater()
  const key = `${symbol}|${intervalLabel}`
  const mark = highWater.get(key) ?? 0
  const fresh = bars.filter((b) => b.tsMs > mark)
  if (fresh.length === 0) return 0

  const written = upsertBars(fresh)
  let maxTs = mark
  for (const b of fresh) if (b.tsMs > maxTs) maxTs = b.tsMs
  highWater.set(key, maxTs)
  return written
}

export function listBars(
  symbol: string,
  intervalLabel: BarInterval,
  fromMs: number,
  toMs: number
): MarketBar[] {
  return getDb()
    .prepare<[string, string, number, number], MarketBar>(
      `SELECT symbol, intervalLabel, tsMs, open, high, low, close, volume
         FROM market_bars
        WHERE symbol = ? AND intervalLabel = ? AND tsMs >= ? AND tsMs <= ?
        ORDER BY tsMs ASC`
    )
    .all(symbol.toUpperCase(), intervalLabel, fromMs, toMs)
}

export function countBars(): number {
  const row = getDb()
    .prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM market_bars`)
    .get()
  return row?.n ?? 0
}

export interface BarCoverage {
  symbols: number
  rows: number
  oldestMs: number | null
  newestMs: number | null
}

// Backs the scheduler diagnostics log — makes "is price capture actually
// working" answerable without opening the DB.
export function barCoverage(intervalLabel: BarInterval): BarCoverage {
  const row = getDb()
    .prepare<[string], { symbols: number; rows: number; oldestMs: number | null; newestMs: number | null }>(
      `SELECT COUNT(DISTINCT symbol) AS symbols, COUNT(*) AS rows,
              MIN(tsMs) AS oldestMs, MAX(tsMs) AS newestMs
         FROM market_bars WHERE intervalLabel = ?`
    )
    .get(intervalLabel)
  return row ?? { symbols: 0, rows: 0, oldestMs: null, newestMs: null }
}

// Test seam / used after a bulk backfill writes behind the cached mark.
export function resetHighWaterCache(): void {
  highWater.clear()
  seeded = false
}
