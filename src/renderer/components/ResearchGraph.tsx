// One paper's citation lineage, as a layered 2D DAG.
//
// This replaces an orbiting 3D "universe" view, which was wrong here for two
// separate reasons.
//
// First, scope. It rendered the entire ~5,000-node corpus, so "build graph
// from this paper" answered a question nobody asked. The useful question
// about a paper is its lineage — what it stands on, and what stands on it.
//
// Second, geometry. Citations carry an arrow of time: 99.3% of edges in this
// corpus point from a newer paper to an older one. A sphere throws that away
// and substitutes arbitrary angular position. Here the vertical axis IS that
// arrow — foundations at the bottom, the focus in the middle, descendants
// above — so "builds on" is legible without reading a single label. The
// median node has degree 1, which also makes force simulation the wrong tool:
// it exists to resolve dense-mesh tension, and there is none to resolve.
//
// Deterministic layered layout, so no simulation and no settling. Pan and
// zoom only, no rotation, and no rAF loop when idle.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NeighborhoodNode, NeighborhoodPayload, ResearchPaper } from '../../preload'

const R_MIN = 5
const R_MAX = 22
const LAYER_GAP = 190
const NODE_GAP = 170

interface Placed {
  node: NeighborhoodNode
  x: number
  y: number
  r: number
}

interface Props {
  /** Paper whose lineage to show. Null shows the picker. */
  focusPaperId: string | null
  onFocusPaper: (paperId: string) => void
  onOpenURL?: (url: string, title: string, subtitle?: string | null) => void
  onSelectPaper?: (p: ResearchPaper) => void
}

// Generation -> colour. Ancestors cool, focus gold, descendants warm, so
// direction is readable from colour as well as position.
function generationColor(g: number): string {
  if (g === 0) return '250,204,21'
  if (g < 0) return g === -1 ? '56,189,248' : '99,132,190'
  return g === 1 ? '74,222,128' : '134,180,120'
}

function generationLabel(g: number): string {
  if (g === 0) return 'this paper'
  if (g === -1) return 'builds on'
  if (g < -1) return `${-g} hops back`
  if (g === 1) return 'cited by'
  return `${g} hops forward`
}

export function ResearchGraph({
  focusPaperId,
  onFocusPaper,
  onOpenURL,
  onSelectPaper
}: Props): JSX.Element {
  const [data, setData] = useState<NeighborhoodPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanding, setExpanding] = useState(false)
  const [hops, setHops] = useState(2)
  const [selected, setSelected] = useState<NeighborhoodNode | null>(null)
  const [picker, setPicker] = useState<Array<{ paperId: string; title: string; degree: number }>>([])

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Camera and hover in refs — pointer movement must not trigger a React
  // render, which is what made the previous version jitter on hover.
  const camRef = useRef({ x: 0, y: 0, zoom: 1 })
  const hoverRef = useRef<string | null>(null)
  const placedRef = useRef<Placed[]>([])
  const dragRef = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)


  const load = useCallback(async (): Promise<void> => {
    if (!focusPaperId) {
      // No focus yet: offer the best-connected papers as entry points, since
      // those produce the most informative lineage.
      try {
        const g = await window.api.research.graph()
        setPicker(g.hubs.slice(0, 12))
      } catch {
        setPicker([])
      }
      setData(null)
      return
    }
    setLoading(true)
    try {
      const payload = await window.api.research.neighborhood(focusPaperId, hops)
      setData(payload)
    } catch (err) {
      console.warn('[research-graph] neighborhood failed:', err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [focusPaperId, hops])

  useEffect(() => {
    void load()
  }, [load])

  const expand = useCallback(async () => {
    if (!focusPaperId) return
    setExpanding(true)
    try {
      await window.api.research.expandFromPaper(focusPaperId)
      await load()
    } catch (err) {
      console.warn('[research-graph] expand failed:', err)
    } finally {
      setExpanding(false)
    }
  }, [focusPaperId, load])

  // Layered layout. Generation sets the row; within a row, papers are ordered
  // by year then citations so each layer reads left-to-right as a timeline.
  // Fully deterministic — same input, same picture, every time.
  const layout = useMemo(() => {
    if (!data || data.nodes.length === 0) return [] as Placed[]

    const byGen = new Map<number, NeighborhoodNode[]>()
    for (const n of data.nodes) {
      const arr = byGen.get(n.generation)
      if (arr) arr.push(n)
      else byGen.set(n.generation, [n])
    }

    // Guard the log scale. If every paper in a neighbourhood has zero
    // citations — entirely normal for a set of fresh preprints — then
    // log10(maxCite) is 0 and the radius below becomes NaN. Canvas throws
    // IndexSizeError on a NaN gradient radius, which aborts the whole draw
    // and leaves a blank screen rather than a visible error.
    const cites = data.nodes.map((n) => n.citationCount)
    const maxCite = Math.max(10, ...cites)

    const out: Placed[] = []
    for (const [gen, group] of byGen) {
      group.sort(
        (a, b) => (a.year ?? 0) - (b.year ?? 0) || a.citationCount - b.citationCount
      )
      const width = (group.length - 1) * NODE_GAP
      group.forEach((n, i) => {
        // Negative generation is older, and older sits lower, so the sign is
        // inverted into screen space (y grows downward on a canvas).
        out.push({
          node: n,
          x: -width / 2 + i * NODE_GAP,
          y: -gen * LAYER_GAP,
          r:
            R_MIN +
            (Math.log10(Math.max(n.citationCount, 1)) / Math.log10(maxCite)) *
              (R_MAX - R_MIN)
        })
      })
    }
    return out
  }, [data])

  const positions = useMemo(() => {
    const m = new Map<string, Placed>()
    for (const p of layout) m.set(p.node.paperId, p)
    return m
  }, [layout])

  // Frame the whole lineage on load.
  //
  // A wide generation is genuinely wide: 100 papers at NODE_GAP spacing is
  // ~17,000px, so at zoom 1 all but a dozen sit off-screen and the view looks
  // broken even when it is drawing correctly. Fitting to the actual bounds
  // makes the shape of the neighbourhood the first thing you see; zoom in for
  // labels.
  // Returns false when it could not fit (no canvas size yet), so the caller
  // knows to try again once the element has been measured.
  const fitToView = useCallback((): boolean => {
    const canvas = canvasRef.current
    if (!canvas || layout.length === 0) return false
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return false
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of layout) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const pad = 90
    const spanX = Math.max(maxX - minX, 1)
    const spanY = Math.max(maxY - minY, 1)
    const zoom = Math.max(
      0.05,
      Math.min(
        1.4,
        Math.min(
          (canvas.clientWidth - pad * 2) / spanX,
          (canvas.clientHeight - pad * 2) / spanY
        )
      )
    )
    // Centre on the layout's midpoint rather than the origin — the focus node
    // is at x=0 but a lopsided neighbourhood is not centred there.
    camRef.current = {
      x: -((minX + maxX) / 2) * zoom,
      y: -((minY + maxY) / 2) * zoom,
      zoom
    }
    return true
  }, [layout])


  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    try {

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
    ctx.fillStyle = '#07080c'
    ctx.fillRect(0, 0, w, h)

    const { x: camX, y: camY, zoom } = camRef.current
    const ox = w / 2 + camX
    const oy = h / 2 + camY
    const sx = (p: Placed): number => ox + p.x * zoom
    const sy = (p: Placed): number => oy + p.y * zoom

    // Generation bands and labels. The whole point of this layout is that
    // vertical position means something, so it is worth saying so explicitly
    // rather than making the user infer it.
    const gens = [...new Set(layout.map((p) => p.node.generation))].sort((a, b) => b - a)
    ctx.font = '10px ui-sans-serif, system-ui'
    for (const g of gens) {
      const y = oy + -g * LAYER_GAP * zoom
      ctx.strokeStyle = g === 0 ? 'rgba(250,204,21,0.16)' : 'rgba(255,255,255,0.045)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
      ctx.fillStyle = g === 0 ? 'rgba(250,204,21,0.75)' : 'rgba(148,163,184,0.5)'
      ctx.textAlign = 'left'
      ctx.fillText(generationLabel(g), 10, y - 6)
    }

    const hover = hoverRef.current
    const neighbours = new Set<string>()
    if (hover) {
      neighbours.add(hover)
      for (const e of data?.edges ?? []) {
        if (e.from === hover) neighbours.add(e.to)
        if (e.to === hover) neighbours.add(e.from)
      }
    }

    // Edges, drawn as vertical-tending curves so direction is obvious even
    // where two papers sit in the same band.
    for (const e of data?.edges ?? []) {
      const a = positions.get(e.from)
      const b = positions.get(e.to)
      if (!a || !b) continue
      const focused = hover ? neighbours.has(e.from) && neighbours.has(e.to) : null
      if (focused === false) continue
      const influential = e.relationship === 'influential'
      ctx.strokeStyle = influential
        ? `rgba(251,191,36,${focused ? 0.85 : 0.34})`
        : `rgba(120,150,200,${focused ? 0.75 : 0.2})`
      ctx.lineWidth = (influential ? 1.5 : 1) * (focused ? 1.6 : 1)
      const x1 = sx(a)
      const y1 = sy(a)
      const x2 = sx(b)
      const y2 = sy(b)
      const mid = (y1 + y2) / 2
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.bezierCurveTo(x1, mid, x2, mid, x2, y2)
      ctx.stroke()
    }

    placedRef.current = layout
    for (const p of layout) {
      const dim = hover ? !neighbours.has(p.node.paperId) : false
      const alpha = dim ? 0.12 : 1
      const rgb = generationColor(p.node.generation)
      const x = sx(p)
      const y = sy(p)
      const r = Math.max(p.r * zoom, 2)

      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6)
      glow.addColorStop(0, `rgba(${rgb},${0.4 * alpha})`)
      glow.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, r * 2.6, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = `rgba(${rgb},${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()

      if (p.node.bookmarked && !dim) {
        ctx.strokeStyle = 'rgba(250,204,21,0.9)'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.arc(x, y, r + 3, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (selected?.paperId === p.node.paperId) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, r + 6, 0, Math.PI * 2)
        ctx.stroke()
      }

      if (!dim) {
        // Titles are long and the layers are tight, so labels are clipped to
        // a recognisable prefix. Full text lives in the panel.
        const label =
          p.node.title.length > 30 ? p.node.title.slice(0, 28) + '…' : p.node.title
        ctx.font = `${p.node.generation === 0 ? 600 : 400} 11px ui-sans-serif, system-ui`
        ctx.textAlign = 'center'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(7,8,12,0.92)'
        ctx.strokeText(label, x, y + r + 13)
        ctx.fillStyle = 'rgba(228,228,231,0.95)'
        ctx.fillText(label, x, y + r + 13)
        if (p.node.year) {
          ctx.fillStyle = 'rgba(148,163,184,0.7)'
          ctx.font = '9px ui-sans-serif, system-ui'
          ctx.strokeText(String(p.node.year), x, y + r + 24)
          ctx.fillText(String(p.node.year), x, y + r + 24)
        }
      }
    }
    } catch (err) {
      // A canvas throw must not silently blank the view.
      console.warn('[research-graph] draw failed:', err)
    }
  }, [layout, positions, data, selected])

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

  // Whether the current layout has been framed yet. The first fit attempt
  // often lands before the canvas has a measured size, so the ResizeObserver
  // retries once it does.
  const fittedRef = useRef(false)
  useEffect(() => {
    fittedRef.current = fitToView()
    drawNow()
  }, [fitToView, drawNow])


  // Observe the canvas itself, not the window. The element's size changes for
  // reasons a window-resize listener never sees — first layout after mount,
  // a sibling panel opening, the tab becoming visible — and the first of
  // those is exactly when the canvas measures 0 and the initial paint is
  // thrown away.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      // First real measurement is also the first chance to frame the layout.
      if (!fittedRef.current) fittedRef.current = fitToView()
      drawNow()
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [drawNow, fitToView])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  const pick = (clientX: number, clientY: number): NeighborhoodNode | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    const { x: camX, y: camY, zoom } = camRef.current
    const ox = canvas.clientWidth / 2 + camX
    const oy = canvas.clientHeight / 2 + camY
    let best: NeighborhoodNode | null = null
    let bestD = Infinity
    for (const p of placedRef.current) {
      const d = Math.hypot(ox + p.x * zoom - px, oy + p.y * zoom - py)
      if (d <= Math.max(p.r * zoom + 6, 9) && d < bestD) {
        bestD = d
        best = p.node
      }
    }
    return best
  }

  // ---- picker (no focus yet) ----------------------------------------------

  if (!focusPaperId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="max-w-md text-center">
          <h3 className="text-sm font-semibold text-zinc-100">Pick a paper</h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            This view shows one paper&apos;s lineage — what it builds on, and
            what built on it. Choose a starting point, or hit &ldquo;Build
            graph&rdquo; on any paper in Discover.
          </p>
        </div>
        {picker.length > 0 && (
          <div className="w-full max-w-2xl space-y-1">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Most connected in your graph
            </div>
            {picker.map((h) => (
              <button
                key={h.paperId}
                onClick={() => onFocusPaper(h.paperId)}
                className="flex w-full items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left hover:border-zinc-700"
              >
                <span className="truncate text-[12px] text-zinc-200">{h.title}</span>
                <span className="shrink-0 text-[10px] text-zinc-500">{h.degree} links</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const focusNode = data?.nodes.find((n) => n.generation === 0) ?? null

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <button
          onClick={() => onFocusPaper('')}
          className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 ring-1 ring-inset ring-zinc-700 hover:bg-surface-2 hover:text-zinc-100"
        >
          ← Change paper
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-zinc-100" title={focusNode?.title}>
            {focusNode?.title ?? focusPaperId}
          </div>
          {focusNode && (
            <div className="truncate text-[10px] text-zinc-500">
              {focusNode.authors.slice(0, 3).join(', ')}
              {focusNode.year ? ` · ${focusNode.year}` : ''}
              {focusNode.venue ? ` · ${focusNode.venue}` : ''}
            </div>
          )}
        </div>
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          Hops
          <select
            value={hops}
            onChange={(e) => setHops(Number(e.target.value))}
            className="rounded bg-zinc-900 px-1 py-1 text-xs text-zinc-200 ring-1 ring-zinc-800"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <button
          onClick={() => void expand()}
          disabled={expanding}
          className="rounded bg-sky-500/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-500/25 disabled:opacity-50"
        >
          {expanding ? 'Fetching…' : 'Fetch more'}
        </button>
        <button
          onClick={() => {
            fittedRef.current = fitToView()
            drawNow()
          }}
          className="rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800"
        >
          fit
        </button>
        <span className="text-xs text-zinc-500">
          {data?.nodes.length ?? 0} papers · {data?.edges.length ?? 0} citations
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-zinc-400">
            Loading lineage…
          </div>
        )}

        {!loading && data && data.nodes.length <= 1 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="max-w-sm text-sm text-zinc-400">
              No citations fetched for this paper yet.
            </p>
            <button
              onClick={() => void expand()}
              disabled={expanding}
              className="rounded bg-sky-500/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-500/25 disabled:opacity-50"
            >
              {expanding ? 'Fetching…' : 'Fetch its references and citations'}
            </button>
          </div>
        )}

        <canvas
          ref={canvasRef}
          // absolute inset-0 rather than h-full: a canvas is a replaced
          // element with its own intrinsic size, and height:100% inside a
          // flex item resolves to 0 whenever the flex chain has any
          // indefinite link. Pinning it to the relative parent sidesteps the
          // whole class of problem.
          className="absolute inset-0 h-full w-full"
          style={{ cursor: dragging ? 'grabbing' : 'grab', display: 'block' }}
          onPointerDown={(e) => {
            const { x, y } = camRef.current
            dragRef.current = { x: e.clientX, y: e.clientY, camX: x, camY: y }
            setDragging(true)
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const d = dragRef.current
            if (d) {
              camRef.current.x = d.camX + (e.clientX - d.x)
              camRef.current.y = d.camY + (e.clientY - d.y)
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
              0.25,
              Math.min(4, camRef.current.zoom * (e.deltaY > 0 ? 1 / 1.12 : 1.12))
            )
            requestDraw()
          }}
        />

        {selected && (
          <div className="absolute right-4 top-4 max-h-[85%] w-80 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950/95 p-3 shadow-xl">
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
              <span
                className="rounded px-1.5 py-0.5 ring-1"
                style={{
                  color: `rgb(${generationColor(selected.generation)})`,
                  borderColor: 'transparent',
                  boxShadow: `inset 0 0 0 1px rgba(${generationColor(selected.generation)},0.4)`
                }}
              >
                {generationLabel(selected.generation)}
              </span>
              <span className="rounded px-1.5 py-0.5 text-zinc-300 ring-1 ring-zinc-700">
                {selected.citationCount.toLocaleString()} cites
              </span>
              {selected.influentialCitationCount > 0 && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300 ring-1 ring-amber-500/25">
                  {selected.influentialCitationCount} influential
                </span>
              )}
            </div>

            {selected.abstract && (
              <p className="mt-2 max-h-32 overflow-y-auto text-[11px] leading-snug text-zinc-400">
                {selected.abstract}
              </p>
            )}

            <div className="mt-3 flex flex-col gap-1.5">
              {selected.paperId !== focusPaperId && (
                <button
                  onClick={() => {
                    setSelected(null)
                    onFocusPaper(selected.paperId)
                  }}
                  className="w-full rounded bg-violet-500/15 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25"
                >
                  Centre on this paper
                </button>
              )}
              {onSelectPaper && (
                <button
                  onClick={() =>
                    onSelectPaper({
                      paperId: selected.paperId,
                      title: selected.title,
                      abstract: selected.abstract,
                      year: selected.year,
                      authors: selected.authors,
                      venue: selected.venue,
                      citationCount: selected.citationCount,
                      influentialCitationCount: selected.influentialCitationCount,
                      url: selected.url,
                      pdfUrl: selected.pdfUrl,
                      arxivId: null,
                      doi: null
                    })
                  }
                  className="w-full rounded bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700"
                >
                  Open details
                </button>
              )}
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
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-400" /> builds on (older)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-300" /> this paper
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> cited by (newer)
        </span>
        <span className="ml-auto">drag to pan · scroll to zoom · click a paper</span>
      </div>
    </div>
  )
}
