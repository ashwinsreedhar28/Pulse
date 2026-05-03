// Auto-recorded recent searches for the Research tab. Lighter weight
// than saved topics — no scheduler, no brief caching, just "I searched
// for this recently, let me jump back in." Capped at 50 entries on
// write to keep the table bounded.

import { getDb } from './connection'

export interface RecentSearchRow {
  query: string
  lastSearchedAt: number
  searchCount: number
}

const MAX_RECENT_SEARCHES = 50

export function listRecentSearches(limit = 10): RecentSearchRow[] {
  return getDb()
    .prepare<[number], RecentSearchRow>(
      `SELECT query, lastSearchedAt, searchCount
         FROM research_recent_searches
        ORDER BY lastSearchedAt DESC
        LIMIT ?`
    )
    .all(limit)
}

export function recordRecentSearch(rawQuery: string): void {
  const query = rawQuery.trim()
  if (!query) return
  const now = Date.now()
  const db = getDb()
  // Upsert with count increment. SQLite's ON CONFLICT lets us bump the
  // counter atomically; new rows start at searchCount=1.
  db.prepare(
    `INSERT INTO research_recent_searches (query, lastSearchedAt, searchCount)
     VALUES (?, ?, 1)
     ON CONFLICT(query) DO UPDATE SET
       lastSearchedAt = excluded.lastSearchedAt,
       searchCount = searchCount + 1`
  ).run(query, now)
  // Prune anything beyond the cap so the table doesn't grow forever.
  // The DELETE uses a subquery that selects the (cap+1)th row by
  // lastSearchedAt and drops every row older than that timestamp.
  // Cheap with the index we just added; runs once per recordRecent.
  db.prepare(
    `DELETE FROM research_recent_searches
       WHERE lastSearchedAt < (
         SELECT lastSearchedAt FROM research_recent_searches
          ORDER BY lastSearchedAt DESC
          LIMIT 1 OFFSET ?
       )`
  ).run(MAX_RECENT_SEARCHES)
}

export function clearRecentSearch(query: string): void {
  getDb()
    .prepare(`DELETE FROM research_recent_searches WHERE query = ?`)
    .run(query)
}

export function clearAllRecentSearches(): void {
  getDb().prepare(`DELETE FROM research_recent_searches`).run()
}
