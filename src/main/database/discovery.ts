import { getDb } from './connection'

export interface DiscoverySuggestion {
  id: number
  ticker: string
  companyName: string
  reason: string
  sourceArticleIds: number[]
  createdAt: number
  isViewed: boolean
  mode: string
}

interface SuggestionRow {
  id: number
  ticker: string
  companyName: string
  reason: string
  sourceArticleIds: string
  createdAt: number
  isViewed: number
  mode: string
}

const toSuggestion = (row: SuggestionRow): DiscoverySuggestion => ({
  id: row.id,
  ticker: row.ticker,
  companyName: row.companyName,
  reason: row.reason,
  sourceArticleIds: JSON.parse(row.sourceArticleIds) as number[],
  createdAt: row.createdAt,
  isViewed: row.isViewed === 1,
  mode: row.mode
})

export interface CreateSuggestionInput {
  ticker: string
  companyName: string
  reason: string
  sourceArticleIds: number[]
  mode: string
}

export function createSuggestion(input: CreateSuggestionInput): DiscoverySuggestion {
  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO discovery_suggestions (ticker, companyName, reason, sourceArticleIds, createdAt, mode)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.ticker,
      input.companyName,
      input.reason,
      JSON.stringify(input.sourceArticleIds),
      Date.now(),
      input.mode
    )
  const row = db
    .prepare<[number], SuggestionRow>(`SELECT * FROM discovery_suggestions WHERE id = ?`)
    .get(info.lastInsertRowid as number)!
  return toSuggestion(row)
}

export function listSuggestions(limit = 50): DiscoverySuggestion[] {
  return getDb()
    .prepare<[number], SuggestionRow>(
      `SELECT * FROM discovery_suggestions ORDER BY createdAt DESC LIMIT ?`
    )
    .all(limit)
    .map(toSuggestion)
}

export function countUnviewed(): number {
  const row = getDb()
    .prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM discovery_suggestions WHERE isViewed = 0`)
    .get()
  return row?.n ?? 0
}

export function markViewed(id: number): void {
  getDb().prepare(`UPDATE discovery_suggestions SET isViewed = 1 WHERE id = ?`).run(id)
}

export function markAllViewed(): void {
  getDb().prepare(`UPDATE discovery_suggestions SET isViewed = 1 WHERE isViewed = 0`).run()
}

export function deleteSuggestion(id: number): void {
  getDb().prepare(`DELETE FROM discovery_suggestions WHERE id = ?`).run(id)
}

export function clearOlderThan(cutoffMs: number): number {
  const info = getDb()
    .prepare(`DELETE FROM discovery_suggestions WHERE createdAt < ?`)
    .run(cutoffMs)
  return info.changes
}
