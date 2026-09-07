// SPECTER2 paper embeddings (migration v57).
//
// Vectors come from Semantic Scholar's batch endpoint
// (fields=embedding.specter_v2): 768 float32s per paper, free and anonymous.
// SPECTER2 is trained on the citation graph, so cosine distance between two
// of these approximates "would these papers cite each other" rather than
// "do they share keywords" — which is exactly the notion of similarity a
// research library wants, and something TF-IDF over abstracts cannot give.
//
// Stored as a raw little-endian float32 BLOB (3072 bytes). A JSON array of
// 768 floats is ~9 KB of text that would have to be parsed on every
// similarity pass; the BLOB is read straight into a Float32Array with no
// per-element work.

import { getDb } from './connection'

export const EMBEDDING_MODEL = 'specter_v2'
export const EMBEDDING_DIMS = 768

export interface PaperEmbedding {
  paperId: string
  vector: Float32Array
  fetchedAt: number
}

function toBlob(vector: number[] | Float32Array): Buffer {
  const f32 = vector instanceof Float32Array ? vector : Float32Array.from(vector)
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)
}

function fromBlob(buf: Buffer): Float32Array {
  // Copy rather than aliasing better-sqlite3's buffer: the underlying memory
  // is not guaranteed to outlive the statement, and a stale view would read
  // as silent numeric garbage rather than an error.
  const copy = Buffer.from(buf)
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4)
}

export function upsertEmbedding(
  paperId: string,
  vector: number[] | Float32Array,
  model = EMBEDDING_MODEL
): void {
  const id = paperId.trim()
  if (!id || vector.length === 0) return
  getDb()
    .prepare(
      `INSERT INTO paper_embeddings (paperId, model, dims, vector, fetchedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(paperId) DO UPDATE SET
         model = excluded.model,
         dims = excluded.dims,
         vector = excluded.vector,
         fetchedAt = excluded.fetchedAt`
    )
    .run(id, model, vector.length, toBlob(vector), Date.now())
}

export function upsertEmbeddings(
  rows: Array<{ paperId: string; vector: number[] | Float32Array; model?: string }>
): number {
  if (rows.length === 0) return 0
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO paper_embeddings (paperId, model, dims, vector, fetchedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(paperId) DO UPDATE SET
       model = excluded.model,
       dims = excluded.dims,
       vector = excluded.vector,
       fetchedAt = excluded.fetchedAt`
  )
  const now = Date.now()
  const txn = db.transaction((batch: typeof rows) => {
    let n = 0
    for (const r of batch) {
      const id = r.paperId.trim()
      if (!id || r.vector.length === 0) continue
      stmt.run(id, r.model ?? EMBEDDING_MODEL, r.vector.length, toBlob(r.vector), now)
      n++
    }
    return n
  })
  return txn(rows)
}

export function getEmbedding(paperId: string): PaperEmbedding | null {
  const row = getDb()
    .prepare<[string], { paperId: string; vector: Buffer; fetchedAt: number }>(
      `SELECT paperId, vector, fetchedAt FROM paper_embeddings WHERE paperId = ?`
    )
    .get(paperId.trim())
  if (!row) return null
  return { paperId: row.paperId, vector: fromBlob(row.vector), fetchedAt: row.fetchedAt }
}

export function listEmbeddings(paperIds?: string[]): PaperEmbedding[] {
  const db = getDb()
  const rows =
    paperIds && paperIds.length > 0
      ? db
          .prepare<string[], { paperId: string; vector: Buffer; fetchedAt: number }>(
            `SELECT paperId, vector, fetchedAt FROM paper_embeddings
              WHERE paperId IN (${paperIds.map(() => '?').join(',')})`
          )
          .all(...paperIds)
      : db
          .prepare<[], { paperId: string; vector: Buffer; fetchedAt: number }>(
            `SELECT paperId, vector, fetchedAt FROM paper_embeddings`
          )
          .all()
  return rows.map((r) => ({
    paperId: r.paperId,
    vector: fromBlob(r.vector),
    fetchedAt: r.fetchedAt
  }))
}

export function listEmbeddedIds(): Set<string> {
  const rows = getDb()
    .prepare<[], { paperId: string }>(`SELECT paperId FROM paper_embeddings`)
    .all()
  return new Set(rows.map((r) => r.paperId))
}

export function countEmbeddings(): number {
  const row = getDb()
    .prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM paper_embeddings`)
    .get()
  return row?.n ?? 0
}

// SPECTER2 vectors are not unit-length, so this normalizes rather than taking
// a bare dot product.
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}
