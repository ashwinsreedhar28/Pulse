// Provision / deprovision the pair of virtual RSS feeds that every watchlist
// ticker gets. They flow through the normal feed poller (no second scheduler),
// but live in a hidden "Watchlist Sources" category so they never appear in
// the user's feed list or fire notifications.

import { getDb } from '../database/connection'
import type { Ticker } from '../database/tickers'

const WATCHLIST_CATEGORY_NAME = 'Watchlist Sources'

export interface TickerFeedSource {
  title: string
  url: string
}

export function buildTickerFeedSources(ticker: Ticker): TickerFeedSource[] {
  // Yahoo uses dashes instead of dots for class shares (e.g., BRK.B → BRK-B).
  // The curated watchlist has no dotted symbols today, but doing the swap
  // here costs nothing and is the right default.
  const yahooSym = ticker.symbol.replace('.', '-')
  return [
    {
      title: `${ticker.symbol} — Yahoo Finance`,
      url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(yahooSym)}&region=US&lang=en-US`
    },
    {
      title: `${ticker.symbol} — Nasdaq`,
      url: `https://www.nasdaq.com/feed/rssoutbound?symbol=${encodeURIComponent(ticker.symbol)}`
    }
  ]
}

function getWatchlistCategoryId(): number | null {
  const row = getDb()
    .prepare<[string], { id: number }>(`SELECT id FROM categories WHERE name = ?`)
    .get(WATCHLIST_CATEGORY_NAME)
  return row?.id ?? null
}

export function provisionFeedsForTicker(ticker: Ticker): void {
  const categoryId = getWatchlistCategoryId()
  if (categoryId === null) {
    console.warn(`[tickerFeeds] "${WATCHLIST_CATEGORY_NAME}" category missing — skipping provision`)
    return
  }
  const insert = getDb().prepare(
    `INSERT OR IGNORE INTO feeds (title, url, categoryId, tickerId, isEnabled)
     VALUES (?, ?, ?, ?, 1)`
  )
  for (const source of buildTickerFeedSources(ticker)) {
    insert.run(source.title, source.url, categoryId, ticker.id)
  }
}

// Called when a ticker is deleted. The ON DELETE CASCADE on feeds.tickerId
// normally handles this, but we keep an explicit helper for targeted cleanup
// during ticker renames or diagnostic tooling.
export function deprovisionFeedsForTicker(tickerId: number): void {
  getDb().prepare(`DELETE FROM feeds WHERE tickerId = ?`).run(tickerId)
}
