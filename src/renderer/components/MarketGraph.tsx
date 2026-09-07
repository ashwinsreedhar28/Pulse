// Whole-market relationship graph — the Bloomberg-terminal-style view over
// everything Pulse already knows about how companies connect.
//
// Complements ValueChainDiagram rather than replacing it: that renders one
// focus company's chain as staged columns (upstream -> downstream), which is
// the right shape for "who supplies NVDA". This renders the entire universe
// at once — ~290 symbols, ~880 typed edges — where the interesting structure
// is clustering and cross-sector bridges, not tiers.
//
// Depth is faked, deliberately. A real 3D projection needs a camera, per-frame
// z-sorting and continuous re-render on rotate. Instead each node takes a
// stable pseudo-depth from its own magnitude, and that one number drives
// radius, sphere shading, blur, opacity and paint order together. Reads as
// dimensional while staying a static scene.
//
// Performance contract (CLAUDE.md): the layout runs ONCE per topology change
// and never again. Live quote ticks only recolour. No rAF loop, no perpetual
// CSS animation — an idle graph costs zero CPU and captures cleanly on a
// screen share.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MarketGraphPayload, StockQuote } from '../../preload'
import { runForceLayout, DENSE_GRAPH_PRESET, type LayoutEdge } from './forceLayout'

const WIDTH = 1600
const HEIGHT = 1000

const R_MIN = 5
const R_MAX = 30

export type SizeMetric = 'marketCap' | 'news' | 'degree' | 'uniform'

const SIZE_LABELS: Record<SizeMetric, string> = {
  marketCap: 'Market cap',
  news: 'News volume',
  degree: 'Connections',
  uniform: 'Uniform'
}

// Edge tone by relationship. Supplier links are directional structure,
// competitor links lateral, partner links weaker — dashed so a dense graph
// stays legible.
const EDGE_STYLE: Record<string, { stroke: string; dash?: string }> = {
  supplier: { stroke: '#38bdf8' },
  customer: { stroke: '#38bdf8' },
  competitor: { stroke: '#fb7185' },
  partner: { stroke: '#c084fc', dash: '5 4' }
}
const EDGE_FALLBACK = { stroke: '#64748b' }

// Deterministic sector palette, indexed by sorted position so a sector keeps
// its colour across renders and reloads.
const SECTOR_PALETTE = [
  '#38bdf8', '#4ade80', '#fbbf24', '#e879f9', '#fb7185',
  '#818cf8', '#fb923c', '#2dd4bf', '#a78bfa', '#a3e635',
  '#22d3ee', '#f472b6'
]
const NEUTRAL = '#71717a'

// Lighten/darken a #rrggbb, for the sphere gradient stops.
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16)
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))
  const r = clamp(((n >> 16) & 255) * factor)
  const g = clamp(((n >> 8) & 255) * factor)
  const b = clamp((n & 255) * factor)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

// Gentle arc between two points. The control point sits perpendicular to the
// chord by a fraction of its length, so short links stay near-straight and
// long ones bow away from the centre where crossings pile up.
function curve(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const bow = Math.min(len * 0.14, 90)
  const cx = (a.x + b.x) / 2 + (-dy / len) * bow
  const cy = (a.y + b.y) / 2 + (dx / len) * bow
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
}

interface Props {
  /** Live quotes as the scheduler broadcasts them (array, not keyed). */
  quotes: StockQuote[] | null
  onSelectSymbol?: (symbol: string) => void
}

export default function MarketGraph({ quotes, onSelectSymbol }: Props): JSX.Element {
  const [data, setData] = useState<MarketGraphPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sizeBy, setSizeBy] = useState<SizeMetric>('degree')
  const [sectorFilter, setSectorFilter] = useState<string>('all')
  const [showCoMentions, setShowCoMentions] = useState(false)
  const [showEdges, setShowEdges] = useState(true)
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<string | null>(null)

  // Pan/zoom over the viewBox. Essential at ~290 nodes: the overview carries
  // structure, and you zoom in to read any individual cluster.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [dragging, setDragging] = useState(false)

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

  const quoteBySymbol = useMemo(() => {
    const m = new Map<string, StockQuote>()
    for (const q of quotes ?? []) m.set(q.symbol.toUpperCase(), q)
    return m
  }, [quotes])

  const sectorOptions = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, { count: number; name: string }>()
    for (const n of data.nodes) {
      if (!n.topSectorId) continue
      const prev = counts.get(n.topSectorId)
      counts.set(n.topSectorId, {
        count: (prev?.count ?? 0) + 1,
        name: prev?.name ?? n.topSectorName ?? n.topSectorId
      })
    }
    return [...counts.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count)
  }, [data])

  const sectorColor = useMemo(() => {
    const order = sectorOptions.map((s) => s.id).sort()
    return (sectorId: string | null): string => {
      if (!sectorId) return NEUTRAL
      const i = order.indexOf(sectorId)
      return i === -1 ? NEUTRAL : SECTOR_PALETTE[i % SECTOR_PALETTE.length]
    }
  }, [sectorOptions])

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

  // Market cap only exists once ticker_fundamentals has filled in, which
  // happens lazily as tickers are opened. With sparse coverage every node
  // collapses to R_MIN and the graph reads as uniform dots — so fall back to
  // degree until enough of the field actually has a cap.
  const capCoverage = useMemo(() => {
    if (visible.nodes.length === 0) return 0
    return visible.nodes.filter((n) => (n.marketCap ?? 0) > 0).length / visible.nodes.length
  }, [visible.nodes])
  const effectiveSizeBy: SizeMetric =
    sizeBy === 'marketCap' && capCoverage < 0.25 ? 'degree' : sizeBy

  // Normalized 0..1 magnitude per node — drives radius AND pseudo-depth.
  const magnitude = useMemo(() => {
    const raw = new Map<string, number>()
    for (const n of visible.nodes) {
      const v =
        effectiveSizeBy === 'marketCap'
          ? Math.log10(Math.max(n.marketCap ?? 0, 1))
          : effectiveSizeBy === 'news'
            ? Math.sqrt(n.newsCount)
            : effectiveSizeBy === 'degree'
              ? Math.sqrt(degree.get(n.symbol) ?? 0)
              : 1
      raw.set(n.symbol, v)
    }
    const nums = [...raw.values()]
    const lo = nums.length ? Math.min(...nums) : 0
    const hi = nums.length ? Math.max(...nums) : 1
    const span = hi - lo || 1
    const out = new Map<string, number>()
    for (const [k, v] of raw) {
      out.set(k, effectiveSizeBy === 'uniform' ? 0.5 : (v - lo) / span)
    }
    return out
  }, [visible.nodes, effectiveSizeBy, degree])

  const positions = useMemo(() => {
    const ids = visible.nodes.map((n) => n.symbol)
    const layoutEdges: LayoutEdge[] = visible.edges.map((e) => ({ from: e.from, to: e.to }))
    const pos = runForceLayout(ids, layoutEdges, {
      width: WIDTH,
      height: HEIGHT,
      padding: R_MAX + 24,
      ...DENSE_GRAPH_PRESET
    })
    return new Map(pos.map((p) => [p.id, p]))
  }, [visible.nodes, visible.edges])

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return null
    return new Set(
      visible.nodes
        .filter((n) => n.symbol.includes(q) || (n.name ?? '').toUpperCase().includes(q))
        .map((n) => n.symbol)
    )
  }, [query, visible.nodes])

  const neighbours = useMemo(() => {
    if (!hover) return null
    const set = new Set<string>([hover])
    for (const e of visible.edges) {
      if (e.from === hover) set.add(e.to)
      if (e.to === hover) set.add(e.from)
    }
    return set
  }, [hover, visible.edges])

  // Paint order is depth order: low-magnitude nodes render first and so sit
  // visually behind the large ones. That ordering is most of what sells the
  // dimensional read.
  const drawOrder = useMemo(
    () =>
      [...visible.nodes].sort(
        (a, b) => (magnitude.get(a.symbol) ?? 0) - (magnitude.get(b.symbol) ?? 0)
      ),
    [visible.nodes, magnitude]
  )

  const hovered = hover ? visible.nodes.find((n) => n.symbol === hover) : null

  const viewBox = useMemo(() => {
    const w = WIDTH / zoom
    const h = HEIGHT / zoom
    return `${(WIDTH - w) / 2 + pan.x} ${(HEIGHT - h) / 2 + pan.y} ${w} ${h}`
  }, [zoom, pan])

  if (loading) return <div className="p-8 text-sm text-zinc-400">Building market graph…</div>
  if (error)
    return <div className="p-8 text-sm text-rose-400">Couldn&apos;t load graph: {error}</div>
  if (!data || data.nodes.length === 0) {
    return (
      <div className="p-8 text-sm text-zinc-400">
        No graph yet. Generate a few company value chains and their edges will
        appear here.
      </div>
    )
  }

  const usedPalette = sectorOptions.map((s) => ({ ...s, color: sectorColor(s.id) }))
  const gradientColors = [...new Set([...usedPalette.map((p) => p.color), NEUTRAL])]

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find ticker…"
          className="w-36 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none ring-1 ring-zinc-800 focus:ring-sky-700"
        />
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          Size
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
        {sizeBy === 'marketCap' && effectiveSizeBy !== 'marketCap' && (
          <span
            className="text-[10px] text-amber-400/80"
            title="ticker_fundamentals fills in as tickers are opened"
          >
            using connections — market caps not cached yet
          </span>
        )}
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          Sector
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="max-w-[14rem] rounded bg-zinc-900 px-1 py-1 text-xs text-zinc-200 ring-1 ring-zinc-800"
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
            checked={showEdges}
            onChange={(e) => setShowEdges(e.target.checked)}
          />
          Links
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={showCoMentions}
            onChange={(e) => setShowCoMentions(e.target.checked)}
          />
          Co-mentions ({visible.coMentions.length})
        </label>
        <div className="flex items-center gap-1 text-xs text-zinc-400">
          <button
            onClick={() => setZoom((z) => Math.min(z * 1.3, 8))}
            className="rounded bg-zinc-900 px-2 py-0.5 ring-1 ring-zinc-800 hover:bg-zinc-800"
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z / 1.3, 0.6))}
            className="rounded bg-zinc-900 px-2 py-0.5 ring-1 ring-zinc-800 hover:bg-zinc-800"
          >
            −
          </button>
          <button
            onClick={() => {
              setZoom(1)
              setPan({ x: 0, y: 0 })
            }}
            className="rounded bg-zinc-900 px-2 py-0.5 ring-1 ring-zinc-800 hover:bg-zinc-800"
          >
            reset
          </button>
        </div>
        <span className="ml-auto text-xs text-zinc-500">
          {visible.nodes.length} nodes · {visible.edges.length} links
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-[#07080c]">
        <svg
          viewBox={viewBox}
          className="h-full w-full"
          role="img"
          aria-label="Market relationship graph"
          style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          onWheel={(e) => {
            setZoom((z) => Math.max(0.6, Math.min(8, z * (e.deltaY > 0 ? 1 / 1.12 : 1.12))))
          }}
          onPointerDown={(e) => {
            dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
            setDragging(true)
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const d = dragRef.current
            if (!d) return
            // Screen delta -> viewBox units, so drag tracks the cursor 1:1 at
            // any zoom level.
            const rect = e.currentTarget.getBoundingClientRect()
            const unitsPerPx = WIDTH / zoom / rect.width
            setPan({
              x: d.panX - (e.clientX - d.x) * unitsPerPx,
              y: d.panY - (e.clientY - d.y) * unitsPerPx
            })
          }}
          onPointerUp={(e) => {
            dragRef.current = null
            setDragging(false)
            e.currentTarget.releasePointerCapture(e.pointerId)
          }}
        >
          <defs>
            {/* One sphere gradient per sector colour: offset highlight, base
                mid-tone, darkened rim. This is what makes a flat circle read
                as a lit ball. */}
            {gradientColors.map((c) => (
              <radialGradient key={c} id={`sphere-${c.slice(1)}`} cx="35%" cy="30%" r="75%">
                <stop offset="0%" stopColor={shade(c, 1.75)} />
                <stop offset="45%" stopColor={c} />
                <stop offset="100%" stopColor={shade(c, 0.42)} />
              </radialGradient>
            ))}
            {/* Depth of field: distant (small) nodes soften. */}
            <filter id="farBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.1" />
            </filter>
            <filter id="nearGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
              <stop offset="0%" stopColor="#11151f" />
              <stop offset="100%" stopColor="#07080c" />
            </radialGradient>
          </defs>

          {/* Ground plane — oversized so it still covers when panned. */}
          <rect
            x={-WIDTH}
            y={-HEIGHT}
            width={WIDTH * 3}
            height={HEIGHT * 3}
            fill="url(#vignette)"
          />

          {showCoMentions &&
            visible.coMentions.map((c) => {
              const a = positions.get(c.from)
              const b = positions.get(c.to)
              if (!a || !b) return null
              return (
                <path
                  key={`cm-${c.from}-${c.to}`}
                  d={curve(a, b)}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={Math.min(0.8 + c.count / 14, 3)}
                  strokeOpacity={neighbours ? 0.05 : 0.14}
                />
              )
            })}

          {showEdges &&
            visible.edges.map((e, i) => {
              const a = positions.get(e.from)
              const b = positions.get(e.to)
              if (!a || !b) return null
              const style = EDGE_STYLE[e.relationship] ?? EDGE_FALLBACK
              const focused = neighbours ? neighbours.has(e.from) && neighbours.has(e.to) : null
              // Curved, not straight. With ~880 links every straight chord
              // crosses the middle and the result mats into a solid block;
              // arcs separate them so a single connection stays followable.
              return (
                <path
                  key={`e-${e.from}-${e.to}-${e.relationship}-${i}`}
                  d={curve(a, b)}
                  fill="none"
                  stroke={style.stroke}
                  strokeDasharray={style.dash}
                  strokeWidth={focused ? 1.6 : 0.45 + (e.weight ?? 0.5) * 0.9}
                  strokeOpacity={focused === null ? 0.16 : focused ? 0.75 : 0.03}
                  strokeLinecap="round"
                />
              )
            })}

          {drawOrder.map((n) => {
            const p = positions.get(n.symbol)
            if (!p) return null
            const m = magnitude.get(n.symbol) ?? 0
            const r = R_MIN + m * (R_MAX - R_MIN)
            const color = sectorColor(n.topSectorId)
            const pct = quoteBySymbol.get(n.symbol)?.changePct ?? null
            const dimmed =
              (neighbours && !neighbours.has(n.symbol)) ||
              (matches && !matches.has(n.symbol))
            const isFar = m < 0.28
            const isNear = m > 0.72
            const labelled =
              !dimmed && (m > 0.45 || hover === n.symbol || (matches?.has(n.symbol) ?? false))

            return (
              <g
                key={n.symbol}
                transform={`translate(${p.x} ${p.y})`}
                opacity={dimmed ? 0.1 : isFar ? 0.72 : 1}
                filter={isFar ? 'url(#farBlur)' : isNear ? 'url(#nearGlow)' : undefined}
                onMouseEnter={() => setHover(n.symbol)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelectSymbol?.(n.symbol)}
                style={{ cursor: onSelectSymbol ? 'pointer' : 'default' }}
              >
                {/* Contact shadow, offset away from the light source. */}
                <ellipse
                  cx={r * 0.22}
                  cy={r * 0.34}
                  rx={r * 0.95}
                  ry={r * 0.72}
                  fill="#000"
                  opacity={0.42}
                />
                <circle r={r} fill={`url(#sphere-${color.slice(1)})`} />
                {/* Rim light — the second half of the sphere read, separating
                    the ball from its own shadow. */}
                <circle
                  r={r}
                  fill="none"
                  stroke={shade(color, 1.5)}
                  strokeOpacity={0.35}
                  strokeWidth={0.8}
                />
                {/* Live quote ring. The only thing that changes on a tick. */}
                {pct !== null && (
                  <circle
                    r={r + 2.6}
                    fill="none"
                    stroke={pct >= 0 ? '#34d399' : '#f87171'}
                    strokeOpacity={0.85}
                    strokeWidth={1.6}
                  />
                )}
                {/* Specular highlight. */}
                <ellipse
                  cx={-r * 0.3}
                  cy={-r * 0.36}
                  rx={r * 0.26}
                  ry={r * 0.19}
                  fill="#fff"
                  opacity={0.5}
                />
                {labelled && (
                  <text
                    y={r + 11}
                    textAnchor="middle"
                    className="pointer-events-none select-none"
                    fill="#e4e4e7"
                    fontSize={Math.max(8, Math.min(12, r * 0.55))}
                    stroke="#07080c"
                    strokeWidth={2.4}
                    paintOrder="stroke"
                  >
                    {n.symbol}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-500">
        {usedPalette.slice(0, 8).map((s) => (
          <span key={s.id} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: s.color }}
            />
            {s.name}
          </span>
        ))}
        <span className="ml-auto">scroll to zoom · drag to pan · hover to isolate</span>
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
            · {degree.get(hovered.symbol) ?? 0} links · {hovered.newsCount} articles
            {hovered.marketCap ? ` · $${(hovered.marketCap / 1e9).toFixed(1)}B` : ''}
          </span>
          {hovered.blurb ? <div className="mt-1 text-zinc-400">{hovered.blurb}</div> : null}
        </div>
      )}
    </div>
  )
}
