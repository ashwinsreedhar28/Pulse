// Per-paper cache for the "foundational" subset of references — the
// ~3-7 papers S2's classifier flags as isInfluential AND tags with an
// intent in {background, methodology, extension}. Approximates
// "explicitly named in the intro/related-works as the basis for this
// work." Cached locally so:
//   1. Auto-fetch on bookmark populates the cache before the user
//      opens detail — "Built on" renders with no fetch latency.
//   2. The inverse direction ("which of my bookmarks list paper X as
//      foundational") walks every bookmark's cache; pulling from a
//      remote S2 endpoint per bookmark per render would be untenable.
//
// JSON stores the full ResearchPaper[] so render is a parse + map.

import { getDb } from './connection'
import type { ResearchPaper } from '../../preload'

export interface FoundationalCacheRow {
  paperId: string
  foundational: ResearchPaper[]
  fetchedAt: number
}

interface RawRow {
  paperId: string
  foundationalJson: string
  fetchedAt: number
}

function hydrate(row: RawRow): FoundationalCacheRow | null {
  try {
    const arr = JSON.parse(row.foundationalJson) as ResearchPaper[]
    if (!Array.isArray(arr)) return null
    return { paperId: row.paperId, foundational: arr, fetchedAt: row.fetchedAt }
  } catch {
    return null
  }
}

export function getFoundationalCache(paperId: string): FoundationalCacheRow | null {
  const row = getDb()
    .prepare<[string], RawRow>(
      `SELECT paperId, foundationalJson, fetchedAt
         FROM research_paper_foundational
        WHERE paperId = ?
        LIMIT 1`
    )
    .get(paperId)
  return row ? hydrate(row) : null
}

export function upsertFoundationalCache(
  paperId: string,
  foundational: ResearchPaper[]
): FoundationalCacheRow {
  const fetchedAt = Date.now()
  const json = JSON.stringify(foundational)
  getDb()
    .prepare(
      `INSERT INTO research_paper_foundational (paperId, foundationalJson, fetchedAt)
       VALUES (?, ?, ?)
       ON CONFLICT(paperId) DO UPDATE SET
         foundationalJson = excluded.foundationalJson,
         fetchedAt = excluded.fetchedAt`
    )
    .run(paperId, json, fetchedAt)
  return { paperId, foundational, fetchedAt }
}

// All cached entries — used to compute the inverse direction without
// re-querying per bookmark. Returns the hydrated array; caller filters.
export function listAllFoundationalCaches(): FoundationalCacheRow[] {
  const rows = getDb()
    .prepare<[], RawRow>(
      `SELECT paperId, foundationalJson, fetchedAt
         FROM research_paper_foundational`
    )
    .all()
  const out: FoundationalCacheRow[] = []
  for (const r of rows) {
    const h = hydrate(r)
    if (h) out.push(h)
  }
  return out
}
