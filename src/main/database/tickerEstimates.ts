// Analyst estimates cache — one row per symbol. The whole record (forward EPS
// per period, price-target range, consensus split, 30d upgrade tally) lives in
// a single JSON column because it's always read as a unit and we never query
// on individual fields. Swapping the schema behind the blob only requires a
// service-level change, not a SQL migration.

import { getDb } from './connection'

import type { AnalystEstimates } from '../services/yahooFinanceService'

interface RawRow {
  symbol: string
  dataJson: string
  fetchedAt: number
}

export function upsertEstimates(value: AnalystEstimates): void {
  const { symbol, fetchedAt: _fetchedAt, ...rest } = value
  getDb()
    .prepare(
      `INSERT INTO ticker_estimates (symbol, dataJson, fetchedAt)
       VALUES (?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
         dataJson = excluded.dataJson,
         fetchedAt = excluded.fetchedAt`
    )
    .run(symbol.toUpperCase(), JSON.stringify(rest), value.fetchedAt)
}

export function getEstimates(symbol: string): AnalystEstimates | null {
  const row = getDb()
    .prepare<[string], RawRow>(
      `SELECT symbol, dataJson, fetchedAt FROM ticker_estimates WHERE symbol = ?`
    )
    .get(symbol.toUpperCase())
  if (!row) return null
  try {
    const parsed = JSON.parse(row.dataJson) as Omit<AnalystEstimates, 'symbol' | 'fetchedAt'>
    return { symbol: row.symbol, fetchedAt: row.fetchedAt, ...parsed }
  } catch {
    return null
  }
}

// { symbol -> most-recent fetchedAt } so the scheduler can pick stale symbols
// without one query per ticker. Mirrors getAllLastFetched in tickerFinancials.
export function getAllEstimatesFetchedAt(): Map<string, number> {
  const rows = getDb()
    .prepare<[], { symbol: string; fetchedAt: number }>(
      `SELECT symbol, fetchedAt FROM ticker_estimates`
    )
    .all()
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.symbol, r.fetchedAt)
  return m
}
