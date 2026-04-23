// Single source of truth for "what price do we show right now". A StockQuote
// carries the regular-session close (from Stooq) plus an extended-hours
// overlay (from Yahoo). The right headline price flips between them based
// on Yahoo's marketState:
//
//   regular  → show Stooq's intraday close + intraday change
//   post     → show Yahoo post-market price + delta vs regular close
//   pre      → show Yahoo pre-market price + delta vs regular close
//   closed   → fall back to regular; no session badge
//
// Every ticker surface (marquee, value-chain tiles, holdings cards, detail
// header) should render through this helper so the user doesn't see a 4pm
// close next to an AH pill that says otherwise.
//
// The deltas (`change`, `changePct`) follow their session's natural
// reference. Regular-session deltas are vs session open (Stooq's convention);
// extended-session deltas are vs the regular close (matches how traders
// talk about AH moves).

import type { StockQuote } from '../../preload'

export type DisplaySession = 'pre' | 'regular' | 'post' | 'closed'

export interface ResolvedQuote {
  price: number | null
  change: number | null
  changePct: number | null
  session: DisplaySession
  // Short badge label for the non-regular sessions. Null when session is
  // 'regular' or 'closed' — in those cases the caller doesn't need to
  // render a separate session indicator.
  sessionBadge: 'AH' | 'PRE' | null
}

export function resolveDisplayQuote(quote: StockQuote): ResolvedQuote {
  const state = quote.marketState
  if (state === 'post' && quote.postMarketPrice !== null) {
    return {
      price: quote.postMarketPrice,
      change: quote.postMarketChange,
      changePct: quote.postMarketChangePct,
      session: 'post',
      sessionBadge: 'AH'
    }
  }
  if (state === 'pre' && quote.preMarketPrice !== null) {
    return {
      price: quote.preMarketPrice,
      change: quote.preMarketChange,
      changePct: quote.preMarketChangePct,
      session: 'pre',
      sessionBadge: 'PRE'
    }
  }
  // Regular hours or the overlay isn't available. Fall through to Stooq's
  // value. marketState can be null when the Yahoo overlay wasn't fetched
  // (non-watchlist symbols, network miss) — treat that as 'regular' for
  // display since Stooq keeps ticking during regular hours.
  return {
    price: quote.price,
    change: quote.change,
    changePct: quote.changePct,
    session: state === 'closed' ? 'closed' : 'regular',
    sessionBadge: null
  }
}

// Tone helper for the resolved change. Emerald for positive, red for
// negative, zinc for flat/null. Kept next to resolveDisplayQuote so every
// caller coloring quote deltas goes through the same mapping.
export function changeTone(change: number | null): string {
  if (change === null || !Number.isFinite(change)) return 'text-zinc-400'
  if (change > 0) return 'text-emerald-400'
  if (change < 0) return 'text-red-400'
  return 'text-zinc-400'
}
