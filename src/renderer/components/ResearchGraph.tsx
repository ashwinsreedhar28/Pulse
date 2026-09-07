// Orbitable 3D citation graph over the paper corpus — the research
// counterpart to MarketGraph.
//
// The existing ResearchMap draws bookmark-to-bookmark foundational links
// only, so with a handful of bookmarks it is structurally empty regardless of
// how good the renderer is. This reads the growing citation graph
// (research_graph_nodes/edges), which accumulates as papers are expanded, and
// is therefore the surface that actually gets richer the more the module is
// used — the same property that makes the stock graph worth looking at.
//
// Shares forceLayout3D and the canvas approach with MarketGraph for the same
// reasons documented there: SVG re-rendered every edge on hover (the jitter),
// and rotation needs a projection-only redraw path. Layout runs once per
// topology change; the camera never re-runs it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ResearchGraphNode,
  ResearchGraphPayload
} from '../../preload'
import { runForceLayout3D, type LayoutEdge, type LayoutPosition3D } from './forceLayout'

const R_MIN = 2.5
const R_MAX = 16
const FOV = 3.2

type SizeMetric = 'citations' | 'influential' | 'degree' | 'uniform'

const SIZE_LABELS: Record<SizeMetric, string> = {
  citations: 'Citations',
  influential: 'Influential cites',
  degree: 'Connections',
  uniform: 'Uniform'
}

type ColorMode = 'field' | 'cluster' | 'depth'

// Deterministic palette, indexed by sorted position so a field keeps its
// colour across reloads.
const PALETTE = [
  '56,189,248', '74,222,128', '251,191,36', '232,121,249', '251,113,133',
  '129,140,248', '251,146,60', '45,212,191', '167,139,250', '163,230,53',
  '34,211,238', '244,114,182'
]
const NEUTRAL_RGB = '113,113,122'
// Seeds are the papers the user chose; everything else was reached by
// expansion. Depth colouring makes that distinction the primary read.
const DEPTH_RGB = ['250,204,21', '56,189,248', '100,116,139']

interface Projected {
  node: ResearchGraphNode
  sx: number
  sy: number
  depth: number
  r: number
  rgb: string
}

interface Props {
  onOpenURL?: (url: string, title: string, subtitle?: string | null) => void
}

export function ResearchGraph({ onOpenURL }: Props): JSX.Element {
  const [data, setData] = useState<ResearchGraphPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sizeBy, setSizeBy] = useState<SizeMetric>('degree')
  const [colorBy, setColorBy] = useState<ColorMode>('field')
  const [fieldFilter, setFieldFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ResearchGraphNode | null>(null)
  const [growing, setGrowing] = useState(false)
  const [growNote, setGrowNote] = useState<string | null>(null)
  const [autoOrbit, setAutoOrbit] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Camera and hover live in refs so pointer movement never triggers a React
  // render. This is what keeps rotation and hover smooth at graph scale.
  const camRef = useRef({ yaw: 0.5, pitch: -0.25, zoom: 1 })
  const hoverRef = useRef<string | null>(null)
  const projectedRef = useRef<Projected[]>([])
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const payload = await window.api.research.graph()
      setData(payload)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const grow = useCallback(
    async (paperId?: string): Promise<void> => {
      setGrowing(true)
      setGrowNote(null)
      try {
        const res = paperId
          ? await window.api.research.expandFromPaper(paperId)
          : await window.api.research.expandGraph()
        setGrowNote(
          res.papersExpanded === 0
            ? 'Nothing left to expand at this depth.'
            : `+${res.nodesAdded} papers, +${res.edgesAdded} links ` +
              `(${res.stats.nodes} total, ${res.stats.expanded} expanded)`
        )
        await load()
      } catch (err) {
        setGrowNote(err instanceof Error ? err.message : String(err))
      } finally {
        setGrowing(false)
      }
    },
    [load]
  )

  const fieldOptions = useMemo(() => data?.fields ?? [], [data])

  const colorOf = useMemo(() => {
    const order = fieldOptions.map((f) => f.name).sort()
    return (n: ResearchGraphNode): string => {
      if (colorBy === 'depth') return DEPTH_RGB[Math.min(n.depth, DEPTH_RGB.length - 1)]
      if (colorBy === 'cluster') {
        return n.cluster === null ? NEUTRAL_RGB : PALETTE[n.cluster % PALETTE.length]
      }
      if (!n.field) return NEUTRAL_RGB
      const i = order.indexOf(n.field)
      return i === -1 ? NEUTRAL_RGB : PALETTE[i % PALETTE.length]
    }
  }, [fieldOptions, colorBy])

  const visible = useMemo(() => {
    if (!data) return { nodes: [], edges: [] }
    const nodes =
      fieldFilter === 'all' ? data.nodes : data.nodes.filter((n) => n.field === fieldFilter)
    const keep = new Set(nodes.map((n) => n.paperId))
    return { nodes, edges: data.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) }
  }, [data, fieldFilter])

  const magnitude = useMemo(() => {
    const raw = new Map<string, number>()
    for (const n of visible.nodes) {
      const v =
        sizeBy === 'citations'
          ? Math.log10(Math.max(n.citationCount, 1))
          : sizeBy === 'influential'
            ? Math.log10(Math.max(n.influentialCitationCount, 1))
            : sizeBy === 'degree'
              ? Math.sqrt(n.degree)
              : 1
      raw.set(n.paperId, v)
    }
    const nums = [...raw.values()]
    const lo = nums.length ? Math.min(...nums) : 0
    const hi = nums.length ? Math.max(...nums) : 1
    const span = hi - lo || 1
    const out = new Map<string, number>()
    for (const [k, v] of raw) out.set(k, sizeBy === 'uniform' ? 0.5 : (v - lo) / span)
    return out
  }, [visible.nodes, sizeBy])

  // Same connectivity split as MarketGraph: only connected papers go through
  // the O(n^2) simulation. Isolated ones (freshly seeded, not yet expanded)
  // would otherwise just be pushed outward until the trimmed scaling squashed
  // the real structure into the middle.
  const layout = useMemo(() => {
    const connectedIds = new Set<string>()
    for (const e of visible.edges) {
      connectedIds.add(e.from)
      connectedIds.add(e.to)
    }
    const connected = visible.nodes.filter((n) => connectedIds.has(n.paperId))
    const isolated = visible.nodes.filter((n) => !connectedIds.has(n.paperId))
    const edges: LayoutEdge[] = visible.edges.map((e) => ({ from: e.from, to: e.to }))
    const pos = runForceLayout3D(
      connected.map((n) => n.paperId),
      edges
    )
    const map = new Map<string, LayoutPosition3D>(pos.map((p) => [p.id, p]))

    if (isolated.length > 0) {
      const SHELL = 1.9
      isolated.forEach((n, i) => {
        const golden = Math.PI * (3 - Math.sqrt(5))
        const y = 1 - (i / Math.max(isolated.length - 1, 1)) * 2
        const r = Math.sqrt(Math.max(0, 1 - y * y))
        const theta = golden * i
        map.set(n.paperId, {
          id: n.paperId,
          x: Math.cos(theta) * r * SHELL,
          y: y * SHELL,
          z: Math.sin(theta) * r * SHELL
        })
      })
    }
    return map
  }, [visible.nodes, visible.edges])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return new Set(
      visible.nodes
        .filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.authors.some((a) => a.toLowerCase().includes(q)) ||
            (n.venue ?? '').toLowerCase().includes(q)
        )
        .map((n) => n.paperId)
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

    const project = (
      p: LayoutPosition3D
    ): { sx: number; sy: number; depth: number; k: number } => {
      const x1 = p.x * cy + p.z * sy
      const z1 = -p.x * sy + p.z * cy
      const y2 = p.y * cp - z1 * sp
      const z2 = p.y * sp + z1 * cp
      const k = FOV / (FOV + z2)
      return { sx: cxp + x1 * k * baseScale, sy: cyp + y2 * k * baseScale, depth: -z2, k }
    }

    const proj = new Map<string, { sx: number; sy: number; depth: number; k: number }>()
    for (const n of visible.nodes) {
      const p = layout.get(n.paperId)
      if (p) proj.set(n.paperId, project(p))
    }

    const hover = hoverRef.current
    const focusSet = hover ? new Set([hover, ...(adjacency.get(hover) ?? [])]) : null

    for (const e of visible.edges) {
      const a = proj.get(e.from)
      const b = proj.get(e.to)
      if (!a || !b) continue
      const focused = focusSet ? focusSet.has(e.from) && focusSet.has(e.to) : null
      if (focused === false) continue
      // Influential citations are a far stronger signal than a bare
      // reference, so they read brighter and warmer.
      const influential = e.relationship === 'influential'
      const rgb = influential ? '251,191,36' : '99,132,190'
      const alpha = focused ? 0.8 : (influential ? 0.14 : 0.06) + ((a.k + b.k) / 2) * 0.06
      ctx.strokeStyle = `rgba(${rgb},${alpha})`
      ctx.lineWidth = focused ? 1.4 : influential ? 0.7 : 0.4
      ctx.beginPath()
      ctx.moveTo(a.sx, a.sy)
      ctx.lineTo(b.sx, b.sy)
      ctx.stroke()
    }

    const items: Projected[] = []
    for (const n of visible.nodes) {
      const p = proj.get(n.paperId)
      if (!p) continue
      const m = magnitude.get(n.paperId) ?? 0
      items.push({
        node: n,
        sx: p.sx,
        sy: p.sy,
        depth: p.depth,
        r: (R_MIN + m * (R_MAX - R_MIN)) * p.k * zoom,
        rgb: colorOf(n)
      })
    }
    // Painter's algorithm — far to near, so near papers occlude far ones.
    items.sort((a, b) => a.depth - b.depth)
    projectedRef.current = items

    for (const it of items) {
      const dimmed =
        (focusSet && !focusSet.has(it.node.paperId)) ||
        (matches && !matches.has(it.node.paperId))
      const isSelected = selected?.paperId === it.node.paperId
      const alpha = dimmed ? 0.08 : 1

      const glowR = Math.max(it.r * 3.2, 6)
      const g = ctx.createRadialGradient(it.sx, it.sy, 0, it.sx, it.sy, glowR)
      g.addColorStop(0, `rgba(${it.rgb},${0.5 * alpha})`)
      g.addColorStop(0.35, `rgba(${it.rgb},${0.15 * alpha})`)
      g.addColorStop(1, `rgba(${it.rgb},0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(it.sx, it.sy, glowR, 0, Math.PI * 2)
      ctx.fill()

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

      // Bookmarked papers get a ring — the user's own library should be
      // findable at a glance inside a graph mostly made of other people's work.
      if (it.node.bookmarked && !dimmed) {
        ctx.strokeStyle = 'rgba(250,204,21,0.9)'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(it.sx, it.sy, it.r + 2.6, 0, Math.PI * 2)
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
        (it.r > 7 ||
          hover === it.node.paperId ||
          isSelected ||
          (matches?.has(it.node.paperId) ?? false))
      if (labelled) {
        // Titles are long; a short prefix is enough to recognise a paper you
        // know, and the panel has the full text.
        const label =
          it.node.title.length > 38 ? it.node.title.slice(0, 36) + '…' : it.node.title
        ctx.font = `${Math.max(9, Math.min(12, it.r * 0.8))}px ui-sans-serif, system-ui`
        ctx.textAlign = 'center'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(5,6,10,0.9)'
        ctx.strokeText(label, it.sx, it.sy + it.r + 11)
        ctx.fillStyle = 'rgba(228,228,231,0.95)'
        ctx.fillText(label, it.sx, it.sy + it.r + 11)
      }
    }
  }, [visible, layout, magnitude, colorOf, matches, adjacency, selected])

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

  // Opt-in only — CLAUDE.md bans perpetual animation by default because it
  // jitters under screen capture. Fully torn down when disabled.
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

  const pick = (clientX: number, clientY: number): ResearchGraphNode | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    let best: ResearchGraphNode | null = null
    let bestD = Infinity
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

  if (loading) return <div className="p-8 text-sm text-zinc-400">Loading paper graph…</div>
  if (error) return <div className="p-8 text-sm text-rose-400">Couldn&apos;t load graph: {error}</div>

  const empty = !data || data.nodes.length === 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find paper / author…"
          className="w-44 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none ring-1 ring-zinc-800 focus:ring-sky-700"
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
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          Colour
          <select
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value as ColorMode)}
            className="rounded bg-zinc-900 px-1 py-1 text-xs text-zinc-200 ring-1 ring-zinc-800"
          >
            <option value="field">Field</option>
            <option value="cluster">Semantic cluster</option>
            <option value="depth">Distance from your papers</option>
          </select>
        </label>
        {fieldOptions.length > 0 && (
          <label className="flex items-center gap-1 text-xs text-zinc-400">
            Field
            <select
              value={fieldFilter}
              onChange={(e) => setFieldFilter(e.target.value)}
              className="max-w-[12rem] rounded bg-zinc-900 px-1 py-1 text-xs text-zinc-200 ring-1 ring-zinc-800"
            >
              <option value="all">All ({data?.nodes.length ?? 0})</option>
              {fieldOptions.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} ({f.count})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={autoOrbit}
            onChange={(e) => setAutoOrbit(e.target.checked)}
          />
          Orbit
        </label>
        <button
          onClick={() => void grow()}
          disabled={growing}
          className="rounded bg-sky-500/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-500/25 disabled:opacity-50"
        >
          {growing ? 'Growing…' : 'Grow graph'}
        </button>
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
          {visible.nodes.length} papers · {visible.edges.length} citations
          {data ? ` · ${data.stats.expanded}/${data.stats.nodes} expanded` : ''}
        </span>
      </div>

      {growNote && (
        <div className="border-b border-zinc-800 bg-zinc-900/40 px-4 py-1 text-[11px] text-zinc-400">
          {growNote}
        </div>
      )}

      <div className="relative min-h-0 flex-1 bg-[#05060a]">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="max-w-md text-sm text-zinc-400">
              The paper graph is empty. It grows from papers you&apos;ve engaged
              with — bookmark a paper or generate a paper chain, then Grow graph
              walks its references and citations to build the neighbourhood.
            </p>
            <button
              onClick={() => void grow()}
              disabled={growing}
              className="rounded bg-sky-500/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-500/25 disabled:opacity-50"
            >
              {growing ? 'Growing…' : 'Grow from my library'}
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="h-full w-full"
            style={{ cursor: dragging ? 'grabbing' : 'grab', display: 'block' }}
            onPointerDown={(e) => {
              const { yaw, pitch } = camRef.current
              dragRef.current = { x: e.clientX, y: e.clientY, yaw, pitch }
              setDragging(true)
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const d = dragRef.current
              if (d) {
                camRef.current.yaw = d.yaw + (e.clientX - d.x) * 0.006
                camRef.current.pitch = Math.max(
                  -Math.PI / 2 + 0.05,
                  Math.min(Math.PI / 2 - 0.05, d.pitch + (e.clientY - d.y) * 0.006)
                )
                requestDraw()
                return
              }
              const hit = pick(e.clientX, e.clientY)
              const next = hit?.paperId ?? null
              if (next !== hoverRef.current) {
                hoverRef.current = next
                requestDraw()
              }
            }}
            onPointerUp={(e) => {
              const d = dragRef.current
              dragRef.current = null
              setDragging(false)
              e.currentTarget.releasePointerCapture(e.pointerId)
              // A near-stationary press is a click, so orbiting never selects
              // by accident.
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
        )}

        {selected && (
          <div className="absolute right-4 top-4 max-h-[80%] w-80 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950/95 p-3 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-semibold leading-snug text-zinc-100">
                {selected.title}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="shrink-0 text-zinc-500 hover:text-zinc-300"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-1 text-[11px] text-zinc-400">
              {selected.authors.slice(0, 3).join(', ')}
              {selected.authors.length > 3 ? ' et al.' : ''}
              {selected.year ? ` · ${selected.year}` : ''}
            </div>
            {selected.venue && (
              <div className="text-[11px] text-zinc-500">{selected.venue}</div>
            )}

            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
              <span className="rounded px-1.5 py-0.5 text-zinc-300 ring-1 ring-zinc-700">
                {selected.citationCount.toLocaleString()} cites
              </span>
              <span className="rounded px-1.5 py-0.5 text-zinc-300 ring-1 ring-zinc-700">
                {selected.influentialCitationCount} influential
              </span>
              <span className="rounded px-1.5 py-0.5 text-zinc-300 ring-1 ring-zinc-700">
                {selected.degree} links
              </span>
              {selected.bookmarked && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300 ring-1 ring-amber-500/30">
                  bookmarked
                </span>
              )}
              <span className="rounded px-1.5 py-0.5 text-zinc-400 ring-1 ring-zinc-800">
                {selected.depth === 0 ? 'your paper' : `${selected.depth} hop${selected.depth > 1 ? 's' : ''} out`}
              </span>
            </div>

            {selected.abstract && (
              <p className="mt-2 max-h-32 overflow-y-auto text-[11px] leading-snug text-zinc-400">
                {selected.abstract}
              </p>
            )}

            <div className="mt-3 flex flex-col gap-1.5">
              <button
                onClick={() => void grow(selected.paperId)}
                disabled={growing}
                className="w-full rounded bg-sky-500/15 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-500/25 disabled:opacity-40"
              >
                {selected.expanded ? 'Re-expand from here' : 'Expand from here'}
              </button>
              {selected.pdfUrl && onOpenURL && (
                <button
                  onClick={() =>
                    onOpenURL(selected.pdfUrl as string, selected.title, selected.venue)
                  }
                  className="w-full rounded bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700"
                >
                  Open PDF
                </button>
              )}
              {selected.url && onOpenURL && (
                <button
                  onClick={() => onOpenURL(selected.url as string, selected.title, selected.venue)}
                  className="w-full rounded bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700"
                >
                  Open page
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!empty && (
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            influential citation
          </span>
          {data && data.hubs.length > 0 && (
            <span className="truncate">
              most-connected: {data.hubs.slice(0, 3).map((h) => h.title.slice(0, 28)).join(' · ')}
            </span>
          )}
          <span className="ml-auto">drag to rotate · scroll to zoom · click a paper</span>
        </div>
      )}
    </div>
  )
}
