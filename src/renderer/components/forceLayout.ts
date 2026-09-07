// Small dependency-free force-directed layout, shared by the Research Map
// (papers + citation edges) and the Market Graph (tickers + supply-chain
// edges).
//
// Extracted from ResearchMap's inline implementation so both graphs settle
// the same way. Kept deliberately generic: callers supply opaque string ids
// and hold their own node payloads, so this module never learns about papers
// or tickers.
//
// Runs to completion synchronously and returns final positions. It is NOT a
// live simulation — there is no rAF loop and no continuous ticking, which
// matters here: CLAUDE.md forbids perpetual animation because it jitters
// under screen capture, and an idle graph should cost zero CPU. Re-run it
// only when the topology changes; recolouring on a quote tick must not.
//
// Repulsion is O(n²) per iteration. Measured on the real market graph — 286
// nodes, 882 edges, 180 iterations — a full run takes ~48ms, once. Barnes-Hut
// would be needed somewhere above ~1000 nodes; it isn't yet.

export interface LayoutEdge {
  from: string
  to: string
}

export interface LayoutPosition {
  id: string
  x: number
  y: number
}

export interface ForceLayoutOptions {
  width: number
  height: number
  /** Pairwise push. Raise to spread a dense graph out. */
  repulsion?: number
  /** Spring pull along edges. Raise to tighten clusters. */
  attraction?: number
  /** Velocity retained per iteration; < 1 so the system settles. */
  damping?: number
  iterations?: number
  /** Keeps nodes off the canvas edge. Should exceed the largest node radius. */
  padding?: number
  /** Pull toward centre, so disconnected nodes don't drift away. */
  gravity?: number
}

const DEFAULTS = {
  repulsion: 4500,
  attraction: 0.045,
  damping: 0.85,
  iterations: 180,
  padding: 50,
  gravity: 0.005
}

interface Body {
  id: string
  x: number
  y: number
  vx: number
  vy: number
}

export function runForceLayout(
  ids: string[],
  edges: LayoutEdge[],
  opts: ForceLayoutOptions
): LayoutPosition[] {
  const { width, height } = opts
  const repulsion = opts.repulsion ?? DEFAULTS.repulsion
  const attraction = opts.attraction ?? DEFAULTS.attraction
  const damping = opts.damping ?? DEFAULTS.damping
  const iterations = opts.iterations ?? DEFAULTS.iterations
  const padding = opts.padding ?? DEFAULTS.padding
  const gravity = opts.gravity ?? DEFAULTS.gravity

  if (ids.length === 0) return []
  const cx = width / 2
  const cy = height / 2

  // Seed on a ring near the centre rather than uniformly at random: the
  // system settles in far fewer iterations from a spread-but-compact start.
  const nodes: Body[] = ids.map((id, i) => {
    const angle = (i / ids.length) * Math.PI * 2
    const r = Math.min(width, height) * 0.25
    return {
      id,
      x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 30,
      y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 30,
      vx: 0,
      vy: 0
    }
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        // +0.01 avoids a divide-by-zero when two nodes land exactly together.
        const distSq = dx * dx + dy * dy + 0.01
        const dist = Math.sqrt(distSq)
        const force = repulsion / distSq
        const ux = dx / dist
        const uy = dy / dist
        a.vx += ux * force
        a.vy += uy * force
        b.vx -= ux * force
        b.vy -= uy * force
      }
    }

    for (const e of edges) {
      const a = byId.get(e.from)
      const b = byId.get(e.to)
      // Edges pointing at nodes outside `ids` are skipped, so callers can
      // pass a filtered node set without also filtering their edge list.
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      a.vx += dx * attraction
      a.vy += dy * attraction
      b.vx -= dx * attraction
      b.vy -= dy * attraction
    }

    for (const n of nodes) {
      n.vx += (cx - n.x) * gravity
      n.vy += (cy - n.y) * gravity
    }

    for (const n of nodes) {
      n.x += n.vx
      n.y += n.vy
      n.vx *= damping
      n.vy *= damping
      n.x = Math.max(padding, Math.min(width - padding, n.x))
      n.y = Math.max(padding, Math.min(height - padding, n.y))
    }
  }

  return nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }))
}
