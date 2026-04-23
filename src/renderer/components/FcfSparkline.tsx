// Micro bar-chart rendering the last N quarters of free cash flow for a
// ticker, oldest on the left. Positive quarters are emerald, negative are
// red — so cash-burning periods jump out at a glance without a legend.
//
// Two sizes: tile (fits in the value-chain grid's bottom row) and strip
// (fits in the focus-panel header). Both share the same SVG geometry so
// the eye can cross-reference tile-to-focus without a re-layout flicker.

import type { FinancialsSnapshot } from '../../preload'

interface Variant {
  width: number
  height: number
  gap: number
}

const VARIANTS: Record<'tile' | 'strip', Variant> = {
  tile: { width: 60, height: 14, gap: 1 },
  strip: { width: 140, height: 22, gap: 1.5 }
}

export function FcfSparkline({
  financials,
  variant = 'tile'
}: {
  financials: FinancialsSnapshot | undefined
  variant?: 'tile' | 'strip'
}): JSX.Element | null {
  if (!financials || financials.quarters.length === 0) return null
  // Oldest → newest. Snapshot stores most-recent first to match TTM math.
  const quarters = [...financials.quarters].reverse()
  // Drop leading quarters that have no FCF (Yahoo sometimes returns a
  // cashflow row with null OCF+capex for older periods). A ragged-left
  // sparkline is confusing — we'd rather render fewer bars than empty ones.
  const firstValid = quarters.findIndex((q) => q.freeCashFlow !== null)
  if (firstValid === -1) return null
  const bars = quarters.slice(firstValid)
  if (bars.length === 0) return null

  const { width, height, gap } = VARIANTS[variant]
  const barWidth = Math.max(1, (width - gap * (bars.length - 1)) / bars.length)
  const maxAbs = bars.reduce((acc, q) => {
    if (q.freeCashFlow === null) return acc
    return Math.max(acc, Math.abs(q.freeCashFlow))
  }, 0)
  if (maxAbs === 0) return null
  // Baseline sits at vertical center so positive bars grow up and negative
  // bars grow down from it — a single read tells you "mostly positive with
  // one bad quarter" vs "persistently burning cash."
  const baseline = height / 2
  const usableHeight = height / 2

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="shrink-0"
    >
      {bars.map((q, i) => {
        const x = i * (barWidth + gap)
        if (q.freeCashFlow === null) {
          // Null quarter: thin zinc tick at baseline so gaps in history are
          // visible but don't scream.
          return (
            <rect
              key={i}
              x={x}
              y={baseline - 0.5}
              width={barWidth}
              height={1}
              fill="rgb(82 82 91)"
              opacity={0.5}
            />
          )
        }
        const ratio = q.freeCashFlow / maxAbs
        const barHeight = Math.max(1, Math.abs(ratio) * usableHeight)
        const y = q.freeCashFlow >= 0 ? baseline - barHeight : baseline
        const fill = q.freeCashFlow >= 0 ? 'rgb(52 211 153)' : 'rgb(248 113 113)'
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill={fill}
            opacity={variant === 'tile' ? 0.85 : 0.95}
          />
        )
      })}
    </svg>
  )
}
