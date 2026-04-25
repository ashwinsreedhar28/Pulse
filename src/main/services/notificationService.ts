// Central notification dispatcher. Every source that wants to fire an OS
// notification — feedPoller for breaking articles, stocksScheduler for
// price moves, sportsAlerts for game events, secFilings for new 8-Ks, etc.
// — calls dispatchNotification with a NotificationCandidate. The service
// applies (in order):
//
//   1. Per-category enable check — user toggle in Settings. No-op if off.
//   2. Cross-source dedup via notification_log (category + identityKey).
//      Solves the "same article notified twice" bug AND prevents two
//      sources from firing for the same logical event.
//   3. Quiet-hours suppression (urgent importance overrides).
//   4. Daily throughput cap (default 5/day from preferences).
//   5. OS notification fire + click-action wiring + log entry insert.
//
// Returns a typed result so callers can log/branch on dispatch outcome.

import path from 'node:path'
import { app, BrowserWindow, Notification, nativeImage, shell } from 'electron'

import {
  countRecentNotifications,
  findLogEntry,
  recordLogEntry,
  type NotificationCategory
} from '../database/notificationLog'
import { getPreferences } from '../database/preferences'

// Click-routing payload — opens the right place inside Pulse when the user
// clicks the OS notification. Sources hand us a structured action; the
// dispatcher wires it onto the Notification's click event.
//
// Shape note: 'game' carries the full SportsGameOpenPayload (leagueId,
// leaguePath, eventId) because the renderer's existing onOpenGame
// subscriber expects that object — passing a bare gameId would break
// when consumed.
export type NotificationClickAction =
  | { kind: 'article'; articleId: number }
  | { kind: 'symbol'; symbol: string }
  | { kind: 'game'; payload: { leagueId: string; leaguePath: string; eventId: string } }
  | { kind: 'url'; url: string }
  | { kind: 'route'; route: 'stocks' | 'sports' | 'home' }
  | null

export interface NotificationCandidate {
  category: NotificationCategory
  // Stable identity for cross-source dedup. Shape conventions documented
  // in migration v42. Examples: 'article:42', 'stock-daily:AAPL:2026-04-25',
  // 'sport-hr:NYY-LAA-2026-04-25:event-12'.
  identityKey: string
  title: string
  body: string
  subtitle?: string
  // 'urgent' bypasses quiet hours; 'normal' suppresses during quiet hours.
  // Articles default to normal, breaking-news high-urgency to urgent,
  // sports goals to urgent, FOMC to urgent, daily-move to normal.
  importance?: 'normal' | 'urgent'
  // Where the notification routes when clicked. null = open the main
  // window with no further action.
  clickAction?: NotificationClickAction
  // Force silent (no sound). Used for digest-style notifications.
  silent?: boolean
}

export type DispatchOutcome =
  | { ok: true }
  | { ok: false; reason: 'category-disabled' | 'duplicate' | 'quiet-hours' | 'capped' | 'unsupported' }

let showMainWindowFn: (() => void) | null = null

export function setNotificationWindowOpener(fn: () => void): void {
  showMainWindowFn = fn
}

// Resolved at first call so we don't pay path lookup on every dispatch.
// In dev (running unpackaged) electron's app icon defaults to the Electron
// logo — passing icon to Notification adds it as the contentImage on
// macOS. Real app icon needs Stage 13 packaging with a .icns.
let cachedIcon: Electron.NativeImage | null = null
function resolveIcon(): Electron.NativeImage | null {
  if (cachedIcon) return cachedIcon
  try {
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icons', 'appIcon.png')
      : path.join(app.getAppPath(), 'resources', 'icons', 'appIcon.png')
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) {
      cachedIcon = img
      return img
    }
  } catch {
    /* fall through — notification fires without an icon */
  }
  return null
}

type Prefs = ReturnType<typeof getPreferences>

function isInQuietHours(prefs: Prefs): boolean {
  if (!prefs.quietHoursEnabled) return false
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const start = prefs.quietHoursStart
  const end = prefs.quietHoursEnd
  if (start <= end) return hhmm >= start && hhmm < end
  return hhmm >= start || hhmm < end
}

function isCategoryEnabled(prefs: Prefs, category: NotificationCategory): boolean {
  switch (category) {
    case 'article':
    case 'digest':
      return prefs.notifyArticlesEnabled
    case 'stock':
    case 'analyst':
      return prefs.notifyStocksEnabled
    case 'sport':
      return prefs.notifySportsEnabled
    case 'filing':
      return prefs.notifyFilingsEnabled
    case 'macro':
      return prefs.notifyMacroEnabled
    default:
      return true
  }
}

// Wire a click handler onto the Notification that routes the user to the
// right place inside Pulse. broadcasts use the same channels existing
// click-routing already listens on (articles:open, etc.) so this stays
// drop-in compatible with the renderer's open handlers.
function attachClickHandler(notif: Notification, action: NotificationClickAction): void {
  notif.on('click', () => {
    showMainWindowFn?.()
    if (!action) return
    switch (action.kind) {
      case 'article': {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send('articles:open', action.articleId)
        }
        return
      }
      case 'symbol': {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send('stocks:openSymbol', action.symbol)
        }
        return
      }
      case 'game': {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send('sports:openGame', action.payload)
        }
        return
      }
      case 'url': {
        // Strict http/https check — bare startsWith('http') would accept
        // 'httpfoo://...' which shell.openExternal would happily launch.
        if (/^https?:\/\//i.test(action.url)) void shell.openExternal(action.url)
        return
      }
      case 'route': {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send('app:navigate', action.route)
        }
        return
      }
    }
  })
}

export function dispatchNotification(candidate: NotificationCandidate): DispatchOutcome {
  if (!Notification.isSupported()) return { ok: false, reason: 'unsupported' }
  // Read preferences ONCE per dispatch and thread the value into helpers.
  // Each getPreferences() call runs `SELECT key, value FROM preferences`
  // (~25 rows) and rebuilds a Map; previously we paid this 2-3× per call
  // (category check, quiet-hours check, cap check). On a feed-poll cycle
  // promoting 20 articles that's 60+ SELECT-all-prefs queries in a burst.
  let prefs: Prefs
  try {
    prefs = getPreferences()
  } catch {
    return { ok: false, reason: 'unsupported' }
  }
  if (!isCategoryEnabled(prefs, candidate.category)) {
    return { ok: false, reason: 'category-disabled' }
  }

  // Dedup: if we've already fired for this (category, identityKey), bail.
  // The whole point of identityKey is that it's stable across re-runs of
  // a source — feedPoller re-promoting an article, stocksScheduler ticking
  // again, etc. — so the user sees one notification per logical event.
  if (findLogEntry(candidate.category, candidate.identityKey)) {
    return { ok: false, reason: 'duplicate' }
  }

  const importance = candidate.importance ?? 'normal'
  if (importance === 'normal' && isInQuietHours(prefs)) {
    return { ok: false, reason: 'quiet-hours' }
  }

  // Daily cap check. Counted across ALL categories so a price-action heavy
  // day doesn't drown out news, and vice versa. 0 = notifications fully
  // disabled (preferences clamp this 0..50).
  if (prefs.notificationDailyCap <= 0) {
    return { ok: false, reason: 'capped' }
  }
  const since = Date.now() - 24 * 60 * 60 * 1000
  if (countRecentNotifications(since) >= prefs.notificationDailyCap) {
    return { ok: false, reason: 'capped' }
  }

  const icon = resolveIcon()
  const notif = new Notification({
    title: candidate.title,
    body: candidate.body,
    subtitle: candidate.subtitle,
    silent: candidate.silent ?? false,
    icon: icon ?? undefined
  })
  attachClickHandler(notif, candidate.clickAction ?? null)
  notif.show()

  recordLogEntry({
    category: candidate.category,
    identityKey: candidate.identityKey,
    payloadJson: JSON.stringify({
      title: candidate.title,
      body: candidate.body,
      subtitle: candidate.subtitle,
      importance,
      clickAction: candidate.clickAction ?? null
    })
  })
  return { ok: true }
}
