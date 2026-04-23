// Beat/miss "track record" strip for a ticker — four dots reading
// oldest → newest of the reported quarters Yahoo returns via earningsHistory,
// plus the most recent surprise % when available. Colors match the
// semantic palette used elsewhere in the value chain: emerald for a beat,
// red for a miss, zinc for in-line (≤1% deviation).
//
// Two variants share the same geometry so a tile-level signal visually rhymes
// with the focus-panel strip. `tile` is five pixels tall, no label; `strip`
// adds the "EPS 4Q" label and the most-recent surprise %.

import type { EarningsHistoryQuarter } from '../../preload'
import { formatEpsDelta } from './financialsFormat'

const IN_LINE_THRESHOLD = 0.01 // ±1% is "in line"

type BeatState = 'beat' | 'miss' | 'inline' | 'unknown'

function classify(q: EarningsHistoryQuarter): BeatState {
  if (q.surprisePct !== null && Number.isFinite(q.surprisePct)) {
    if (Math.abs(q.surprisePct) <= IN_LINE_THRESHOLD) return 'inline'
    return q.surprisePct > 0 ? 'beat' : 'miss'
  }
  // Fall back to raw EPS delta when Yahoo didn't precompute surprise.
  if (
    q.epsActual !== null &&
    q.epsEstimate !== null &&
    Number.isFinite(q.epsActual) &&
    Number.isFinite(q.epsEstimate)
  ) {
    const diff = q.epsActual - q.epsEstimate
    const ref = Math.abs(q.epsEstimate)
    if (ref === 0) return diff === 0 ? 'inline' : diff > 0 ? 'beat' : 'miss'
    const ratio = diff / ref
    if (Math.abs(ratio) <= IN_LINE_THRESHOLD) return 'inline'
    return ratio > 0 ? 'beat' : 'miss'
  }
  return 'unknown'
}

const DOT_CLASS: Record<BeatState, string> = {
  beat: 'bg-emerald-400',
  miss: 'bg-red-400',
  inline: 'bg-zinc-400',
  unknown: 'bg-zinc-700'
}

export function EarningsBeatMiss({
  history,
  variant = 'strip'
}: {
  history: EarningsHistoryQuarter[] | undefined
  variant?: 'tile' | 'strip'
}): JSX.Element | null {
  if (!history || history.length === 0) return null
  // Oldest → newest read feels natural (left-to-right timeline), and matches
  // how the FCF sparkline lays out.
  const ordered = [...history].reverse()
  const mostRecent = history[0]
  const recentDelta = formatEpsDelta(
    mostRecent?.epsActual ?? null,
    mostRecent?.epsEstimate ?? null
  )
  const dotSize = variant === 'tile' ? 'h-1.5 w-1.5' : 'h-2 w-2'

  if (variant === 'tile') {
    return (
      <div
        className="flex items-center gap-0.5"
        title="Earnings beats (emerald) vs misses (red), oldest → newest"
      >
        {ordered.map((q) => (
          <span
            key={q.quarter}
            className={`${dotSize} rounded-full ${DOT_CLASS[classify(q)]}`}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5" title="EPS beat/miss, oldest → newest">
      <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">EPS Δ 4Q</span>
      <div className="flex items-center gap-1">
        {ordered.map((q) => (
          <span
            key={q.quarter}
            className={`${dotSize} rounded-full ${DOT_CLASS[classify(q)]}`}
          />
        ))}
      </div>
      {recentDelta && (
        <span
          className={`text-[10px] font-semibold tabular-nums ${
            classify(mostRecent!) === 'beat'
              ? 'text-emerald-300'
              : classify(mostRecent!) === 'miss'
                ? 'text-red-300'
                : 'text-zinc-400'
          }`}
          title={`Last EPS: ${mostRecent?.epsActual?.toFixed(2) ?? '—'} vs est ${mostRecent?.epsEstimate?.toFixed(2) ?? '—'}`}
        >
          {recentDelta}
        </span>
      )}
    </div>
  )
}
