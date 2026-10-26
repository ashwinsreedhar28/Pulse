import { useCallback, useEffect, useState } from 'react'
import type { ForecastScorecard, ScorecardRow } from '../../preload'

const TARGET: Record<ScorecardRow['target'], string> = {
  lnV: 'Volume (log)',
  absr: 'Move size |r|',
  lnC: 'Close (log)'
}

function pct(n: number | null, digits = 1): string {
  return n === null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(digits)}%`
}

function fmtTime(ms: number | null): string {
  if (!ms) return 'never'
  return new Date(ms).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Live track record of the StockDetail forecasts: each one is logged before its
// target session opens and never revised, then scored when the daily bar lands.
export default function ForecastScorecardPanel(): JSX.Element {
  const [card, setCard] = useState<ForecastScorecard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback((run: boolean) => {
    if (run) setBusy(true)
    const p = run ? window.api.priceForecast.logNow() : window.api.priceForecast.scorecard()
    p.then((c) => {
      setCard(c)
      setError(null)
    })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  const st = card?.status
  return (
    <section className="space-y-3 px-4 pt-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="text-[13px] font-semibold text-zinc-100">Forecast scorecard (live)</h3>
        <span className="text-[11px] text-zinc-500">
          {card?.since ? `since ${card.since}` : 'no forecasts logged yet'}
          {card ? ` · ${card.tickers} tickers · ${card.scored.toLocaleString()} scored · ${card.pending.toLocaleString()} pending` : ''}
          {card?.nextPending ? ` · next scored after the ${card.nextPending} close` : ''}
        </span>
        <button
          onClick={() => load(true)}
          disabled={busy || st?.running}
          className="ml-auto rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 ring-1 ring-inset ring-zinc-700 hover:bg-surface-2 hover:text-zinc-100 disabled:opacity-50"
          title="Logs tomorrow's forecasts for every held ticker. Does nothing between 9:30 and 17:00 ET."
        >
          {busy || st?.running ? 'Logging…' : 'Log now'}
        </button>
      </header>

      <p className="text-[11px] leading-snug text-zinc-500">
        Every forecast on the stock pages is written here before its session opens (after each close, hourly) and never
        revised, then scored when the daily bar lands: CRPS from the 21 quantiles (lower is better), and how often the
        actual fell inside the 80% range (target 80%). Skill is the CRPS reduction against the named baseline on the
        same ticker-days; won/lost counts tickers. This is the out-of-sample check on bench/EXP2–5_RESULTS.md.
      </p>

      {error && <div className="text-[12px] text-red-400">Could not load the scorecard: {error}</div>}
      {st?.lastError && <div className="text-[11px] text-amber-300/80">Last logging error: {st.lastError}</div>}
      <div className="text-[10px] text-zinc-600">
        Last logging run {fmtTime(st?.lastRunAt ?? null)}
        {st?.lastRunAt ? ` · ${st.lastTickers} tickers, ${st.lastLogged} forecasts` : ''}
      </div>

      {card && card.rows.length === 0 && (
        <div className="text-[12px] text-zinc-400">
          Nothing scored yet. Forecasts logged tonight are scored after tomorrow&apos;s close.
        </div>
      )}

      {card && card.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg ring-1 ring-inset ring-edge/60">
          <table className="w-full text-[12px] tabular-nums">
            <thead className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              <tr className="border-b border-edge/60">
                <th className="px-3 py-2 text-left font-semibold">Target</th>
                <th className="px-3 py-2 text-right font-semibold">Sessions</th>
                <th className="px-3 py-2 text-left font-semibold">Method</th>
                <th className="px-3 py-2 text-right font-semibold">n</th>
                <th className="px-3 py-2 text-right font-semibold">In 80%</th>
                <th className="px-3 py-2 text-right font-semibold">CRPS</th>
                <th className="px-3 py-2 text-left font-semibold">vs</th>
                <th className="px-3 py-2 text-right font-semibold">Skill</th>
                <th className="px-3 py-2 text-right font-semibold">Tickers</th>
              </tr>
            </thead>
            <tbody>
              {card.rows.map((r, i) => {
                const first = i === 0 || card.rows[i - 1].target !== r.target || card.rows[i - 1].horizon !== r.horizon
                const good = r.skill !== null && r.skill > 0
                return (
                  <tr key={`${r.target}-${r.horizon}-${r.method}-${r.vs}`} className={first ? 'border-t border-edge/40' : ''}>
                    <td className="px-3 py-1.5 text-zinc-400">{first ? TARGET[r.target] : ''}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-500">{first ? (r.horizon === 'expiry' ? 'to expiry' : `+${r.horizon}`) : ''}</td>
                    <td className="px-3 py-1.5 text-zinc-200">{r.label}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-400">{r.n.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-300">{pct(r.coverage, 0)}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-300">{r.meanCrps !== null ? r.meanCrps.toFixed(3) : '—'}</td>
                    <td className="px-3 py-1.5 text-zinc-500">{r.vsLabel ?? 'baseline'}</td>
                    <td className={`px-3 py-1.5 text-right ${r.skill === null ? 'text-zinc-600' : good ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {r.skill === null ? '' : `${r.skill > 0 ? '+' : ''}${pct(r.skill)}`}
                    </td>
                    <td className="px-3 py-1.5 text-right text-zinc-500">{r.vs ? `${r.tickersWon}/${r.tickersLost}` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
