// Point-in-time fundamentals snapshots (migration v55).
//
// getFundamentals() computes marketCap / PE / 52-week range and caches it in
// RAM for 30 minutes. Nothing survived a restart, so the market graph had no
// metric to size nodes by, the event study had no way to bucket by size, and
// the 52-week-touch alert could only fire for tickers opened in the current
// session. This table is the durable half of that cache.

import { getDb } from './connection'

export interface FundamentalsSnapshot {
  symbol: string
  tsMs: number
  marketCap: number | null
  peRatio: number | null
  forwardPE: number | null
  eps: number | null
  dividendYield: number | null
  weekHigh52: number | null
  weekLow52: number | null
  currency: string | null
}

interface FundamentalsLike {
  marketCap: number | null
  peRatio: number | null
  forwardPE: number | null
  eps: number | null
  dividendYield: number | null
  weekHigh52: number | null
  weekLow52: number | null
  currency: string | null
  fetchedAt: number
}

// Snapshots are bucketed to the hour. Fundamentals move slowly and
// getFundamentals can be called many times an hour across page mounts;
// without bucketing this table would grow far faster than the data changes.
const BUCKET_MS = 60 * 60 * 1000

export function insertFundamentalsSnapshot(symbol: string, f: FundamentalsLike): void {
  const bucketed = Math.floor(f.fetchedAt / BUCKET_MS) * BUCKET_MS
  getDb()
    .prepare(
      `INSERT INTO ticker_fundamentals
         (symbol, tsMs, marketCap, peRatio, forwardPE, eps,
          dividendYield, weekHigh52, weekLow52, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol, tsMs) DO UPDATE SET
         marketCap = excluded.marketCap,
         peRatio = excluded.peRatio,
         forwardPE = excluded.forwardPE,
         eps = excluded.eps,
         dividendYield = excluded.dividendYield,
         weekHigh52 = excluded.weekHigh52,
         weekLow52 = excluded.weekLow52,
         currency = excluded.currency`
    )
    .run(
      symbol.toUpperCase(),
      bucketed,
      f.marketCap,
      f.peRatio,
      f.forwardPE,
      f.eps,
      f.dividendYield,
      f.weekHigh52,
      f.weekLow52,
      f.currency
    )
}

// Latest snapshot per symbol — the market graph's node-sizing query.
export function getLatestFundamentals(symbols: string[]): Map<string, FundamentalsSnapshot> {
  const out = new Map<string, FundamentalsSnapshot>()
  if (symbols.length === 0) return out
  const placeholders = symbols.map(() => '?').join(',')
  const rows = getDb()
    .prepare<string[], FundamentalsSnapshot>(
      `SELECT f.symbol, f.tsMs, f.marketCap, f.peRatio, f.forwardPE, f.eps,
              f.dividendYield, f.weekHigh52, f.weekLow52, f.currency
         FROM ticker_fundamentals f
         JOIN (SELECT symbol, MAX(tsMs) AS maxTs
                 FROM ticker_fundamentals
                WHERE symbol IN (${placeholders})
                GROUP BY symbol) latest
           ON latest.symbol = f.symbol AND latest.maxTs = f.tsMs`
    )
    .all(...symbols.map((s) => s.toUpperCase()))
  for (const r of rows) out.set(r.symbol, r)
  return out
}

export function countFundamentalsSnapshots(): number {
  const row = getDb()
    .prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM ticker_fundamentals`)
    .get()
  return row?.n ?? 0
}
