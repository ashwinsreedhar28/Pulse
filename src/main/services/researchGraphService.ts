// Unified research graph — the "universe view" the Phase 3A comments
// promised but never built.
//
// paper_value_chain_edges has been populated on every chain write since v52
// and read by nothing: getEdgesMentioningPaper had zero call sites, so the
// whole denormalized table was dead weight. It is exactly the right shape for
// this, though — every chain's edges in one place, indexed on both endpoints.
//
// The per-chain view answers "what is this paper built on". Unioning the
// chains answers questions no single chain can:
//   - which papers recur as foundations across many different chains (the
//     canon of whatever the user actually works on),
//   - which two focus papers turn out to be one hop apart,
//   - which papers bridge otherwise-disconnected reading.

import { getDb } from '../database/connection'
import { listResearchBookmarks } from '../database/researchBookmarks'
import { clusterLibrary } from './paperSimilarityService'

export interface ResearchGraphNode {
  paperId: string
  title: string | null
  year: number | null
  citationCount: number | null
  influentialCitationCount: number | null
  /** True when the paper is in the user's saved library. */
  bookmarked: boolean
  /** How many distinct chains this paper appears in. */
  chainCount: number
  /** Semantic cluster index, or null when no embedding is stored. */
  cluster: number | null
}

export interface ResearchGraphEdge {
  from: string
  to: string
  relationship: string
  /** Number of distinct chains asserting this edge — real corroboration. */
  support: number
}

export interface ResearchGraphPayload {
  nodes: ResearchGraphNode[]
  edges: ResearchGraphEdge[]
  /** Papers appearing in several chains — the recurring foundations. */
  hubs: Array<{ paperId: string; title: string | null; chainCount: number }>
}

// A paper cited by this many distinct chains is a recurring foundation
// rather than a one-off reference.
const HUB_MIN_CHAINS = 2

export function getResearchGraph(): ResearchGraphPayload {
  const db = getDb()

  // Collapse duplicate assertions of the same edge across chains into one
  // row, keeping the count. Unlike the company graph's source tags, these
  // ARE independent: each chain was generated from a different focus paper's
  // own reference list, so agreement is genuine corroboration.
  let edgeRows: Array<{
    fromPaperId: string
    toPaperId: string
    relationship: string
    support: number
  }> = []
  try {
    edgeRows = db
      .prepare<
        [],
        { fromPaperId: string; toPaperId: string; relationship: string; support: number }
      >(
        `SELECT fromPaperId, toPaperId, relationship,
                COUNT(DISTINCT sourceFocusPaperId) AS support
           FROM paper_value_chain_edges
          GROUP BY fromPaperId, toPaperId, relationship`
      )
      .all()
  } catch {
    // Pre-v52 database.
    return { nodes: [], edges: [], hubs: [] }
  }

  let chainCounts: Array<{ paperId: string; chainCount: number }> = []
  try {
    // A paper's chain count is the number of distinct chains it appears in on
    // either endpoint — the union, not the sum, so an edge pair doesn't
    // double-count.
    chainCounts = db
      .prepare<[], { paperId: string; chainCount: number }>(
        `SELECT paperId, COUNT(DISTINCT sourceFocusPaperId) AS chainCount FROM (
           SELECT fromPaperId AS paperId, sourceFocusPaperId FROM paper_value_chain_edges
           UNION
           SELECT toPaperId AS paperId, sourceFocusPaperId FROM paper_value_chain_edges
         ) GROUP BY paperId`
      )
      .all()
  } catch {
    chainCounts = []
  }
  const chainCountBy = new Map(chainCounts.map((r) => [r.paperId, r.chainCount]))

  // Titles only exist locally for bookmarked papers; chain endpoints are bare
  // ids. Rather than fan out to S2 for every node (hundreds of calls), the
  // graph renders unknown titles as the id and lets the detail panel hydrate
  // on demand.
  const bookmarks = listResearchBookmarks()
  const bookmarkById = new Map(bookmarks.map((b) => [b.paperId, b.paper]))

  const ids = new Set<string>()
  for (const e of edgeRows) {
    ids.add(e.fromPaperId)
    ids.add(e.toPaperId)
  }
  for (const b of bookmarks) ids.add(b.paperId)

  // Semantic clusters, where embeddings exist. Papers without one get null
  // rather than a bogus cluster.
  const clusterOf = new Map<string, number>()
  try {
    for (const c of clusterLibrary([...ids])) {
      for (const m of c.members) clusterOf.set(m, c.id)
    }
  } catch {
    // Embeddings not fetched yet — the graph still renders uncoloured.
  }

  const nodes: ResearchGraphNode[] = [...ids].map((paperId) => {
    const paper = bookmarkById.get(paperId)
    return {
      paperId,
      title: paper?.title ?? null,
      year: paper?.year ?? null,
      citationCount: paper?.citationCount ?? null,
      influentialCitationCount: paper?.influentialCitationCount ?? null,
      bookmarked: bookmarkById.has(paperId),
      chainCount: chainCountBy.get(paperId) ?? 0,
      cluster: clusterOf.get(paperId) ?? null
    }
  })

  const hubs = nodes
    .filter((n) => n.chainCount >= HUB_MIN_CHAINS)
    .sort((a, b) => b.chainCount - a.chainCount)
    .slice(0, 25)
    .map((n) => ({ paperId: n.paperId, title: n.title, chainCount: n.chainCount }))

  return {
    nodes,
    edges: edgeRows.map((e) => ({
      from: e.fromPaperId,
      to: e.toPaperId,
      relationship: e.relationship,
      support: e.support
    })),
    hubs
  }
}

// Co-citation: papers that recur together across chains without necessarily
// citing each other. One of the two classic citation-graph similarity
// metrics, and free here because the union table already exists.
export function findCoCited(
  paperId: string,
  limit = 15
): Array<{ paperId: string; shared: number }> {
  const id = paperId.trim()
  if (!id) return []
  try {
    return getDb()
      .prepare<[string, string, string, number], { paperId: string; shared: number }>(
        `SELECT other AS paperId, COUNT(DISTINCT sourceFocusPaperId) AS shared FROM (
           SELECT sourceFocusPaperId,
                  CASE WHEN fromPaperId = ? THEN toPaperId ELSE fromPaperId END AS other
             FROM paper_value_chain_edges
            WHERE fromPaperId = ? OR toPaperId = ?
         )
         WHERE other IS NOT NULL
         GROUP BY other
         ORDER BY shared DESC
         LIMIT ?`
      )
      .all(id, id, id, limit)
  } catch {
    return []
  }
}
