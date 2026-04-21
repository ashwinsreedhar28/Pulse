import { BrowserWindow } from 'electron'
import { listTickers } from '../database/tickers'
import { getQuotes, type StockQuote } from './stooqService'

// Three cadences, picked to match when Stooq data is actually changing:
//  - Active: weekday 04:00–20:00 ET (pre-market + regular + after-hours)
//  - Weekday off-hours: late-night US — quotes barely move, poll hourly
//  - Weekend: markets closed, poll every 6h so a user who opens the app
//    Saturday still sees Friday's close without a cold fetch.
const ACTIVE_MS = 60_000
const WEEKDAY_OFF_MS = 60 * 60 * 1000
const WEEKEND_MS = 6 * 60 * 60 * 1000

let timer: NodeJS.Timeout | null = null
let lastQuotes: StockQuote[] = []
let currentCadence = 0

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
  const symbols = listTickers()
    .filter((t) => t.isActive)
    .map((t) => t.symbol)
  if (symbols.length === 0) {
    lastQuotes = []
    broadcast([])
    return
  }
  try {
    const quotes = await getQuotes(symbols)
    lastQuotes = quotes
    broadcast(quotes)
  } catch (err) {
    console.warn('[stocks] tick failed:', err instanceof Error ? err.message : err)
  }
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
