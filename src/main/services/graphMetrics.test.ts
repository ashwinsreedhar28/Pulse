import { describe, expect, it } from 'vitest'
import {
  adjacency,
  betweenness,
  degreeMap,
  pagerank,
  relationshipDegree,
  sectorFlows,
  sectorsTouched,
  supplierDegrees,
  type MetricEdge
} from './graphMetrics'

const s = (from: string, to: string, relationship = 'supplier'): MetricEdge => ({
  from,
  to,
  relationship
})

describe('degreeMap', () => {
  it('counts both endpoints', () => {
    const d = degreeMap([s('A', 'B'), s('B', 'C')])
    expect(d.get('A')).toBe(1)
    expect(d.get('B')).toBe(2)
    expect(d.get('C')).toBe(1)
  })

  it('is empty for no edges', () => {
    expect(degreeMap([]).size).toBe(0)
  })
})

describe('relationshipDegree', () => {
  it('ignores other relationship types', () => {
    const edges = [s('A', 'B', 'competitor'), s('A', 'C', 'supplier')]
    const d = relationshipDegree(edges, 'competitor')
    expect(d.get('A')).toBe(1)
    expect(d.has('C')).toBe(false)
  })
})

describe('supplierDegrees', () => {
  // The convention that `from` supplies `to` is load-bearing: getting it
  // backwards silently swaps "upstream chokepoint" and "downstream exposure",
  // and both lists still look plausible.
  it('splits direction so from=supplies and to=depends-on', () => {
    const { suppliesTo, dependsOn } = supplierDegrees([
      s('TSM', 'NVDA'),
      s('TSM', 'AAPL'),
      s('ASML', 'TSM')
    ])
    expect(suppliesTo.get('TSM')).toBe(2)
    expect(dependsOn.get('TSM')).toBe(1)
    expect(dependsOn.get('NVDA')).toBe(1)
    expect(suppliesTo.has('NVDA')).toBe(false)
  })

  it('excludes non-supplier relationships entirely', () => {
    const { suppliesTo, dependsOn } = supplierDegrees([
      s('A', 'B', 'competitor'),
      s('A', 'B', 'partner')
    ])
    expect(suppliesTo.size).toBe(0)
    expect(dependsOn.size).toBe(0)
  })
})

describe('adjacency', () => {
  it('is symmetric and drops self-loops', () => {
    const adj = adjacency([s('A', 'B'), s('A', 'A')])
    expect(adj.get('A')).toEqual(new Set(['B']))
    expect(adj.get('B')).toEqual(new Set(['A']))
  })

  it('dedupes parallel edges of different relationships', () => {
    const adj = adjacency([s('A', 'B', 'supplier'), s('A', 'B', 'competitor')])
    expect(adj.get('A')?.size).toBe(1)
  })
})

describe('pagerank', () => {
  it('sums to one', () => {
    const r = pagerank([s('A', 'B'), s('B', 'C'), s('C', 'A'), s('C', 'D')])
    const total = [...r.values()].reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 6)
  })

  it('ranks a hub above its leaves', () => {
    const r = pagerank([s('H', 'A'), s('H', 'B'), s('H', 'C'), s('H', 'D')])
    expect(r.get('H')).toBeGreaterThan(r.get('A') as number)
  })

  it('is uniform on a symmetric ring', () => {
    const r = pagerank([s('A', 'B'), s('B', 'C'), s('C', 'A')])
    expect(r.get('A')).toBeCloseTo(r.get('B') as number, 9)
    expect(r.get('B')).toBeCloseTo(r.get('C') as number, 9)
  })

  it('handles an empty graph', () => {
    expect(pagerank([]).size).toBe(0)
  })
})

describe('betweenness', () => {
  it('gives the middle of a path all the brokerage', () => {
    // A - B - C : only B lies on a shortest path between two others.
    const bc = betweenness([s('A', 'B'), s('B', 'C')])
    expect(bc.get('B')).toBeCloseTo(1, 9)
    expect(bc.get('A')).toBeCloseTo(0, 9)
    expect(bc.get('C')).toBeCloseTo(0, 9)
  })

  it('is zero everywhere on a triangle', () => {
    // Every pair is directly adjacent, so nothing brokers.
    const bc = betweenness([s('A', 'B'), s('B', 'C'), s('C', 'A')])
    for (const v of bc.values()) expect(v).toBeCloseTo(0, 9)
  })

  it('finds the bridge between two clusters', () => {
    // Two triangles joined by a single node, which every cross-cluster path
    // must traverse. This is the case degree cannot see: the bridge has the
    // same degree as several others but all of the brokerage.
    const bc = betweenness([
      s('A', 'B'),
      s('B', 'C'),
      s('C', 'A'),
      s('C', 'BRIDGE'),
      s('BRIDGE', 'D'),
      s('D', 'E'),
      s('E', 'F'),
      s('F', 'D')
    ])
    const top = [...bc.entries()].sort((x, y) => y[1] - x[1])[0]
    expect(top[0]).toBe('BRIDGE')
  })

  it('splits credit between two equal shortest paths', () => {
    // A-B-D and A-C-D are both shortest, so B and C broker half each.
    const bc = betweenness([s('A', 'B'), s('A', 'C'), s('B', 'D'), s('C', 'D')])
    expect(bc.get('B')).toBeCloseTo(0.5, 9)
    expect(bc.get('C')).toBeCloseTo(0.5, 9)
  })

  it('handles a disconnected graph', () => {
    const bc = betweenness([s('A', 'B'), s('C', 'D')])
    for (const v of bc.values()) expect(v).toBeCloseTo(0, 9)
  })
})

describe('sectorsTouched', () => {
  const sectorOf = (sym: string): string | null =>
    ({ A: 'tech', B: 'energy', C: 'tech', D: null })[sym] ?? null

  it('counts only foreign sectors', () => {
    const t = sectorsTouched([s('A', 'B'), s('A', 'C')], sectorOf)
    // B is energy (counted); C is tech, same as A, so not counted.
    expect(t.get('A')).toEqual(new Set(['energy']))
  })

  it('ignores unclassified endpoints', () => {
    const t = sectorsTouched([s('A', 'D')], sectorOf)
    expect(t.has('A')).toBe(false)
  })
})

describe('sectorFlows', () => {
  const sectorOf = (sym: string): string | null =>
    ({ A: 'tech', B: 'energy', C: 'tech' })[sym] ?? null

  it('orders pairs consistently and skips intra-sector edges', () => {
    const f = sectorFlows([s('A', 'B'), s('B', 'C'), s('A', 'C')], sectorOf)
    // A-C is tech-tech, so only the two cross-sector edges survive, and both
    // collapse into one pair regardless of which endpoint came first.
    expect(f).toEqual([{ a: 'energy', b: 'tech', count: 2 }])
  })

  it('keeps sector names with spaces distinguishable', () => {
    // A joined-string key would make {"Consumer Discretionary","Energy"} and
    // {"Consumer","Discretionary Energy"} indistinguishable.
    const spaced = (sym: string): string | null =>
      ({ X: 'Consumer Discretionary', Y: 'Energy' })[sym] ?? null
    expect(sectorFlows([s('X', 'Y')], spaced)).toEqual([
      { a: 'Consumer Discretionary', b: 'Energy', count: 1 }
    ])
  })

  it('sorts by count descending', () => {
    const many = (sym: string): string | null =>
      ({ A: 'a', B: 'b', C: 'c' })[sym] ?? null
    const f = sectorFlows([s('A', 'B'), s('A', 'B'), s('A', 'C')], many)
    expect(f[0].count).toBe(2)
    expect(f[1].count).toBe(1)
  })
})
