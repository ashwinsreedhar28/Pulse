import { getDb } from './connection'

export interface Feed {
  id: number
  title: string
  url: string
  categoryId: number
  isEnabled: boolean
  lastFetchedAt: number | null
  iconURL: string | null
}

interface FeedRow {
  id: number
  title: string
  url: string
  categoryId: number
  isEnabled: number
  lastFetchedAt: number | null
  iconURL: string | null
}

const toFeed = (row: FeedRow): Feed => ({
  id: row.id,
  title: row.title,
  url: row.url,
  categoryId: row.categoryId,
  isEnabled: row.isEnabled === 1,
  lastFetchedAt: row.lastFetchedAt,
  iconURL: row.iconURL
})

export function listFeeds(): Feed[] {
  return getDb()
    .prepare<[], FeedRow>(`SELECT * FROM feeds ORDER BY categoryId, title`)
    .all()
    .map(toFeed)
}

export interface PollableFeed {
  id: number
  title: string
  url: string
  categoryId: number
  domain: 'finance' | 'general'
  etag: string | null
  lastModified: string | null
  notificationsEnabled: boolean
}

interface PollableFeedRow {
  id: number
  title: string
  url: string
  categoryId: number
  domain: 'finance' | 'general'
  etag: string | null
  lastModified: string | null
  notificationsEnabled: number
}

export function listEnabledFeedsForPolling(): PollableFeed[] {
  return getDb()
    .prepare<[], PollableFeedRow>(
      `SELECT f.id, f.title, f.url, f.categoryId, c.domain, f.etag, f.lastModified,
              c.notificationsEnabled AS notificationsEnabled
       FROM feeds f JOIN categories c ON c.id = f.categoryId
       WHERE f.isEnabled = 1`
    )
    .all()
    .map((r) => ({ ...r, notificationsEnabled: r.notificationsEnabled === 1 }))
}

export function listFeedsByCategory(categoryId: number): Feed[] {
  return getDb()
    .prepare<[number], FeedRow>(`SELECT * FROM feeds WHERE categoryId = ? ORDER BY title`)
    .all(categoryId)
    .map(toFeed)
}

export function countFeedsByCategory(): Record<number, number> {
  const rows = getDb()
    .prepare<[], { categoryId: number; n: number }>(
      `SELECT categoryId, COUNT(*) AS n FROM feeds GROUP BY categoryId`
    )
    .all()
  return Object.fromEntries(rows.map((r) => [r.categoryId, r.n]))
}

export interface CreateFeedInput {
  title: string
  url: string
  categoryId: number
  iconURL?: string | null
}

export function createFeed(input: CreateFeedInput): Feed {
  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO feeds (title, url, categoryId, iconURL, isEnabled) VALUES (?, ?, ?, ?, 1)`
    )
    .run(input.title, input.url, input.categoryId, input.iconURL ?? null)
  return getFeed(info.lastInsertRowid as number)!
}

export function getFeed(id: number): Feed | null {
  const row = getDb().prepare<[number], FeedRow>(`SELECT * FROM feeds WHERE id = ?`).get(id)
  return row ? toFeed(row) : null
}

export function deleteFeed(id: number): void {
  getDb().prepare(`DELETE FROM feeds WHERE id = ?`).run(id)
}

export function setFeedEnabled(id: number, enabled: boolean): void {
  getDb().prepare(`UPDATE feeds SET isEnabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id)
}

export function renameFeed(id: number, title: string): void {
  getDb().prepare(`UPDATE feeds SET title = ? WHERE id = ?`).run(title, id)
}

export function setFeedCategory(id: number, categoryId: number): void {
  getDb().prepare(`UPDATE feeds SET categoryId = ? WHERE id = ?`).run(categoryId, id)
}

export function updateFeedFetchMeta(
  id: number,
  fetchedAt: number,
  etag?: string | null,
  lastModified?: string | null
): void {
  getDb()
    .prepare(
      `UPDATE feeds SET lastFetchedAt = ?, etag = ?, lastModified = ? WHERE id = ?`
    )
    .run(fetchedAt, etag ?? null, lastModified ?? null, id)
}
