// FRED macro indicators strip — rates, inflation, labor, volatility.
// Sits above the morning brief on Top Stories. Compact tile per series:
// label + latest value + delta vs prior reading + sparkline.
//
// No AI dependency; data comes from the local fred_observations cache
// refreshed by fredService on a 6h schedule.

import { useEffect, useMemo, useState } from 'react'

import type { FredFormat, FredSeriesSnapshot } from '../../preload'
import { CollapseChevron, useCollapsedSection } from './collapseUI'

type Group = FredSeriesSnapshot['group']

const GROUP_ORDER: Group[] = ['rates', 'inflation', 'labor', 'volatility']
const GROUP_LABEL: Record<Group, string> = {
  rates: 'Rates',
  inflation: 'Inflation',
  labor: 'Labor',
  volatility: 'Volatility'
}

// Per-group accent dot. Each tile carries a tiny colored dot so the user
// can scan groups without needing explicit section dividers — frees the
// horizontal real estate to fit all 9 tiles in 1-2 dense rows.
const GROUP_DOT: Record<Group, string> = {
  rates: 'bg-sky-400',
  inflation: 'bg-amber-400',
  labor: 'bg-emerald-400',
  volatility: 'bg-violet-400'
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
  // 130×32 — sized for the value+sparkline two-column row inside a
  // 260px tile. Large enough to read trend at a glance.
  const real = points.filter((p) => p.value !== null) as Array<{ date: string; value: number }>
  if (real.length < 2) return null
  const width = 130
  const height = 32
  const values = real.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = width / (real.length - 1)
  const points2 = real.map((p, i) => ({
    x: i * stepX,
    y: height - ((p.value - min) / range) * height
  }))
  const path = points2
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
  // Subtle area fill under the line — gives the tile visual weight at
  // the larger size without dominating the tile's primary value text.
  const areaPath =
    `M${points2[0].x.toFixed(1)} ${height} ` +
    points2.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ` L${points2[points2.length - 1].x.toFixed(1)} ${height} Z`
  const lastTwo = values.slice(-2)
  const isUp = lastTwo[1] > lastTwo[0]
  const stroke = isUp ? 'rgba(74,222,128,0.85)' : 'rgba(248,113,113,0.85)'
  const fill = isUp ? 'rgba(74,222,128,0.10)' : 'rgba(248,113,113,0.10)'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={areaPath} fill={fill} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <circle
        cx={width}
        cy={points2[points2.length - 1].y}
        r={2}
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
      className="flex flex-col px-3.5 py-2.5 rounded-lg border border-edge/60 bg-surface-1/70 hover:bg-surface-1 transition-colors w-[260px] flex-shrink-0"
      title={
        snap.units
          ? `${snap.label} · ${snap.units}${snap.latestDate ? ` · as of ${snap.latestDate}` : ''}`
          : snap.label
      }
    >
      {/* Full-width label header. Long labels like "10Y-2Y SPREAD" and */}
      {/* "INITIAL CLAIMS" no longer compete with the sparkline for room. */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className={`shrink-0 w-1.5 h-1.5 rounded-full ${GROUP_DOT[snap.group]}`}
          aria-hidden="true"
        />
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-zinc-400 whitespace-nowrap">
          {snap.label}
        </span>
      </div>
      {/* Value + delta on the left, sparkline on the right. */}
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[20px] font-semibold tabular-nums text-zinc-100 leading-none">
            {value}
          </span>
          {delta && (
            <span className={`text-[10.5px] tabular-nums mt-1 ${tone}`}>{delta}</span>
          )}
        </div>
        <div className="shrink-0 self-end">
          <Sparkline points={snap.series} />
        </div>
      </div>
    </div>
  )
}

export function MacroPanel(): JSX.Element | null {
  const [snapshot, setSnapshot] = useState<FredSeriesSnapshot[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useCollapsedSection('macroPanel', false)

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

  // Order tiles by group so the colored dots cluster naturally even though
  // there's no explicit section divider — left-to-right reads as a small
  // legend matching the group order. Hook MUST be unconditional (rules
  // of hooks); early returns below this line for cold/loading states.
  const orderedTiles = useMemo(() => {
    if (!snapshot) return []
    const out: FredSeriesSnapshot[] = []
    for (const g of GROUP_ORDER) {
      for (const s of snapshot) if (s.group === g) out.push(s)
    }
    return out
  }, [snapshot])

  // Loading state — initial fetch hasn't resolved yet.
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
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300">
            σ Macro Panel
          </span>
          <span className="text-[10px] text-zinc-600">·</span>
          <span className="text-[10px] text-zinc-500">via FRED</span>
          {/* Inline color legend so users learn the dot scheme without */}
          {/* needing explicit section dividers in the body. */}
          <span className="text-[10px] text-zinc-600">·</span>
          <div className="flex items-center gap-2.5">
            {GROUP_ORDER.map((g) => (
              <div key={g} className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${GROUP_DOT[g]}`}
                  aria-hidden="true"
                />
                <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                  {GROUP_LABEL[g]}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
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
            title={collapsed ? 'Expand panel' : 'Collapse panel'}
            aria-expanded={!collapsed}
            className="flex items-center text-zinc-500 hover:text-zinc-300 px-1.5 py-1"
          >
            <CollapseChevron open={!collapsed} />
          </button>
        </div>
      </header>
      {!collapsed && (
        <div className="px-4 pb-3 pt-1 flex flex-wrap gap-2">
          {orderedTiles.map((s) => (
            <Tile key={s.id} snap={s} />
          ))}
        </div>
      )}
    </div>
  )
}
