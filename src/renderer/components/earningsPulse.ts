// Pulse-phase logic for the value-chain earnings overlay. Splits the
// "countdown to earnings" timeline into buckets the renderer binds to CSS
// classes — static ring outside 7 days, pulsing glow inside. Kept separate
// from the layout code so the heuristics can evolve without touching the
// tile component.
//
// Phase rationale:
//   > 14 days   none     nothing to say yet
//   8–14 days   ambient  static amber outline — "it's on the calendar"
//   3–7 days    warning  2.5s pulse — "next week's print"
//   0–2 days    imminent 1.5s pulse — "any hour now"
//   past window reported soft fade-in halo for a few days after a printed
//               result (based on most recent periodEnd + a reporting
//               lead time of 14–45 days after quarter end)

import type { EarningsBadge } from '../../preload'

export type PulsePhase = 'none' | 'ambient' | 'warning' | 'imminent' | 'reported'

const DAY_MS = 86_400_000

// Companies almost always report within ~14–45 days after quarter end. If the
// most-recent periodEnd we have on file is inside that window AND we have no
// future earnings date (or the future date is > 45d out), treat it as
// "recently reported" — the afterglow. Outside that window, no echo.
const REPORT_ECHO_WINDOW = { minDaysAfterEnd: 14, maxDaysAfterEnd: 45 }

export function pulsePhase(badge: EarningsBadge | undefined, now = Date.now()): PulsePhase {
  if (!badge) return 'none'
  if (typeof badge.nextDate === 'number' && Number.isFinite(badge.nextDate)) {
    const deltaDays = (badge.nextDate - now) / DAY_MS
    if (deltaDays < 0) {
      // nextDate is in the past — Yahoo hasn't rolled forward to next quarter
      // yet. Treat as imminent for a 24h grace window, then drop off.
      return deltaDays > -1 ? 'imminent' : 'none'
    }
    if (deltaDays <= 2) return 'imminent'
    if (deltaDays <= 7) return 'warning'
    if (deltaDays <= 14) return 'ambient'
  }
  if (typeof badge.lastReportEnd === 'number' && Number.isFinite(badge.lastReportEnd)) {
    const daysAfterEnd = (now - badge.lastReportEnd) / DAY_MS
    if (
      daysAfterEnd >= REPORT_ECHO_WINDOW.minDaysAfterEnd &&
      daysAfterEnd <= REPORT_ECHO_WINDOW.maxDaysAfterEnd
    ) {
      return 'reported'
    }
  }
  return 'none'
}

// Maps each phase to the tile-outer class used by the ValueChain grid. Null
// returns "no ring, no pulse" and lets the tile fall through to its default
// styling. Classes are defined in styles.css so both the selector and the
// animation can be tuned in one place.
export function pulseClass(phase: PulsePhase): string | null {
  switch (phase) {
    case 'ambient':
      return 'earnings-pulse-ambient'
    case 'warning':
      return 'earnings-pulse-warning'
    case 'imminent':
      return 'earnings-pulse-imminent'
    case 'reported':
      return 'earnings-pulse-reported'
    default:
      return null
  }
}

// Human-readable countdown for the focus panel. Returns null when there's
// nothing to say (no badge, no upcoming date, no recent report). Examples:
//   "Reports in 3 days (est)"   upcoming, Yahoo flagged as estimate
//   "Reports tomorrow"          upcoming, <= 1 day away
//   "Reports today"             upcoming, < 6 hours away (rough)
//   "Reported ~3 wks ago"       post-earnings echo
export function countdownLabel(
  badge: EarningsBadge | undefined,
  now = Date.now()
): string | null {
  if (!badge) return null
  if (typeof badge.nextDate === 'number' && Number.isFinite(badge.nextDate)) {
    const deltaMs = badge.nextDate - now
    const deltaHours = deltaMs / 3_600_000
    const deltaDays = deltaMs / DAY_MS
    const estSuffix = badge.isEstimate ? ' (est)' : ''
    if (deltaHours < -24) {
      // fall through to reported branch
    } else if (deltaHours < 0) {
      return `Reports today${estSuffix}`
    } else if (deltaHours < 6) {
      return `Reports today${estSuffix}`
    } else if (deltaDays < 1.5) {
      return `Reports tomorrow${estSuffix}`
    } else if (deltaDays <= 14) {
      return `Reports in ${Math.round(deltaDays)} days${estSuffix}`
    }
    // > 14 days — too far to feel urgent, but we still show it.
    return `Reports in ${Math.round(deltaDays)} days${estSuffix}`
  }
  if (typeof badge.lastReportEnd === 'number' && Number.isFinite(badge.lastReportEnd)) {
    const daysAfterEnd = (now - badge.lastReportEnd) / DAY_MS
    if (
      daysAfterEnd >= REPORT_ECHO_WINDOW.minDaysAfterEnd &&
      daysAfterEnd <= REPORT_ECHO_WINDOW.maxDaysAfterEnd
    ) {
      const weeks = Math.round(daysAfterEnd / 7)
      return `Reported ~${weeks}w ago`
    }
  }
  return null
}
