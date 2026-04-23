import { getDb } from './connection'

export interface Ticker {
  id: number
  symbol: string
  companyName: string
  sector: string | null
  industry: string | null
  isActive: boolean
  addedAt: number
}

interface TickerRow {
  id: number
  symbol: string
  companyName: string
  sector: string | null
  industry: string | null
  isActive: number
  addedAt: number
}

const toTicker = (row: TickerRow): Ticker => ({
  id: row.id,
  symbol: row.symbol,
  companyName: row.companyName,
  sector: row.sector,
  industry: row.industry,
  isActive: row.isActive === 1,
  addedAt: row.addedAt
})

export function listTickers(): Ticker[] {
  return getDb()
    .prepare<[], TickerRow>(`SELECT * FROM tickers ORDER BY symbol`)
    .all()
    .map(toTicker)
}

export interface CreateTickerInput {
  symbol: string
  companyName: string
  sector?: string | null
  industry?: string | null
}

export function createTicker(input: CreateTickerInput): Ticker {
  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO tickers (symbol, companyName, sector, industry, isActive, addedAt)
       VALUES (?, ?, ?, ?, 1, ?)`
    )
    .run(
      input.symbol.toUpperCase(),
      input.companyName,
      input.sector ?? null,
      input.industry ?? null,
      Date.now()
    )
  const row = db
    .prepare<[number], TickerRow>(`SELECT * FROM tickers WHERE id = ?`)
    .get(info.lastInsertRowid as number)!
  return toTicker(row)
}

export function deleteTicker(id: number): void {
  getDb().prepare(`DELETE FROM tickers WHERE id = ?`).run(id)
}

export function getTicker(id: number): Ticker | null {
  const row = getDb()
    .prepare<[number], TickerRow>(`SELECT * FROM tickers WHERE id = ?`)
    .get(id)
  return row ? toTicker(row) : null
}

export function getTickerBySymbol(symbol: string): Ticker | null {
  const row = getDb()
    .prepare<[string], TickerRow>(`SELECT * FROM tickers WHERE symbol = ?`)
    .get(symbol.toUpperCase())
  return row ? toTicker(row) : null
}

export function setTickerActive(id: number, active: boolean): void {
  getDb()
    .prepare(`UPDATE tickers SET isActive = ? WHERE id = ?`)
    .run(active ? 1 : 0, id)
}

// Passive-row creator for "I want to explore this ticker without adding it
// to my watchlist" flows (e.g., the search-box Open-detail button on the
// Stocks page). Identical to createTicker but inserts isActive=0, so the
// stocks scheduler will poll its quote but the watchlist-scoped features
// (news ingest, ticker summary) stay dormant until the user promotes.
// Idempotent — returns the existing row when the symbol is already in the
// DB, regardless of its current isActive state.
export function ensurePassiveTicker(input: CreateTickerInput): Ticker {
  const existing = getTickerBySymbol(input.symbol)
  if (existing) return existing
  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO tickers (symbol, companyName, sector, industry, isActive, addedAt)
       VALUES (?, ?, ?, ?, 0, ?)`
    )
    .run(
      input.symbol.toUpperCase(),
      input.companyName,
      input.sector ?? null,
      input.industry ?? null,
      Date.now()
    )
  const row = db
    .prepare<[number], TickerRow>(`SELECT * FROM tickers WHERE id = ?`)
    .get(info.lastInsertRowid as number)!
  return toTicker(row)
}
