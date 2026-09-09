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
import type { LayoutEdge, LayoutPosition3D } from './forceLayout'
import { runClusteredLayout3D } from './clusteredLayout'

const R_MIN = 2.5
const R_MAX = 15

// Camera distance in layout units. The structure is normalized to roughly a
// unit sphere, so ~3.2 frames it with visible perspective without extreme
// foreshortening at the near edge.
const FOV = 3.2
// Labels are drawn at a fixed screen size rather than scaled with node radius:
// text that shrinks with the geometry is the fastest way to make a graph
// unreadable exactly when you zoom out to see structure.
const LABEL_PX = 11
// Star sprites are rendered once per sector colour and blitted, instead of
// building two radial gradients per node per frame. At ~1,400 nodes that was
// ~2,900 gradient objects (each a heap allocation plus a Skia shader) every
// frame — roughly 177k/second during a drag, which alone blew the frame budget.
const SPRITE_PX = 64

function buildSprite(rgb: string, kind: 'glow' | 'core'): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SPRITE_PX
  c.height = SPRITE_PX
  const g = c.getContext('2d')
  if (!g) return c
  const half = SPRITE_PX / 2
  if (kind === 'glow') {
    const grad = g.createRadialGradient(half, half, 0, half, half, half)
    grad.addColorStop(0, `rgba(${rgb},0.55)`)
    grad.addColorStop(0.35, `rgba(${rgb},0.16)`)
    grad.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX)
    return c
  }
  // Core keeps the off-centre hot spot that made stars read as lit rather
  // than as flat discs.
  const grad = g.createRadialGradient(half * 0.7, half * 0.7, half * 0.1, half, half, half)
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.4, `rgba(${rgb},1)`)
  grad.addColorStop(1, `rgba(${rgb},0.65)`)
  g.fillStyle = grad
  g.beginPath()
  g.arc(half, half, half, 0, Math.PI * 2)
  g.fill()
  return c
}
// Hard ceiling on labels per frame. Past roughly this many, added labels stop
// carrying information and start being texture.
const MAX_LABELS = 70

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
  /**
   * `name` is passed alongside so the caller can materialize a ticker row for
   * a symbol that isn't on the watchlist without inventing a company name.
   */
  onSelectSymbol?: (symbol: string, name?: string | null) => void
}

export default function MarketGraph({ quotes, onSelectSymbol }: Props): JSX.Element {
  const [data, setData] = useState<MarketGraphPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sizeBy, setSizeBy] = useState<SizeMetric>('degree')
  const [sectorFilter, setSectorFilter] = useState<string>('all')
  const [showCoMentions, setShowCoMentions] = useState(false)
  const [showEdges, setShowEdges] = useState(true)
  const [relSupplier, setRelSupplier] = useState(true)
  const [relCompetitor, setRelCompetitor] = useState(true)
  const [relPartner, setRelPartner] = useState(true)
  const [minDegree, setMinDegree] = useState(1)
  const [autoOrbit, setAutoOrbit] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<MarketGraphNode | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Camera and hover live in refs, not state: they change on every pointer
  // move and must never trigger a React render.
  //
  // panX/panY are screen-space translation. Without them the camera had only
  // yaw/pitch/zoom, so dragging could only orbit and zoom was locked to the
  // canvas centre — which meant zooming in pushed the thing you were zooming
  // toward off-screen with no way to reach it.
  const camRef = useRef({ yaw: 0.5, pitch: -0.25, zoom: 1, panX: 0, panY: 0 })
  const hoverRef = useRef<string | null>(null)
  const projectedRef = useRef<Projected[]>([])
  const dragRef = useRef<{
    x: number
    y: number
    mode: 'orbit' | 'pan'
    yaw: number
    pitch: number
    panX: number
    panY: number
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  // Sector colours are a fixed small palette, so sprites are built at most
  // once per colour for the life of the component.
  const spriteCacheRef = useRef(
    new Map<string, { glow: HTMLCanvasElement; core: HTMLCanvasElement }>()
  )
  // Mirrors dragRef for the cursor only. Reading a ref during render never
  // re-renders, so the old `dragRef.current ? 'grabbing' : 'grab'` could not
  // ever change the cursor.
  const [dragging, setDragging] = useState<'orbit' | 'pan' | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = (initial: boolean): void => {
      if (initial) setLoading(true)
      window.api.graph
        .getMarketGraph()
        .then((p) => {
          if (!cancelled) {
            setData(p)
            setError(null)
          }
        })
        .catch((err: unknown) => {
          if (!cancelled && initial) setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (!cancelled && initial) setLoading(false)
        })
    }
    load(true)
    // The graph used to be fetched exactly once on mount, so it silently went
    // stale the moment anything grew it — during a chain-generation run that
    // means watching a snapshot while hundreds of nodes and edges accumulate
    // behind it. `graph:updated` already exists and GraphUpdatesTab uses it.
    const off = window.api.graph.onUpdated(() => load(false))
    return () => {
      cancelled = true
      off()
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
    // Precomputed map rather than order.indexOf(id) per lookup — this is
    // called once per node per frame, so a linear scan inside it was O(nodes ×
    // sectors) of pure waste in the hot path.
    const byId = new Map(order.map((id, i) => [id, SECTOR_PALETTE[i % SECTOR_PALETTE.length]]))
    return (id: string | null): string => (id ? (byId.get(id) ?? NEUTRAL_RGB) : NEUTRAL_RGB)
  }, [sectorOptions])

  // Nodes with no top-level sector. They render grey and are unreachable from
  // the Sector dropdown, so the legend has to account for them or they read as
  // a rendering fault.
  const unclassifiedCount = useMemo(
    () => (data ? data.nodes.filter((n) => !n.topSectorId).length : 0),
    [data]
  )

  const visible = useMemo(() => {
    if (!data) return { nodes: [], edges: [], coMentions: [] }

    // Relationship gate first — it is the biggest single lever on density
    // (competitor edges alone are ~39% of the graph).
    const relOk = (r: string): boolean =>
      r === 'supplier' ? relSupplier : r === 'competitor' ? relCompetitor : r === 'partner' ? relPartner : true
    let edges = data.edges.filter((e) => relOk(e.relationship))

    // Sector gate. Keeping only edges with BOTH endpoints inside the sector
    // deleted every cross-sector link, which is precisely the interesting part
    // of a supply chain — a semiconductor filter that hides who the chips go
    // to answers the wrong question. One endpoint inside is enough; the node
    // set is widened to include whatever those edges reach.
    let nodes = data.nodes
    if (sectorFilter !== 'all') {
      const inSector = new Set(
        data.nodes.filter((n) => n.topSectorId === sectorFilter).map((n) => n.symbol)
      )
      edges = edges.filter((e) => inSector.has(e.from) || inSector.has(e.to))
      const reachable = new Set(inSector)
      for (const e of edges) {
        reachable.add(e.from)
        reachable.add(e.to)
      }
      nodes = data.nodes.filter((n) => reachable.has(n.symbol))
    }

    // Minimum-degree gate. Weight would be the obvious knob here and is
    // useless: chainAbsorberService hardcodes 0.65, so 95% of edges carry the
    // identical value and a weight slider filters nothing. Degree actually
    // discriminates — measured on the live graph, deg>=2 drops 30% of nodes
    // and deg>=3 drops 45%, and what it drops is leaves that add ink without
    // structure.
    if (minDegree > 1) {
      const deg = new Map<string, number>()
      for (const e of edges) {
        deg.set(e.from, (deg.get(e.from) ?? 0) + 1)
        deg.set(e.to, (deg.get(e.to) ?? 0) + 1)
      }
      nodes = nodes.filter((n) => (deg.get(n.symbol) ?? 0) >= minDegree)
    }

    const keep = new Set(nodes.map((n) => n.symbol))
    return {
      nodes,
      edges: edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
      coMentions: data.coMentions.filter((c) => keep.has(c.from) && keep.has(c.to))
    }
  }, [data, sectorFilter, relSupplier, relCompetitor, relPartner, minDegree])

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
  //
  // Clustered by sector: every node is pulled toward its own sector centre,
  // repulsion runs only within a sector, and cross-sector edges are softened
  // so galaxies bend toward each other without merging. Sector centres are
  // themselves positioned by cross-sector link counts, so sectors that
  // actually trade with each other end up adjacent.
  //
  // This replaces a plain force pass plus an outer shell for unconnected
  // nodes. That version put the ~286 connected symbols in one central knot
  // and scattered the other ~1,000 across latitude bands, which rendered as
  // stripes on a sphere — structure invented by the layout rather than
  // present in the data. Grouping also makes including all 1,300 nodes
  // affordable: per-sector repulsion is a sum of small O(k^2) passes rather
  // than one O(n^2) pass over everything.
  const layout = useMemo(() => {
    const ids = visible.nodes.map((n) => n.symbol)
    const sectorById = new Map(visible.nodes.map((n) => [n.symbol, n.topSectorId ?? 'unknown']))
    const edges: LayoutEdge[] = visible.edges.map((e) => ({ from: e.from, to: e.to }))
    const pos = runClusteredLayout3D(ids, edges, (id) => sectorById.get(id) ?? 'unknown')
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
    // A flex/grid parent can still be settling on the first frame after
    // mount, in which case the canvas measures 0 and everything drawn is
    // discarded. Nothing would schedule another frame, so the view stayed
    // blank permanently even with correct data and geometry. Bail out and let
    // the ResizeObserver below drive the real paint.
    if (w === 0 || h === 0) return
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

    const { yaw, pitch, zoom, panX, panY } = camRef.current
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    const cxp = w / 2 + panX
    const cyp = h / 2 + panY
    const baseScale = Math.min(w, h) * 0.42 * zoom
    // Node radius is deliberately NOT scaled by `zoom` the way position is.
    //
    // When both scale together the ink-to-space ratio is invariant, so zooming
    // magnifies the hairball instead of resolving it — 6x zoom gave 6x-wider
    // stars with 6x-wider coronas and exactly the same overlap. Damping the
    // radius lets separation grow faster than the dots do, which is what makes
    // zoom actually pull a cluster apart.
    const radiusZoom = Math.pow(zoom, 0.35)

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

    const spriteCache = spriteCacheRef.current
    const hover = hoverRef.current
    // Focus + context. Hover is transient exploration; a selected node holds
    // the isolation so you can actually read a company's neighbourhood without
    // keeping the mouse perfectly still. Hover wins while it is active.
    const anchor = hover ?? selected?.symbol ?? null
    const focusSet = anchor ? new Set([anchor, ...(adjacency.get(anchor) ?? [])]) : null

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
        // near rather than merely brighter. `radiusZoom` is damped — see above.
        r: (R_MIN + m * (R_MAX - R_MIN)) * p.k * radiusZoom,
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

      // Corona. Capped in absolute pixels: it used to be pure `r * 3.2`, so at
      // high zoom a single star's gradient covered a ~290px radius and 1,400
      // overlapping alpha-blended discs of that size became a fill-rate wall —
      // zooming in made each frame more expensive, not less.
      const glowR = Math.min(Math.max(it.r * 3.2, 6), 44)
      const cr = Math.max(it.r, 0.6)

      // Off-screen rejection. Nothing checked this before, so every node was
      // fully rasterized whether or not it was in frame — and panning or
      // zooming in put most of them out of frame.
      if (
        it.sx + glowR < 0 ||
        it.sx - glowR > w ||
        it.sy + glowR < 0 ||
        it.sy - glowR > h
      ) {
        continue
      }

      let sprites = spriteCache.get(it.rgb)
      if (!sprites) {
        sprites = { glow: buildSprite(it.rgb, 'glow'), core: buildSprite(it.rgb, 'core') }
        spriteCache.set(it.rgb, sprites)
      }

      ctx.globalAlpha = alpha
      ctx.drawImage(sprites.glow, it.sx - glowR, it.sy - glowR, glowR * 2, glowR * 2)
      ctx.drawImage(sprites.core, it.sx - cr, it.sy - cr, cr * 2, cr * 2)
      ctx.globalAlpha = 1

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

    }

    // Labels, as a separate prioritized pass with collision testing.
    //
    // The old rule was inline per node: `it.r > 6 || hovered || selected`. With
    // radius scaling on zoom that threshold fell below every node's size at
    // roughly 2.4x, so all ~1,400 labels drew at once, untested for overlap —
    // ~2,900 text rasterizations a frame producing an unreadable smear. Now the
    // labels that survive a collision test are the ones worth reading, and the
    // order decides who wins a contest rather than paint order deciding it.
    ctx.font = `${LABEL_PX}px ui-sans-serif, system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const boxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
    const score = (it: Projected): number => {
      if (selected?.symbol === it.node.symbol) return 1e9
      if (hover === it.node.symbol) return 1e8
      if (matches?.has(it.node.symbol)) return 1e7
      return it.r
    }
    const labelOrder = [...items]
      .filter((it) => {
        if (focusSet && !focusSet.has(it.node.symbol)) return false
        if (matches && !matches.has(it.node.symbol)) return false
        return true
      })
      .sort((a, b) => score(b) - score(a))

    let drawn = 0
    for (const it of labelOrder) {
      if (drawn >= MAX_LABELS) break
      // Off-screen labels cost the same as visible ones and are worth nothing.
      if (it.sx < -40 || it.sx > w + 40 || it.sy < -20 || it.sy > h + 20) continue
      const forced =
        selected?.symbol === it.node.symbol ||
        hover === it.node.symbol ||
        (matches?.has(it.node.symbol) ?? false)
      const text = it.node.symbol
      const half = ctx.measureText(text).width / 2 + 2
      const ty = it.sy + it.r + 11
      const box = { x1: it.sx - half, y1: ty - LABEL_PX, x2: it.sx + half, y2: ty + 3 }
      if (!forced) {
        let hit = false
        for (const b of boxes) {
          if (box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1) {
            hit = true
            break
          }
        }
        if (hit) continue
      }
      boxes.push(box)
      drawn++
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(5,6,10,0.9)'
      ctx.strokeText(text, it.sx, ty)
      ctx.fillStyle = 'rgba(228,228,231,0.95)'
      ctx.fillText(text, it.sx, ty)
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
  // The queued frame must run the LATEST draw, not the one that was current
  // when the frame was scheduled.
  //
  // Coalescing on `rafRef.current !== null` alone is a trap: if a frame is
  // already pending when new data arrives, the new requestDraw returns early,
  // the pending frame then executes the STALE closure, and nothing schedules
  // another. The canvas keeps rendering an empty layout forever even though
  // state updated correctly — which is exactly how a graph reporting
  // "132 papers" in its header painted nothing at all.
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
  }, [draw])

  // Paint immediately. Used for anything that changes the SCENE (data
  // arriving, layout, filters, selection) rather than the camera.
  //
  // Correctness must never depend on requestAnimationFrame here. Electron
  // sets backgroundThrottling: true, so rAF is paused while the window is
  // hidden — which it is during boot, before the splash hands over. A frame
  // queued in that window never fires, so the `rafRef.current !== null` guard
  // latched permanently and every subsequent request bailed. The result was a
  // canvas that never painted once, with correct data and a correctly sized
  // element behind it.
  const drawNow = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    drawRef.current()
  }, [])

  // Coalesced paint, for high-frequency camera input (drag, wheel, hover).
  // Dropping one of these is harmless; the next pointer event repaints.
  const requestDraw = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      drawRef.current()
    })
  }, [])

  useEffect(() => {
    // drawNow, not requestDraw: a scene change must paint even if the window
    // is currently throttled and rAF is not running.
    drawNow()
  }, [draw, drawNow])

  // Observe the canvas itself, not the window. The element's size changes for
  // reasons a window-resize listener never sees — first layout after mount,
  // a sibling panel opening, the tab becoming visible — and the first of
  // those is exactly when the canvas measures 0 and the initial paint is
  // thrown away.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => drawNow())
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [drawNow])

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
          Min links
          <select
            value={minDegree}
            onChange={(e) => setMinDegree(Number(e.target.value))}
            title="Hide weakly-connected nodes. Leaves are most of the node count and little of the structure."
            className="rounded bg-zinc-900 px-1 py-1 text-xs text-zinc-200 ring-1 ring-zinc-800"
          >
            {[1, 2, 3, 5, 8, 12].map((k) => (
              <option key={k} value={k}>
                {k === 1 ? 'any' : `${k}+`}
              </option>
            ))}
          </select>
        </label>
        {/* Relationship gate. Competitor edges alone are ~39% of the graph, so
            these are the strongest density control available. */}
        <span className="flex items-center gap-2 rounded bg-zinc-900/60 px-2 py-1 ring-1 ring-zinc-800">
          {(
            [
              ['supplier', relSupplier, setRelSupplier],
              ['competitor', relCompetitor, setRelCompetitor],
              ['partner', relPartner, setRelPartner]
            ] as const
          ).map(([label, on, set]) => (
            <label key={label} className="flex items-center gap-1 text-[11px] text-zinc-400">
              <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
              <span style={{ color: `rgb(${EDGE_COLOR[label] ?? EDGE_FALLBACK})` }}>{label}</span>
            </label>
          ))}
        </span>
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
            camRef.current = { yaw: 0.5, pitch: -0.25, zoom: 1, panX: 0, panY: 0 }
            drawNow()
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
          // absolute inset-0 rather than h-full: a canvas is a replaced
          // element with its own intrinsic size, and height:100% inside a
          // flex item resolves to 0 whenever the flex chain has any
          // indefinite link. Pinning it to the relative parent sidesteps the
          // whole class of problem.
          className="absolute inset-0 h-full w-full"
          style={{
            cursor: dragging === 'pan' ? 'grabbing' : dragging ? 'move' : 'grab',
            display: 'block'
          }}
          onPointerDown={(e) => {
            const { yaw, pitch, panX, panY } = camRef.current
            // Shift-drag or middle-drag pans; plain left-drag still orbits,
            // which is the right primary gesture for a 3D scene.
            const mode: 'orbit' | 'pan' = e.shiftKey || e.button === 1 ? 'pan' : 'orbit'
            dragRef.current = { x: e.clientX, y: e.clientY, mode, yaw, pitch, panX, panY }
            setDragging(mode)
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const d = dragRef.current
            if (d) {
              if (d.mode === 'pan') {
                camRef.current.panX = d.panX + (e.clientX - d.x)
                camRef.current.panY = d.panY + (e.clientY - d.y)
                requestDraw()
                return
              }
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
            setDragging(null)
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
            // Cursor-anchored zoom: whatever sits under the pointer stays
            // under the pointer. Centre-anchored zoom (the old behaviour) is
            // what made zooming in feel like losing your place, because the
            // thing you were aiming at slid off-screen.
            //
            // Screen position is `centre + pan + P * baseScale`, and P does not
            // depend on zoom, so holding the cursor point fixed while
            // baseScale scales by f gives pan' = pan + (cursor - centre - pan)
            // * (1 - f). Exact, no iteration.
            const cam = camRef.current
            const prev = cam.zoom
            const next = Math.max(0.35, Math.min(6, prev * (e.deltaY > 0 ? 1 / 1.12 : 1.12)))
            const f = next / prev
            if (f !== 1) {
              const rect = e.currentTarget.getBoundingClientRect()
              const cx = e.clientX - rect.left - rect.width / 2
              const cyy = e.clientY - rect.top - rect.height / 2
              cam.panX += (cx - cam.panX) * (1 - f)
              cam.panY += (cyy - cam.panY) * (1 - f)
              cam.zoom = next
            }
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
              onClick={() => onSelectSymbol?.(selected.symbol, selected.name)}
              disabled={!onSelectSymbol}
              className="mt-3 w-full rounded bg-emerald-500/15 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40"
            >
              Open {selected.symbol}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-500">
        {/* Every sector, not the first 8. With 11-12 top-level sectors the
            slice meant 3-4 colours appeared on the canvas with nothing
            explaining them. */}
        {palette.map((s) => (
          <span key={s.id} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: `rgb(${s.rgb})` }}
            />
            {s.name}
          </span>
        ))}
        {unclassifiedCount > 0 && (
          <span
            className="flex items-center gap-1"
            title="No sector assignment yet — these are grey on the canvas and absent from the Sector filter."
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: `rgb(${NEUTRAL_RGB})` }}
            />
            unclassified ({unclassifiedCount})
          </span>
        )}
        <span className="ml-auto">
          drag to rotate · shift-drag to pan · scroll to zoom · click a star
        </span>
      </div>
    </div>
  )
}
