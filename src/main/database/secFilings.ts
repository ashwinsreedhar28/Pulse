// SEC filings cache + CIK lookup table. Two tables:
//
//   sec_cik_map: mirror of SEC's bulk ticker→CIK JSON (refreshed monthly),
//     keyed by symbol. Lookups are hot (every filings fetch needs a CIK)
//     so we index on symbol directly.
//
//   sec_filings: per-(symbol, accession) filing record. Dedupe is free via
//     the composite PK — re-fetching returns the same accession numbers
//     and the upsert is a no-op on existing rows.

import { getDb } from './connection'

import type { CikEntry, SecFilingRaw } from '../services/secService'

export interface SecFiling extends SecFilingRaw {
  symbol: string
}

interface RawFilingRow {
  symbol: string
  accessionNumber: string
  cik: string
  formType: string
  filedAt: number
  reportDate: number | null
  primaryDocument: string | null
  primaryDocDescription: string | null
  items: string | null
  fetchedAt: number
}

function hydrate(row: RawFilingRow): SecFiling {
  return {
    symbol: row.symbol,
    accessionNumber: row.accessionNumber,
    cik: row.cik,
    formType: row.formType,
    filedAt: row.filedAt,
    reportDate: row.reportDate,
    primaryDocument: row.primaryDocument,
    primaryDocDescription: row.primaryDocDescription,
    items: row.items
  }
}

// ---- CIK mapping -----------------------------------------------------------

export function upsertCikMap(entries: CikEntry[]): number {
  if (entries.length === 0) return 0
  const now = Date.now()
  const stmt = getDb().prepare(
    `INSERT INTO sec_cik_map (symbol, cik, companyName, fetchedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET
       cik = excluded.cik,
       companyName = excluded.companyName,
       fetchedAt = excluded.fetchedAt`
  )
  const tx = getDb().transaction((inputs: CikEntry[]) => {
    let count = 0
    for (const e of inputs) {
      stmt.run(e.symbol.toUpperCase(), e.cik, e.companyName, now)
      count++
    }
    return count
  })
  return tx(entries)
}

export function lookupCik(symbol: string): string | null {
  const row = getDb()
    .prepare<[string], { cik: string }>(
      `SELECT cik FROM sec_cik_map WHERE symbol = ?`
    )
    .get(symbol.toUpperCase())
  return row?.cik ?? null
}

// Most-recent fetchedAt across the map. Scheduler uses this to decide whether
// the full ticker→CIK dump needs re-downloading.
export function getCikMapLastFetched(): number | null {
  const row = getDb()
    .prepare<[], { fetchedAt: number | null }>(
      `SELECT MAX(fetchedAt) AS fetchedAt FROM sec_cik_map`
    )
    .get()
  return row?.fetchedAt ?? null
}

// ---- Filings ---------------------------------------------------------------

export function upsertFilings(symbol: string, rows: SecFilingRaw[]): number {
  if (rows.length === 0) return 0
  const now = Date.now()
  const sym = symbol.toUpperCase()
  const stmt = getDb().prepare(
    `INSERT INTO sec_filings
       (symbol, accessionNumber, cik, formType, filedAt, reportDate,
        primaryDocument, primaryDocDescription, items, fetchedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol, accessionNumber) DO UPDATE SET
       cik = excluded.cik,
       formType = excluded.formType,
       filedAt = excluded.filedAt,
       reportDate = excluded.reportDate,
       primaryDocument = excluded.primaryDocument,
       primaryDocDescription = excluded.primaryDocDescription,
       items = excluded.items,
       fetchedAt = excluded.fetchedAt`
  )
  const tx = getDb().transaction((inputs: SecFilingRaw[]) => {
    let count = 0
    for (const r of inputs) {
      stmt.run(
        sym,
        r.accessionNumber,
        r.cik,
        r.formType,
        r.filedAt,
        r.reportDate,
        r.primaryDocument,
        r.primaryDocDescription,
        r.items,
        now
      )
      count++
    }
    return count
  })
  return tx(rows)
}

// Most-recent N filings for a symbol. Used by the ticker detail page.
// Form filter is optional — pass a Set to narrow to specific types.
export function getFilingsForSymbol(
  symbol: string,
  limit = 20,
  formFilter?: Set<string>
): SecFiling[] {
  const rows = getDb()
    .prepare<[string, number], RawFilingRow>(
      `SELECT symbol, accessionNumber, cik, formType, filedAt, reportDate,
              primaryDocument, primaryDocDescription, items, fetchedAt
         FROM sec_filings
        WHERE symbol = ?
        ORDER BY filedAt DESC
        LIMIT ?`
    )
    .all(symbol.toUpperCase(), limit)
  const hydrated = rows.map(hydrate)
  if (!formFilter) return hydrated
  return hydrated.filter((f) => formFilter.has(f.formType))
}

// Recent filings for a batch of symbols, paired with a since-cutoff so the
// value-chain overlay can ask "any 8-Ks in the last 72h?" efficiently.
export function getRecentFilingsForSymbols(
  symbols: string[],
  sinceMs: number,
  formFilter?: Set<string>
): Map<string, SecFiling[]> {
  const out = new Map<string, SecFiling[]>()
  if (symbols.length === 0) return out
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()))]
  const placeholders = uniq.map(() => '?').join(',')
  const rows = getDb()
    .prepare<unknown[], RawFilingRow>(
      `SELECT symbol, accessionNumber, cik, formType, filedAt, reportDate,
              primaryDocument, primaryDocDescription, items, fetchedAt
         FROM sec_filings
        WHERE symbol IN (${placeholders})
          AND filedAt >= ?
        ORDER BY filedAt DESC`
    )
    .all(...uniq, sinceMs)
  for (const r of rows) {
    const filing = hydrate(r)
    if (formFilter && !formFilter.has(filing.formType)) continue
    if (!out.has(filing.symbol)) out.set(filing.symbol, [])
    out.get(filing.symbol)!.push(filing)
  }
  return out
}

// { symbol -> last fetchedAt } so the scheduler can pick stale filers without
// one query per ticker. Missing symbols don't appear.
export function getAllFilingsLastFetched(): Map<string, number> {
  const rows = getDb()
    .prepare<[], { symbol: string; fetchedAt: number }>(
      `SELECT symbol, MAX(fetchedAt) AS fetchedAt
         FROM sec_filings
        GROUP BY symbol`
    )
    .all()
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.symbol, r.fetchedAt)
  return m
}
