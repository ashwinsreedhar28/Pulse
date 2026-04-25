// Sports data via ESPN's public (unofficial) site API.
// Scoreboard: GET /apis/site/v2/sports/{sport}/{league}/scoreboard[?dates=YYYYMMDD-YYYYMMDD]
// Summary:    GET /apis/site/v2/sports/{sport}/{league}/summary?event={eventId}

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
const ESPN_BASE_V3 = 'https://site.api.espn.com/apis/site/v3/sports'
const FETCH_TIMEOUT_MS = 12_000
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
}

export const LEAGUES: SportsLeague[] = [
  { id: 'nfl', name: 'NFL', shortName: 'NFL', sport: 'American Football', paths: ['football/nfl'] },
  { id: 'nba', name: 'NBA', shortName: 'NBA', sport: 'Basketball', paths: ['basketball/nba'] },
  { id: 'mlb', name: 'MLB', shortName: 'MLB', sport: 'Baseball', paths: ['baseball/mlb'] },
  { id: 'nhl', name: 'NHL', shortName: 'NHL', sport: 'Hockey', paths: ['hockey/nhl'] },
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

export function listLeagues(): SportsLeague[] {
  return LEAGUES
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

export async function listGames(leagueId: string, windowDays = 21): Promise<Game[]> {
  const league = LEAGUES.find((l) => l.id === leagueId)
  if (!league) return []
  const cacheKey = `${leagueId}:${windowDays}`
  const cached = scoreboardCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < SCOREBOARD_TTL_MS) {
    return cached.value
  }

  // ESPN's scoreboard endpoint caps responses at ~100 events per request, which
  // truncates long windows for high-volume leagues like NBA/MLB. Split the
  // window into 7-day chunks and fire all requests in parallel.
  const now = Date.now()
  const chunkDays = 7
  const ranges: Array<{ from: Date; to: Date }> = []
  for (let offset = -windowDays; offset < windowDays; offset += chunkDays) {
    const end = Math.min(offset + chunkDays - 1, windowDays - 1)
    ranges.push({
      from: new Date(now + offset * 86_400_000),
      to: new Date(now + end * 86_400_000)
    })
  }

  const collected: Game[] = []
  const seen = new Set<string>()
  const tasks: Array<Promise<void>> = []
  for (const path of league.paths) {
    for (const range of ranges) {
      const datesParam = `${fmtEspnDate(range.from)}-${fmtEspnDate(range.to)}`
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
            console.warn(
              `[sports] scoreboard ${path} ${datesParam} failed:`,
              err instanceof Error ? err.message : err
            )
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
            console.warn(
              `[sports] season ${path} ${datesParam} failed:`,
              err instanceof Error ? err.message : err
            )
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

export async function listLeagueLeaders(leagueId: string): Promise<StatCategory[]> {
  const league = LEAGUES.find((l) => l.id === leagueId)
  if (!league) return []
  // ESPN's public API has no /leaders endpoint for soccer leagues — the call
  // always 404s. Short-circuit to avoid log spam and wasted round-trips.
  if (league.sport === 'Soccer') return []
  const cached = leadersCache.get(`l:${leagueId}`)
  if (cached && Date.now() - cached.fetchedAt < LEADERS_TTL_MS) return cached.value
  // v3 is the current leaders endpoint; v2 is kept as a fallback for leagues
  // (or future API changes) where v3 doesn't exist.
  const bases = [ESPN_BASE_V3, ESPN_BASE]
  for (const path of league.paths) {
    for (const base of bases) {
      try {
        const url = `${base}/${path}/leaders`
        const payload = (await fetchJson(url)) as EspnLeadersPayload
        const cats = parseLeaderCategories(payload)
        if (cats.length > 0) {
          leadersCache.set(`l:${leagueId}`, { value: cats, fetchedAt: Date.now() })
          return cats
        }
      } catch (err) {
        console.warn(
          `[sports] leaders ${path} (${base.includes('v3') ? 'v3' : 'v2'}) failed:`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }
  leadersCache.set(`l:${leagueId}`, { value: [], fetchedAt: Date.now() })
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
    note: comp.note ?? null
  }
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
          displayName?: string
          shortName?: string
          team?: { id?: string | number }
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
      leaders.push({
        team: side,
        category: cat.displayName ?? cat.name ?? '',
        athlete: top.athlete?.displayName ?? top.athlete?.shortName ?? '',
        value: top.displayValue ?? ''
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

  return { ...base, stats, leaders, headlines, highlightSearchQuery, linescore, playerStats }
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

function buildHighlightQuery(game: Game): string {
  const d = new Date(game.date)
  const dateStr = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
  const league = LEAGUES.find((l) => l.id === game.leagueId)?.name ?? game.leagueId
  return `${game.away.name} vs ${game.home.name} ${league} highlights ${dateStr}`
}
