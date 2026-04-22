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
import { loadConfig } from './configFileService'
import {
  getUpcomingIpos,
  getUpcomingSplits,
  getEconEvents,
  classifyEconEvent
} from './nasdaqCalendarService'
import { getWorldEvents } from './wikipediaEventsService'

// We drop mode=list here (vs. the trimmed list-mode payload) so we can surface
// info_urls[] / vid_urls[] for in-app "open article" clicks. Payload is still
// small at limit=20 and only fetched once per hour via launchCache.
const LL2_UPCOMING =
  'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&hide_recent_previous=true'
const LL2_TTL_MS = 60 * 60_000
const LL2_TIMEOUT_MS = 10_000
const DEFAULT_WINDOW_DAYS = 7

export type CalendarEventKind =
  | 'earnings'
  | 'game'
  | 'launch'
  | 'dividend'
  | 'ipo'
  | 'stockSplit'
  | 'fedMeeting'
  | 'econRelease'
  | 'worldEvent'

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
    ratio?: string
    priceRange?: string | null
    consensus?: string | null
    previous?: string | null
    country?: string | null
    url?: string
    // worldEvent: Wikipedia current-events category (e.g., "Armed conflicts
    // and attacks", "Politics and elections"). Drives the pill subtitle.
    category?: string
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

// Whole-strip cache: home view and Stocks view both render a CalendarStrip,
// which each calls window.api.calendar.get() on mount. Without this, hopping
// between views re-fetches earnings/splits/IPOs/econ every time and the two
// strips can briefly disagree. A 60s TTL keeps the strip consistent during
// normal navigation without going stale.
let stripCache: { value: CalendarStrip; fetchedAt: number } | null = null
const STRIP_TTL_MS = 60_000

interface LL2Launch {
  id: string
  name?: string
  net?: string
  status?: { name?: string }
  launch_service_provider?: { name?: string }
  pad?: { name?: string; location?: { name?: string } }
  info_urls?: Array<{ priority?: number; url?: string }>
  vid_urls?: Array<{ priority?: number; url?: string }>
}

interface LL2Response {
  results?: LL2Launch[]
}

// Pick the highest-priority URL from info_urls first, then fall back to
// vid_urls. LL2 orders priority low=best (1 is primary). If neither is
// present, return null and the renderer will leave the pill non-clickable.
function pickBestLaunchURL(item: LL2Launch): string | null {
  const sources = [...(item.info_urls ?? []), ...(item.vid_urls ?? [])]
    .filter((s) => typeof s.url === 'string' && s.url.startsWith('http'))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  return sources[0]?.url ?? null
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
          padLocation: item.pad?.location?.name ?? null,
          url: pickBestLaunchURL(item) ?? undefined
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

async function collectGames(
  now: number,
  horizon: number,
  windowDays: number
): Promise<CalendarEvent[]> {
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
        const games = await listGames(leagueId, windowDays)
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

// Ex-dividend dates come free from the same Yahoo calendarEvents fetch as
// earnings, so we just re-map the per-symbol result into dividend events.
async function collectDividends(now: number, horizon: number): Promise<CalendarEvent[]> {
  const tickers = listTickers().filter((t) => t.isActive)
  if (tickers.length === 0) return []
  const results = await Promise.all(
    tickers.map(async (t) => {
      try {
        const earnings = await getEarnings(t.symbol)
        const d = earnings?.exDividendDate
        if (!d || d < now || d > horizon) return null
        const ev: CalendarEvent = {
          id: `dividend:${t.symbol}:${d}`,
          kind: 'dividend',
          date: d,
          title: `${t.symbol} ex-dividend`,
          subtitle: t.companyName,
          meta: { symbol: t.symbol }
        }
        return ev
      } catch {
        return null
      }
    })
  )
  return results.filter((e): e is CalendarEvent => e !== null)
}

// IPO pills don't carry a URL — the renderer routes the click through
// ipoBriefService, which synthesizes a reader-view brief from the Nasdaq
// calendar + SEC EDGAR filings + recent news coverage.
async function collectIpos(now: number, horizon: number): Promise<CalendarEvent[]> {
  try {
    const ipos = await getUpcomingIpos(now, horizon)
    return ipos.map((i) => ({
      id: `ipo:${i.symbol || i.companyName}:${i.expectedDate}`,
      kind: 'ipo' as const,
      date: i.expectedDate,
      title: i.symbol ? `${i.symbol} IPO` : `${i.companyName} IPO`,
      subtitle: i.companyName || null,
      meta: {
        symbol: i.symbol || undefined,
        priceRange: i.priceRange
      }
    }))
  } catch (err) {
    console.warn('[calendar] ipos fetch failed:', err instanceof Error ? err.message : err)
    return []
  }
}

// Splits: Nasdaq returns the whole market; filter to the user's watchlist so
// the strip stays relevant. An unfiltered feed would drown out everything else.
async function collectStockSplits(now: number, horizon: number): Promise<CalendarEvent[]> {
  try {
    const tickers = listTickers().filter((t) => t.isActive)
    const watchlist = new Set(tickers.map((t) => t.symbol.toUpperCase()))
    if (watchlist.size === 0) return []
    const splits = await getUpcomingSplits(now, horizon)
    return splits
      .filter((s) => watchlist.has(s.symbol))
      .map((s) => ({
        id: `split:${s.symbol}:${s.executionDate}`,
        kind: 'stockSplit' as const,
        date: s.executionDate,
        title: `${s.symbol} ${s.ratio || 'split'}`,
        subtitle: s.companyName || null,
        meta: { symbol: s.symbol, ratio: s.ratio }
      }))
  } catch (err) {
    console.warn('[calendar] splits fetch failed:', err instanceof Error ? err.message : err)
    return []
  }
}

// Wikipedia Current Events Portal — trailing-only "what happened in the
// world" bullets curated daily by editors. We fetch the last 3 days so a
// user opening Pulse on a Monday still sees Saturday/Sunday's big stories
// alongside Monday's. These events are dated in the past, which is why the
// strip's `from` bound moves backward when worldEvents is enabled.
const WORLD_TRAILING_DAYS = 3

async function collectWorldEvents(now: number): Promise<CalendarEvent[]> {
  try {
    const events = await getWorldEvents(now, WORLD_TRAILING_DAYS)
    return events.map((e) => ({
      id: e.id,
      kind: 'worldEvent' as const,
      date: e.date,
      title: e.title,
      subtitle: e.category,
      meta: {
        category: e.category,
        url: e.url ?? undefined
      }
    }))
  } catch (err) {
    console.warn(
      '[calendar] world events fetch failed:',
      err instanceof Error ? err.message : err
    )
    return []
  }
}

// Fed + macro events come from the same Nasdaq economic-events endpoint and
// get split client-side, so we always fetch once and partition by the toggle.
async function collectEconEvents(
  now: number,
  horizon: number,
  wantFed: boolean,
  wantMacro: boolean
): Promise<CalendarEvent[]> {
  if (!wantFed && !wantMacro) return []
  try {
    const events = await getEconEvents(now, horizon)
    const out: CalendarEvent[] = []
    for (const e of events) {
      const cls = classifyEconEvent(e.eventName)
      if (cls === 'fed' && wantFed) {
        out.push({
          id: `fed:${e.eventName}:${e.date}`,
          kind: 'fedMeeting',
          date: e.date,
          title: e.eventName,
          subtitle: e.country,
          meta: {
            consensus: e.consensus,
            previous: e.previous,
            country: e.country,
            // FOMC calendar page is the canonical Fed reference and extracts
            // cleanly in reader mode.
            url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'
          }
        })
      } else if (cls === 'macro' && wantMacro) {
        out.push({
          id: `econ:${e.eventName}:${e.date}`,
          kind: 'econRelease',
          date: e.date,
          title: e.eventName,
          subtitle: e.country,
          meta: {
            consensus: e.consensus,
            previous: e.previous,
            country: e.country,
            // No single authoritative page for every macro indicator, so route
            // to a Google News search for the event name — the in-app webview
            // renders this fine and the user gets fresh coverage.
            url: `https://news.google.com/search?q=${encodeURIComponent(e.eventName)}`
          }
        })
      }
    }
    return out
  } catch (err) {
    console.warn('[calendar] econ fetch failed:', err instanceof Error ? err.message : err)
    return []
  }
}

export async function getCalendarStrip(): Promise<CalendarStrip> {
  const nowCheck = Date.now()
  if (stripCache && nowCheck - stripCache.fetchedAt < STRIP_TTL_MS) {
    return stripCache.value
  }
  const config = await loadConfig().catch(() => null)
  const windowDays = config?.calendar.windowDays ?? DEFAULT_WINDOW_DAYS
  const kinds = config?.calendar.eventKinds
  const earningsEnabled = kinds ? kinds.earnings.enabled : true
  const gamesEnabled = kinds ? kinds.games.enabled : true
  const launchesEnabled = kinds ? kinds.launches.enabled : true
  const dividendsEnabled = kinds ? kinds.dividends.enabled : false
  const iposEnabled = kinds ? kinds.ipos.enabled : false
  const stockSplitsEnabled = kinds ? kinds.stockSplits.enabled : false
  const fedEnabled = kinds ? kinds.fedMeetings.enabled : true
  const econEnabled = kinds ? kinds.econReleases.enabled : false
  const worldEventsEnabled = kinds ? kinds.worldEvents.enabled : true

  const now = Date.now()
  const horizon = now + windowDays * 86_400_000
  const [earnings, games, launches, dividends, ipos, splits, econ, world] = await Promise.all([
    earningsEnabled ? collectEarnings(now, horizon) : Promise.resolve<CalendarEvent[]>([]),
    gamesEnabled
      ? collectGames(now, horizon, windowDays)
      : Promise.resolve<CalendarEvent[]>([]),
    launchesEnabled ? fetchLaunches(now, horizon) : Promise.resolve<CalendarEvent[]>([]),
    dividendsEnabled ? collectDividends(now, horizon) : Promise.resolve<CalendarEvent[]>([]),
    iposEnabled ? collectIpos(now, horizon) : Promise.resolve<CalendarEvent[]>([]),
    stockSplitsEnabled ? collectStockSplits(now, horizon) : Promise.resolve<CalendarEvent[]>([]),
    collectEconEvents(now, horizon, fedEnabled, econEnabled),
    worldEventsEnabled ? collectWorldEvents(now) : Promise.resolve<CalendarEvent[]>([])
  ])
  const events = [
    ...earnings,
    ...games,
    ...launches,
    ...dividends,
    ...ipos,
    ...splits,
    ...econ,
    ...world
  ].sort((a, b) => a.date - b.date)
  // `from` bounds the visible range. World events are trailing, so expand
  // backward to the earliest event date when any are present — otherwise
  // the strip header's "Past N · Next M days" math is wrong.
  const earliest = events.length > 0 ? Math.min(now, events[0].date) : now
  const result: CalendarStrip = { from: earliest, to: horizon, events, fetchedAt: now }
  stripCache = { value: result, fetchedAt: now }
  return result
}
