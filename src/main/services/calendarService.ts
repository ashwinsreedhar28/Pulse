// Event calendar strip — composes upcoming earnings, favorite-team games, and
// space launches into a 7-day lookahead for the home view. Runs entirely off
// services we already hit elsewhere, so the strip has near-zero marginal cost.
//
//   earnings  → yahooFinanceService.getEarnings (24h TTL per symbol)
//   games     → sportsService.listGames + favoriteTeams filter (15s TTL per league)
//   launches  → Launch Library 2 API, cached locally (1h TTL)

import { listTickers } from '../database/tickers'
import { listFavoriteTeams } from '../database/favoriteTeams'
import { getEarnings } from './yahooFinanceService'
import { listGames, LEAGUES } from './sportsService'

const LL2_UPCOMING =
  'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&hide_recent_previous=true&mode=list'
const LL2_TTL_MS = 60 * 60_000
const LL2_TIMEOUT_MS = 10_000
const WINDOW_DAYS = 7

export type CalendarEventKind = 'earnings' | 'game' | 'launch'

export interface CalendarEvent {
  id: string
  kind: CalendarEventKind
  date: number // unix ms
  title: string
  subtitle: string | null
  // Kind-specific payload the renderer can use for styling / click handling.
  meta: {
    symbol?: string
    isEstimate?: boolean
    leagueId?: string
    gameId?: string
    homeAbbrev?: string
    awayAbbrev?: string
    homeColor?: string | null
    awayColor?: string | null
    provider?: string
    padLocation?: string | null
  }
}

export interface CalendarStrip {
  from: number
  to: number
  events: CalendarEvent[]
  fetchedAt: number
}

interface LaunchCacheEntry {
  value: CalendarEvent[]
  fetchedAt: number
}

let launchCache: LaunchCacheEntry | null = null

interface LL2Response {
  results?: Array<{
    id: string
    name?: string
    net?: string
    status?: { name?: string }
    launch_service_provider?: { name?: string }
    pad?: { name?: string; location?: { name?: string } }
  }>
}

async function fetchLaunches(now: number, horizon: number): Promise<CalendarEvent[]> {
  if (launchCache && now - launchCache.fetchedAt < LL2_TTL_MS) {
    return launchCache.value.filter((e) => e.date >= now && e.date <= horizon)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LL2_TIMEOUT_MS)
  try {
    const res = await fetch(LL2_UPCOMING, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as LL2Response
    const events: CalendarEvent[] = []
    for (const item of json.results ?? []) {
      if (!item.net || !item.name) continue
      const t = Date.parse(item.net)
      if (!Number.isFinite(t)) continue
      events.push({
        id: `launch:${item.id}`,
        kind: 'launch',
        date: t,
        title: item.name,
        subtitle: item.launch_service_provider?.name ?? null,
        meta: {
          provider: item.launch_service_provider?.name ?? undefined,
          padLocation: item.pad?.location?.name ?? null
        }
      })
    }
    launchCache = { value: events, fetchedAt: now }
    return events.filter((e) => e.date >= now && e.date <= horizon)
  } catch (err) {
    console.warn('[calendar] launches fetch failed:', err instanceof Error ? err.message : err)
    return launchCache?.value.filter((e) => e.date >= now && e.date <= horizon) ?? []
  } finally {
    clearTimeout(timer)
  }
}

async function collectEarnings(now: number, horizon: number): Promise<CalendarEvent[]> {
  const tickers = listTickers().filter((t) => t.isActive)
  if (tickers.length === 0) return []
  const results = await Promise.all(
    tickers.map(async (t) => {
      try {
        const earnings = await getEarnings(t.symbol)
        if (!earnings?.nextDate) return null
        if (earnings.nextDate < now || earnings.nextDate > horizon) return null
        const ev: CalendarEvent = {
          id: `earnings:${t.symbol}:${earnings.nextDate}`,
          kind: 'earnings',
          date: earnings.nextDate,
          title: `${t.symbol} earnings`,
          subtitle: t.companyName,
          meta: { symbol: t.symbol, isEstimate: earnings.isEstimate }
        }
        return ev
      } catch {
        return null
      }
    })
  )
  return results.filter((e): e is CalendarEvent => e !== null)
}

async function collectGames(now: number, horizon: number): Promise<CalendarEvent[]> {
  const favorites = listFavoriteTeams()
  if (favorites.length === 0) return []
  const byLeague = new Map<string, Set<string>>()
  for (const fav of favorites) {
    if (!byLeague.has(fav.leagueId)) byLeague.set(fav.leagueId, new Set())
    byLeague.get(fav.leagueId)!.add(fav.teamId)
  }
  const events: CalendarEvent[] = []
  await Promise.all(
    Array.from(byLeague.entries()).map(async ([leagueId, teamIds]) => {
      try {
        const games = await listGames(leagueId, WINDOW_DAYS)
        for (const g of games) {
          if (g.date < now || g.date > horizon) continue
          if (!teamIds.has(g.home.id) && !teamIds.has(g.away.id)) continue
          // Skip already-final games in the future window (rare, but ESPN
          // sometimes returns recently-final items inside a forward window).
          if (g.status === 'final' || g.status === 'canceled') continue
          const league = LEAGUES.find((l) => l.id === leagueId)
          events.push({
            id: `game:${g.id}`,
            kind: 'game',
            date: g.date,
            title: `${g.away.abbreviation} @ ${g.home.abbreviation}`,
            subtitle: league?.shortName ?? leagueId.toUpperCase(),
            meta: {
              leagueId,
              gameId: g.id,
              homeAbbrev: g.home.abbreviation,
              awayAbbrev: g.away.abbreviation,
              homeColor: g.home.color,
              awayColor: g.away.color
            }
          })
        }
      } catch (err) {
        console.warn(
          `[calendar] games fetch failed for ${leagueId}:`,
          err instanceof Error ? err.message : err
        )
      }
    })
  )
  return events
}

export async function getCalendarStrip(): Promise<CalendarStrip> {
  const now = Date.now()
  const horizon = now + WINDOW_DAYS * 86_400_000
  const [earnings, games, launches] = await Promise.all([
    collectEarnings(now, horizon),
    collectGames(now, horizon),
    fetchLaunches(now, horizon)
  ])
  const events = [...earnings, ...games, ...launches].sort((a, b) => a.date - b.date)
  return { from: now, to: horizon, events, fetchedAt: now }
}
