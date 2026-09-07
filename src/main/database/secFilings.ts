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

// Most-recent N filings for a symbol. Used by the ticker detail page
// and the chain-generator filing fetchers. Form filter is optional —
// pass a Set to narrow to specific types. The form filter is pushed
// into the SQL WHERE clause so an active filer (KLAC files Form 4s
// constantly) doesn't mask its 10-Ks: a post-fetch filter on the 10
// most-recent rows would routinely return zero 10-Ks for any ticker
// with frequent insider-trade filings, even though the 10-K is in the
// table just past row 10.
export function getFilingsForSymbol(
  symbol: string,
  limit = 20,
  formFilter?: Set<string>
): SecFiling[] {
  if (formFilter && formFilter.size > 0) {
    const forms = [...formFilter]
    const placeholders = forms.map(() => '?').join(',')
    const rows = getDb()
      .prepare<unknown[], RawFilingRow>(
        `SELECT symbol, accessionNumber, cik, formType, filedAt, reportDate,
                primaryDocument, primaryDocDescription, items, fetchedAt
           FROM sec_filings
          WHERE symbol = ? AND formType IN (${placeholders})
          ORDER BY filedAt DESC
          LIMIT ?`
      )
      .all(symbol.toUpperCase(), ...forms, limit)
    return rows.map(hydrate)
  }
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
  return rows.map(hydrate)
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

// ---- Former names ----------------------------------------------------------

export interface SecFormerName {
  cik: string
  originalName: string
  normalizedName: string
  fromDate: string | null
  toDate: string | null
}

// Replace the set of former-names we have for a CIK. SEC may revise an
// issuer's history (corrections, dates added), and because the PK is
// (cik, normalizedName) a clean replace is simpler than diffing — the
// table is tiny (thousands of rows at most) so the delete+insert cost is
// negligible.
export function replaceFormerNames(cik: string, names: SecFormerName[]): number {
  const padded = cik.padStart(10, '0')
  const now = Date.now()
  const del = getDb().prepare(`DELETE FROM sec_former_names WHERE cik = ?`)
  const ins = getDb().prepare(
    `INSERT OR IGNORE INTO sec_former_names
       (cik, normalizedName, originalName, fromDate, toDate, fetchedAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const tx = getDb().transaction((rows: SecFormerName[]) => {
    del.run(padded)
    let count = 0
    for (const n of rows) {
      if (!n.normalizedName) continue
      ins.run(padded, n.normalizedName, n.originalName, n.fromDate, n.toDate, now)
      count++
    }
    return count
  })
  return tx(names)
}

// Every (cik, normalizedName) row joined back to the current ticker via
// sec_cik_map.cik. Returned as flat rows so the resolver can extend its
// name index without additional joins. Only includes entries whose CIK
// still maps to at least one ticker — rows for delisted issuers are
// skipped since the resolver has no live symbol to return.
export function listFormerNamesJoinedToSymbols(): Array<{
  symbol: string
  originalName: string
  normalizedName: string
}> {
  return getDb()
    .prepare<[], { symbol: string; originalName: string; normalizedName: string }>(
      `SELECT m.symbol AS symbol,
              f.originalName AS originalName,
              f.normalizedName AS normalizedName
         FROM sec_former_names f
         JOIN sec_cik_map m ON m.cik = f.cik`
    )
    .all()
}

// High-volume boilerplate forms. Retained only briefly: nothing in the app
// reads a filing older than the ticker detail page's top-25, and these
// dominate the table by an order of magnitude. Measured on a live DB:
// Form 4 alone was 179,873 of 411,101 rows, with 424B2 at 63,041 and
// Form 144 at 20,562. Together with 3/5/FWP that is ~68% of the table.
//
// Deliberately excludes 6-K: it is a foreign private issuer's material
// report, not boilerplate, and belongs with 8-K.
const ROUTINE_FORMS = ['4', '3', '5', '144', '424B2', '424B5', 'FWP']

// Drop routine filings older than the cutoff. Material forms (8-K, 10-K,
// 10-Q, DEF 14A, SC 13D, S-1, 6-K...) are never purged — those are the
// event history the research and event-study paths depend on, and unlike
// the boilerplate they are low-volume enough to keep indefinitely.
export function purgeRoutineFilings(cutoffMs: number): number {
  const placeholders = ROUTINE_FORMS.map(() => '?').join(',')
  const info = getDb()
    .prepare(
      `DELETE FROM sec_filings
        WHERE filedAt < ? AND formType IN (${placeholders})`
    )
    .run(cutoffMs, ...ROUTINE_FORMS)
  return info.changes
}
