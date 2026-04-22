import { getDb } from './connection'
import type { Domain } from './categories'

export interface Article {
  id: number
  feedId: number
  guid: string | null
  title: string
  summary: string | null
  url: string
  publishedAt: number | null
  isRead: boolean
  isBookmarked: boolean
  urgencyScore: number | null
  urgencyReason: string | null
  scoredAt: number | null
  domain: Domain
  imageURL: string | null
  feedTitle: string
  feedIconURL: string | null
}

interface ArticleRow {
  id: number
  feedId: number
  guid: string | null
  title: string
  summary: string | null
  url: string
  publishedAt: number | null
  isRead: number
  isBookmarked: number
  urgencyScore: number | null
  urgencyReason: string | null
  scoredAt: number | null
  domain: Domain
  imageURL: string | null
  feedTitle: string
  feedIconURL: string | null
}

const toArticle = (row: ArticleRow): Article => ({
  id: row.id,
  feedId: row.feedId,
  guid: row.guid,
  title: row.title,
  summary: row.summary,
  url: row.url,
  publishedAt: row.publishedAt,
  isRead: row.isRead === 1,
  isBookmarked: row.isBookmarked === 1,
  urgencyScore: row.urgencyScore,
  urgencyReason: row.urgencyReason,
  scoredAt: row.scoredAt,
  domain: row.domain,
  imageURL: row.imageURL,
  feedTitle: row.feedTitle,
  feedIconURL: row.feedIconURL
})

export interface ListArticlesOptions {
  domain?: Domain
  categoryId?: number
  unreadOnly?: boolean
  bookmarkedOnly?: boolean
  limit?: number
}

export function listArticles(opts: ListArticlesOptions = {}): Article[] {
  // Always exclude articles whose source is a ticker-owned virtual feed.
  // Those are reachable via `listArticlesForTicker`; letting them into the
  // main view would flood it with per-ticker syndication noise.
  const where: string[] = ['f.tickerId IS NULL']
  const params: Array<string | number> = []
  if (opts.domain) {
    where.push('a.domain = ?')
    params.push(opts.domain)
  }
  if (opts.categoryId !== undefined) {
    where.push('f.categoryId = ?')
    params.push(opts.categoryId)
  }
  if (opts.unreadOnly) where.push('a.isRead = 0')
  if (opts.bookmarkedOnly) where.push('a.isBookmarked = 1')
  const whereSql = `WHERE ${where.join(' AND ')}`
  const limit = Math.min(opts.limit ?? 200, 1000)

  const rows = getDb()
    .prepare<typeof params, ArticleRow>(
      `SELECT a.*, f.title AS feedTitle, f.iconURL AS feedIconURL
       FROM articles a JOIN feeds f ON f.id = a.feedId
       ${whereSql}
       ORDER BY a.publishedAt DESC, a.id DESC
       LIMIT ${limit}`
    )
    .all(...params)
  return rows.map(toArticle)
}

export function countBookmarked(): number {
  const row = getDb()
    .prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM articles WHERE isBookmarked = 1`)
    .get()
  return row?.n ?? 0
}

export function countUnreadByCategory(): Record<number, number> {
  const rows = getDb()
    .prepare<[], { categoryId: number; n: number }>(
      `SELECT f.categoryId AS categoryId, COUNT(*) AS n
       FROM articles a JOIN feeds f ON f.id = a.feedId
       WHERE a.isRead = 0 AND f.tickerId IS NULL
       GROUP BY f.categoryId`
    )
    .all()
  return Object.fromEntries(rows.map((r) => [r.categoryId, r.n]))
}

// Count articles published within the last 24h per category. Powers the
// "fresh today" pill — the raw unread count grows into the thousands over a
// 30-day history and stops being actionable.
export function countRecentByCategory(sinceMs: number): Record<number, number> {
  const rows = getDb()
    .prepare<[number], { categoryId: number; n: number }>(
      `SELECT f.categoryId AS categoryId, COUNT(*) AS n
       FROM articles a JOIN feeds f ON f.id = a.feedId
       WHERE a.publishedAt IS NOT NULL AND a.publishedAt >= ?
         AND f.tickerId IS NULL
       GROUP BY f.categoryId`
    )
    .all(sinceMs)
  return Object.fromEntries(rows.map((r) => [r.categoryId, r.n]))
}

export function markRead(id: number, read: boolean): void {
  getDb().prepare(`UPDATE articles SET isRead = ? WHERE id = ?`).run(read ? 1 : 0, id)
}

export function setBookmarked(id: number, bookmarked: boolean): void {
  getDb()
    .prepare(`UPDATE articles SET isBookmarked = ? WHERE id = ?`)
    .run(bookmarked ? 1 : 0, id)
}

export interface UpsertArticleInput {
  feedId: number
  guid: string | null
  title: string
  summary: string | null
  url: string
  publishedAt: number | null
  domain: Domain
  imageURL?: string | null
  urgencyScore?: number | null
  urgencyReason?: string | null
  scoredAt?: number | null
}

export interface InsertedArticle {
  id: number
  feedId: number
  title: string
  summary: string | null
  url: string
  urgencyScore: number | null
  urgencyReason: string | null
}

export function upsertArticles(rows: UpsertArticleInput[]): InsertedArticle[] {
  if (rows.length === 0) return []
  const db = getDb()
  const stmt = db.prepare<unknown[], InsertedArticle>(
    `INSERT OR IGNORE INTO articles
       (feedId, guid, title, summary, url, publishedAt, domain, imageURL, urgencyScore, urgencyReason, scoredAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id, feedId, title, summary, url, urgencyScore, urgencyReason`
  )
  const txn = db.transaction((batch: UpsertArticleInput[]) => {
    const out: InsertedArticle[] = []
    for (const r of batch) {
      const row = stmt.get(
        r.feedId,
        r.guid,
        r.title,
        r.summary,
        r.url,
        r.publishedAt,
        r.domain,
        r.imageURL ?? null,
        r.urgencyScore ?? null,
        r.urgencyReason ?? null,
        r.scoredAt ?? null
      )
      if (row) out.push(row)
    }
    return out
  })
  return txn(rows)
}

export function rescoreArticles(
  score: (input: { title: string; summary: string | null; domain: Domain }) => {
    score: number
    reason: string
  },
  opts: { onlyUnscored?: boolean } = {}
): number {
  const db = getDb()
  const where = opts.onlyUnscored ? `WHERE urgencyScore IS NULL` : ''
  const rows = db
    .prepare<[], { id: number; title: string; summary: string | null; domain: Domain }>(
      `SELECT id, title, summary, domain FROM articles ${where}`
    )
    .all()
  if (rows.length === 0) return 0
  const update = db.prepare(
    `UPDATE articles SET urgencyScore = ?, urgencyReason = ?, scoredAt = ? WHERE id = ?`
  )
  const now = Date.now()
  const txn = db.transaction(() => {
    let n = 0
    for (const r of rows) {
      const res = score({ title: r.title, summary: r.summary, domain: r.domain })
      update.run(res.score, res.reason, now, r.id)
      n++
    }
    return n
  })
  return txn()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Join against the article_ticker_matches table populated by the relevance
// classifier at ingest. `strong` filters to articles that mention the full
// company name (or a distinctive alias/ticker-formatted symbol); pass
// `includeWeak` to also surface bare-symbol matches.
export interface ListForTickerOptions {
  limit?: number
  sinceMs?: number
  includeWeak?: boolean
}

export function listArticlesForTicker(
  symbol: string,
  opts: ListForTickerOptions = {}
): Article[] {
  const limit = Math.min(opts.limit ?? 60, 500)
  const strengthClause = opts.includeWeak
    ? `m.strength IN ('strong', 'weak')`
    : `m.strength = 'strong'`
  const params: Array<string | number> = [symbol.toUpperCase()]
  let sinceClause = ''
  if (opts.sinceMs !== undefined) {
    sinceClause = `AND a.publishedAt IS NOT NULL AND a.publishedAt >= ?`
    params.push(opts.sinceMs)
  }
  const rows = getDb()
    .prepare<typeof params, ArticleRow>(
      `SELECT a.*, f.title AS feedTitle, f.iconURL AS feedIconURL
       FROM articles a
       JOIN feeds f ON f.id = a.feedId
       JOIN article_ticker_matches m ON m.articleId = a.id
       WHERE m.symbol = ? AND ${strengthClause} ${sinceClause}
       ORDER BY a.publishedAt DESC, a.id DESC
       LIMIT ${limit}`
    )
    .all(...params)
  return rows.map(toArticle)
}

export function listArticlesMatching(terms: string[], limit = 40): Article[] {
  const trimmed = Array.from(
    new Set(
      terms
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    )
  )
  if (trimmed.length === 0) return []

  // Short all-caps tickers (e.g., "ADI", "MU") are matched case-sensitively with
  // word boundaries to avoid collisions with common substrings like "padding"
  // or "radius". Longer terms / multi-word names match case-insensitively.
  const matchers = trimmed.map((term) => {
    const isShortTicker = term.length <= 4 && term === term.toUpperCase() && /^[A-Z0-9.]+$/.test(term)
    const flags = isShortTicker ? '' : 'i'
    return new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegex(term)}(?:[^A-Za-z0-9]|$)`, flags)
  })

  const clauses: string[] = []
  const params: string[] = []
  for (const term of trimmed) {
    clauses.push('(a.title LIKE ? OR a.summary LIKE ?)')
    const like = `%${term}%`
    params.push(like, like)
  }
  const whereSql = clauses.join(' OR ')
  const narrowLimit = Math.min(limit * 6, 800)
  const rows = getDb()
    .prepare<typeof params, ArticleRow>(
      `SELECT a.*, f.title AS feedTitle, f.iconURL AS feedIconURL
       FROM articles a JOIN feeds f ON f.id = a.feedId
       WHERE ${whereSql}
       ORDER BY a.publishedAt DESC, a.id DESC
       LIMIT ${narrowLimit}`
    )
    .all(...params)

  const out: Article[] = []
  for (const row of rows) {
    const haystack = `${row.title}\n${row.summary ?? ''}`
    if (matchers.some((re) => re.test(haystack))) {
      out.push(toArticle(row))
      if (out.length >= limit) break
    }
  }
  return out
}

// Build an FTS5 MATCH expression from untrusted user input. Stripping
// everything outside `[A-Za-z0-9]` sidesteps injection into the query DSL
// (unquoted punctuation like `"` or `*` is interpreted by FTS5). Each token
// gets a `*` suffix for prefix matching, so "inflat" hits "inflation".
function sanitizeFtsQuery(raw: string): string {
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.replace(/[^A-Za-z0-9]/g, ''))
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return ''
  return tokens.map((t) => `${t}*`).join(' ')
}

export function searchArticlesFts(
  query: string,
  limit = 20
): Article[] {
  const ftsQuery = sanitizeFtsQuery(query)
  if (!ftsQuery) return []
  const cap = Math.min(limit, 100)
  try {
    const rows = getDb()
      .prepare<[string, number], ArticleRow>(
        // Rank orders by FTS5's BM25 score; we blend with recency (half-life
        // ~14 days) so a great older match still surfaces but recency wins
        // ties. Pure BM25 returned 2018 articles for current-events queries.
        `SELECT a.*, f.title AS feedTitle, f.iconURL AS feedIconURL
         FROM articles_fts
         JOIN articles a ON a.id = articles_fts.rowid
         JOIN feeds f ON f.id = a.feedId
         WHERE articles_fts MATCH ?
         ORDER BY (articles_fts.rank * (1.0 + (? - COALESCE(a.publishedAt, 0)) / 1209600000.0)) ASC
         LIMIT ${cap}`
      )
      .all(ftsQuery, Date.now())
    return rows.map(toArticle)
  } catch {
    // Malformed query or FTS-specific syntax error — return empty rather
    // than crashing the handler. Sanitize should prevent this but defense
    // in depth.
    return []
  }
}

export function updateArticleScore(id: number, score: number, reason: string): void {
  getDb()
    .prepare(`UPDATE articles SET urgencyScore = ?, urgencyReason = ?, scoredAt = ? WHERE id = ?`)
    .run(score, reason, Date.now(), id)
}

export function purgeOlderThan(cutoffMs: number): number {
  const info = getDb()
    .prepare(
      `DELETE FROM articles WHERE isBookmarked = 0 AND COALESCE(publishedAt, 0) < ?`
    )
    .run(cutoffMs)
  return info.changes
}
