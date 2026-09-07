import { BrowserWindow } from 'electron'
import { listTickers } from '../database/tickers'
import { getQuotes as getStooqQuotes, type StockQuote } from './stooqService'
import { getExtendedQuotes, getYahooQuotes } from './yahooFinanceService'
import { evaluateStockAlerts } from './tickerAlertsService'
import { shouldDeferOnResume } from './networkStatus'

// Three cadences, picked to match when Stooq data is actually changing:
//  - Active: weekday 04:00–20:00 ET (pre-market + regular + after-hours)
//  - Weekday off-hours: late-night US — quotes barely move, poll hourly
//  - Weekend: markets closed, poll every 6h so a user who opens the app
//    Saturday still sees Friday's close without a cold fetch.
const ACTIVE_MS = 60_000
const WEEKDAY_OFF_MS = 60 * 60 * 1000
const WEEKEND_MS = 6 * 60 * 60 * 1000

// Hard ceiling on symbols requested per tick.
//
// The scheduler used to fetch every ticker row every tick. That was fine at
// ~500 symbols but does not scale, and it scales in exactly the wrong
// direction: Yahoo rate-limits by IP more aggressively than the once-a-minute
// cadence suggests (sustained requests earn a 429 whose cooldown outlives the
// traffic), and fetchQuoteOne returns an empty quote on !res.ok — so crossing
// the limit shows up as blank prices across the whole app rather than as an
// error anyone would notice.
//
// Active watchlist symbols are always included; passive rows (which back the
// value-chain and market-graph tiles) fill the remaining budget on a rotating
// window, so every passive symbol still refreshes regularly while the request
// rate stays bounded no matter how large the ticker table grows.
const MAX_SYMBOLS_PER_TICK = 320

let timer: NodeJS.Timeout | null = null
let lastQuotes: StockQuote[] = []
let currentCadence = 0
// Rotation offset into the passive list, advanced each tick.
let passiveCursor = 0

export function getLastQuotes(): StockQuote[] {
  return lastQuotes
}

function anyWindowVisible(): boolean {
  return BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible())
}

// Returns {weekday, hour} in America/New_York. Intl gives us timezone-correct
// results without pulling in a tz library, and handles DST transitions.
function nyParts(): { weekday: number; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    hour12: false
  })
  const parts = fmt.formatToParts(new Date())
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
  const hr = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { weekday: weekdayMap[wd] ?? 1, hour: hr }
}

function pickCadence(): number {
  const { weekday, hour } = nyParts()
  if (weekday === 0 || weekday === 6) return WEEKEND_MS
  if (hour >= 4 && hour < 20) return ACTIVE_MS
  return WEEKDAY_OFF_MS
}

async function tick(): Promise<void> {
  // Active rows every tick; passive rows (isActive=0, backing the value-chain
  // and market-graph tiles) on rotation within a fixed budget. Watchlist
  // gating for notifications, summaries and per-ticker RSS happens at the
  // layers that care, not here.
  const tickers = listTickers()
  const active = tickers.filter((t) => t.isActive).map((t) => t.symbol)
  const passive = tickers.filter((t) => !t.isActive).map((t) => t.symbol)

  let symbols: string[]
  if (active.length + passive.length <= MAX_SYMBOLS_PER_TICK) {
    symbols = [...active, ...passive]
  } else {
    const budget = Math.max(0, MAX_SYMBOLS_PER_TICK - active.length)
    const slice: string[] = []
    if (passive.length > 0 && budget > 0) {
      for (let i = 0; i < Math.min(budget, passive.length); i++) {
        slice.push(passive[(passiveCursor + i) % passive.length])
      }
      passiveCursor = (passiveCursor + slice.length) % passive.length
    }
    symbols = [...active, ...slice]
  }
  if (symbols.length === 0) {
    lastQuotes = []
    broadcast([])
    return
  }
  // Defer only inside the post-resume window when the OS still reports
  // offline — outside that window we always fetch (net.isOnline() lies
  // during normal operation on macOS and used to blank the marquee).
  if (shouldDeferOnResume()) return
  try {
    // Yahoo is the primary quote source — one chart request per symbol,
    // bounded-concurrency, returns regular-session OHLCV plus pre/post
    // prints and marketState in a single response. Stooq is kept as a
    // fallback because Yahoo's unofficial API has been known to shift
    // schema or throttle; when Yahoo comes back mostly-null we treat it
    // as a partial outage and try Stooq's batched CSV.
    //
    // "Mostly-null" threshold: if fewer than half the symbols have a
    // non-null price, the wave is failed-looking. Picking 50% because a
    // handful of delisted / placeholder tickers in the graph always come
    // back null and we don't want those to force a fallback on an
    // otherwise-healthy response.
    let quotes = await getYahooQuotes(symbols).catch(() => [] as StockQuote[])
    const yahooHits = quotes.filter((q) => q.price !== null).length
    const yahooOk = quotes.length > 0 && yahooHits >= quotes.length / 2

    if (!yahooOk) {
      console.warn(
        `[stocks] Yahoo returned ${yahooHits}/${quotes.length} priced quotes — falling back to Stooq`
      )
      // Stooq's tab-separated CSV header has shifted shape before; if the
      // hand-rolled parser throws, treat it as a partial outage like the
      // Yahoo fallback above does — return [] so we keep the prior
      // tick's lastQuotes instead of blanking the marquee.
      const stooqQuotes = await getStooqQuotes(symbols).catch(() => [] as StockQuote[])
      const overlay = shouldOverlayExtended()
        ? await getExtendedQuotes(symbols).catch(() => [])
        : []
      if (overlay.length > 0) {
        const overlayBySymbol = new Map(overlay.map((x) => [x.symbol.toUpperCase(), x]))
        for (const q of stooqQuotes) {
          const ext = overlayBySymbol.get(q.symbol.toUpperCase())
          if (!ext) continue
          q.marketState = ext.marketState
          // Delta baseline: Stooq's close is the regular-session close, which
          // matches what Yahoo calls regularMarketPrice — so post-market
          // deltas measured against it read naturally ("AH +0.42 from close").
          const baseline = q.price ?? ext.regularPrice
          if (ext.postPrice !== null) {
            q.postMarketPrice = ext.postPrice
            if (baseline !== null && baseline > 0) {
              q.postMarketChange = ext.postPrice - baseline
              q.postMarketChangePct = (q.postMarketChange / baseline) * 100
            }
          }
          if (ext.prePrice !== null) {
            q.preMarketPrice = ext.prePrice
            if (baseline !== null && baseline > 0) {
              q.preMarketChange = ext.prePrice - baseline
              q.preMarketChangePct = (q.preMarketChange / baseline) * 100
            }
          }
        }
      }
      quotes = stooqQuotes
    }

    // Merge, don't replace. A tick now covers only a slice of the passive
    // rotation, so overwriting would blank every symbol not in this batch and
    // make value-chain and market-graph tiles flicker between polls. Merging
    // keeps the last known price for anything not refreshed this round.
    if (lastQuotes.length === 0) {
      lastQuotes = quotes
    } else {
      const merged = new Map(lastQuotes.map((q) => [q.symbol, q]))
      for (const q of quotes) merged.set(q.symbol, q)
      lastQuotes = [...merged.values()]
    }
    // Broadcast the full merged set so the renderer always sees every symbol.
    broadcast(lastQuotes)
    // Phase 2: feed every successful tick into the stock-alerts evaluator.
    // Synchronous call — no event-loop yield, no TOCTOU window between
    // daily-cap checks. The evaluator early-returns when stocks alerts
    // are disabled in preferences.
    try {
      evaluateStockAlerts(quotes)
    } catch (err) {
      console.warn(
        '[stocks] tickerAlerts evaluator failed:',
        err instanceof Error ? err.message : err
      )
    }
  } catch (err) {
    console.warn('[stocks] tick failed:', err instanceof Error ? err.message : err)
  }
}

// Heuristic: run the Yahoo overlay during weekday pre-market (4-9:30 ET)
// and after-hours (16-20 ET). Outside those windows Stooq's close is all
// we'd get anyway, and skipping the Yahoo fan-out saves ~20 requests per
// idle tick overnight.
function shouldOverlayExtended(): boolean {
  const { weekday, hour } = nyParts()
  if (weekday === 0 || weekday === 6) return false
  // 4am–9:30am OR 4pm–8pm. We round the 9:30 cut-off to 10 to keep the
  // window check integer-only; the regular-session quote will just come
  // through Stooq + Yahoo meta normally in that narrow overlap.
  if (hour >= 4 && hour < 10) return true
  if (hour >= 16 && hour < 20) return true
  return false
}

function broadcast(quotes: StockQuote[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('stocks:updated', quotes)
  }
}

function scheduleNext(): void {
  if (timer) clearTimeout(timer)
  const cadence = pickCadence()
  currentCadence = cadence
  timer = setTimeout(async () => {
    // Skip the fetch if nothing is visible to consume it. We still reschedule
    // so the next tick fires as soon as conditions are met. Market-hours gating
    // is already baked into the cadence itself.
    if (anyWindowVisible()) {
      await tick()
    }
    // If market-session boundaries crossed while we slept, pickCadence() on
    // the next schedule will produce the updated interval automatically.
    scheduleNext()
  }, cadence)
}

export function startStocksScheduler(): void {
  stopStocksScheduler()
  void tick()
  scheduleNext()
}

export function stopStocksScheduler(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  currentCadence = 0
}

export async function refreshStocksNow(): Promise<StockQuote[]> {
  await tick()
  return lastQuotes
}

// Exported for potential future diagnostics/UI; not currently consumed.
export function getStocksCadenceMs(): number {
  return currentCadence
}
