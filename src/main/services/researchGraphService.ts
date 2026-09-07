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
