// Forward scorecard: scores every logged forecast (forecast_log: written before
// its target session opened, never revised) against the daily bar once it
// lands. Same scoring as the bench: CRPS from the 21 quantiles, 10-90 coverage,
// and paired comparisons (pooled skill on common symbol-days, tickers won/lost
// on per-ticker mean CRPS).
import { getBarsSince, getForecastLog, type ForecastLogRow } from '../database/priceBars'
import type { ForecastScorecard, ScorecardRow } from '../../preload'
import { crps } from './forecastMath'
import { addDays } from './marketClock'
import { quantileAt } from './newsVolumeMath'
import { forecastLogStatus } from './priceForecastService'

interface Scored {
  key: string // symbol|targetDay|horizon
  symbol: string
  crps: number
  inside: boolean
}

const LABEL: Record<string, string> = {
  timestral: 'Timestral-28M',
  'timestral-rc-bl': 'Timestral-28M + RC + BL',
  'timestral-209m': 'Timestral-209M (log close)',
  empirical60: '60-day empirical',
  'ewma-rw': 'EWMA random walk',
  options: 'Options straddle'
}

function compare(a: Scored[], b: Scored[]): { skill: number | null; won: number; lost: number; n: number } {
  const bk = new Map(b.map((x) => [x.key, x]))
  const pairs = a.filter((x) => bk.has(x.key)).map((x) => [x, bk.get(x.key) as Scored] as const)
  if (!pairs.length) return { skill: null, won: 0, lost: 0, n: 0 }
  const sa = pairs.reduce((s, [x]) => s + x.crps, 0)
  const sb = pairs.reduce((s, [, y]) => s + y.crps, 0)
  const per = new Map<string, { a: number; b: number }>()
  for (const [x, y] of pairs) {
    const t = per.get(x.symbol) ?? { a: 0, b: 0 }
    t.a += x.crps
    t.b += y.crps
    per.set(x.symbol, t)
  }
  let won = 0
  let lost = 0
  for (const t of per.values()) {
    if (t.a < t.b) won++
    else if (t.a > t.b) lost++
  }
  return { skill: sb > 0 ? 1 - sa / sb : null, won, lost, n: pairs.length }
}

export function getForecastScorecard(): ForecastScorecard {
  const log = getForecastLog()
  const bySym = new Map<string, ForecastLogRow[]>()
  for (const r of log) {
    const list = bySym.get(r.symbol) ?? []
    list.push(r)
    bySym.set(r.symbol, list)
  }
  // group key: target|horizonLabel|method
  const groups = new Map<string, Scored[]>()
  let pending = 0
  let scoredN = 0
  let lastScored: string | null = null
  let nextPending: string | null = null
  for (const [sym, rows] of bySym) {
    const minDay = rows.reduce((m, r) => (r.targetDay < m ? r.targetDay : m), rows[0].targetDay)
    const bars = getBarsSince(sym, addDays(minDay, -10))
    const lastBar = bars.length ? bars[bars.length - 1].day : ''
    const actual = new Map<string, number>()
    bars.forEach((b, i) => {
      if (b.volume && b.volume > 0) actual.set(`lnV|${b.day}`, Math.log(b.volume))
      actual.set(`lnC|${b.day}`, 100 * Math.log(b.close))
      if (i > 0 && bars[i - 1].close > 0) actual.set(`absr|${b.day}`, Math.abs(100 * Math.log(b.close / bars[i - 1].close)))
    })
    for (const r of rows) {
      if (r.targetDay > lastBar) {
        pending++
        if (nextPending === null || r.targetDay < nextPending) nextPending = r.targetDay
        continue
      }
      const y = actual.get(`${r.target}|${r.targetDay}`)
      if (y === undefined) continue
      scoredN++
      if (lastScored === null || r.targetDay > lastScored) lastScored = r.targetDay
      const s: Scored = {
        key: `${sym}|${r.targetDay}|${r.horizon}`,
        symbol: sym,
        crps: crps(r.quantiles, r.levels, y),
        inside: y >= quantileAt(r.levels, r.quantiles, 0.1) && y <= quantileAt(r.levels, r.quantiles, 0.9)
      }
      const hz = r.method === 'options' ? 'expiry' : String(r.horizon)
      const gk = `${r.target}|${hz}|${r.method}`
      const list = groups.get(gk) ?? []
      list.push(s)
      groups.set(gk, list)
      // Options are compared at their own horizon: file the same-key baseline and model rows under 'expiry' too.
      if (r.method !== 'options' && r.target === 'lnC') {
        const ek = `lnC|expiry|${r.method}`
        const el = groups.get(ek) ?? []
        el.push(s)
        groups.set(ek, el)
      }
    }
  }

  const rowsOut: ScorecardRow[] = []
  const g = (t: string, h: string, m: string): Scored[] => groups.get(`${t}|${h}|${m}`) ?? []
  const emit = (target: ScorecardRow['target'], horizon: string, method: string, vs: string | null): void => {
    const a = g(target, horizon, method)
    if (!a.length) return
    const c = vs ? compare(a, g(target, horizon, vs)) : null
    rowsOut.push({
      target,
      horizon,
      method,
      label: LABEL[method] ?? method,
      vs,
      vsLabel: vs ? LABEL[vs] ?? vs : null,
      n: a.length,
      coverage: a.filter((x) => x.inside).length / a.length,
      meanCrps: a.reduce((s, x) => s + x.crps, 0) / a.length,
      pairs: c?.n ?? 0,
      skill: c?.skill ?? null,
      tickersWon: c?.won ?? 0,
      tickersLost: c?.lost ?? 0
    })
  }
  emit('lnV', '1', 'timestral', 'empirical60')
  emit('lnV', '1', 'empirical60', null)
  emit('absr', '1', 'timestral', 'empirical60')
  emit('absr', '1', 'timestral-rc-bl', 'timestral')
  emit('absr', '1', 'empirical60', null)
  for (let h = 1; h <= 5; h++) {
    emit('lnC', String(h), 'timestral-209m', 'ewma-rw')
    emit('lnC', String(h), 'ewma-rw', null)
  }
  emit('lnC', 'expiry', 'options', 'ewma-rw')
  emit('lnC', 'expiry', 'timestral-209m', 'options')

  const since = log.length ? log.reduce((m, r) => (r.targetDay < m ? r.targetDay : m), log[0].targetDay) : null
  return {
    since,
    logged: log.length,
    scored: scoredN,
    pending,
    lastScored,
    nextPending,
    tickers: bySym.size,
    rows: rowsOut,
    status: forecastLogStatus()
  }
}
