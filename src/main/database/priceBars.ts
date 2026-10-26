// Daily OHLCV bars (api.nasdaq.com historical, split-adjusted, not dividend-
// adjusted) and Timestral price forecasts (migration v65). Filled by
// priceForecastService; one forecast row per (symbol, targetDay, target, config).
import { getDb } from './connection'

export interface Bar {
  day: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
}

export function upsertBars(symbol: string, bars: Bar[]): number {
  if (bars.length === 0) return 0
  const db = getDb()
  const now = Date.now()
  const stmt = db.prepare(
    `INSERT INTO price_bars_daily (symbol, day, open, high, low, close, volume, fetchedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol, day) DO UPDATE SET
       open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close,
       volume = excluded.volume, fetchedAt = excluded.fetchedAt`
  )
  const tx = db.transaction((rows: Bar[]) => {
    for (const b of rows) stmt.run(symbol.toUpperCase(), b.day, b.open, b.high, b.low, b.close, b.volume, now)
  })
  tx(bars)
  return bars.length
}

export function getBars(symbol: string): Bar[] {
  return getDb()
    .prepare(
      `SELECT day, open, high, low, close, volume FROM price_bars_daily WHERE symbol = ? ORDER BY day ASC`
    )
    .all(symbol.toUpperCase()) as Bar[]
}

export function barsFetchedAt(symbol: string): number | null {
  const row = getDb()
    .prepare(`SELECT MAX(fetchedAt) AS at FROM price_bars_daily WHERE symbol = ?`)
    .get(symbol.toUpperCase()) as { at: number | null } | undefined
  return row?.at ?? null
}

export interface PriceForecastRow {
  targetDay: string
  target: string
  config: string
  quantiles: number[]
  levels: number[]
}

export function upsertPriceForecasts(symbol: string, rows: PriceForecastRow[]): void {
  if (rows.length === 0) return
  const db = getDb()
  const now = Date.now()
  const stmt = db.prepare(
    `INSERT INTO price_forecasts (symbol, targetDay, target, config, quantiles, levels, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol, targetDay, target, config) DO UPDATE SET
       quantiles = excluded.quantiles, levels = excluded.levels, createdAt = excluded.createdAt`
  )
  const tx = db.transaction((batch: PriceForecastRow[]) => {
    for (const r of batch)
      stmt.run(symbol.toUpperCase(), r.targetDay, r.target, r.config, JSON.stringify(r.quantiles), JSON.stringify(r.levels), now)
  })
  tx(rows)
}

export function getPriceForecasts(
  symbol: string,
  target: string,
  config: string,
  fromDay: string,
  toDay: string
): Map<string, { quantiles: number[]; levels: number[] }> {
  const rows = getDb()
    .prepare(
      `SELECT targetDay, quantiles, levels FROM price_forecasts
       WHERE symbol = ? AND target = ? AND config = ? AND targetDay >= ? AND targetDay <= ?`
    )
    .all(symbol.toUpperCase(), target, config, fromDay, toDay) as Array<{ targetDay: string; quantiles: string; levels: string }>
  const out = new Map<string, { quantiles: number[]; levels: number[] }>()
  for (const r of rows) out.set(r.targetDay, { quantiles: JSON.parse(r.quantiles), levels: JSON.parse(r.levels) })
  return out
}

export function getBarsSince(symbol: string, fromDay: string): Bar[] {
  return getDb()
    .prepare(
      `SELECT day, open, high, low, close, volume FROM price_bars_daily WHERE symbol = ? AND day >= ? ORDER BY day ASC`
    )
    .all(symbol.toUpperCase(), fromDay) as Bar[]
}

// ---- Forward forecast log (migration v66) ----
// One row per forecast made BEFORE its target session opened, written once and
// never revised (INSERT OR IGNORE), so the scorecard is a live track record.
export interface ForecastLogRow {
  symbol: string
  targetDay: string
  horizon: number
  target: 'lnV' | 'absr' | 'lnC'
  method: string
  asOfDay: string
  madeAt: number
  quantiles: number[]
  levels: number[]
}

export function logForecasts(rows: Omit<ForecastLogRow, 'madeAt'>[]): number {
  if (rows.length === 0) return 0
  const db = getDb()
  const now = Date.now()
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO forecast_log (symbol, targetDay, horizon, target, method, asOfDay, madeAt, quantiles, levels)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let n = 0
  const tx = db.transaction((batch: Omit<ForecastLogRow, 'madeAt'>[]) => {
    for (const r of batch) {
      if (!r.quantiles.every((v) => Number.isFinite(v))) continue
      n += stmt.run(r.symbol.toUpperCase(), r.targetDay, r.horizon, r.target, r.method, r.asOfDay, now,
        JSON.stringify(r.quantiles.map((v) => Math.round(v * 1e5) / 1e5)), JSON.stringify(r.levels)).changes
    }
  })
  tx(rows)
  return n
}

export function hasLoggedSession(symbol: string, targetDay: string): boolean {
  return !!getDb()
    .prepare(`SELECT 1 FROM forecast_log WHERE symbol = ? AND targetDay = ? AND horizon = 1 AND target = 'lnV' LIMIT 1`)
    .get(symbol.toUpperCase(), targetDay)
}

export function getForecastLog(): ForecastLogRow[] {
  const rows = getDb()
    .prepare(`SELECT symbol, targetDay, horizon, target, method, asOfDay, madeAt, quantiles, levels FROM forecast_log`)
    .all() as Array<Omit<ForecastLogRow, 'quantiles' | 'levels'> & { quantiles: string; levels: string }>
  return rows.map((r) => ({ ...r, quantiles: JSON.parse(r.quantiles), levels: JSON.parse(r.levels) }))
}
