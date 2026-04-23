// Persistence for the "Why this matters to you" reader block. The personal
// relevance service computes matches + prose once per article and caches the
// result here; `articles` cascade deletes take care of eviction when the
// maintenance service prunes old articles.

import { getDb } from './connection'

export type RelevanceStatus = 'no_matches' | 'ready' | 'offline' | 'pending' | 'error'

// Kinds of relevance signals the matcher can produce. The renderer maps each
// kind to a tone color and an explanation template, so this union needs to
// stay aligned with the UI's TONE table. Keep new kinds additive; do not
// reuse a kind name with a different meaning.
export type PersonalMatchKind =
  | 'ticker-direct' // symbol appears and is in the user's active watchlist
  | 'ticker-indirect' // symbol appears and is a supply-chain neighbor of a watchlist ticker
  | 'team' // user's favorite team
  | 'athlete' // user's favorite athlete
  | 'geo' // user's tracked location keyword

export interface PersonalMatch {
  kind: PersonalMatchKind
  label: string // display string (e.g. "NVDA", "Arsenal", "Toronto")
  detail: string // short qualifier ("in your watchlist", "supplier to NVDA")
  symbol?: string // ticker symbol for click-through (ticker-* kinds)
  relatedSymbol?: string // for ticker-indirect, the watchlist symbol it's tied to
  relation?: 'supplier' | 'customer' | 'competitor'
}

export interface ArticleRelevanceRow {
  articleId: number
  matches: PersonalMatch[]
  summary: string | null
  status: RelevanceStatus
  computedAt: number
  summaryGeneratedAt: number | null
}

interface RawRow {
  articleId: number
  matchesJson: string
  summary: string | null
  status: string
  computedAt: number
  summaryGeneratedAt: number | null
}

function hydrate(row: RawRow): ArticleRelevanceRow {
  let matches: PersonalMatch[] = []
  try {
    const parsed = JSON.parse(row.matchesJson) as unknown
    if (Array.isArray(parsed)) matches = parsed as PersonalMatch[]
  } catch {
    // Corrupt payload — treat as no matches. The status field is still the
    // authoritative signal for the renderer.
  }
  return {
    articleId: row.articleId,
    matches,
    summary: row.summary,
    status: row.status as RelevanceStatus,
    computedAt: row.computedAt,
    summaryGeneratedAt: row.summaryGeneratedAt
  }
}

export function getRelevance(articleId: number): ArticleRelevanceRow | null {
  const row = getDb()
    .prepare<[number], RawRow>(
      `SELECT articleId, matchesJson, summary, status, computedAt, summaryGeneratedAt
       FROM article_relevance WHERE articleId = ?`
    )
    .get(articleId)
  if (!row) return null
  return hydrate(row)
}

export interface UpsertInput {
  articleId: number
  matches: PersonalMatch[]
  summary: string | null
  status: RelevanceStatus
  summaryGeneratedAt?: number | null
}

export function upsertRelevance(input: UpsertInput): void {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO article_relevance
         (articleId, matchesJson, summary, status, computedAt, summaryGeneratedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(articleId) DO UPDATE SET
         matchesJson = excluded.matchesJson,
         summary = excluded.summary,
         status = excluded.status,
         computedAt = excluded.computedAt,
         summaryGeneratedAt = excluded.summaryGeneratedAt`
    )
    .run(
      input.articleId,
      JSON.stringify(input.matches),
      input.summary,
      input.status,
      now,
      input.summaryGeneratedAt ?? (input.summary ? now : null)
    )
}

// Update only the summary + status, leaving the matches intact. Called when
// the Ollama task completes after an initial row was written with summary=null.
export function updateRelevanceSummary(
  articleId: number,
  summary: string | null,
  status: RelevanceStatus
): void {
  const now = Date.now()
  getDb()
    .prepare(
      `UPDATE article_relevance
         SET summary = ?, status = ?, summaryGeneratedAt = ?
       WHERE articleId = ?`
    )
    .run(summary, status, summary ? now : null, articleId)
}

// Wipe every cached row. Called when the user mutates a relevance input
// (watchlist add/remove, favorite team add/remove, geo interest toggle) —
// coarse but correct, and the cost is a single DELETE; rows lazily rebuild
// as the user reads articles.
export function invalidateAllRelevance(): number {
  const info = getDb().prepare(`DELETE FROM article_relevance`).run()
  return info.changes
}
