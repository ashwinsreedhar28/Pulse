import { listFavoriteTeams, type FavoriteTeam } from '../database/favoriteTeams'
import {
  getGameDetail,
  listGames,
  LEAGUES,
  type Game,
  type GameStatus
} from './sportsService'
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
    clickAction: { kind: 'game', payload: { leagueId: game.leagueId, leaguePath: game.leaguePath, eventId: game.id } }
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
          // Phase 3: score-change alerts for baseball + soccer favorite-team
          // games. Fires whenever EITHER team's score changes during a live
          // game so the user gets a play-by-play feel without play-by-play
          // parsing. NBA gets its own pass below (league-wide player
          // milestones); other leagues fall through silently for now.
          if (
            game.status === 'in_progress' &&
            prev &&
            (leagueId === 'mlb' || leagueId.startsWith('soccer'))
          ) {
            fireScoreChangeIfAny(game, prev, curr)
          }
        }
        lastSeen.set(key, curr)
      }
    }

    // Phase 3: NBA league-wide milestone pass. Independent of favorite
    // teams — any live NBA game gets its box score scanned for player
    // stat milestones (30+ pts to start; expand tiers later). Runs after
    // the favorite-team loop so identityKey dedup in notification_log
    // also dedups against any team-game alerts that already fired.
    try {
      await scanNbaMilestones()
    } catch (err) {
      console.warn(
        '[sportsAlerts] NBA milestone pass failed:',
        err instanceof Error ? err.message : err
      )
    }

    if (!armed) armed = true
  } catch (err) {
    console.warn('[sportsAlerts] tick failed:', err instanceof Error ? err.message : err)
  }
}

// Score-change detector for MLB / soccer favorite-team games. Fires one
// notification per unique scoreline so a re-poll that re-reads the same
// scoreboard doesn't double-fire. Tells the user WHICH team scored and
// the new score — works regardless of which side scored, including the
// opposing team. Useful for following along with your team's game even
// when the opponent ties it up.
function fireScoreChangeIfAny(game: Game, prev: GameState, curr: GameState): void {
  const homeChanged =
    curr.homeScore !== null &&
    (prev.homeScore === null || curr.homeScore !== prev.homeScore)
  const awayChanged =
    curr.awayScore !== null &&
    (prev.awayScore === null || curr.awayScore !== prev.awayScore)
  if (!homeChanged && !awayChanged) return
  const league =
    LEAGUES.find((l) => l.id === game.leagueId)?.shortName ??
    game.leagueId.toUpperCase()
  const homeAbbr = game.home.abbreviation
  const awayAbbr = game.away.abbreviation
  const scoredBy = homeChanged && awayChanged
    ? 'both teams' // unlikely in MLB/soccer but handle for completeness
    : homeChanged
      ? game.home.shortName
      : game.away.shortName
  const scoreLine = `${awayAbbr} ${curr.awayScore ?? 0} – ${homeAbbr} ${curr.homeScore ?? 0}`
  dispatchNotification({
    category: 'sport',
    // Identity key includes the new scoreline so each unique score state
    // fires once. A re-tick that re-reads the same scoreline no-ops; a
    // subsequent score change has a different key and fires.
    identityKey: `sport-score:${game.id}:H${curr.homeScore}-A${curr.awayScore}`,
    title: `${league}: ${scoredBy} scored`,
    body: scoreLine,
    importance: 'urgent',
    clickAction: { kind: 'game', payload: { leagueId: game.leagueId, leaguePath: game.leaguePath, eventId: game.id } }
  })
}

// NBA scoring milestones we currently watch. Tiered so a 50-pt night
// fires for 30 → 40 → 50 progressively (one alert per tier crossed,
// per player per game). Add 'triple-double' / 'double-double' here
// when we wire stat-line parsing for non-PTS columns. Sorted DESC so
// `find(t => pts >= t)` returns the highest tier crossed.
const NBA_PTS_TIERS = [50, 40, 30]

async function scanNbaMilestones(): Promise<void> {
  const games = await listGames('nba', 1).catch(() => [])
  const live = games.filter((g) => g.status === 'in_progress')
  if (live.length === 0) return
  for (const g of live) {
    let detail
    try {
      detail = await getGameDetail(g.leagueId, g.leaguePath, g.id)
    } catch {
      continue
    }
    if (!detail?.playerStats) continue
    for (const teamGroup of detail.playerStats) {
      for (const group of teamGroup.groups) {
        // ESPN's NBA box score uses category 'starters' / 'bench'. PTS
        // column may be 'PTS' (uppercase abbrev). Look up its index.
        const ptsIdx = group.labels.findIndex((l) => l.toUpperCase() === 'PTS')
        if (ptsIdx < 0) continue
        for (const player of group.players) {
          const ptsRaw = player.stats[ptsIdx]
          const pts = Number.parseInt(ptsRaw ?? '', 10)
          if (!Number.isFinite(pts)) continue
          // Dispatch ONLY the highest tier crossed (50 > 40 > 30). The
          // dispatcher's identity-key dedup short-circuits lower tiers
          // on subsequent observations. Firing all three at once on the
          // first observation of a 50-pt night was burning 60% of the
          // daily cap on a single game. Per-tier still matters ACROSS
          // observations: a player at 32 pts now dispatches '30PTS',
          // then '40PTS' when they hit 40, then '50PTS' at 50.
          const tier = NBA_PTS_TIERS.find((t) => pts >= t)
          if (tier === undefined) continue
          const teamSide = teamGroup.team
          const teamName = teamSide === 'home' ? g.home.shortName : g.away.shortName
          const opponent = teamSide === 'home' ? g.away.shortName : g.home.shortName
          dispatchNotification({
            category: 'sport',
            identityKey: `sport-milestone:${g.id}:${slugify(player.athlete)}:${tier}PTS`,
            title: `NBA: ${player.athlete} ${pts} pts`,
            body: `${teamName} vs ${opponent}.`,
            importance: 'urgent',
            clickAction: {
              kind: 'game',
              payload: { leagueId: g.leagueId, leaguePath: g.leaguePath, eventId: g.id }
            }
          })
        }
      }
    }
  }
}

// Stable slug for athlete names so identityKey survives ESPN's
// occasional name-format drift (e.g., "LeBron James" vs "LEBRON JAMES").
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
