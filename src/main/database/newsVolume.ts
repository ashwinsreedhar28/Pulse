// Daily news volume per ticker (migration v64). Source 'gdelt_gkg' is GDELT
// GKG org-tag document counts per UTC day, fetched by newsVolumeService.
import { getDb } from './connection'

export const GKG_SOURCE = 'gdelt_gkg'

export interface NewsVolumeRow {
  symbol: string
  day: string
  count: number
  norm: number | null
}

export interface NewsVolumePoint {
  day: string
  count: number
  norm: number | null
}

// Upsert, not insert-or-ignore: GDELT keeps adding docs to a day for a while
// after it ends, so the service re-fetches the last few days and overwrites.
export function upsertNewsVolume(source: string, rows: NewsVolumeRow[]): number {
  if (rows.length === 0) return 0
  const db = getDb()
  const now = Date.now()
  const stmt = db.prepare(
    `INSERT INTO news_volume_daily (source, symbol, day, count, norm, fetchedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, symbol, day) DO UPDATE SET
       count = excluded.count, norm = excluded.norm, fetchedAt = excluded.fetchedAt`
  )
  const tx = db.transaction((batch: NewsVolumeRow[]) => {
    for (const r of batch) stmt.run(source, r.symbol.toUpperCase(), r.day, r.count, r.norm, now)
  })
  tx(rows)
  return rows.length
}

export function newsVolumeLastDay(source: string): string | null {
  const row = getDb()
    .prepare<[string], { d: string | null }>(`SELECT MAX(day) AS d FROM news_volume_daily WHERE source = ?`)
    .get(source)
  return row?.d ?? null
}

export function newsVolumeSymbols(source: string): string[] {
  return getDb()
    .prepare<[string], { symbol: string }>(`SELECT DISTINCT symbol FROM news_volume_daily WHERE source = ?`)
    .all(source)
    .map((r) => r.symbol)
}

export function getNewsVolumeSeries(source: string, symbol: string, fromDay: string): NewsVolumePoint[] {
  return getDb()
    .prepare<[string, string, string], NewsVolumePoint>(
      `SELECT day, count, norm FROM news_volume_daily
        WHERE source = ? AND symbol = ? AND day >= ?
        ORDER BY day ASC`
    )
    .all(source, symbol.toUpperCase(), fromDay)
}

export interface NewsVolumeForecastRow {
  symbol: string
  targetDay: string
  model: string
  quantiles: number[]
  levels: number[]
}

export function upsertNewsVolumeForecasts(source: string, rows: NewsVolumeForecastRow[]): number {
  if (rows.length === 0) return 0
  const db = getDb()
  const now = Date.now()
  const stmt = db.prepare(
    `INSERT INTO news_volume_forecasts (source, symbol, targetDay, model, quantiles, levels, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, symbol, targetDay, model) DO UPDATE SET
       quantiles = excluded.quantiles, levels = excluded.levels, createdAt = excluded.createdAt`
  )
  const tx = db.transaction((batch: NewsVolumeForecastRow[]) => {
    for (const r of batch) {
      stmt.run(source, r.symbol.toUpperCase(), r.targetDay, r.model, JSON.stringify(r.quantiles), JSON.stringify(r.levels), now)
    }
  })
  tx(rows)
  return rows.length
}

export function forecastSymbolsFor(source: string, targetDay: string, model: string): Set<string> {
  return new Set(
    getDb()
      .prepare<[string, string, string], { symbol: string }>(
        `SELECT symbol FROM news_volume_forecasts WHERE source = ? AND targetDay = ? AND model = ?`
      )
      .all(source, targetDay, model)
      .map((r) => r.symbol)
  )
}

export function getNewsVolumeForecasts(
  source: string,
  targetDay: string,
  model: string
): Map<string, { quantiles: number[]; levels: number[]; createdAt: number }> {
  const rows = getDb()
    .prepare<[string, string, string], { symbol: string; quantiles: string; levels: string; createdAt: number }>(
      `SELECT symbol, quantiles, levels, createdAt FROM news_volume_forecasts
        WHERE source = ? AND targetDay = ? AND model = ?`
    )
    .all(source, targetDay, model)
  const out = new Map<string, { quantiles: number[]; levels: number[]; createdAt: number }>()
  for (const r of rows) {
    out.set(r.symbol, { quantiles: JSON.parse(r.quantiles), levels: JSON.parse(r.levels), createdAt: r.createdAt })
  }
  return out
}

// symbol -> day -> count over [fromDay, toDay], for many symbols in one query.
export function getNewsVolumeMatrix(
  source: string,
  symbols: string[],
  fromDay: string,
  toDay: string
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  if (symbols.length === 0) return out
  const rows = getDb()
    .prepare<string[], { symbol: string; day: string; count: number }>(
      `SELECT symbol, day, count FROM news_volume_daily
        WHERE source = ? AND day >= ? AND day <= ?
          AND symbol IN (${symbols.map(() => '?').join(',')})`
    )
    .all(source, fromDay, toDay, ...symbols.map((s) => s.toUpperCase()))
  for (const r of rows) {
    let m = out.get(r.symbol)
    if (!m) out.set(r.symbol, (m = new Map()))
    m.set(r.day, r.count)
  }
  return out
}

export function getSymbolForecasts(
  source: string,
  symbol: string,
  model: string,
  fromDay: string,
  toDay: string
): Map<string, { quantiles: number[]; levels: number[] }> {
  const rows = getDb()
    .prepare<[string, string, string, string, string], { targetDay: string; quantiles: string; levels: string }>(
      `SELECT targetDay, quantiles, levels FROM news_volume_forecasts
        WHERE source = ? AND symbol = ? AND model = ? AND targetDay >= ? AND targetDay <= ?`
    )
    .all(source, symbol.toUpperCase(), model, fromDay, toDay)
  return new Map(rows.map((r) => [r.targetDay, { quantiles: JSON.parse(r.quantiles), levels: JSON.parse(r.levels) }]))
}
