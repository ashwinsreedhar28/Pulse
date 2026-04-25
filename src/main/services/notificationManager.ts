// Article-specific notification helpers. Wraps the central
// notificationService so existing call sites (feedPoller, etc.) stay drop-
// in compatible while gaining cross-source dedup, the daily cap, and
// click-routing through the central path.
//
// Two surfaces remain:
//   - notifyUrgent(p): fires immediately for high-urgency articles
//     (single-article notification; identityKey = `article:<id>` so
//     re-promoting the same article is now a no-op)
//   - trackMedium / startDigestTimer: buffered "N new stories" digest

import { getPreferences } from '../database/preferences'
import {
  dispatchNotification,
  setNotificationWindowOpener
} from './notificationService'

export interface UrgentPayload {
  articleId: number
  title: string
  summary: string | null
  feedTitle: string
  urgencyReason: string | null
}

export interface DigestItem {
  articleId: number
  title: string
  feedTitle: string
}

let digestQueue: DigestItem[] = []
let digestInterval: NodeJS.Timeout | null = null

// Re-export the central setter so the existing main/index.ts wiring keeps
// working. The notificationService is the source of truth for the show-
// main-window callback now.
export function setWindowOpener(fn: () => void): void {
  setNotificationWindowOpener(fn)
}

export function notifyUrgent(p: UrgentPayload): void {
  const summary = p.summary?.replace(/\s+/g, ' ').trim()
  const body = summary
    ? summary.length > 240
      ? `${summary.slice(0, 237)}…`
      : summary
    : (p.urgencyReason?.trim() ?? '')
  dispatchNotification({
    category: 'article',
    identityKey: `article:${p.articleId}`,
    title: p.title,
    body,
    subtitle: p.feedTitle,
    importance: 'urgent',
    clickAction: { kind: 'article', articleId: p.articleId }
  })
}

export function trackMedium(item: DigestItem): void {
  digestQueue.push(item)
}

function flushDigest(): void {
  if (digestQueue.length === 0) return
  const items = digestQueue
  digestQueue = []
  const byFeed = new Map<string, number>()
  for (const it of items) byFeed.set(it.feedTitle, (byFeed.get(it.feedTitle) ?? 0) + 1)
  const top = [...byFeed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const body = top.map(([feed, count]) => `${count} from ${feed}`).join(', ')
  const n = items.length
  // Digest identityKey is keyed by the half-hour bucket so two flushes
  // close together don't both fire (rare but possible if the digest timer
  // is reset). Coarse bucket: floor(now / interval).
  const prefs = getPreferences()
  const intervalMs = (prefs.digestIntervalMin ?? 30) * 60 * 1000
  const bucket = Math.floor(Date.now() / Math.max(intervalMs, 60_000))
  dispatchNotification({
    category: 'digest',
    identityKey: `digest:${bucket}`,
    title: `Pulse: ${n} new ${n === 1 ? 'story' : 'stories'} to review`,
    body: body || '',
    importance: 'normal',
    silent: true,
    clickAction: { kind: 'route', route: 'home' }
  })
}

export function startDigestTimer(intervalMs = 30 * 60 * 1000): void {
  stopDigestTimer()
  digestInterval = setInterval(flushDigest, intervalMs)
}

export function stopDigestTimer(): void {
  if (digestInterval) {
    clearInterval(digestInterval)
    digestInterval = null
  }
}
