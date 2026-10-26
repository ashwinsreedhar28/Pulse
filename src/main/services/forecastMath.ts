// Quantile-forecast helpers shared by the price forecast and its forward
// scorecard. Same definitions as the bench scripts (bench/timestral_exp4.py).
import { quantileAt } from './newsVolumeMath'

export const DEFAULT_LEVELS = [0.01, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.99]
export const Z80 = 1.2815515655446004

// CRPS from quantiles: 2 x pinball loss integrated over the levels (trapezoid).
export function crps(q: number[], levels: number[], y: number): number {
  const pin = q.map((v, i) => (y < v ? (1 - levels[i]) * (v - y) : levels[i] * (y - v)))
  let area = 0
  for (let i = 1; i < levels.length; i++) area += ((pin[i - 1] + pin[i]) / 2) * (levels[i] - levels[i - 1])
  return 2 * area
}

export function scaleQ(q: number[], sc: number, levels: number[]): number[] {
  const med = quantileAt(levels, q, 0.5)
  return q.map((v) => med + sc * (v - med))
}

// Linear-interpolated sample quantile (numpy's default) of an ascending array.
export function empiricalQuantile(sorted: number[], a: number): number {
  const pos = a * (sorted.length - 1)
  const i = Math.floor(pos)
  const t = pos - i
  return i + 1 < sorted.length ? sorted[i] + t * (sorted[i + 1] - sorted[i]) : sorted[sorted.length - 1]
}

export function empiricalQuantiles(values: Array<number | null>, levels: number[], minN: number): number[] | null {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b)
  return v.length >= minN ? levels.map((a) => empiricalQuantile(v, a)) : null
}

// Inverse standard normal CDF (Acklam), |error| < 1.2e-9.
export function invNorm(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const lo = 0.02425
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

export function gaussianQuantiles(mean: number, sd: number, levels: number[]): number[] {
  return levels.map((a) => mean + sd * invNorm(a))
}
