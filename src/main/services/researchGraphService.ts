// Assembles the paper graph for the renderer, in one round-trip.
//
// Mirrors marketGraphService on the finance side: nodes, edges, clustering
// and the derived structure the UI needs, all in a single IPC call so the
// canvas has everything before first paint.
//
// Two sources are unioned:
//   - research_graph_nodes / research_graph_edges (v58) — the growing
//     citation graph, fed by researchGraphExpander
//   - paper_value_chain_edges — edges from generated paper chains, which
//     predate the graph tables and would otherwise be stranded
//
// The second is why this unions rather than reading one table: those chain
// edges are work already paid for (S2 calls plus Haiku enrichment), and
// dropping them would lose typed relationships (extends / contrasts /
// refutes) that a citation walk cannot produce.

import { getDb } from '../database/connection'
import { getBookmarkedPaperIds } from '../database/researchBookmarks'
import {
  edgesFrom,
  edgesTo,
  edgesWithin,
  getGraphNode,
  getGraphNodesByIds,
  globalDegreesFor,
  listGraphEdges,
  listGraphNodes,
  graphStats
} from '../database/researchGraph'
import { clusterLibrary } from './paperSimilarityService'

export interface ResearchGraphNode {
  paperId: string
  title: string
  year: number | null
  authors: string[]
  venue: string | null
  citationCount: number
  influentialCitationCount: number
  fields: string[]
  /** Primary field of study, used for colouring. */
  field: string | null
  abstract: string | null
  url: string | null
  pdfUrl: string | null
  bookmarked: boolean
  /** Hops from the nearest seed; 0 = a paper the user chose. */
  depth: number
  /** True once this paper's own neighbours have been fetched. */
  expanded: boolean
  /** Semantic cluster index, or null when no embedding is stored. */
  cluster: number | null
  degree: number
}

export interface ResearchGraphEdge {
  from: string
  to: string
  relationship: string
  intent: string | null
}

export interface ResearchGraphPayload {
  nodes: ResearchGraphNode[]
  edges: ResearchGraphEdge[]
  fields: Array<{ name: string; count: number }>
  hubs: Array<{ paperId: string; title: string; degree: number }>
  stats: { nodes: number; edges: number; expanded: number }
}

/**
 * @param withClusters Compute semantic clusters for `node.cluster`.
 *
 * Off by default, and that default matters. Clustering is greedy
 * agglomerative over 768-dim vectors — O(n²·d), roughly 3.9 billion float ops
 * at current corpus size, on top of a `SELECT ... IN (?,…)` with one bind
 * parameter per node. It used to run unconditionally, and because
 * getPaperNeighborhood() calls this function in full, every graph open, every
 * hop change and every "centre on this paper" paid that cost — to populate a
 * field no renderer reads. Ask for it explicitly when something actually
 * consumes it (the corpus map will).
 */
export function getResearchGraph(
  { withClusters = false }: { withClusters?: boolean } = {}
): ResearchGraphPayload {
  const nodeRows = listGraphNodes()
  const edges: ResearchGraphEdge[] = listGraphEdges().map((e) => ({
    from: e.fromPaperId,
    to: e.toPaperId,
    relationship: e.relationship,
    intent: e.intent
  }))

  // Fold in chain edges, but only where both endpoints already exist as
  // nodes. Chain graphs reference papers by id alone, so admitting unknown
  // endpoints would create titleless ghost nodes.
  const known = new Set(nodeRows.map((n) => n.paperId))
  try {
    const chainEdges = getDb()
      .prepare<[], { fromPaperId: string; toPaperId: string; relationship: string }>(
        `SELECT DISTINCT fromPaperId, toPaperId, relationship FROM paper_value_chain_edges`
      )
      .all()
    const seen = new Set(edges.map((e) => e.from + '>' + e.to))
    for (const c of chainEdges) {
      if (!known.has(c.fromPaperId) || !known.has(c.toPaperId)) continue
      const key = c.fromPaperId + '>' + c.toPaperId
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({
        from: c.fromPaperId,
        to: c.toPaperId,
        relationship: c.relationship,
        intent: null
      })
    }
  } catch {
    // Pre-v52 database — citation edges alone are fine.
  }

  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1)
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1)
  }

  const bookmarked = getBookmarkedPaperIds()

  // Semantic clusters where embeddings exist. Papers without one get null
  // rather than being forced into a bucket they may not belong to.
  const clusterOf = new Map<string, number>()
  if (withClusters) {
    try {
      for (const c of clusterLibrary(nodeRows.map((n) => n.paperId))) {
        for (const m of c.members) clusterOf.set(m, c.id)
      }
    } catch {
      // No embeddings fetched yet — the graph still renders, coloured by field.
    }
  }

  const nodes: ResearchGraphNode[] = nodeRows.map((n) => ({
    paperId: n.paperId,
    title: n.title,
    year: n.year,
    authors: n.authors,
    venue: n.venue,
    citationCount: n.citationCount,
    influentialCitationCount: n.influentialCitationCount,
    fields: n.fields,
    field: n.fields[0] ?? null,
    abstract: n.abstract,
    url: n.url,
    pdfUrl: n.pdfUrl,
    bookmarked: bookmarked.has(n.paperId),
    depth: n.depth,
    expanded: n.expandedAt !== null,
    cluster: clusterOf.get(n.paperId) ?? null,
    degree: degree.get(n.paperId) ?? 0
  }))

  const fieldCounts = new Map<string, number>()
  for (const n of nodes) {
    if (!n.field) continue
    fieldCounts.set(n.field, (fieldCounts.get(n.field) ?? 0) + 1)
  }

  // Hubs are the papers that the most other papers in YOUR graph connect to —
  // the de facto canon of whatever the user actually works on, which is a
  // different and more useful list than "most cited overall".
  const hubs = [...nodes]
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 20)
    .filter((n) => n.degree > 1)
    .map((n) => ({ paperId: n.paperId, title: n.title, degree: n.degree }))

  return {
    nodes,
    edges,
    fields: [...fieldCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    hubs,
    stats: graphStats()
  }
}

// Co-citation: papers this one frequently appears alongside, because they
// cite the same works. Classic citation-graph similarity, and free now that
// the edge table exists.
export function findCoCited(
  paperId: string,
  limit = 15
): Array<{ paperId: string; shared: number }> {
  const id = paperId.trim()
  if (!id) return []
  try {
    return getDb()
      .prepare<[string, string, number], { paperId: string; shared: number }>(
        `SELECT b.fromPaperId AS paperId, COUNT(*) AS shared
           FROM research_graph_edges a
           JOIN research_graph_edges b ON b.toPaperId = a.toPaperId
          WHERE a.fromPaperId = ? AND b.fromPaperId <> ?
          GROUP BY b.fromPaperId
          ORDER BY shared DESC
          LIMIT ?`
      )
      .all(id, id, limit)
  } catch {
    return []
  }
}

// One paper's neighbourhood, rather than the whole corpus.
//
// "Build graph from this paper" was dropping the user into all ~4,900 nodes,
// which answers a question nobody asked. The useful question about a single
// paper is its lineage: what it builds on, and what built on it.
//
// Generations are signed. Negative is backward through references (older,
// what this work stands on); positive is forward through citations (newer,
// what stands on it); 0 is the focus. That sign is what lets the renderer lay
// the neighbourhood out as a time-ordered DAG instead of a ball.
export interface NeighborhoodNode extends ResearchGraphNode {
  /** Hops from focus. Negative = ancestor, positive = descendant. */
  generation: number
  /**
   * Degree across the WHOLE graph, not just the returned scope.
   *
   * `degree` counts links inside the scene; this counts everything known.
   * The gap between them is what the UI needs to say "showing 22 of 214
   * known links" rather than presenting a scene count as if it were total.
   */
  globalDegree: number
}

export interface NeighborhoodPayload {
  focusPaperId: string
  nodes: NeighborhoodNode[]
  edges: ResearchGraphEdge[]
  /** True when the focus paper's own neighbours have not been fetched yet. */
  needsExpansion: boolean
}

// Nodes per generation.
//
// Still 10, deliberately, even though the data supports far more: measured
// uncapped, a two-hop neighbourhood of a high-degree paper is 340-703 nodes,
// and at a cap of 150 the scene lands at 186-265 — the "few hundred, well
// chosen" the redesign targets.
//
// The cap stays here until the canvas can render that many. Today a band is
// laid out at NODE_GAP = 300 virtual px per node, so a 150-node band would be
// 45,000px wide against a ~1,400px viewport. Raising this without the layout
// work would replace a readable 41-node view with an unreadable one, and would
// change the picture and its data source in the same step — leaving no way to
// tell which of the two broke when something looks wrong.
//
// Raise it with the layout, not before.
const PER_GENERATION = 10

export function getPaperNeighborhood(
  paperId: string,
  hops = 2
): NeighborhoodPayload {
  const focus = paperId.trim()
  if (!focus || !getGraphNode(focus)) {
    return { focusPaperId: focus, nodes: [], edges: [], needsExpansion: true }
  }

  // Walk in SQL against the id set, one hop at a time.
  //
  // This used to call getResearchGraph(), which reads every node — ~40 MB of
  // title/abstract/author text across 29.5k rows — plus every edge, builds a
  // degree map over all of it, and materializes the lot, in order to return a
  // few hundred rows. It ran on every graph open, every hop change and every
  // re-centre.
  const generation = new Map<string, number>([[focus, 0]])

  // Ranking needs citation counts for candidates we have not fetched yet, so
  // each hop pulls its own candidates' rows and reuses them for the payload.
  const rowById = new Map<string, ReturnType<typeof getGraphNode>>()

  const walk = (dir: 'back' | 'forward'): void => {
    let frontier = [focus]
    for (let hop = 1; hop <= hops; hop++) {
      // 'back' follows outgoing edges (what this cites — older work);
      // 'forward' follows incoming edges (what cites this — newer work).
      const edges = dir === 'back' ? edgesFrom(frontier) : edgesTo(frontier)
      const candidates = new Set<string>()
      for (const e of edges) {
        const other = dir === 'back' ? e.toPaperId : e.fromPaperId
        if (!generation.has(other)) candidates.add(other)
      }
      if (candidates.size === 0) break

      const ids = [...candidates]
      for (const row of getGraphNodesByIds(ids)) rowById.set(row.paperId, row)

      // Cap once across the whole hop, ranked by influence — capping per
      // parent would let a band multiply without meaning "top N".
      const rank = (id: string): number => {
        const n = rowById.get(id)
        if (!n) return -1
        return n.influentialCitationCount * 5 + n.citationCount
      }
      const next =
        ids.length <= PER_GENERATION
          ? ids
          : [...ids].sort((a, b) => rank(b) - rank(a)).slice(0, PER_GENERATION)

      for (const n of next) generation.set(n, dir === 'back' ? -hop : hop)
      frontier = next
    }
  }
  walk('back')
  walk('forward')

  const ids = [...generation.keys()]
  const missing = ids.filter((id) => !rowById.has(id))
  for (const row of getGraphNodesByIds(missing)) rowById.set(row.paperId, row)

  const bookmarked = getBookmarkedPaperIds()
  const nodes: NeighborhoodNode[] = []
  for (const [id, gen] of generation) {
    const n = rowById.get(id)
    if (!n) continue
    nodes.push({
      paperId: n.paperId,
      title: n.title,
      year: n.year,
      authors: n.authors,
      venue: n.venue,
      citationCount: n.citationCount,
      influentialCitationCount: n.influentialCitationCount,
      fields: n.fields,
      field: n.fields[0] ?? null,
      abstract: n.abstract,
      url: n.url,
      pdfUrl: n.pdfUrl,
      bookmarked: bookmarked.has(n.paperId),
      depth: n.depth,
      expanded: n.expandedAt !== null,
      cluster: null,
      degree: 0,
      globalDegree: 0,
      generation: gen
    })
  }

  // Degree within the returned scope, which is what the renderer actually
  // needs — a global degree would describe papers that are not on screen.
  const scoped = edgesWithin(ids)
  const degree = new Map<string, number>()
  for (const e of scoped) {
    degree.set(e.fromPaperId, (degree.get(e.fromPaperId) ?? 0) + 1)
    degree.set(e.toPaperId, (degree.get(e.toPaperId) ?? 0) + 1)
  }
  for (const n of nodes) n.degree = degree.get(n.paperId) ?? 0

  const global = globalDegreesFor(ids)
  for (const n of nodes) n.globalDegree = global.get(n.paperId) ?? 0

  return {
    focusPaperId: focus,
    nodes,
    edges: scoped.map((e) => ({
      from: e.fromPaperId,
      to: e.toPaperId,
      relationship: e.relationship,
      intent: e.intent
    })),
    // A focus with no neighbours means it was seeded but never expanded, so
    // the UI can offer to fetch rather than showing a lone dot.
    needsExpansion: nodes.length <= 1
  }
}
