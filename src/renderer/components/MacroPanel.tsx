// FRED macro indicators strip — rates, inflation, labor, volatility.
// Sits above the morning brief on Top Stories. Compact tile per series:
// label + latest value + delta vs prior reading + sparkline.
//
// No AI dependency; data comes from the local fred_observations cache
// refreshed by fredService on a 6h schedule.

import { useEffect, useMemo, useState } from 'react'

import type { FredFormat, FredSeriesSnapshot } from '../../preload'

type Group = FredSeriesSnapshot['group']

const GROUP_ORDER: Group[] = ['rates', 'inflation', 'labor', 'volatility']
const GROUP_LABEL: Record<Group, string> = {
  rates: 'Rates',
  inflation: 'Inflation',
  labor: 'Labor',
  volatility: 'Volatility'
}

function formatLatest(value: number | null, format: FredFormat): string {
  if (value === null || !Number.isFinite(value)) return '—'
  switch (format) {
    case 'percent':
      return `${value.toFixed(2)}%`
    case 'percent-change-yoy':
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
    case 'index':
      return value.toFixed(2)
    case 'count-thousands':
      return `${(value / 1000).toFixed(0)}K`
  }
}

function formatDelta(delta: number | null, format: FredFormat): string {
  if (delta === null || !Number.isFinite(delta)) return ''
  const sign = delta >= 0 ? '+' : ''
  switch (format) {
    case 'percent':
    case 'percent-change-yoy':
      // Both formats render the underlying number in percentage points; the
      // delta of a percent series is a "percentage-point" change. Keep two
      // decimals for the sub-100bps moves that matter (DGS10 0.05 days).
      return `${sign}${delta.toFixed(2)}pp`
    case 'index':
      return `${sign}${delta.toFixed(2)}`
    case 'count-thousands':
      return `${sign}${(delta / 1000).toFixed(1)}K`
  }
}

// Compute the tone class for the delta number based on the preferred
// direction of the indicator. For series where falling is "good"
// (unemployment, claims, inflation, VIX), a negative delta is emerald.
// For neutral (rates), we just show the magnitude in zinc — the user can
// interpret whether that's good or bad in context.
function deltaTone(
  delta: number | null,
  preferredDirection: FredSeriesSnapshot['preferredDirection']
): string {
  if (delta === null || delta === 0) return 'text-zinc-500'
  if (preferredDirection === 'either') return 'text-zinc-400'
  const isGood =
    (preferredDirection === 'lower' && delta < 0) ||
    (preferredDirection === 'higher' && delta > 0)
  return isGood ? 'text-emerald-400' : 'text-red-400'
}

function Sparkline({ points }: { points: Array<{ date: string; value: number | null }> }): JSX.Element | null {
  // Render a 60×16 svg so the tile stays compact. Skip if we don't have
  // at least 2 real points — a single dot doesn't communicate a trend.
  const real = points.filter((p) => p.value !== null) as Array<{ date: string; value: number }>
  if (real.length < 2) return null
  const width = 60
  const height = 16
  const values = real.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = width / (real.length - 1)
  const path = real
    .map((p, i) => {
      const x = i * stepX
      const y = height - ((p.value - min) / range) * height
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  // Colored end-cap to telegraph the latest direction.
  const lastTwo = values.slice(-2)
  const isUp = lastTwo[1] > lastTwo[0]
  const stroke = 'rgba(161,161,170,0.7)'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.2} strokeLinejoin="round" />
      <circle
        cx={width}
        cy={height - ((values[values.length - 1] - min) / range) * height}
        r={1.5}
        fill={isUp ? 'rgb(74,222,128)' : 'rgb(248,113,113)'}
      />
    </svg>
  )
}

function Tile({ snap }: { snap: FredSeriesSnapshot }): JSX.Element {
  const value = formatLatest(snap.latestValue, snap.format)
  const delta = formatDelta(snap.delta, snap.format)
  const tone = deltaTone(snap.delta, snap.preferredDirection)
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-edge/60 bg-surface-1/60 min-w-[180px]"
      title={
        snap.units
          ? `${snap.label} · ${snap.units}${snap.latestDate ? ` · as of ${snap.latestDate}` : ''}`
          : snap.label
      }
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 truncate">
          {snap.label}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[14px] font-semibold tabular-nums text-zinc-100">{value}</span>
          {delta && (
            <span className={`text-[10px] tabular-nums ${tone}`}>{delta}</span>
          )}
        </div>
      </div>
      <Sparkline points={snap.series} />
    </div>
  )
}

export function MacroPanel(): JSX.Element | null {
  const [snapshot, setSnapshot] = useState<FredSeriesSnapshot[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.api.fred
      .getSnapshot()
      .then((s) => {
        if (!cancelled) setSnapshot(s)
      })
      .catch(() => {
        if (!cancelled) setSnapshot([])
      })
    const unsub = window.api.fred.onUpdated(() => {
      void window.api.fred
        .getSnapshot()
        .then((s) => {
          if (!cancelled) setSnapshot(s)
        })
        .catch(() => {
          /* keep prior */
        })
    })
    return (): void => {
      cancelled = true
      unsub()
    }
  }, [])

  const grouped = useMemo(() => {
    if (!snapshot) return null
    const map = new Map<Group, FredSeriesSnapshot[]>()
    for (const g of GROUP_ORDER) map.set(g, [])
    for (const s of snapshot) {
      const bucket = map.get(s.group)
      if (bucket) bucket.push(s)
    }
    return map
  }, [snapshot])

  if (!snapshot) return null

  // Cold state: snapshot resolved, but every series has no data. Most
  // likely cause is a missing FRED API key. Render a minimal hint so the
  // user knows what to do without taking up morning real estate.
  const hasAnyData = snapshot.some((s) => s.latestValue !== null)
  if (!hasAnyData) {
    return (
      <div className="mx-6 mt-3 rounded-xl border border-edge/60 bg-surface-1/60 px-4 py-3 text-[12px] text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="text-amber-400">σ</span>
          <span className="font-semibold uppercase tracking-[0.22em] text-[10px]">
            Macro Panel
          </span>
          <span className="text-zinc-600">·</span>
          <span>
            Add a free FRED API key in Settings to enable rates, inflation, and labor indicators.
          </span>
        </div>
      </div>
    )
  }

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await window.api.fred.refresh()
      // The fred:updated broadcast lands when the refresh completes.
      // Belt-and-suspenders timeout in case the call quietly skipped.
      setTimeout(() => setRefreshing(false), 30_000)
    } catch {
      setRefreshing(false)
    }
  }

  return (
    <div className="mx-6 mt-3 mb-2 rounded-xl border border-edge/60 bg-surface-1/40">
      <header className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300">
            σ Macro Panel
          </span>
          <span className="text-[10px] text-zinc-600">·</span>
          <span className="text-[10px] text-zinc-500">via FRED</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh now (auto-refreshes every 6h)"
            className={`text-[9.5px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full ring-1 ring-inset ${
              refreshing
                ? 'bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait'
                : 'bg-zinc-800/70 text-zinc-300 ring-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5"
          >
            {collapsed ? '▾' : '▴'}
          </button>
        </div>
      </header>
      {!collapsed && grouped && (
        <div className="px-4 pb-3 pt-1 space-y-3">
          {GROUP_ORDER.map((g) => {
            const items = grouped.get(g) ?? []
            if (items.length === 0) return null
            return (
              <div key={g}>
                <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500 mb-1.5">
                  {GROUP_LABEL[g]}
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((s) => (
                    <Tile key={s.id} snap={s} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
