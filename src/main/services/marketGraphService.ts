// Assembles the whole-market graph in one call.
//
// Everything here already existed in the database and was only ever read
// per-ticker: graph_edge_overrides holds ~880 typed, weighted supplier /
// competitor / partner edges over ~280 symbols, and graph_node_overrides tags
// ~200 of them into the sector taxonomy. The staged ValueChainDiagram renders
// one focus company's slice of that at a time; nothing ever showed the whole
// structure at once.
//
// One IPC round-trip on purpose. The renderer needs nodes, edges, sector
// ancestry, sizing metrics and news co-mentions together to lay a graph out,
// and five separate channels would just mean five awaits before first paint.

import { listEdgeOverrides } from '../database/graphOverrides'
import { listNodeOverrides } from '../database/graphNodeOverrides'
import { getLatestFundamentals } from '../database/tickerFundamentals'
import { listTickers } from '../database/tickers'
import { buildPrimarySectorIndex, getTopLevelAncestor, listSectors } from './sectorService'
import { getDb } from '../database/connection'

export interface MarketGraphNode {
  symbol: string
  name: string | null
  /** Fine-grained stage, e.g. "semi.equipment". */
  stage: string | null
  sectorId: string | null
  /** Top-level sector id — what the renderer colours by. */
  topSectorId: string | null
  topSectorName: string | null
  blurb: string | null
  marketCap: number | null
  /** Distinct articles mentioning this symbol, from the durable archive. */
  newsCount: number
  /** True when the symbol is on the active watchlist rather than passive. */
  isActive: boolean
}

export interface MarketGraphEdge {
  from: string
  to: string
  relationship: string
  weight: number | null
  note: string | null
  /** Comma-joined provenance tags, e.g. "chain_gen_NVDA,news_cooccurrence". */
  source: string
  /** True when endpoints resolve to different top-level sectors. */
  crossSector: boolean
}

export interface MarketCoMention {
  from: string
  to: string
  count: number
}

export interface MarketGraphPayload {
  nodes: MarketGraphNode[]
  edges: MarketGraphEdge[]
  coMentions: MarketCoMention[]
  sectors: Array<{ id: string; name: string }>
}

import {
  adjacency,
  betweenness,
  degreeMap,
  pagerank,
  relationshipDegree,
  sectorFlows,
  sectorsTouched,
  supplierDegrees,
  type MetricEdge,
  type SectorFlow
} from './graphMetrics'

// Floor for the news co-mention overlay. Below three shared articles the
// pairing is usually one syndicated market-wrap rather than a real
// relationship — the same threshold graphCandidatesService uses.
const MIN_CO_MENTION = 3

export function getMarketGraph(): MarketGraphPayload {
  const nodeRows = listNodeOverrides()
  const edgeRows = listEdgeOverrides()

  // Node set is the union of three things:
  //   1. symbols with a node override (the curated chain nodes)
  //   2. every edge endpoint — an edge can reference a symbol that was never
  //      given an override, and dropping those would delete edges from the
  //      picture
  //   3. every symbol with a sector assignment
  //
  // (3) is what makes the sector filter meaningful. Without it the graph only
  // ever showed the ~286 symbols reachable from the curated chains, so the
  // per-sector counts in the UI described the chain graph rather than the
  // tracked universe — Information Technology 146, everything else under 25,
  // even after the sector universe seed added 1,100+ assignments.
  //
  // Most of (3) has no edges yet. The renderer lays those out separately
  // rather than feeding them to the O(n^2) force simulation.
  const symbols = new Set<string>()
  for (const n of nodeRows) symbols.add(n.symbol.toUpperCase())
  for (const e of edgeRows) {
    symbols.add(e.fromSymbol.toUpperCase())
    symbols.add(e.toSymbol.toUpperCase())
  }
  try {
    for (const r of getDb()
      .prepare<[], { symbol: string }>(`SELECT DISTINCT symbol FROM ticker_sectors`)
      .all()) {
      symbols.add(r.symbol.toUpperCase())
    }
  } catch {
    // ticker_sectors missing — fall back to the chain-only universe.
  }
  const symbolList = [...symbols]

  const nodeBySymbol = new Map(nodeRows.map((n) => [n.symbol.toUpperCase(), n]))
  const fundamentals = getLatestFundamentals(symbolList)
  const newsCounts = countArchiveMentions(symbolList)

  const tickerBySymbol = new Map(
    listTickers().map((t) => [t.symbol.toUpperCase(), t])
  )

  // primarySectorIndex maps symbol -> its primary sectorId; the node override
  // may also carry one. Prefer the explicit override, fall back to the index.
  const primaryIndex = buildPrimarySectorIndex()
  const sectorNames = new Map(listSectors().map((s) => [s.id, s.name]))

  const topSectorCache = new Map<string, string | null>()
  const topSectorOf = (sectorId: string | null): string | null => {
    if (!sectorId) return null
    const hit = topSectorCache.get(sectorId)
    if (hit !== undefined) return hit
    let top: string | null = null
    try {
      top = getTopLevelAncestor(sectorId) ?? sectorId
    } catch {
      top = sectorId
    }
    topSectorCache.set(sectorId, top)
    return top
  }

  const nodes: MarketGraphNode[] = symbolList.map((symbol) => {
    const override = nodeBySymbol.get(symbol)
    const sectorId = override?.sectorId ?? primaryIndex[symbol] ?? null
    const topSectorId = topSectorOf(sectorId)
    const ticker = tickerBySymbol.get(symbol)
    return {
      symbol,
      name: override?.name ?? ticker?.companyName ?? null,
      stage: override?.stage ?? null,
      sectorId,
      topSectorId,
      topSectorName: topSectorId ? (sectorNames.get(topSectorId) ?? null) : null,
      blurb: override?.blurb ?? null,
      marketCap: fundamentals.get(symbol)?.marketCap ?? null,
      newsCount: newsCounts.get(symbol) ?? 0,
      isActive: ticker?.isActive ?? false
    }
  })

  const topBySymbol = new Map(nodes.map((n) => [n.symbol, n.topSectorId]))
  const edges: MarketGraphEdge[] = edgeRows.map((e) => {
    const from = e.fromSymbol.toUpperCase()
    const to = e.toSymbol.toUpperCase()
    const a = topBySymbol.get(from)
    const b = topBySymbol.get(to)
    return {
      from,
      to,
      relationship: e.relationship,
      weight: e.weight,
      note: e.note,
      source: e.source,
      crossSector: a !== null && b !== null && a !== undefined && b !== undefined && a !== b
    }
  })

  return {
    nodes,
    edges,
    coMentions: computeCoMentions(symbols),
    sectors: [...sectorNames].map(([id, name]) => ({ id, name }))
  }
}

// Distinct archived articles per symbol. Reads the archive rather than the
// live table so the count reflects the full retained history instead of only
// the last 30 days.
function countArchiveMentions(symbols: string[]): Map<string, number> {
  const out = new Map<string, number>()
  if (symbols.length === 0) return out
  try {
    const rows = getDb()
      .prepare<[], { symbol: string; n: number }>(
        `SELECT symbol, COUNT(DISTINCT articleId) AS n
           FROM article_ticker_matches_archive
          WHERE symbol <> '__none__'
          GROUP BY symbol`
      )
      .all()
    for (const r of rows) out.set(r.symbol.toUpperCase(), r.n)
  } catch {
    // Pre-v54 database — the overlay just renders without news weighting.
  }
  return out
}

// Symbol pairs that appear in the same article often enough to be worth
// drawing. This is a genuinely different signal from the supply-chain edges:
// those are asserted structure, this is observed co-movement in coverage.
function computeCoMentions(symbols: Set<string>): MarketCoMention[] {
  try {
    const rows = getDb()
      .prepare<[number], { a: string; b: string; n: number }>(
        `SELECT a.symbol AS a, b.symbol AS b, COUNT(*) AS n
           FROM article_ticker_matches_archive a
           JOIN article_ticker_matches_archive b
             ON b.articleId = a.articleId AND a.symbol < b.symbol
          WHERE a.symbol <> '__none__' AND b.symbol <> '__none__'
          GROUP BY a.symbol, b.symbol
         HAVING COUNT(*) >= ?
          ORDER BY n DESC
          LIMIT 400`
      )
      .all(MIN_CO_MENTION)
    // Only pairs where both ends are actually drawn.
    return rows
      .filter((r) => symbols.has(r.a.toUpperCase()) && symbols.has(r.b.toUpperCase()))
      .map((r) => ({ from: r.a.toUpperCase(), to: r.b.toUpperCase(), count: r.n }))
  } catch {
    return []
  }
}

// ---- statistics -----------------------------------------------------------
//
// On its own IPC channel rather than folded into getMarketGraph(), because
// betweenness is O(V·E) and the graph payload is fetched on every mount and on
// every graph:updated push. The Analytics tab asks for this when it opens.

export interface MarketRankEntry {
  symbol: string
  name: string | null
  sectorName: string | null
  value: number
  /** Edges touching this symbol that carry a filing or article citation. */
  cited: number
  /** Total edges touching this symbol. */
  total: number
}

export interface MarketGraphStats {
  totals: {
    nodes: number
    connected: number
    edges: number
    supplier: number
    competitor: number
    partner: number
  }
  /**
   * Edge provenance. `corroborated` means more than one DISTINCT source class,
   * not more than one source tag — the tags are chain_gen_<FOCUS>, so counting
   * tags would score the same Claude prompt run from different focus tickers
   * as independent agreement.
   */
  provenance: { corroborated: number; cited: number; uncited: number; total: number }
  ranks: {
    degree: MarketRankEntry[]
    suppliesTo: MarketRankEntry[]
    dependsOn: MarketRankEntry[]
    competitors: MarketRankEntry[]
    partners: MarketRankEntry[]
    bridges: MarketRankEntry[]
    betweenness: MarketRankEntry[]
    pagerank: MarketRankEntry[]
  }
  sectorFlows: SectorFlow[]
}

const RANK_LIMIT = 25

// Memoized across calls. Betweenness is O(V·E) — ~760ms on the live graph —
// and the Analytics tab unmounts whenever the user switches away, so without
// this every visit recomputed the whole thing from scratch.
//
// The fingerprint is the edge count plus the newest acceptedAt: edges are
// insert-mostly and carry a timestamp, so any growth or replacement moves one
// of the two. Cheap enough (one indexed aggregate) to check on every call.
let statsCache: { fingerprint: string; value: MarketGraphStats } | null = null

function statsFingerprint(): string {
  try {
    const row = getDb()
      .prepare<[], { n: number; newest: number | null }>(
        `SELECT COUNT(*) AS n, MAX(acceptedAt) AS newest FROM graph_edge_overrides`
      )
      .get()
    return `${row?.n ?? 0}:${row?.newest ?? 0}`
  } catch {
    // No table yet — a constant fingerprint is fine; the payload is empty too.
    return 'none'
  }
}

/** Clears the memo. Exposed for callers that mutate the graph directly. */
export function invalidateMarketGraphStats(): void {
  statsCache = null
}

export function getMarketGraphStats(): MarketGraphStats {
  const fingerprint = statsFingerprint()
  if (statsCache && statsCache.fingerprint === fingerprint) return statsCache.value
  const computed = computeMarketGraphStats()
  statsCache = { fingerprint, value: computed }
  return computed
}

function computeMarketGraphStats(): MarketGraphStats {
  const graph = getMarketGraph()
  const metricEdges: MetricEdge[] = graph.edges.map((e) => ({
    from: e.from,
    to: e.to,
    relationship: e.relationship
  }))

  const nodeBySymbol = new Map(graph.nodes.map((n) => [n.symbol, n]))
  const sectorOf = (symbol: string): string | null =>
    nodeBySymbol.get(symbol)?.topSectorName ?? null

  // Per-symbol citation coverage, so every ranking can carry its own
  // provenance rather than presenting a model's opinion as a measurement.
  const citedBySymbol = new Map<string, number>()
  const totalBySymbol = new Map<string, number>()
  let corroborated = 0
  let citedEdges = 0
  const bump = (m: Map<string, number>, k: string): void => {
    m.set(k, (m.get(k) ?? 0) + 1)
  }

  for (const row of listEdgeOverrides()) {
    const from = row.fromSymbol.toUpperCase()
    const to = row.toSymbol.toUpperCase()
    bump(totalBySymbol, from)
    bump(totalBySymbol, to)
    const hasCite = (row.citations ?? []).some(
      (c) => c.kind === 'filing' || c.kind === 'article'
    )
    if (hasCite) {
      citedEdges++
      bump(citedBySymbol, from)
      bump(citedBySymbol, to)
    }
    const classes = new Set(
      row.source.split(',').map((t) => (t.trim().startsWith('chain_gen') ? 'chain_gen' : t.trim()))
    )
    if (classes.size > 1) corroborated++
  }

  const entry = (symbol: string, value: number): MarketRankEntry => {
    const n = nodeBySymbol.get(symbol)
    return {
      symbol,
      // Fall back to the graph node's own name: some symbols have a node
      // override with no matching tickers row, which otherwise renders a
      // blank cell in a ranked table.
      name: n?.name ?? null,
      sectorName: n?.topSectorName ?? null,
      value,
      cited: citedBySymbol.get(symbol) ?? 0,
      total: totalBySymbol.get(symbol) ?? 0
    }
  }

  const top = (m: Map<string, number>, round = false): MarketRankEntry[] =>
    [...m.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, RANK_LIMIT)
      .map(([sym, v]) => entry(sym, round ? Math.round(v) : v))

  const { suppliesTo, dependsOn } = supplierDegrees(metricEdges)
  const touched = sectorsTouched(metricEdges, sectorOf)
  const bridgeCounts = new Map([...touched.entries()].map(([k, v]) => [k, v.size]))

  const relCount = (r: string): number =>
    metricEdges.filter((e) => e.relationship === r).length

  return {
    totals: {
      nodes: graph.nodes.length,
      connected: adjacency(metricEdges).size,
      edges: metricEdges.length,
      supplier: relCount('supplier'),
      competitor: relCount('competitor'),
      partner: relCount('partner')
    },
    provenance: {
      corroborated,
      cited: citedEdges,
      uncited: metricEdges.length - citedEdges,
      total: metricEdges.length
    },
    ranks: {
      degree: top(degreeMap(metricEdges)),
      suppliesTo: top(suppliesTo),
      dependsOn: top(dependsOn),
      competitors: top(relationshipDegree(metricEdges, 'competitor')),
      partners: top(relationshipDegree(metricEdges, 'partner')),
      bridges: top(bridgeCounts),
      betweenness: top(betweenness(metricEdges), true),
      pagerank: [...pagerank(metricEdges).entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, RANK_LIMIT)
        .map(([sym, v]) => entry(sym, v))
    },
    sectorFlows: sectorFlows(metricEdges, sectorOf).slice(0, 20)
  }
}
