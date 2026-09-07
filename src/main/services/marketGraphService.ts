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

// Floor for the news co-mention overlay. Below three shared articles the
// pairing is usually one syndicated market-wrap rather than a real
// relationship — the same threshold graphCandidatesService uses.
const MIN_CO_MENTION = 3

export function getMarketGraph(): MarketGraphPayload {
  const nodeRows = listNodeOverrides()
  const edgeRows = listEdgeOverrides()

  // Union of tagged nodes and every edge endpoint: an edge can reference a
  // symbol that was never given a node override, and dropping those would
  // silently delete edges from the picture.
  const symbols = new Set<string>()
  for (const n of nodeRows) symbols.add(n.symbol.toUpperCase())
  for (const e of edgeRows) {
    symbols.add(e.fromSymbol.toUpperCase())
    symbols.add(e.toSymbol.toUpperCase())
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
