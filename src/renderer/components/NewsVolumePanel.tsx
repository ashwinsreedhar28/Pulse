import { useCallback, useEffect, useState } from 'react'
import type { NewsVolumeBoard, NewsVolumeBoardRow } from '../../preload'

interface Props {
  onSelectSymbol: (symbol: string) => void
}

// Survives unmount, same reason as MarketAnalytics' lastStats: switching
// Stocks tabs shouldn't blank the panel while the board reloads.
let lastBoard: NewsVolumeBoard | null = null

const COLLAPSED_ROWS = 12

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 100) return Math.round(n).toLocaleString()
  if (n >= 10) return n.toFixed(0)
  return n.toFixed(1)
}

function Spark({ values }: { values: Array<number | null> }): JSX.Element {
  const w = 96
  const h = 22
  const max = Math.max(1, ...values.filter((v): v is number => v !== null))
  const step = w / Math.max(1, values.length - 1)
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null) {
      pen = false // GDELT outage day: break the line rather than draw a zero
      return
    }
    const x = i * step
    const y = h - 1 - (v / max) * (h - 2)
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `
    pen = true
  })
  return (
    <svg width={w} height={h} className="text-zinc-500" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  )
}

// Yesterday's actual against the 10-90% band and median of the forecast made
// the day before.
function RangeBar({ y }: { y: NonNullable<NewsVolumeBoardRow['yesterday']> }): JSX.Element {
  const w = 140
  const h = 14
  const max = Math.max(1, y.q90 * 1.25, y.actual * 1.05)
  const x = (v: number): number => Math.min(w - 2, Math.max(2, (v / max) * w))
  return (
    <svg width={w} height={h} aria-hidden>
      <line x1={0} x2={w} y1={h / 2} y2={h / 2} className="stroke-zinc-800" strokeWidth={1} />
      <rect x={x(y.q10)} y={3} width={Math.max(2, x(y.q90) - x(y.q10))} height={h - 6} rx={2} className="fill-zinc-600/50" />
      <line x1={x(y.q50)} x2={x(y.q50)} y1={2} y2={h - 2} className="stroke-zinc-300" strokeWidth={1.5} />
      <circle cx={x(y.actual)} cy={h / 2} r={3.5} className={y.surge ? 'fill-amber-400' : 'fill-emerald-400'} />
    </svg>
  )
}

export default function NewsVolumePanel({ onSelectSymbol }: Props): JSX.Element {
  const [board, setBoard] = useState<NewsVolumeBoard | null>(lastBoard)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback((refresh: boolean) => {
    if (refresh) setBusy(true)
    const p = refresh ? window.api.newsVolume.refresh() : window.api.newsVolume.board()
    p.then((b) => {
      lastBoard = b
      setBoard(b)
      setError(null)
    })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  const st = board?.status
  const rows = board?.rows ?? []
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS)
  const todayDay = rows.find((r) => r.today)?.today?.day

  return (
    <section className="space-y-3 px-4 pt-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="text-[13px] font-semibold text-zinc-100">News volume forecast</h3>
        <span className="text-[11px] text-zinc-500">
          Timestral-{board?.model ?? '28M'} · GDELT org tags, all languages
          {board?.asOf ? ` · data through ${board.asOf} UTC` : ''}
          {board && board.asOf ? ` · ${board.surges} surge${board.surges === 1 ? '' : 's'} yesterday` : ''}
        </span>
        <button
          onClick={() => load(true)}
          disabled={busy || st?.running}
          className="ml-auto rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 ring-1 ring-inset ring-zinc-700 hover:bg-surface-2 hover:text-zinc-100 disabled:opacity-50"
        >
          {busy || st?.running ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <p className="text-[11px] leading-snug text-zinc-500">
        Each row scores yesterday&apos;s article count (UTC day) against the forecast made the day before: grey band
        = 10–90% range, white tick = median, dot = actual. <span className="text-amber-300/90">Surge</span> = at or
        above the 90th percentile; a calibrated forecast puts about 1 day in 10 there by chance. In the backtest this
        model&apos;s error was 10% below a 28-day empirical baseline (69 of 75 tickers).
      </p>

      {error && <div className="text-[12px] text-red-400">Could not load news volume: {error}</div>}
      {st?.disabled && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-200/80">
          Forecasting is off: {st.disabled}
        </div>
      )}
      {st?.lastError && !st.disabled && (
        <div className="text-[11px] text-amber-300/80">Last refresh failed: {st.lastError}</div>
      )}
      {board && !board.asOf && !st?.disabled && (
        <div className="text-[12px] text-zinc-400">
          No news-volume data yet. The first BigQuery pull runs 3 minutes after launch, or press Refresh.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg ring-1 ring-inset ring-edge/60">
          <table className="w-full text-[12px] tabular-nums">
            <thead className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              <tr className="border-b border-edge/60">
                <th className="px-3 py-2 text-left font-semibold">Ticker</th>
                <th className="px-3 py-2 text-right font-semibold">Yesterday</th>
                <th className="px-3 py-2 text-left font-semibold">vs forecast</th>
                <th className="px-3 py-2 text-right font-semibold">Pctile</th>
                <th className="px-3 py-2 text-right font-semibold">
                  {todayDay ? `Forecast ${todayDay.slice(5)}` : 'Today'}
                </th>
                <th className="px-3 py-2 text-right font-semibold">28d avg</th>
                <th className="px-3 py-2 text-left font-semibold">30 days</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.symbol} className="border-b border-edge/30 last:border-0 hover:bg-surface-1">
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => onSelectSymbol(r.symbol)}
                      className="font-semibold text-zinc-100 hover:text-emerald-300"
                    >
                      {r.symbol}
                    </button>
                    {r.yesterday?.surge && (
                      <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-500/30">
                        Surge
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-200">{r.yesterday ? fmt(r.yesterday.actual) : '—'}</td>
                  <td className="px-3 py-1.5">
                    {r.yesterday ? (
                      <div className="flex items-center gap-2">
                        <RangeBar y={r.yesterday} />
                        <span className="text-[11px] text-zinc-500">
                          {fmt(r.yesterday.q10)}–{fmt(r.yesterday.q90)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-zinc-600">no forecast yet</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-400">
                    {r.yesterday ? `${Math.round(r.yesterday.pct * 100)}` : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-200">
                    {r.today ? (
                      <>
                        {fmt(r.today.q50)}{' '}
                        <span className="text-[11px] text-zinc-500">
                          ({fmt(r.today.q10)}–{fmt(r.today.q90)})
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-600">after 02:00 UTC</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-400">{r.mean28 !== null ? fmt(r.mean28) : '—'}</td>
                  <td className="px-3 py-1.5">
                    <Spark values={r.recent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > COLLAPSED_ROWS && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-100"
        >
          {expanded ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
      {st && st.missingPatterns.length > 0 && (
        <div className="text-[11px] text-zinc-500">
          No GDELT pattern yet for {st.missingPatterns.join(', ')} (src/data/gdeltOrgPatterns.json).
        </div>
      )}
    </section>
  )
}
