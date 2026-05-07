import { net } from 'electron'

// Resume-aware network gate. The original v1 of this module was an
// aggressive `isOnline()` check on every scheduler tick — that misfired
// in steady state because Electron's `net.isOnline()` on macOS can
// report false transiently (Chromium's NetworkChangeNotifier lags
// during dev hot-reloads, brief Wi-Fi blips, and certain interface
// transitions) even when the user has working internet. The misfire
// blanked the stocks marquee and other live surfaces because the
// scheduler skipped its tick and never broadcast.
//
// The actual problem we wanted to solve was narrow: after a
// powerMonitor 'resume' from a long sleep, every scheduler tick fires
// at once and fans out into doomed fetches when the OS hasn't yet
// re-attached to the network — that cascade is what queued behind the
// nativeTheme IPC and produced the 10-15s theme-switch lag.
//
// New design: gate is ONLY active during a 30-second window after a
// resume event. Inside that window, if the OS still reports offline,
// schedulers skip. Outside the window the gate is permanently off and
// schedulers run normally regardless of net.isOnline()'s answer. This
// preserves the cascade-prevention behavior without misfiring during
// steady-state operation.

const RESUME_GUARD_MS = 30_000

let resumedAt = 0

// Called from feedPoller's powerMonitor.on('resume') handler. Starts
// the 30-second post-resume guard window during which schedulers will
// defer if the OS reports offline.
export function markResumed(): void {
  resumedAt = Date.now()
}

// True when the caller (a scheduler tick) should skip this round.
// False outside the guard window — i.e. in steady-state operation,
// always run.
export function shouldDeferOnResume(): boolean {
  if (Date.now() - resumedAt > RESUME_GUARD_MS) return false
  // We're inside the post-resume window. Check the OS — if it says
  // online, run. If it says offline, defer (we just woke up and the
  // network hasn't re-attached yet).
  try {
    return !net.isOnline()
  } catch {
    // Probe failed for some reason — fail open and let the fetch try.
    return false
  }
}
