import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AnalystEstimates,
  ChainCorrection,
  CompanyValueChain,
  CompanyValueChainEdgeCitation,
  CompanyValueChainEdgeSource,
  EarningsBadge,
  FinancialsSnapshot,
  GraphEdgeOverride,
  GraphNodeOverride,
  OptionsSnapshot,
  SecFiling,
  SectorWithContent,
  StockQuote,
  Ticker
} from '../../preload'
import graph from '../../data/supplyChainGraph.json'
import sectorCatalogRaw from '../../data/sectorCatalog.json'
import { ValueChainDiagram } from './ValueChainDiagram'
import {
  TransactionCluster,
  categoryGlow,
  type Category,
  type Counterparty
} from './StockValueChainCard'
import {
  fcfMarginTone,
  formatMoneyCompact,
  formatPctDelta,
  formatPctValue
} from './financialsFormat'
import { countdownLabel, pulseClass, pulsePhase } from './earningsPulse'
import { FcfSparkline } from './FcfSparkline'
import { EarningsBeatMiss } from './EarningsBeatMiss'
import { PeerCompareModal } from './PeerCompareModal'
import { resolveDisplayQuote } from './quoteDisplay'
import { ChainCorrectionMenu, type ChainCorrectionAction } from './ChainCorrectionMenu'

interface ValueChainSector {
  id: string
  label: string
}
interface ValueChainStage {
  id: string
  label: string
}
interface ValueChainNode {
  symbol: string
  stage: string
  sector: string
  blurb?: string
  // Fallback display name for nodes without a matching `tickers` row (e.g.
  // private companies). The graph JSON supplies it; the tickers table wins
  // when available.
  name?: string
}
interface ValueChainEdge {
  from: string
  to: string
  note?: string
  // Multi-cite array forwarded from graph_edge_overrides. Empty for static
  // CHAIN.edges (no citations attached) and for legacy override rows that
  // were absorbed pre-multi-cite.
  citations?: CompanyValueChainEdgeCitation[]
  // Edge-level source category (filings / news / analyst / profile / model).
  // Used by the focus panel's pill-tone fallback when a citation is absent.
  source?: CompanyValueChainEdgeSource | null
}
interface ValueChainGraph {
  sectors: ValueChainSector[]
  stages: ValueChainStage[]
  nodes: ValueChainNode[]
  edges: ValueChainEdge[]
  competitors: string[][]
}

const CHAIN = graph as ValueChainGraph

// Sector catalog (unified multi-sector graph). Bundled as static data so
// the renderer can build ancestor maps / tab labels without waiting on IPC.
// The backend's ticker_sectors + primaryIndex provide the runtime content
// counts; the catalog here provides the tree structure those counts roll up
// through.
interface CatalogEntry {
  id: string
  parentId?: string
  name: string
  description?: string
  stages?: Array<{ id: string; name: string }>
  legacyIds?: string[]
}
const CATALOG = (sectorCatalogRaw as { sectors: CatalogEntry[] }).sectors

// sectorId → inclusive set of ancestor ids (the sector itself up to its
// top-level GICS parent). Used for the sector tab filter — a ticker is in
// a tab's scope iff the tab's id is somewhere in the ticker's primary
// sector's ancestor chain.
const SECTOR_ANCESTORS: Map<string, Set<string>> = (() => {
  const parentOf = new Map<string, string | null>()
  for (const s of CATALOG) parentOf.set(s.id, s.parentId ?? null)
  const out = new Map<string, Set<string>>()
  for (const s of CATALOG) {
    const set = new Set<string>()
    let cur: string | null = s.id
    const visited = new Set<string>()
    while (cur && !visited.has(cur)) {
      visited.add(cur)
      set.add(cur)
      cur = parentOf.get(cur) ?? null
    }
    out.set(s.id, set)
  }
  return out
})()

// legacy supplyChainGraph sector ('semi', 'cloud', …) → current sub-sector
// id. Built from the catalog's legacyIds field so there's one source of
// truth. Used as a fallback when a node in graph_node_overrides has a
// legacy `sector` string but no sectorId yet.
const LEGACY_TO_SECTOR_ID: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const entry of CATALOG) {
    for (const legacy of entry.legacyIds ?? []) m.set(legacy, entry.id)
  }
  return m
})()

// GICS top-level id → display name. Used by the tab strip.
const TOP_LEVEL_SECTORS: Array<{ id: string; name: string }> = CATALOG.filter(
  (s) => !s.parentId
).map((s) => ({ id: s.id, name: s.name }))

// Turn a kebab-case stage id ("battery-cells") into a human title
// ("Battery Cells") when we don't have a catalog-supplied label. Used for
// stages discovered from generated chains that land in sectors without a
// curated stage list.
function humanizeStageId(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Competitor relationships are symmetric — stored once in the JSON as
// [A, B] pairs but indexed both directions here so either side of the pair
// resolves its peers without double-bookkeeping in the source data.
const COMPETITOR_MAP: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>()
  for (const pair of CHAIN.competitors ?? []) {
    if (pair.length !== 2) continue
    const [a, b] = pair
    if (!m.has(a)) m.set(a, new Set())
    if (!m.has(b)) m.set(b, new Set())
    m.get(a)!.add(b)
    m.get(b)!.add(a)
  }
  return m
})()

// Role precedence when a tile matches multiple relationships to the focus:
//   focus > competitor > both (customer+supplier) > customer > supplier
// Competitor wins over directional roles because a supplier-who-also-competes
// (e.g. INTC selling Xeon to AMZN while also competing with AWS Graviton) is
// a more unusual and informative signal than the directional one.
type RelatedRole = 'focus' | 'customer' | 'supplier' | 'both' | 'competitor'

export function ValueChain({
  tickers,
  quotes,
  onOpenTicker,
  onActivateTicker,
  externalFocus,
  onExternalFocusHandled,
  onOpenURL
}: {
  tickers: Ticker[]
  quotes: StockQuote[]
  onOpenTicker: (tickerId: number) => void
  onActivateTicker: (tickerId: number) => void
  // Symbol to lock + scroll into view, driven by a parent-level ticker
  // search. Nullable; when the parent hands us a non-null value we treat
  // it as a request that resets internal state (sector filter → "all",
  // lockedSymbol → symbol) and scrolls the matching tile. `onExternalFocusHandled`
  // fires after the component accepts the focus so the parent can clear
  // its request state (prevents re-focusing on every re-render).
  externalFocus?: string | null
  onExternalFocusHandled?: () => void
  // Open a citation URL in the in-app reader. Wired into TransactionCluster
  // so each edge's source pill (10-K filing, news article) becomes a
  // clickable link that opens the cited document.
  onOpenURL?: (url: string, title: string, subtitle?: string | null) => void
}): JSX.Element {
  // Two focus sources: hover (transient) and lock (sticky, click-driven).
  // `lockedSymbol` wins when set — hover changes are silently recorded but
  // don't change the visible focus panel, so users can scroll the grid
  // without losing their place.
  const [hoverSymbol, setHoverSymbol] = useState<string | null>(null)
  const [lockedSymbol, setLockedSymbol] = useState<string | null>(null)
  const [sectorId, setSectorId] = useState<string>('all')
  const [diagramSymbol, setDiagramSymbol] = useState<string | null>(null)
  const [peerCompareSymbol, setPeerCompareSymbol] = useState<string | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Per-symbol tile element refs, keyed on the uppercased symbol. Populated
  // by the tile map below via ref callbacks. Used when an external focus
  // request lands, so we can scrollIntoView the matching tile rather than
  // leaving the user to hunt for a highlighted node in a grid of hundreds.
  const tileRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  // Symbol whose tile we still owe a scroll-into-view pass — deferred by
  // one render so React has applied the sectorId='all' swap and the tile
  // actually exists in the DOM by the time we call scrollIntoView.
  const [pendingScroll, setPendingScroll] = useState<string | null>(null)
  // Single/double-click discrimination. The first click starts a timer; a
  // second click inside the window cancels the timer and runs the
  // double-click action (open detail). Otherwise the timer fires and runs
  // the single-click action (toggle lock). 220ms matches macOS' default.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const CLICK_DELAY_MS = 220

  const focusSymbol = lockedSymbol ?? hoverSymbol

  const focusTile = (symbol: string): void => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current)
      clearTimer.current = null
    }
    setHoverSymbol(symbol)
  }

  const scheduleClear = (): void => {
    if (clearTimer.current) clearTimeout(clearTimer.current)
    clearTimer.current = setTimeout(() => setHoverSymbol(null), 80)
  }

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current)
      if (clickTimer.current) clearTimeout(clickTimer.current)
    }
  }, [])

  // Accept external focus requests (search-box driven). Lock the symbol,
  // snap the sector filter back to "all" so the tile is guaranteed to
  // render regardless of which sector tab the user had selected, and
  // mark a pending scroll — the actual scrollIntoView runs in a separate
  // effect that fires after the render commits.
  useEffect(() => {
    if (!externalFocus) return
    const upper = externalFocus.toUpperCase()
    setLockedSymbol(upper)
    setSectorId('all')
    setPendingScroll(upper)
    onExternalFocusHandled?.()
    // onExternalFocusHandled is intentionally called synchronously — once
    // we've recorded the request the parent can clear its state so a
    // stable identity isn't required. pendingScroll clears in the
    // scroll-effect below after the DOM catches up.
  }, [externalFocus, onExternalFocusHandled])

  useEffect(() => {
    if (!pendingScroll) return
    // Two-phase scroll: the first rAF waits for the React commit that
    // applied sectorId='all'; the inner timeout waits one more macrotask
    // so the Value Chain's stage-grouping useMemos (which rerun on
    // sectorId change) have time to rebuild and the tile is actually in
    // the DOM. Without the second delay, the initial scroll could fire
    // against a tile element that's about to be unmounted + remounted
    // when the memos resolve.
    const raf = requestAnimationFrame(() => {
      setTimeout(() => {
        const el = tileRefs.current.get(pendingScroll)
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'smooth'
          })
        }
        setPendingScroll(null)
      }, 50)
    })
    return () => cancelAnimationFrame(raf)
  }, [pendingScroll])

  const quoteBySymbol = useMemo(() => {
    const m = new Map<string, StockQuote>()
    for (const q of quotes) m.set(q.symbol.toUpperCase(), q)
    return m
  }, [quotes])

  // Cashflow snapshots keyed by upper-case symbol. Fetched in bulk on mount
  // so every tile has its KPIs ready; the scheduler broadcasts per-symbol
  // updates via `financials:updated` which we patch into the same map. Empty
  // snapshot entries are fine — the formatter falls through to em-dashes.
  const [financialsMap, setFinancialsMap] = useState<Map<string, FinancialsSnapshot>>(
    () => new Map()
  )
  // Earnings badges (next scheduled date + most-recent reported quarter end).
  // Drives tile pulse animations + the focus-panel countdown.
  const [earningsMap, setEarningsMap] = useState<Map<string, EarningsBadge>>(
    () => new Map()
  )
  // Analyst consensus (forward EPS, price target, upgrade/downgrade tally).
  // Only symbols the estimates scheduler has already cached will come back.
  const [estimatesMap, setEstimatesMap] = useState<Map<string, AnalystEstimates>>(
    () => new Map()
  )
  // Auto-committed graph-edge + node overlays from the candidates pipeline.
  // Refreshes on every graph:updated broadcast.
  const [edgeOverrides, setEdgeOverrides] = useState<GraphEdgeOverride[]>([])
  const [nodeOverrides, setNodeOverrides] = useState<GraphNodeOverride[]>([])
  // Unified-graph sector state: drives the GICS tab strip + sector filter.
  const [sectorsWithContent, setSectorsWithContent] = useState<SectorWithContent[]>([])
  const [primaryIndex, setPrimaryIndex] = useState<Record<string, string>>({})
  // Recent SEC filings (last 72h) — powers the 📄 badge on tiles.
  const [recentFilingsMap, setRecentFilingsMap] = useState<Map<string, SecFiling[]>>(
    () => new Map()
  )

  // Single mount-bundle: pulls financials + earnings + estimates + sector
  // rollup + graph overrides + recent filings in one IPC round-trip.
  // Replaces six independent fetches that each rendered an empty map until
  // the slowest resolved. Incremental refreshes flow through the *:updated
  // listeners below.
  //
  // Symbol set is the UNION of three sources so every tile we'll render
  // actually has data:
  //   - Static CHAIN.nodes (the curated semi/hardware tech pipeline)
  //   - Active watchlist tickers (covers user-added symbols outside the
  //     static graph — previously these tiles rendered with blank
  //     financials, blank sparkline, blank earnings badge)
  //   - Persisted node overrides (auto-discovered tickers absorbed from
  //     other chains; we read these via window.api on first mount so they
  //     join the symbol list without waiting for the bundle to populate
  //     them in the second round)
  useEffect(() => {
    let cancelled = false
    const since = Date.now() - 72 * 60 * 60 * 1000
    const buildAndFetch = async (): Promise<void> => {
      const staticSymbols = CHAIN.nodes.map((n) => n.symbol.toUpperCase())
      const watchlistSymbols = tickers
        .filter((t) => t.isActive)
        .map((t) => t.symbol.toUpperCase())
      // Read node overrides ahead of the bundle so symbols absorbed from
      // generated chains are part of the initial fetch rather than waiting
      // for the bundle's own nodeOverrides slice to land and re-trigger.
      let overrideSymbols: string[] = []
      try {
        const overrides = await window.api.graph.listNodeOverrides()
        overrideSymbols = overrides.map((o) => o.symbol.toUpperCase())
      } catch {
        /* fall through with empty overrides — bundle will refresh them */
      }
      if (cancelled) return
      const symbols = [
        ...new Set([...staticSymbols, ...watchlistSymbols, ...overrideSymbols])
      ]
      try {
        const bundle = await window.api.stocks.getValueChainMountBundle(symbols, since)
        if (cancelled) return
        const fin = new Map<string, FinancialsSnapshot>()
        for (const s of bundle.financials) fin.set(s.symbol.toUpperCase(), s)
        setFinancialsMap(fin)
        const earn = new Map<string, EarningsBadge>()
        for (const b of bundle.earnings) earn.set(b.symbol.toUpperCase(), b)
        setEarningsMap(earn)
        const est = new Map<string, AnalystEstimates>()
        for (const r of bundle.estimates) est.set(r.symbol.toUpperCase(), r)
        setEstimatesMap(est)
        setEdgeOverrides(bundle.edgeOverrides)
        setNodeOverrides(bundle.nodeOverrides)
        setSectorsWithContent(bundle.sectorsWithContent)
        setPrimaryIndex(bundle.primaryIndex)
        const filings = new Map<string, SecFiling[]>()
        for (const sym of Object.keys(bundle.recentFilings)) {
          filings.set(sym.toUpperCase(), bundle.recentFilings[sym])
        }
        setRecentFilingsMap(filings)
      } catch (err) {
        console.warn('[valueChain] mount bundle fetch failed', err)
      }
    }
    void buildAndFetch()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    return window.api.stocks.onFinancialsUpdated((symbol) => {
      const sym = symbol.toUpperCase()
      window.api.stocks
        .getFinancials(sym)
        .then((snapshot) => {
          setFinancialsMap((prev) => {
            const next = new Map(prev)
            next.set(sym, snapshot)
            return next
          })
        })
        .catch(() => {
          /* swallow — no update just means stale data stays */
        })
    })
  }, [])
  useEffect(() => {
    return window.api.stocks.onEstimatesUpdated((symbol) => {
      const sym = symbol.toUpperCase()
      window.api.stocks
        .getEstimates(sym)
        .then((row) => {
          if (!row) return
          setEstimatesMap((prev) => {
            const next = new Map(prev)
            next.set(sym, row)
            return next
          })
        })
        .catch(() => {
          /* swallow — stale data stays */
        })
    })
  }, [])
  useEffect(() => {
    return window.api.graph.onUpdated(() => {
      // Refetch overrides + sector rollup. Chain generation absorbs new
      // nodes into overrides AND writes new ticker_sectors rows, so the
      // sector tab strip + filter need a fresh read to avoid the "leave
      // page and come back" behavior.
      Promise.all([
        window.api.graph.listOverrides(),
        window.api.graph.listNodeOverrides(),
        window.api.sectors.listWithContent(),
        window.api.sectors.primaryIndex()
      ])
        .then(([edges, nodes, withContent, idx]) => {
          setEdgeOverrides(edges)
          setNodeOverrides(nodes)
          setSectorsWithContent(withContent)
          setPrimaryIndex(idx)
        })
        .catch(() => {
          /* keep prior state */
        })
    })
  }, [])
  // Incremental backfill: when nodeOverrides changes (e.g. chain
  // absorption introduces a new ticker after mount), fetch financials +
  // earnings + estimates for any symbol now in the rendered set that
  // wasn't covered by the initial bundle. Without this, newly-absorbed
  // tiles would show blank financials until the page is reopened.
  useEffect(() => {
    if (nodeOverrides.length === 0) return
    const have = financialsMap
    const haveEarn = earningsMap
    const haveEst = estimatesMap
    const missing = new Set<string>()
    for (const o of nodeOverrides) {
      const sym = o.symbol.toUpperCase()
      if (!have.has(sym) || !haveEarn.has(sym) || !haveEst.has(sym)) {
        missing.add(sym)
      }
    }
    if (missing.size === 0) return
    const symbols = [...missing]
    let cancelled = false
    void Promise.all([
      window.api.stocks.getFinancialsBatch(symbols).catch(() => []),
      window.api.stocks.getEarningsBatch(symbols).catch(() => []),
      window.api.stocks.getEstimatesBatch(symbols).catch(() => [])
    ]).then(([fins, earns, ests]) => {
      if (cancelled) return
      if (fins.length > 0) {
        setFinancialsMap((prev) => {
          const next = new Map(prev)
          for (const f of fins) next.set(f.symbol.toUpperCase(), f)
          return next
        })
      }
      if (earns.length > 0) {
        setEarningsMap((prev) => {
          const next = new Map(prev)
          for (const b of earns) next.set(b.symbol.toUpperCase(), b)
          return next
        })
      }
      if (ests.length > 0) {
        setEstimatesMap((prev) => {
          const next = new Map(prev)
          for (const r of ests) next.set(r.symbol.toUpperCase(), r)
          return next
        })
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeOverrides])

  useEffect(() => {
    return window.api.sec.onUpdated((symbol) => {
      const sym = symbol.toUpperCase()
      const since = Date.now() - 72 * 60 * 60 * 1000
      window.api.sec
        .getFilings(sym, 10, true)
        .then((filings) => {
          const recent = filings.filter((f) => f.filedAt >= since)
          setRecentFilingsMap((prev) => {
            const next = new Map(prev)
            if (recent.length === 0) next.delete(sym)
            else next.set(sym, recent)
            return next
          })
        })
        .catch(() => {
          /* swallow — stale badge state is harmless */
        })
    })
  }, [])

  // Options snapshot for the focused ticker only. Fetching on hover keeps
  // us from making ~65 options calls at mount for tiles the user never
  // looks at. The 15-min in-memory cache in yahooFinanceService means
  // hopping between tiles inside that window is free.
  const [focusOptions, setFocusOptions] = useState<OptionsSnapshot | null>(null)
  useEffect(() => {
    if (!focusSymbol) {
      setFocusOptions(null)
      return
    }
    let cancelled = false
    window.api.stocks
      .getOptionsSnapshot(focusSymbol)
      .then((snap) => {
        if (!cancelled) setFocusOptions(snap)
      })
      .catch(() => {
        if (!cancelled) setFocusOptions(null)
      })
    return () => {
      cancelled = true
    }
  }, [focusSymbol])

  const tickerBySymbol = useMemo(() => {
    const m = new Map<string, Ticker>()
    for (const t of tickers) m.set(t.symbol.toUpperCase(), t)
    return m
  }, [tickers])

  // Generated/absorbed overlay nodes WIN over static graph nodes.
  // Static supplyChainGraph.json was the original baseline before chain
  // generation existed; it's now a fallback for symbols no chain has
  // covered yet. Once a chain regenerates and the absorber writes a
  // node override, the override's stage/sector/blurb take precedence —
  // the override is fresher and reflects the actual generated chain
  // rather than hand-curated 2024 hardware-pipeline taxonomy.
  const mergedNodes = useMemo<ValueChainNode[]>(() => {
    const out: ValueChainNode[] = []
    const seen = new Set<string>()
    // Override layer first: every override gets its own node entry, replacing
    // any baseline static node for the same symbol.
    for (const o of nodeOverrides) {
      const sym = o.symbol.toUpperCase()
      seen.add(sym)
      out.push({
        symbol: sym,
        stage: o.stage,
        sector: o.sector ?? 'other',
        name: o.name ?? undefined,
        blurb: o.blurb ?? undefined
      })
    }
    // Static fallback: only add static nodes for symbols no override
    // covers. Eventually the overrides will cover the entire static set
    // and CHAIN.nodes can be retired entirely.
    for (const n of CHAIN.nodes) {
      const sym = n.symbol.toUpperCase()
      if (seen.has(sym)) continue
      out.push(n)
    }
    return out
  }, [nodeOverrides])

  // Resolve a symbol's primary sector id using (in order): the backend
  // primaryIndex (ticker_sectors.isPrimary=1), a node override's sectorId,
  // or the legacy supplyChainGraph.json sector string via LEGACY_TO_SECTOR_ID.
  // Returns null when we genuinely don't know — such symbols still render in
  // the "all" view but can't be routed into a specific sector tab.
  const resolvedPrimarySector = useMemo(() => {
    const nodeOverrideBySym = new Map(nodeOverrides.map((o) => [o.symbol.toUpperCase(), o]))
    const out = new Map<string, string>()
    for (const node of mergedNodes) {
      const sym = node.symbol.toUpperCase()
      const fromIndex = primaryIndex[sym]
      if (fromIndex) {
        out.set(sym, fromIndex)
        continue
      }
      const ov = nodeOverrideBySym.get(sym)
      if (ov?.sectorId) {
        out.set(sym, ov.sectorId)
        continue
      }
      const legacy = LEGACY_TO_SECTOR_ID.get(node.sector)
      if (legacy) out.set(sym, legacy)
    }
    return out
  }, [mergedNodes, nodeOverrides, primaryIndex])

  // Filter the node set by the active sector tab. "all" passes everything;
  // for any specific sector, a node is kept iff its primary sector's
  // ancestor chain contains the selected tab id (so picking the top-level
  // "technology" tab shows tech-semi, tech-hardware, tech-cloud, etc.).
  const visibleSymbols = useMemo(() => {
    const s = new Set<string>()
    for (const node of mergedNodes) {
      if (sectorId === 'all') {
        s.add(node.symbol)
        continue
      }
      const primary = resolvedPrimarySector.get(node.symbol.toUpperCase())
      if (!primary) continue
      const ancestors = SECTOR_ANCESTORS.get(primary)
      if (ancestors?.has(sectorId)) s.add(node.symbol)
    }
    return s
  }, [sectorId, mergedNodes, resolvedPrimarySector])

  // Stage list for the current view.
  // - "all": curated supplyChainGraph tech pipeline PLUS every unique stage
  //   seen on absorbed nodes (financial stages like "credit-card-issuance",
  //   energy stages like "refining"). Without the merge, non-tech nodes
  //   fall into a single "Other" bucket — for a heavily-used app with
  //   chains across multiple sectors that bucket becomes a 40-tile blob.
  // - Specific sector: prefer the catalog's stage list; fall back to
  //   derived stages from visible nodes for sectors without curated stages.
  const activeStages = useMemo<ValueChainStage[]>(() => {
    if (sectorId === 'all') {
      const known = new Set<string>(CHAIN.stages.map((s) => s.id))
      const extras: ValueChainStage[] = []
      for (const node of mergedNodes) {
        if (!node.stage || known.has(node.stage)) continue
        known.add(node.stage)
        extras.push({ id: node.stage, label: humanizeStageId(node.stage) })
      }
      return [...CHAIN.stages, ...extras]
    }
    const catalogEntry = CATALOG.find((c) => c.id === sectorId)
    if (catalogEntry?.stages && catalogEntry.stages.length > 0) {
      return catalogEntry.stages.map((s) => ({ id: s.id, label: s.name }))
    }
    const seen = new Set<string>()
    const ordered: ValueChainStage[] = []
    for (const node of mergedNodes) {
      if (!visibleSymbols.has(node.symbol)) continue
      if (seen.has(node.stage)) continue
      seen.add(node.stage)
      ordered.push({
        id: node.stage,
        label: humanizeStageId(node.stage)
      })
    }
    return ordered
  }, [sectorId, mergedNodes, visibleSymbols])

  // Show every visible graph node, not just watchlist holdings — the point of
  // the chain is the ecosystem context, which is mostly suppliers/customers
  // the user doesn't necessarily hold. Non-watchlist nodes render as ghost
  // tiles (no quote, muted styling) but still participate in hover/connection
  // highlighting so the graph stays intelligible.
  const stageGroups = useMemo(() => {
    const bucket = new Map<string, ValueChainNode[]>()
    for (const stage of activeStages) bucket.set(stage.id, [])
    // Catch-all bucket for nodes whose stage isn't in activeStages — keeps
    // them visible under a generic "Other" group rather than silently
    // dropped. Only surfaces when a mismatch actually occurs.
    const strayNodes: ValueChainNode[] = []
    for (const node of mergedNodes) {
      if (!visibleSymbols.has(node.symbol)) continue
      const target = bucket.get(node.stage)
      if (target) target.push(node)
      else strayNodes.push(node)
    }
    const groups = activeStages
      .map((s) => ({ stage: s, nodes: bucket.get(s.id) ?? [] }))
      .filter((g) => g.nodes.length > 0)
    if (strayNodes.length > 0) {
      // These are nodes that participate in the current sector's chain but
      // carry a stage from a different chain's taxonomy (e.g., AMZN's
      // override stage = 'marketplace-storefront' from its retail-ecom
      // chain, rendered here under tech-cloud). Surface them with an
      // explicit label that tells the user what they're looking at —
      // "Other" is unhelpful noise.
      groups.push({
        stage: { id: '__cross_sector', label: 'Cross-sector participants' },
        nodes: strayNodes
      })
    }
    return groups
  }, [visibleSymbols, mergedNodes, activeStages])

  // Static graph edges + directional overlay edges (supplier/partner). The
  // overrides pipeline auto-classifies high-confidence ticker pairs into
  // supplier/customer/competitor/partner; directional kinds get threaded
  // through outgoing/incoming so they show up as customer/supplier roles
  // on the focus panel just like the static edges do.
  const mergedDirectionalEdges = useMemo<ValueChainEdge[]>(() => {
    // Absorber canonicalizes customer edges to supplier at write time
    // (swaps endpoints + relabels), so the override table holds one
    // canonical form per directed relationship. Legacy customer rows from
    // older absorptions are still handled with an endpoint swap as a
    // safety net. Dedupe by (from, to) at the end so cross-chain
    // duplicates don't render the same counterparty twice.
    const out: ValueChainEdge[] = [...CHAIN.edges]
    for (const o of edgeOverrides) {
      // Pull citations from override; fall back to legacy single-cite shape.
      const cites: CompanyValueChainEdgeCitation[] =
        o.citations && o.citations.length > 0
          ? o.citations
          : o.citation
            ? [o.citation]
            : []
      // Derive a coarse source category for the pill-tone fallback. The
      // override's `source` field is a comma-separated provenance list
      // ("chain_gen_AAPL,sec_10k_concentration") — pick the most specific
      // hint, with chain-cite kinds preferred when citations exist.
      const inferredSource: CompanyValueChainEdgeSource | null = cites[0]
        ? cites[0].kind === 'filing'
          ? 'filings'
          : cites[0].kind === 'article'
            ? 'news'
            : cites[0].kind === 'analyst'
              ? 'analyst'
              : cites[0].kind === 'profile'
                ? 'profile'
                : 'model'
        : null
      if (o.relationship === 'supplier' || o.relationship === 'partner') {
        out.push({
          from: o.fromSymbol.toUpperCase(),
          to: o.toSymbol.toUpperCase(),
          note: o.note ?? undefined,
          citations: cites,
          source: inferredSource
        })
      } else if (o.relationship === 'customer') {
        out.push({
          from: o.toSymbol.toUpperCase(),
          to: o.fromSymbol.toUpperCase(),
          note: o.note ?? undefined,
          citations: cites,
          source: inferredSource
        })
      }
    }
    const seen = new Set<string>()
    const deduped: ValueChainEdge[] = []
    for (const edge of out) {
      const key = `${edge.from}→${edge.to}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(edge)
    }
    return deduped
  }, [edgeOverrides])

  // Static competitor pairs + competitor-typed overrides. Same shape as the
  // module-level COMPETITOR_MAP built from supplyChainGraph.json's competitors
  // array — Map<symbol, Set<peer>>, symmetric.
  const mergedCompetitorMap = useMemo<Map<string, Set<string>>>(() => {
    const m = new Map<string, Set<string>>()
    for (const [k, v] of COMPETITOR_MAP) {
      m.set(k, new Set(v))
    }
    for (const o of edgeOverrides) {
      if (o.relationship !== 'competitor') continue
      const a = o.fromSymbol.toUpperCase()
      const b = o.toSymbol.toUpperCase()
      if (!m.has(a)) m.set(a, new Set())
      if (!m.has(b)) m.set(b, new Set())
      m.get(a)!.add(b)
      m.get(b)!.add(a)
    }
    return m
  }, [edgeOverrides])

  const { outgoing, incoming } = useMemo(() => {
    const out = new Map<string, ValueChainEdge[]>()
    const inc = new Map<string, ValueChainEdge[]>()
    for (const e of mergedDirectionalEdges) {
      if (!visibleSymbols.has(e.from) || !visibleSymbols.has(e.to)) continue
      if (!out.has(e.from)) out.set(e.from, [])
      out.get(e.from)!.push(e)
      if (!inc.has(e.to)) inc.set(e.to, [])
      inc.get(e.to)!.push(e)
    }
    return { outgoing: out, incoming: inc }
  }, [visibleSymbols, mergedDirectionalEdges])

  // Track not just "is this tile related" but "how" — so tile coloring can
  // mirror the Customers (emerald) / Suppliers (indigo) / Competitors (orange)
  // split in the focus panel. A tile can be both customer and supplier
  // (e.g. mutual supply) → render as 'both'. Competitor beats directional
  // roles when both apply (see comment on RelatedRole).
  const related = useMemo(() => {
    if (!focusSymbol) return null
    const m = new Map<string, RelatedRole>()
    m.set(focusSymbol, 'focus')
    for (const e of outgoing.get(focusSymbol) ?? []) {
      if (e.to !== focusSymbol) m.set(e.to, 'customer')
    }
    for (const e of incoming.get(focusSymbol) ?? []) {
      if (e.from === focusSymbol) continue
      const prev = m.get(e.from)
      m.set(e.from, prev === 'customer' ? 'both' : 'supplier')
    }
    for (const peer of mergedCompetitorMap.get(focusSymbol) ?? []) {
      if (!visibleSymbols.has(peer)) continue
      m.set(peer, 'competitor')
    }
    return m
  }, [focusSymbol, outgoing, incoming, visibleSymbols, mergedCompetitorMap])

  const focusCompetitors = useMemo(() => {
    if (!focusSymbol) return []
    const peers = mergedCompetitorMap.get(focusSymbol)
    if (!peers) return []
    return [...peers].filter((s) => visibleSymbols.has(s)).sort()
  }, [focusSymbol, visibleSymbols, mergedCompetitorMap])

  // Per-ticker generated chain for the currently-focused symbol. Only the
  // unverified nodes feed the focus panel — verified counterparties are
  // already in the unified graph via graph_*_overrides. Fetched lazily
  // on focus change and refreshed on company-chain-updated broadcasts so
  // regenerating a chain updates this panel without a view switch.
  const [focusChain, setFocusChain] = useState<CompanyValueChain | null>(null)
  useEffect(() => {
    if (!focusSymbol) {
      setFocusChain(null)
      return
    }
    let cancelled = false
    const sym = focusSymbol.toUpperCase()
    window.api.stocks
      .getCompanyChain(sym)
      .then((row) => {
        if (cancelled) return
        setFocusChain(row?.status === 'ready' ? row.graph : null)
      })
      .catch(() => {
        if (!cancelled) setFocusChain(null)
      })
    return () => {
      cancelled = true
    }
  }, [focusSymbol])
  useEffect(() => {
    return window.api.stocks.onCompanyChainUpdated((sym) => {
      if (!focusSymbol) return
      if (sym.toUpperCase() !== focusSymbol.toUpperCase()) return
      window.api.stocks
        .getCompanyChain(focusSymbol)
        .then((row) => setFocusChain(row?.status === 'ready' ? row.graph : null))
        .catch(() => {
          /* keep prior state */
        })
    })
  }, [focusSymbol])

  // User-flagged corrections for the focused ticker's chain. Drives both the
  // amber ring on corrected chips and the right-click menu's "Remove
  // correction" option. Refetches on focus change and on chainCorrections
  // broadcasts (so two windows or out-of-band IPC updates stay in sync).
  const [focusCorrections, setFocusCorrections] = useState<ChainCorrection[]>([])
  useEffect(() => {
    if (!focusSymbol) {
      setFocusCorrections([])
      return
    }
    let cancelled = false
    window.api.chainCorrections
      .list(focusSymbol)
      .then((rows) => {
        if (!cancelled) setFocusCorrections(rows)
      })
      .catch(() => {
        if (!cancelled) setFocusCorrections([])
      })
    return () => {
      cancelled = true
    }
  }, [focusSymbol])
  useEffect(() => {
    return window.api.chainCorrections.onUpdated((sym) => {
      if (!focusSymbol) return
      if (sym.toUpperCase() !== focusSymbol.toUpperCase()) return
      window.api.chainCorrections
        .list(focusSymbol)
        .then((rows) => setFocusCorrections(rows))
        .catch(() => {
          /* keep prior state */
        })
    })
  }, [focusSymbol])

  const correctedSymbolSet = useMemo(() => {
    const s = new Set<string>()
    for (const c of focusCorrections) s.add(c.subjectKey.toUpperCase())
    return s
  }, [focusCorrections])

  // Hidden-by-user list — chips removed from the chain via "not relevant".
  // Surfaced as a footer in the focus panel so the user can restore them
  // (the chips themselves are no longer visible in the suppliers/customers
  // clusters because applyCorrectionsToChain already filtered them out).
  const hiddenCorrections = useMemo(
    () => focusCorrections.filter((c) => c.correctionType === 'not-relevant'),
    [focusCorrections]
  )

  // Right-click menu position + target. null when the menu is closed.
  const [correctionMenu, setCorrectionMenu] = useState<{
    symbol: string
    category: Category
    x: number
    y: number
  } | null>(null)

  const openCorrectionMenu = (
    symbol: string,
    category: Category,
    x: number,
    y: number
  ): void => {
    setCorrectionMenu({ symbol, category, x, y })
  }

  const closeCorrectionMenu = (): void => setCorrectionMenu(null)

  // Refetch the focus's corrections list. Used by both correction handlers
  // to refresh state after a write — kept in a `finally` so a partial
  // failure on the write itself doesn't strand the UI on stale state.
  // We deliberately do NOT refetch the chain here: corrections are merged
  // into the displayed buckets locally (combinedSuppliers/Customers/
  // Competitors useMemo below), so the corrections list change alone
  // invalidates that memo without an extra IPC round-trip.
  const refetchCorrections = async (sym: string): Promise<void> => {
    try {
      const fresh = await window.api.chainCorrections.list(sym)
      setFocusCorrections(fresh)
    } catch {
      /* keep prior state */
    }
  }

  const handleCorrectionSelect = async (action: ChainCorrectionAction): Promise<void> => {
    if (!correctionMenu || !focusSymbol) return
    const { symbol } = correctionMenu
    try {
      if (action.type === 'remove') {
        // Remove ALL corrections for this subject — there's at most a few
        // and the UX intent of "Remove correction" is total reversion.
        // allSettled (not all) so a partial failure still lets the rest
        // through; we surface failures via console but never let a single
        // delete failure strand the UI.
        const targets = focusCorrections.filter(
          (c) => c.subjectKey.toUpperCase() === symbol.toUpperCase()
        )
        const results = await Promise.allSettled(
          targets.map((c) =>
            window.api.chainCorrections.delete({
              focusSymbol,
              subjectType: c.subjectType,
              subjectKey: c.subjectKey,
              correctionType: c.correctionType
            })
          )
        )
        for (const r of results) {
          if (r.status === 'rejected') {
            console.warn('[chainCorrection] partial remove failure:', r.reason)
          }
        }
      } else {
        await window.api.chainCorrections.upsert({
          focusSymbol,
          subjectType: 'counterparty',
          subjectKey: symbol,
          correctionType: action.type,
          correctedValue:
            action.type === 'wrong-direction'
              ? { direction: action.direction }
              : action.type === 'wrong-relationship'
                ? { relationship: action.relationship }
                : null
        })
      }
    } catch (err) {
      console.warn('[chainCorrection] failed to apply:', err)
    } finally {
      await refetchCorrections(focusSymbol)
    }
  }

  const restoreHidden = async (subjectKey: string): Promise<void> => {
    if (!focusSymbol) return
    try {
      await window.api.chainCorrections.delete({
        focusSymbol,
        subjectType: 'counterparty',
        subjectKey,
        correctionType: 'not-relevant'
      })
    } catch (err) {
      console.warn('[chainCorrection] restore failed:', err)
    } finally {
      await refetchCorrections(focusSymbol)
    }
  }

  const openDetail = (symbol: string): void => {
    const t = tickerBySymbol.get(symbol.toUpperCase())
    if (t) onOpenTicker(t.id)
  }

  const activateTicker = (symbol: string): void => {
    const t = tickerBySymbol.get(symbol.toUpperCase())
    if (t && !t.isActive) onActivateTicker(t.id)
  }

  const toggleLock = (symbol: string): void => {
    setLockedSymbol((prev) => (prev === symbol ? null : symbol))
    setHoverSymbol(symbol)
  }

  // Fires on every click; routes to single or double behaviour after the
  // discrimination window. A pending timer on the second click means we've
  // caught a double-click and should skip the single-click action entirely.
  // Double-click opens detail for any ticker with a DB row (graph-seeded
  // passive tickers qualify — they just ship with no news coverage).
  const handleTileClick = (symbol: string, hasTickerRow: boolean): void => {
    if (clickTimer.current !== null) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      if (hasTickerRow) openDetail(symbol)
      return
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      toggleLock(symbol)
    }, CLICK_DELAY_MS)
  }

  const focusEdgesOut = focusSymbol ? outgoing.get(focusSymbol) ?? [] : []
  const focusEdgesIn = focusSymbol ? incoming.get(focusSymbol) ?? [] : []
  const focusTicker = focusSymbol ? tickerBySymbol.get(focusSymbol.toUpperCase()) : null
  // Three chip states: watchlist (bold emerald), tracked (muted — live quote
  // but not in watchlist), unlinked (no ticker row at all — unusual).
  const focusHeldLabel = focusTicker?.isActive
    ? 'in watchlist'
    : focusTicker
      ? 'tracked'
      : 'not in watchlist'

  // Node-level metadata lookups for the details panel.
  const nodeBySymbol = useMemo(() => {
    const m = new Map<string, ValueChainNode>()
    // Index the unified node list (static + overrides), not just the static
    // curated graph. Without the overrides here, chain-absorbed tickers
    // (VALE, BP, COP, SHEL, …) hit `undefined` at lookup time, so
    // buildCounterparty returns them with empty stage and useStageGroups
    // filters them out as stageless — resulting in the "count is 2 but
    // list is empty" symptom on the focus panel.
    for (const n of mergedNodes) m.set(n.symbol.toUpperCase(), n)
    return m
  }, [mergedNodes])
  const stageLabelById = useMemo(() => {
    const m = new Map<string, string>()
    // Always include the curated supplyChainGraph stages so counterparty
    // rows for tech tickers get the full "Fabless Chip Design" style label
    // even when the current sector tab's active stage list doesn't include
    // that id. Active stages (catalog-driven or derived) layer on top so
    // sector-specific names win when they overlap.
    for (const s of CHAIN.stages) m.set(s.id, s.label)
    for (const s of activeStages) m.set(s.id, s.label)
    return m
  }, [activeStages])
  const focusNode = focusSymbol ? nodeBySymbol.get(focusSymbol) : null
  const focusStageLabel = focusNode ? stageLabelById.get(focusNode.stage) ?? focusNode.stage : ''
  const focusCompanyName = focusTicker?.companyName ?? focusSymbol ?? ''
  const focusBlurb = focusNode?.blurb ?? ''

  // Top-level GICS ancestor for the current focus. When a counterparty's
  // top-level differs from this, the relationship is cross-sector and gets
  // badged in the row. Unknown focus sector → no badging at all.
  const focusTopLevel = useMemo(() => {
    if (!focusSymbol) return null
    const primary = resolvedPrimarySector.get(focusSymbol.toUpperCase())
    if (!primary) return null
    const ancestors = SECTOR_ANCESTORS.get(primary)
    if (!ancestors) return null
    // Top-level = the ancestor whose parentId is null.
    for (const id of ancestors) {
      const entry = CATALOG.find((c) => c.id === id)
      if (entry && !entry.parentId) return entry.id
    }
    return null
  }, [focusSymbol, resolvedPrimarySector])

  // Display name lookup for the top-level-sector badge.
  const topLevelNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const top of TOP_LEVEL_SECTORS) m.set(top.id, top.name)
    return m
  }, [])

  // Reshape the focus panel's counterparties into the Counterparty structure
  // used by TransactionCluster so the panel body reads identically to the
  // stock-detail page's value-chain card. Stage sort lives inside the cluster.
  const buildCounterparty = (
    sym: string,
    note: string | null,
    citations?: CompanyValueChainEdgeCitation[],
    source?: CompanyValueChainEdgeSource | null
  ): Counterparty => {
    const n = nodeBySymbol.get(sym)
    const stage = n?.stage ?? ''
    // Cross-sector badge: show the counterparty's top-level sector name
    // when it differs from the focus's top-level. Both must be known for
    // the badge to render — we don't speculate.
    let crossSectorLabel: string | null = null
    if (focusTopLevel) {
      const primary = resolvedPrimarySector.get(sym.toUpperCase())
      if (primary) {
        const ancestors = SECTOR_ANCESTORS.get(primary)
        const top = ancestors
          ? [...ancestors].find((id) => {
              const entry = CATALOG.find((c) => c.id === id)
              return entry && !entry.parentId
            })
          : undefined
        if (top && top !== focusTopLevel) {
          crossSectorLabel = topLevelNameById.get(top) ?? null
        }
      }
    }
    return {
      symbol: sym,
      stage,
      stageLabel: stage ? stageLabelById.get(stage) ?? stage : '—',
      companyName: tickerBySymbol.get(sym.toUpperCase())?.companyName ?? n?.name ?? sym,
      note,
      crossSectorLabel,
      citations: citations && citations.length > 0 ? citations : undefined,
      source: source ?? null
    }
  }
  const customerItems = useMemo(
    () =>
      focusEdgesOut.map((e) =>
        buildCounterparty(e.to, e.note ?? null, e.citations, e.source ?? null)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusEdgesOut, nodeBySymbol, stageLabelById, tickerBySymbol]
  )
  const supplierItems = useMemo(
    () =>
      focusEdgesIn.map((e) =>
        buildCounterparty(e.from, e.note ?? null, e.citations, e.source ?? null)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusEdgesIn, nodeBySymbol, stageLabelById, tickerBySymbol]
  )
  const competitorItems = useMemo(
    () => focusCompetitors.map((sym) => buildCounterparty(sym, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusCompetitors, nodeBySymbol, stageLabelById, tickerBySymbol]
  )

  // Append unverified counterparties from the focus's per-ticker chain.
  // The absorber drops edges that touch unverified nodes (no tickers row
  // to link to) which leaves the unified-graph focus panel missing
  // relationships that are visibly present on the detail-page card. Pull
  // those edges from company_value_chains.graphJson, direction-translate
  // to focus perspective, and fold into the existing supplier / customer
  // / competitor arrays with `unverified: true` so the cluster renders
  // them as muted, non-interactive chips.
  const unverifiedExtras = useMemo(() => {
    const empty = { suppliers: [], customers: [], competitors: [] } as {
      suppliers: Counterparty[]
      customers: Counterparty[]
      competitors: Counterparty[]
    }
    if (!focusSymbol || !focusChain) return empty
    const focus = focusSymbol.toUpperCase()
    const unverifiedSymbols = new Map<string, { name: string; stage: string }>()
    for (const n of focusChain.nodes) {
      if (n.kind !== 'unverified') continue
      unverifiedSymbols.set(n.symbol.toUpperCase(), {
        name: n.name,
        stage: n.stage
      })
    }
    if (unverifiedSymbols.size === 0) return empty
    const make = (
      symbol: string,
      note: string | null,
      citations: CompanyValueChainEdgeCitation[] | undefined,
      source: CompanyValueChainEdgeSource | null
    ): Counterparty => {
      const meta = unverifiedSymbols.get(symbol)
      const stage = meta?.stage ?? ''
      return {
        symbol,
        stage,
        stageLabel: stage ? stageLabelById.get(stage) ?? stage : '—',
        companyName: meta?.name ?? symbol,
        note,
        unverified: true,
        citations: citations && citations.length > 0 ? citations : undefined,
        source
      }
    }
    const out = { suppliers: [] as Counterparty[], customers: [] as Counterparty[], competitors: [] as Counterparty[] }
    const seen = new Set<string>()
    const push = (
      bucket: keyof typeof out,
      sym: string,
      note: string | null,
      citations: CompanyValueChainEdgeCitation[] | undefined,
      source: CompanyValueChainEdgeSource | null
    ): void => {
      const k = `${bucket}:${sym}`
      if (seen.has(k)) return
      seen.add(k)
      out[bucket].push(make(sym, note, citations, source))
    }
    for (const e of focusChain.edges) {
      const from = e.from.toUpperCase()
      const to = e.to.toUpperCase()
      const other = from === focus ? to : from === to ? null : from
      // Exactly one side must be the focus; the other must be unverified.
      if (from !== focus && to !== focus) continue
      const counter = from === focus ? to : from
      if (!unverifiedSymbols.has(counter)) continue
      const rel = e.relationship
      // Forward the per-ticker chain's multi-cite array straight through.
      // Falls back to the legacy single-cite shape for chains generated
      // before multi-cite shipped.
      const cites: CompanyValueChainEdgeCitation[] | undefined =
        e.citations && e.citations.length > 0
          ? e.citations
          : e.citation
            ? [e.citation]
            : undefined
      const src: CompanyValueChainEdgeSource | null = e.source ?? null
      if (rel === 'competitor') {
        push('competitors', counter, e.note ?? null, cites, src)
        continue
      }
      if (rel === 'partner') {
        // Symmetric: fold into customers when focus is `from`, suppliers
        // otherwise — matches UnifiedValueChainCard's convention so the
        // two surfaces agree on where partners land.
        push(from === focus ? 'customers' : 'suppliers', counter, e.note ?? null, cites, src)
        continue
      }
      // supplier/customer: translate to focus perspective.
      // rel==='supplier' means `from` supplies `to`. If focus is `from`,
      // counter is buying from focus → customer. If focus is `to`,
      // counter supplies focus → supplier.
      if (rel === 'supplier') {
        push(from === focus ? 'customers' : 'suppliers', counter, e.note ?? null, cites, src)
      } else if (rel === 'customer') {
        // rel==='customer' means `from` buys from `to`. If focus is `from`,
        // counter supplies focus. If focus is `to`, counter is buying from
        // focus → customer.
        push(from === focus ? 'suppliers' : 'customers', counter, e.note ?? null, cites, src)
      }
      void other
    }
    return out
  }, [focusSymbol, focusChain, stageLabelById])

  // Merge unified-graph + unverified-chain buckets, then apply user
  // corrections at the renderer level. Most counterparty chips come from
  // the unified graph (overrides tables) which the main-side
  // applyCorrectionsToChain doesn't touch — so without this merge-time
  // correction pass, a "not relevant" verdict on a verified ticker chip
  // would persist to the DB but the chip would still render. Three
  // mutations apply here, mirroring the main-side semantics:
  //   - 'not-relevant' → drop from every bucket
  //   - 'wrong-direction' → move between supplier/customer
  //   - 'wrong-relationship' → move into the named bucket
  const { combinedCustomers, combinedSuppliers, combinedCompetitors } = useMemo(() => {
    const rawCustomers = [...customerItems, ...unverifiedExtras.customers]
    const rawSuppliers = [...supplierItems, ...unverifiedExtras.suppliers]
    const rawCompetitors = [...competitorItems, ...unverifiedExtras.competitors]

    if (focusCorrections.length === 0) {
      return {
        combinedCustomers: rawCustomers,
        combinedSuppliers: rawSuppliers,
        combinedCompetitors: rawCompetitors
      }
    }

    const dropped = new Set<string>()
    const moveTo = new Map<string, 'supplier' | 'customer' | 'competitor' | 'partner'>()
    for (const c of focusCorrections) {
      if (c.subjectType !== 'counterparty') continue
      const key = c.subjectKey.toUpperCase()
      if (c.correctionType === 'not-relevant') {
        dropped.add(key)
      } else if (c.correctionType === 'wrong-direction' && c.correctedValue?.direction) {
        moveTo.set(key, c.correctedValue.direction)
      } else if (
        c.correctionType === 'wrong-relationship' &&
        c.correctedValue?.relationship
      ) {
        moveTo.set(key, c.correctedValue.relationship)
      }
    }

    const filterAndExtract = (
      arr: Counterparty[]
    ): { kept: Counterparty[]; moved: Counterparty[] } => {
      const kept: Counterparty[] = []
      const moved: Counterparty[] = []
      for (const item of arr) {
        const k = item.symbol.toUpperCase()
        if (dropped.has(k)) continue
        if (moveTo.has(k)) {
          moved.push(item)
          continue
        }
        kept.push(item)
      }
      return { kept, moved }
    }

    const sup = filterAndExtract(rawSuppliers)
    const cus = filterAndExtract(rawCustomers)
    const com = filterAndExtract(rawCompetitors)

    // Reinsert moved chips into the bucket the user picked. Partner folds
    // into customers (mirrors the unverifiedExtras convention above so the
    // two surfaces agree on partner placement). Dedupe by symbol since the
    // same chip may appear in both graph + chain sources.
    const reinsertBuckets: Record<
      'supplier' | 'customer' | 'competitor',
      Counterparty[]
    > = {
      supplier: sup.kept,
      customer: cus.kept,
      competitor: com.kept
    }
    const seen: Record<string, Set<string>> = {
      supplier: new Set(sup.kept.map((x) => x.symbol.toUpperCase())),
      customer: new Set(cus.kept.map((x) => x.symbol.toUpperCase())),
      competitor: new Set(com.kept.map((x) => x.symbol.toUpperCase()))
    }
    for (const item of [...sup.moved, ...cus.moved, ...com.moved]) {
      const target = moveTo.get(item.symbol.toUpperCase())
      if (!target) continue
      const bucket = target === 'partner' ? 'customer' : target
      if (seen[bucket].has(item.symbol.toUpperCase())) continue
      seen[bucket].add(item.symbol.toUpperCase())
      reinsertBuckets[bucket].push(item)
    }

    return {
      combinedCustomers: reinsertBuckets.customer,
      combinedSuppliers: reinsertBuckets.supplier,
      combinedCompetitors: reinsertBuckets.competitor
    }
  }, [
    customerItems,
    supplierItems,
    competitorItems,
    unverifiedExtras.customers,
    unverifiedExtras.suppliers,
    unverifiedExtras.competitors,
    focusCorrections
  ])
  const presentCategories: Category[] = []
  if (combinedSuppliers.length > 0) presentCategories.push('supplier')
  if (combinedCompetitors.length > 0) presentCategories.push('competitor')
  if (combinedCustomers.length > 0) presentCategories.push('customer')
  const { boxShadow: focusBoxShadow, glowBackground: focusGlow } = categoryGlow(presentCategories)

  return (
    <div className="px-6 pt-2 pb-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-400/90 mb-1.5">
            Value chain
          </div>
          <p className="text-[12px] text-zinc-400 max-w-[560px] leading-relaxed">
            Hover to preview, click to pin the panel, double-click any ticker
            to open its detail view.
          </p>
        </div>
        {lockedSymbol && (
          <button
            onClick={() => {
              setLockedSymbol(null)
              setHoverSymbol(null)
            }}
            className="px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
          >
            Unpin · {lockedSymbol}
          </button>
        )}
      </div>

      {(() => {
        // Two-row tab strip. Row 1 shows top-level GICS sectors with any
        // content in their subtree ("Financials", "Technology"). Row 2 —
        // only when a top-level is in context — shows that top-level's
        // sub-sectors that hold direct tickers as pill chips under the
        // row above ("Payments", "Banking" under Financials). Clicking a
        // sub chip narrows the filter to that sub-sector; the chip row
        // itself signals parent/child hierarchy visually rather than
        // putting Payments next to Financials as a sibling.
        const withCount = new Map(sectorsWithContent.map((s) => [s.id, s]))
        // Resolve the top-level ancestor of the currently-selected sector.
        // For 'all', no top-level context. For a top-level id, it's itself.
        // For a sub-sector, walk up.
        let currentTopLevelId: string | null = null
        if (sectorId !== 'all') {
          const ancestors = SECTOR_ANCESTORS.get(sectorId)
          if (ancestors) {
            for (const id of ancestors) {
              const entry = CATALOG.find((c) => c.id === id)
              if (entry && !entry.parentId) {
                currentTopLevelId = entry.id
                break
              }
            }
          }
        }
        const subSectors = currentTopLevelId
          ? CATALOG.filter(
              (entry) =>
                entry.parentId === currentTopLevelId &&
                (withCount.get(entry.id)?.tickerCount ?? 0) > 0
            )
          : []

        return (
          <>
            <div className="flex items-center gap-1 mb-2 rounded-full bg-surface-1 ring-1 ring-edge/60 p-0.5 w-fit flex-wrap">
              <SectorTab
                label="All"
                active={sectorId === 'all'}
                onClick={() => {
                  setSectorId('all')
                  setHoverSymbol(null)
                  setLockedSymbol(null)
                }}
              />
              {TOP_LEVEL_SECTORS.filter(
                (top) => (withCount.get(top.id)?.descendantTickerCount ?? 0) > 0
              ).map((top) => (
                <SectorTab
                  key={top.id}
                  label={top.name}
                  active={
                    sectorId === top.id ||
                    (currentTopLevelId === top.id && sectorId !== 'all')
                  }
                  onClick={() => {
                    setSectorId(top.id)
                    setHoverSymbol(null)
                    setLockedSymbol(null)
                  }}
                />
              ))}
            </div>
            {subSectors.length > 0 && (
              <div className="flex items-center gap-1.5 mb-4 ml-3 flex-wrap">
                <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-600 mr-1">
                  ↳
                </span>
                <SubSectorChip
                  label={`All of ${
                    TOP_LEVEL_SECTORS.find((t) => t.id === currentTopLevelId)?.name ?? ''
                  }`}
                  active={sectorId === currentTopLevelId}
                  onClick={() => {
                    if (!currentTopLevelId) return
                    setSectorId(currentTopLevelId)
                    setHoverSymbol(null)
                    setLockedSymbol(null)
                  }}
                />
                {subSectors.map((sub) => (
                  <SubSectorChip
                    key={sub.id}
                    label={sub.name}
                    active={sectorId === sub.id}
                    onClick={() => {
                      setSectorId(sub.id)
                      setHoverSymbol(null)
                      setLockedSymbol(null)
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )
      })()}

      {/* Fixed height so the panel never resizes when switching between
          tickers with different numbers of edges. Inner grid scrolls if a
          heavily-connected node's lists exceed the visible box. */}
      <aside className="sticky top-0 z-20 -mx-6 px-6 pt-1 pb-3 mb-4 bg-surface-0 border-b border-edge/40">
        <div
          className="rounded-xl border border-edge bg-gradient-to-br from-surface-1 to-surface-0 h-[240px] overflow-hidden flex flex-col relative"
          style={focusSymbol && presentCategories.length > 0 ? { boxShadow: focusBoxShadow } : undefined}
        >
          {focusSymbol && presentCategories.length > 0 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: focusGlow }}
            />
          )}
          {focusSymbol ? (
            <>
              <header className="relative px-4 pt-3 pb-3 border-b border-edge/40">
                <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
                  <span className="text-[15px] font-bold tracking-[0.04em] text-zinc-50">
                    {focusSymbol}
                  </span>
                  <span className="text-[12px] text-zinc-400 truncate">
                    {focusCompanyName}
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full bg-zinc-800/70 text-zinc-300">
                    {focusStageLabel}
                  </span>
                  <span
                    className={`text-[9px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full ${
                      focusTicker?.isActive
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30'
                        : focusTicker
                          ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/30'
                          : 'bg-zinc-800/50 text-zinc-500'
                    }`}
                  >
                    {focusHeldLabel}
                  </span>
                  <FocusEarningsPill earnings={earningsMap.get(focusSymbol!)} />
                  <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-zinc-500 shrink-0">
                    {focusEdgesOut.length + focusEdgesIn.length} links
                  </span>
                  {lockedSymbol === focusSymbol && focusTicker && (
                    <>
                      <button
                        onClick={() => openDetail(focusSymbol!)}
                        className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25"
                      >
                        Open detail →
                      </button>
                      <button
                        onClick={() => setDiagramSymbol(focusSymbol!)}
                        className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-200 ring-1 ring-inset ring-purple-500/40 hover:bg-purple-500/25"
                      >
                        View diagram
                      </button>
                      {focusCompetitors.length > 0 && (
                        <button
                          onClick={() => setPeerCompareSymbol(focusSymbol!)}
                          className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-200 ring-1 ring-inset ring-orange-500/40 hover:bg-orange-500/25"
                          title={`Compare ${focusSymbol} against ${focusCompetitors.length} competitor${focusCompetitors.length === 1 ? '' : 's'}`}
                        >
                          Compare peers
                        </button>
                      )}
                      {focusTicker.isActive ? (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40"
                          title="In your watchlist"
                        >
                          ✓ Watchlist
                        </span>
                      ) : (
                        <button
                          onClick={() => activateTicker(focusSymbol!)}
                          className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25"
                        >
                          + Watchlist
                        </button>
                      )}
                    </>
                  )}
                </div>
                <p className="text-[11.5px] text-zinc-400 leading-snug line-clamp-2">
                  {focusBlurb || (
                    <span className="text-zinc-600">No description available.</span>
                  )}
                </p>
                <FocusCashflowStrip
                  financials={financialsMap.get(focusSymbol!)}
                  earnings={earningsMap.get(focusSymbol!)}
                />
                <FocusAnalystStrip
                  estimates={estimatesMap.get(focusSymbol!)}
                  currentPrice={(() => {
                    const q = quoteBySymbol.get(focusSymbol!)
                    return q ? resolveDisplayQuote(q).price : null
                  })()}
                />
                <FocusOptionsStrip
                  options={focusOptions}
                  earnings={earningsMap.get(focusSymbol!)}
                />
              </header>
              <div
                className={`relative flex-1 grid grid-cols-1 gap-4 px-4 py-3 overflow-y-auto ${
                  presentCategories.length === 3
                    ? 'md:grid-cols-3'
                    : presentCategories.length === 2
                      ? 'md:grid-cols-2'
                      : ''
                }`}
              >
                <TransactionCluster
                  category="supplier"
                  items={combinedSuppliers}
                  onPick={toggleLock}
                  onHover={focusTile}
                  onLeave={scheduleClear}
                  onContextMenu={(sym, x, y) => openCorrectionMenu(sym, 'supplier', x, y)}
                  correctedSymbols={correctedSymbolSet}
                  onOpenCitation={onOpenURL}
                />
                <TransactionCluster
                  category="competitor"
                  items={combinedCompetitors}
                  onPick={toggleLock}
                  onHover={focusTile}
                  onLeave={scheduleClear}
                  onContextMenu={(sym, x, y) => openCorrectionMenu(sym, 'competitor', x, y)}
                  correctedSymbols={correctedSymbolSet}
                  onOpenCitation={onOpenURL}
                />
                <TransactionCluster
                  category="customer"
                  items={combinedCustomers}
                  onPick={toggleLock}
                  onHover={focusTile}
                  onLeave={scheduleClear}
                  onContextMenu={(sym, x, y) => openCorrectionMenu(sym, 'customer', x, y)}
                  correctedSymbols={correctedSymbolSet}
                  onOpenCitation={onOpenURL}
                />
              </div>
              {hiddenCorrections.length > 0 && (
                <div className="px-4 py-2 border-t border-edge/40 bg-surface-1/40">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-amber-400">
                      Hidden by you
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      · {hiddenCorrections.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {hiddenCorrections.map((c) => (
                      <button
                        key={c.subjectKey}
                        type="button"
                        onClick={() => void restoreHidden(c.subjectKey)}
                        title={`Restore ${c.subjectKey} to the chain`}
                        className="inline-flex items-center gap-1 px-2 py-[3px] rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 text-amber-200 text-[10.5px] tabular-nums hover:bg-amber-500/15 transition-colors"
                      >
                        <span>{c.subjectKey}</span>
                        <span className="text-amber-400/70">×</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[11px] uppercase tracking-[0.2em] text-zinc-600">
              Hover or click a ticker to see its connections
            </div>
          )}
        </div>
      </aside>

      {stageGroups.length === 0 && (
        <div className="rounded-xl border border-dashed border-edge/60 px-6 py-10 text-center text-[12px] text-zinc-500">
          No nodes in this sector.
        </div>
      )}

      <div className="space-y-3">
        {stageGroups.map(({ stage, nodes }, idx) => (
          <div key={stage.id} className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500 w-[200px] shrink-0 whitespace-nowrap">
                {String(idx + 1).padStart(2, '0')} · {stage.label}
              </div>
              <span className="h-px flex-1 bg-edge/60" />
              <span className="text-[10px] tabular-nums text-zinc-600">
                {nodes.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {nodes.map((n) => {
                const t = tickerBySymbol.get(n.symbol.toUpperCase())
                const q = quoteBySymbol.get(n.symbol.toUpperCase())
                const fin = financialsMap.get(n.symbol.toUpperCase())
                const earnings = earningsMap.get(n.symbol.toUpperCase())
                const recentFilings = recentFilingsMap.get(n.symbol.toUpperCase())
                const hasTickerRow = !!t
                const inWatchlist = !!t && t.isActive
                const role = related?.get(n.symbol) ?? null
                const dim = related ? role === null : false
                const isFocus = focusSymbol === n.symbol
                const isLocked = lockedSymbol === n.symbol
                const upperSym = n.symbol.toUpperCase()
                return (
                  <div
                    key={n.symbol}
                    ref={(el) => {
                      // Register the outer wrapper so external-focus scroll
                      // requests can find it. ValueChainTile itself stays
                      // ref-free — the wrapper is enough for scrollIntoView
                      // and keeps the inner component refactor-light.
                      if (el) tileRefs.current.set(upperSym, el)
                      else tileRefs.current.delete(upperSym)
                    }}
                  >
                    <ValueChainTile
                      symbol={n.symbol}
                      companyName={t?.companyName ?? n.name ?? n.symbol}
                      quote={q}
                      financials={fin}
                      earnings={earnings}
                      recentFilings={recentFilings}
                      hasTickerRow={hasTickerRow}
                      inWatchlist={inWatchlist}
                      focus={isFocus}
                      locked={isLocked}
                      role={isFocus ? null : role}
                      dim={dim}
                      onHover={() => focusTile(n.symbol)}
                      onLeave={scheduleClear}
                      onClick={() => handleTileClick(n.symbol, hasTickerRow)}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {diagramSymbol && (
        <ValueChainDiagram
          initialSymbol={diagramSymbol}
          tickers={tickers}
          quotes={quotes}
          onClose={() => setDiagramSymbol(null)}
          onOpenTicker={(id) => {
            setDiagramSymbol(null)
            onOpenTicker(id)
          }}
          onActivateTicker={onActivateTicker}
          onOpenURL={onOpenURL}
        />
      )}

      {peerCompareSymbol && (
        <PeerCompareModal
          focusSymbol={peerCompareSymbol}
          peers={[...(mergedCompetitorMap.get(peerCompareSymbol) ?? [])].sort()}
          tickerBySymbol={tickerBySymbol}
          quoteBySymbol={quoteBySymbol}
          financialsBySymbol={financialsMap}
          earningsBySymbol={earningsMap}
          estimatesBySymbol={estimatesMap}
          onClose={() => setPeerCompareSymbol(null)}
          onOpenTicker={(id) => {
            setPeerCompareSymbol(null)
            onOpenTicker(id)
          }}
          onActivateTicker={onActivateTicker}
        />
      )}

      {correctionMenu && (
        <ChainCorrectionMenu
          x={correctionMenu.x}
          y={correctionMenu.y}
          symbol={correctionMenu.symbol}
          currentCategory={correctionMenu.category}
          hasExistingCorrection={correctedSymbolSet.has(
            correctionMenu.symbol.toUpperCase()
          )}
          onSelect={(action) => void handleCorrectionSelect(action)}
          onClose={closeCorrectionMenu}
        />
      )}
    </div>
  )
}

function SectorTab({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${
        active
          ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-500/40'
          : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  )
}

// Sub-sector chip used under an active top-level tab. Smaller footprint
// than SectorTab and uses a subtler emerald to preserve the parent-child
// visual relationship (parent tab is the dominant accent, children are
// supporting chips).
function SubSectorChip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-[3px] rounded-full text-[9px] font-semibold uppercase tracking-[0.18em] transition-colors ring-1 ring-inset ${
        active
          ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30'
          : 'bg-surface-1 text-zinc-500 ring-edge/60 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  )
}

function ValueChainTile({
  symbol,
  companyName,
  quote,
  financials,
  earnings,
  recentFilings,
  hasTickerRow,
  inWatchlist,
  focus,
  locked,
  role,
  dim,
  onHover,
  onLeave,
  onClick
}: {
  symbol: string
  companyName: string
  quote: StockQuote | undefined
  financials: FinancialsSnapshot | undefined
  earnings: EarningsBadge | undefined
  recentFilings: SecFiling[] | undefined
  hasTickerRow: boolean
  inWatchlist: boolean
  focus: boolean
  locked: boolean
  role: RelatedRole | null
  dim: boolean
  onHover: () => void
  onLeave: () => void
  onClick: () => void
}): JSX.Element {
  // Route through resolveDisplayQuote so the tile shows the live session's
  // price — post-market during 4-8pm ET, pre-market during 4-9:30am ET,
  // regular close otherwise.
  const rq = quote ? resolveDisplayQuote(quote) : null
  const change = rq?.change ?? null
  const changePct = rq?.changePct ?? null
  const displayPrice = rq?.price ?? null
  const sessionBadge = rq?.sessionBadge ?? null
  const up = (change ?? 0) > 0
  const down = (change ?? 0) < 0
  const color = up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-zinc-500'
  // Tracked-but-not-in-watchlist tiles show the same quote info but with a
  // visibly quieter symbol treatment, so the eye still reads "this is not in
  // my watchlist" at a glance.
  const symbolColor = inWatchlist ? 'text-zinc-50' : hasTickerRow ? 'text-zinc-200' : 'text-zinc-400'

  const base =
    'group relative rounded-lg border px-3 py-2 min-w-[120px] text-left transition-colors duration-100'
  // Tone precedence: locked > focus (hover) > role-based highlight > default.
  // Locked gets a brighter ring so a pinned tile reads as "held" and not
  // just "hovered". Role tones mirror the focus-panel split: emerald for
  // customers (revenue flowing in), indigo for suppliers (inputs/deps),
  // emerald-indigo dashed for both-directions relationships.
  let tone: string
  if (locked) {
    tone = 'border-emerald-300 bg-emerald-500/20 shadow-[0_0_0_2px_rgba(16,185,129,0.65)]'
  } else if (focus) {
    tone = 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_0_2px_rgba(16,185,129,0.45)]'
  } else if (role === 'customer') {
    tone = 'border-emerald-400/80 bg-emerald-500/[0.08] shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
  } else if (role === 'supplier') {
    tone = 'border-indigo-400/80 bg-indigo-500/[0.08] shadow-[0_0_0_1px_rgba(99,102,241,0.35)]'
  } else if (role === 'both') {
    tone = 'border-emerald-400/70 bg-indigo-500/[0.06] shadow-[0_0_0_1px_rgba(99,102,241,0.35)]'
  } else if (role === 'competitor') {
    tone = 'border-orange-400/80 bg-orange-500/[0.08] shadow-[0_0_0_1px_rgba(249,115,22,0.35)]'
  } else if (inWatchlist) {
    tone = 'border-edge/70 bg-surface-1 hover:border-edge'
  } else if (hasTickerRow) {
    tone = 'border-edge/50 bg-surface-0 hover:border-edge/80'
  } else {
    tone = 'border-dashed border-edge/50 bg-surface-0 hover:border-edge/70'
  }
  // opacity-25 on top of ghost-tile styling (dark bg + faint border) made the
  // tiles effectively invisible, so whole stage rows read as empty when the
  // user focused a ticker unrelated to that stage. 40% keeps the "not in
  // current subgraph" cue without swallowing the tile.
  const opacity = dim ? 'opacity-40' : ''
  // Earnings pulse overlay — amber halo outside the tile when earnings are
  // within the watch window, sky-blue afterglow for ~2-6 weeks after a
  // recent quarter end. Suppressed on dimmed tiles to avoid noise when the
  // user is focused on a specific subgraph.
  const pulse = dim ? null : pulseClass(pulsePhase(earnings))

  return (
    <button
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      onClick={onClick}
      className={`${base} ${tone} ${opacity} ${pulse ?? ''} cursor-pointer`}
      title={companyName}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <span className={`text-[13px] font-bold tracking-[0.04em] ${symbolColor}`}>{symbol}</span>
          {sessionBadge && (
            <span className="shrink-0 text-[8.5px] font-semibold uppercase tracking-[0.1em] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40">
              {sessionBadge}
            </span>
          )}
          {recentFilings && recentFilings.length > 0 && (
            <FilingBadge filings={recentFilings} />
          )}
        </div>
        {hasTickerRow ? (
          <span className={`text-[10px] font-semibold tabular-nums ${color}`}>
            {changePct !== null
              ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`
              : '—'}
          </span>
        ) : (
          <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-600">ext</span>
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-[10px] text-zinc-500 truncate max-w-[140px]">
          {companyName}
        </span>
        {hasTickerRow && (
          <span
            className={`text-[11px] tabular-nums shrink-0 ${inWatchlist ? 'text-zinc-300' : 'text-zinc-500'}`}
          >
            {displayPrice !== null ? displayPrice.toFixed(2) : '—'}
          </span>
        )}
      </div>
      <TileCashflowRow financials={financials} />
    </button>
  )
}

// Earnings countdown / afterglow pill in the focus-panel header. Colors
// match the tile pulse classes so the two visual signals read as a pair:
// amber when the date is coming up (matches the tile's amber halo), sky
// when the quarter just closed (matches the afterglow). Returns null when
// there's nothing newsworthy to show.
function FocusEarningsPill({
  earnings
}: {
  earnings: EarningsBadge | undefined
}): JSX.Element | null {
  const label = countdownLabel(earnings)
  if (!label) return null
  const phase = pulsePhase(earnings)
  const tone =
    phase === 'imminent'
      ? 'bg-amber-400/20 text-amber-200 ring-1 ring-inset ring-amber-400/50'
      : phase === 'warning'
        ? 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/35'
        : phase === 'ambient'
          ? 'bg-amber-600/10 text-amber-300/80 ring-1 ring-inset ring-amber-600/25'
          : phase === 'reported'
            ? 'bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/30'
            : 'bg-zinc-800/60 text-zinc-400'
  return (
    <span className={`text-[9px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full ${tone}`}>
      {label}
    </span>
  )
}

// Full KPI strip rendered in the focus panel header when a tile is
// hovered/locked. This is the denser cousin of TileCashflowRow — it surfaces
// every metric (TTM revenue / FCF / margin + QoQ and YoY deltas) in a single
// horizontal row so users scanning a sector can compare focus-to-focus by
// hovering across tiles. Renders nothing when the backing snapshot is
// missing or has no usable fields.
function FocusCashflowStrip({
  financials,
  earnings
}: {
  financials: FinancialsSnapshot | undefined
  earnings: EarningsBadge | undefined
}): JSX.Element | null {
  const hasFinancials = !!financials
  const hasHistory = !!earnings && earnings.history.length > 0
  if (!hasFinancials && !hasHistory) return null
  const revenue = formatMoneyCompact(financials?.ttm.revenue ?? null)
  const fcf = formatMoneyCompact(financials?.ttm.freeCashFlow ?? null)
  const margin = formatPctValue(financials?.ttm.fcfMargin ?? null)
  const qoq = formatPctDelta(financials?.qoq.revenue ?? null)
  const yoy = formatPctDelta(financials?.yoy.revenue ?? null)
  const marginTone = fcfMarginTone(financials?.ttm.fcfMargin ?? null)
  const qoqTone = deltaTone(financials?.qoq.revenue ?? null)
  const yoyTone = deltaTone(financials?.yoy.revenue ?? null)
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] tabular-nums">
      {hasFinancials && (
        <>
          <KPI label="Revenue TTM" value={revenue} valueClass="text-zinc-200" />
          <KPI label="FCF TTM" value={fcf} valueClass="text-zinc-200" />
          <KPI
            label="FCF margin"
            value={margin}
            valueClass={marginTone.color}
            dotClass={marginTone.dot}
          />
          <KPI label="Rev QoQ" value={qoq} valueClass={qoqTone} />
          <KPI label="Rev YoY" value={yoy} valueClass={yoyTone} />
        </>
      )}
      <div className="ml-auto flex items-center gap-3">
        {hasHistory && <EarningsBeatMiss history={earnings!.history} variant="strip" />}
        {hasFinancials && (
          <div
            className="flex items-center gap-1.5"
            title="Quarterly FCF (oldest → newest, up to 8 quarters)"
          >
            <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
              QTR FCF
            </span>
            <FcfSparkline financials={financials} variant="strip" />
          </div>
        )}
      </div>
    </div>
  )
}

// Recent-filing badge that sits next to the ticker symbol on the tile. The
// count chip reads "2 filings in the last 72h"; the glyph is a tiny document
// icon so the badge scans as "something landed here" without taking up
// horizontal space. Title hover exposes the form types so users can tell an
// 8-K/earnings release from a routine Form 4 at a glance.
function FilingBadge({ filings }: { filings: SecFiling[] }): JSX.Element {
  const title = filings
    .slice(0, 6)
    .map((f) => {
      const d = new Date(f.filedAt).toISOString().slice(0, 10)
      return `${d} · ${f.formType}${f.items ? ` (${f.items})` : ''}`
    })
    .join('\n')
  const label = filings.length > 1 ? `${filings.length}` : null
  // 8-K is the spicy one — anything else (Form 4 insider txns, proxy, etc.)
  // gets a quieter zinc treatment.
  const has8K = filings.some((f) => f.formType.startsWith('8-K'))
  const tone = has8K
    ? 'bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-500/40'
    : 'bg-zinc-700/60 text-zinc-300 ring-1 ring-inset ring-zinc-600/60'
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] px-1 py-0.5 rounded ${tone}`}
      title={`Filed in last 72h\n${title}`}
    >
      <span aria-hidden>§</span>
      {label}
    </span>
  )
}

function deltaTone(ratio: number | null): string {
  if (ratio === null) return 'text-zinc-500'
  if (ratio > 0) return 'text-emerald-300'
  if (ratio < 0) return 'text-red-300'
  return 'text-zinc-300'
}

// Analyst consensus row for the focus panel: forward EPS estimate (next Q),
// price target with % upside, analyst coverage count, and a 30d net-upgrade
// tally. Renders nothing when the backing row is missing — the scheduler
// populates estimates weekly, so non-watchlist graph nodes commonly have
// no entry yet.
function FocusAnalystStrip({
  estimates,
  currentPrice
}: {
  estimates: AnalystEstimates | undefined
  currentPrice: number | null
}): JSX.Element | null {
  if (!estimates) return null
  const nextQ = estimates.nextQuarter?.avg ?? null
  const targetMean = estimates.targetMean
  const upside =
    targetMean !== null && currentPrice !== null && currentPrice > 0
      ? (targetMean - currentPrice) / currentPrice
      : null
  const netUpgrades = estimates.upgradesLast30d - estimates.downgradesLast30d
  const recLabel = recommendationLabel(estimates.recommendationKey, estimates.recommendationMean)
  const hasAny =
    nextQ !== null ||
    targetMean !== null ||
    estimates.analystCount !== null ||
    netUpgrades !== 0 ||
    recLabel !== null
  if (!hasAny) return null

  const upsideTone = deltaTone(upside)
  const upgradeTone =
    netUpgrades > 0 ? 'text-emerald-300' : netUpgrades < 0 ? 'text-red-300' : 'text-zinc-400'
  const targetLabel =
    targetMean !== null
      ? `$${targetMean.toFixed(2)}${upside !== null ? ` (${upside >= 0 ? '+' : ''}${(upside * 100).toFixed(1)}%)` : ''}`
      : null
  const nextQLabel = nextQ !== null ? `$${nextQ.toFixed(2)}` : null
  const coverage =
    estimates.analystCount !== null
      ? `${estimates.analystCount} analyst${estimates.analystCount === 1 ? '' : 's'}`
      : null
  const upgradeLabel =
    netUpgrades !== 0
      ? `${netUpgrades > 0 ? '+' : ''}${netUpgrades} 30d`
      : null

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] tabular-nums">
      <KPI label="Next Q est" value={nextQLabel} valueClass="text-zinc-200" />
      <KPI
        label="Price target"
        value={targetLabel}
        valueClass={upside === null ? 'text-zinc-200' : upsideTone}
      />
      {coverage && <KPI label="Coverage" value={coverage} valueClass="text-zinc-400" />}
      {recLabel && <KPI label="Consensus" value={recLabel.label} valueClass={recLabel.color} />}
      {upgradeLabel && (
        <KPI label="Revisions" value={upgradeLabel} valueClass={upgradeTone} />
      )}
    </div>
  )
}

// Yahoo's recommendationMean is 1.0..5.0 where 1=Strong Buy and 5=Strong Sell.
// Map it to a readable label + color tone. Prefer the numeric mean because
// recommendationKey is often "none" even when there's usable data.
function recommendationLabel(
  key: string | null,
  mean: number | null
): { label: string; color: string } | null {
  if (mean !== null && Number.isFinite(mean)) {
    if (mean < 1.5) return { label: 'Strong buy', color: 'text-emerald-300' }
    if (mean < 2.5) return { label: 'Buy', color: 'text-emerald-400' }
    if (mean < 3.5) return { label: 'Hold', color: 'text-zinc-300' }
    if (mean < 4.5) return { label: 'Sell', color: 'text-red-400' }
    return { label: 'Strong sell', color: 'text-red-300' }
  }
  if (key && key !== 'none') {
    const pretty = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    return { label: pretty, color: 'text-zinc-300' }
  }
  return null
}

// Options micro-summary: IV, expected move through the nearest expiry, and
// put/call OI skew. The killer detail is the expected move — when earnings
// sit inside the expiry window, this is literally "the market's number"
// for the post-print gap. Tags the expiry as "covers earnings" when the
// next scheduled earnings date falls inside the options window so users
// know the IV reading is earnings-driven, not baseline.
function FocusOptionsStrip({
  options,
  earnings
}: {
  options: OptionsSnapshot | null
  earnings: EarningsBadge | undefined
}): JSX.Element | null {
  if (!options) return null
  const iv = options.impliedVol
  const ivLabel = iv !== null ? `${(iv * 100).toFixed(0)}%` : null
  const moveUsd = options.expectedMoveUsd
  const movePct = options.expectedMovePct
  const moveLabel =
    moveUsd !== null
      ? `±$${moveUsd.toFixed(2)}${movePct !== null ? ` (${(movePct * 100).toFixed(1)}%)` : ''}`
      : null
  const ratio = options.putCallOiRatio
  const ratioLabel =
    ratio !== null && Number.isFinite(ratio)
      ? ratio >= 1
        ? `${ratio.toFixed(2)}× puts`
        : `${(1 / ratio).toFixed(2)}× calls`
      : null
  const ratioColor =
    ratio === null
      ? 'text-zinc-400'
      : ratio > 1.2
        ? 'text-red-300'
        : ratio < 0.8
          ? 'text-emerald-300'
          : 'text-zinc-300'

  const coversEarnings =
    earnings?.nextDate !== undefined &&
    earnings?.nextDate !== null &&
    earnings.nextDate <= options.expiryDate
  const expiryLabel =
    options.daysToExpiry > 0
      ? `${options.daysToExpiry}d expiry`
      : 'expires today'

  if (!ivLabel && !moveLabel && !ratioLabel) return null

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] tabular-nums"
      title={`Nearest expiry ${new Date(options.expiryDate).toLocaleDateString()} · ATM strike $${options.atmStrike?.toFixed(2) ?? '—'}`}
    >
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Options · {expiryLabel}
        {coversEarnings && (
          <span className="ml-1 text-amber-300">(covers earnings)</span>
        )}
      </span>
      <KPI label="IV" value={ivLabel} valueClass="text-zinc-200" />
      <KPI
        label="Expected move"
        value={moveLabel}
        valueClass={coversEarnings ? 'text-amber-200' : 'text-zinc-200'}
      />
      <KPI label="Put/call OI" value={ratioLabel} valueClass={ratioColor} />
    </div>
  )
}

function KPI({
  label,
  value,
  valueClass,
  dotClass
}: {
  label: string
  value: string | null
  valueClass: string
  dotClass?: string
}): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">{label}</span>
      {dotClass && <span className={`h-1 w-1 rounded-full ${dotClass}`} />}
      <span className={`font-semibold ${valueClass}`}>{value ?? '—'}</span>
    </div>
  )
}

// Compact single-line cashflow strip under the price row. Rendered inside
// every tile that has financials data so the value-chain grid reads as a
// money-flow map at a glance: TTM revenue on the left, FCF margin tone on
// the right. Private / no-data nodes simply get nothing (no empty strip).
function TileCashflowRow({
  financials
}: {
  financials: FinancialsSnapshot | undefined
}): JSX.Element | null {
  if (!financials) return null
  const revenue = formatMoneyCompact(financials.ttm.revenue)
  const marginPct = formatPctValue(financials.ttm.fcfMargin)
  const tone = fcfMarginTone(financials.ttm.fcfMargin)
  if (!revenue && !marginPct && financials.quarters.length === 0) return null
  return (
    <>
      <div className="mt-1 flex items-center justify-between gap-2 text-[9.5px] tabular-nums">
        <span className="text-zinc-500 truncate max-w-[120px]" title="TTM revenue">
          {revenue ?? '—'}
        </span>
        <span
          className={`inline-flex items-center gap-1 shrink-0 ${tone.color}`}
          title={`FCF margin · ${tone.label}`}
        >
          <span className={`h-1 w-1 rounded-full ${tone.dot}`} />
          {marginPct ?? '—'}
        </span>
      </div>
      <div className="mt-0.5 flex justify-end" title="Quarterly FCF (oldest → newest)">
        <FcfSparkline financials={financials} variant="tile" />
      </div>
    </>
  )
}

