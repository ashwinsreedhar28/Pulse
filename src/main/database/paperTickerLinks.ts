// Paper <-> ticker links (migration v57). The join table behind the
// research/finance bridge.
//
// No foreign key to tickers(symbol) on purpose: a paper can be relevant to a
// company that isn't on the watchlist yet, and deleting a ticker should not
// silently destroy the research association that justified adding it.

import { getDb } from './connection'

export interface PaperTickerLink {
  paperId: string
  symbol: string
  confidence: number
  rationale: string | null
  /** 'claude' | 'concept' | 'manual' */
  source: string
  createdAt: number
}

export function upsertPaperTickerLinks(links: PaperTickerLink[]): number {
  if (links.length === 0) return 0
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO paper_ticker_links
       (paperId, symbol, confidence, rationale, source, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(paperId, symbol) DO UPDATE SET
       confidence = excluded.confidence,
       rationale = excluded.rationale,
       source = excluded.source,
       createdAt = excluded.createdAt
     -- A hand-made link is never overwritten by a generated one. Manual
     -- curation is the most expensive input here and must win.
     WHERE paper_ticker_links.source <> 'manual' OR excluded.source = 'manual'`
  )
  const txn = db.transaction((batch: PaperTickerLink[]) => {
    let n = 0
    for (const l of batch) {
      const info = stmt.run(
        l.paperId.trim(),
        l.symbol.trim().toUpperCase(),
        l.confidence,
        l.rationale,
        l.source,
        l.createdAt
      )
      n += info.changes
    }
    return n
  })
  return txn(links)
}

export function listLinksForPaper(paperId: string): PaperTickerLink[] {
  return getDb()
    .prepare<[string], PaperTickerLink>(
      `SELECT paperId, symbol, confidence, rationale, source, createdAt
         FROM paper_ticker_links
        WHERE paperId = ?
        ORDER BY confidence DESC`
    )
    .all(paperId.trim())
}

// The reverse direction — "what research relates to this company". This is
// the half that makes the bridge useful from the finance side.
export function listLinksForSymbol(symbol: string, limit = 50): PaperTickerLink[] {
  return getDb()
    .prepare<[string, number], PaperTickerLink>(
      `SELECT paperId, symbol, confidence, rationale, source, createdAt
         FROM paper_ticker_links
        WHERE symbol = ?
        ORDER BY confidence DESC, createdAt DESC
        LIMIT ?`
    )
    .all(symbol.trim().toUpperCase(), limit)
}

export function deleteLink(paperId: string, symbol: string): void {
  getDb()
    .prepare(`DELETE FROM paper_ticker_links WHERE paperId = ? AND symbol = ?`)
    .run(paperId.trim(), symbol.trim().toUpperCase())
}

export function countLinks(): number {
  const row = getDb()
    .prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM paper_ticker_links`)
    .get()
  return row?.n ?? 0
}
