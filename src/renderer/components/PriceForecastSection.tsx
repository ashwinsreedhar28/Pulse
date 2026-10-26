import { useEffect, useRef, useState } from 'react'
import type { PriceForecastSnapshot, Range80 } from '../../preload'
import { CollapsibleSection } from './CollapsibleSection'

function fmtVol(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toFixed(0)
}
function fmtPct(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(2)}%`
}
function fmtPx(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : n < 10 ? n.toFixed(3) : n.toFixed(2)
}

// Charts render at a fixed width per session and scroll horizontally (synced),
// opening at the right edge so the forecast is in view.
const SLOT = 22
const H = 150
const PAD_L = 44
const PAD_B = 18
const PAD_T = 8
const widthFor = (n: number): number => PAD_L + n * SLOT + 8

function Scroller({ children, axis, width, group }: { children: React.ReactNode; axis: React.ReactNode; width: number; group: React.MutableRefObject<HTMLDivElement[]> }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    group.current.push(el)
    el.scrollLeft = el.scrollWidth
    return () => {
      group.current = group.current.filter((x) => x !== el)
    }
  }, [group, width])
  return (
    <div className="relative">
      <div
        ref={ref}
        className="overflow-x-auto"
        onScroll={(e) => {
          const left = e.currentTarget.scrollLeft
          for (const o of group.current) if (o !== e.currentTarget && Math.abs(o.scrollLeft - left) > 1) o.scrollLeft = left
        }}
      >
        <div style={{ width }}>{children}</div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0" style={{ width: PAD_L }}>
        {axis}
      </div>
    </div>
  )
}

// Y-axis labels, drawn in a fixed strip over the scroller's left edge.
function YAxis({ ticks, y, fmt }: { ticks: number[]; y: (v: number) => number; fmt: (v: number) => string }): JSX.Element {
  return (
    <svg width={PAD_L} height={H} viewBox={`0 0 ${PAD_L} ${H}`} className="bg-surface-1">
      {ticks.map((v) => (
        <text key={v} x={PAD_L - 4} y={y(v) + 3} textAnchor="end" className="fill-zinc-500 text-[9px]">
          {fmt(v)}
        </text>
      ))}
    </svg>
  )
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function mmdd(day: string): string {
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`
}

// X axis for a list of session dates (history then forecast slots): a tick at
// every Monday, labelled every other week; the first session of each month is
// labelled with the month name; forecast slots are labelled individually.
function XAxis({ days, nHist, x, xw }: { days: string[]; nHist: number; x: (i: number) => number; xw: number }): JSX.Element {
  const W = widthFor(days.length)
  const items: JSX.Element[] = []
  let weeks = 0
  days.forEach((d, i) => {
    const date = new Date(`${d}T00:00:00Z`)
    const monthStart = i === 0 || d.slice(0, 7) !== days[i - 1].slice(0, 7)
    const monday = date.getUTCDay() === 1
    if (i >= nHist) {
      // Forecast slots: label the first and last, tick the rest (they overlap otherwise).
      const label = i === nHist || i === days.length - 1
      items.push(
        <g key={d}>
          <line x1={x(i)} x2={x(i)} y1={H - PAD_B} y2={H - PAD_B + 3} className="stroke-sky-300/60" strokeWidth={1} />
          {label && (
            <text x={x(i)} y={H - 4} textAnchor={i === nHist && days.length - nHist > 1 ? 'start' : 'end'} className="fill-sky-300/80 text-[8px]">
              {mmdd(d)}
            </text>
          )}
        </g>
      )
      return
    }
    // Skip the week label that would collide with the forecast labels.
    if (i >= nHist - 3 && monday && !monthStart) {
      items.push(<line key={d} x1={x(i) - xw / 2} x2={x(i) - xw / 2} y1={H - PAD_B} y2={H - PAD_B + 3} className="stroke-zinc-600" strokeWidth={1} />)
      return
    }
    if (monday) weeks++
    if (monthStart) {
      items.push(
        <g key={d}>
          <line x1={x(i) - xw / 2} x2={x(i) - xw / 2} y1={PAD_T} y2={H - PAD_B} className="stroke-zinc-700/70" strokeWidth={1} />
          <text x={x(i) - xw / 2 + 2} y={H - 4} className="fill-zinc-400 text-[9px]">
            {MONTHS[date.getUTCMonth()]}
          </text>
        </g>
      )
    } else if (monday) {
      items.push(
        <g key={d}>
          <line x1={x(i) - xw / 2} x2={x(i) - xw / 2} y1={H - PAD_B} y2={H - PAD_B + 3} className="stroke-zinc-600" strokeWidth={1} />
          {(
            <text x={x(i) - xw / 2} y={H - 4} textAnchor="middle" className="fill-zinc-600 text-[8px]">
              {mmdd(d)}
            </text>
          )}
        </g>
      )
    }
  })
  return (
    <g>
      <line x1={PAD_L} x2={W - 4} y1={H - PAD_B} y2={H - PAD_B} className="stroke-zinc-700" strokeWidth={1} />
      {items}
    </g>
  )
}

interface Pt {
  day: string
  actual: number | null
  fc: Range80 | null
  flag: boolean
}

// Bars: actuals. Blue band + line: the 80% range and median the model gave
// the session before (through the previous close). Amber: above the 90th
// percentile. The last slot is the next session's forecast (no actual yet).
function barScale(pts: Pt[], next: Range80 | null): { max: number; y: (v: number) => number; ticks: number[] } {
  const vals = [...pts.flatMap((p) => [p.actual ?? 0, p.fc?.q90 ?? 0]), next?.q90 ?? 0]
  const max = Math.max(1e-9, ...vals) * 1.08
  const plotH = H - PAD_B - PAD_T
  const y = (v: number): number => PAD_T + plotH - (v / max) * plotH
  return { max, y, ticks: [0, max / 2, max] }
}

function Chart({ pts, next, nextDay, label }: { pts: Pt[]; next: Range80 | null; nextDay: string; label: string }): JSX.Element {
  const n = pts.length + 1
  const W = widthFor(n)
  const { max, y } = barScale(pts, next)
  const xw = SLOT
  const x = (i: number): number => PAD_L + i * xw + xw / 2
  const band = (b: Array<{ i: number; lo: number; hi: number }>): string =>
    b.length
      ? `M${b.map((p) => `${x(p.i).toFixed(1)},${y(p.hi).toFixed(1)}`).join(' L')} L${[...b]
          .reverse()
          .map((p) => `${x(p.i).toFixed(1)},${y(p.lo).toFixed(1)}`)
          .join(' L')} Z`
      : ''
  const bt = pts.flatMap((p, i) => (p.fc ? [{ i, lo: p.fc.q10, hi: p.fc.q90 }] : []))
  const med = pts.flatMap((p, i) => (p.fc ? [`${x(i).toFixed(1)},${y(p.fc.q50).toFixed(1)}`] : []))
  const off = pts.length
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0, max / 2, max].map((v) => (
        <line key={v} x1={PAD_L} x2={W - 4} y1={y(v)} y2={y(v)} className="stroke-zinc-800" strokeWidth={1} />
      ))}
      {pts.map((p, i) =>
        p.actual === null ? null : (
          <rect
            key={p.day}
            x={x(i) - xw * 0.35}
            y={y(p.actual)}
            width={xw * 0.7}
            height={Math.max(0.5, y(0) - y(p.actual))}
            className={p.fc && p.actual > p.fc.q90 ? 'fill-amber-400/80' : p.flag ? 'fill-violet-400/60' : 'fill-zinc-500/60'}
          />
        )
      )}
      <path d={band(bt)} className="fill-sky-400/15" />
      {med.length > 1 && <path d={`M${med.join(' L')}`} fill="none" className="stroke-sky-300/80" strokeWidth={1.2} />}
      {next && (
        <g>
          <line x1={x(off)} x2={x(off)} y1={y(next.q10)} y2={y(next.q90)} className="stroke-sky-300/70" strokeWidth={2} strokeDasharray="3 2" />
          <circle cx={x(off)} cy={y(next.q50)} r={2.5} className="fill-sky-300" />
        </g>
      )}
      <line x1={x(off) - xw / 2} x2={x(off) - xw / 2} y1={PAD_T} y2={H - PAD_B} className="stroke-zinc-600" strokeDasharray="2 3" />
      <XAxis days={[...pts.map((p) => p.day), nextDay]} nHist={pts.length} x={x} xw={xw} />
    </svg>
  )
}

// Last 60 closes with the 5-session EWMA band (80%). The midline is flat on
// purpose: no backtest found a usable direction.
function priceScale(s: PriceForecastSnapshot): { y: (v: number) => number; ticks: number[] } {
  const vals = [...s.days.map((d) => d.close), ...s.priceFan.flatMap((f) => [f.lo, f.hi]), ...(s.options ? [s.options.lo, s.options.hi] : [])]
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = (hi - lo) * 0.08 || 1
  const plotH = H - PAD_B - PAD_T
  const y = (v: number): number => PAD_T + plotH - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * plotH
  return { y, ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo)) }
}

function PriceChart({ s }: { s: PriceForecastSnapshot }): JSX.Element {
  const closes = s.days.map((d) => ({ day: d.day, v: d.close }))
  const fan = s.priceFan
  const n = closes.length + fan.length
  const W = widthFor(n)
  const { y, ticks } = priceScale(s)
  const xw = SLOT
  const x = (i: number): number => PAD_L + i * xw + xw / 2
  const line = closes.map((c, i) => `${x(i).toFixed(1)},${y(c.v).toFixed(1)}`).join(' L')
  const off = closes.length
  const fanPts = [{ i: off - 1, lo: closes[off - 1]?.v ?? 0, hi: closes[off - 1]?.v ?? 0 }, ...fan.map((f, k) => ({ i: off + k, lo: f.lo, hi: f.hi }))]
  const band = `M${fanPts.map((p) => `${x(p.i).toFixed(1)},${y(p.hi).toFixed(1)}`).join(' L')} L${[...fanPts]
    .reverse()
    .map((p) => `${x(p.i).toFixed(1)},${y(p.lo).toFixed(1)}`)
    .join(' L')} Z`
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.symbol} close and ${fan.length}-session range`}>
      {ticks.map((v) => (
        <line key={v} x1={PAD_L} x2={W - 4} y1={y(v)} y2={y(v)} className="stroke-zinc-800" strokeWidth={1} />
      ))}
      {closes.length > 1 && <path d={`M${line}`} fill="none" className="stroke-zinc-300" strokeWidth={1.2} />}
      {fan.length > 0 && <path d={band} className="fill-emerald-400/12 stroke-emerald-300/50" strokeWidth={1} strokeDasharray="3 3" />}
      {fan.map((f, k) => (
        <line
          key={f.day}
          x1={x(off + k)}
          x2={x(off + k)}
          y1={y(f.lo)}
          y2={y(f.hi)}
          className={f.source === 'timestral' ? 'stroke-emerald-300/70' : 'stroke-zinc-500/50'}
          strokeWidth={2}
        />
      ))}
      {s.options && s.options.sessions <= fan.length && (
        <g>
          <line
            x1={x(off + s.options.sessions - 1) + 5}
            x2={x(off + s.options.sessions - 1) + 5}
            y1={y(s.options.hi)}
            y2={y(s.options.lo)}
            className="stroke-violet-300/80"
            strokeWidth={2}
          />
          <line x1={x(off + s.options.sessions - 1) + 2} x2={x(off + s.options.sessions - 1) + 8} y1={y(s.options.hi)} y2={y(s.options.hi)} className="stroke-violet-300/80" strokeWidth={1.5} />
          <line x1={x(off + s.options.sessions - 1) + 2} x2={x(off + s.options.sessions - 1) + 8} y1={y(s.options.lo)} y2={y(s.options.lo)} className="stroke-violet-300/80" strokeWidth={1.5} />
        </g>
      )}
      <line x1={x(off) - xw / 2} x2={x(off) - xw / 2} y1={PAD_T} y2={H - PAD_B} className="stroke-zinc-600" strokeDasharray="2 3" />
      <XAxis days={[...closes.map((c) => c.day), ...fan.map((f) => f.day)]} nHist={closes.length} x={x} xw={xw} />
    </svg>
  )
}

export function PriceForecastSection({ symbol }: { symbol: string }): JSX.Element {
  const [snap, setSnap] = useState<PriceForecastSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollers = useRef<HTMLDivElement[]>([])

  useEffect(() => {
    let live = true
    setSnap(null)
    setError(null)
    window.api.priceForecast
      .snapshot(symbol)
      .then((s) => live && setSnap(s))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      live = false
    }
  }, [symbol])

  const nx = snap?.next
  return (
    <CollapsibleSection
      title="Next-session forecast"
      meta={<span>Timestral-{snap?.model ?? '28M'} · Nasdaq daily bars · {snap?.asOf ? `through ${snap.asOf}` : ''}</span>}
      defaultOpen
    >
      {error && <div className="text-[12px] text-red-400">Could not load: {error}</div>}
      {!snap && !error && (
        <div className="py-8 text-center text-[11px] uppercase tracking-[0.22em] text-zinc-600">
          Forecasting… (first open pulls 10 years of bars and backfills 60 sessions)
        </div>
      )}
      {snap && !snap.available && <div className="text-[12px] text-zinc-400">{snap.reason}</div>}
      {snap && snap.available && nx && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label={`Volume ${nx.day.slice(5)}`}
              value={fmtVol(nx.volume?.q50)}
              sub={nx.volume ? `80% range ${fmtVol(nx.volume.q10)}–${fmtVol(nx.volume.q90)}` : ''}
            />
            <Stat
              label="Move size"
              value={nx.move ? `±${fmtPct(nx.move.q50)}` : '—'}
              sub={nx.move ? `80% range ${fmtPct(nx.move.q10)}–${fmtPct(nx.move.q90)} · ${nx.moveConfig}` : ''}
            />
            <Stat
              label={`Close range ${nx.day.slice(5)}`}
              value={snap.priceFan[0] ? `${fmtPx(snap.priceFan[0].lo)}–${fmtPx(snap.priceFan[0].hi)}` : nx.price ? `${fmtPx(nx.price.lo)}–${fmtPx(nx.price.hi)}` : '—'}
              sub={`80% · ${snap.priceFan[0]?.source === 'timestral' ? 'Timestral-209M on log close' : 'EWMA'} · last ${fmtPx(nx.price?.lastClose)} · no direction`}
            />
            <Stat
              label="Inside 80% range"
              value={snap.calib.volumeCoverage !== null ? `${Math.round(snap.calib.volumeCoverage * 100)}% / ${Math.round((snap.calib.moveCoverage ?? 0) * 100)}%` : '—'}
              sub={`volume / move · last ${snap.calib.n} sessions · target 80%`}
            />
          </div>
          {(nx.earnings || nx.nextEarnings) && (
            <div className="text-[11px] text-violet-300/90">
              {nx.earnings ? 'Earnings window: the model was told this session is on or after a report.' : `Next earnings ${nx.nextEarnings}.`}
            </div>
          )}
          {snap.options && <OptionsRow o={snap.options} />}
          <ChartTitle title="Close" note="last 60 sessions · 80% band: 1–5 Timestral-209M (green), 6–10 EWMA √h (grey, untested) · violet = options-implied range at expiry" />
          <Scroller
            width={widthFor(snap.days.length + snap.priceFan.length)}
            group={scrollers}
            axis={<YAxis ticks={priceScale(snap).ticks} y={priceScale(snap).y} fmt={fmtPx} />}
          >
            <PriceChart s={snap} />
          </Scroller>
          <ChartTitle title="Volume" note="80% band and median given before each session · amber = above q90 · violet = earnings window" />
          <Scroller
            width={widthFor(snap.days.length + 1)}
            group={scrollers}
            axis={(() => {
              const pts = snap.days.map((d) => ({ day: d.day, actual: d.volume, fc: d.volumeFc, flag: d.earnings }))
              const sc = barScale(pts, nx.volume)
              return <YAxis ticks={sc.ticks} y={sc.y} fmt={fmtVol} />
            })()}
          >
            <Chart
              pts={snap.days.map((d) => ({ day: d.day, actual: d.volume, fc: d.volumeFc, flag: d.earnings }))}
              next={nx.volume}
              nextDay={nx.day}
              label={`${snap.symbol} daily volume and forecast`}
            />
          </Scroller>
          <ChartTitle title="Move size |close-to-close|" note="no direction" />
          <Scroller
            width={widthFor(snap.days.length + 1)}
            group={scrollers}
            axis={(() => {
              const pts = snap.days.map((d) => ({ day: d.day, actual: d.move, fc: d.moveFc, flag: d.earnings }))
              const sc = barScale(pts, nx.move)
              return <YAxis ticks={sc.ticks} y={sc.y} fmt={(v) => `${v.toFixed(1)}%`} />
            })()}
          >
            <Chart
              pts={snap.days.map((d) => ({ day: d.day, actual: d.move, fc: d.moveFc, flag: d.earnings }))}
              next={nx.move}
              nextDay={nx.day}
              label={`${snap.symbol} daily |return| and forecast`}
            />
          </Scroller>
          <p className="text-[11px] leading-snug text-zinc-500">
            Top: last 60 closes with the 80% close range: sessions 1–5 from Timestral-209M on log close (beat an EWMA
            random walk at every horizon on the 2025–26 holdout, bench/EXP5_RESULTS.md), sessions 6–10 EWMA √h,
            untested. No midline is drawn: every backtest put the model's direction below always-up. Middle: shares traded; bottom: size of the close-to-close move. Bars are actuals; the blue band and line are
            the 80% range and median the model gave before that session, from the previous 1,024 sessions plus day of
            week and the earnings window (violet bars). Amber bars broke above the 90th percentile. Backtested
            (bench/EXP2–4_RESULTS.md): volume 17–22% better than a 60-day baseline on every ticker; move size roughly
            ties it, so its next-session figure adds the two small Exp 4 passes (recalibration, 25% empirical pool).
          </p>
        </div>
      )}
    </CollapsibleSection>
  )
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// The market's priced range (nearest-expiry ATM straddle) next to the model's
// band at the same horizon. Descriptive; the forward scorecard tracks which
// one is better calibrated.
function OptionsRow({ o }: { o: NonNullable<PriceForecastSnapshot['options']> }): JSX.Element {
  const d = new Date(`${o.expiry}T00:00:00Z`)
  const when = `${WEEKDAY[d.getUTCDay()]} ${Number(o.expiry.slice(5, 7))}/${Number(o.expiry.slice(8, 10))}`
  const r = o.ratio
  const verdict =
    r === null
      ? ''
      : r >= 1.15
        ? `the market prices ${r.toFixed(2)}× the model's range`
        : r <= 1 / 1.15
          ? `the market prices ${(1 / r).toFixed(2)}× less than the model's range`
          : 'market and model roughly agree'
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-violet-500/[0.06] px-3 py-2 text-[11px] ring-1 ring-inset ring-violet-400/20">
      <span className="font-semibold uppercase tracking-[0.16em] text-violet-300/90">Options vs model</span>
      <span className="text-zinc-300">
        to {when} ({o.sessions} session{o.sessions === 1 ? '' : 's'}): market ±{o.impliedHalfPct.toFixed(1)}%
        {o.modelHalfPct !== null ? `, model ±${o.modelHalfPct.toFixed(1)}%` : ''} (80%){verdict ? ` — ${verdict}` : ''}
      </span>
      <span className="text-zinc-500">
        {o.basis === 'straddle' ? 'ATM straddle' : 'ATM implied vol'}
        {o.modelSource === 'ewma' ? ' · model side is EWMA past 5 sessions' : ''} · options as of{' '}
        {new Date(o.fetchedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · not backtested; scored live
      </span>
    </div>
  )
}

function ChartTitle({ title, note }: { title: string; note: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between pt-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">{title}</span>
      <span className="text-[10px] text-zinc-600">{note}</span>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-surface-2/60 px-3 py-2 ring-1 ring-inset ring-edge/50">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-0.5 text-[18px] font-semibold tabular-nums text-zinc-100">{value}</div>
      <div className="text-[10px] text-zinc-500">{sub}</div>
    </div>
  )
}
