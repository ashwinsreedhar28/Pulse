import { getDb } from '../database/connection'
import { purgeOlderThan } from '../database/articles'
import { purgeStaleReaderCache } from './readerService'
import { purgeStaleSmartLookups } from './smartLookupService'

// Retention: keep 30 days of non-bookmarked articles. Matches the product spec
// ("purge articles older than 30 days unless bookmarked").
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

// Run daily after the first initial delay, not immediately at boot — the
// startup path is already busy with feed polls, stock refresh, and model warm.
const INITIAL_DELAY_MS = 10 * 60 * 1000
const INTERVAL_MS = 24 * 60 * 60 * 1000

// VACUUM reclaims freelist pages so the .db file actually shrinks after a
// large purge. Skip it when almost nothing was deleted — VACUUM rewrites the
// whole file and is overkill for small churn.
const VACUUM_THRESHOLD = 200

let timer: ReturnType<typeof setInterval> | null = null
let initialTimer: ReturnType<typeof setTimeout> | null = null

export function runMaintenance(): void {
  const cutoff = Date.now() - RETENTION_MS
  let deleted = 0
  try {
    deleted = purgeOlderThan(cutoff)
  } catch (err) {
    console.warn('[maintenance] purgeOlderThan failed:', err instanceof Error ? err.message : err)
  }
  const readerDeleted = purgeStaleReaderCache()
  const lookupDeleted = purgeStaleSmartLookups()
  const totalDeleted = deleted + readerDeleted + lookupDeleted
  if (totalDeleted >= VACUUM_THRESHOLD) {
    try {
      // VACUUM can't run inside a transaction and takes an exclusive lock, but
      // maintenance runs off the hot path so the brief stall is fine.
      getDb().exec('VACUUM')
    } catch (err) {
      console.warn('[maintenance] VACUUM failed:', err instanceof Error ? err.message : err)
    }
  }
  if (totalDeleted > 0) {
    console.log(
      `[maintenance] purged ${deleted} articles, ${readerDeleted} reader cache, ${lookupDeleted} smart lookups` +
        (totalDeleted >= VACUUM_THRESHOLD ? ' (vacuumed)' : '')
    )
  }
}

export function startMaintenanceSchedule(): void {
  stopMaintenanceSchedule()
  initialTimer = setTimeout(() => {
    runMaintenance()
    timer = setInterval(runMaintenance, INTERVAL_MS)
  }, INITIAL_DELAY_MS)
}

export function stopMaintenanceSchedule(): void {
  if (initialTimer) {
    clearTimeout(initialTimer)
    initialTimer = null
  }
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
