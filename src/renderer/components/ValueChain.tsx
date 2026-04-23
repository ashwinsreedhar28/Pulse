import { useEffect, useMemo, useRef, useState } from 'react'
import type { StockQuote, Ticker } from '../../preload'
import graph from '../../data/supplyChainGraph.json'
import { ValueChainDiagram } from './ValueChainDiagram'
import {
  TransactionCluster,
  categoryGlow,
  type Category,
  type Counterparty
} from './StockValueChainCard'

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
}
interface ValueChainGraph {
  sectors: ValueChainSector[]
  stages: ValueChainStage[]
  nodes: ValueChainNode[]
  edges: ValueChainEdge[]
  competitors: string[][]
}

const CHAIN = graph as ValueChainGraph

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
  onActivateTicker
}: {
  tickers: Ticker[]
  quotes: StockQuote[]
  onOpenTicker: (tickerId: number) => void
  onActivateTicker: (tickerId: number) => void
}): JSX.Element {
  // Two focus sources: hover (transient) and lock (sticky, click-driven).
  // `lockedSymbol` wins when set — hover changes are silently recorded but
  // don't change the visible focus panel, so users can scroll the grid
  // without losing their place.
  const [hoverSymbol, setHoverSymbol] = useState<string | null>(null)
  const [lockedSymbol, setLockedSymbol] = useState<string | null>(null)
  const [sectorId, setSectorId] = useState<string>('all')
  const [diagramSymbol, setDiagramSymbol] = useState<string | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const quoteBySymbol = useMemo(() => {
    const m = new Map<string, StockQuote>()
    for (const q of quotes) m.set(q.symbol.toUpperCase(), q)
    return m
  }, [quotes])

  const tickerBySymbol = useMemo(() => {
    const m = new Map<string, Ticker>()
    for (const t of tickers) m.set(t.symbol.toUpperCase(), t)
    return m
  }, [tickers])

  // Filter the node set by the active sector tab. "all" passes everything;
  // any specific sector drops nodes outside it so the chain view stays focused.
  // Edges are filtered by membership in the visible node set.
  const visibleSymbols = useMemo(() => {
    const s = new Set<string>()
    for (const node of CHAIN.nodes) {
      if (sectorId === 'all' || node.sector === sectorId) s.add(node.symbol)
    }
    return s
  }, [sectorId])

  // Show every visible graph node, not just watchlist holdings — the point of
  // the chain is the ecosystem context, which is mostly suppliers/customers
  // the user doesn't necessarily hold. Non-watchlist nodes render as ghost
  // tiles (no quote, muted styling) but still participate in hover/connection
  // highlighting so the graph stays intelligible.
  const stageGroups = useMemo(() => {
    const bucket = new Map<string, ValueChainNode[]>()
    for (const stage of CHAIN.stages) bucket.set(stage.id, [])
    for (const node of CHAIN.nodes) {
      if (!visibleSymbols.has(node.symbol)) continue
      bucket.get(node.stage)?.push(node)
    }
    return CHAIN.stages
      .map((s) => ({ stage: s, nodes: bucket.get(s.id) ?? [] }))
      .filter((g) => g.nodes.length > 0)
  }, [visibleSymbols])

  const { outgoing, incoming } = useMemo(() => {
    const out = new Map<string, ValueChainEdge[]>()
    const inc = new Map<string, ValueChainEdge[]>()
    for (const e of CHAIN.edges) {
      if (!visibleSymbols.has(e.from) || !visibleSymbols.has(e.to)) continue
      if (!out.has(e.from)) out.set(e.from, [])
      out.get(e.from)!.push(e)
      if (!inc.has(e.to)) inc.set(e.to, [])
      inc.get(e.to)!.push(e)
    }
    return { outgoing: out, incoming: inc }
  }, [visibleSymbols])

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
    for (const peer of COMPETITOR_MAP.get(focusSymbol) ?? []) {
      if (!visibleSymbols.has(peer)) continue
      m.set(peer, 'competitor')
    }
    return m
  }, [focusSymbol, outgoing, incoming, visibleSymbols])

  const focusCompetitors = useMemo(() => {
    if (!focusSymbol) return []
    const peers = COMPETITOR_MAP.get(focusSymbol)
    if (!peers) return []
    return [...peers].filter((s) => visibleSymbols.has(s)).sort()
  }, [focusSymbol, visibleSymbols])

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
    for (const n of CHAIN.nodes) m.set(n.symbol, n)
    return m
  }, [])
  const stageLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of CHAIN.stages) m.set(s.id, s.label)
    return m
  }, [])
  const focusNode = focusSymbol ? nodeBySymbol.get(focusSymbol) : null
  const focusStageLabel = focusNode ? stageLabelById.get(focusNode.stage) ?? focusNode.stage : ''
  const focusCompanyName = focusTicker?.companyName ?? focusSymbol ?? ''
  const focusBlurb = focusNode?.blurb ?? ''

  // Reshape the focus panel's counterparties into the Counterparty structure
  // used by TransactionCluster so the panel body reads identically to the
  // stock-detail page's value-chain card. Stage sort lives inside the cluster.
  const buildCounterparty = (sym: string, note: string | null): Counterparty => {
    const n = nodeBySymbol.get(sym)
    const stage = n?.stage ?? ''
    return {
      symbol: sym,
      stage,
      stageLabel: stage ? stageLabelById.get(stage) ?? stage : '—',
      companyName: tickerBySymbol.get(sym.toUpperCase())?.companyName ?? n?.name ?? sym,
      note
    }
  }
  const customerItems = useMemo(
    () => focusEdgesOut.map((e) => buildCounterparty(e.to, e.note ?? null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusEdgesOut, nodeBySymbol, stageLabelById, tickerBySymbol]
  )
  const supplierItems = useMemo(
    () => focusEdgesIn.map((e) => buildCounterparty(e.from, e.note ?? null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusEdgesIn, nodeBySymbol, stageLabelById, tickerBySymbol]
  )
  const competitorItems = useMemo(
    () => focusCompetitors.map((sym) => buildCounterparty(sym, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusCompetitors, nodeBySymbol, stageLabelById, tickerBySymbol]
  )
  const presentCategories: Category[] = []
  if (supplierItems.length > 0) presentCategories.push('supplier')
  if (competitorItems.length > 0) presentCategories.push('competitor')
  if (customerItems.length > 0) presentCategories.push('customer')
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

      <div className="flex items-center gap-1 mb-4 rounded-full bg-surface-1 ring-1 ring-edge/60 p-0.5 w-fit">
        {CHAIN.sectors.map((s) => (
          <SectorTab
            key={s.id}
            label={s.label}
            active={sectorId === s.id}
            onClick={() => {
              setSectorId(s.id)
              setHoverSymbol(null)
              setLockedSymbol(null)
            }}
          />
        ))}
      </div>

      {/* Fixed height so the panel never resizes when switching between
          tickers with different numbers of edges. Inner grid scrolls if a
          heavily-connected node's lists exceed the visible box. */}
      <aside className="sticky top-0 z-20 -mx-6 px-6 pt-1 pb-3 mb-4 bg-surface-0/95 backdrop-blur border-b border-edge/40">
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
                  items={supplierItems}
                  onPick={toggleLock}
                  onHover={focusTile}
                  onLeave={scheduleClear}
                />
                <TransactionCluster
                  category="competitor"
                  items={competitorItems}
                  onPick={toggleLock}
                  onHover={focusTile}
                  onLeave={scheduleClear}
                />
                <TransactionCluster
                  category="customer"
                  items={customerItems}
                  onPick={toggleLock}
                  onHover={focusTile}
                  onLeave={scheduleClear}
                />
              </div>
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
                const hasTickerRow = !!t
                const inWatchlist = !!t && t.isActive
                const role = related?.get(n.symbol) ?? null
                const dim = related ? role === null : false
                const isFocus = focusSymbol === n.symbol
                const isLocked = lockedSymbol === n.symbol
                return (
                  <ValueChainTile
                    key={n.symbol}
                    symbol={n.symbol}
                    companyName={t?.companyName ?? n.symbol}
                    quote={q}
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

function ValueChainTile({
  symbol,
  companyName,
  quote,
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
  const change = quote?.change ?? null
  const changePct = quote?.changePct ?? null
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
  const opacity = dim ? 'opacity-25' : ''

  return (
    <button
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      onClick={onClick}
      className={`${base} ${tone} ${opacity} cursor-pointer`}
      title={companyName}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[13px] font-bold tracking-[0.04em] ${symbolColor}`}>{symbol}</span>
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
            {quote?.price !== null && quote?.price !== undefined
              ? quote.price.toFixed(2)
              : '—'}
          </span>
        )}
      </div>
    </button>
  )
}

