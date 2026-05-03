// Research Map — force-directed visualization of the user's bookmark
// citation web. Each node is a bookmarked paper; each directed edge is
// a "this paper builds on that paper" foundational link computed from
// the local cache. Color-coded by topic tag (deterministic palette).
//
// No d3 dependency — a tiny custom force layout (~70 lines) handles
// repulsion + spring attraction over ~100 iterations on mount, which
// is plenty for the bookmark scale (~50-300 nodes). One pass on
// render, no continuous simulation, so CPU is idle while you browse.

import { useMemo, useRef, useState } from 'react'
import type {
  BookmarkFoundationalEdge,
  BookmarkTopicLink,
  ResearchBookmarkRow,
  ResearchPaper
} from '../../preload'

// Deterministic palette for topic tags. Picked by topicId mod length
// so the same topic always gets the same color across renders.
const TOPIC_PALETTE: Array<{ stroke: string; fill: string; text: string }> = [
  { stroke: '#7dd3fc', fill: '#0c4a6e', text: '#bae6fd' }, // sky
  { stroke: '#86efac', fill: '#14532d', text: '#bbf7d0' }, // emerald
  { stroke: '#fcd34d', fill: '#78350f', text: '#fde68a' }, // amber
  { stroke: '#f0abfc', fill: '#581c87', text: '#f5d0fe' }, // fuchsia
  { stroke: '#fda4af', fill: '#881337', text: '#fecdd3' }, // rose
  { stroke: '#a5b4fc', fill: '#312e81', text: '#c7d2fe' }, // indigo
  { stroke: '#fdba74', fill: '#7c2d12', text: '#fed7aa' }, // orange
  { stroke: '#5eead4', fill: '#134e4a', text: '#99f6e4' } // teal
]
// Untagged-bookmark fallback color — neutral zinc so tagged papers
// pop against the background.
const NEUTRAL_NODE = { stroke: '#71717a', fill: '#27272a', text: '#a1a1aa' }

function colorForTopic(topicId: number): { stroke: string; fill: string; text: string } {
  return TOPIC_PALETTE[topicId % TOPIC_PALETTE.length]
}

interface NodePos {
  id: string
  paper: ResearchPaper
  x: number
  y: number
  vx: number
  vy: number
}

// Tiny force-directed layout. Repulsion is O(n²) but n ≤ ~300 in the
// bookmark scale and we only run it once on mount, so the cost is
// bounded (~400ms worst case). Quadtree (Barnes-Hut) optimization
// would let us scale further but isn't needed at this size.
function runForceLayout(
  papers: ResearchPaper[],
  edges: BookmarkFoundationalEdge[],
  width: number,
  height: number
): NodePos[] {
  const REPULSION = 4500
  const ATTRACTION = 0.045
  const DAMPING = 0.85
  const ITERATIONS = 180
  const PADDING = 50
  const center = { x: width / 2, y: height / 2 }

  // Random seed positions clustered near center so the layout settles
  // faster than from full-canvas randomness.
  const nodes: NodePos[] = papers.map((p, i) => {
    const angle = (i / papers.length) * Math.PI * 2
    const r = Math.min(width, height) * 0.25
    return {
      id: p.paperId,
      paper: p,
      x: center.x + Math.cos(angle) * r + (Math.random() - 0.5) * 30,
      y: center.y + Math.sin(angle) * r + (Math.random() - 0.5) * 30,
      vx: 0,
      vy: 0
    }
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Pairwise repulsion (every node pushes every other away).
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distSq = dx * dx + dy * dy + 0.01
        const dist = Math.sqrt(distSq)
        const force = REPULSION / distSq
        const ux = dx / dist
        const uy = dy / dist
        a.vx += ux * force
        a.vy += uy * force
        b.vx -= ux * force
        b.vy -= uy * force
      }
    }
    // Spring attraction along edges.
    for (const e of edges) {
      const a = byId.get(e.from)
      const b = byId.get(e.to)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      a.vx += dx * ATTRACTION
      a.vy += dy * ATTRACTION
      b.vx -= dx * ATTRACTION
      b.vy -= dy * ATTRACTION
    }
    // Mild center gravity so isolated nodes don't drift to infinity.
    for (const n of nodes) {
      n.vx += (center.x - n.x) * 0.005
      n.vy += (center.y - n.y) * 0.005
    }
    // Apply velocities, damp, clamp to viewport.
    for (const n of nodes) {
      n.x += n.vx
      n.y += n.vy
      n.vx *= DAMPING
      n.vy *= DAMPING
      n.x = Math.max(PADDING, Math.min(width - PADDING, n.x))
      n.y = Math.max(PADDING, Math.min(height - PADDING, n.y))
    }
  }
  return nodes
}

// Truncate a paper title for the node label. Aim for what fits in
// ~140px at our font size.
function truncateTitle(title: string, max = 38): string {
  if (title.length <= max) return title
  return title.slice(0, max - 1).trimEnd() + '…'
}

export function ResearchMap({
  bookmarks,
  edges,
  topicLinks,
  selectedId,
  onSelect
}: {
  bookmarks: ResearchBookmarkRow[]
  edges: BookmarkFoundationalEdge[]
  topicLinks: BookmarkTopicLink[]
  selectedId: string | null
  onSelect: (paper: ResearchPaper) => void
}): JSX.Element {
  const VIEW_W = 1400
  const VIEW_H = 900
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Topic-tag lookup keyed by bookmark paperId. First topic wins for
  // node coloring (a paper can be tagged with multiple topics; we just
  // pick the first deterministically).
  const topicIdByBookmark = useMemo(() => {
    const m = new Map<string, number>()
    for (const link of topicLinks) {
      // Don't overwrite — keep the first-encountered tag (deterministic
      // because topicLinks is ordered by insertion in the underlying
      // table, which itself is by createdAt).
      if (!m.has(link.bookmarkPaperId)) {
        m.set(link.bookmarkPaperId, link.topicId)
      }
    }
    return m
  }, [topicLinks])

  // Run the force layout once when the input set changes. Memoized so
  // hover/selection re-renders don't re-run the (~300ms) physics pass.
  const positions = useMemo(() => {
    return runForceLayout(
      bookmarks.map((b) => b.paper),
      edges,
      VIEW_W,
      VIEW_H
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarks, edges])

  const positionById = useMemo(() => {
    const m = new Map<string, NodePos>()
    for (const n of positions) m.set(n.id, n)
    return m
  }, [positions])

  // Edges that we actually draw — both endpoints must have positions.
  const drawableEdges = useMemo(
    () => edges.filter((e) => positionById.has(e.from) && positionById.has(e.to)),
    [edges, positionById]
  )

  // Highlight set: when a node is hovered or selected, highlight it +
  // its 1-hop neighbors so the user sees its citation web at a glance.
  const focusId = hoveredId ?? selectedId
  const highlighted = useMemo(() => {
    if (!focusId) return null
    const set = new Set<string>([focusId])
    for (const e of drawableEdges) {
      if (e.from === focusId) set.add(e.to)
      if (e.to === focusId) set.add(e.from)
    }
    return set
  }, [focusId, drawableEdges])

  if (bookmarks.length === 0) {
    return (
      <div className="rounded-xl border border-edge/60 px-6 py-12 text-center text-[12px] text-zinc-500">
        No bookmarks yet — bookmark a few papers and the map will draw
        their citation web.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-edge bg-surface-1 overflow-hidden">
      <div className="px-4 py-2 border-b border-edge flex items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300">
          Research Map
        </span>
        <span className="text-[10px] text-zinc-500">
          {bookmarks.length} papers · {drawableEdges.length} foundational links
        </span>
        <span className="ml-auto text-[10px] text-zinc-600">
          Hover a node to highlight its citation web. Click to open detail.
        </span>
      </div>
      <div ref={containerRef} className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full h-auto block"
          style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        >
          <defs>
            <marker
              id="researchmap-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fcd34d" />
            </marker>
            <marker
              id="researchmap-arrow-dim"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3f3f46" />
            </marker>
          </defs>
          {/* Edges first so nodes draw on top. Amber to match the
              foundational edge color used elsewhere in Research. */}
          <g>
            {drawableEdges.map((e, i) => {
              const a = positionById.get(e.from)!
              const b = positionById.get(e.to)!
              const isHighlighted =
                highlighted !== null && (e.from === focusId || e.to === focusId)
              const dim = highlighted !== null && !isHighlighted
              const stroke = dim ? '#3f3f46' : isHighlighted ? '#fcd34d' : '#52525b'
              const opacity = dim ? 0.3 : 1
              // Nudge the edge endpoints inward by node radius so the
              // arrowhead doesn't overlap the target circle.
              const dx = b.x - a.x
              const dy = b.y - a.y
              const dist = Math.sqrt(dx * dx + dy * dy) || 1
              const NODE_R = 8
              const x2 = b.x - (dx / dist) * (NODE_R + 4)
              const y2 = b.y - (dy / dist) * (NODE_R + 4)
              return (
                <line
                  key={`${e.from}-${e.to}-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                  strokeWidth={isHighlighted ? 2 : 1}
                  opacity={opacity}
                  markerEnd={
                    dim
                      ? 'url(#researchmap-arrow-dim)'
                      : 'url(#researchmap-arrow)'
                  }
                />
              )
            })}
          </g>
          {/* Nodes */}
          <g>
            {positions.map((n) => {
              const topicId = topicIdByBookmark.get(n.id) ?? null
              const color = topicId !== null ? colorForTopic(topicId) : NEUTRAL_NODE
              const isFocused = n.id === focusId
              const isSelected = n.id === selectedId
              const dim = highlighted !== null && !highlighted.has(n.id)
              const opacity = dim ? 0.25 : 1
              const r = isSelected ? 11 : isFocused ? 10 : 8
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x} ${n.y})`}
                  opacity={opacity}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredId(n.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSelect(n.paper)}
                >
                  <circle
                    r={r}
                    fill={color.fill}
                    stroke={color.stroke}
                    strokeWidth={isSelected ? 2.5 : isFocused ? 2 : 1.4}
                  />
                  {(isFocused || isSelected) && (
                    // Show full title on focus; dim during normal browse
                    // to keep the map readable.
                    <text
                      x={0}
                      y={r + 14}
                      textAnchor="middle"
                      fontSize={11}
                      fill={color.text}
                      style={{ pointerEvents: 'none' }}
                    >
                      {truncateTitle(n.paper.title, 50)}
                    </text>
                  )}
                  {!isFocused && !isSelected && (
                    <text
                      x={0}
                      y={r + 12}
                      textAnchor="middle"
                      fontSize={9.5}
                      fill={color.text}
                      style={{ pointerEvents: 'none' }}
                      opacity={0.7}
                    >
                      {truncateTitle(n.paper.title, 30)}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}
