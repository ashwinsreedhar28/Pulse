import { listFavoriteTeams, type FavoriteTeam } from '../database/favoriteTeams'
import { listGames, LEAGUES, type Game, type GameStatus } from './sportsService'
import { getPreferences } from '../database/preferences'
import { dispatchNotification, setNotificationWindowOpener } from './notificationService'

const POLL_INTERVAL_MS = 90_000
// Games only alerted within this window of "now" so stale finals don't spam.
const ALERT_WINDOW_MS = 12 * 60 * 60 * 1000

type AlertKind = 'started' | 'final'

interface GameState {
  status: GameStatus
  homeScore: number | null
  awayScore: number | null
  notifiedStarted: boolean
  notifiedFinal: boolean
}

const lastSeen = new Map<string, GameState>()
let timer: NodeJS.Timeout | null = null
let armed = false

export function setAlertsWindowOpener(fn: () => void): void {
  // Forward to the central notification service. Both this and
  // notificationManager call setNotificationWindowOpener; whichever runs
  // last wins, but they're handed the same callback by main/index.ts.
  setNotificationWindowOpener(fn)
}

function fireNotification(
  kind: AlertKind,
  game: Game,
  favorite: FavoriteTeam
): void {
  const league = LEAGUES.find((l) => l.id === game.leagueId)?.shortName ?? game.leagueId.toUpperCase()
  const favSide = game.home.id === favorite.teamId ? 'home' : 'away'
  const opponent = favSide === 'home' ? game.away.shortName : game.home.shortName
  const favAbbr = favorite.abbreviation
  const oppAbbr = favSide === 'home' ? game.away.abbreviation : game.home.abbreviation
  const favScore = favSide === 'home' ? game.home.score : game.away.score
  const oppScore = favSide === 'home' ? game.away.score : game.home.score

  let title: string
  let body: string
  if (kind === 'started') {
    title = `${league}: ${favAbbr} vs ${oppAbbr} just started`
    body = `${favorite.teamName} is playing ${opponent} now.`
  } else {
    const outcome =
      favScore !== null && oppScore !== null
        ? favScore > oppScore
          ? 'Win'
          : favScore < oppScore
            ? 'Loss'
            : 'Tie'
        : 'Final'
    title = `${league}: ${favAbbr} ${favScore ?? '–'} – ${oppScore ?? '–'} ${oppAbbr} · ${outcome}`
    body = game.statusDetail || `Final score vs ${opponent}.`
  }

  // Route through the central dispatcher. identityKey scopes to the
  // (gameId, kind) pair so a re-poll that re-detects the same start/final
  // doesn't double-fire — the in-memory notifiedStarted/notifiedFinal
  // flags handle that within a single process lifetime; the central log
  // covers crash-recovery and same-day re-emission.
  dispatchNotification({
    category: 'sport',
    identityKey: `sport-${kind}:${game.id}`,
    title,
    body,
    importance: 'urgent',
    clickAction: { kind: 'game', gameId: game.id }
  })
}

async function tick(): Promise<void> {
  try {
    const prefs = getPreferences()
    if (!prefs.favoriteTeamAlertsEnabled) return
    const favorites = listFavoriteTeams().filter((f) => f.alertsEnabled)
    if (favorites.length === 0) return

    const byLeague = new Map<string, FavoriteTeam[]>()
    for (const f of favorites) {
      const arr = byLeague.get(f.leagueId) ?? []
      arr.push(f)
      byLeague.set(f.leagueId, arr)
    }

    const now = Date.now()
    for (const [leagueId, favs] of byLeague) {
      const games = await listGames(leagueId, 3).catch(() => [])
      const favIds = new Set(favs.map((f) => f.teamId))
      const matching = games.filter(
        (g) => favIds.has(g.home.id) || favIds.has(g.away.id)
      )

      for (const game of matching) {
        if (Math.abs(game.date - now) > ALERT_WINDOW_MS && game.status !== 'in_progress') continue
        const key = `${game.leagueId}:${game.id}`
        const prev = lastSeen.get(key)
        const curr: GameState = {
          status: game.status,
          homeScore: game.home.score,
          awayScore: game.away.score,
          notifiedStarted: prev?.notifiedStarted ?? false,
          notifiedFinal: prev?.notifiedFinal ?? false
        }
        const fav =
          favs.find((f) => f.teamId === game.home.id) ??
          favs.find((f) => f.teamId === game.away.id)
        if (!fav) {
          lastSeen.set(key, curr)
          continue
        }

        // Only emit alerts once armed so the first tick after startup
        // seeds state without spamming.
        if (armed) {
          if (
            !curr.notifiedStarted &&
            game.status === 'in_progress' &&
            prev?.status !== 'in_progress'
          ) {
            fireNotification('started', game, fav)
            curr.notifiedStarted = true
          }
          if (
            !curr.notifiedFinal &&
            game.status === 'final' &&
            prev?.status !== 'final'
          ) {
            fireNotification('final', game, fav)
            curr.notifiedFinal = true
          }
        }
        lastSeen.set(key, curr)
      }
    }

    if (!armed) armed = true
  } catch (err) {
    console.warn('[sportsAlerts] tick failed:', err instanceof Error ? err.message : err)
  }
}

export function startSportsAlerts(): void {
  stopSportsAlerts()
  armed = false
  void tick()
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
}

export function stopSportsAlerts(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function resetSportsAlertState(): void {
  lastSeen.clear()
  armed = false
}
