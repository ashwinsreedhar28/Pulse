// Slow, resumable backfill of daily OHLCV into market_bars.
//
// Deliberately unhurried. Yahoo rate-limits hard — the live quote poll alone
// sustains ~500 requests/minute across the watchlist, and adding a fast
// backfill on top of that reliably earns an HTTP 429 (observed while building
// this). So this service trickles: one symbol per tick, and only when the
// market is closed, so it never competes with the live poll for budget.
//
// The urgency asymmetry that shapes this design:
//   - 1-minute bars are captured live by fetchQuoteOne because Yahoo only
//     retains ~30 days of them. Miss a day and it is gone permanently.
//   - Daily bars go back decades and can be fetched at any time. There is
//     no cost to backfilling them slowly.
//
// Which is why this is a trickle and not a sweep.

import { listTickers } from '../database/tickers'
import { backfillBars } from './yahooFinanceService'
import { barCoverage } from '../database/marketBars'
import { shouldDeferOnResume } from './networkStatus'

// One symbol per tick. 503 tickers ≈ 4 h for a full pass at 30 s.
const TICK_MS = 30_000
const BOOT_DELAY_MS = 15 * 60 * 1000

// Daily history is fetched in bounded windows, NOT with range=max.
//
// The previous comment here read: "'max' on a daily interval is the whole
// listed history of the symbol and costs exactly one request, so there is no
// reason to page it." That assumption was wrong and quietly corrupted the
// entire price table. Yahoo downsamples long windows: range=max on
// interval=1d returns monthly or quarterly candles, and they were stored
// under the '1d' label. Of 532 symbols with daily-labelled rows, only 13
// actually had daily spacing.
//
// Ten years per request keeps Yahoo returning true daily candles while still
// covering most listed history in a handful of calls. backfillBars validates
// the spacing of what comes back and discards it if the response is
// downsampled anyway, so a wrong window here fails loudly instead of writing
// fiction.
// Benchmarks and sector ETFs. Not tickers, so listTickers() never yielded
// them and market_bars held no index rows at all — which is why
// trading/scripts/event_study.py re-downloads SPY from yfinance on every run,
// and why no excess return can be computed inside the app. market_bars has no
// foreign key to tickers, so these store cleanly alongside everything else.
const BENCHMARKS = [
  'SPY', 'QQQ', 'IWM', 'DIA',
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC'
]

const WINDOW_YEARS = 10
const MAX_WINDOWS_PER_SYMBOL = 5
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60

let timer: ReturnType<typeof setInterval> | null = null
let bootTimer: ReturnType<typeof setTimeout> | null = null

// Resume point across ticks. Not persisted: a restart re-walking the list is
// harmless because upsertBars is INSERT OR IGNORE, so a repeat pass writes
// nothing and costs one request.
let cursor = 0
let done = false

// Regular US session, in local time. We only backfill outside it.
function marketIsOpen(): boolean {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 || day === 6) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= 9 * 60 + 30 && mins < 16 * 60
}

async function tick(): Promise<void> {
  if (done) return
  // Same gate the other schedulers use. Deliberately NOT a bare
  // net.isOnline() check — that reports false transiently on macOS and
  // would silently stall the backfill; the guard only bites in the 30s
  // window after a resume, when fetches really are doomed.
  if (shouldDeferOnResume()) return
  if (marketIsOpen()) return

  let symbols: string[]
  try {
    // Benchmarks first: they are the smallest set and everything else is
    // measured relative to them, so they should exist before the long tail.
    symbols = [...BENCHMARKS, ...listTickers().map((t) => t.symbol)]
  } catch (err) {
    console.warn('[backfill] listTickers failed:', err instanceof Error ? err.message : err)
    return
  }
  if (symbols.length === 0) return

  if (cursor >= symbols.length) {
    done = true
    const cov = barCoverage('1d')
    console.log(
      `[backfill] daily pass complete — ${cov.rows} bars across ${cov.symbols} symbols`
    )
    return
  }

  const symbol = symbols[cursor++]
  try {
    // Walk backwards in ten-year windows until a window returns nothing,
    // which means we have reached the start of the symbol's listed history.
    let written = 0
    let period2 = Math.floor(Date.now() / 1000)
    for (let i = 0; i < MAX_WINDOWS_PER_SYMBOL; i++) {
      const period1 = Math.floor(period2 - WINDOW_YEARS * SECONDS_PER_YEAR)
      const n = await backfillBars(symbol, '1d', '', { period1, period2 })
      written += n
      if (n === 0) break
      period2 = period1
    }
    if (written > 0) console.log(`[backfill] ${symbol}: +${written} daily bars`)
  } catch (err) {
    // backfillBars already swallows its own errors; this is belt-and-braces
    // so one bad symbol can never kill the interval.
    console.warn(`[backfill] ${symbol} failed:`, err instanceof Error ? err.message : err)
  }
}

export function startMarketBackfill(): void {
  stopMarketBackfill()
  bootTimer = setTimeout(() => {
    void tick()
    timer = setInterval(() => void tick(), TICK_MS)
  }, BOOT_DELAY_MS)
}

export function stopMarketBackfill(): void {
  if (bootTimer) {
    clearTimeout(bootTimer)
    bootTimer = null
  }
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

// Lets a new ticker added after the pass finished get picked up.
export function resetMarketBackfill(): void {
  cursor = 0
  done = false
}
