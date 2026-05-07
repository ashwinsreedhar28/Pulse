import { net } from 'electron'

// Thin wrapper around Electron's net.isOnline(), which queries the OS
// network-path monitor (nw_path_monitor on macOS). The check is cheap but
// not free, and every scheduler tick on the resume path used to fan out
// dozens of doomed fetches when the OS already knew the network was gone.
// 5s memo is short enough that a single tick reuses one answer; long
// enough that polling the OS once per fetch isn't a hot path.
//
// Failure mode: if net.isOnline() throws (extremely unlikely — the API is
// sync and OS-level), we fall open and let fetches try. Better to attempt
// and time out fast than to silently freeze the app on a flaky check.

const CACHE_MS = 5_000

let cachedOnline = true
let lastUpdate = 0

export function isOnline(): boolean {
  const now = Date.now()
  if (now - lastUpdate < CACHE_MS) return cachedOnline
  try {
    cachedOnline = net.isOnline()
  } catch {
    cachedOnline = true
  }
  lastUpdate = now
  return cachedOnline
}

// Force the next isOnline() call to re-query the OS. Use this when a fetch
// completes (success or failure) and you want the next gate decision to
// reflect reality, not a 5s-old cached answer.
export function invalidateOnlineCache(): void {
  lastUpdate = 0
}
