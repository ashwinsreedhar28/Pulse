// Semantic layer over the research library.
//
// Until now the only notion of "related" in Pulse's research side was the
// citation graph: two papers were connected if one cited the other, or if
// they shared a foundational reference. That misses the case a library most
// wants — two papers doing the same thing that have never cited each other,
// often because they were published concurrently.
//
// SPECTER2 embeddings close that gap. They come free from Semantic Scholar's
// batch endpoint, are trained on the citation graph rather than on raw text,
// and so encode "would these cite each other" instead of "do these share
// vocabulary". No API key, no local model, nothing to install — which
// matters given aiProvider is Claude here and Ollama isn't running.

import {
  EMBEDDING_DIMS,
  cosineSimilarity,
  getEmbedding,
  listEmbeddedIds,
  listEmbeddings,
  upsertEmbeddings
} from '../database/paperEmbeddings'
import { getBookmarkedPaperIds } from '../database/researchBookmarks'
import { getPreferences } from '../database/preferences'
import { s2Schedule } from './s2RateLimit'

const S2_BASE = 'https://api.semanticscholar.org/graph/v1'
const UA = 'Pulse/0.1 (research; ashwin.sreedhar2003@gmail.com)'
const FETCH_TIMEOUT_MS = 25_000
// S2's documented ceiling for /paper/batch is 500 ids, but embeddings make
// each row ~9 KB of JSON, so 500 would be a ~4.5 MB response. 100 keeps
// individual requests modest without meaningfully more round-trips.
const BATCH_SIZE = 100

function s2ApiKey(): string | null {
  try {
    const k = getPreferences().semanticScholarApiKey?.trim()
    return k && k.length > 0 ? k : null
  } catch {
    return null
  }
}

interface S2EmbeddingRow {
  paperId?: string
  embedding?: { model?: string; vector?: number[] } | null
}

// Fetches and stores embeddings for any of `paperIds` we don't already have.
// Returns how many new vectors were persisted.
export async function ensureEmbeddings(paperIds: string[]): Promise<number> {
  const wanted = [...new Set(paperIds.map((s) => s.trim()).filter(Boolean))]
  if (wanted.length === 0) return 0

  // Embeddings are immutable for a given paper, so anything already stored is
  // never refetched — no TTL, unlike the metadata caches.
  const have = listEmbeddedIds()
  const missing = wanted.filter((id) => !have.has(id))
  if (missing.length === 0) return 0

  let stored = 0
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE)
    let rows: Array<S2EmbeddingRow | null>
    try {
      rows = await s2Schedule(async () => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
        try {
          const headers: Record<string, string> = {
            'User-Agent': UA,
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
          const key = s2ApiKey()
          if (key) headers['x-api-key'] = key
          const res = await fetch(
            `${S2_BASE}/paper/batch?fields=paperId,embedding.specter_v2`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({ ids: chunk }),
              signal: controller.signal
            }
          )
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return (await res.json()) as Array<S2EmbeddingRow | null>
        } finally {
          clearTimeout(timer)
        }
      })
    } catch (err) {
      // One failed chunk shouldn't abandon the rest — similarity degrades
      // gracefully with partial coverage.
      console.warn(
        '[similarity] embedding batch failed:',
        err instanceof Error ? err.message : err
      )
      continue
    }

    const batch: Array<{ paperId: string; vector: number[] }> = []
    for (const row of rows ?? []) {
      const vec = row?.embedding?.vector
      const id = row?.paperId
      // S2 returns null for ids it can't resolve, and omits embeddings for
      // papers it hasn't embedded (very new or very obscure ones).
      if (!id || !Array.isArray(vec) || vec.length !== EMBEDDING_DIMS) continue
      batch.push({ paperId: id, vector: vec })
    }
    stored += upsertEmbeddings(batch)
  }
  return stored
}

export interface SimilarPaper {
  paperId: string
  score: number
}

// Nearest neighbours to a single paper. Linear scan over the stored set:
// at library scale (hundreds to low thousands) a 768-dim dot product per
// candidate is sub-millisecond in total, and an ANN index would be pure
// complexity for no measurable gain.
export function findSimilar(
  paperId: string,
  limit = 10,
  opts: { restrictTo?: string[] } = {}
): SimilarPaper[] {
  const target = getEmbedding(paperId)
  if (!target) return []
  const pool = listEmbeddings(opts.restrictTo)
  const out: SimilarPaper[] = []
  for (const cand of pool) {
    if (cand.paperId === paperId) continue
    out.push({ paperId: cand.paperId, score: cosineSimilarity(target.vector, cand.vector) })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

// Papers closest to the centroid of the user's saved library.
//
// The centroid of a set of SPECTER2 vectors is a reasonable stand-in for
// "the region of the literature this person works in", so ranking unsaved
// papers against it gives a recommendation that needs no query at all —
// something keyword search fundamentally cannot do.
export function recommendFromLibrary(
  candidateIds: string[],
  limit = 10
): SimilarPaper[] {
  const saved = [...getBookmarkedPaperIds()]
  if (saved.length === 0 || candidateIds.length === 0) return []
  const savedVecs = listEmbeddings(saved)
  if (savedVecs.length === 0) return []

  const centroid = new Float32Array(EMBEDDING_DIMS)
  for (const v of savedVecs) {
    const n = Math.min(EMBEDDING_DIMS, v.vector.length)
    for (let i = 0; i < n; i++) centroid[i] += v.vector[i]
  }
  for (let i = 0; i < EMBEDDING_DIMS; i++) centroid[i] /= savedVecs.length

  const savedSet = new Set(saved)
  const out: SimilarPaper[] = []
  for (const cand of listEmbeddings(candidateIds)) {
    if (savedSet.has(cand.paperId)) continue
    out.push({ paperId: cand.paperId, score: cosineSimilarity(centroid, cand.vector) })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

// Greedy agglomerative clustering over the library, for colouring the
// research map by topic without requiring the user to tag anything.
//
// Deliberately simple: seed a cluster from the first unassigned paper, absorb
// everything within `threshold` cosine of it, repeat. Not k-means — that
// needs k chosen up front, and the natural question here is "which papers
// group together", not "split my library into exactly k parts".
export function clusterLibrary(
  paperIds: string[],
  threshold = 0.72
): Array<{ id: number; members: string[] }> {
  const vecs = listEmbeddings(paperIds)
  const unassigned = new Set(vecs.map((v) => v.paperId))
  const byId = new Map(vecs.map((v) => [v.paperId, v.vector]))
  const clusters: Array<{ id: number; members: string[] }> = []
  let next = 0

  for (const v of vecs) {
    if (!unassigned.has(v.paperId)) continue
    unassigned.delete(v.paperId)
    const members = [v.paperId]
    for (const otherId of [...unassigned]) {
      const other = byId.get(otherId)
      if (!other) continue
      if (cosineSimilarity(v.vector, other) >= threshold) {
        members.push(otherId)
        unassigned.delete(otherId)
      }
    }
    clusters.push({ id: next++, members })
  }
  return clusters
}
