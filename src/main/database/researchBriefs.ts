// Cached research-brief payloads keyed by topicId. We persist the
// JSON payload so opening a saved topic renders immediately from the
// last weekly refresh — user doesn't have to wait for Semantic Scholar
// + Claude on every tab open.
//
// Cache is upserted by researchScheduler. Brief shape mirrors
// ResearchBriefPayload in the preload exports.

import { getDb } from './connection'
import type { ResearchBriefPayload } from '../../preload'

export interface ResearchBriefRow {
  topicId: number
  generatedAt: number
  payload: ResearchBriefPayload
  paperIds: string[]
}

interface RawBriefRow {
  topicId: number
  generatedAt: number
  payloadJson: string
  paperIdsJson: string
}

function hydrate(row: RawBriefRow): ResearchBriefRow | null {
  let payload: ResearchBriefPayload
  let paperIds: string[]
  try {
    payload = JSON.parse(row.payloadJson) as ResearchBriefPayload
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(row.paperIdsJson) as unknown
    paperIds = Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    paperIds = []
  }
  return { topicId: row.topicId, generatedAt: row.generatedAt, payload, paperIds }
}

export function getResearchBrief(topicId: number): ResearchBriefRow | null {
  const row = getDb()
    .prepare<[number], RawBriefRow>(
      `SELECT topicId, generatedAt, payloadJson, paperIdsJson
         FROM research_briefs
        WHERE topicId = ?
        LIMIT 1`
    )
    .get(topicId)
  return row ? hydrate(row) : null
}

export function upsertResearchBrief(input: ResearchBriefRow): void {
  const payloadJson = JSON.stringify(input.payload)
  const paperIdsJson = JSON.stringify(input.paperIds)
  getDb()
    .prepare<[number, number, string, string]>(
      `INSERT INTO research_briefs (topicId, generatedAt, payloadJson, paperIdsJson)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(topicId) DO UPDATE SET
         generatedAt = excluded.generatedAt,
         payloadJson = excluded.payloadJson,
         paperIdsJson = excluded.paperIdsJson`
    )
    .run(input.topicId, input.generatedAt, payloadJson, paperIdsJson)
}

export function deleteResearchBrief(topicId: number): void {
  getDb().prepare(`DELETE FROM research_briefs WHERE topicId = ?`).run(topicId)
}
