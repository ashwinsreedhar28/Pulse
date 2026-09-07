// Live quotes via stooq.com's free CSV endpoint.
// Example: https://stooq.com/q/l/?s=aapl.us+msft.us&f=sd2t2ohlcv&h&e=csv
// Columns: Symbol,Date,Time,Open,High,Low,Close,Volume
// "Intraday" change uses close - open because stooq doesn't expose previous-close on this endpoint.

const STOOQ_BASE = 'https://stooq.com/q/l/'
const FETCH_TIMEOUT_MS = 5_000
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
  // Stooq's sd2t2ohlcv CSV carries no prior close, so this is always null
  // from this provider. See yahooFinanceService for why it can't be derived.
  previousClose: number | null
  change: number | null
  changePct: number | null
  volume: number | null
  time: string | null
  // Extended-session overlay from Yahoo's chart endpoint. Stooq doesn't
  // publish pre/post prints, so these fields hold the "right-now" price
  // during 4am–9:30am and 4pm–8pm ET windows. Deltas are vs the regular-
  // session close (Stooq `price`) so the UI can render "AH +0.42 (+0.8%)".
  postMarketPrice: number | null
  postMarketChange: number | null
  postMarketChangePct: number | null
  preMarketPrice: number | null
  preMarketChange: number | null
  preMarketChangePct: number | null
  // Current trading session per Yahoo's clock: 'pre', 'regular', 'post',
  // 'closed'. Null when the Yahoo overlay failed for this symbol — the UI
  // falls back to showing just the Stooq regular-session price.
  marketState: 'pre' | 'regular' | 'post' | 'closed' | null
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
  } catch {
    // Per-chunk failures used to log inline, which during offline → online
    // transitions amounted to a flood of identical lines. Caller (getQuotes
    // / stocksScheduler) sees the null + cached-fallback and emits a single
    // per-cycle summary instead.
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
    previousClose: null,
    change: null,
    changePct: null,
    volume: null,
    time: null,
    postMarketPrice: null,
    postMarketChange: null,
    postMarketChangePct: null,
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePct: null,
    marketState: null
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
      previousClose: null, // not present in the sd2t2ohlcv CSV
      change,
      changePct,
      volume,
      time: date && date !== 'N/D' ? `${date} ${time}` : null,
      // Extended-session fields populated later by the scheduler when it
      // merges the Yahoo chart overlay. Stooq-only path leaves them null.
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePct: null,
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePct: null,
      marketState: null
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

