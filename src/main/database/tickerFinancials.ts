// Per-quarter cashflow + income slice per ticker. Rows are upserted on
// `(symbol, periodEnd)` so restatements from Yahoo overwrite instead of
// accumulating. The financialsService computes TTM / QoQ / YoY on top of
// the last N quarters read back from here.

import { getDb } from './connection'

// 'Q' = quarter, 'A' = full fiscal year. Most tickers ship quarterly
// statements via Yahoo's timeseries endpoint, but a non-trivial slice of
// non-US ADRs (Japanese, some EU) only have annual data. The fetcher
// falls back to annual when quarterly returns empty, and computeSnapshot
// in financialsService treats annual rows as "TTM at FY-end".
export type FinancialPeriodType = 'Q' | 'A'

export interface TickerFinancialRow {
  symbol: string
  periodEnd: number // unix ms — quarter end date
  periodType: FinancialPeriodType
  revenue: number | null
  operatingCashFlow: number | null
  capex: number | null // absolute value (Yahoo reports negative)
  freeCashFlow: number | null // OCF - |capex|
  netIncome: number | null
  grossProfit: number | null
  currency: string | null
  fetchedAt: number
}

interface RawRow {
  symbol: string
  periodEnd: number
  periodType: string
  revenue: number | null
  operatingCashFlow: number | null
  capex: number | null
  freeCashFlow: number | null
  netIncome: number | null
  grossProfit: number | null
  currency: string | null
  fetchedAt: number
}

function hydrate(row: RawRow): TickerFinancialRow {
  return {
    symbol: row.symbol,
    periodEnd: row.periodEnd,
    periodType: row.periodType === 'A' ? 'A' : 'Q',
    revenue: row.revenue,
    operatingCashFlow: row.operatingCashFlow,
    capex: row.capex,
    freeCashFlow: row.freeCashFlow,
    netIncome: row.netIncome,
    grossProfit: row.grossProfit,
    currency: row.currency,
    fetchedAt: row.fetchedAt
  }
}

export interface UpsertFinancialInput {
  symbol: string
  periodEnd: number
  // 'Q' for quarterly statements (the common case), 'A' for annual when
  // the ticker only has full-year data on Yahoo (e.g. many Japanese ADRs).
  // Defaults to 'Q' when unset for backward compatibility with older
  // call sites that hardcoded the cadence.
  periodType?: FinancialPeriodType
  revenue: number | null
  operatingCashFlow: number | null
  capex: number | null
  // Direct Yahoo-provided FCF when the modern cashflow schema returns it. We
  // prefer this over OCF - |capex| because Yahoo sometimes populates only the
  // pre-computed field and leaves the derivation inputs null.
  freeCashFlow?: number | null
  netIncome: number | null
  grossProfit: number | null
  currency: string | null
}

export function upsertQuarters(rows: UpsertFinancialInput[]): number {
  if (rows.length === 0) return 0
  const now = Date.now()
  const stmt = getDb().prepare(
    `INSERT INTO ticker_financials
       (symbol, periodEnd, periodType, revenue, operatingCashFlow, capex,
        freeCashFlow, netIncome, grossProfit, currency, fetchedAt)
     VALUES
       (@symbol, @periodEnd, @periodType, @revenue, @operatingCashFlow, @capex,
        @freeCashFlow, @netIncome, @grossProfit, @currency, @fetchedAt)
     ON CONFLICT(symbol, periodEnd) DO UPDATE SET
       periodType = excluded.periodType,
       revenue = excluded.revenue,
       operatingCashFlow = excluded.operatingCashFlow,
       capex = excluded.capex,
       freeCashFlow = excluded.freeCashFlow,
       netIncome = excluded.netIncome,
       grossProfit = excluded.grossProfit,
       currency = excluded.currency,
       fetchedAt = excluded.fetchedAt`
  )
  const tx = getDb().transaction((inputs: UpsertFinancialInput[]) => {
    let count = 0
    for (const r of inputs) {
      const derived =
        r.operatingCashFlow !== null && r.capex !== null
          ? r.operatingCashFlow - Math.abs(r.capex)
          : null
      const fcf = r.freeCashFlow ?? derived
      stmt.run({
        symbol: r.symbol.toUpperCase(),
        periodEnd: r.periodEnd,
        periodType: r.periodType ?? 'Q',
        revenue: r.revenue,
        operatingCashFlow: r.operatingCashFlow,
        capex: r.capex !== null ? Math.abs(r.capex) : null,
        freeCashFlow: fcf,
        netIncome: r.netIncome,
        grossProfit: r.grossProfit,
        currency: r.currency,
        fetchedAt: now
      })
      count++
    }
    return count
  })
  return tx(rows)
}

export function getQuarters(symbol: string, limit = 8): TickerFinancialRow[] {
  const rows = getDb()
    .prepare<[string, number], RawRow>(
      `SELECT symbol, periodEnd, periodType, revenue, operatingCashFlow,
              capex, freeCashFlow, netIncome, grossProfit, currency, fetchedAt
         FROM ticker_financials
        WHERE symbol = ?
        ORDER BY periodEnd DESC
        LIMIT ?`
    )
    .all(symbol.toUpperCase(), limit)
  return rows.map(hydrate)
}

// Most-recent fetchedAt across every quarter we stored for a symbol.
// Scheduler uses this to decide whether the symbol is due for a refresh.
export function getLastFetchedAt(symbol: string): number | null {
  const row = getDb()
    .prepare<[string], { fetchedAt: number | null }>(
      `SELECT MAX(fetchedAt) AS fetchedAt
         FROM ticker_financials
        WHERE symbol = ?`
    )
    .get(symbol.toUpperCase())
  return row?.fetchedAt ?? null
}

// Snapshot of { symbol -> last fetchedAt } so the scheduler can pick stale
// symbols without one query per ticker. Missing symbols simply don't appear.
export function getAllLastFetched(): Map<string, number> {
  const rows = getDb()
    .prepare<[], { symbol: string; fetchedAt: number }>(
      `SELECT symbol, MAX(fetchedAt) AS fetchedAt
         FROM ticker_financials
        GROUP BY symbol`
    )
    .all()
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.symbol, r.fetchedAt)
  return m
}

// Symbols whose most-recent rows have revenue but no cashflow data. These
// were populated by an earlier quoteSummary path that intermittently shipped
// empty cashflow modules, leaving FCF/OCF/capex null across every quarter.
// The scheduler treats them as stale so the new timeseries-based fetcher
// backfills them without waiting for the 3-day refresh interval.
export function getSymbolsMissingCashflow(): Set<string> {
  const rows = getDb()
    .prepare<[], { symbol: string }>(
      `SELECT symbol
         FROM ticker_financials
        GROUP BY symbol
       HAVING SUM(CASE WHEN revenue IS NOT NULL THEN 1 ELSE 0 END) > 0
          AND SUM(CASE WHEN freeCashFlow IS NOT NULL OR operatingCashFlow IS NOT NULL
                       THEN 1 ELSE 0 END) = 0`
    )
    .all()
  return new Set(rows.map((r) => r.symbol))
}

// { symbol -> most-recent periodEnd (quarter end ms) }. Drives the value-chain
// "just reported" detection: a periodEnd that landed within the last ~6 weeks
// means the company has posted earnings for that quarter.
export function getAllLastPeriodEnds(): Map<string, number> {
  const rows = getDb()
    .prepare<[], { symbol: string; periodEnd: number }>(
      `SELECT symbol, MAX(periodEnd) AS periodEnd
         FROM ticker_financials
        GROUP BY symbol`
    )
    .all()
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.symbol, r.periodEnd)
  return m
}
