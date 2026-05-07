// Sports data via ESPN's public (unofficial) site API.
// Scoreboard: GET /apis/site/v2/sports/{sport}/{league}/scoreboard[?dates=YYYYMMDD-YYYYMMDD]
// Summary:    GET /apis/site/v2/sports/{sport}/{league}/summary?event={eventId}

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
const ESPN_BASE_V3 = 'https://site.api.espn.com/apis/site/v3/sports'
const FETCH_TIMEOUT_MS = 6_000
const SCOREBOARD_TTL_MS = 15_000
// Summary (box score) TTL bumped from 10s to 60s. The original 10s was
// fine when getGameDetail was only called by the user opening a game
// detail panel; the 90s sportsAlerts tick now also calls it once per
// live NBA game for milestone scanning, and a 10s TTL meant every tick
// fetched fresh from ESPN. 60s keeps the data near-real-time for the
// detail panel while letting the milestone scan reuse the cache between
// ticks (90s tick > 60s TTL, but the renderer's open-detail path warms
// it cheaply).
const SUMMARY_TTL_MS = 60_000

export interface SportsLeague {
  id: string
  name: string
  sport: string
  shortName: string
  // ESPN path segments. Some leagues (cricket) need to try multiple sub-paths.
  paths: string[]
  // True when the current date sits inside this league's season
  // window. Computed at listLeagues() time from SEASON_WINDOWS so
  // the renderer can default to a league that's actually in
  // session (e.g. avoid landing on NFL in July).
  inSeason: boolean
  // True when the league is currently in its postseason window
  // (NBA / NFL / MLB / NHL / CFP). Drives the orange "Playoffs"
  // pill on the league tab and splits the league-leaders panel
  // into Playoffs / Regular Season boxes.
  inPlayoffs: boolean
}

// Internal catalog. inSeason / inPlayoffs are computed per-call in
// listLeagues since they change with the date.
type LeagueCatalogEntry = Omit<SportsLeague, 'inSeason' | 'inPlayoffs'>
const LEAGUE_CATALOG: LeagueCatalogEntry[] = [
  { id: 'nfl', name: 'NFL', shortName: 'NFL', sport: 'American Football', paths: ['football/nfl'] },
  { id: 'nba', name: 'NBA', shortName: 'NBA', sport: 'Basketball', paths: ['basketball/nba'] },
  { id: 'mlb', name: 'MLB', shortName: 'MLB', sport: 'Baseball', paths: ['baseball/mlb'] },
  { id: 'nhl', name: 'NHL', shortName: 'NHL', sport: 'Hockey', paths: ['hockey/nhl'] },
  {
    id: 'ncaaf',
    name: 'College Football',
    shortName: 'CFB',
    sport: 'American Football',
    paths: ['football/college-football']
  },
  {
    id: 'ncaam',
    name: "Men's College Basketball",
    shortName: 'CBB',
    sport: 'Basketball',
    paths: ['basketball/mens-college-basketball']
  },
  {
    id: 'ucl',
    name: 'UEFA Champions League',
    shortName: 'UCL',
    sport: 'Soccer',
    paths: ['soccer/uefa.champions']
  },
  { id: 'epl', name: 'Premier League', shortName: 'EPL', sport: 'Soccer', paths: ['soccer/eng.1'] },
  { id: 'laliga', name: 'La Liga', shortName: 'La Liga', sport: 'Soccer', paths: ['soccer/esp.1'] },
  { id: 'seriea', name: 'Serie A', shortName: 'Serie A', sport: 'Soccer', paths: ['soccer/ita.1'] },
  { id: 'mls', name: 'MLS', shortName: 'MLS', sport: 'Soccer', paths: ['soccer/usa.1'] }
]

// Backwards-compat export used by other services that look up paths
// by id. Returns the catalog without the (computed) inSeason field.
export const LEAGUES: LeagueCatalogEntry[] = LEAGUE_CATALOG

// Conference filter for NCAA leagues. ESPN's scoreboard accepts a
// `groups` query param that narrows results to a specific conference.
// Conferences are fetched dynamically from ESPN's /groups endpoint
// because conference IDs differ across sports (basketball SEC ≠
// football SEC) and conferences reshuffle every few years (Pac-12
// collapse, Texas/OU to SEC, etc.). One-time fetch per league per
// session, cached in memory.
export interface NcaaConference {
  id: string
  name: string
  shortName: string
}

const CONFERENCE_TTL_MS = 24 * 60 * 60 * 1000
interface ConferenceCacheEntry {
  value: NcaaConference[]
  fetchedAt: number
}
const conferenceCache = new Map<string, ConferenceCacheEntry>()

// Conferences ESPN returns include FCS / D-II / club tiers we don't
// want to surface. The allowlist names below are the canonical short
// names of the conferences worth showing — kept tight so a user
// scanning the bar doesn't wade through 40 entries.
const NCAA_CONFERENCE_PRIORITY: Record<string, string[]> = {
  ncaaf: [
    'SEC',
    'Big Ten',
    'ACC',
    'Big 12',
    'Pac-12',
    'AAC',
    'American',
    'MWC',
    'Mountain West',
    'MAC',
    'Mid-American',
    'Sun Belt',
    'C-USA',
    'Conference USA',
    'Indep',
    'FBS Independents'
  ],
  ncaam: [
    'ACC',
    'Big Ten',
    'Big East',
    'Big 12',
    'SEC',
    'Pac-12',
    'AAC',
    'American',
    'A-10',
    'Atlantic 10',
    'MWC',
    'Mountain West',
    'WCC',
    'West Coast',
    'C-USA',
    'Conference USA',
    'MAC',
    'Mid-American',
    'Ivy',
    'Ivy League'
  ]
}

interface EspnGroupsResponse {
  groups?: Array<{
    groupId?: string | number
    id?: string | number
    name?: string
    shortName?: string
    abbreviation?: string
    isConference?: boolean
  }>
}

export async function listNcaaConferences(leagueId: string): Promise<NcaaConference[]> {
  const lid = leagueId.toLowerCase()
  if (lid !== 'ncaaf' && lid !== 'ncaam') return []
  const cached = conferenceCache.get(lid)
  if (cached && Date.now() - cached.fetchedAt < CONFERENCE_TTL_MS) {
    return cached.value
  }
  const league = LEAGUES.find((l) => l.id === lid)
  if (!league) return []
  const path = league.paths[0]
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/groups`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4_000)
    let res: Response
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) return cached?.value ?? []
    const data = (await res.json()) as EspnGroupsResponse
    const all = (data.groups ?? [])
      .map((g) => {
        const id = g.groupId !== undefined ? String(g.groupId) : g.id !== undefined ? String(g.id) : ''
        const name = g.name?.trim() ?? ''
        const shortName = g.shortName?.trim() || g.abbreviation?.trim() || name
        return id && name ? { id, name, shortName } : null
      })
      .filter((g): g is NcaaConference => g !== null)
    // Filter + order by the priority list. Conferences not in the
    // priority list are dropped to keep the strip readable.
    const priority = NCAA_CONFERENCE_PRIORITY[lid] ?? []
    const priorityIdx = (c: NcaaConference): number => {
      const idx = priority.findIndex(
        (p) =>
          c.shortName === p ||
          c.name === p ||
          c.shortName.toLowerCase() === p.toLowerCase() ||
          c.name.toLowerCase() === p.toLowerCase()
      )
      return idx === -1 ? 999 : idx
    }
    const filtered = all
      .filter((c) => priorityIdx(c) < 999)
      .sort((a, b) => priorityIdx(a) - priorityIdx(b))
    // Dedupe by id (ESPN occasionally returns duplicates with same id
    // but slightly different names).
    const seen = new Set<string>()
    const unique: NcaaConference[] = []
    for (const c of filtered) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      unique.push(c)
    }
    conferenceCache.set(lid, { value: unique, fetchedAt: Date.now() })
    return unique
  } catch (err) {
    console.warn(
      `[sports] listNcaaConferences ${lid} failed:`,
      err instanceof Error ? err.message : err
    )
    return cached?.value ?? []
  }
}

// Hard-coded season windows per league. Month/day is zero-indexed for month.
// When the current date sits outside the window, we report the most recent
// completed season (useful for offseason browsing).
interface SeasonWindow {
  startMonth: number // 0-11
  startDay: number
  endMonth: number
  endDay: number
}

const SEASON_WINDOWS: Record<string, SeasonWindow> = {
  nfl: { startMonth: 8, startDay: 1, endMonth: 1, endDay: 15 }, // Sep 1 → Feb 15
  nba: { startMonth: 9, startDay: 15, endMonth: 5, endDay: 30 }, // Oct 15 → Jun 30
  mlb: { startMonth: 2, startDay: 20, endMonth: 10, endDay: 5 }, // Mar 20 → Nov 5
  nhl: { startMonth: 9, startDay: 1, endMonth: 5, endDay: 30 }, // Oct 1 → Jun 30
  ncaaf: { startMonth: 7, startDay: 20, endMonth: 0, endDay: 15 }, // Aug 20 → Jan 15
  ncaam: { startMonth: 9, startDay: 25, endMonth: 3, endDay: 15 }, // Oct 25 → Apr 15
  ucl: { startMonth: 8, startDay: 1, endMonth: 4, endDay: 31 }, // Sep 1 → May 31
  epl: { startMonth: 7, startDay: 10, endMonth: 4, endDay: 31 }, // Aug 10 → May 31
  laliga: { startMonth: 7, startDay: 15, endMonth: 4, endDay: 31 },
  seriea: { startMonth: 7, startDay: 15, endMonth: 4, endDay: 31 },
  mls: { startMonth: 1, startDay: 15, endMonth: 10, endDay: 15 } // Feb 15 → Nov 15
}

export interface SeasonRange {
  start: Date
  end: Date
  label: string // e.g. "2025-26" or "2026"
}

export function currentSeasonRange(leagueId: string): SeasonRange | null {
  const window = SEASON_WINDOWS[leagueId]
  if (!window) return null
  const now = new Date()
  const year = now.getFullYear()
  const crossesYear = window.startMonth > window.endMonth
  // Candidate that could contain `now`.
  const candidateStartYear = crossesYear
    ? now.getMonth() < window.startMonth
      ? year - 1
      : year
    : year
  const start = new Date(candidateStartYear, window.startMonth, window.startDay)
  const end = new Date(
    crossesYear ? candidateStartYear + 1 : candidateStartYear,
    window.endMonth,
    window.endDay,
    23,
    59,
    59
  )
  // If `now` is before the start of this candidate season, fall back to the
  // previous season so offseason browsing still shows a completed calendar.
  if (now < start) {
    const prevStart = new Date(candidateStartYear - 1, window.startMonth, window.startDay)
    const prevEnd = new Date(
      crossesYear ? candidateStartYear : candidateStartYear - 1,
      window.endMonth,
      window.endDay,
      23,
      59,
      59
    )
    return { start: prevStart, end: prevEnd, label: seasonLabel(prevStart, prevEnd, crossesYear) }
  }
  return { start, end, label: seasonLabel(start, end, crossesYear) }
}

function seasonLabel(start: Date, end: Date, crossesYear: boolean): string {
  if (crossesYear) {
    return `${start.getFullYear()}-${String(end.getFullYear()).slice(-2)}`
  }
  return String(start.getFullYear())
}

export type GameStatus = 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'canceled'

export interface GameTeam {
  id: string
  name: string
  shortName: string
  abbreviation: string
  logoURL: string | null
  score: number | null
  record: string | null
  isHome: boolean
  winner: boolean | null
  color: string | null
  altColor: string | null
}

export interface Game {
  id: string
  leagueId: string
  leaguePath: string
  date: number
  status: GameStatus
  statusDetail: string
  statusShort: string
  period: number | null
  displayClock: string | null
  home: GameTeam
  away: GameTeam
  venue: string | null
  broadcasts: string[]
  note: string | null
  // Playoff series summary, populated when ESPN's competition payload
  // includes a multi-game series (NBA / NHL playoff rounds, MLB
  // postseason rounds, NBA Finals, World Series, Stanley Cup Final).
  // Shape: each side's win count + a short title like "Western
  // Conference Finals" or "World Series". Null for regular-season
  // games and for one-off knockout fixtures (CFP semifinals, Super
  // Bowl) where there's no series record to track.
  series: {
    title: string | null
    homeWins: number
    awayWins: number
    summary: string | null
  } | null
}

export interface GameDetailStat {
  label: string
  home: string
  away: string
}

export interface PlayerStatLine {
  athlete: string
  position: string
  stats: string[]
  isStarter: boolean
}

export interface PlayerStatGroup {
  category: string
  labels: string[]
  descriptions: string[]
  players: PlayerStatLine[]
  totals: string[] | null
}

export interface TeamPlayerStats {
  team: 'home' | 'away'
  groups: PlayerStatGroup[]
}

export interface LinescoreSide {
  team: 'home' | 'away'
  innings: Array<number | null>
  runs: number | null
  hits: number | null
  errors: number | null
}

export interface Linescore {
  home: LinescoreSide
  away: LinescoreSide
  columns: number
}

export interface SportsTeam {
  id: string
  name: string
  displayName: string
  shortName: string
  abbreviation: string
  location: string | null
  logoURL: string | null
}

export interface GameDetail extends Game {
  stats: GameDetailStat[]
  headlines: Array<{ title: string; link: string | null; description: string | null }>
  leaders: Array<{
    team: 'home' | 'away'
    category: string
    athlete: string
    value: string
    // ESPN headshot URL when available — typically a circular CDN
    // image at /i/headshots/.../full.png. Null when ESPN didn't ship
    // one for this athlete (occasional rookies or back-of-bench
    // players in non-major leagues). Renderer falls back to team
    // logo, then to initials.
    headshotURL: string | null
    // Team crest URL — the leader's team logo, used as a graceful
    // visual fallback when the player headshot 404s. Soccer leagues
    // in particular often lack player headshots on ESPN's CDN, so
    // every soccer leader would otherwise render as bare initials.
    teamLogoURL: string | null
  }>
  highlightSearchQuery: string
  linescore?: Linescore
  playerStats?: TeamPlayerStats[]
}

interface ScoreboardCacheEntry<T> {
  value: T
  fetchedAt: number
}

const scoreboardCache = new Map<string, ScoreboardCacheEntry<Game[]>>()
const seasonCache = new Map<string, ScoreboardCacheEntry<SeasonGames>>()
const summaryCache = new Map<string, ScoreboardCacheEntry<GameDetail>>()
const teamsCache = new Map<string, ScoreboardCacheEntry<SportsTeam[]>>()
const TEAMS_TTL_MS = 24 * 60 * 60 * 1000
const SEASON_TTL_MS = 5 * 60 * 1000

// Hardcoded playoff windows for US sports leagues. Used to surface
// a "Playoffs" pill in the league tab strip and to split the league-
// leaders panel into Playoffs / Regular Season collapsible boxes
// when postseason play is active. Soccer leagues don't use a
// playoffs format that fits this model (knockouts vary by league)
// so they're omitted; CFB has the College Football Playoff window.
const PLAYOFF_WINDOWS: Record<string, SeasonWindow> = {
  nba: { startMonth: 3, startDay: 15, endMonth: 5, endDay: 25 }, // mid-Apr → late Jun (Finals end)
  nfl: { startMonth: 0, startDay: 5, endMonth: 1, endDay: 15 }, // early Jan → mid Feb (Super Bowl)
  mlb: { startMonth: 9, startDay: 1, endMonth: 10, endDay: 5 }, // Oct → early Nov (World Series)
  nhl: { startMonth: 3, startDay: 10, endMonth: 5, endDay: 25 }, // mid-Apr → late Jun (Stanley Cup)
  ncaaf: { startMonth: 11, startDay: 18, endMonth: 0, endDay: 15 } // mid-Dec → mid-Jan (CFP)
}

// Generic month-day-window membership check shared by season and
// playoff detection. Cross-year windows (e.g. NFL Sep 1 → Feb 15)
// resolve via OR'd bounds; same-year windows by AND'd bounds.
function isInsideWindow(window: SeasonWindow): boolean {
  const now = new Date()
  const nowKey = (now.getMonth() + 1) * 100 + now.getDate()
  const startKey = (window.startMonth + 1) * 100 + window.startDay
  const endKey = (window.endMonth + 1) * 100 + window.endDay
  if (window.startMonth > window.endMonth) {
    return nowKey >= startKey || nowKey <= endKey
  }
  return nowKey >= startKey && nowKey <= endKey
}

// True when the current date sits inside the league's season window.
// Leagues we haven't tagged default to true (we don't want to hide
// e.g. cricket just because we don't track its calendar).
export function isLeagueInSeason(leagueId: string): boolean {
  const window = SEASON_WINDOWS[leagueId]
  if (!window) return true
  return isInsideWindow(window)
}

// True when the current date sits inside the league's playoff window.
// Soccer leagues + leagues without a fixed postseason window return
// false — surfacing a "Playoffs" pill on continuous-format leagues
// would be misleading.
export function isLeagueInPlayoffs(leagueId: string): boolean {
  const window = PLAYOFF_WINDOWS[leagueId]
  if (!window) return false
  return isInsideWindow(window)
}

export function listLeagues(): SportsLeague[] {
  return LEAGUE_CATALOG.map((l) => ({
    ...l,
    inSeason: isLeagueInSeason(l.id),
    inPlayoffs: isLeagueInPlayoffs(l.id)
  }))
}

export async function listTeams(leagueId: string): Promise<SportsTeam[]> {
  const league = LEAGUES.find((l) => l.id === leagueId)
  if (!league) return []
  const cached = teamsCache.get(leagueId)
  if (cached && Date.now() - cached.fetchedAt < TEAMS_TTL_MS) return cached.value

  const collected: SportsTeam[] = []
  const seen = new Set<string>()
  for (const path of league.paths) {
    try {
      const url = `${ESPN_BASE}/${path}/teams?limit=200`
      const res = (await fetchJson(url)) as {
        sports?: Array<{
          leagues?: Array<{
            teams?: Array<{
              team?: {
                id?: string | number
                displayName?: string
                shortDisplayName?: string
                abbreviation?: string
                location?: string
                name?: string
                logos?: Array<{ href?: string }>
              }
            }>
          }>
        }>
      }
      const teamEntries = res.sports?.[0]?.leagues?.[0]?.teams ?? []
      for (const entry of teamEntries) {
        const t = entry.team
        if (!t?.id) continue
        const id = String(t.id)
        if (seen.has(id)) continue
        seen.add(id)
        collected.push({
          id,
          name: t.name ?? t.displayName ?? t.shortDisplayName ?? id,
          displayName: t.displayName ?? t.name ?? id,
          shortName: t.shortDisplayName ?? t.displayName ?? t.name ?? id,
          abbreviation: t.abbreviation ?? id.toUpperCase(),
          location: t.location ?? null,
          logoURL: t.logos?.[0]?.href ?? null
        })
      }
    } catch (err) {
      console.warn(`[sports] teams ${path} failed:`, err instanceof Error ? err.message : err)
    }
  }
  collected.sort((a, b) => a.displayName.localeCompare(b.displayName))
  teamsCache.set(leagueId, { value: collected, fetchedAt: Date.now() })
  return collected
}

export async function listGames(
  leagueId: string,
  windowDays = 21,
  groupId?: string | null
): Promise<Game[]> {
  const league = LEAGUES.find((l) => l.id === leagueId)
  if (!league) return []
  // Skip the network round-trip entirely when the league is in its
  // off-season AND not in a postseason window. ESPN's scoreboard
  // endpoint returns 404 for date ranges outside the active season
  // (especially CBB in late April / NCAAF in spring), and three
  // background consumers (calendarService, sportsAlertsService,
  // sportsReelScheduler) all poll listGames for every league —
  // without this gate the off-season leagues spam ~14 404s per
  // poll cycle. Cache the empty array so re-calls within the TTL
  // window also short-circuit.
  if (!isLeagueInSeason(leagueId) && !isLeagueInPlayoffs(leagueId)) {
    const cacheKey = `${leagueId}:${windowDays}:${groupId ?? 'all'}`
    scoreboardCache.set(cacheKey, { value: [], fetchedAt: Date.now() })
    return []
  }
  // Cache key includes groupId so a conference filter doesn't share
  // cache with the All-conferences view.
  const cacheKey = `${leagueId}:${windowDays}:${groupId ?? 'all'}`
  const cached = scoreboardCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < SCOREBOARD_TTL_MS) {
    return cached.value
  }

  // ESPN's scoreboard endpoint caps responses at ~100 events per request, which
  // truncates long windows for high-volume leagues like NBA/MLB. Split the
  // window into 7-day chunks and fire all requests in parallel.
  // For NCAA we use shorter chunks (3 days) since a single Saturday
  // can carry 60+ games across all FBS — a 7-day window risks the
  // 100-event cap.
  const now = Date.now()
  const chunkDays = leagueId === 'ncaaf' || leagueId === 'ncaam' ? 3 : 7
  const ranges: Array<{ from: Date; to: Date }> = []
  for (let offset = -windowDays; offset < windowDays; offset += chunkDays) {
    const end = Math.min(offset + chunkDays - 1, windowDays - 1)
    ranges.push({
      from: new Date(now + offset * 86_400_000),
      to: new Date(now + end * 86_400_000)
    })
  }

  const groupParam = groupId ? `&groups=${encodeURIComponent(groupId)}` : ''
  const collected: Game[] = []
  const seen = new Set<string>()
  const tasks: Array<Promise<void>> = []
  for (const path of league.paths) {
    for (const range of ranges) {
      const datesParam = `${fmtEspnDate(range.from)}-${fmtEspnDate(range.to)}`
      const url = `${ESPN_BASE}/${path}/scoreboard?dates=${datesParam}${groupParam}`
      tasks.push(
        fetchJson(url)
          .then((res) => {
            for (const g of extractGames(res, leagueId, path)) {
              if (seen.has(g.id)) continue
              seen.add(g.id)
              collected.push(g)
            }
          })
          .catch((err) => {
            // 404 is expected when ESPN has no events scheduled for
            // the date range — quiet log to keep terminal readable
            // (CBB / NCAAF off-week chunks routinely 404).
            const msg = err instanceof Error ? err.message : String(err)
            if (msg.includes('HTTP 404')) return
            console.warn(`[sports] scoreboard ${path} ${datesParam} failed:`, msg)
          })
      )
    }
  }
  await Promise.all(tasks)
  collected.sort((a, b) => a.date - b.date)
  scoreboardCache.set(cacheKey, { value: collected, fetchedAt: Date.now() })
  return collected
}

export interface SeasonGames {
  games: Game[]
  range: { start: number; end: number; label: string } | null
}

export async function listSeasonGames(leagueId: string): Promise<SeasonGames> {
  const league = LEAGUES.find((l) => l.id === leagueId)
  if (!league) return { games: [], range: null }
  const range = currentSeasonRange(leagueId)
  if (!range) return { games: [], range: null }

  const cacheKey = `${leagueId}:${range.label}`
  const cached = seasonCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < SEASON_TTL_MS) return cached.value

  // Chunk into 14-day windows — ESPN caps ~100 events/request.
  const chunkMs = 14 * 86_400_000
  const ranges: Array<{ from: Date; to: Date }> = []
  for (let t = range.start.getTime(); t <= range.end.getTime(); t += chunkMs) {
    const from = new Date(t)
    const to = new Date(Math.min(t + chunkMs - 86_400_000, range.end.getTime()))
    ranges.push({ from, to })
  }

  const collected: Game[] = []
  const seen = new Set<string>()
  const tasks: Array<Promise<void>> = []
  for (const path of league.paths) {
    for (const r of ranges) {
      const datesParam = `${fmtEspnDate(r.from)}-${fmtEspnDate(r.to)}`
      const url = `${ESPN_BASE}/${path}/scoreboard?dates=${datesParam}`
      tasks.push(
        fetchJson(url)
          .then((res) => {
            for (const g of extractGames(res, leagueId, path)) {
              if (seen.has(g.id)) continue
              seen.add(g.id)
              collected.push(g)
            }
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err)
            if (msg.includes('HTTP 404')) return
            console.warn(`[sports] season ${path} ${datesParam} failed:`, msg)
          })
      )
    }
  }
  await Promise.all(tasks)
  collected.sort((a, b) => a.date - b.date)
  const value: SeasonGames = {
    games: collected,
    range: { start: range.start.getTime(), end: range.end.getTime(), label: range.label }
  }
  seasonCache.set(cacheKey, { value, fetchedAt: Date.now() })
  return value
}

export async function getGameDetail(
  leagueId: string,
  leaguePath: string,
  eventId: string
): Promise<GameDetail | null> {
  const cacheKey = `${leaguePath}:${eventId}`
  const cached = summaryCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < SUMMARY_TTL_MS) {
    return cached.value
  }
  try {
    const url = `${ESPN_BASE}/${leaguePath}/summary?event=${encodeURIComponent(eventId)}`
    const json = await fetchJson(url)
    const detail = extractGameDetail(json, leagueId, leaguePath, eventId)
    if (!detail) return null
    summaryCache.set(cacheKey, { value: detail, fetchedAt: Date.now() })
    return detail
  } catch (err) {
    console.warn('[sports] summary fetch failed:', err instanceof Error ? err.message : err)
    return cached?.value ?? null
  }
}

// ---------- helpers ----------

function fmtEspnDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${d.getUTCDate()}`.padStart(2, '0')
  return `${y}${m}${day}`
}

export interface StatLeader {
  athleteId: string
  athleteName: string
  teamAbbreviation: string | null
  teamId: string | null
  headshotURL: string | null
  value: string
  numericValue: number | null
}

export interface StatCategory {
  key: string
  name: string
  abbreviation: string | null
  leaders: StatLeader[]
}

const leadersCache = new Map<string, ScoreboardCacheEntry<StatCategory[]>>()
const LEADERS_TTL_MS = 10 * 60 * 1000

interface EspnLeadersPayload {
  categories?: Array<{
    name?: string
    displayName?: string
    abbreviation?: string
    leaders?: Array<{
      displayValue?: string
      value?: number
      athlete?: {
        id?: string | number
        displayName?: string
        fullName?: string
        shortName?: string
        headshot?: { href?: string } | string
        team?: { id?: string | number; abbreviation?: string }
      }
      team?: { id?: string | number; abbreviation?: string }
    }>
  }>
  leaders?:
    | Array<{
        name?: string
        displayName?: string
        abbreviation?: string
        leaders?: Array<unknown>
      }>
    | {
        categories?: Array<{
          name?: string
          displayName?: string
          abbreviation?: string
          leaders?: Array<unknown>
        }>
      }
}

function parseLeaderCategories(payload: EspnLeadersPayload): StatCategory[] {
  // v2 shape: { categories: [...] } or { leaders: [...] }
  // v3 shape: { leaders: { categories: [...] } }
  const nestedCats =
    !Array.isArray(payload.leaders) &&
    payload.leaders &&
    typeof payload.leaders === 'object' &&
    Array.isArray((payload.leaders as { categories?: unknown[] }).categories)
      ? ((payload.leaders as { categories?: unknown[] }).categories as Array<unknown>)
      : null
  const cats = (payload.categories ??
    nestedCats ??
    (Array.isArray(payload.leaders) ? payload.leaders : []) ??
    []) as Array<{
    name?: string
    displayName?: string
    abbreviation?: string
    leaders?: unknown[]
  }>
  const out: StatCategory[] = []
  for (const cat of cats) {
    const leaders: StatLeader[] = []
    for (const entry of (cat as { leaders?: unknown[] }).leaders ?? []) {
      const e = entry as {
        displayValue?: string
        value?: number
        athlete?: {
          id?: string | number
          displayName?: string
          fullName?: string
          shortName?: string
          headshot?: { href?: string } | string
          team?: { id?: string | number; abbreviation?: string }
        }
        team?: { id?: string | number; abbreviation?: string }
      }
      const athlete = e.athlete
      if (!athlete) continue
      const headshot =
        typeof athlete.headshot === 'string'
          ? athlete.headshot
          : athlete.headshot?.href ?? null
      const teamObj = athlete.team ?? e.team
      leaders.push({
        athleteId: athlete.id ? String(athlete.id) : '',
        athleteName: athlete.displayName ?? athlete.fullName ?? athlete.shortName ?? 'Unknown',
        teamAbbreviation: teamObj?.abbreviation ?? null,
        teamId: teamObj?.id ? String(teamObj.id) : null,
        headshotURL: headshot,
        value: e.displayValue ?? (e.value !== undefined ? String(e.value) : ''),
        numericValue: typeof e.value === 'number' ? e.value : null
      })
    }
    if (leaders.length === 0) continue
    const name = cat.displayName ?? cat.name ?? cat.abbreviation ?? 'Stat'
    out.push({
      key: (cat.name ?? cat.abbreviation ?? name).toString(),
      name,
      abbreviation: cat.abbreviation ?? null,
      leaders: leaders.slice(0, 5)
    })
  }
  return out
}

// ESPN's leaders endpoint accepts a seasontype query parameter:
//   1 = pre-season, 2 = regular season, 3 = postseason, 4 = off-season
// We only ask for 2 (default) or 3 — pre-season + off-season aren't
// useful for league-page leaderboards. When seasontype is omitted
// ESPN returns the most recent in-progress season segment, which
// usually aligns with regular season but can flip to postseason
// during playoff months.
export type SeasonType = 'regular' | 'postseason'

export async function listLeagueLeaders(
  leagueId: string,
  seasonType: SeasonType = 'regular'
): Promise<StatCategory[]> {
  const league = LEAGUES.find((l) => l.id === leagueId)
  if (!league) return []
  // ESPN's public API has no /leaders endpoint for soccer leagues — the call
  // always 404s. Short-circuit to avoid log spam and wasted round-trips.
  if (league.sport === 'Soccer') return []
  // Off-season + non-playoff: ESPN's leaders endpoint returns
  // 500/404 for dormant leagues. Short-circuit before the call.
  // Postseason leaders specifically are still fetched even outside
  // the regular-season window, since playoff stats persist for
  // some weeks after the championship.
  if (
    !isLeagueInSeason(leagueId) &&
    !isLeagueInPlayoffs(leagueId) &&
    seasonType === 'regular'
  ) {
    return []
  }
  const cacheKey = `l:${leagueId}:${seasonType}`
  const cached = leadersCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < LEADERS_TTL_MS) return cached.value
  const seasonTypeNum = seasonType === 'postseason' ? 3 : 2
  // v3 is the current leaders endpoint; v2 is kept as a fallback for leagues
  // (or future API changes) where v3 doesn't exist.
  const bases = [ESPN_BASE_V3, ESPN_BASE]
  for (const path of league.paths) {
    for (const base of bases) {
      try {
        const url = `${base}/${path}/leaders?seasontype=${seasonTypeNum}`
        const payload = (await fetchJson(url)) as EspnLeadersPayload
        const cats = parseLeaderCategories(payload)
        if (cats.length > 0) {
          leadersCache.set(cacheKey, { value: cats, fetchedAt: Date.now() })
          return cats
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // 404 is the v2-fallback "endpoint doesn't exist for this
        // sub-path" case — already handled by the bases loop.
        // 500 fires for off-season leagues (e.g. NFL leaders during
        // March). Both are recoverable noise; only surface other.
        if (msg.includes('HTTP 404') || msg.includes('HTTP 500')) continue
        console.warn(
          `[sports] leaders ${path} (${base.includes('v3') ? 'v3' : 'v2'}, ${seasonType}) failed:`,
          msg
        )
      }
    }
  }
  leadersCache.set(cacheKey, { value: [], fetchedAt: Date.now() })
  return []
}

export async function listTeamLeaders(
  leagueId: string,
  teamId: string
): Promise<StatCategory[]> {
  const league = LEAGUES.find((l) => l.id === leagueId)
  if (!league) return []
  if (league.sport === 'Soccer') return []
  const key = `t:${leagueId}:${teamId}`
  const cached = leadersCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < LEADERS_TTL_MS) return cached.value
  const bases = [ESPN_BASE_V3, ESPN_BASE]
  for (const path of league.paths) {
    for (const base of bases) {
      try {
        const url = `${base}/${path}/teams/${teamId}/leaders`
        const payload = (await fetchJson(url)) as EspnLeadersPayload
        const cats = parseLeaderCategories(payload)
        if (cats.length > 0) {
          leadersCache.set(key, { value: cats, fetchedAt: Date.now() })
          return cats
        }
      } catch (err) {
        console.warn(
          `[sports] team leaders ${path} ${teamId} (${base.includes('v3') ? 'v3' : 'v2'}) failed:`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }
  leadersCache.set(key, { value: [], fetchedAt: Date.now() })
  return []
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Pulse/0.1 (macOS sports)',
        Accept: 'application/json'
      },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

interface EspnCompetitor {
  id?: string
  homeAway?: string
  winner?: boolean
  score?: string | number
  records?: Array<{ summary?: string; type?: string }>
  team?: {
    id?: string
    displayName?: string
    shortDisplayName?: string
    abbreviation?: string
    logo?: string
    logos?: Array<{ href?: string }>
    color?: string
    alternateColor?: string
  }
}

interface EspnCompetition {
  id?: string
  date?: string
  venue?: { fullName?: string; address?: { city?: string; state?: string; country?: string } }
  broadcasts?: Array<{ names?: string[]; media?: { shortName?: string } }>
  competitors?: EspnCompetitor[]
  status?: EspnStatus
  note?: string
  // Multi-game playoff series metadata. Present when the league
  // groups games into a Best-of-N series (NBA/NHL playoff rounds,
  // MLB postseason rounds, NBA Finals, World Series, Stanley Cup).
  // ESPN's shape varies — sometimes the wins live on `competitors`,
  // sometimes on a top-level `series` object — we accept both.
  series?: {
    title?: string
    summary?: string
    competitors?: Array<{ id?: string | number; wins?: number }>
  }
  notes?: Array<{ headline?: string; type?: string }>
}

interface EspnStatus {
  type?: {
    id?: string
    name?: string
    state?: string
    completed?: boolean
    detail?: string
    shortDetail?: string
    description?: string
  }
  period?: number
  displayClock?: string
}

interface EspnEvent {
  id?: string
  date?: string
  competitions?: EspnCompetition[]
  status?: EspnStatus
}

function extractGames(json: unknown, leagueId: string, leaguePath: string): Game[] {
  const events = (json as { events?: EspnEvent[] }).events ?? []
  const out: Game[] = []
  for (const event of events) {
    const game = buildGameFromEvent(event, leagueId, leaguePath)
    if (game) out.push(game)
  }
  return out
}

function buildGameFromEvent(
  event: EspnEvent,
  leagueId: string,
  leaguePath: string
): Game | null {
  const comp = event.competitions?.[0]
  if (!comp) return null
  const competitors = comp.competitors ?? []
  const homeRaw = competitors.find((c) => c.homeAway === 'home') ?? competitors[0]
  const awayRaw = competitors.find((c) => c.homeAway === 'away') ?? competitors[1]
  if (!homeRaw || !awayRaw) return null
  const status = event.status ?? comp.status
  const state = status?.type?.state ?? 'pre'
  const normalized: GameStatus =
    state === 'in' ? 'in_progress' : state === 'post' ? 'final' : state === 'pre' ? 'scheduled' : 'scheduled'
  const typeName = (status?.type?.name ?? '').toUpperCase()
  const isPostponed = typeName.includes('POSTPONED')
  const isCanceled = typeName.includes('CANCEL')
  const finalStatus: GameStatus = isPostponed ? 'postponed' : isCanceled ? 'canceled' : normalized

  const fallbackVenue =
    [comp.venue?.address?.city, comp.venue?.address?.state].filter(Boolean).join(', ') || null
  const venueName = comp.venue?.fullName ?? fallbackVenue

  const broadcasts: string[] = []
  for (const b of comp.broadcasts ?? []) {
    if (b.names) broadcasts.push(...b.names)
    else if (b.media?.shortName) broadcasts.push(b.media.shortName)
  }

  // Series metadata — extract wins from competitor records or from
  // the top-level series object, whichever ESPN populated. The
  // competitor records for NBA / NHL / MLB postseason often have a
  // record entry whose type === 'playoff' or 'postseason' summarizing
  // the series score (e.g. "2-1"). When that's missing we look for
  // `comp.series.competitors[].wins`. When neither exists we may
  // still have a notes string ("DEN leads series 3-2") to surface.
  const series = extractSeriesSummary(comp, homeRaw, awayRaw)

  return {
    id: event.id ?? comp.id ?? `${leagueId}-${event.date}`,
    leagueId,
    leaguePath,
    date: Date.parse(event.date ?? comp.date ?? '') || 0,
    status: finalStatus,
    statusDetail: status?.type?.detail ?? '',
    statusShort: status?.type?.shortDetail ?? '',
    period: status?.period ?? null,
    displayClock: status?.displayClock ?? null,
    home: toTeam(homeRaw, true),
    away: toTeam(awayRaw, false),
    venue: venueName,
    broadcasts: Array.from(new Set(broadcasts)),
    note: comp.note ?? null,
    series
  }
}

function extractSeriesSummary(
  comp: EspnCompetition,
  homeRaw: EspnCompetitor,
  awayRaw: EspnCompetitor
): Game['series'] {
  // Path 1: competitor.records includes a "playoff" or "postseason"
  // entry summarizing the series. Format is usually "W-L" — we parse
  // both sides.
  const seriesType = /playoff|postseason/i
  const homeRec = (homeRaw.records ?? []).find((r) => seriesType.test(r.type ?? ''))
  const awayRec = (awayRaw.records ?? []).find((r) => seriesType.test(r.type ?? ''))
  let homeWins: number | null = null
  let awayWins: number | null = null
  if (homeRec?.summary) {
    const m = homeRec.summary.match(/^(\d+)\s*-\s*(\d+)/)
    if (m) homeWins = Number(m[1])
  }
  if (awayRec?.summary) {
    const m = awayRec.summary.match(/^(\d+)\s*-\s*(\d+)/)
    if (m) awayWins = Number(m[1])
  }
  // Path 2: top-level series object.
  if (homeWins === null || awayWins === null) {
    const ss = comp.series
    if (ss?.competitors) {
      for (const c of ss.competitors) {
        if (typeof c.wins !== 'number') continue
        const cid = c.id !== undefined ? String(c.id) : ''
        if (homeWins === null && cid === String(homeRaw.id ?? homeRaw.team?.id ?? '')) {
          homeWins = c.wins
        } else if (awayWins === null && cid === String(awayRaw.id ?? awayRaw.team?.id ?? '')) {
          awayWins = c.wins
        }
      }
    }
  }
  // Title resolution: prefer the explicit series.title, then a
  // notes headline starting with the series name. Falls back to null.
  let title: string | null = comp.series?.title ?? comp.series?.summary ?? null
  if (!title && Array.isArray(comp.notes)) {
    const seriesNote = comp.notes.find((n) =>
      /series|finals|championship|conference/i.test(n.headline ?? '')
    )
    if (seriesNote?.headline) title = seriesNote.headline
  }
  // Summary text — use notes when available since it's already
  // human-readable ("Heat lead series 3-2"). Otherwise derive from
  // the wins themselves.
  let summary: string | null = null
  if (Array.isArray(comp.notes)) {
    const seriesNote = comp.notes.find((n) =>
      /series|leads|tied|wins/i.test(n.headline ?? '')
    )
    if (seriesNote?.headline) summary = seriesNote.headline
  }
  if (homeWins !== null && awayWins !== null) {
    return {
      title,
      homeWins,
      awayWins,
      summary
    }
  }
  // Series info present (title/summary) but no parsed wins — still
  // worth surfacing the headline.
  if (title || summary) {
    return { title, homeWins: 0, awayWins: 0, summary }
  }
  return null
}

function toTeam(raw: EspnCompetitor, isHome: boolean): GameTeam {
  const team = raw.team ?? {}
  const logo = team.logo ?? team.logos?.[0]?.href ?? null
  const scoreNum = raw.score !== undefined ? Number(raw.score) : null
  const record = raw.records?.find((r) => (r.type ?? 'total') === 'total')?.summary ?? raw.records?.[0]?.summary ?? null
  return {
    id: String(raw.id ?? team.id ?? ''),
    name: team.displayName ?? team.shortDisplayName ?? 'TBD',
    shortName: team.shortDisplayName ?? team.displayName ?? 'TBD',
    abbreviation: team.abbreviation ?? (team.displayName ?? '??').slice(0, 3).toUpperCase(),
    logoURL: logo,
    score: Number.isFinite(scoreNum) ? (scoreNum as number) : null,
    record,
    isHome,
    winner: raw.winner ?? null,
    color: normalizeHex(team.color),
    altColor: normalizeHex(team.alternateColor)
  }
}

function normalizeHex(v: string | undefined): string | null {
  if (!v) return null
  const t = v.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{3,8}$/.test(t)) return null
  return `#${t}`
}

interface EspnLinescoreValue {
  value?: number
  displayValue?: string
}

interface EspnBoxscoreTeam {
  team?: {
    id?: string | number
    displayName?: string
    homeAway?: string
  }
  homeAway?: string
  statistics?: Array<{ label?: string; name?: string; displayValue?: string }>
  linescores?: Array<EspnLinescoreValue>
}

interface EspnBoxscorePlayerStatGroup {
  name?: string
  type?: string
  text?: string
  keys?: string[]
  labels?: string[]
  descriptions?: string[]
  athletes?: Array<{
    starter?: boolean
    position?: { abbreviation?: string; displayName?: string }
    stats?: string[]
    athlete?: {
      id?: string | number
      displayName?: string
      shortName?: string
      position?: { abbreviation?: string; displayName?: string }
    }
  }>
  totals?: string[]
}

interface EspnBoxscorePlayers {
  team?: {
    id?: string | number
    displayName?: string
    homeAway?: string
  }
  homeAway?: string
  statistics?: EspnBoxscorePlayerStatGroup[]
}

interface EspnSummaryJson {
  header?: {
    competitions?: EspnCompetition[]
    id?: string
  }
  boxscore?: {
    teams?: EspnBoxscoreTeam[]
    players?: EspnBoxscorePlayers[]
  }
  leaders?: Array<{
    team?: { id?: string | number; homeAway?: string }
    leaders?: Array<{
      name?: string
      displayName?: string
      leaders?: Array<{
        displayValue?: string
        athlete?: {
          id?: string | number
          displayName?: string
          shortName?: string
          team?: { id?: string | number }
          // ESPN's gamecast response includes a headshot href on the
          // athlete entry. Sometimes nested as { headshot: { href } },
          // occasionally as a bare string, occasionally absent
          // entirely. When absent we construct from the athlete id
          // using ESPN's deterministic CDN URL pattern.
          headshot?: string | { href?: string }
        }
      }>
    }>
  }>
  headlines?: Array<{
    description?: string
    title?: string
    type?: string
    links?: { web?: { href?: string } }
  }>
}

function extractGameDetail(
  json: unknown,
  leagueId: string,
  leaguePath: string,
  eventId: string
): GameDetail | null {
  const summary = json as EspnSummaryJson
  const compFromHeader = summary.header?.competitions?.[0]
  const base = buildGameFromEvent(
    { id: eventId, competitions: compFromHeader ? [compFromHeader] : [] },
    leagueId,
    leaguePath
  )
  if (!base) return null

  const stats: GameDetailStat[] = []
  const teams = summary.boxscore?.teams ?? []
  // ESPN emits `homeAway` at the top level of a boxscore-team for some leagues
  // (NFL/MLB) and on the nested `team` object for others (NBA/NHL). Checking
  // only one location silently misses half the leagues and falls back to
  // teams[0]/teams[1], whose order isn't guaranteed — which swapped the home
  // and away columns on the game detail page for the mis-ordered leagues.
  const sideOf = (t: (typeof teams)[number]): string | undefined =>
    t.homeAway ?? t.team?.homeAway
  const homeTeam = teams.find((t) => sideOf(t) === 'home') ?? teams[0]
  const awayTeam = teams.find((t) => sideOf(t) === 'away') ?? teams[1]
  if (homeTeam && awayTeam && homeTeam !== awayTeam) {
    const homeStats = homeTeam.statistics ?? []
    const awayStats = awayTeam.statistics ?? []
    const labels = new Set<string>()
    for (const s of homeStats) if (s.label) labels.add(s.label)
    for (const s of awayStats) if (s.label) labels.add(s.label)
    for (const label of labels) {
      const h = homeStats.find((s) => s.label === label)?.displayValue ?? '—'
      const a = awayStats.find((s) => s.label === label)?.displayValue ?? '—'
      stats.push({ label, home: h, away: a })
    }
  }

  const leaders: GameDetail['leaders'] = []
  const homeId = base.home.id
  const awayId = base.away.id
  const blocks = summary.leaders ?? []
  blocks.forEach((block, idx) => {
    const blockTeamId = block.team?.id !== undefined ? String(block.team.id) : ''
    let side: 'home' | 'away'
    if (block.team?.homeAway === 'away') side = 'away'
    else if (block.team?.homeAway === 'home') side = 'home'
    else if (blockTeamId && blockTeamId === awayId) side = 'away'
    else if (blockTeamId && blockTeamId === homeId) side = 'home'
    else side = idx === 0 ? 'away' : 'home'
    for (const cat of block.leaders ?? []) {
      const top = cat.leaders?.[0]
      if (!top) continue
      // Headshot resolution order:
      //   1. Direct field on athlete (string OR { href })
      //   2. Constructed from athlete id via ESPN's CDN pattern —
      //      ESPN's `/i/headshots/{sport}/players/full/{id}.png` is
      //      deterministic and serves the same image you see on
      //      espn.com/{sport}/player/_/id/{id}. The leader payload
      //      often omits the headshot field but always has the id.
      //   3. Team logo (renderer-side fallback when image load fails).
      const rawHeadshot = top.athlete?.headshot
      let headshotURL =
        typeof rawHeadshot === 'string'
          ? rawHeadshot
          : rawHeadshot?.href ?? null
      if (!headshotURL && top.athlete?.id !== undefined) {
        headshotURL = buildEspnHeadshotUrl(leagueId, String(top.athlete.id))
      }
      const teamLogoURL = side === 'home' ? base.home.logoURL : base.away.logoURL
      leaders.push({
        team: side,
        category: cat.displayName ?? cat.name ?? '',
        athlete: top.athlete?.displayName ?? top.athlete?.shortName ?? '',
        value: top.displayValue ?? '',
        headshotURL: headshotURL && headshotURL.startsWith('http') ? headshotURL : null,
        teamLogoURL: teamLogoURL ?? null
      })
    }
  })

  const headlines = (summary.headlines ?? [])
    .filter((h) => (h.type ?? '').toLowerCase() !== 'video')
    .slice(0, 5)
    .map((h) => ({
      title: h.title ?? h.description ?? '',
      description: h.description ?? null,
      link: h.links?.web?.href ?? null
    }))

  const highlightSearchQuery = buildHighlightQuery(base)

  const linescore = leagueId === 'mlb' ? extractLinescore(summary, base) : undefined
  const playerStats =
    leagueId === 'mlb' || leagueId === 'nba'
      ? extractPlayerStats(summary, base)
      : undefined

  // ESPN's standard NBA leaders block ships Points, Assists, Rebounds —
  // and skips 3-pointers even though the boxscore carries the data.
  // Compute a 3PM leader per side from the player stats so the panel
  // gets a fourth row for NBA games.
  if (leagueId === 'nba' && playerStats) {
    for (const side of ['home', 'away'] as const) {
      const teamPlayers = playerStats.find((t) => t.team === side)
      if (!teamPlayers) continue
      const top = pickTop3PMLeader(teamPlayers, summary, side)
      if (!top) continue
      // Skip if a 3-pointer leader is already present (defensive — in
      // case ESPN starts shipping it natively for some games).
      if (
        leaders.some(
          (l) =>
            l.team === side &&
            /^3[-\s]?(point|pt)|three[-\s]?point/i.test(l.category)
        )
      ) {
        continue
      }
      const teamLogoURL = side === 'home' ? base.home.logoURL : base.away.logoURL
      leaders.push({
        team: side,
        category: '3-pointers',
        athlete: top.athlete,
        value: top.value,
        headshotURL: top.headshotURL,
        teamLogoURL: teamLogoURL ?? null
      })
    }
  }

  return { ...base, stats, leaders, headlines, highlightSearchQuery, linescore, playerStats }
}

// Walk a team's NBA player-stats groups to find the player with the
// most made 3-pointers. ESPN's 3PT stat is formatted "made-attempted"
// (e.g., "5-12"); we parse the made portion. Ties broken by attempts
// — fewer attempts wins (better efficiency).
function pickTop3PMLeader(
  teamPlayers: TeamPlayerStats,
  summary: EspnSummaryJson,
  side: 'home' | 'away'
): { athlete: string; value: string; headshotURL: string | null } | null {
  for (const group of teamPlayers.groups) {
    const idx = group.labels.findIndex((l) => /^3pt$|^3-?pt$|^3p$/i.test(l.trim()))
    if (idx < 0) continue
    let bestMade = -1
    let bestAttempts = Number.POSITIVE_INFINITY
    let bestPlayer: PlayerStatLine | null = null
    for (const p of group.players) {
      const raw = p.stats[idx] ?? ''
      const m = raw.match(/^(\d+)\s*[-/]\s*(\d+)/)
      if (!m) continue
      const made = Number(m[1])
      const attempts = Number(m[2])
      if (!Number.isFinite(made)) continue
      if (
        made > bestMade ||
        (made === bestMade && attempts < bestAttempts)
      ) {
        bestMade = made
        bestAttempts = Number.isFinite(attempts) ? attempts : Number.POSITIVE_INFINITY
        bestPlayer = p
      }
    }
    if (!bestPlayer || bestMade <= 0) continue
    // Match the leader to an athlete in summary.boxscore.players for
    // the headshot ID. Match by displayName which is what
    // extractPlayerStats already populates as `athlete`.
    let headshotURL: string | null = null
    const block = (summary.boxscore?.players ?? []).find((p) => {
      const ha = p.homeAway ?? p.team?.homeAway
      return ha === side
    })
    if (block) {
      for (const g of block.statistics ?? []) {
        for (const a of g.athletes ?? []) {
          const name = a.athlete?.displayName ?? a.athlete?.shortName ?? ''
          if (name === bestPlayer.athlete) {
            const id = a.athlete?.id !== undefined ? String(a.athlete.id) : null
            if (id) headshotURL = buildEspnHeadshotUrl('nba', id)
            break
          }
        }
        if (headshotURL) break
      }
    }
    return {
      athlete: bestPlayer.athlete,
      value: `${bestMade}-${bestAttempts === Number.POSITIVE_INFINITY ? '?' : bestAttempts}`,
      headshotURL
    }
  }
  return null
}

function extractLinescore(summary: EspnSummaryJson, base: Game): Linescore | undefined {
  const comp = summary.header?.competitions?.[0]
  const competitors = comp?.competitors ?? []
  const homeComp = competitors.find((c) => c.homeAway === 'home') ?? competitors[0]
  const awayComp = competitors.find((c) => c.homeAway === 'away') ?? competitors[1]
  const homeLine = toLinescoreLine(homeComp, 'home', base, summary)
  const awayLine = toLinescoreLine(awayComp, 'away', base, summary)
  if (!homeLine && !awayLine) return undefined
  const home = homeLine ?? emptyLine('home')
  const away = awayLine ?? emptyLine('away')
  const columns = Math.max(home.innings.length, away.innings.length)
  // Pad short sides (e.g. bottom of 9th not needed when home is winning).
  while (home.innings.length < columns) home.innings.push(null)
  while (away.innings.length < columns) away.innings.push(null)
  return { home, away, columns }
}

function emptyLine(team: 'home' | 'away'): LinescoreSide {
  return { team, innings: [], runs: null, hits: null, errors: null }
}

interface EspnCompetitorWithLine extends EspnCompetitor {
  linescores?: EspnLinescoreValue[]
}

function toLinescoreLine(
  competitor: EspnCompetitor | undefined,
  team: 'home' | 'away',
  base: Game,
  summary: EspnSummaryJson
): LinescoreSide | null {
  if (!competitor) return null
  const ls = (competitor as EspnCompetitorWithLine).linescores
  const innings: Array<number | null> = (ls ?? []).map((v) =>
    typeof v.value === 'number' ? v.value : v.displayValue ? Number(v.displayValue) : null
  )

  const teamBox = summary.boxscore?.teams?.find((t) => {
    const ha = t.homeAway ?? t.team?.homeAway
    return ha === team
  })
  const teamStats = teamBox?.statistics ?? []
  const statByLabel = (label: string): string | undefined => {
    const lc = label.toLowerCase()
    const match = teamStats.find((s) => {
      const l = s.label?.toLowerCase() ?? ''
      const n = s.name?.toLowerCase() ?? ''
      return l === lc || n === lc
    })
    return match?.displayValue
  }

  const runs =
    team === 'home' ? base.home.score ?? numOrNull(statByLabel('R')) : base.away.score ?? numOrNull(statByLabel('R'))
  const hits = numOrNull(statByLabel('H') ?? statByLabel('hits'))
  const errors = numOrNull(statByLabel('E') ?? statByLabel('errors'))

  if (innings.length === 0 && runs === null && hits === null && errors === null) return null
  return { team, innings, runs, hits, errors }
}

function numOrNull(s: string | undefined): number | null {
  if (s === undefined) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function extractPlayerStats(
  summary: EspnSummaryJson,
  base: Game
): TeamPlayerStats[] | undefined {
  const players = summary.boxscore?.players ?? []
  if (players.length === 0) return undefined
  const out: TeamPlayerStats[] = []
  for (const block of players) {
    const ha = block.homeAway ?? block.team?.homeAway
    let side: 'home' | 'away' | null = null
    if (ha === 'home' || ha === 'away') side = ha
    else {
      const id = block.team?.id !== undefined ? String(block.team.id) : ''
      if (id && id === base.home.id) side = 'home'
      else if (id && id === base.away.id) side = 'away'
    }
    if (!side) continue
    const groups: PlayerStatGroup[] = []
    for (const group of block.statistics ?? []) {
      const labels = (group.labels ?? group.keys ?? []).slice()
      if (labels.length === 0) continue
      const descriptions = group.descriptions ?? []
      const category = group.text ?? group.type ?? group.name ?? ''
      const players: PlayerStatLine[] = []
      for (const a of group.athletes ?? []) {
        const name = a.athlete?.displayName ?? a.athlete?.shortName ?? ''
        const pos = a.position?.abbreviation ?? a.athlete?.position?.abbreviation ?? ''
        const stats = (a.stats ?? []).slice()
        if (!name) continue
        // Pad stats array to match labels length.
        while (stats.length < labels.length) stats.push('')
        players.push({ athlete: name, position: pos, stats, isStarter: a.starter ?? false })
      }
      const totals = group.totals && group.totals.length > 0 ? group.totals.slice() : null
      groups.push({ category, labels, descriptions, players, totals })
    }
    if (groups.length > 0) out.push({ team: side, groups })
  }
  return out.length > 0 ? out : undefined
}

// ESPN serves player headshots from a deterministic CDN URL keyed by
// league + athlete id. When the leader payload omits the inline
// headshot field, the constructed URL is the same image — and works
// even for players ESPN didn't bother enriching the leader entry for.
//
// Sport segment in the URL matches the major league name: "nba",
// "nfl", "mlb", "nhl", "soccer", "wnba", etc. League-id mapping
// kept tight here so a future league addition needs an explicit
// entry — silently constructing a wrong-sport URL would 404 every
// headshot for that league.
const ESPN_HEADSHOT_SPORT_BY_LEAGUE: Record<string, string> = {
  nba: 'nba',
  nfl: 'nfl',
  mlb: 'mlb',
  nhl: 'nhl',
  // ESPN groups all club-soccer leagues under /i/headshots/soccer/.
  ucl: 'soccer',
  uel: 'soccer',
  epl: 'soccer',
  laliga: 'soccer',
  seriea: 'soccer',
  mls: 'soccer',
  bundesliga: 'soccer',
  ligue1: 'soccer'
}

function buildEspnHeadshotUrl(leagueId: string, athleteId: string): string | null {
  const sport = ESPN_HEADSHOT_SPORT_BY_LEAGUE[leagueId.toLowerCase()]
  if (!sport) return null
  if (!athleteId || !/^\d+$/.test(athleteId)) return null
  return `https://a.espncdn.com/i/headshots/${sport}/players/full/${athleteId}.png`
}

function buildHighlightQuery(game: Game): string {
  const d = new Date(game.date)
  const dateStr = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
  const league = LEAGUES.find((l) => l.id === game.leagueId)?.name ?? game.leagueId
  return `${game.away.name} vs ${game.home.name} ${league} highlights ${dateStr}`
}
