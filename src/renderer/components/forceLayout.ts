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
  /** Margin left around the fitted layout. Should exceed the largest node radius. */
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

// Preset for the market graph (~290 nodes, ~880 edges).
//
// Close to the defaults on purpose. A parameter sweep over repulsion
// 3k-26k, attraction 0.018-0.05 and gravity 0.004-0.10 produced nothing that
// beat these once results were averaged over several runs — single-run scores
// looked dramatically better or worse purely from the random seeding, which
// is what made the first attempt at "tuning" misleading. Cranking repulsion
// was actively harmful: it flings weakly-connected components far out, and
// the fit then shrinks everything else to compensate.
//
// The readability problem was the fit, not the forces — see FIT_TRIM below.
// Only the iteration count is raised here, to let the larger system settle.
export const DENSE_GRAPH_PRESET = {
  repulsion: 4500,
  attraction: 0.045,
  damping: 0.87,
  iterations: 300,
  gravity: 0.006
} as const

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
    }
  }

  // Fit to the viewport instead of clamping during simulation.
  //
  // Clamping per-iteration was actively harmful: any node the repulsion
  // pushed outward stuck to the wall, and once stuck it kept its neighbours
  // stretched toward it. The result was visible as tight knots pinned in the
  // canvas corners with long edges radiating back to a central hairball —
  // an artefact of the boundary, not of the data.
  //
  // Letting the simulation run unbounded and rescaling once at the end
  // preserves the true relative geometry and uses the full canvas.
  return fitToBox(nodes, width, height, padding)
}

// Fraction trimmed from each end of the coordinate distribution before
// fitting. This single number dominates layout quality and is not a
// cosmetic choice.
//
// Fitting to the true min/max lets one stray node decide the scale for all
// the others. Real graphs have them: a two-node component that repulsion
// flings far from the mass expands the bounding box several-fold, the
// uniform scale shrinks to compensate, and the entire main cluster collapses
// into a few overlapping pixels.
//
// Measured over 5 runs on the live market graph (286 nodes / 882 edges),
// counting occupied 25px cells and nodes with a neighbour closer than 10px:
//   trim 0.00 -> 45 cells, 228 crowded   (and wildly unstable, min 14)
//   trim 0.01 -> 131 cells, 120 crowded
//   trim 0.03 -> 189 cells,  65 crowded
//   trim 0.05 -> 236 cells,  28 crowded  (stable: min 225)
//   trim 0.08 -> 219 cells,  47 crowded
// Outliers are clamped back to the edge rather than dropped, so nothing
// disappears — the far-flung few just stack at the boundary instead of
// squashing everyone else.
const FIT_TRIM = 0.05

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

function fitToBox(
  nodes: Body[],
  width: number,
  height: number,
  padding: number
): LayoutPosition[] {
  if (nodes.length === 0) return []
  const finite = nodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y))
  if (finite.length === 0) {
    return nodes.map((n) => ({ id: n.id, x: width / 2, y: height / 2 }))
  }

  const xs = finite.map((n) => n.x).sort((a, b) => a - b)
  const ys = finite.map((n) => n.y).sort((a, b) => a - b)
  const minX = percentile(xs, FIT_TRIM)
  const maxX = percentile(xs, 1 - FIT_TRIM)
  const minY = percentile(ys, FIT_TRIM)
  const maxY = percentile(ys, 1 - FIT_TRIM)

  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  const availW = Math.max(width - padding * 2, 1)
  const availH = Math.max(height - padding * 2, 1)
  // One uniform scale for both axes — scaling x and y independently would
  // shear the layout and distort the cluster shapes that carry the meaning.
  const scale = Math.min(availW / spanX, availH / spanY)
  // Centre whatever slack the uniform scale leaves on the other axis.
  const offX = padding + (availW - spanX * scale) / 2
  const offY = padding + (availH - spanY * scale) / 2

  const clamp = (v: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, v))

  return nodes.map((n) => {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
      return { id: n.id, x: width / 2, y: height / 2 }
    }
    return {
      id: n.id,
      x: clamp((n.x - minX) * scale + offX, padding, width - padding),
      y: clamp((n.y - minY) * scale + offY, padding, height - padding)
    }
  })
}

// ---------------------------------------------------------------------------
// 3D variant
// ---------------------------------------------------------------------------
//
// Same physics with a z axis, for the orbitable market view. Kept separate
// from the 2D path rather than generalised over dimension: the inner loop is
// O(n²) and runs hundreds of times, so an extra branch or array indirection
// per pair is real cost for no benefit to the 2D callers.
//
// Positions come back in a centred, unit-ish cube (roughly -1..1 on the
// widest axis). The caller owns projection, so it can rotate and zoom without
// ever re-running the simulation — which is the whole point: layout is
// expensive and stable, projection is cheap and continuous.

export interface LayoutPosition3D {
  id: string
  x: number
  y: number
  z: number
}

interface Body3D {
  id: string
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

export interface ForceLayout3DOptions {
  repulsion?: number
  attraction?: number
  damping?: number
  iterations?: number
  gravity?: number
}

const DEFAULTS_3D = {
  repulsion: 1.4,
  attraction: 0.045,
  damping: 0.87,
  iterations: 300,
  gravity: 0.012
}

export function runForceLayout3D(
  ids: string[],
  edges: LayoutEdge[],
  opts: ForceLayout3DOptions = {}
): LayoutPosition3D[] {
  const repulsion = opts.repulsion ?? DEFAULTS_3D.repulsion
  const attraction = opts.attraction ?? DEFAULTS_3D.attraction
  const damping = opts.damping ?? DEFAULTS_3D.damping
  const iterations = opts.iterations ?? DEFAULTS_3D.iterations
  const gravity = opts.gravity ?? DEFAULTS_3D.gravity
  if (ids.length === 0) return []

  // Seed on a Fibonacci sphere. Uniform random in a cube clumps at the
  // corners and takes far longer to relax; an even shell starts the system
  // close to the shape it wants to be.
  const golden = Math.PI * (3 - Math.sqrt(5))
  const nodes: Body3D[] = ids.map((id, i) => {
    const y = 1 - (i / Math.max(ids.length - 1, 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    return {
      id,
      x: Math.cos(theta) * r * 10 + (Math.random() - 0.5) * 0.4,
      y: y * 10 + (Math.random() - 0.5) * 0.4,
      z: Math.sin(theta) * r * 10 + (Math.random() - 0.5) * 0.4,
      vx: 0,
      vy: 0,
      vz: 0
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
        const dz = a.z - b.z
        const d2 = dx * dx + dy * dy + dz * dz + 0.01
        const d = Math.sqrt(d2)
        const f = repulsion / d2
        const ux = dx / d
        const uy = dy / d
        const uz = dz / d
        a.vx += ux * f
        a.vy += uy * f
        a.vz += uz * f
        b.vx -= ux * f
        b.vy -= uy * f
        b.vz -= uz * f
      }
    }

    for (const e of edges) {
      const a = byId.get(e.from)
      const b = byId.get(e.to)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dz = b.z - a.z
      a.vx += dx * attraction
      a.vy += dy * attraction
      a.vz += dz * attraction
      b.vx -= dx * attraction
      b.vy -= dy * attraction
      b.vz -= dz * attraction
    }

    for (const n of nodes) {
      n.vx += -n.x * gravity
      n.vy += -n.y * gravity
      n.vz += -n.z * gravity
      n.x += n.vx
      n.y += n.vy
      n.z += n.vz
      n.vx *= damping
      n.vy *= damping
      n.vz *= damping
    }
  }

  // Centre on the centroid, then scale by a trimmed radius rather than the
  // maximum — same reasoning as FIT_TRIM in the 2D path. A couple of nodes
  // flung clear of the mass would otherwise set the scale and shrink the
  // whole structure into the middle of the screen.
  let cx = 0
  let cy = 0
  let cz = 0
  for (const n of nodes) {
    cx += n.x
    cy += n.y
    cz += n.z
  }
  cx /= nodes.length
  cy /= nodes.length
  cz /= nodes.length

  const radii = nodes
    .map((n) => Math.hypot(n.x - cx, n.y - cy, n.z - cz))
    .sort((a, b) => a - b)
  const cut = radii[Math.floor((radii.length - 1) * 0.95)] || 1
  const scale = 1 / cut

  return nodes.map((n) => ({
    id: n.id,
    x: (n.x - cx) * scale,
    y: (n.y - cy) * scale,
    z: (n.z - cz) * scale
  }))
}
