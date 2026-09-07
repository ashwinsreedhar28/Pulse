// Persistent paper graph (migration v58).
//
// The research counterpart to graphNodeOverrides/graphOverrides on the
// finance side: a slowly-accumulating structure the UI reads, grown by
// citation expansion rather than by chain generation.

import { getDb } from './connection'

export interface ResearchGraphNodeRow {
  paperId: string
  title: string
  year: number | null
  authors: string[]
  venue: string | null
  citationCount: number
  influentialCitationCount: number
  fields: string[]
  abstract: string | null
  url: string | null
  pdfUrl: string | null
  arxivId: string | null
  doi: string | null
  depth: number
  expandedAt: number | null
  addedAt: number
}

export interface ResearchGraphEdgeRow {
  fromPaperId: string
  toPaperId: string
  relationship: string
  intent: string | null
}

interface RawNode {
  paperId: string
  title: string
  year: number | null
  authorsJson: string | null
  venue: string | null
  citationCount: number
  influentialCitationCount: number
  fieldsJson: string | null
  abstract: string | null
  url: string | null
  pdfUrl: string | null
  arxivId: string | null
  doi: string | null
  depth: number
  expandedAt: number | null
  addedAt: number
}

function parseArr(json: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json) as unknown
    return Array.isArray(v) ? (v as string[]) : []
  } catch {
    return []
  }
}

function hydrate(r: RawNode): ResearchGraphNodeRow {
  return {
    ...r,
    authors: parseArr(r.authorsJson),
    fields: parseArr(r.fieldsJson)
  }
}

export interface UpsertNodeInput {
  paperId: string
  title: string
  year?: number | null
  authors?: string[]
  venue?: string | null
  citationCount?: number
  influentialCitationCount?: number
  fields?: string[]
  abstract?: string | null
  url?: string | null
  pdfUrl?: string | null
  arxivId?: string | null
  doi?: string | null
  depth: number
}

// Upserts, but never *increases* a node's depth: a paper first reached at
// depth 2 that later turns out to be a seed must become depth 0, not stay
// at 2. Metadata is refreshed because citation counts move.
export function upsertGraphNodes(nodes: UpsertNodeInput[]): number {
  if (nodes.length === 0) return 0
  const db = getDb()
  const now = Date.now()
  const stmt = db.prepare(
    `INSERT INTO research_graph_nodes
       (paperId, title, year, authorsJson, venue, citationCount,
        influentialCitationCount, fieldsJson, abstract, url, pdfUrl,
        arxivId, doi, depth, expandedAt, addedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(paperId) DO UPDATE SET
       title = excluded.title,
       year = COALESCE(excluded.year, research_graph_nodes.year),
       authorsJson = COALESCE(excluded.authorsJson, research_graph_nodes.authorsJson),
       venue = COALESCE(excluded.venue, research_graph_nodes.venue),
       citationCount = MAX(excluded.citationCount, research_graph_nodes.citationCount),
       influentialCitationCount =
         MAX(excluded.influentialCitationCount, research_graph_nodes.influentialCitationCount),
       fieldsJson = COALESCE(excluded.fieldsJson, research_graph_nodes.fieldsJson),
       abstract = COALESCE(excluded.abstract, research_graph_nodes.abstract),
       url = COALESCE(excluded.url, research_graph_nodes.url),
       pdfUrl = COALESCE(excluded.pdfUrl, research_graph_nodes.pdfUrl),
       arxivId = COALESCE(excluded.arxivId, research_graph_nodes.arxivId),
       doi = COALESCE(excluded.doi, research_graph_nodes.doi),
       depth = MIN(excluded.depth, research_graph_nodes.depth)`
  )
  const txn = db.transaction((batch: UpsertNodeInput[]) => {
    let n = 0
    for (const x of batch) {
      const id = x.paperId.trim()
      if (!id || !x.title) continue
      stmt.run(
        id,
        x.title,
        x.year ?? null,
        x.authors && x.authors.length ? JSON.stringify(x.authors) : null,
        x.venue ?? null,
        x.citationCount ?? 0,
        x.influentialCitationCount ?? 0,
        x.fields && x.fields.length ? JSON.stringify(x.fields) : null,
        x.abstract ?? null,
        x.url ?? null,
        x.pdfUrl ?? null,
        x.arxivId ?? null,
        x.doi ?? null,
        x.depth,
        now
      )
      n++
    }
    return n
  })
  return txn(nodes)
}

export function upsertGraphEdges(edges: ResearchGraphEdgeRow[]): number {
  if (edges.length === 0) return 0
  const db = getDb()
  const now = Date.now()
  const stmt = db.prepare(
    `INSERT INTO research_graph_edges (fromPaperId, toPaperId, relationship, intent, addedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(fromPaperId, toPaperId) DO UPDATE SET
       -- 'influential' is strictly more informative than 'cites', so never
       -- let a later plain reference downgrade it.
       relationship = CASE
         WHEN excluded.relationship = 'influential' THEN 'influential'
         ELSE research_graph_edges.relationship END,
       intent = COALESCE(excluded.intent, research_graph_edges.intent)`
  )
  const txn = db.transaction((batch: ResearchGraphEdgeRow[]) => {
    let n = 0
    for (const e of batch) {
      const f = e.fromPaperId.trim()
      const t = e.toPaperId.trim()
      if (!f || !t || f === t) continue
      stmt.run(f, t, e.relationship, e.intent, now)
      n++
    }
    return n
  })
  return txn(edges)
}

export function markExpanded(paperId: string): void {
  getDb()
    .prepare(`UPDATE research_graph_nodes SET expandedAt = ? WHERE paperId = ?`)
    .run(Date.now(), paperId.trim())
}

export function listGraphNodes(): ResearchGraphNodeRow[] {
  return getDb()
    .prepare<[], RawNode>(`SELECT * FROM research_graph_nodes`)
    .all()
    .map(hydrate)
}

export function listGraphEdges(): ResearchGraphEdgeRow[] {
  return getDb()
    .prepare<[], ResearchGraphEdgeRow>(
      `SELECT fromPaperId, toPaperId, relationship, intent FROM research_graph_edges`
    )
    .all()
}

export function getGraphNode(paperId: string): ResearchGraphNodeRow | null {
  const r = getDb()
    .prepare<[string], RawNode>(`SELECT * FROM research_graph_nodes WHERE paperId = ?`)
    .get(paperId.trim())
  return r ? hydrate(r) : null
}

// Next papers to expand: shallowest first, then most-cited. Depth-first would
// wander into one corner of the literature; this keeps the graph balanced
// around its seeds and prioritises papers that actually matter.
export function nextExpansionFrontier(maxDepth: number, limit: number): ResearchGraphNodeRow[] {
  return getDb()
    .prepare<[number, number], RawNode>(
      `SELECT * FROM research_graph_nodes
        WHERE expandedAt IS NULL AND depth <= ?
        ORDER BY depth ASC, citationCount DESC
        LIMIT ?`
    )
    .all(maxDepth, limit)
    .map(hydrate)
}

export function graphStats(): { nodes: number; edges: number; expanded: number } {
  const db = getDb()
  const n = db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM research_graph_nodes`).get()
  const e = db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM research_graph_edges`).get()
  const x = db
    .prepare<[], { n: number }>(
      `SELECT COUNT(*) AS n FROM research_graph_nodes WHERE expandedAt IS NOT NULL`
    )
    .get()
  return { nodes: n?.n ?? 0, edges: e?.n ?? 0, expanded: x?.n ?? 0 }
}
