// Central log of every OS notification dispatched. Powers two things:
//   1. Cross-source dedup — identityKey is unique per event, so any source
//      (feedPoller, stocksScheduler, sportsAlerts, etc.) calls
//      dispatchNotification with a stable key and the central service
//      short-circuits if we've already notified about this event. Solves
//      the "same article notified twice" bug and prevents spurious
//      duplicates when (say) an 8-K notification and a "AAPL +5%"
//      notification are fired by different sources for the same earnings
//      event.
//   2. Daily throughput cap — count rows where sentAt is within the last
//      24 hours. When we're at the cap, dispatchNotification returns
//      'capped' and the source can decide whether to defer or drop.
//
// Schema is migration v42.

import { getDb } from './connection'

export type NotificationCategory =
  | 'article'
  | 'stock'
  | 'sport'
  | 'filing'
  | 'macro'
  | 'analyst'
  | 'digest'

export interface NotificationLogEntry {
  category: NotificationCategory
  identityKey: string
  sentAt: number
  payloadJson: string | null
}

// Returns the existing entry when a notification for (category, identityKey)
// has already been logged. Used by dispatchNotification to short-circuit
// before firing the OS notification. Cheap indexed lookup on the PK.
export function findLogEntry(
  category: NotificationCategory,
  identityKey: string
): NotificationLogEntry | null {
  const row = getDb()
    .prepare<[string, string], NotificationLogEntry>(
      `SELECT category, identityKey, sentAt, payloadJson
         FROM notification_log
        WHERE category = ? AND identityKey = ?`
    )
    .get(category, identityKey)
  return row ?? null
}

export interface InsertLogInput {
  category: NotificationCategory
  identityKey: string
  payloadJson?: string | null
}

// Records that a notification was successfully dispatched. ON CONFLICT
// updates the timestamp so a re-dispatched event (same identityKey) keeps
// the lastSentAt fresh — useful if a future "notify only when stale" flow
// wants to re-fire after some window.
export function recordLogEntry(input: InsertLogInput): void {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO notification_log (category, identityKey, sentAt, payloadJson)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(category, identityKey) DO UPDATE SET
         sentAt = excluded.sentAt,
         payloadJson = excluded.payloadJson`
    )
    .run(input.category, input.identityKey, now, input.payloadJson ?? null)
}

// Count rows fired in the trailing window. Default 24h drives the daily
// cap; smaller windows (e.g., 60 min) drive the per-category burst checks
// in Phase 2 (don't fire 5 stock alerts in the same minute).
export function countRecentNotifications(sinceMs: number): number {
  const row = getDb()
    .prepare<[number], { c: number }>(
      `SELECT COUNT(*) AS c FROM notification_log WHERE sentAt >= ?`
    )
    .get(sinceMs)
  return row?.c ?? 0
}

// Per-category count, used by the future per-category-cap check. Phase 1
// only enforces the global cap, but having this here means Phase 2 doesn't
// need a schema change to add finer-grained throttles.
export function countRecentByCategory(
  category: NotificationCategory,
  sinceMs: number
): number {
  const row = getDb()
    .prepare<[string, number], { c: number }>(
      `SELECT COUNT(*) AS c FROM notification_log
        WHERE category = ? AND sentAt >= ?`
    )
    .get(category, sinceMs)
  return row?.c ?? 0
}

// Garbage-collect old rows during the daily maintenance pass. Kept rows
// older than 30 days serve no dedup purpose (events older than a month
// won't fire again under any reasonable identity scheme).
export function purgeOldNotifications(cutoffMs: number): number {
  const info = getDb()
    .prepare(`DELETE FROM notification_log WHERE sentAt < ?`)
    .run(cutoffMs)
  return info.changes
}
