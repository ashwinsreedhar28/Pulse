import { useEffect, useState } from 'react'
import type { NewsVolumeSnapshot } from '../../preload'
import { CollapsibleSection } from './CollapsibleSection'

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (n >= 100) return Math.round(n).toLocaleString()
  if (n >= 10) return n.toFixed(0)
  return n.toFixed(1)
}

const W = 640
const H = 170
const PAD_L = 34
const PAD_B = 18
const PAD_T = 8

// Bars: daily article counts (UTC days). Grey band + white line: the
// one-day-ahead 10-90% range and median the model gave the day before (last
// 60 days). Amber dots: surges (actual >= 90th percentile). Dashed fan on the
// right: the 7-day outlook, which was never backtested beyond day 1.
function Chart({ s }: { s: NewsVolumeSnapshot }): JSX.Element {
  const n = s.days.length + s.outlook.length
  const vals = [
    ...s.days.flatMap((d) => [d.count ?? 0, d.q90 ?? 0]),
    ...s.outlook.map((o) => o.q90)
  ]
  const max = Math.max(1, ...vals) * 1.08
  const plotW = W - PAD_L - 4
  const plotH = H - PAD_B - PAD_T
  const xw = plotW / n
  const x = (i: number): number => PAD_L + i * xw + xw / 2
  const y = (v: number): number => PAD_T + plotH - (v / max) * plotH
  const band = (pts: Array<{ i: number; lo: number; hi: number }>): string =>
    pts.length
      ? `M${pts.map((p) => `${x(p.i).toFixed(1)},${y(p.hi).toFixed(1)}`).join(' L')} L${[...pts]
          .reverse()
          .map((p) => `${x(p.i).toFixed(1)},${y(p.lo).toFixed(1)}`)
          .join(' L')} Z`
      : ''
  const bt = s.days.flatMap((d, i) => (d.q10 !== null && d.q90 !== null ? [{ i, lo: d.q10, hi: d.q90 }] : []))
  const med = s.days.flatMap((d, i) => (d.q50 !== null ? [`${x(i).toFixed(1)},${y(d.q50).toFixed(1)}`] : []))
  const off = s.days.length
  const fan = s.outlook.map((o, k) => ({ i: off + k, lo: o.q10, hi: o.q90 }))
  const ticks = [0, max / 2, max].map((v) => Math.round(v))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${s.symbol} daily news volume and forecast`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD_L} x2={W - 4} y1={y(v)} y2={y(v)} className="stroke-zinc-800" strokeWidth={1} />
          <text x={PAD_L - 4} y={y(v) + 3} textAnchor="end" className="fill-zinc-600 text-[9px]">
            {v.toLocaleString()}
          </text>
        </g>
      ))}
      {s.days.map((d, i) =>
        d.count === null ? null : (
          <rect
            key={d.day}
            x={x(i) - xw * 0.35}
            y={y(d.count)}
            width={xw * 0.7}
            height={Math.max(0.5, y(0) - y(d.count))}
            className={d.surge ? 'fill-amber-400/80' : 'fill-zinc-500/60'}
          />
        )
      )}
      <path d={band(bt)} className="fill-sky-400/15" />
      {med.length > 1 && <path d={`M${med.join(' L')}`} fill="none" className="stroke-sky-300/80" strokeWidth={1.2} />}
      <path d={band(fan)} className="fill-sky-400/10 stroke-sky-300/50" strokeDasharray="3 3" strokeWidth={1} />
      {s.outlook.map((o, k) => (
        <circle key={o.day} cx={x(off + k)} cy={y(o.q50)} r={1.8} className="fill-sky-300" />
      ))}
      <line x1={x(off) - xw / 2} x2={x(off) - xw / 2} y1={PAD_T} y2={H - PAD_B} className="stroke-zinc-600" strokeDasharray="2 3" />
      <text x={PAD_L} y={H - 4} className="fill-zinc-600 text-[9px]">{s.days[0]?.day}</text>
      <text x={x(off) - xw / 2 - 4} y={H - 4} textAnchor="end" className="fill-zinc-600 text-[9px]">{s.asOf}</text>
      <text x={W - 4} y={H - 4} textAnchor="end" className="fill-zinc-600 text-[9px]">+7d</text>
    </svg>
  )
}

export function NewsForecastSection({ symbol }: { symbol: string }): JSX.Element {
  const [snap, setSnap] = useState<NewsVolumeSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setSnap(null)
    setError(null)
    window.api.newsVolume
      .snapshot(symbol)
      .then((s) => live && setSnap(s))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      live = false
    }
  }, [symbol])

  return (
    <CollapsibleSection
      title="News volume forecast"
      meta={<span>Timestral-{snap?.model ?? '28M'} · GDELT · UTC days</span>}
      defaultOpen
    >
      {error && <div className="text-[12px] text-red-400">Could not load: {error}</div>}
      {!snap && !error && (
        <div className="py-8 text-center text-[11px] uppercase tracking-[0.22em] text-zinc-600">
          Forecasting… (first open backfills 60 days, a few seconds)
        </div>
      )}
      {snap && !snap.available && <div className="text-[12px] text-zinc-400">{snap.reason}</div>}
      {snap && snap.available && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label={snap.today ? `Forecast ${snap.today.day.slice(5)}` : 'Forecast'}
              value={snap.today ? fmt(snap.today.q50) : '—'}
              sub={snap.today ? `80% range ${fmt(snap.today.q10)}–${fmt(snap.today.q90)}` : ''}
            />
            <Stat
              label={`Actual ${snap.asOf?.slice(5) ?? ''}`}
              value={fmt(snap.days[snap.days.length - 1]?.count)}
              sub={`28-day avg ${fmt(snap.mean28)}`}
            />
            <Stat
              label="Inside 80% range"
              value={snap.calib.coverage !== null ? `${Math.round(snap.calib.coverage * 100)}%` : '—'}
              sub={`last ${snap.calib.n} days · target 80%`}
            />
            <Stat
              label="Surges"
              value={String(snap.calib.surges.length)}
              sub={`of ${snap.calib.n} days · ~${Math.round(snap.calib.n / 10)} expected by chance`}
            />
          </div>
          <Chart s={snap} />
          <p className="text-[11px] leading-snug text-zinc-500">
            Bars are daily article counts from GDELT. The blue band and line are the 80% range and median the model gave
            the day before, using only data through that day; amber bars broke above it (surge). The dashed fan is a
            7-day outlook: day 1 is the backtested one-day-ahead forecast, days 2–7 were not backtested.
          </p>
          {snap.calib.surges.length > 0 && (
            <div className="text-[11px] text-zinc-400">
              <span className="font-semibold text-amber-300/90">Surge days: </span>
              {snap.calib.surges
                .slice(-8)
                .reverse()
                .map((x) => `${x.day.slice(5)} (${fmt(x.count)} vs ${fmt(x.q90)})`)
                .join(' · ')}
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
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
