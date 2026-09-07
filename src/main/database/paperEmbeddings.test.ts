// Unit tests for the embedding math. Pure functions only — nothing here
// touches the database, so these run without a native better-sqlite3 build.
//
// cosineSimilarity is worth testing carefully: it is the basis of every
// "related paper" claim the research UI makes, and a silent error in it
// would surface as plausible-looking but wrong recommendations rather than
// as a crash.

import { describe, it, expect } from 'vitest'
import { cosineSimilarity } from './paperEmbeddings'

const f = (...xs: number[]): Float32Array => Float32Array.from(xs)

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity(f(1, 2, 3), f(1, 2, 3))).toBeCloseTo(1, 6)
  })

  it('is scale-invariant — SPECTER2 vectors are not unit length', () => {
    // The whole reason this normalizes instead of taking a bare dot product.
    expect(cosineSimilarity(f(1, 2, 3), f(10, 20, 30))).toBeCloseTo(1, 6)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(f(1, 0), f(0, 1))).toBeCloseTo(0, 6)
  })

  it('returns -1 for opposed vectors', () => {
    expect(cosineSimilarity(f(1, 2), f(-1, -2))).toBeCloseTo(-1, 6)
  })

  it('returns 0 rather than NaN when a vector is all zeros', () => {
    // A divide-by-zero here would propagate NaN into the ranking sort, which
    // silently scrambles result order rather than failing.
    expect(cosineSimilarity(f(0, 0, 0), f(1, 2, 3))).toBe(0)
    expect(cosineSimilarity(f(0, 0, 0), f(0, 0, 0))).toBe(0)
  })

  it('is symmetric', () => {
    const a = f(0.3, -1.2, 4.5, 0.01)
    const b = f(-2.0, 0.7, 1.1, 3.3)
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 12)
  })

  it('compares over the shorter length when dimensions differ', () => {
    // Defensive: a truncated or differently-modelled vector should still
    // produce a usable number instead of reading past the end of the array.
    expect(cosineSimilarity(f(1, 0, 0), f(1, 0))).toBeCloseTo(1, 6)
  })

  it('ranks a near-duplicate above an unrelated vector', () => {
    const target = f(1, 1, 0, 0)
    const near = f(0.9, 1.1, 0.05, 0)
    const far = f(0, 0, 1, 1)
    expect(cosineSimilarity(target, near)).toBeGreaterThan(
      cosineSimilarity(target, far)
    )
  })

  it('stays within [-1, 1] on realistic 768-dim input', () => {
    const rand = (): Float32Array =>
      Float32Array.from({ length: 768 }, () => Math.random() * 2 - 1)
    for (let i = 0; i < 20; i++) {
      const s = cosineSimilarity(rand(), rand())
      expect(s).toBeGreaterThanOrEqual(-1.0000001)
      expect(s).toBeLessThanOrEqual(1.0000001)
    }
  })
})
