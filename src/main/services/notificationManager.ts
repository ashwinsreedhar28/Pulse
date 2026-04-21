import { BrowserWindow, Notification } from 'electron'
import { getPreferences } from '../database/preferences'

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
let showMainWindowFn: (() => void) | null = null

export function setWindowOpener(fn: () => void): void {
  showMainWindowFn = fn
}

function broadcastOpen(articleId: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('articles:open', articleId)
  }
}

function isInQuietHours(): boolean {
  try {
    const prefs = getPreferences()
    if (!prefs.quietHoursEnabled) return false
    const now = new Date()
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const start = prefs.quietHoursStart
    const end = prefs.quietHoursEnd
    if (start <= end) return hhmm >= start && hhmm < end
    return hhmm >= start || hhmm < end
  } catch {
    return false
  }
}

export function notifyUrgent(p: UrgentPayload): void {
  if (!Notification.isSupported() || isInQuietHours()) return
  const summary = p.summary?.replace(/\s+/g, ' ').trim()
  const body = summary
    ? summary.length > 240
      ? `${summary.slice(0, 237)}…`
      : summary
    : p.urgencyReason?.trim() ?? ''
  const notif = new Notification({
    title: p.title,
    subtitle: p.feedTitle,
    body
  })
  notif.on('click', () => {
    showMainWindowFn?.()
    broadcastOpen(p.articleId)
  })
  notif.show()
}

export function trackMedium(item: DigestItem): void {
  digestQueue.push(item)
}

function flushDigest(): void {
  if (digestQueue.length === 0 || !Notification.isSupported() || isInQuietHours()) return
  const items = digestQueue
  digestQueue = []
  const byFeed = new Map<string, number>()
  for (const it of items) byFeed.set(it.feedTitle, (byFeed.get(it.feedTitle) ?? 0) + 1)
  const top = [...byFeed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const body = top.map(([feed, count]) => `${count} from ${feed}`).join(', ')
  const n = items.length
  const notif = new Notification({
    title: `Pulse: ${n} new ${n === 1 ? 'story' : 'stories'} to review`,
    body: body || undefined,
    silent: true
  })
  notif.on('click', () => showMainWindowFn?.())
  notif.show()
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
