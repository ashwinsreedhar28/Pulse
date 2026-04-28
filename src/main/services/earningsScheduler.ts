// Background refresh for the Yahoo earnings calendar + history. Mirrors
// the financialsService scheduler pattern: a periodic tick refreshes the
// stalest N symbols, plus a one-shot boot backfill ensures cold-start
// state is fresh.
//
// Why a separate scheduler instead of relying on the page-mount fetch:
// the Value Chain page's mount bundle reads from a 24 h Yahoo TTL (now
// 1 h after this change), so a long-running session would see the
// "Reports in N days" countdown drift hours stale before the next
// remount. The scheduler keeps it within ~30 min.
//
// Cost: ~300 tickers × 2 Yahoo calls (calendarEvents + earningsHistory)
// × 2 ticks/hr ÷ MAX_PER_TICK = ~6 ticks of 30 symbols each cycle the
// full universe in roughly 3 h, with each individual symbol refreshing
// every 30-90 min depending on queue position. Yahoo's quoteSummary
// endpoint is unmetered so this is well within tolerance.
//
// Broadcast: each refresh emits 'earnings:updated' so the Value Chain
// page can re-fetch the badge for that symbol without a full remount.

import { BrowserWindow } from 'electron'

import { listTickers } from '../database/tickers'
import { getEarningsBadge } from './earningsService'

// How fresh we want every symbol's earnings to be. 30 min matches the
// "needs to be faster" intent; bumping this down further trades a bit
// more Yahoo load for fresher countdowns.
const STALENESS_THRESHOLD_MS = 30 * 60 * 1000

// How often the scheduler wakes up. 30 min == staleness window so the
// queue empties at roughly the rate it fills.
const TICK_INTERVAL_MS = 30 * 60 * 1000

// Max symbols refreshed per tick. Each does 2 Yahoo calls; concurrency
// inside earningsService caps fan-out at 6, so a 30-symbol tick has
// at most 12 in-flight requests for ~3-5s.
const SYMBOLS_PER_TICK = 30

// Backfill ceiling for the boot-time pass. Larger than SYMBOLS_PER_TICK
// because we want cold-start to land everyone fresh quickly, not wait
// 3 h for the regular cadence to cycle. ~300 symbols × ~150 ms intra-
// symbol pacing ≈ 45 s.
const BACKFILL_MAX_SYMBOLS = 500

// Pacing between sequential refreshes inside a tick. Yahoo tolerates
// quoteSummary at ~10/sec; with concurrency 6 inside earningsService
// each symbol holds 2 of those slots. 150 ms keeps sustained throughput
// at a comfortable margin under the rate flag.
const INTRA_TICK_DELAY_MS = 150

// In-memory map of when we last successfully refreshed each symbol.
// Survives across ticks but resets on app restart — the boot backfill
// catches that case.
const lastRefreshedAt = new Map<string, number>()

function broadcastUpdated(symbol: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('earnings:updated', symbol.toUpperCase())
    }
  }
}

async function refreshOne(symbol: string): Promise<void> {
  const sym = symbol.toUpperCase()
  // getEarningsBadge calls into Yahoo; the cached path inside the Yahoo
  // service is what we're trying to keep warm here. A fresh call writes
  // back into that cache so any spontaneous lookup within the next hour
  // hits it.
  const badge = await getEarningsBadge(sym)
  if (badge.fetchedAt !== null) {
    lastRefreshedAt.set(sym, Date.now())
    broadcastUpdated(sym)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sweep(): Promise<void> {
  const tickers = listTickers()
  if (tickers.length === 0) return
  const now = Date.now()
  // Rank: never-fetched (or post-restart) first via Infinity-staleness,
  // then oldest-first. Skip anyone refreshed within the staleness
  // threshold — they're fresh enough.
  const queued = tickers
    .map((t) => {
      const sym = t.symbol.toUpperCase()
      const last = lastRefreshedAt.get(sym) ?? 0
      return { symbol: t.symbol, last, age: now - last }
    })
    .filter((x) => x.age >= STALENESS_THRESHOLD_MS)
    .sort((a, b) => b.age - a.age)
    .slice(0, SYMBOLS_PER_TICK)

  for (const entry of queued) {
    try {
      await refreshOne(entry.symbol)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // App is shutting down — bail silently rather than log-flooding
      // the queue tail. Mirrors the financialsService pattern.
      if (msg.includes('Database not initialized')) return
      console.warn(`[earnings] refresh failed for ${entry.symbol}:`, msg)
    }
    await sleep(INTRA_TICK_DELAY_MS)
  }
}

async function runInitialBackfill(): Promise<void> {
  const tickers = listTickers()
  if (tickers.length === 0) return
  const queue = tickers.slice(0, BACKFILL_MAX_SYMBOLS).map((t) => t.symbol)
  console.log(`[earnings] initial backfill: ${queue.length} symbol(s)`)
  let done = 0
  for (const sym of queue) {
    try {
      await refreshOne(sym)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Database not initialized')) return
      console.warn(`[earnings] backfill refresh failed for ${sym}:`, msg)
    }
    done += 1
    if (done % 50 === 0) {
      console.log(`[earnings] backfill progress: ${done}/${queue.length}`)
    }
    await sleep(INTRA_TICK_DELAY_MS)
  }
  console.log(`[earnings] initial backfill complete (${done} symbols)`)
}

let timer: NodeJS.Timeout | null = null
let started = false

export function startEarningsScheduler(): void {
  if (started) return
  started = true
  // Wait 25 s after boot to let the financials backfill finish first —
  // they share the Yahoo crumb pool, and staggering the heavy passes
  // prevents a thundering-herd on cold start.
  setTimeout(() => {
    void runInitialBackfill()
  }, 25_000)
  timer = setInterval(() => {
    void sweep()
  }, TICK_INTERVAL_MS)
}

export function stopEarningsScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}

// Forced refresh hook — used after a manual ticker activate so the
// new symbol's earnings populate within seconds, not on the next tick.
export async function forceRefreshEarnings(symbol: string): Promise<void> {
  await refreshOne(symbol)
}
