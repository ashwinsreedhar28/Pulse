// Grows the paper graph by walking citations out from seed papers.
//
// This is the research analogue of what chain generation does for stocks. The
// finance graph accumulated ~880 edges over months because every generated
// company chain deposited its edges into a shared table. Research had no such
// accumulation: paper_value_chain_edges is scoped per focus paper and
// rewritten on regeneration, so the graph never grew past whatever the last
// few chains happened to touch.
//
// Seeds are the papers the user has actually shown interest in — bookmarks,
// paper-chain focus papers, and anything explicitly expanded. From each, S2's
// references and citations endpoints give real bibliographic edges. Unlike
// the company graph these are facts rather than model output, so they need no
// consensus weighting or correction workflow.
//
// Bounded on every axis, because the frontier grows exponentially: depth,
// per-paper fan-out, and papers per run. A paper with 20k citations must
// contribute its most influential handful, not 20k nodes.

import {
  getGraphNode,
  graphStats,
  listGraphNodes,
  markExpanded,
  nextExpansionFrontier,
  upsertGraphEdges,
  upsertGraphNodes,
  type UpsertNodeInput
} from '../database/researchGraph'
import { getBookmarkedPaperIds } from '../database/researchBookmarks'
import { listResearchBookmarks } from '../database/researchBookmarks'
import { getPreferences } from '../database/preferences'
import { getDb } from '../database/connection'
import { s2Schedule } from './s2RateLimit'

const S2_BASE = 'https://api.semanticscholar.org/graph/v1'
const UA = 'Pulse/0.1 (research-graph; ashwin.sreedhar2003@gmail.com)'
const FETCH_TIMEOUT_MS = 20_000

// How far from a seed we are willing to walk. 2 already reaches "the papers
// my papers build on, and what those build on", which is the useful
// neighbourhood; 3 explodes into the general literature and stops being about
// the user's work.
export const MAX_DEPTH = 2
// Per paper, per direction. S2 returns these ranked, so taking the top slice
// keeps the influential spine and drops the long tail.
const FANOUT = 12
// Papers expanded per run. Each costs 2 S2 calls at ~1.1s apart, so 12 papers
// is roughly 30s of background work.
const PAPERS_PER_RUN = 12

const FIELDS = [
  'paperId',
  'title',
  'year',
  'authors',
  'venue',
  'citationCount',
  'influentialCitationCount',
  'fieldsOfStudy',
  'abstract',
  'url',
  'openAccessPdf',
  'externalIds'
].join(',')

function s2ApiKey(): string | null {
  try {
    const k = getPreferences().semanticScholarApiKey?.trim()
    return k && k.length > 0 ? k : null
  } catch {
    return null
  }
}

interface S2Paper {
  paperId?: string
  title?: string
  year?: number | null
  authors?: Array<{ name?: string }>
  venue?: string | null
  citationCount?: number
  influentialCitationCount?: number
  fieldsOfStudy?: string[] | null
  abstract?: string | null
  url?: string | null
  openAccessPdf?: { url?: string } | null
  externalIds?: { ArXiv?: string; DOI?: string }
}

async function s2Get<T>(url: string): Promise<T | null> {
  try {
    return await s2Schedule(async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const headers: Record<string, string> = { 'User-Agent': UA, Accept: 'application/json' }
        const key = s2ApiKey()
        if (key) headers['x-api-key'] = key
        const res = await fetch(url, { headers, signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as T
      } finally {
        clearTimeout(timer)
      }
    })
  } catch (err) {
    console.warn('[research-graph] fetch failed:', err instanceof Error ? err.message : err)
    return null
  }
}

function toNode(p: S2Paper | undefined | null, depth: number): UpsertNodeInput | null {
  if (!p?.paperId || !p.title) return null
  const arxivId = p.externalIds?.ArXiv ?? null
  return {
    paperId: p.paperId,
    title: p.title,
    year: p.year ?? null,
    authors: (p.authors ?? []).map((a) => a.name ?? '').filter(Boolean).slice(0, 5),
    venue: p.venue ?? null,
    citationCount: p.citationCount ?? 0,
    influentialCitationCount: p.influentialCitationCount ?? 0,
    fields: p.fieldsOfStudy ?? [],
    abstract: p.abstract ?? null,
    url: p.url ?? (arxivId ? `https://arxiv.org/abs/${arxivId}` : null),
    // S2 sometimes returns openAccessPdf as {url: ''}, which is not a PDF.
    pdfUrl: p.openAccessPdf?.url?.trim() || (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null),
    arxivId,
    doi: p.externalIds?.DOI ?? null,
    depth
  }
}

// Seeds the graph from everything the user has already engaged with. Depth 0.
//
// Deliberately wider than "bookmarks". A library of 2 bookmarks expands into
// a graph of ~50 papers, which is not a graph. Every paper the user has put
// real intent behind is a legitimate seed:
//   - bookmarks
//   - focus papers of generated paper chains
//   - papers cited in saved topic briefs (research_briefs.paperIdsJson)
// The last is the big one: each brief carries up to ~12 papers the synthesis
// judged worth surfacing, so a couple of saved topics is already a decent
// starting frontier.
function seedIdsFromBriefsAndChains(): string[] {
  const out = new Set<string>()
  try {
    for (const r of getDb()
      .prepare<[], { paperIdsJson: string }>(`SELECT paperIdsJson FROM research_briefs`)
      .all()) {
      const parsed = JSON.parse(r.paperIdsJson) as unknown
      if (Array.isArray(parsed)) for (const id of parsed) if (typeof id === 'string') out.add(id)
    }
  } catch {
    // No briefs yet.
  }
  try {
    for (const r of getDb()
      .prepare<[], { focusPaperId: string }>(
        `SELECT focusPaperId FROM paper_value_chains WHERE status = 'ready'`
      )
      .all()) {
      out.add(r.focusPaperId)
    }
  } catch {
    // Pre-v52.
  }
  return [...out]
}

export function seedFromLibrary(): number {
  const nodes: UpsertNodeInput[] = []
  for (const b of listResearchBookmarks()) {
    nodes.push({
      paperId: b.paperId,
      title: b.paper.title,
      year: b.paper.year,
      authors: b.paper.authors,
      venue: b.paper.venue,
      citationCount: b.paper.citationCount,
      influentialCitationCount: b.paper.influentialCitationCount,
      fields: [],
      abstract: b.paper.abstract,
      url: b.paper.url,
      pdfUrl: b.paper.pdfUrl,
      arxivId: b.paper.arxivId,
      doi: b.paper.doi,
      depth: 0
    })
  }
  let added = upsertGraphNodes(nodes)

  // Brief/chain seeds are bare ids — we have no local metadata for them, so
  // they enter as placeholders and the expander fills in real titles when it
  // fetches their neighbours. Skipped if already present at any depth.
  const known = new Set(nodes.map((n) => n.paperId))
  const extra: UpsertNodeInput[] = []
  for (const id of seedIdsFromBriefsAndChains()) {
    if (known.has(id) || getGraphNode(id)) continue
    extra.push({ paperId: id, title: id, fields: [], depth: 0 })
  }
  added += upsertGraphNodes(extra)
  return added
}

// Adds an arbitrary paper as a seed — used when the user expands from the
// detail panel, so the graph grows around what they are actually reading.
export function addSeed(paper: {
  paperId: string
  title: string
  year?: number | null
  authors?: string[]
  venue?: string | null
  citationCount?: number
  influentialCitationCount?: number
  abstract?: string | null
  url?: string | null
  pdfUrl?: string | null
  arxivId?: string | null
  doi?: string | null
}): number {
  return upsertGraphNodes([{ ...paper, fields: [], depth: 0 }])
}

interface RefRow {
  citedPaper?: S2Paper
  isInfluential?: boolean
  intents?: string[]
}
interface CiteRow {
  citingPaper?: S2Paper
  isInfluential?: boolean
  intents?: string[]
}

// Expands one paper: its references (what it builds on) and its citations
// (what built on it). Both directions matter — references give lineage,
// citations give impact — and together they connect seeds to each other.
async function expandOne(paperId: string, depth: number): Promise<{ nodes: number; edges: number }> {
  const childDepth = depth + 1
  let addedNodes = 0
  let addedEdges = 0

  const refUrl =
    `${S2_BASE}/paper/${encodeURIComponent(paperId)}/references` +
    `?limit=${FANOUT}&fields=${encodeURIComponent(
      'isInfluential,intents,' + FIELDS.split(',').map((f) => `citedPaper.${f}`).join(',')
    )}`
  const refs = await s2Get<{ data?: RefRow[] }>(refUrl)
  if (refs?.data) {
    const nodes: UpsertNodeInput[] = []
    const edges = []
    for (const r of refs.data) {
      const n = toNode(r.citedPaper, childDepth)
      if (!n) continue
      nodes.push(n)
      edges.push({
        fromPaperId: paperId,
        toPaperId: n.paperId,
        relationship: r.isInfluential ? 'influential' : 'cites',
        intent: r.intents?.[0] ?? null
      })
    }
    addedNodes += upsertGraphNodes(nodes)
    addedEdges += upsertGraphEdges(edges)
  }

  const citeUrl =
    `${S2_BASE}/paper/${encodeURIComponent(paperId)}/citations` +
    `?limit=${FANOUT}&fields=${encodeURIComponent(
      'isInfluential,intents,' + FIELDS.split(',').map((f) => `citingPaper.${f}`).join(',')
    )}`
  const cites = await s2Get<{ data?: CiteRow[] }>(citeUrl)
  if (cites?.data) {
    const nodes: UpsertNodeInput[] = []
    const edges = []
    for (const c of cites.data) {
      const n = toNode(c.citingPaper, childDepth)
      if (!n) continue
      nodes.push(n)
      // Edge direction stays citing -> cited regardless of which endpoint we
      // walked from, so the graph has one consistent orientation.
      edges.push({
        fromPaperId: n.paperId,
        toPaperId: paperId,
        relationship: c.isInfluential ? 'influential' : 'cites',
        intent: c.intents?.[0] ?? null
      })
    }
    addedNodes += upsertGraphNodes(nodes)
    addedEdges += upsertGraphEdges(edges)
  }

  markExpanded(paperId)
  return { nodes: addedNodes, edges: addedEdges }
}

// Seeds sourced from briefs and chains arrive as bare ids, so they enter the
// graph with their id as a placeholder title. Fill those in from S2's batch
// endpoint — one request per 100 papers, versus one per paper if we waited
// for each to be expanded individually.
async function hydratePlaceholders(): Promise<void> {
  const stale = listGraphNodes().filter((n) => n.title === n.paperId)
  if (stale.length === 0) return
  for (let i = 0; i < stale.length; i += 100) {
    const chunk = stale.slice(i, i + 100).map((n) => n.paperId)
    try {
      const rows = await s2Schedule(async () => {
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
          const res = await fetch(`${S2_BASE}/paper/batch?fields=${encodeURIComponent(FIELDS)}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ids: chunk }),
            signal: controller.signal
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return (await res.json()) as Array<S2Paper | null>
        } finally {
          clearTimeout(timer)
        }
      })
      const nodes: UpsertNodeInput[] = []
      for (const r of rows ?? []) {
        const n = toNode(r, 0)
        if (n) nodes.push(n)
      }
      upsertGraphNodes(nodes)
    } catch (err) {
      console.warn(
        '[research-graph] placeholder hydrate failed:',
        err instanceof Error ? err.message : err
      )
    }
  }
}

export interface ExpansionResult {
  papersExpanded: number
  nodesAdded: number
  edgesAdded: number
  stats: { nodes: number; edges: number; expanded: number }
}

let running = false

// One bounded pass over the frontier. Safe to call repeatedly; each run picks
// up where the last left off because expansion state lives in the DB
// (expandedAt) rather than in memory.
export async function expandGraph(
  opts: { papers?: number; maxDepth?: number } = {}
): Promise<ExpansionResult> {
  if (running) {
    return { papersExpanded: 0, nodesAdded: 0, edgesAdded: 0, stats: graphStats() }
  }
  running = true
  try {
    seedFromLibrary()
    await hydratePlaceholders()

    const limit = opts.papers ?? PAPERS_PER_RUN
    const maxDepth = opts.maxDepth ?? MAX_DEPTH
    // Frontier is capped at maxDepth - 1: expanding a node at maxDepth would
    // create children one level beyond the limit.
    const frontier = nextExpansionFrontier(maxDepth - 1, limit)

    let nodesAdded = 0
    let edgesAdded = 0
    let expanded = 0
    for (const p of frontier) {
      const r = await expandOne(p.paperId, p.depth)
      nodesAdded += r.nodes
      edgesAdded += r.edges
      expanded++
    }
    return { papersExpanded: expanded, nodesAdded, edgesAdded, stats: graphStats() }
  } finally {
    running = false
  }
}

// Expand a specific paper on demand, seeding it first if it is new. Backs the
// "grow from this paper" action in the UI.
export async function expandFromPaper(paperId: string): Promise<ExpansionResult> {
  const id = paperId.trim()
  if (!id) return { papersExpanded: 0, nodesAdded: 0, edgesAdded: 0, stats: graphStats() }

  if (!getGraphNode(id)) {
    // Unknown paper — fetch its metadata so it enters the graph as a proper
    // seed rather than a bare id.
    const p = await s2Get<S2Paper>(
      `${S2_BASE}/paper/${encodeURIComponent(id)}?fields=${encodeURIComponent(FIELDS)}`
    )
    const n = toNode(p, 0)
    if (!n) return { papersExpanded: 0, nodesAdded: 0, edgesAdded: 0, stats: graphStats() }
    upsertGraphNodes([n])
  }

  const node = getGraphNode(id)
  const r = await expandOne(id, node?.depth ?? 0)
  return {
    papersExpanded: 1,
    nodesAdded: r.nodes,
    edgesAdded: r.edges,
    stats: graphStats()
  }
}

export function isGraphEmpty(): boolean {
  return graphStats().nodes === 0 && getBookmarkedPaperIds().size === 0 && listGraphNodes().length === 0
}
