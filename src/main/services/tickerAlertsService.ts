// Stock-movement notification source. Wired onto stocksScheduler ticks
// — every quote refresh feeds the latest StockQuote rows in here, the
// service evaluates each watchlist quote against the user's thresholds,
// and dispatches a NotificationCandidate per detected event. Dedup is
// handled centrally by notificationService (identityKey scoped per
// market day so a ticker that crosses ±5%, drops back, then crosses
// again only notifies once).
//
// Phase-2 v1 alerts (computable purely from StockQuote — no new fetches):
//   - Daily move: |changePct| ≥ stockDailyMovePct (default 5%)
//   - Gap at open: |(open - prevClose) / prevClose| ≥ stockGapOpenPct
//     (default 2%); prevClose = price - change so we don't need a
//     separate fetch
//   - 52-week high/low touch: only when fundamentals are already warm
//     in yahooFinanceService's in-memory cache; skipped otherwise
//
// Pre/extended-hours coverage: changePct on StockQuote reflects the
// regular-session move; pre-market and after-hours moves live on the
// preMarketChangePct / postMarketChangePct fields. We evaluate those
// separately so a 6am pre-market spike still fires an alert.

import type { StockQuote } from '../../preload'
import { getPreferences } from '../database/preferences'
import { getFundamentals as getCachedFundamentals } from './yahooFinanceService'
import { dispatchNotification } from './notificationService'

// Format YYYY-MM-DD in America/New_York so the identityKey-per-market-day
// scoping survives the user being in a different timezone. Without this,
// a daily-move alert at 4pm ET could fire again at the same UTC midnight
// from a user on the East Coast.
function nyDayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

function formatSignedPct(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function evaluateDailyMove(quote: StockQuote, threshold: number, dayKey: string): void {
  const move = quote.changePct
  if (move === null || !Number.isFinite(move)) return
  if (Math.abs(move) < threshold) return
  const dir = move >= 0 ? '↑' : '↓'
  const priceStr = quote.price !== null ? ` · $${quote.price.toFixed(2)}` : ''
  dispatchNotification({
    category: 'stock',
    identityKey: `stock-daily:${quote.symbol}:${dayKey}`,
    title: `${quote.symbol} ${dir} ${formatSignedPct(move)}${priceStr}`,
    body: `Daily move crossed ±${threshold.toFixed(1)}%.`,
    importance: 'normal',
    clickAction: { kind: 'symbol', symbol: quote.symbol }
  })
}

function evaluateGapAtOpen(quote: StockQuote, threshold: number, dayKey: string): void {
  // Only meaningful during the regular session — gap is the difference
  // between today's open and yesterday's close. Outside RTH the open
  // value is stale or zero.
  if (quote.marketState !== 'regular') return
  if (quote.open === null || quote.price === null || quote.change === null) return
  // prevClose = price - change. (Equivalent to yahooQuote.previousClose
  // which we don't directly carry on StockQuote.)
  const prevClose = quote.price - quote.change
  if (prevClose <= 0) return
  const gap = ((quote.open - prevClose) / prevClose) * 100
  if (Math.abs(gap) < threshold) return
  const dir = gap >= 0 ? '↑' : '↓'
  dispatchNotification({
    category: 'stock',
    identityKey: `stock-gap:${quote.symbol}:${dayKey}`,
    title: `${quote.symbol} gapped ${dir} ${formatSignedPct(gap)} at open`,
    body: `Open $${quote.open.toFixed(2)} vs prior close $${prevClose.toFixed(2)}.`,
    importance: 'urgent',
    clickAction: { kind: 'symbol', symbol: quote.symbol }
  })
}

function evaluateExtendedMove(quote: StockQuote, threshold: number, dayKey: string): void {
  // Pre-market: only when we're actually in the pre window (Yahoo
  // exposes the pre-market session 4am-9:30am ET). After-hours: post
  // window (4pm-8pm ET).
  if (quote.marketState === 'pre' && quote.preMarketChangePct !== null) {
    const move = quote.preMarketChangePct
    if (Math.abs(move) >= threshold && Number.isFinite(move)) {
      const dir = move >= 0 ? '↑' : '↓'
      dispatchNotification({
        category: 'stock',
        identityKey: `stock-premarket:${quote.symbol}:${dayKey}`,
        title: `${quote.symbol} pre-market ${dir} ${formatSignedPct(move)}`,
        body:
          quote.preMarketPrice !== null
            ? `Pre-market $${quote.preMarketPrice.toFixed(2)}.`
            : 'Pre-market move crossed threshold.',
        importance: 'urgent',
        clickAction: { kind: 'symbol', symbol: quote.symbol }
      })
    }
  }
  if (quote.marketState === 'post' && quote.postMarketChangePct !== null) {
    const move = quote.postMarketChangePct
    if (Math.abs(move) >= threshold && Number.isFinite(move)) {
      const dir = move >= 0 ? '↑' : '↓'
      dispatchNotification({
        category: 'stock',
        identityKey: `stock-aftermarket:${quote.symbol}:${dayKey}`,
        title: `${quote.symbol} after-hours ${dir} ${formatSignedPct(move)}`,
        body:
          quote.postMarketPrice !== null
            ? `After-hours $${quote.postMarketPrice.toFixed(2)}.`
            : 'After-hours move crossed threshold.',
        importance: 'urgent',
        clickAction: { kind: 'symbol', symbol: quote.symbol }
      })
    }
  }
}

// 52-week high/low touch — uses the in-memory fundamentals cache that
// yahooFinanceService already maintains for the detail page. We only
// alert when the fundamentals are warm; the cold path skips silently
// (no extra fetches piggybacked on the alert tick).
async function evaluate52wTouch(quote: StockQuote, dayKey: string): Promise<void> {
  if (quote.price === null) return
  const f = await getCachedFundamentals(quote.symbol)
  if (!f) return
  // Touch tolerance: within 0.1% of the 52w extreme. Yahoo's value can lag
  // by a few minutes during a fast move, so requiring exact equality
  // would miss real touches.
  const tolerance = 0.001
  if (f.weekHigh52 !== null && quote.price >= f.weekHigh52 * (1 - tolerance)) {
    dispatchNotification({
      category: 'stock',
      identityKey: `stock-52wh:${quote.symbol}:${dayKey}`,
      title: `${quote.symbol} touched a 52-week high`,
      body: `$${quote.price.toFixed(2)} (52w high $${f.weekHigh52.toFixed(2)}).`,
      importance: 'urgent',
      clickAction: { kind: 'symbol', symbol: quote.symbol }
    })
  }
  if (f.weekLow52 !== null && quote.price <= f.weekLow52 * (1 + tolerance)) {
    dispatchNotification({
      category: 'stock',
      identityKey: `stock-52wl:${quote.symbol}:${dayKey}`,
      title: `${quote.symbol} touched a 52-week low`,
      body: `$${quote.price.toFixed(2)} (52w low $${f.weekLow52.toFixed(2)}).`,
      importance: 'urgent',
      clickAction: { kind: 'symbol', symbol: quote.symbol }
    })
  }
}

// Public entry point — called by stocksScheduler after each successful
// quote tick with the freshly-broadcast quote rows. Synchronous-ish:
// evaluateDailyMove + evaluateGapAtOpen + evaluateExtendedMove are pure
// (no IO), evaluate52wTouch hits the in-memory fundamentals cache.
export async function evaluateStockAlerts(quotes: StockQuote[]): Promise<void> {
  if (quotes.length === 0) return
  const prefs = getPreferences()
  // Honor the master Stock category toggle here too; the central
  // dispatcher does the same check, but short-circuiting upstream
  // skips the price-math + cache lookup loop entirely.
  if (!prefs.notifyStocksEnabled) return
  const dayKey = nyDayKey()
  const dailyThreshold = prefs.stockDailyMovePct
  const gapThreshold = prefs.stockGapOpenPct
  // Extended-hours moves use the same threshold as daily — by the time a
  // pre-market move crosses 5%, that's notification-worthy regardless of
  // session.
  const extThreshold = prefs.stockDailyMovePct

  for (const q of quotes) {
    if (!q.symbol) continue
    evaluateDailyMove(q, dailyThreshold, dayKey)
    evaluateGapAtOpen(q, gapThreshold, dayKey)
    evaluateExtendedMove(q, extThreshold, dayKey)
    // 52w touch fetches an in-memory cache; safe to await without
    // serializing the loop.
    void evaluate52wTouch(q, dayKey).catch(() => {
      /* swallow — alert is best-effort */
    })
  }
}
