// Whole-market relationship graph — an orbitable 3D view over everything
// Pulse knows about how companies connect. Companies are stars; supplier,
// competitor and partner links are the structure between them.
//
// Complements ValueChainDiagram rather than replacing it: that renders one
// focus company's chain as staged columns, which is right for "who supplies
// NVDA". This shows the whole universe at once, where the interesting
// structure is clustering and cross-sector bridges rather than tiers.
//
// Canvas, not SVG. The first version drew ~290 nodes and ~880 edges as React
// elements, which meant every hover recomputed the neighbour set and
// re-rendered all 880 paths — that reconciliation was the hover jitter. Under
// rotation it would be far worse, since every element moves each frame.
// Canvas draws the same scene in one imperative pass, and hover lives in a
// ref so pointer movement triggers a repaint without any React render at all.
//
// Layout runs once in 3D and is never re-run for camera changes: rotation and
// zoom are pure projection, O(n) per frame. Redraws are event-driven — drag,
// wheel, hover, new quotes — so an untouched graph costs nothing. Auto-orbit
// is available but off by default, because CLAUDE.md bans perpetual animation
// by default (it jitters under screen capture).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MarketGraphNode, MarketGraphPayload, StockQuote } from '../../preload'
import { runForceLayout3D, type LayoutEdge, type LayoutPosition3D } from './forceLayout'

const R_MIN = 2.5
const R_MAX = 15

// Camera distance in layout units. The structure is normalized to roughly a
// unit sphere, so ~3.2 frames it with visible perspective without extreme
// foreshortening at the near edge.
const FOV = 3.2

export type SizeMetric = 'marketCap' | 'news' | 'degree' | 'uniform'

const SIZE_LABELS: Record<SizeMetric, string> = {
  marketCap: 'Market cap',
  news: 'News volume',
  degree: 'Connections',
  uniform: 'Uniform'
}

const EDGE_COLOR: Record<string, string> = {
  supplier: '56,189,248',
  customer: '56,189,248',
  competitor: '251,113,133',
  partner: '192,132,252'
}
const EDGE_FALLBACK = '100,116,139'

const SECTOR_PALETTE = [
  '56,189,248', '74,222,128', '251,191,36', '232,121,249', '251,113,133',
  '129,140,248', '251,146,60', '45,212,191', '167,139,250', '163,230,53',
  '34,211,238', '244,114,182'
]
const NEUTRAL_RGB = '113,113,122'

interface Projected {
  node: MarketGraphNode
  sx: number
  sy: number
  /** Camera-space depth; larger is nearer. */
  depth: number
  r: number
  rgb: string
}

interface Props {
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
  const [autoOrbit, setAutoOrbit] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<MarketGraphNode | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Camera and hover live in refs, not state: they change on every pointer
  // move and must never trigger a React render.
  const camRef = useRef({ yaw: 0.5, pitch: -0.25, zoom: 1 })
  const hoverRef = useRef<string | null>(null)
  const projectedRef = useRef<Projected[]>([])
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.graph
      .getMarketGraph()
      .then((p) => {
        if (!cancelled) {
          setData(p)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
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

  const sectorRgb = useMemo(() => {
    const order = sectorOptions.map((s) => s.id).sort()
    return (id: string | null): string => {
      if (!id) return NEUTRAL_RGB
      const i = order.indexOf(id)
      return i === -1 ? NEUTRAL_RGB : SECTOR_PALETTE[i % SECTOR_PALETTE.length]
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

  // ticker_fundamentals fills in lazily as tickers are opened. With sparse
  // coverage every node lands at R_MIN and the field reads as uniform dust,
  // so fall back to degree until enough of it actually has a cap.
  const capCoverage = useMemo(() => {
    if (visible.nodes.length === 0) return 0
    return visible.nodes.filter((n) => (n.marketCap ?? 0) > 0).length / visible.nodes.length
  }, [visible.nodes])
  const effectiveSizeBy: SizeMetric =
    sizeBy === 'marketCap' && capCoverage < 0.25 ? 'degree' : sizeBy

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
    for (const [k, v] of raw) out.set(k, effectiveSizeBy === 'uniform' ? 0.5 : (v - lo) / span)
    return out
  }, [visible.nodes, effectiveSizeBy, degree])

  // The expensive part, and the only part that must not run on camera moves.
  const layout = useMemo(() => {
    const ids = visible.nodes.map((n) => n.symbol)
    const edges: LayoutEdge[] = visible.edges.map((e) => ({ from: e.from, to: e.to }))
    const pos = runForceLayout3D(ids, edges)
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

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const e of visible.edges) {
      if (!m.has(e.from)) m.set(e.from, new Set())
      if (!m.has(e.to)) m.set(e.to, new Set())
      m.get(e.from)!.add(e.to)
      m.get(e.to)!.add(e.from)
    }
    return m
  }, [visible.edges])

  // ---- rendering ----------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Deep-space ground.
    const bg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.75)
    bg.addColorStop(0, '#0d1018')
    bg.addColorStop(1, '#05060a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    const { yaw, pitch, zoom } = camRef.current
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    const cxp = w / 2
    const cyp = h / 2
    const baseScale = Math.min(w, h) * 0.42 * zoom

    // Yaw about Y, then pitch about X, then perspective divide.
    const project = (p: LayoutPosition3D): { sx: number; sy: number; depth: number; k: number } => {
      const x1 = p.x * cy + p.z * sy
      const z1 = -p.x * sy + p.z * cy
      const y2 = p.y * cp - z1 * sp
      const z2 = p.y * sp + z1 * cp
      const k = FOV / (FOV + z2)
      return { sx: cxp + x1 * k * baseScale, sy: cyp + y2 * k * baseScale, depth: -z2, k }
    }

    const proj = new Map<string, { sx: number; sy: number; depth: number; k: number }>()
    for (const n of visible.nodes) {
      const p = layout.get(n.symbol)
      if (p) proj.set(n.symbol, project(p))
    }

    const hover = hoverRef.current
    const focusSet = hover ? new Set([hover, ...(adjacency.get(hover) ?? [])]) : null

    // Edges first, behind the stars.
    if (showEdges) {
      ctx.lineCap = 'round'
      for (const e of visible.edges) {
        const a = proj.get(e.from)
        const b = proj.get(e.to)
        if (!a || !b) continue
        const focused = focusSet ? focusSet.has(e.from) && focusSet.has(e.to) : null
        if (focused === false) continue // hidden while isolating a hover
        const rgb = EDGE_COLOR[e.relationship] ?? EDGE_FALLBACK
        // Nearer edges are brighter, which is most of the depth cue for the
        // link structure.
        const depthA = (a.k + b.k) / 2
        const alpha = focused ? 0.85 : 0.05 + depthA * 0.1
        ctx.strokeStyle = `rgba(${rgb},${alpha})`
        ctx.lineWidth = focused ? 1.5 : 0.35 + (e.weight ?? 0.5) * 0.5
        ctx.beginPath()
        ctx.moveTo(a.sx, a.sy)
        ctx.lineTo(b.sx, b.sy)
        ctx.stroke()
      }
    }

    if (showCoMentions) {
      for (const c of visible.coMentions) {
        const a = proj.get(c.from)
        const b = proj.get(c.to)
        if (!a || !b) continue
        if (focusSet && !(focusSet.has(c.from) && focusSet.has(c.to))) continue
        ctx.strokeStyle = `rgba(251,191,36,${focusSet ? 0.5 : 0.1})`
        ctx.lineWidth = Math.min(0.5 + c.count / 18, 2.2)
        ctx.beginPath()
        ctx.moveTo(a.sx, a.sy)
        ctx.lineTo(b.sx, b.sy)
        ctx.stroke()
      }
    }

    // Painter's algorithm: far to near, so near stars occlude far ones.
    const items: Projected[] = []
    for (const n of visible.nodes) {
      const p = proj.get(n.symbol)
      if (!p) continue
      const m = magnitude.get(n.symbol) ?? 0
      items.push({
        node: n,
        sx: p.sx,
        sy: p.sy,
        depth: p.depth,
        // Perspective scaling on the radius is what makes near stars read as
        // near rather than merely brighter.
        r: (R_MIN + m * (R_MAX - R_MIN)) * p.k * zoom,
        rgb: sectorRgb(n.topSectorId)
      })
    }
    items.sort((a, b) => a.depth - b.depth)
    projectedRef.current = items

    for (const it of items) {
      const dimmed =
        (focusSet && !focusSet.has(it.node.symbol)) ||
        (matches && !matches.has(it.node.symbol))
      const isSelected = selected?.symbol === it.node.symbol
      const alpha = dimmed ? 0.08 : 1

      // Corona. A radial gradient per star is what gives the galaxy read.
      const glowR = Math.max(it.r * 3.2, 6)
      const g = ctx.createRadialGradient(it.sx, it.sy, 0, it.sx, it.sy, glowR)
      g.addColorStop(0, `rgba(${it.rgb},${0.55 * alpha})`)
      g.addColorStop(0.35, `rgba(${it.rgb},${0.16 * alpha})`)
      g.addColorStop(1, `rgba(${it.rgb},0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(it.sx, it.sy, glowR, 0, Math.PI * 2)
      ctx.fill()

      // Core, with a hot centre offset toward the light.
      const core = ctx.createRadialGradient(
        it.sx - it.r * 0.3,
        it.sy - it.r * 0.3,
        it.r * 0.1,
        it.sx,
        it.sy,
        Math.max(it.r, 0.6)
      )
      core.addColorStop(0, `rgba(255,255,255,${0.95 * alpha})`)
      core.addColorStop(0.4, `rgba(${it.rgb},${alpha})`)
      core.addColorStop(1, `rgba(${it.rgb},${0.65 * alpha})`)
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(it.sx, it.sy, Math.max(it.r, 0.6), 0, Math.PI * 2)
      ctx.fill()

      // Live quote ring — the only thing a 60s tick changes.
      const pct = quoteBySymbol.get(it.node.symbol)?.changePct ?? null
      if (pct !== null && !dimmed && it.r > 2) {
        ctx.strokeStyle = pct >= 0 ? 'rgba(52,211,153,0.9)' : 'rgba(248,113,113,0.9)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(it.sx, it.sy, it.r + 2.4, 0, Math.PI * 2)
        ctx.stroke()
      }

      if (isSelected) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.arc(it.sx, it.sy, it.r + 5, 0, Math.PI * 2)
        ctx.stroke()
      }

      const labelled =
        !dimmed &&
        (it.r > 6 ||
          hover === it.node.symbol ||
          isSelected ||
          (matches?.has(it.node.symbol) ?? false))
      if (labelled) {
        ctx.font = `${Math.max(9, Math.min(13, it.r * 0.9))}px ui-sans-serif, system-ui`
        ctx.textAlign = 'center'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(5,6,10,0.9)'
        ctx.strokeText(it.node.symbol, it.sx, it.sy + it.r + 11)
        ctx.fillStyle = 'rgba(228,228,231,0.95)'
        ctx.fillText(it.node.symbol, it.sx, it.sy + it.r + 11)
      }
    }
  }, [
    visible,
    layout,
    magnitude,
    sectorRgb,
    quoteBySymbol,
    matches,
    adjacency,
    showEdges,
    showCoMentions,
    selected
  ])

  // Single scheduling point. Every interaction asks for a frame rather than
  // drawing inline, so a burst of pointer events coalesces into one paint.
  const requestDraw = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      draw()
    })
  }, [draw])

  useEffect(() => {
    requestDraw()
  }, [requestDraw])

  useEffect(() => {
    const onResize = (): void => requestDraw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [requestDraw])

  // Opt-in continuous orbit. Off by default: CLAUDE.md bans perpetual
  // animation because it visibly jitters under macOS screen capture, and an
  // idle graph should cost no CPU. The loop is fully torn down when disabled.
  useEffect(() => {
    if (!autoOrbit) return
    let alive = true
    let handle = 0
    const step = (): void => {
      if (!alive) return
      camRef.current.yaw += 0.0022
      draw()
      handle = requestAnimationFrame(step)
    }
    handle = requestAnimationFrame(step)
    return () => {
      alive = false
      cancelAnimationFrame(handle)
    }
  }, [autoOrbit, draw])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  // Nearest projected star under the cursor. Uses the same array the draw
  // pass produced, so hit-testing always matches what is on screen.
  const pick = (clientX: number, clientY: number): MarketGraphNode | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    let best: MarketGraphNode | null = null
    let bestD = Infinity
    // Reverse order = nearest first, so an occluding star wins the pick.
    for (let i = projectedRef.current.length - 1; i >= 0; i--) {
      const it = projectedRef.current[i]
      const d = Math.hypot(it.sx - x, it.sy - y)
      if (d <= Math.max(it.r + 5, 7) && d < bestD) {
        bestD = d
        best = it.node
      }
    }
    return best
  }

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

  const palette = sectorOptions.map((s) => ({ ...s, rgb: sectorRgb(s.id) }))

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
          <span className="text-[10px] text-amber-400/80">
            using connections — market caps not cached yet
          </span>
        )}
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          Sector
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="max-w-[13rem] rounded bg-zinc-900 px-1 py-1 text-xs text-zinc-200 ring-1 ring-zinc-800"
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
          Co-mentions
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={autoOrbit}
            onChange={(e) => setAutoOrbit(e.target.checked)}
          />
          Orbit
        </label>
        <button
          onClick={() => {
            camRef.current = { yaw: 0.5, pitch: -0.25, zoom: 1 }
            requestDraw()
          }}
          className="rounded bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800"
        >
          reset view
        </button>
        <span className="ml-auto text-xs text-zinc-500">
          {visible.nodes.length} nodes · {visible.edges.length} links
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ cursor: dragRef.current ? 'grabbing' : 'grab', display: 'block' }}
          onPointerDown={(e) => {
            const { yaw, pitch } = camRef.current
            dragRef.current = { x: e.clientX, y: e.clientY, yaw, pitch }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const d = dragRef.current
            if (d) {
              // Drag to orbit. Pitch is clamped just shy of the poles so the
              // scene never flips through vertical.
              camRef.current.yaw = d.yaw + (e.clientX - d.x) * 0.006
              camRef.current.pitch = Math.max(
                -Math.PI / 2 + 0.05,
                Math.min(Math.PI / 2 - 0.05, d.pitch + (e.clientY - d.y) * 0.006)
              )
              requestDraw()
              return
            }
            // Hover updates a ref and repaints directly — no setState, so
            // there is no React reconciliation on pointer move. That is what
            // removes the jitter the SVG version had.
            const hit = pick(e.clientX, e.clientY)
            const next = hit?.symbol ?? null
            if (next !== hoverRef.current) {
              hoverRef.current = next
              requestDraw()
            }
          }}
          onPointerUp={(e) => {
            const d = dragRef.current
            dragRef.current = null
            e.currentTarget.releasePointerCapture(e.pointerId)
            // Treat a near-stationary press as a click, so orbiting never
            // selects by accident.
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) {
              setSelected(pick(e.clientX, e.clientY))
            }
            requestDraw()
          }}
          onPointerLeave={() => {
            if (hoverRef.current !== null) {
              hoverRef.current = null
              requestDraw()
            }
          }}
          onWheel={(e) => {
            camRef.current.zoom = Math.max(
              0.35,
              Math.min(6, camRef.current.zoom * (e.deltaY > 0 ? 1 / 1.12 : 1.12))
            )
            requestDraw()
          }}
        />

        {selected && (
          <div className="absolute right-4 top-4 w-64 rounded-lg border border-zinc-700 bg-zinc-950/95 p-3 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-zinc-100">{selected.symbol}</div>
                {selected.name && (
                  <div className="text-xs text-zinc-400">{selected.name}</div>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-zinc-500 hover:text-zinc-300"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {selected.topSectorName && (
              <div className="mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] text-zinc-300 ring-1 ring-zinc-700">
                {selected.topSectorName}
              </div>
            )}

            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
              <dt className="text-zinc-500">Links</dt>
              <dd className="text-zinc-300">{degree.get(selected.symbol) ?? 0}</dd>
              <dt className="text-zinc-500">Articles</dt>
              <dd className="text-zinc-300">{selected.newsCount}</dd>
              {selected.marketCap ? (
                <>
                  <dt className="text-zinc-500">Market cap</dt>
                  <dd className="text-zinc-300">
                    ${(selected.marketCap / 1e9).toFixed(1)}B
                  </dd>
                </>
              ) : null}
              {(() => {
                const q = quoteBySymbol.get(selected.symbol)
                if (!q || q.price === null) return null
                return (
                  <>
                    <dt className="text-zinc-500">Price</dt>
                    <dd
                      className={
                        (q.changePct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }
                    >
                      ${q.price.toFixed(2)}
                      {q.changePct !== null ? ` (${q.changePct.toFixed(2)}%)` : ''}
                    </dd>
                  </>
                )
              })()}
            </dl>

            {selected.blurb && (
              <p className="mt-2 text-[11px] leading-snug text-zinc-400">{selected.blurb}</p>
            )}

            <button
              onClick={() => onSelectSymbol?.(selected.symbol)}
              disabled={!onSelectSymbol}
              className="mt-3 w-full rounded bg-emerald-500/15 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40"
            >
              Open {selected.symbol}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-500">
        {palette.slice(0, 8).map((s) => (
          <span key={s.id} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: `rgb(${s.rgb})` }}
            />
            {s.name}
          </span>
        ))}
        <span className="ml-auto">drag to rotate · scroll to zoom · click a star</span>
      </div>
    </div>
  )
}
