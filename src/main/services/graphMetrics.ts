// Graph metrics for the market graph.
//
// Pure functions over an edge list, with no database or Electron dependency,
// so they are directly unit-testable and reusable by the research graph later.
//
// Hand-rolled deliberately: the repo carries no graph library and the
// convention is to avoid adding one. At this scale (~1,000 nodes, ~2,700
// edges) the textbook algorithms are a few dozen lines each and run in well
// under a second, so a dependency would buy nothing.
//
// Direction matters and is easy to get backwards. Only `supplier`,
// `competitor` and `partner` exist on disk — `customer` is normalized to
// supplier-form at write time by chainAbsorberService, and the surviving
// convention is that `from` SUPPLIES `to`. So for a symbol X:
//   - suppliers of X   = incoming supplier edges  (X is `to`)
//   - customers of X   = outgoing supplier edges  (X is `from`)
// `competitor` and `partner` are symmetric and treated as undirected.

export interface MetricEdge {
  from: string
  to: string
  relationship: string
}

/** Undirected degree over every relationship type. */
export function degreeMap(edges: MetricEdge[]): Map<string, number> {
  const d = new Map<string, number>()
  for (const e of edges) {
    d.set(e.from, (d.get(e.from) ?? 0) + 1)
    d.set(e.to, (d.get(e.to) ?? 0) + 1)
  }
  return d
}

/** Undirected degree restricted to one relationship type. */
export function relationshipDegree(
  edges: MetricEdge[],
  relationship: string
): Map<string, number> {
  return degreeMap(edges.filter((e) => e.relationship === relationship))
}

/**
 * Supplier-edge counts, split by direction.
 *
 * `suppliesTo` counts how many companies a symbol supplies (upstream
 * chokepoint); `dependsOn` counts how many suppliers it draws on (downstream
 * exposure). These are the two halves of the supplier relationship and they
 * answer different questions, which a single undirected degree conflates.
 */
export function supplierDegrees(edges: MetricEdge[]): {
  suppliesTo: Map<string, number>
  dependsOn: Map<string, number>
} {
  const suppliesTo = new Map<string, number>()
  const dependsOn = new Map<string, number>()
  for (const e of edges) {
    if (e.relationship !== 'supplier') continue
    suppliesTo.set(e.from, (suppliesTo.get(e.from) ?? 0) + 1)
    dependsOn.set(e.to, (dependsOn.get(e.to) ?? 0) + 1)
  }
  return { suppliesTo, dependsOn }
}

/** Adjacency for undirected traversal, deduped so parallel edges count once. */
export function adjacency(edges: MetricEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  const add = (a: string, b: string): void => {
    let s = adj.get(a)
    if (!s) {
      s = new Set()
      adj.set(a, s)
    }
    s.add(b)
  }
  for (const e of edges) {
    if (e.from === e.to) continue
    add(e.from, e.to)
    add(e.to, e.from)
  }
  return adj
}

/**
 * PageRank over the undirected graph.
 *
 * Undirected because the three relationship types don't share a direction
 * semantics — a competitor edge has no source and treating it as one would
 * bias influence toward whichever endpoint the chain generator happened to
 * emit first.
 */
export function pagerank(
  edges: MetricEdge[],
  { damping = 0.85, iterations = 40 } = {}
): Map<string, number> {
  const adj = adjacency(edges)
  const nodes = [...adj.keys()]
  const n = nodes.length
  const out = new Map<string, number>()
  if (n === 0) return out

  const base = 1 / n
  let rank = new Map(nodes.map((v) => [v, base]))
  for (let it = 0; it < iterations; it++) {
    const next = new Map<string, number>(nodes.map((v) => [v, (1 - damping) / n]))
    // Dangling nodes cannot exist here (every node in `adj` has ≥1 neighbour),
    // so no dangling-mass redistribution is needed.
    for (const v of nodes) {
      const neighbours = adj.get(v) as Set<string>
      const share = (damping * (rank.get(v) as number)) / neighbours.size
      for (const w of neighbours) next.set(w, (next.get(w) as number) + share)
    }
    rank = next
  }
  return rank
}

/**
 * Brandes betweenness centrality, unweighted and undirected.
 *
 * Worth the cost because it names a different set of companies than degree
 * does: brokers that sit between otherwise-disconnected parts of the market
 * score high here while ranking nowhere by raw connection count.
 *
 * O(V·E) — about 2.5M operations at current scale, comfortably sub-second.
 */
export function betweenness(edges: MetricEdge[]): Map<string, number> {
  const adj = adjacency(edges)
  const nodes = [...adj.keys()]
  const bc = new Map<string, number>(nodes.map((v) => [v, 0]))

  for (const s of nodes) {
    const stack: string[] = []
    const pred = new Map<string, string[]>(nodes.map((v) => [v, []]))
    const sigma = new Map<string, number>(nodes.map((v) => [v, 0]))
    const dist = new Map<string, number>(nodes.map((v) => [v, -1]))
    sigma.set(s, 1)
    dist.set(s, 0)

    // Plain array + head index rather than shift(), which is O(n) per call and
    // turns the whole BFS quadratic.
    const queue: string[] = [s]
    let head = 0
    while (head < queue.length) {
      const v = queue[head++]
      stack.push(v)
      const dv = dist.get(v) as number
      for (const w of adj.get(v) as Set<string>) {
        if ((dist.get(w) as number) < 0) {
          dist.set(w, dv + 1)
          queue.push(w)
        }
        if ((dist.get(w) as number) === dv + 1) {
          sigma.set(w, (sigma.get(w) as number) + (sigma.get(v) as number))
          ;(pred.get(w) as string[]).push(v)
        }
      }
    }

    const delta = new Map<string, number>(nodes.map((v) => [v, 0]))
    while (stack.length > 0) {
      const w = stack.pop() as string
      for (const v of pred.get(w) as string[]) {
        delta.set(
          v,
          (delta.get(v) as number) +
            ((sigma.get(v) as number) / (sigma.get(w) as number)) *
              (1 + (delta.get(w) as number))
        )
      }
      if (w !== s) bc.set(w, (bc.get(w) as number) + (delta.get(w) as number))
    }
  }

  // Undirected: every shortest path is counted from both endpoints.
  for (const [k, v] of bc) bc.set(k, v / 2)
  return bc
}

/** Distinct sectors each symbol connects to, excluding its own. */
export function sectorsTouched(
  edges: MetricEdge[],
  sectorOf: (symbol: string) => string | null
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (sym: string, sector: string | null): void => {
    if (!sector) return
    const own = sectorOf(sym)
    if (own === sector) return
    let s = out.get(sym)
    if (!s) {
      s = new Set()
      out.set(sym, s)
    }
    s.add(sector)
  }
  for (const e of edges) {
    add(e.from, sectorOf(e.to))
    add(e.to, sectorOf(e.from))
  }
  return out
}

export interface SectorFlow {
  /** Supplying sector. */
  from: string
  /** Receiving sector. */
  to: string
  count: number
  /** A few representative symbol pairs, for explaining the flow. */
  examples: Array<{ from: string; to: string }>
}

/**
 * Directed sector-to-sector flow, over supplier edges only.
 *
 * Direction is the whole point. Competitor and partner edges are symmetric, so
 * a direction on them would be an artefact of whichever endpoint the chain
 * generator emitted first; supplier edges carry a real orientation (`from`
 * supplies `to`), and it is strongly asymmetric in practice — on the live
 * graph Consumer Staples -> Consumer Discretionary runs 159 one way, while
 * Materials <-> Industrials is 30 against 29. Summing those into one
 * undirected number, as the previous version did, discards exactly the
 * structure worth showing.
 */
export function directedSectorFlows(
  edges: MetricEdge[],
  sectorOf: (symbol: string) => string | null,
  { relationship = 'supplier', maxExamples = 4 } = {}
): SectorFlow[] {
  const acc = new Map<string, SectorFlow>()
  for (const e of edges) {
    if (e.relationship !== relationship) continue
    const a = sectorOf(e.from)
    const b = sectorOf(e.to)
    if (!a || !b || a === b) continue
    // NUL separator: it cannot occur in a sector name, so the key stays
    // unambiguous even though sector names contain spaces.
    const key = a + '\u0000' + b
    let row = acc.get(key)
    if (!row) {
      row = { from: a, to: b, count: 0, examples: [] }
      acc.set(key, row)
    }
    row.count += 1
    if (row.examples.length < maxExamples) {
      row.examples.push({ from: e.from, to: e.to })
    }
  }
  return [...acc.values()].sort((x, y) => y.count - x.count)
}
