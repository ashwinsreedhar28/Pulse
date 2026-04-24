// FRED observation cache + per-series metadata. Schema lives in migration v38;
// this module owns the read/write API.
//
// Observations are append-only-ish: FRED occasionally revises older values
// (a flash inflation print gets restated next month), so upsert on the
// composite PK (seriesId, observationDate) handles both fresh and revised
// data without a delete pass.

import { getDb } from './connection'

export interface FredObservation {
  observationDate: string // 'YYYY-MM-DD' (FRED's native format)
  value: number | null // null for missing observations (FRED uses '.' for these)
}

export interface FredSeriesMeta {
  seriesId: string
  title: string | null
  units: string | null
  frequency: string | null
  lastFetchedAt: number
  lastObservationDate: string | null
  fetchError: string | null
}

export function upsertObservations(seriesId: string, observations: FredObservation[]): number {
  if (observations.length === 0) return 0
  const stmt = getDb().prepare(
    `INSERT INTO fred_observations (seriesId, observationDate, value)
     VALUES (?, ?, ?)
     ON CONFLICT(seriesId, observationDate) DO UPDATE SET value = excluded.value`
  )
  const tx = getDb().transaction((rows: FredObservation[]) => {
    let count = 0
    for (const obs of rows) {
      stmt.run(seriesId, obs.observationDate, obs.value)
      count += 1
    }
    return count
  })
  return tx(observations)
}

export function getObservations(seriesId: string, limit = 240): FredObservation[] {
  return getDb()
    .prepare<[string, number], { observationDate: string; value: number | null }>(
      `SELECT observationDate, value FROM fred_observations
        WHERE seriesId = ?
        ORDER BY observationDate DESC
        LIMIT ?`
    )
    .all(seriesId, limit)
    .reverse() // back to oldest-first for sparkline rendering
}

export function setSeriesMeta(meta: FredSeriesMeta): void {
  getDb()
    .prepare(
      `INSERT INTO fred_series_meta
         (seriesId, title, units, frequency, lastFetchedAt, lastObservationDate, fetchError)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(seriesId) DO UPDATE SET
         title = COALESCE(excluded.title, fred_series_meta.title),
         units = COALESCE(excluded.units, fred_series_meta.units),
         frequency = COALESCE(excluded.frequency, fred_series_meta.frequency),
         lastFetchedAt = excluded.lastFetchedAt,
         lastObservationDate = excluded.lastObservationDate,
         fetchError = excluded.fetchError`
    )
    .run(
      meta.seriesId,
      meta.title,
      meta.units,
      meta.frequency,
      meta.lastFetchedAt,
      meta.lastObservationDate,
      meta.fetchError
    )
}

export function getSeriesMeta(seriesId: string): FredSeriesMeta | null {
  const row = getDb()
    .prepare<
      [string],
      {
        seriesId: string
        title: string | null
        units: string | null
        frequency: string | null
        lastFetchedAt: number
        lastObservationDate: string | null
        fetchError: string | null
      }
    >(
      `SELECT seriesId, title, units, frequency, lastFetchedAt, lastObservationDate, fetchError
         FROM fred_series_meta WHERE seriesId = ?`
    )
    .get(seriesId)
  return row ?? null
}

export function getAllSeriesMeta(): FredSeriesMeta[] {
  return getDb()
    .prepare<
      [],
      {
        seriesId: string
        title: string | null
        units: string | null
        frequency: string | null
        lastFetchedAt: number
        lastObservationDate: string | null
        fetchError: string | null
      }
    >(
      `SELECT seriesId, title, units, frequency, lastFetchedAt, lastObservationDate, fetchError
         FROM fred_series_meta`
    )
    .all()
}
