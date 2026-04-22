// Article ↔ ticker relevance join table. Populated at ingest time by the
// relevance classifier; queried by the ticker summary service and the
// "Latest coverage" list.

import { getDb } from './connection'
import type { MatchStrength } from '../services/tickerRelevance'

export interface ArticleTickerMatch {
  articleId: number
  symbol: string
  strength: MatchStrength // 'strong' | 'weak' (never 'none' — those aren't stored)
}

export function upsertMatches(matches: ArticleTickerMatch[]): void {
  if (matches.length === 0) return
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO article_ticker_matches (articleId, symbol, strength)
     VALUES (?, ?, ?)
     ON CONFLICT(articleId, symbol) DO UPDATE SET strength = excluded.strength`
  )
  const txn = db.transaction((batch: ArticleTickerMatch[]) => {
    for (const m of batch) {
      if (m.strength === 'strong' || m.strength === 'weak') {
        stmt.run(m.articleId, m.symbol.toUpperCase(), m.strength)
      }
    }
  })
  txn(matches)
}

// Remove every match for a symbol. Called when a ticker is deleted so the
// coverage/brief queries stop surfacing stale rows.
export function deleteMatchesForSymbol(symbol: string): void {
  getDb()
    .prepare(`DELETE FROM article_ticker_matches WHERE symbol = ?`)
    .run(symbol.toUpperCase())
}

// Wipe then rewrite matches for a given article (used during backfill and
// re-classification after the ticker list changes).
export function replaceMatchesForArticle(
  articleId: number,
  matches: ArticleTickerMatch[]
): void {
  const db = getDb()
  const txn = db.transaction(() => {
    db.prepare(`DELETE FROM article_ticker_matches WHERE articleId = ?`).run(articleId)
    if (matches.length > 0) {
      const stmt = db.prepare(
        `INSERT INTO article_ticker_matches (articleId, symbol, strength)
         VALUES (?, ?, ?)`
      )
      for (const m of matches) {
        if (m.strength === 'strong' || m.strength === 'weak') {
          stmt.run(m.articleId, m.symbol.toUpperCase(), m.strength)
        }
      }
    }
  })
  txn()
}

export function countMatches(): number {
  const row = getDb()
    .prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM article_ticker_matches`)
    .get()
  return row?.n ?? 0
}

// Articles that have NEVER been classified — either the row predates the
// matches table, or the classifier ran when the ticker wasn't active yet.
// Used by the startup backfill to catch up lazily.
export function listArticlesNeedingClassification(
  limit: number
): Array<{ id: number; title: string; summary: string | null }> {
  return getDb()
    .prepare<[number], { id: number; title: string; summary: string | null }>(
      `SELECT a.id, a.title, a.summary
       FROM articles a
       WHERE NOT EXISTS (
         SELECT 1 FROM article_ticker_matches m WHERE m.articleId = a.id
       )
       ORDER BY a.publishedAt DESC, a.id DESC
       LIMIT ?`
    )
    .all(limit)
}

// For a given article, flag it as classified (no matches) so the backfill
// doesn't repeatedly reconsider articles that simply don't touch any watchlist
// ticker. Uses a sentinel `__none__` symbol — cheaper than a separate boolean
// column, and the sentinel is filtered out of every read path.
const CLASSIFIED_SENTINEL = '__none__'

export function markClassifiedWithNoMatches(articleId: number): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO article_ticker_matches (articleId, symbol, strength)
       VALUES (?, ?, ?)`
    )
    .run(articleId, CLASSIFIED_SENTINEL, 'weak')
}

export { CLASSIFIED_SENTINEL }
