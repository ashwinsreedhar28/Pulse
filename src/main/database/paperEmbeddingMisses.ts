// Papers Semantic Scholar has no SPECTER2 vector for.
//
// S2 returns null for ids it cannot resolve and omits `embedding` for papers
// it has not embedded (very new or very obscure). Those ids used to be
// silently dropped, so the backfill re-requested the identical set on every
// tick and coverage never advanced past them. Recording the miss is what lets
// the cursor move.
//
// Misses are not permanent — S2 embeds papers later — so they carry a
// timestamp and an attempt count rather than being a tombstone.

import { getDb } from './connection'

/**
 * How long a miss suppresses a retry. Long enough that the backfill makes real
 * progress through the corpus, short enough that a paper embedded after
 * publication is picked up within a reasonable window.
 */
export const MISS_RETRY_MS = 14 * 24 * 60 * 60 * 1000

export function recordEmbeddingMisses(paperIds: string[]): void {
  const ids = [...new Set(paperIds.map((s) => s.trim()).filter(Boolean))]
  if (ids.length === 0) return
  const db = getDb()
  const stmt = db.prepare<[string, number]>(
    `INSERT INTO paper_embedding_misses (paperId, attempts, lastAttemptAt)
     VALUES (?, 1, ?)
     ON CONFLICT(paperId) DO UPDATE SET
       attempts = attempts + 1,
       lastAttemptAt = excluded.lastAttemptAt`
  )
  const now = Date.now()
  const tx = db.transaction(() => {
    for (const id of ids) stmt.run(id, now)
  })
  tx()
}

/** Paper ids whose miss is still inside the retry window. */
export function listSuppressedMissIds(now = Date.now()): Set<string> {
  try {
    const rows = getDb()
      .prepare<[number], { paperId: string }>(
        `SELECT paperId FROM paper_embedding_misses WHERE lastAttemptAt > ?`
      )
      .all(now - MISS_RETRY_MS)
    return new Set(rows.map((r) => r.paperId))
  } catch {
    // Pre-v62 database — no suppression, which is the old behaviour.
    return new Set()
  }
}

export function clearEmbeddingMiss(paperId: string): void {
  try {
    getDb().prepare<[string]>(`DELETE FROM paper_embedding_misses WHERE paperId = ?`).run(paperId)
  } catch {
    // Table not present yet; nothing to clear.
  }
}

export function countEmbeddingMisses(): number {
  try {
    const row = getDb()
      .prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM paper_embedding_misses`)
      .get()
    return row?.n ?? 0
  } catch {
    return 0
  }
}
