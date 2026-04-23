// Live quotes via stooq.com's free CSV endpoint.
// Example: https://stooq.com/q/l/?s=aapl.us+msft.us&f=sd2t2ohlcv&h&e=csv
// Columns: Symbol,Date,Time,Open,High,Low,Close,Volume
// "Intraday" change uses close - open because stooq doesn't expose previous-close on this endpoint.

const STOOQ_BASE = 'https://stooq.com/q/l/'
const FETCH_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 55_000
// Stooq silently returns N/D rows for a subset of symbols once the batch
// gets past ~100. Observed: a 106-symbol batch drops 6 rows; anything ≤100
// is clean. Chunk well under the cliff so we stay safe as the ticker list
// grows and so an unlucky symbol ordering can't drift us into truncation.
const CHUNK_SIZE = 50

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

  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + CHUNK_SIZE))
  }

  const chunkResults = await Promise.all(chunks.map((c) => fetchChunk(c)))

  // If every chunk failed and we have a prior snapshot, fall back to stale
  // rather than broadcasting an empty list.
  const allFailed = chunkResults.every((r) => r === null)
  if (allFailed && cached) return cached.quotes

  const bySymbol = new Map<string, StockQuote>()
  chunkResults.forEach((chunk, idx) => {
    const requested = chunks[idx]
    const quotes = chunk ?? requested.map(nullQuote)
    for (const q of quotes) bySymbol.set(q.symbol, q)
  })

  const quotes = unique.map((s) => bySymbol.get(s) ?? nullQuote(s))
  cache.set(key, { quotes, fetchedAt: Date.now() })
  return quotes
}

async function fetchChunk(symbols: string[]): Promise<StockQuote[] | null> {
  const encoded = symbols.map((s) => `${s.toLowerCase()}.us`).join('+')
  const url = `${STOOQ_BASE}?s=${encoded}&f=sd2t2ohlcv&h&e=csv`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Pulse/0.1 (macOS stocks ticker)' },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.text()
    return parseCsv(body, symbols)
  } catch (err) {
    console.warn('[stooq] chunk fetch failed:', err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

function nullQuote(symbol: string): StockQuote {
  return {
    symbol,
    price: null,
    open: null,
    high: null,
    low: null,
    change: null,
    changePct: null,
    volume: null,
    time: null
  }
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
  return requested.map((s) => bySymbol.get(s) ?? nullQuote(s))
}

function parseNum(raw: string | undefined): number | null {
  if (!raw) return null
  const t = raw.trim()
  if (!t || t === 'N/D') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

