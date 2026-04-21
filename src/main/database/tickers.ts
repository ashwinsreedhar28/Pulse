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
