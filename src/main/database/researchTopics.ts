// Saved research topics — keyword queries the user wants to track on
// the Research tab. The scheduler regenerates the brief weekly so
// returning users see fresh synthesis without re-typing the search.
//
// Briefs themselves live in research_briefs, joined by topicId.

import { getDb } from './connection'

export interface ResearchTopicRow {
  id: number
  query: string
  label: string
  createdAt: number
  lastBriefAt: number | null
}

export function listResearchTopics(): ResearchTopicRow[] {
  return getDb()
    .prepare<[], ResearchTopicRow>(
      `SELECT id, query, label, createdAt, lastBriefAt
         FROM research_topics
        ORDER BY createdAt DESC`
    )
    .all()
}

export function createResearchTopic(input: {
  query: string
  label?: string
}): ResearchTopicRow {
  const query = input.query.trim()
  const label = (input.label ?? input.query).trim() || query
  const createdAt = Date.now()
  const id = getDb()
    .prepare<[string, string, number]>(
      `INSERT INTO research_topics (query, label, createdAt) VALUES (?, ?, ?)`
    )
    .run(query, label, createdAt).lastInsertRowid as number
  return { id, query, label, createdAt, lastBriefAt: null }
}

export function deleteResearchTopic(id: number): void {
  getDb().prepare(`DELETE FROM research_topics WHERE id = ?`).run(id)
}

export function setLastBriefAt(id: number, ts: number): void {
  getDb()
    .prepare(`UPDATE research_topics SET lastBriefAt = ? WHERE id = ?`)
    .run(ts, id)
}

export function getResearchTopic(id: number): ResearchTopicRow | null {
  const row = getDb()
    .prepare<[number], ResearchTopicRow>(
      `SELECT id, query, label, createdAt, lastBriefAt
         FROM research_topics
        WHERE id = ?
        LIMIT 1`
    )
    .get(id)
  return row ?? null
}
