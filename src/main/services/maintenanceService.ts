import { getDb } from '../database/connection'
import { purgeOlderThan } from '../database/articles'
import { purgeOldNotifications } from '../database/notificationLog'
import { purgeRoutineFilings } from '../database/secFilings'
import { purgeStaleReaderCache } from './readerService'
import { purgeStaleSmartLookups } from './smartLookupService'

// Retention: keep 30 days of non-bookmarked articles. Matches the product spec
// ("purge articles older than 30 days unless bookmarked").
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

// SEC boilerplate (Form 4/3/5/144/424B2/424B5/FWP) is kept only 90 days.
// refreshFilings upserts SEC's whole "recent" page per symbol per day and
// nothing ever deleted, so the table grew unbounded — 411k rows and ~65 MB
// of a 113 MB database on the live copy, 55% of it more than three years
// old, against an app that never reads past the top 25 per ticker.
// Material forms are exempt and kept indefinitely.
const FILINGS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

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
  // Notification log keeps dedup state. 30 days is plenty — events older
  // than a month won't realistically re-fire under any current identity
  // scheme (article ids are monotonic, dates roll over, game ids unique).
  let notificationsDeleted = 0
  try {
    notificationsDeleted = purgeOldNotifications(cutoff)
  } catch (err) {
    console.warn(
      '[maintenance] purgeOldNotifications failed:',
      err instanceof Error ? err.message : err
    )
  }
  let filingsDeleted = 0
  try {
    filingsDeleted = purgeRoutineFilings(Date.now() - FILINGS_RETENTION_MS)
  } catch (err) {
    console.warn(
      '[maintenance] purgeRoutineFilings failed:',
      err instanceof Error ? err.message : err
    )
  }
  const totalDeleted =
    deleted + readerDeleted + lookupDeleted + notificationsDeleted + filingsDeleted
  if (totalDeleted >= VACUUM_THRESHOLD) {
    try {
      // VACUUM can't run inside a transaction and takes an exclusive lock, but
      // maintenance runs off the hot path so the brief stall is fine.
      getDb().exec('VACUUM')
    } catch (err) {
      console.warn('[maintenance] VACUUM failed:', err instanceof Error ? err.message : err)
    }
  }
  // Always log, even on a no-op run. This purge silently destroys the news
  // corpus by design (articles are unrecoverable once gone — RSS only serves
  // a recent window), so "did maintenance run, and what did it take" needs to
  // be answerable from the log rather than inferred from row counts after the
  // fact. The archived count confirms articles_archive (v54) is keeping up.
  let archived = 0
  try {
    archived =
      getDb()
        .prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM articles_archive`)
        .get()?.n ?? 0
  } catch {
    // Pre-v54 databases won't have the table; not worth failing maintenance over.
  }
  console.log(
    `[maintenance] purged ${deleted} articles, ${readerDeleted} reader cache, ` +
      `${lookupDeleted} smart lookups, ${notificationsDeleted} notifications, ` +
      `${filingsDeleted} routine filings` +
      (totalDeleted >= VACUUM_THRESHOLD ? ' (vacuumed)' : '') +
      ` — articles_archive holds ${archived}`
  )
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
