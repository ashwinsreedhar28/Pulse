import { getDb } from './connection'

const MAX_CHATS = 5

export interface HyperChatMeta {
  id: number
  title: string
  createdAt: number
  updatedAt: number
}

export interface HyperChat extends HyperChatMeta {
  turns: unknown[]
}

interface HyperChatRow {
  id: number
  title: string
  turns: string
  createdAt: number
  updatedAt: number
}

function rowToChat(row: HyperChatRow): HyperChat {
  let turns: unknown[] = []
  try {
    const parsed = JSON.parse(row.turns)
    if (Array.isArray(parsed)) turns = parsed
  } catch {
    turns = []
  }
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    turns
  }
}

export function listHyperChats(): HyperChatMeta[] {
  return getDb()
    .prepare<[number], HyperChatMeta>(
      `SELECT id, title, createdAt, updatedAt
       FROM hyperintelligence_chats
       ORDER BY updatedAt DESC
       LIMIT ?`
    )
    .all(MAX_CHATS) as HyperChatMeta[]
}

export function getHyperChat(id: number): HyperChat | null {
  const row = getDb()
    .prepare<[number], HyperChatRow>(
      `SELECT id, title, turns, createdAt, updatedAt
       FROM hyperintelligence_chats WHERE id = ?`
    )
    .get(id)
  return row ? rowToChat(row) : null
}

// Trim down to the most recent MAX_CHATS. Called after each save.
function pruneOldChats(): void {
  getDb()
    .prepare(
      `DELETE FROM hyperintelligence_chats
       WHERE id NOT IN (
         SELECT id FROM hyperintelligence_chats
         ORDER BY updatedAt DESC
         LIMIT ?
       )`
    )
    .run(MAX_CHATS)
}

export interface SaveHyperChatInput {
  id: number | null
  title: string
  turns: unknown[]
}

// Upsert a chat. If `id` is null, insert a new row; otherwise update existing.
// Returns the persisted id so the renderer can continue updating the same row
// as the user asks follow-up questions.
export function saveHyperChat(input: SaveHyperChatInput): number {
  const now = Date.now()
  const turnsJson = JSON.stringify(input.turns)
  const title = input.title.trim().slice(0, 120) || 'Untitled'
  if (input.id != null) {
    const res = getDb()
      .prepare(
        `UPDATE hyperintelligence_chats
         SET title = ?, turns = ?, updatedAt = ?
         WHERE id = ?`
      )
      .run(title, turnsJson, now, input.id)
    if (res.changes > 0) {
      pruneOldChats()
      return input.id
    }
    // Fall through to insert if the target row was pruned between saves.
  }
  const info = getDb()
    .prepare(
      `INSERT INTO hyperintelligence_chats (title, turns, createdAt, updatedAt)
       VALUES (?, ?, ?, ?)`
    )
    .run(title, turnsJson, now, now)
  pruneOldChats()
  return Number(info.lastInsertRowid)
}

export function deleteHyperChat(id: number): void {
  getDb().prepare(`DELETE FROM hyperintelligence_chats WHERE id = ?`).run(id)
}
