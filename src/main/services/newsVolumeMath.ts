// Pure helpers for reading a quantile forecast against an actual. No I/O, so
// they are unit-tested in newsVolumeMath.test.ts.

// Value at quantile level `a`, by linear interpolation between the forecast's
// levels; clamped to the outermost levels.
export function quantileAt(levels: number[], q: number[], a: number): number {
  if (levels.length === 0 || levels.length !== q.length) return NaN
  if (a <= levels[0]) return q[0]
  if (a >= levels[levels.length - 1]) return q[q.length - 1]
  for (let i = 1; i < levels.length; i++) {
    if (a <= levels[i]) {
      const t = (a - levels[i - 1]) / (levels[i] - levels[i - 1])
      return q[i - 1] + t * (q[i] - q[i - 1])
    }
  }
  return q[q.length - 1]
}

// Approximate forecast CDF at `y`: the level at which the quantile curve
// reaches y. Flat stretches (count forecasts are often flat at 0) resolve to
// the middle of the tied levels, so a y inside a plateau is not called
// extreme. Outside the outermost levels it clamps to them (0.01 / 0.99).
export function cdfAt(levels: number[], q: number[], y: number): number {
  const n = levels.length
  if (n === 0 || n !== q.length || !Number.isFinite(y)) return NaN
  if (y < q[0]) return levels[0]
  if (y > q[n - 1]) return levels[n - 1]
  let lo = -1
  let hi = -1
  for (let i = 0; i < n; i++) {
    if (q[i] === y) {
      if (lo < 0) lo = i
      hi = i
    }
  }
  if (lo >= 0) return (levels[lo] + levels[hi]) / 2
  for (let i = 1; i < n; i++) {
    if (y < q[i]) {
      const t = (y - q[i - 1]) / (q[i] - q[i - 1])
      return levels[i - 1] + t * (levels[i] - levels[i - 1])
    }
  }
  return levels[n - 1]
}

// "News surge": the actual reached the forecast's 90th percentile, the same
// rule the backtest scored (expect ~1 day in 10 by chance when calibrated).
export function isSurge(levels: number[], q: number[], y: number): boolean {
  const q90 = quantileAt(levels, q, 0.9)
  return Number.isFinite(q90) && y >= q90 && y > 0
}
