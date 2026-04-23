// Options snapshot card for the ticker detail page. Shows the nearest-expiry
// IV, expected move, put/call OI skew, and open-interest totals in one
// glanceable card. Follow-on pages can drill into the full chain later; this
// section is the "what is the market pricing right now" headline.

import { useEffect, useState } from 'react'

import type { OptionsSnapshot } from '../../preload'

function formatPct(ratio: number | null, digits = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

function formatMoney(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `$${value.toFixed(digits)}`
}

function formatOi(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function ratioLabel(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—'
  return ratio >= 1 ? `${ratio.toFixed(2)}× puts` : `${(1 / ratio).toFixed(2)}× calls`
}

// IV bucket descriptor. Baseline ranges are industry rough-cuts; anything over
// 60% on a large-cap before earnings reads as "elevated", over 80% as "hot".
// Small caps and biotechs routinely clear 100% so these are directional, not
// absolute.
function ivTone(iv: number | null): { color: string; label: string } {
  if (iv === null) return { color: 'text-zinc-400', label: '—' }
  const pct = iv * 100
  if (pct >= 80) return { color: 'text-red-300', label: 'hot' }
  if (pct >= 50) return { color: 'text-amber-300', label: 'elevated' }
  if (pct >= 25) return { color: 'text-zinc-200', label: 'normal' }
  return { color: 'text-emerald-300', label: 'quiet' }
}

function ratioTone(ratio: number | null): string {
  if (ratio === null) return 'text-zinc-400'
  if (ratio > 1.2) return 'text-red-300'
  if (ratio < 0.8) return 'text-emerald-300'
  return 'text-zinc-300'
}

export function OptionsSnapshotSection({ symbol }: { symbol: string }): JSX.Element | null {
  const [snap, setSnap] = useState<OptionsSnapshot | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    window.api.stocks
      .getOptionsSnapshot(symbol)
      .then((s) => {
        if (!cancelled) setSnap(s)
      })
      .catch(() => {
        if (!cancelled) setSnap(null)
      })
    return () => {
      cancelled = true
    }
  }, [symbol])

  // Tickers with no listed options (small caps, some ETFs) get no section.
  if (snap === null) return null
  if (snap === undefined) {
    return (
      <section className="mt-6 rounded-2xl border border-edge bg-surface-1 p-5">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            Options signal
          </h2>
          <span className="h-px flex-1 bg-edge/80" />
          <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">via Yahoo</span>
        </div>
        <div className="text-[12px] text-zinc-500">Loading options data…</div>
      </section>
    )
  }

  const expiryStr = new Date(snap.expiryDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
  const iv = ivTone(snap.impliedVol)

  return (
    <section className="mt-6 rounded-2xl border border-edge bg-surface-1 p-5">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          Options signal
        </h2>
        <span className="h-px flex-1 bg-edge/80" />
        <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          {expiryStr} · {snap.daysToExpiry}d
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
        <Stat
          label="Implied vol"
          value={formatPct(snap.impliedVol, 0)}
          tone={iv.color}
          sub={iv.label}
        />
        <Stat
          label="Expected move"
          value={formatMoney(snap.expectedMoveUsd)}
          sub={snap.expectedMovePct !== null ? `±${formatPct(snap.expectedMovePct, 1)}` : undefined}
          tone="text-zinc-100"
        />
        <Stat
          label="Put/call OI"
          value={ratioLabel(snap.putCallOiRatio)}
          tone={ratioTone(snap.putCallOiRatio)}
          sub={
            snap.totalCallOi !== null && snap.totalPutOi !== null
              ? `${formatOi(snap.totalCallOi)} C · ${formatOi(snap.totalPutOi)} P`
              : undefined
          }
        />
        <Stat
          label="ATM strike"
          value={snap.atmStrike !== null ? formatMoney(snap.atmStrike) : '—'}
          tone="text-zinc-100"
          sub={
            snap.underlyingPrice !== null ? `underlying ${formatMoney(snap.underlyingPrice)}` : undefined
          }
        />
      </div>
      <p className="mt-3 text-[10.5px] text-zinc-500 leading-snug">
        Expected move = ATM straddle mid price — the market&apos;s implied absolute move in{' '}
        {symbol} through {expiryStr}. IV is the mean of the ATM call + put implied volatilities.
      </p>
    </section>
  )
}

function Stat({
  label,
  value,
  sub,
  tone
}: {
  label: string
  value: string
  sub?: string
  tone: string
}): JSX.Element {
  return (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </div>
      <div className={`text-[18px] font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-zinc-500 tabular-nums mt-0.5">{sub}</div>}
    </div>
  )
}
