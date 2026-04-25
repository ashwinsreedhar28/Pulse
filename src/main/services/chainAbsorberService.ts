// Absorb a freshly generated per-ticker value chain into the unified
// overlay tables. After generation succeeds, we copy the chain's real-ticker
// nodes and its edges into graph_node_overrides / graph_edge_overrides,
// tagged with the focus ticker's primary sectorId. The per-ticker
// company_value_chains row stays as the "canonical" ticker-scoped view;
// the overlays are what power the sector-wide renderer (Phase 4).
//
// Policy:
// - Only 'ticker'-kind nodes are absorbed (unverified labels like
//   "SUEZ_WATER" don't resolve to a detail page, so they're useless as
//   unified overlays).
// - Nodes already present in supplyChainGraph.json are left alone — the
//   hand-curated graph is the source of truth for stage/blurb.
// - Nodes already in graph_node_overrides are left alone — another source
//   (e.g. 10-K concentration) may have assigned them better metadata.
// - Edges are routed through upsertEdgeOverrideWithConsensus so
//   repeated-same-pair confirmations accumulate (e.g., 10-K + chain_gen
//   for the same supplier relationship).

import { BrowserWindow } from 'electron'

import supplyChainGraph from '../../data/supplyChainGraph.json'
import type { CompanyValueChain } from '../database/companyValueChains'
import { getDb } from '../database/connection'
import { upsertEdgeOverrideWithConsensus } from '../database/graphOverrides'
import { hasNodeOverride, upsertNodeOverride } from '../database/graphNodeOverrides'
import { ensurePassiveTicker, getTickerBySymbol } from '../database/tickers'
import { listNodeOverrides } from '../database/graphNodeOverrides'
import { refreshStocksNow } from './stocksScheduler'
import { getPrimarySectorForSymbol } from './sectorService'

// Set of static-graph symbols for fast "already curated" checks. Built
// once at module load; supplyChainGraph.json is static.
const STATIC_NODE_SYMBOLS = new Set(
  (supplyChainGraph as { nodes: Array<{ symbol: string }> }).nodes.map((n) =>
    n.symbol.toUpperCase()
  )
)

// Retro-backfill: walk every override row and make sure each has a matching
// tickers-table entry. Runs once at boot to fix pre-existing absorbed nodes
// that were inserted before ensurePassiveTicker was wired in — without this
// those tiles still render as EXT with no quote until the user regenerates.
export function backfillPassiveTickersForAbsorbedNodes(): number {
  let added = 0
  for (const override of listNodeOverrides()) {
    const name = override.name?.trim()
    if (!name) continue
    if (getTickerBySymbol(override.symbol)) continue
    ensurePassiveTicker({ symbol: override.symbol, companyName: name })
    added += 1
  }
  return added
}

// Backfill for non-focus absorbed nodes whose sectorId was nulled by an
// earlier version of the absorber (a fix that was overly conservative for
// Ollama-era chains). Now that Claude's chains are accurate enough to
// trust, we want those counterparties visible in the focus's sector tab.
// Walk chain_gen_* rows with sectorId=null, parse the focus out of the
// source tag (chain_gen_<FOCUS>), look up that focus's current sector,
// and write it. Idempotent — only touches null rows. Classified tickers
// (ticker_sectors.isPrimary=1) always win at the renderer's resolve step,
// so this inheritance is safely overridden when a node gets its own chain.
export function repopulateAbsorbedSectorIds(): number {
  let updated = 0
  const db = getDb()
  const rows = db
    .prepare<[], { symbol: string; source: string | null }>(
      `SELECT symbol, source FROM graph_node_overrides
        WHERE sectorId IS NULL AND source LIKE 'chain_gen_%'`
    )
    .all()
  const focusSectorCache = new Map<string, string | null>()
  const setSectorId = db.prepare<[string, string]>(
    `UPDATE graph_node_overrides SET sectorId = ? WHERE symbol = ?`
  )
  for (const row of rows) {
    const focus = (row.source ?? '').replace(/^chain_gen_/, '').toUpperCase()
    if (!focus) continue
    let focusSector = focusSectorCache.get(focus)
    if (focusSector === undefined) {
      focusSector = getPrimarySectorForSymbol(focus)?.sectorId ?? null
      focusSectorCache.set(focus, focusSector)
    }
    if (!focusSector) continue
    setSectorId.run(focusSector, row.symbol)
    updated += 1
  }
  return updated
}

export interface AbsorbResult {
  nodesAdded: number
  edgesAdded: number
  sectorId: string | null
  skipped: string | null
}

export function absorbGeneratedChain(
  focusSymbol: string,
  chain: CompanyValueChain
): AbsorbResult {
  const focus = focusSymbol.toUpperCase()
  const focusSector = getPrimarySectorForSymbol(focus)
  if (!focusSector) {
    return {
      nodesAdded: 0,
      edgesAdded: 0,
      sectorId: null,
      skipped: 'no primary sector assigned — classifier may have failed'
    }
  }
  const sectorId = focusSector.sectorId
  const now = Date.now()
  const source = `chain_gen_${focus}`

  // Pre-absorb cleanup: remove this focus's prior contributions. Without
  // this, a regenerate-all leaves stale rows from old chains — nodes the
  // new chain no longer mentions, edges with out-of-date stages or
  // relationships. For node overrides sourced solely by this focus, we
  // delete outright. For edges where this focus was one of several
  // contributing sources (consensus from news + 10-K + chain_gen), we
  // remove this focus's stake; if that leaves the edge source-less we
  // delete it, otherwise we update to the reduced source list.
  const db = getDb()
  db
    .prepare(`DELETE FROM graph_node_overrides WHERE source = ?`)
    .run(source)
  const edgeRowsOwned = db
    .prepare<[string, string, string, string], {
      fromSymbol: string
      toSymbol: string
      relationship: string
      source: string
    }>(
      `SELECT fromSymbol, toSymbol, relationship, source FROM graph_edge_overrides
        WHERE source = ? OR source LIKE ? OR source LIKE ? OR source LIKE ?`
    )
    .all(source, `${source},%`, `%,${source},%`, `%,${source}`)
  const deleteEdge = db.prepare<[string, string, string]>(
    `DELETE FROM graph_edge_overrides
      WHERE fromSymbol = ? AND toSymbol = ? AND relationship = ?`
  )
  const updateEdgeSources = db.prepare<[string, string, string, string]>(
    `UPDATE graph_edge_overrides SET source = ?
      WHERE fromSymbol = ? AND toSymbol = ? AND relationship = ?`
  )
  for (const row of edgeRowsOwned) {
    const sources = row.source.split(',').map((s) => s.trim()).filter((s) => s && s !== source)
    if (sources.length === 0) {
      deleteEdge.run(row.fromSymbol, row.toSymbol, row.relationship)
    } else {
      updateEdgeSources.run(sources.join(','), row.fromSymbol, row.toSymbol, row.relationship)
    }
  }

  // Set of symbols whose nodes in THIS chain are real tickers — used to
  // filter edges whose endpoints are unverified labels. Focus is
  // implicitly a ticker.
  const tickerSymbols = new Set<string>([focus])
  for (const node of chain.nodes) {
    if (node.kind === 'ticker') tickerSymbols.add(node.symbol.toUpperCase())
  }

  let nodesAdded = 0
  let newPassiveTickers = 0
  for (const node of chain.nodes) {
    if (node.kind !== 'ticker') continue
    const sym = node.symbol.toUpperCase()
    // The focus ticker itself is absorbed too — otherwise a generated
    // chain for COF (not in supplyChainGraph.json) leaves COF invisible
    // from the unified view even though its sector tab just showed up.
    // Passive-ticker upsert runs BEFORE the static-graph / existing-override
    // short-circuits so every ticker-kind node (not just truly-new ones)
    // gets a tickers-table row, which is what makes the stocks scheduler
    // poll quotes for it. Without this, absorbed tiles render as "EXT" with
    // no price because the scheduler doesn't know they exist.
    const hadTicker = !!getTickerBySymbol(sym)
    ensurePassiveTicker({ symbol: sym, companyName: node.name })
    if (!hadTicker) newPassiveTickers += 1
    if (STATIC_NODE_SYMBOLS.has(sym)) continue
    if (hasNodeOverride(sym)) continue
    // Every absorbed node inherits the chain's sectorId. For a high-quality
    // chain generator (Claude), non-focus nodes are almost always real
    // sector peers of the focus (banks that appear in COF's chain ARE
    // financials; payments networks in MA's chain ARE fin-payments). The
    // inheritance makes the unified Value Chain tabs + Diagram view feel
    // like a dynamically growing graph — generate one focus and its whole
    // ecosystem becomes navigable. If the node later gets its own chain
    // generated, its own ticker_sectors classification takes precedence
    // over this inherited tag.
    upsertNodeOverride({
      symbol: sym,
      stage: node.stage,
      sector: null,
      name: node.name,
      blurb: node.blurb,
      source,
      acceptedAt: now,
      sectorId
    })
    nodesAdded += 1
  }

  let edgesAdded = 0
  for (const edge of chain.edges) {
    let from = edge.from.toUpperCase()
    let to = edge.to.toUpperCase()
    let relationship = edge.relationship
    if (!from || !to || from === to) continue
    if (!tickerSymbols.has(from) || !tickerSymbols.has(to)) continue
    // Normalize at write time: "customer" and "supplier" describe the same
    // directional relationship from opposite ends. Storing both forms would
    // produce duplicate rows (X→Y supplier AND Y→X customer mean the same
    // thing). Canonicalize to supplier-form so the DB holds one row per
    // directed economic relationship. The UI's downstream logic no longer
    // has to swap at render time, and cross-chain duplicates collapse via
    // the consensus-merge PK on (from, to, relationship).
    if (relationship === 'customer') {
      const swap = from
      from = to
      to = swap
      relationship = 'supplier'
    }
    upsertEdgeOverrideWithConsensus({
      fromSymbol: from,
      toSymbol: to,
      relationship,
      note: edge.note,
      // Generated-chain edges get a mid-tier weight: better than a bare
      // co-occurrence signal, weaker than a 10-K-grounded supplier claim.
      // Consensus merging boosts this when another source confirms.
      weight: 0.65,
      source,
      acceptedAt: now,
      sectorId,
      // Forward the per-edge citation so the diagram tooltip + unified-
      // graph chips can show clickable provenance (10-K URL, article URL,
      // or model attribution string). Citations carry through ConsensusMerge
      // via COALESCE — second-source merges keep the first citation rather
      // than overwrite.
      citation: edge.citation ?? null
    })
    edgesAdded += 1
  }

  // Fire the graph:updated broadcast that the ValueChain renderer and the
  // Settings audit UI already listen to. Without this the newly-absorbed
  // overrides don't surface until the user navigates away and back.
  if (nodesAdded > 0 || edgesAdded > 0) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('graph:updated')
    }
  }
  // Kick the stocks scheduler only when we actually created new tickers-
  // table rows. During regenerate-all, re-running the absorber on an
  // already-absorbed chain would otherwise trigger one redundant refresh
  // per ticker — a lot of wasted network for no new data. Fire-and-forget
  // when we do need it so the new tiles get quotes within seconds instead
  // of waiting for the scheduler's cadence (up to 15 min on weekends).
  if (newPassiveTickers > 0) {
    refreshStocksNow().catch((err) =>
      console.warn(
        '[chainAbsorb] quote refresh after absorption failed:',
        err instanceof Error ? err.message : err
      )
    )
  }

  return { nodesAdded, edgesAdded, sectorId, skipped: null }
}
