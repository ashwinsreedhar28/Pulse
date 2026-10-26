// Per-ticker forecasts from the stock's own daily bars (see the Runpod
// project's pulse-timestral-plan.md for every number quoted here):
// - next-session log volume and |return|: Timestral-28M with day of week and the
//   earnings window as known covariates (Exp 4 base "B"; volume 17-22% better
//   than a 60-day empirical baseline on every ticker over three holdouts).
//   |return| adds Exp 4's two small holdout passes: trailing recalibration (RC)
//   and a 25% empirical-60 quantile pool (BL).
// - close band, sessions 1-5: Timestral-209M on 100*ln(close) (Exp 5 holdout:
//   beat the EWMA random walk at every horizon on 49-61 of 69 tickers). No
//   direction anywhere: every backtest put the median below always-up.
// - sessions 6-10: EWMA(0.94) random walk, untested.
// - options: the nearest-expiry ATM straddle's implied range, compared with the
//   model's band at the same horizon (descriptive, not backtested).
// Every forecast made before its target session opens is also written to
// forecast_log, never revised, for the forward scorecard (forecastScorecardService).
//
// Bars: api.nasdaq.com historical (split-adjusted, not dividend-adjusted).
// Earnings: the frozen Nasdaq calendar in src/data/earningsCalendar.json plus
// the next date from the Yahoo earnings badge.
import calendarFile from '../../data/earningsCalendar.json'
import {
  getBars,
  getPriceForecasts,
  hasLoggedSession,
  logForecasts,
  upsertBars,
  upsertPriceForecasts,
  type Bar,
  type ForecastLogRow
} from '../database/priceBars'
import { listTickers } from '../database/tickers'
import type { PriceForecastSnapshot, PriceForecastDay, Range80, PriceForecastOptions } from '../../preload'
import { getEarningsBadge } from './earningsService'
import { DEFAULT_LEVELS, Z80, crps, empiricalQuantiles, gaussianQuantiles, scaleQ } from './forecastMath'
import { addDays, inSession, lastCompletedSession, nextTradingDay, sessionOpenMs } from './marketClock'
import { quantileAt } from './newsVolumeMath'
import { callWorker } from './timestralWorker'
import { getOptionsSnapshot } from './yahooFinanceService'

const MODEL = '28M'
const CONFIG = 'B' // 28M, context 1024, dow + earnings window (PREREG_EXP4.md base)
const CONTEXT = 1024
const BACKCAST_DAYS = 60
const FAN_DAYS = 10
const FAN_MODEL = '209M'
const FAN_HZ = 5
const RC_GRID = Array.from({ length: 27 }, (_, i) => Math.round((0.7 + 0.05 * i) * 100) / 100)
const RC_LOOKBACK = 24
const BL_W = 0.75
const BARS_RETRY_MS = 15 * 60 * 1000
const SNAPSHOT_TTL_MS = 10 * 60 * 1000
const OPTIONS_MAX_AGE_MS = 18 * 60 * 60 * 1000
const MIN_BARS = 120
const SQRT_PI_2 = Math.sqrt(Math.PI / 2) // E|X| = sigma * sqrt(2/pi) for a normal, so sigma = straddle * sqrt(pi/2)
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

const REPORTS = (calendarFile as unknown as { reports: Record<string, Array<[string, number | null]>> }).reports

interface ForecastResult {
  model: string
  levels: number[]
  quantiles: Record<string, number[][]>
  ms: number
}

const snapshotCache = new Map<string, { at: number; value: PriceForecastSnapshot }>()
const inflight = new Map<string, Promise<PriceForecastSnapshot>>()
const lastBarsAttempt = new Map<string, number>()

// Monday = 0 .. Sunday = 6, as Python's weekday() in the experiments.
function dow(day: string): number {
  const g = new Date(`${day}T00:00:00Z`).getUTCDay()
  return g === 0 ? 6 : g - 1
}

function num(s: unknown): number | null {
  if (s === null || s === undefined) return null
  const v = Number(String(s).replace(/[$,]/g, ''))
  return Number.isFinite(v) ? v : null
}

// Rows after the last completed session (today's bar before 17:00 ET) are
// dropped: a partial session's volume would poison every forecast.
async function fetchNasdaqBars(symbol: string, fromDay: string): Promise<Bar[]> {
  const to = new Date().toISOString().slice(0, 10)
  const lastFinal = lastCompletedSession()
  const tryClass = async (assetclass: string): Promise<Bar[]> => {
    const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=${assetclass}&fromdate=${fromDay}&limit=9999&todate=${to}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' },
        signal: controller.signal
      })
      if (!res.ok) throw new Error(`Nasdaq historical ${res.status}`)
      const j = (await res.json()) as { data?: { tradesTable?: { rows?: Array<Record<string, string>> } } }
      const rows = j.data?.tradesTable?.rows ?? []
      const out: Bar[] = []
      for (const r of rows) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(r.date ?? '')
        const close = num(r.close)
        if (!m || close === null) continue
        const day = `${m[3]}-${m[1]}-${m[2]}`
        if (day > lastFinal) continue
        out.push({ day, open: num(r.open), high: num(r.high), low: num(r.low), close, volume: num(r.volume) })
      }
      out.sort((a, b) => (a.day < b.day ? -1 : 1))
      return out
    } finally {
      clearTimeout(timer)
    }
  }
  for (const ac of ['stocks', 'etf']) {
    const bars = await tryClass(ac)
    if (bars.length) return bars
  }
  return []
}

// Full 10-year pull on first sight, then the last 30 days whenever the newest
// stored bar is older than the last completed session.
async function ensureBars(symbol: string): Promise<Bar[]> {
  const have = getBars(symbol)
  const last = have.length ? have[have.length - 1].day : null
  const current = last !== null && last >= lastCompletedSession()
  if (have.length >= MIN_BARS && current) return have
  const tried = lastBarsAttempt.get(symbol)
  if (have.length && tried && Date.now() - tried < BARS_RETRY_MS) return have
  lastBarsAttempt.set(symbol, Date.now())
  const from = have.length >= MIN_BARS && last ? addDays(last, -30) : addDays(new Date().toISOString().slice(0, 10), -3653)
  const fresh = await fetchNasdaqBars(symbol, from)
  if (fresh.length) {
    upsertBars(symbol, fresh)
    return getBars(symbol)
  }
  return have
}

// Earnings window (report day and the trading day after) and |EPS surprise %|
// placed on the day after, as PREREG_EXP3 defines C3A/C3B. Report dates on a
// non-trading day roll to the next trading day.
async function earningsCovariates(symbol: string, days: string[]): Promise<{ flag: number[]; surprise: number[]; next: string | null }> {
  const idx = new Map(days.map((d, i) => [d, i]))
  const flag = new Array<number>(days.length).fill(0)
  const surprise = new Array<number>(days.length).fill(0)
  const reports: Array<[string, number | null]> = [...(REPORTS[symbol] ?? [])]
  let next: string | null = null
  try {
    const badge = await getEarningsBadge(symbol)
    if (badge.nextDate) {
      const d = new Date(badge.nextDate).toISOString().slice(0, 10)
      if (!reports.some(([r]) => r === d)) reports.push([d, null])
      if (d >= days[days.length - 1]) next = d
    }
  } catch {
    /* Yahoo throttled: the frozen calendar still covers history */
  }
  const place = (date: string): number | null => {
    if (date < days[0]) return null
    let k = idx.get(date)
    if (k === undefined) k = days.findIndex((d) => d >= date)
    return k === undefined || k < 0 ? null : k
  }
  for (const [date, s] of reports) {
    const k = place(date)
    if (k === null) continue
    flag[k] = 1
    if (k + 1 < days.length) {
      flag[k + 1] = 1
      if (s !== null) surprise[k + 1] = Math.abs(s)
    }
  }
  return { flag, surprise, next }
}

function range80(levels: number[], q: number[], f: (v: number) => number = (v) => v): Range80 {
  return { q10: f(quantileAt(levels, q, 0.1)), q50: f(quantileAt(levels, q, 0.5)), q90: f(quantileAt(levels, q, 0.9)) }
}

export async function getPriceForecastSnapshot(rawSymbol: string): Promise<PriceForecastSnapshot> {
  const symbol = rawSymbol.toUpperCase()
  const hit = snapshotCache.get(symbol)
  if (hit && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.value
  return buildOnce(symbol)
}

function buildOnce(symbol: string): Promise<PriceForecastSnapshot> {
  const running = inflight.get(symbol)
  if (running) return running
  const p = buildSnapshot(symbol)
    .then((v) => {
      snapshotCache.set(symbol, { at: Date.now(), value: v })
      return v
    })
    .finally(() => inflight.delete(symbol))
  inflight.set(symbol, p)
  return p
}

async function buildSnapshot(symbol: string): Promise<PriceForecastSnapshot> {
  const empty = (reason: string): PriceForecastSnapshot => ({
    symbol, available: false, reason, model: MODEL, config: CONFIG, asOf: null, next: null, days: [],
    calib: { n: 0, volumeCoverage: null, moveCoverage: null, volumeAboveQ90: 0, moveAboveQ90: 0 }, ewmaSigma: null,
    priceFan: [], options: null, logged: 0
  })
  const bars = await ensureBars(symbol)
  if (bars.length < MIN_BARS) return empty(bars.length ? `Only ${bars.length} daily bars; need ${MIN_BARS}.` : 'No daily bars from Nasdaq for this symbol.')
  const n = bars.length
  const days = bars.map((b) => b.day)
  const asOf = days[n - 1]
  const nextDay = nextTradingDay(asOf)
  const future: string[] = []
  for (let d = asOf, h = 0; h < FAN_DAYS; h++) {
    d = nextTradingDay(d)
    future.push(d)
  }
  const allDays = [...days, ...future]
  const lnV = bars.map((b) => (b.volume && b.volume > 0 ? Math.log(b.volume) : null))
  const r: Array<number | null> = bars.map((b, i) => (i > 0 && bars[i - 1].close > 0 ? 100 * Math.log(b.close / bars[i - 1].close) : null))
  const absr = r.map((x) => (x === null ? null : Math.abs(x)))
  const { flag, surprise, next: nextEarnings } = await earningsCovariates(symbol, allDays)

  // Volume and |move|: the next session plus the last BACKCAST_DAYS sessions that lack a stored forecast.
  const btFrom = days[Math.max(0, n - BACKCAST_DAYS)]
  const stored = {
    lnV: getPriceForecasts(symbol, 'lnV', CONFIG, btFrom, nextDay),
    absr: getPriceForecasts(symbol, 'absr', CONFIG, btFrom, nextDay)
  }
  const targets = [...Array.from({ length: Math.min(BACKCAST_DAYS, n) }, (_, k) => n - Math.min(BACKCAST_DAYS, n) + k), n]
  const series: Record<string, Array<number | null>> = {}
  const known: Record<string, number[][]> = {}
  const dows: Record<string, number[]> = {}
  for (const t of targets) {
    const day = allDays[t]
    const lo = Math.max(0, t - CONTEXT)
    for (const [tk, src] of [['lnV', lnV], ['absr', absr]] as const) {
      if (stored[tk].has(day)) continue
      const key = `${tk}@${day}`
      series[key] = src.slice(lo, t)
      known[key] = [flag.slice(lo, t + 1), surprise.slice(lo, t + 1)]
      dows[key] = allDays.slice(lo, t + 1).map(dow)
    }
  }
  if (Object.keys(series).length) {
    const res = await callWorker<ForecastResult>(
      'forecast_cov',
      { model: MODEL, series, known, dow: dows, horizon: 1, threads: 4 },
      5 * 60_000
    )
    upsertPriceForecasts(
      symbol,
      Object.entries(res.quantiles).map(([key, steps]) => ({
        targetDay: key.split('@')[1], target: key.split('@')[0], config: CONFIG, quantiles: steps[0], levels: res.levels
      }))
    )
    stored.lnV = getPriceForecasts(symbol, 'lnV', CONFIG, btFrom, nextDay)
    stored.absr = getPriceForecasts(symbol, 'absr', CONFIG, btFrom, nextDay)
  }

  // EWMA(0.94) variance of daily log returns (percent), seeded on the first 60.
  const fin = r.map((x, i) => (x === null ? -1 : i)).filter((i) => i >= 0)
  let sig2: number | null = null
  if (fin.length >= 61) {
    const seed = fin.slice(0, 60).map((i) => r[i] as number)
    const mean = seed.reduce((a, b) => a + b, 0) / seed.length
    sig2 = seed.reduce((a, b) => a + (b - mean) ** 2, 0) / seed.length
    for (const i of fin.slice(60)) sig2 = 0.94 * sig2 + 0.06 * (r[i] as number) ** 2
  }
  const lastClose = bars[n - 1].close
  const lnLast = 100 * Math.log(lastClose)
  const sigma = sig2 === null ? null : Math.sqrt(sig2)

  // Close band: Timestral-209M on 100*ln(close), horizons 1-5.
  let fanQ: number[][] | null = null
  let levels: number[] = DEFAULT_LEVELS
  try {
    const lo = Math.max(0, n - CONTEXT)
    const lnC = bars.map((b) => 100 * Math.log(b.close))
    const key = `lnC@${nextDay}`
    const res = await callWorker<ForecastResult>(
      'forecast_cov',
      {
        model: FAN_MODEL,
        series: { [key]: lnC.slice(lo, n) },
        known: { [key]: [flag.slice(lo, n + FAN_HZ), surprise.slice(lo, n + FAN_HZ)] },
        dow: { [key]: allDays.slice(lo, n + FAN_HZ).map(dow) },
        horizon: FAN_HZ,
        threads: 4
      },
      5 * 60_000
    )
    fanQ = res.quantiles[key] ?? null
    levels = res.levels
  } catch (err) {
    console.warn('[priceForecast] close band fell back to EWMA:', err instanceof Error ? err.message : err)
  }
  const priceFan: PriceForecastSnapshot['priceFan'] = []
  for (let h = 1; h <= FAN_DAYS; h++) {
    const d = future[h - 1]
    const q = fanQ && h <= FAN_HZ ? fanQ[h - 1] : null
    if (q) {
      priceFan.push({
        day: d,
        lo: Math.exp(quantileAt(levels, q, 0.1) / 100),
        mid: Math.exp(quantileAt(levels, q, 0.5) / 100),
        hi: Math.exp(quantileAt(levels, q, 0.9) / 100),
        source: 'timestral'
      })
    } else if (sigma !== null) {
      const w = (Z80 * sigma * Math.sqrt(h)) / 100
      priceFan.push({ day: d, lo: lastClose * Math.exp(-w), mid: lastClose, hi: lastClose * Math.exp(w), source: 'ewma' })
    }
  }

  // |move| next session: RC then BL on top of the stored B forecast.
  const nmRaw = stored.absr.get(nextDay)
  let nextMoveQ: number[] | null = null
  let rcScale: number | null = null
  const emp60Move = empiricalQuantiles(absr.slice(Math.max(0, n - 60), n), levels, 30)
  if (nmRaw) {
    const hist = targets
      .slice(0, -1)
      .slice(-RC_LOOKBACK)
      .map((t) => ({ y: absr[t], f: stored.absr.get(days[t]) }))
      .filter((x): x is { y: number; f: { quantiles: number[]; levels: number[] } } => x.y !== null && !!x.f)
    let q = nmRaw.quantiles
    if (hist.length >= 12) {
      let best = 1
      let bestScore = Infinity
      for (const sc of RC_GRID) {
        const score = hist.reduce((a, x) => a + crps(scaleQ(x.f.quantiles, sc, x.f.levels), x.f.levels, x.y), 0) / hist.length
        if (score < bestScore) {
          bestScore = score
          best = sc
        }
      }
      rcScale = best
      q = scaleQ(q, best, nmRaw.levels)
    }
    if (emp60Move) q = q.map((v, i) => BL_W * v + (1 - BL_W) * emp60Move[i])
    nextMoveQ = q
  }

  // Options: nearest-expiry ATM straddle -> implied sigma to expiry (log %),
  // compared with the model's band at the same number of sessions.
  let options: PriceForecastOptions | null = null
  let optionsQ: { h: number; q: number[] } | null = null
  try {
    const o = await getOptionsSnapshot(symbol)
    if (o && Date.now() - o.fetchedAt < OPTIONS_MAX_AGE_MS) {
      const expiry = new Date(o.expiryDate).toISOString().slice(0, 10)
      const k = future.findIndex((d) => d >= expiry)
      const h = k + 1
      let sdT: number | null = null
      let basis: 'straddle' | 'iv' = 'straddle'
      if (o.expectedMovePct !== null && o.expectedMovePct > 0) sdT = 100 * o.expectedMovePct * SQRT_PI_2
      else if (o.impliedVol !== null && o.impliedVol > 0 && h > 0) {
        sdT = 100 * o.impliedVol * Math.sqrt(h / 252)
        basis = 'iv'
      }
      if (expiry > asOf && k >= 0 && sdT !== null) {
        const band = priceFan[k]
        const modelHalf = band ? (100 * (Math.log(band.hi) - Math.log(band.lo))) / 2 : null
        const impliedHalf = Z80 * sdT
        options = {
          expiry,
          sessions: h,
          basis,
          impliedHalfPct: impliedHalf,
          modelHalfPct: modelHalf,
          modelSource: band?.source ?? null,
          ratio: modelHalf ? impliedHalf / modelHalf : null,
          lo: lastClose * Math.exp(-impliedHalf / 100),
          hi: lastClose * Math.exp(impliedHalf / 100),
          underlying: o.underlyingPrice,
          fetchedAt: o.fetchedAt
        }
        optionsQ = { h, q: gaussianQuantiles(lnLast, sdT, levels) }
      }
    }
  } catch {
    /* options are optional */
  }

  // Forward log: only forecasts made before the target session opens count.
  let logged = 0
  if (Date.now() < sessionOpenMs(nextDay)) {
    const rows: Array<Omit<ForecastLogRow, 'madeAt'>> = []
    const add = (target: ForecastLogRow['target'], horizon: number, method: string, q: number[] | null | undefined, lv = levels): void => {
      if (q) rows.push({ symbol, targetDay: future[horizon - 1], horizon, target, method, asOfDay: asOf, quantiles: q, levels: lv })
    }
    const nv = stored.lnV.get(nextDay)
    add('lnV', 1, 'timestral', nv?.quantiles, nv?.levels)
    add('lnV', 1, 'empirical60', empiricalQuantiles(lnV.slice(Math.max(0, n - 60), n), levels, 30))
    add('absr', 1, 'timestral', nmRaw?.quantiles, nmRaw?.levels)
    add('absr', 1, 'timestral-rc-bl', nextMoveQ, nmRaw?.levels)
    add('absr', 1, 'empirical60', emp60Move)
    for (let h = 1; h <= FAN_DAYS; h++) {
      if (fanQ && h <= FAN_HZ) add('lnC', h, 'timestral-209m', fanQ[h - 1])
      if (sigma !== null) add('lnC', h, 'ewma-rw', gaussianQuantiles(lnLast, sigma * Math.sqrt(h), levels))
    }
    if (optionsQ) add('lnC', optionsQ.h, 'options', optionsQ.q)
    logged = logForecasts(rows)
  }

  const out: PriceForecastDay[] = targets.slice(0, -1).map((t) => {
    const day = days[t]
    const fv = stored.lnV.get(day)
    const fm = stored.absr.get(day)
    return {
      day,
      close: bars[t].close,
      volume: bars[t].volume,
      move: absr[t],
      ret: r[t],
      volumeFc: fv ? range80(fv.levels, fv.quantiles, Math.exp) : null,
      moveFc: fm ? range80(fm.levels, fm.quantiles) : null,
      earnings: flag[t] === 1
    }
  })
  const scoredV = out.filter((d) => d.volume !== null && d.volumeFc)
  const scoredM = out.filter((d) => d.move !== null && d.moveFc)
  const inV = scoredV.filter((d) => (d.volume as number) >= (d.volumeFc as Range80).q10 && (d.volume as number) <= (d.volumeFc as Range80).q90)
  const inM = scoredM.filter((d) => (d.move as number) >= (d.moveFc as Range80).q10 && (d.move as number) <= (d.moveFc as Range80).q90)
  const nv = stored.lnV.get(nextDay)
  return {
    symbol,
    available: true,
    reason: null,
    model: MODEL,
    config: CONFIG,
    asOf,
    next: {
      day: nextDay,
      volume: nv ? range80(nv.levels, nv.quantiles, Math.exp) : null,
      move: nextMoveQ && nmRaw ? range80(nmRaw.levels, nextMoveQ) : null,
      moveConfig: rcScale === null ? 'B+BL' : `B+RC(${rcScale.toFixed(2)})+BL`,
      price: sigma === null ? null : { lo: lastClose * Math.exp((-Z80 * sigma) / 100), hi: lastClose * Math.exp((Z80 * sigma) / 100), lastClose },
      earnings: flag[n] === 1,
      nextEarnings
    },
    days: out,
    calib: {
      n: scoredV.length,
      volumeCoverage: scoredV.length ? inV.length / scoredV.length : null,
      moveCoverage: scoredM.length ? inM.length / scoredM.length : null,
      volumeAboveQ90: scoredV.filter((d) => (d.volume as number) > (d.volumeFc as Range80).q90).length,
      moveAboveQ90: scoredM.filter((d) => (d.move as number) > (d.moveFc as Range80).q90).length
    },
    ewmaSigma: sigma,
    priceFan,
    options,
    logged
  }
}

// ---- Daily forward-log run ----
// Outside market hours, for every held ticker whose next session has no logged
// forecast yet: refresh bars, build the snapshot (which logs). Hourly, so the
// evening after each close and the morning before the open are both covered.
const FIRST_RUN_DELAY_MS = 6 * 60 * 1000
const RUN_EVERY_MS = 60 * 60 * 1000
const PACE_MS = 1000
let firstTimer: NodeJS.Timeout | null = null
let timer: NodeJS.Timeout | null = null
const status = { running: false, lastRunAt: null as number | null, lastError: null as string | null, lastLogged: 0, lastTickers: 0 }

export function forecastLogStatus(): typeof status {
  return { ...status }
}

export async function runForecastLog(): Promise<typeof status> {
  if (status.running || inSession()) return forecastLogStatus()
  status.running = true
  status.lastError = null
  let logged = 0
  let tickers = 0
  try {
    const held = listTickers()
      .filter((t) => t.isActive)
      .map((t) => t.symbol.toUpperCase())
    for (const s of held) {
      try {
        const bars = await ensureBars(s)
        if (bars.length < MIN_BARS) continue
        const nd = nextTradingDay(bars[bars.length - 1].day)
        if (Date.now() >= sessionOpenMs(nd) || hasLoggedSession(s, nd)) continue
        snapshotCache.delete(s)
        const snap = await buildOnce(s)
        logged += snap.logged
        tickers++
        await new Promise((res) => setTimeout(res, PACE_MS))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        status.lastError = `${s}: ${msg}`
        if (/Python not found|worker script not found/.test(msg)) break
      }
    }
  } finally {
    status.running = false
    status.lastRunAt = Date.now()
    status.lastLogged = logged
    status.lastTickers = tickers
  }
  return forecastLogStatus()
}

export function startPriceForecastScheduler(): void {
  stopPriceForecastScheduler()
  firstTimer = setTimeout(() => void runForecastLog(), FIRST_RUN_DELAY_MS)
  timer = setInterval(() => void runForecastLog(), RUN_EVERY_MS)
}

export function stopPriceForecastScheduler(): void {
  if (firstTimer) clearTimeout(firstTimer)
  if (timer) clearInterval(timer)
  firstTimer = null
  timer = null
}

