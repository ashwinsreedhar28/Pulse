// Whole-market relationship graph — the Bloomberg-terminal-style view over
// everything Pulse already knows about how companies connect.
//
// Complements ValueChainDiagram rather than replacing it: that renders one
// focus company's chain as staged columns (upstream -> downstream), which is
// the right shape for "who supplies NVDA". This renders the entire universe
// at once — ~290 symbols, ~880 typed edges — where the interesting structure
// is clustering and cross-sector bridges, not tiers.
//
// Performance contract (CLAUDE.md): the layout runs ONCE per topology change
// and then never again. Live quote ticks only recolour. There is no rAF loop
// and no perpetual CSS animation here, so an idle graph costs zero CPU and
// captures cleanly on a screen share.

import { useEffect, useMemo, useState } from 'react'
import type { MarketGraphPayload, StockQuote } from '../../preload'
import { runForceLayout, type LayoutEdge } from './forceLayout'

const WIDTH = 1600
const HEIGHT = 1000

// Node radius bounds. The floor keeps a mega-cap from making everything else
// an unclickable dot; the ceiling keeps one node from swallowing the canvas.
const R_MIN = 4
const R_MAX = 26

export type SizeMetric = 'marketCap' | 'news' | 'degree' | 'uniform'

const SIZE_LABELS: Record<SizeMetric, string> = {
  marketCap: 'Market cap',
  news: 'News volume',
  degree: 'Connections',
  uniform: 'Uniform'
}

// Edge styling by relationship. Supplier links are directional structure;
// competitor links are lateral; partner links are weaker and dashed so a
// dense graph stays readable.
const EDGE_STYLE: Record<string, { stroke: string; dash?: string }> = {
  supplier: { stroke: '#38bdf8' },
  customer: { stroke: '#38bdf8' },
  competitor: { stroke: '#fb7185' },
  partner: { stroke: '#a78bfa', dash: '4 3' }
}
const EDGE_FALLBACK = { stroke: '#64748b' }

// Deterministic sector palette — index by sorted position so a sector keeps
// its colour across renders and reloads.
const SECTOR_PALETTE = [
  '#7dd3fc', '#86efac', '#fcd34d', '#f0abfc', '#fda4af',
  '#a5b4fc', '#fdba74', '#5eead4', '#c4b5fd', '#bef264',
  '#67e8f9', '#fca5a5'
]
const NEUTRAL = '#71717a'

interface Props {
  /** Live quotes as the scheduler broadcasts them (array, not keyed). */
  quotes: StockQuote[] | null
  onSelectSymbol?: (symbol: string) => void
}

export default function MarketGraph({ quotes, onSelectSymbol }: Props): JSX.Element {
  const [data, setData] = useState<MarketGraphPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sizeBy, setSizeBy] = useState<SizeMetric>('marketCap')
  const [sectorFilter, setSectorFilter] = useState<string>('all')
  const [showCoMentions, setShowCoMentions] = useState(false)
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<string | null>(null)

  // Keyed lookup for the live tint. Rebuilt per quote wave, which is cheap
  // (~500 entries) and — critically — is NOT an input to the layout memo.
  const quoteBySymbol = useMemo(() => {
    const m = new Map<string, StockQuote>()
    for (const q of quotes ?? []) m.set(q.symbol.toUpperCase(), q)
    return m
  }, [quotes])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.graph
      .getMarketGraph()
      .then((payload) => {
        if (cancelled) return
        setData(payload)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Sectors that actually have nodes, so the filter never offers an empty view.
  const sectorOptions = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, number>()
    for (const n of data.nodes) {
      if (!n.topSectorId) continue
      counts.set(n.topSectorId, (counts.get(n.topSectorId) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        count,
        name: data.nodes.find((n) => n.topSectorId === id)?.topSectorName ?? id
      }))
      .sort((a, b) => b.count - a.count)
  }, [data])

  const colorForSector = useMemo(() => {
    const order = [...sectorOptions].map((s) => s.id).sort()
    return (sectorId: string | null): string => {
      if (!sectorId) return NEUTRAL
      const i = order.indexOf(sectorId)
      return i === -1 ? NEUTRAL : SECTOR_PALETTE[i % SECTOR_PALETTE.length]
    }
  }, [sectorOptions])

  // Visible subgraph. Filtering by sector drops nodes, and any edge with a
  // dropped endpoint goes with it.
  const visible = useMemo(() => {
    if (!data) return { nodes: [], edges: [], coMentions: [] }
    const nodes =
      sectorFilter === 'all'
        ? data.nodes
        : data.nodes.filter((n) => n.topSectorId === sectorFilter)
    const keep = new Set(nodes.map((n) => n.symbol))
    return {
      nodes,
      edges: data.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
      coMentions: data.coMentions.filter((c) => keep.has(c.from) && keep.has(c.to))
    }
  }, [data, sectorFilter])

  const degree = useMemo(() => {
    const d = new Map<string, number>()
    for (const e of visible.edges) {
      d.set(e.from, (d.get(e.from) ?? 0) + 1)
      d.set(e.to, (d.get(e.to) ?? 0) + 1)
    }
    return d
  }, [visible.edges])

  // Layout depends ONLY on topology and the size metric — never on quotes.
  // This is what keeps a 60s quote tick from re-running the simulation.
  const positions = useMemo(() => {
    const ids = visible.nodes.map((n) => n.symbol)
    const layoutEdges: LayoutEdge[] = visible.edges.map((e) => ({ from: e.from, to: e.to }))
    const pos = runForceLayout(ids, layoutEdges, {
      width: WIDTH,
      height: HEIGHT,
      padding: R_MAX + 12
    })
    return new Map(pos.map((p) => [p.id, p]))
  }, [visible.nodes, visible.edges])

  // Radius scale. Market cap spans orders of magnitude, so it needs a log
  // scale or NVDA alone dwarfs the field; counts are fine on sqrt.
  const radiusOf = useMemo(() => {
    const values = new Map<string, number>()
    for (const n of visible.nodes) {
      const raw =
        sizeBy === 'marketCap'
          ? (n.marketCap ?? 0)
          : sizeBy === 'news'
            ? n.newsCount
            : sizeBy === 'degree'
              ? (degree.get(n.symbol) ?? 0)
              : 1
      values.set(n.symbol, raw)
    }
    const scaled = new Map<string, number>()
    for (const [sym, raw] of values) {
      scaled.set(sym, sizeBy === 'marketCap' ? Math.log10(Math.max(raw, 1)) : Math.sqrt(raw))
    }
    const nums = [...scaled.values()]
    const lo = Math.min(...nums, 0)
    const hi = Math.max(...nums, 1)
    const span = hi - lo || 1
    return (symbol: string): number => {
      if (sizeBy === 'uniform') return 9
      const v = scaled.get(symbol) ?? 0
      return R_MIN + ((v - lo) / span) * (R_MAX - R_MIN)
    }
  }, [visible.nodes, sizeBy, degree])

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return null
    return new Set(
      visible.nodes
        .filter((n) => n.symbol.includes(q) || (n.name ?? '').toUpperCase().includes(q))
        .map((n) => n.symbol)
    )
  }, [query, visible.nodes])

  const hovered = hover ? visible.nodes.find((n) => n.symbol === hover) : null
  // Neighbours of the hovered node, so hovering isolates its subgraph.
  const neighbours = useMemo(() => {
    if (!hover) return null
    const set = new Set<string>([hover])
    for (const e of visible.edges) {
      if (e.from === hover) set.add(e.to)
      if (e.to === hover) set.add(e.from)
    }
    return set
  }, [hover, visible.edges])

  if (loading) {
    return <div className="p-8 text-sm text-zinc-400">Building market graph…</div>
  }
  if (error) {
    return <div className="p-8 text-sm text-rose-400">Couldn&apos;t load graph: {error}</div>
  }
  if (!data || data.nodes.length === 0) {
    return (
      <div className="p-8 text-sm text-zinc-400">
        No graph yet. Generate a few company value chains and their edges will
        appear here.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find ticker…"
          className="w-40 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none ring-1 ring-zinc-800 focus:ring-sky-700"
        />
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          Size by
          <select
            value={sizeBy}
            onChange={(e) => setSizeBy(e.target.value as SizeMetric)}
            className="rounded bg-zinc-900 px-1 py-1 text-xs text-zinc-200 ring-1 ring-zinc-800"
          >
            {(Object.keys(SIZE_LABELS) as SizeMetric[]).map((k) => (
              <option key={k} value={k}>
                {SIZE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          Sector
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="max-w-[15rem] rounded bg-zinc-900 px-1 py-1 text-xs text-zinc-200 ring-1 ring-zinc-800"
          >
            <option value="all">All ({data.nodes.length})</option>
            {sectorOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.count})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={showCoMentions}
            onChange={(e) => setShowCoMentions(e.target.checked)}
          />
          News co-mentions ({visible.coMentions.length})
        </label>
        <span className="ml-auto text-xs text-zinc-500">
          {visible.nodes.length} nodes · {visible.edges.length} edges
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-full w-full"
          role="img"
          aria-label="Market relationship graph"
        >
          {/* Co-mention layer sits underneath — it is context, not structure. */}
          {showCoMentions &&
            visible.coMentions.map((c) => {
              const a = positions.get(c.from)
              const b = positions.get(c.to)
              if (!a || !b) return null
              return (
                <line
                  key={`cm-${c.from}-${c.to}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#fbbf24"
                  strokeWidth={Math.min(1 + c.count / 12, 4)}
                  strokeOpacity={neighbours ? 0.06 : 0.16}
                />
              )
            })}

          {visible.edges.map((e, i) => {
            const a = positions.get(e.from)
            const b = positions.get(e.to)
            if (!a || !b) return null
            const style = EDGE_STYLE[e.relationship] ?? EDGE_FALLBACK
            const dim = neighbours && !(neighbours.has(e.from) && neighbours.has(e.to))
            return (
              <line
                key={`e-${e.from}-${e.to}-${e.relationship}-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={style.stroke}
                strokeDasharray={style.dash}
                strokeWidth={0.6 + (e.weight ?? 0.5) * 1.6}
                strokeOpacity={dim ? 0.05 : e.crossSector ? 0.75 : 0.42}
              />
            )
          })}

          {visible.nodes.map((n) => {
            const p = positions.get(n.symbol)
            if (!p) return null
            const r = radiusOf(n.symbol)
            const q = quoteBySymbol.get(n.symbol)
            // Live tint from the quote — the ONLY thing that changes on a
            // tick. Deliberately not part of any layout input.
            const pct = q?.changePct ?? null
            const ring =
              pct === null ? 'transparent' : pct >= 0 ? '#34d399' : '#f87171'
            const dim =
              (neighbours && !neighbours.has(n.symbol)) ||
              (matches && !matches.has(n.symbol))
            return (
              <g
                key={n.symbol}
                transform={`translate(${p.x} ${p.y})`}
                opacity={dim ? 0.12 : 1}
                onMouseEnter={() => setHover(n.symbol)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelectSymbol?.(n.symbol)}
                style={{ cursor: onSelectSymbol ? 'pointer' : 'default' }}
              >
                <circle
                  r={r}
                  fill={colorForSector(n.topSectorId)}
                  fillOpacity={n.isActive ? 0.9 : 0.45}
                  stroke={ring}
                  strokeWidth={pct === null ? 0 : 2}
                />
                {(r >= 9 || hover === n.symbol || (matches?.has(n.symbol) ?? false)) && (
                  <text
                    y={r + 9}
                    textAnchor="middle"
                    className="pointer-events-none"
                    fill="#e4e4e7"
                    fontSize={9}
                  >
                    {n.symbol}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {hovered && (
        <div className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-300">
          <span className="font-semibold text-zinc-100">{hovered.symbol}</span>
          {hovered.name ? <span className="text-zinc-400"> · {hovered.name}</span> : null}
          {hovered.topSectorName ? (
            <span className="text-zinc-500"> · {hovered.topSectorName}</span>
          ) : null}
          <span className="text-zinc-500">
            {' '}
            · {degree.get(hovered.symbol) ?? 0} connections · {hovered.newsCount} articles
            {hovered.marketCap
              ? ` · $${(hovered.marketCap / 1e9).toFixed(1)}B`
              : ''}
          </span>
          {hovered.blurb ? (
            <div className="mt-1 text-zinc-400">{hovered.blurb}</div>
          ) : null}
        </div>
      )}
    </div>
  )
}
