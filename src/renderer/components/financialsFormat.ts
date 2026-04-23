// Formatting helpers for the cashflow overlay on the value-chain view.
// Kept in its own module because both the tile and the focus panel need the
// same visual language — a single tweak here (e.g. "B" vs "Bn") updates
// everywhere the overlay is shown.

// Compact money formatting in the style traders are used to: "$1.2T",
// "$452B", "$12.4B", "$890M". Negative values get a leading "-$". Null
// returns null so callers can branch on "do we even show this cell".
export function formatMoneyCompact(value: number | null, currency = '$'): string | null {
  if (value === null || !Number.isFinite(value)) return null
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}${currency}${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}${currency}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${currency}${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}${currency}${(abs / 1e3).toFixed(0)}K`
  return `${sign}${currency}${abs.toFixed(0)}`
}

// Margin or any ratio 0..1 rendered as a signed integer percent. 0.2438 -> "24%"
// Negative allowed for FCF margin drawdowns.
export function formatPctValue(ratio: number | null, decimals = 0): string | null {
  if (ratio === null || !Number.isFinite(ratio)) return null
  return `${(ratio * 100).toFixed(decimals)}%`
}

// QoQ / YoY deltas rendered with explicit +/-. Used next to "Rev QoQ".
export function formatPctDelta(ratio: number | null, decimals = 1): string | null {
  if (ratio === null || !Number.isFinite(ratio)) return null
  const pct = ratio * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(decimals)}%`
}

// EPS actual-minus-estimate rendered as a dollar delta ("+$0.02", "-$0.15").
// We deliberately show dollars rather than surprise % because thin-EPS names
// (e.g. Intel at $0.02 baseline) turn a $0.016 beat into +81.5%, which visually
// equates it to massive surprises. Dollars read as what traders actually say
// ("beat by two cents") and don't distort across companies with different EPS
// magnitudes.
export function formatEpsDelta(
  actual: number | null,
  estimate: number | null
): string | null {
  if (actual === null || estimate === null) return null
  if (!Number.isFinite(actual) || !Number.isFinite(estimate)) return null
  const delta = actual - estimate
  const sign = delta >= 0 ? '+' : '-'
  return `${sign}$${Math.abs(delta).toFixed(2)}`
}

// FCF margin tone buckets, picked so the eye can scan a value-chain sector
// and instantly see which companies convert revenue to cash:
//   > 25% emerald-300 (elite — software, platforms)
//   > 10% emerald-500/80 (healthy)
//   > 0%  amber-400 (thin but positive)
//   <= 0% red-400 (cash-burning)
//   null  zinc-500 (missing data — e.g. private graph node)
export function fcfMarginTone(margin: number | null): {
  color: string
  dot: string
  label: string
} {
  if (margin === null) return { color: 'text-zinc-500', dot: 'bg-zinc-600', label: '—' }
  if (margin >= 0.25) return { color: 'text-emerald-300', dot: 'bg-emerald-300', label: 'elite' }
  if (margin >= 0.1) return { color: 'text-emerald-400', dot: 'bg-emerald-400', label: 'healthy' }
  if (margin > 0) return { color: 'text-amber-400', dot: 'bg-amber-400', label: 'thin' }
  return { color: 'text-red-400', dot: 'bg-red-400', label: 'burn' }
}
