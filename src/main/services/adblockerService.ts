import { app, session, webContents } from 'electron'
import { ElectronBlocker } from '@ghostery/adblocker-electron'

export const WEBVIEW_PARTITION = 'persist:webview'
export const YOUTUBE_PARTITION = 'persist:youtube'

let blocker: ElectronBlocker | null = null
const hookedSessions = new WeakSet<Electron.Session>()
const pendingSessions = new Set<Electron.Session>()
const hardenedSessions = new WeakSet<Electron.Session>()

function hookSession(sess: Electron.Session): void {
  if (hookedSessions.has(sess)) return
  if (!blocker) {
    pendingSessions.add(sess)
    return
  }
  try {
    blocker.enableBlockingInSession(sess)
  } catch {
    // Electron < 33 lacks session.registerPreloadScript for cosmetic filters.
    // Fall back to network-only blocking (onBeforeRequest + onHeadersReceived).
    const b = blocker
    sess.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
      b.onHeadersReceived(details, callback)
    })
    sess.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      b.onBeforeRequest(details, callback)
    })
  }
  hookedSessions.add(sess)
}

// Deny every web-facing permission on untrusted webview sessions. The app never
// needs notifications/geo/media/etc. from an embedded article page, so no prompt
// should ever be surfaced to the user.
function hardenSession(sess: Electron.Session): void {
  if (hardenedSessions.has(sess)) return
  sess.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  sess.setPermissionCheckHandler(() => false)
  hardenedSessions.add(sess)
}

export function registerAdblockerHooks(): void {
  // Register synchronously at app-ready so no webview escapes the net
  // while the filter list is still downloading on first launch.
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      hookSession(contents.session)
      hardenSession(contents.session)
    }
    // Strip risky webPreferences before any <webview> attaches. Our code never
    // sets these, but this prevents a future regression (or injected markup) from
    // opting a webview into nodeIntegration / a preload script.
    contents.on('will-attach-webview', (_e, webPreferences, params) => {
      delete webPreferences.preload
      webPreferences.nodeIntegration = false
      webPreferences.nodeIntegrationInSubFrames = false
      webPreferences.contextIsolation = true
      webPreferences.webSecurity = true
      webPreferences.allowRunningInsecureContent = false
      // Only allow http(s) sources. Blocks file://, data:, etc.
      const src = params.src ?? ''
      if (!/^https?:\/\//i.test(src)) {
        // Setting src to about:blank is the documented way to veto an attach.
        params.src = 'about:blank'
      }
    })
  })
}

export async function initAdblocker(): Promise<void> {
  try {
    blocker = await ElectronBlocker.fromPrebuiltFull(fetch)
  } catch (err) {
    console.warn('[adblocker] init failed, falling back to no filtering:', err)
    return
  }

  // Hook the default session (main window, popover) and the dedicated
  // webview partition up-front so future navigations apply both network
  // filters and cosmetic preload scripts.
  hookSession(session.defaultSession)
  hookSession(session.fromPartition(WEBVIEW_PARTITION))
  hookSession(session.fromPartition(YOUTUBE_PARTITION))
  hardenSession(session.fromPartition(WEBVIEW_PARTITION))
  hardenSession(session.fromPartition(YOUTUBE_PARTITION))

  // Catch any webviews that were already created before the filter list
  // finished loading.
  for (const wc of webContents.getAllWebContents()) {
    if (wc.getType() === 'webview') hookSession(wc.session)
  }

  // Flush any sessions the 'web-contents-created' listener saw before
  // the blocker was ready.
  for (const sess of pendingSessions) hookSession(sess)
  pendingSessions.clear()

  console.log('[adblocker] ready')
}
