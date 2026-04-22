// Main-process scheduler that keeps the sports ticker reel ready-to-render.
// Parallel of stocksScheduler. The renderer's SportsReel used to do its own
// fetch-filter-sort on every mount, which meant cycling to the Sports tab
// flashed a 500ms–1s placeholder while ESPN responded. We now own that state
// here and hand a pre-built `SportsReelGroup[]` back synchronously, so the
// reel paints instantly on mount; the subscription keeps it live.
//
// Cadence: fast when any tracked league has a live game, slow otherwise.
// Fetches are skipped when no window is visible — same power-conscious
// approach as stocksScheduler — but the cached payload is still served.
//
// The filter/sort logic (yesterday's finals + today's scheduled + all live,
// top 8 per league, leagues with live games first) was previously duplicated
// in the renderer. It lives only here now.

import { BrowserWindow } from 'electron'
import { listGames, listLeagues, type Game, type SportsLeague } from './sportsService'

export interface SportsReelGroup {
  league: SportsLeague
  games: Game[]
}

const LIVE_MS = 8_000
const IDLE_MS = 30_000
const MAX_GAMES_PER_LEAGUE = 8

let timer: NodeJS.Timeout | null = null
let lastGroups: SportsReelGroup[] = []
// First tick has not completed yet. Used so the renderer can distinguish
// "scheduler has no data for us" (warming) from "scheduler confirmed no
// games today" (empty).
let warmed = false

export function getLastReelGroups(): SportsReelGroup[] {
  return lastGroups
}

export function isSportsReelWarmed(): boolean {
  return warmed
}

function anyWindowVisible(): boolean {
  return BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible())
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('sports:reelUpdated', { groups: lastGroups, warmed })
    }
  }
}

// Build the same reel payload the renderer used to compute inline:
// in-progress games always; finals from yesterday onward; scheduled games
// through the end of today. Top 8 per league, live-heavy leagues first.
async function buildGroups(): Promise<SportsReelGroup[]> {
  const leagues = listLeagues()
  const fetched = await Promise.all(
    leagues.map((l) => listGames(l.id).catch(() => [] as Game[]))
  )
  const now = Date.now()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = todayStart.getTime() + 86_400_000
  const yesterdayStart = todayStart.getTime() - 86_400_000
  const order: Record<Game['status'], number> = {
    in_progress: 0,
    final: 1,
    scheduled: 2,
    postponed: 3,
    canceled: 4
  }
  const built: SportsReelGroup[] = leagues
    .map((league, i) => {
      const raw = fetched[i]
      const relevant = raw.filter((g) => {
        if (g.status === 'in_progress') return true
        if (g.status === 'final' && g.date >= yesterdayStart) return true
        if (g.status === 'scheduled' && g.date >= now && g.date < tomorrowStart) return true
        return false
      })
      relevant.sort((a, b) => order[a.status] - order[b.status] || a.date - b.date)
      return { league, games: relevant.slice(0, MAX_GAMES_PER_LEAGUE) }
    })
    .filter((g) => g.games.length > 0)
  built.sort((a, b) => {
    const la = a.games.filter((g) => g.status === 'in_progress').length
    const lb = b.games.filter((g) => g.status === 'in_progress').length
    return lb - la
  })
  return built
}

async function tick(): Promise<void> {
  try {
    const groups = await buildGroups()
    lastGroups = groups
    warmed = true
    broadcast()
  } catch (err) {
    console.warn('[sports-reel] tick failed:', err instanceof Error ? err.message : err)
    // Mark warmed on failure too — otherwise the UI would sit on "warming up"
    // forever if ESPN is unreachable. The placeholder for "no games" is a
    // reasonable terminal state, and the next scheduled tick can recover.
    warmed = true
    broadcast()
  }
}

function pickCadence(): number {
  const anyLive = lastGroups.some((g) => g.games.some((x) => x.status === 'in_progress'))
  return anyLive ? LIVE_MS : IDLE_MS
}

function scheduleNext(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    // Skip the fetch when nothing is visible to consume it (same pattern as
    // stocksScheduler). We still reschedule so a window reopen doesn't have
    // to wait a full cadence for fresh data.
    if (anyWindowVisible()) {
      await tick()
    }
    scheduleNext()
  }, pickCadence())
}

export function startSportsReelScheduler(): void {
  stopSportsReelScheduler()
  // Kick off an immediate tick so the first user cycle to Sports finds the
  // cache already populated — boot services run behind the splash for ~4s,
  // which is more than enough time for ESPN to respond.
  void tick()
  scheduleNext()
}

export function stopSportsReelScheduler(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
