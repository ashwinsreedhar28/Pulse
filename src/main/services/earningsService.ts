// Earnings-pulse data source for the value-chain view. Marries the Yahoo
// earnings calendar (next scheduled / estimated earnings date) with the most
// recent quarter end we have on file — the latter fuels the "just reported"
// echo that lingers for a few days after a print.
//
// yahooFinanceService.getEarnings already has a 24h in-memory TTL, so batch
// calls through here are cheap: duplicate symbols collapse to a single Yahoo
// fetch, and a second ValueChain render within the day hits the cache.

import { getAllLastPeriodEnds } from '../database/tickerFinancials'
import { getEarnings, getEarningsHistory } from './yahooFinanceService'

// Trimmed-down beat/miss shape for the renderer. Omits Yahoo's raw period
// tag — we have the unix ms and the renderer sorts on that.
export interface EarningsHistoryQuarter {
  quarter: number // unix ms quarter-end
  epsActual: number | null
  epsEstimate: number | null
  surprisePct: number | null // ratio (0.05 = +5%)
}

export interface EarningsBadge {
  symbol: string
  // Next scheduled earnings date (unix ms) per Yahoo, or null if unknown.
  nextDate: number | null
  // When true, Yahoo gave a date window rather than a confirmed date — the
  // pulse still animates but the renderer flags it as "est".
  isEstimate: boolean
  // Most recent quarter-end we've stored locally. Enables the post-earnings
  // "echo" even when Yahoo's calendar has already rolled forward to the next
  // quarter.
  lastReportEnd: number | null
  // Trailing beat/miss record, most-recent first. Up to the last 4 quarters
  // Yahoo returns in `earningsHistory`. Empty when the symbol is delisted or
  // Yahoo has no history (private competitors, tombstoned 404s).
  history: EarningsHistoryQuarter[]
  // When Yahoo's calendar was last consulted — null means we never resolved
  // this symbol (likely a passive graph node we don't refresh proactively).
  fetchedAt: number | null
}

function emptyBadge(symbol: string): EarningsBadge {
  return {
    symbol: symbol.toUpperCase(),
    nextDate: null,
    isEstimate: false,
    lastReportEnd: null,
    history: [],
    fetchedAt: null
  }
}

export async function getEarningsBadge(symbol: string): Promise<EarningsBadge> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return emptyBadge(symbol)
  const [earnings, history] = await Promise.all([
    getEarnings(sym).catch(() => null),
    getEarningsHistory(sym).catch(() => null)
  ])
  const periodEnds = getAllLastPeriodEnds()
  return {
    symbol: sym,
    nextDate: earnings?.nextDate ?? null,
    isEstimate: earnings?.isEstimate ?? false,
    lastReportEnd: periodEnds.get(sym) ?? null,
    history:
      history?.quarters.map((q) => ({
        quarter: q.quarter,
        epsActual: q.epsActual,
        epsEstimate: q.epsEstimate,
        surprisePct: q.surprisePct
      })) ?? [],
    fetchedAt: earnings?.fetchedAt ?? null
  }
}

// Batch fetch for the ValueChain mount. Reads the periodEnd map once and
// parallelizes Yahoo calls. Each symbol makes two quoteSummary calls
// (calendarEvents + earningsHistory) but both share the 24h TTL so repeat
// mounts are free.
export async function getEarningsBadgesForSymbols(
  symbols: string[]
): Promise<EarningsBadge[]> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))]
  if (unique.length === 0) return []
  const periodEnds = getAllLastPeriodEnds()
  const results = await Promise.all(
    unique.map(async (sym) => {
      try {
        const [earnings, history] = await Promise.all([
          getEarnings(sym).catch(() => null),
          getEarningsHistory(sym).catch(() => null)
        ])
        return {
          symbol: sym,
          nextDate: earnings?.nextDate ?? null,
          isEstimate: earnings?.isEstimate ?? false,
          lastReportEnd: periodEnds.get(sym) ?? null,
          history:
            history?.quarters.map((q) => ({
              quarter: q.quarter,
              epsActual: q.epsActual,
              epsEstimate: q.epsEstimate,
              surprisePct: q.surprisePct
            })) ?? [],
          fetchedAt: earnings?.fetchedAt ?? null
        } satisfies EarningsBadge
      } catch {
        return {
          symbol: sym,
          nextDate: null,
          isEstimate: false,
          lastReportEnd: periodEnds.get(sym) ?? null,
          history: [],
          fetchedAt: null
        } satisfies EarningsBadge
      }
    })
  )
  return results
}
