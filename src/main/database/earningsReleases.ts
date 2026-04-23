// Earnings press-release summaries keyed by (symbol, accessionNumber). One
// row per 8-K Item 2.02 we've processed. The summaryJson blob holds the full
// structured Ollama output (overview + keyNumbers + guidance + quotes).
//
// Status values:
//   pending  — row created, fetch + Ollama still in flight
//   ready    — summary populated
//   offline  — Ollama was unreachable; retry on next detail-page open
//   error    — parse / fetch / schema failure; don't auto-retry (likely bad
//              primary document — e.g., an 8-K 2.02 where Yahoo split the
//              release into a non-HTML exhibit we can't decode)

import { getDb } from './connection'

import type { EarningsReleaseSummary } from '../services/ollamaService'

export type EarningsReleaseStatus = 'pending' | 'ready' | 'offline' | 'error'

export interface EarningsReleaseRow {
  symbol: string
  accessionNumber: string
  status: EarningsReleaseStatus
  summary: EarningsReleaseSummary | null
  rawTextLength: number | null
  filedAt: number
  generatedAt: number | null
}

interface RawRow {
  symbol: string
  accessionNumber: string
  status: string
  summaryJson: string | null
  rawTextLength: number | null
  filedAt: number
  generatedAt: number | null
}

function hydrate(row: RawRow): EarningsReleaseRow {
  let summary: EarningsReleaseSummary | null = null
  if (row.summaryJson) {
    try {
      summary = JSON.parse(row.summaryJson) as EarningsReleaseSummary
    } catch {
      summary = null
    }
  }
  return {
    symbol: row.symbol,
    accessionNumber: row.accessionNumber,
    status: (row.status as EarningsReleaseStatus) ?? 'error',
    summary,
    rawTextLength: row.rawTextLength,
    filedAt: row.filedAt,
    generatedAt: row.generatedAt
  }
}

export function upsertEarningsRelease(input: {
  symbol: string
  accessionNumber: string
  status: EarningsReleaseStatus
  summary: EarningsReleaseSummary | null
  rawTextLength: number | null
  filedAt: number
}): void {
  getDb()
    .prepare(
      `INSERT INTO earnings_releases
         (symbol, accessionNumber, status, summaryJson, rawTextLength, filedAt, generatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol, accessionNumber) DO UPDATE SET
         status = excluded.status,
         summaryJson = excluded.summaryJson,
         rawTextLength = excluded.rawTextLength,
         generatedAt = excluded.generatedAt`
    )
    .run(
      input.symbol.toUpperCase(),
      input.accessionNumber,
      input.status,
      input.summary ? JSON.stringify(input.summary) : null,
      input.rawTextLength,
      input.filedAt,
      input.summary ? Date.now() : null
    )
}

export function getEarningsRelease(
  symbol: string,
  accessionNumber: string
): EarningsReleaseRow | null {
  const row = getDb()
    .prepare<[string, string], RawRow>(
      `SELECT symbol, accessionNumber, status, summaryJson, rawTextLength, filedAt, generatedAt
         FROM earnings_releases
        WHERE symbol = ? AND accessionNumber = ?`
    )
    .get(symbol.toUpperCase(), accessionNumber)
  return row ? hydrate(row) : null
}

// Batch lookup for rendering the filings list — avoids one query per 8-K row.
export function getEarningsReleasesForSymbol(
  symbol: string,
  limit = 12
): EarningsReleaseRow[] {
  const rows = getDb()
    .prepare<[string, number], RawRow>(
      `SELECT symbol, accessionNumber, status, summaryJson, rawTextLength, filedAt, generatedAt
         FROM earnings_releases
        WHERE symbol = ?
        ORDER BY filedAt DESC
        LIMIT ?`
    )
    .all(symbol.toUpperCase(), limit)
  return rows.map(hydrate)
}

// Symbols with at least one pending/offline release — the scheduler picks
// these up to retry summarization when Ollama comes back online.
export function getPendingOrOfflineReleases(
  limit = 20
): Array<{ symbol: string; accessionNumber: string; filedAt: number }> {
  return getDb()
    .prepare<[number], { symbol: string; accessionNumber: string; filedAt: number }>(
      `SELECT symbol, accessionNumber, filedAt
         FROM earnings_releases
        WHERE status IN ('pending', 'offline')
        ORDER BY filedAt DESC
        LIMIT ?`
    )
    .all(limit)
}
