// Live quotes via stooq.com's free CSV endpoint.
// Example: https://stooq.com/q/l/?s=aapl.us+msft.us&f=sd2t2ohlcv&h&e=csv
// Columns: Symbol,Date,Time,Open,High,Low,Close,Volume
// "Intraday" change uses close - open because stooq doesn't expose previous-close on this endpoint.

const STOOQ_BASE = 'https://stooq.com/q/l/'
const FETCH_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 55_000

export interface StockQuote {
  symbol: string
  price: number | null
  open: number | null
  high: number | null
  low: number | null
  change: number | null
  changePct: number | null
  volume: number | null
  time: string | null
}

interface CacheEntry {
  quotes: StockQuote[]
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

export async function getQuotes(symbols: string[]): Promise<StockQuote[]> {
  const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)))
  if (unique.length === 0) return []

  const key = unique.slice().sort().join(',')
  const cached = cache.get(key)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quotes
  }

  const encoded = unique.map((s) => `${s.toLowerCase()}.us`).join('+')
  const url = `${STOOQ_BASE}?s=${encoded}&f=sd2t2ohlcv&h&e=csv`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let body: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Pulse/0.1 (macOS stocks ticker)' },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    body = await res.text()
  } catch (err) {
    console.warn('[stooq] fetch failed:', err instanceof Error ? err.message : err)
    // Serve stale cache on failure if we have any; otherwise empty.
    return cached?.quotes ?? []
  } finally {
    clearTimeout(timer)
  }

  const quotes = parseCsv(body, unique)
  cache.set(key, { quotes, fetchedAt: Date.now() })
  return quotes
}

function parseCsv(body: string, requested: string[]): StockQuote[] {
  const lines = body.trim().split(/\r?\n/)
  if (lines.length <= 1) return []
  const bySymbol = new Map<string, StockQuote>()
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',')
    if (cells.length < 8) continue
    const rawSym = cells[0].trim().toUpperCase()
    const symbol = rawSym.replace(/\.US$/, '')
    const date = cells[1].trim()
    const time = cells[2].trim()
    const open = parseNum(cells[3])
    const high = parseNum(cells[4])
    const low = parseNum(cells[5])
    const close = parseNum(cells[6])
    const volume = parseNum(cells[7])
    const change = close !== null && open !== null ? close - open : null
    const changePct = change !== null && open !== null && open !== 0 ? (change / open) * 100 : null
    bySymbol.set(symbol, {
      symbol,
      price: close,
      open,
      high,
      low,
      change,
      changePct,
      volume,
      time: date && date !== 'N/D' ? `${date} ${time}` : null
    })
  }
  return requested.map(
    (s) =>
      bySymbol.get(s) ?? {
        symbol: s,
        price: null,
        open: null,
        high: null,
        low: null,
        change: null,
        changePct: null,
        volume: null,
        time: null
      }
  )
}

function parseNum(raw: string | undefined): number | null {
  if (!raw) return null
  const t = raw.trim()
  if (!t || t === 'N/D') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

