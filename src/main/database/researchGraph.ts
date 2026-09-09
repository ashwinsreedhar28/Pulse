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

// ---- scoped reads ---------------------------------------------------------
//
// The neighbourhood view needs a few hundred rows, and used to get them by
// loading the entire graph into memory and filtering in JavaScript: every
// graph open, hop change and re-centre read all 29.5k nodes including ~40 MB
// of abstracts, plus all 37k edges, to return well under a thousand. These
// accessors do the same work in SQL against the indexes that already exist.

// SQLite's default host-parameter ceiling is 32,766, but chunking well below
// it keeps individual statements small and lets callers pass an unbounded id
// list without thinking about it.
const ID_CHUNK = 800

function chunked<T>(ids: string[], run: (slice: string[]) => T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    out.push(...run(ids.slice(i, i + ID_CHUNK)))
  }
  return out
}

/** Edges leaving the given papers — i.e. the works they cite. */
export function edgesFrom(ids: string[]): ResearchGraphEdgeRow[] {
  if (ids.length === 0) return []
  return chunked(ids, (slice) =>
    getDb()
      .prepare<string[], ResearchGraphEdgeRow>(
        `SELECT fromPaperId, toPaperId, relationship, intent
           FROM research_graph_edges
          WHERE fromPaperId IN (${slice.map(() => '?').join(',')})`
      )
      .all(...slice)
  )
}

/** Edges arriving at the given papers — i.e. the works that cite them. */
export function edgesTo(ids: string[]): ResearchGraphEdgeRow[] {
  if (ids.length === 0) return []
  return chunked(ids, (slice) =>
    getDb()
      .prepare<string[], ResearchGraphEdgeRow>(
        `SELECT fromPaperId, toPaperId, relationship, intent
           FROM research_graph_edges
          WHERE toPaperId IN (${slice.map(() => '?').join(',')})`
      )
      .all(...slice)
  )
}

/**
 * Edges with BOTH endpoints inside the set.
 *
 * Chunking only the `from` side would drop edges whose endpoints land in
 * different chunks, so membership of the `to` side is checked in JS against
 * the full set rather than in SQL.
 */
export function edgesWithin(ids: string[]): ResearchGraphEdgeRow[] {
  if (ids.length === 0) return []
  const set = new Set(ids)
  return edgesFrom(ids).filter((e) => set.has(e.toPaperId))
}

/**
 * @param withAbstract Include the `abstract` column.
 *
 * Off by default, and it matters: abstracts are the overwhelming majority of
 * this table's bytes — title+abstract+authors across the corpus measures
 * ~40 MB, and the canvas needs none of it. It renders title, year, authors,
 * venue, citations, depth and expanded state. The abstract is fetched only
 * when a paper is actually selected.
 */
export function getGraphNodesByIds(
  ids: string[],
  { withAbstract = false } = {}
): ResearchGraphNodeRow[] {
  if (ids.length === 0) return []
  const cols = withAbstract
    ? '*'
    : `paperId, title, year, authorsJson, venue, citationCount,
       influentialCitationCount, fieldsJson, NULL AS abstract, url, pdfUrl,
       arxivId, doi, depth, expandedAt, addedAt`
  return chunked(ids, (slice) =>
    getDb()
      .prepare<string[], RawNode>(
        `SELECT ${cols} FROM research_graph_nodes
          WHERE paperId IN (${slice.map(() => '?').join(',')})`
      )
      .all(...slice)
  ).map(hydrate)
}

/**
 * Degree over the WHOLE graph for the given papers, not just within a scope.
 *
 * This is what lets the UI say "showing 22 of 214 known links" instead of
 * "38 citations" with no denominator — the difference between a summary and
 * a claim about completeness.
 */
export function globalDegreesFor(ids: string[]): Map<string, number> {
  const out = new Map<string, number>()
  if (ids.length === 0) return out
  const rows = chunked(ids, (slice) => {
    const marks = slice.map(() => '?').join(',')
    return getDb()
      .prepare<string[], { paperId: string; degree: number }>(
        `SELECT paperId, COUNT(*) AS degree FROM (
           SELECT fromPaperId AS paperId FROM research_graph_edges
            WHERE fromPaperId IN (${marks})
           UNION ALL
           SELECT toPaperId FROM research_graph_edges
            WHERE toPaperId IN (${marks})
         ) GROUP BY paperId`
      )
      .all(...slice, ...slice)
  })
  for (const r of rows) out.set(r.paperId, r.degree)
  return out
}

/**
 * Highest-degree papers, for the entry-point picker.
 *
 * Replaces shipping the whole graph to the renderer so it could compute this
 * and keep twelve rows. Degree is counted over both directions in SQL.
 */
export function topHubs(
  limit = 12
): Array<{ paperId: string; title: string; degree: number }> {
  return getDb()
    .prepare<[number], { paperId: string; title: string; degree: number }>(
      `SELECT n.paperId AS paperId, n.title AS title, d.degree AS degree
         FROM (
           SELECT paperId, COUNT(*) AS degree FROM (
             SELECT fromPaperId AS paperId FROM research_graph_edges
             UNION ALL
             SELECT toPaperId FROM research_graph_edges
           ) GROUP BY paperId
         ) d
         JOIN research_graph_nodes n ON n.paperId = d.paperId
        ORDER BY d.degree DESC
        LIMIT ?`
    )
    .all(limit)
}
