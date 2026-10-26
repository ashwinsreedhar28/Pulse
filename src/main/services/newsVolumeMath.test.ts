import { describe, expect, it } from 'vitest'
import { cdfAt, isSurge, quantileAt } from './newsVolumeMath'

const L = [0.1, 0.5, 0.9]

describe('quantileAt', () => {
  it('returns knots exactly and interpolates between them', () => {
    expect(quantileAt(L, [2, 4, 8], 0.5)).toBe(4)
    expect(quantileAt(L, [2, 4, 8], 0.7)).toBeCloseTo(6)
  })
  it('clamps outside the levels', () => {
    expect(quantileAt(L, [2, 4, 8], 0.01)).toBe(2)
    expect(quantileAt(L, [2, 4, 8], 0.99)).toBe(8)
  })
})

describe('cdfAt', () => {
  it('inverts the quantile curve', () => {
    expect(cdfAt(L, [2, 4, 8], 4)).toBeCloseTo(0.5)
    expect(cdfAt(L, [2, 4, 8], 6)).toBeCloseTo(0.7)
  })
  it('clamps beyond the outermost quantiles', () => {
    expect(cdfAt(L, [2, 4, 8], 100)).toBe(0.9)
    expect(cdfAt(L, [2, 4, 8], 0)).toBe(0.1)
  })
  it('puts a value on a flat stretch at the middle of the tied levels', () => {
    expect(cdfAt(L, [0, 0, 3], 0)).toBeCloseTo(0.3)
  })
})

describe('isSurge', () => {
  it('fires at or above q90 and never on a zero count', () => {
    expect(isSurge(L, [2, 4, 8], 8)).toBe(true)
    expect(isSurge(L, [2, 4, 8], 7.9)).toBe(false)
    expect(isSurge(L, [0, 0, 0], 0)).toBe(false)
  })
})
