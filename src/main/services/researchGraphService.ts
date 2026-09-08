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
import { listGraphEdges, listGraphNodes, graphStats } from '../database/researchGraph'
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

export function getResearchGraph(): ResearchGraphPayload {
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
  try {
    for (const c of clusterLibrary(nodeRows.map((n) => n.paperId))) {
      for (const m of c.members) clusterOf.set(m, c.id)
    }
  } catch {
    // No embeddings fetched yet — the graph still renders, coloured by field.
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
}

export interface NeighborhoodPayload {
  focusPaperId: string
  nodes: NeighborhoodNode[]
  edges: ResearchGraphEdge[]
  /** True when the focus paper's own neighbours have not been fetched yet. */
  needsExpansion: boolean
}

// Cap per generation (not per parent), so a band stays readable however many
// parents feed it. Ranked by influence, so the slice that survives is the
// meaningful one.
const PER_GENERATION = 18

export function getPaperNeighborhood(
  paperId: string,
  hops = 2
): NeighborhoodPayload {
  const focus = paperId.trim()
  const all = getResearchGraph()
  const byId = new Map(all.nodes.map((n) => [n.paperId, n]))
  if (!byId.has(focus)) {
    return { focusPaperId: focus, nodes: [], edges: [], needsExpansion: true }
  }

  // Adjacency split by direction so the walk can keep ancestors and
  // descendants apart. A single undirected walk would mix "what this builds
  // on" with "what builds on it" and lose the whole point.
  const outgoing = new Map<string, string[]>() // from -> to  (cites)
  const incoming = new Map<string, string[]>() // to -> from  (cited by)
  for (const e of all.edges) {
    const o = outgoing.get(e.from)
    if (o) o.push(e.to)
    else outgoing.set(e.from, [e.to])
    const i = incoming.get(e.to)
    if (i) i.push(e.from)
    else incoming.set(e.to, [e.from])
  }

  const generation = new Map<string, number>([[focus, 0]])

  const rank = (id: string): number => {
    const n = byId.get(id)
    if (!n) return -1
    return n.influentialCitationCount * 5 + n.citationCount
  }

  // Breadth-first in each direction independently. A node already assigned a
  // generation keeps it — the shortest path wins, so a paper that is both a
  // reference and a distant citer reads as the reference it primarily is.
  const walk = (dir: 'back' | 'forward'): void => {
    let frontier = [focus]
    for (let hop = 1; hop <= hops; hop++) {
      // Gather the whole candidate set for this hop, then cap ONCE across it.
      //
      // Capping per parent instead lets the layer multiply: 18 parents each
      // contributing 18 children is 324 nodes in a single band, which is both
      // unreadable and not what "top 18" was meant to mean. Ranking across the
      // full candidate set also picks genuinely better papers, since it can
      // prefer two strong children of one parent over one weak child each.
      const candidates = new Set<string>()
      for (const id of frontier) {
        const neighbours = dir === 'back' ? (outgoing.get(id) ?? []) : (incoming.get(id) ?? [])
        for (const n of neighbours) {
          if (!generation.has(n)) candidates.add(n)
        }
      }
      const next = [...candidates]
        .sort((a, b) => rank(b) - rank(a))
        .slice(0, PER_GENERATION)
      for (const n of next) generation.set(n, dir === 'back' ? -hop : hop)
      frontier = next
      if (frontier.length === 0) break
    }
  }
  walk('back')
  walk('forward')

  const nodes: NeighborhoodNode[] = []
  for (const [id, gen] of generation) {
    const n = byId.get(id)
    if (n) nodes.push({ ...n, generation: gen })
  }
  const keep = new Set(nodes.map((n) => n.paperId))

  return {
    focusPaperId: focus,
    nodes,
    edges: all.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    // A focus with no neighbours means it was seeded but never expanded, so
    // the UI can offer to fetch rather than showing a lone dot.
    needsExpansion: nodes.length <= 1
  }
}
