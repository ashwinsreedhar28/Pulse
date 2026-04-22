import { contextBridge, ipcRenderer } from 'electron'

// ---- Types shared with renderer via `window.api` ----
export type Domain = 'finance' | 'general'
export type GeoType = 'city' | 'state' | 'country' | 'region'

export interface Category {
  id: number
  name: string
  sortOrder: number
  notificationsEnabled: boolean
  domain: Domain
}

export interface Feed {
  id: number
  title: string
  url: string
  categoryId: number
  isEnabled: boolean
  lastFetchedAt: number | null
  iconURL: string | null
}

export interface Article {
  id: number
  feedId: number
  guid: string | null
  title: string
  summary: string | null
  url: string
  publishedAt: number | null
  isRead: boolean
  isBookmarked: boolean
  urgencyScore: number | null
  urgencyReason: string | null
  scoredAt: number | null
  domain: Domain
  imageURL: string | null
  feedTitle: string
  feedIconURL: string | null
}

export interface Reel {
  id: number
  articleId: number
  script: string
  beats: string[]
  keyframes: string[]
  videoClips: string[]
  audioFile: string
  durationMs: number | null
  createdAt: number
  articleTitle: string
  articleSummary: string | null
  articleURL: string
  articleImageURL: string | null
  feedTitle: string
  domain: Domain
  publishedAt: number | null
}

export type PiperStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'downloading'; pct: number; stage: string }
  | { state: 'extracting' }
  | { state: 'ready' }
  | { state: 'failed'; reason: string }
  | { state: 'unsupported'; reason: string }

export type KokoroStatus =
  | { state: 'idle' }
  | { state: 'unsupported'; reason: string }
  | { state: 'checking-python' }
  | { state: 'creating-venv' }
  | { state: 'installing-deps'; line?: string }
  | { state: 'starting-worker' }
  | { state: 'loading-model' }
  | { state: 'ready' }
  | { state: 'failed'; reason: string }

export interface KokoroVoice {
  id: string
  label: string
}

export type VideoGenStatus =
  | { state: 'idle' }
  | { state: 'unsupported'; reason: string }
  | { state: 'checking-python' }
  | { state: 'creating-venv' }
  | { state: 'installing-deps'; line?: string }
  | { state: 'downloading-model'; pct?: number }
  | { state: 'starting-worker' }
  | { state: 'loading-model' }
  | { state: 'ready' }
  | { state: 'failed'; reason: string }

export type MediaToolsStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'installing'; line?: string }
  | { state: 'ready' }
  | { state: 'unavailable'; reason: string }
  | { state: 'failed'; reason: string }

export interface Ticker {
  id: number
  symbol: string
  companyName: string
  sector: string | null
  industry: string | null
  isActive: boolean
  addedAt: number
}

export interface GeoInterest {
  id: number
  displayName: string
  type: GeoType
  keywords: string[]
  isActive: boolean
  addedAt: number
}

export interface ListArticlesOptions {
  domain?: Domain
  categoryId?: number
  unreadOnly?: boolean
  bookmarkedOnly?: boolean
  limit?: number
}

export interface CreateFeedInput {
  title: string
  url: string
  categoryId: number
  iconURL?: string | null
}

export interface CreateTickerInput {
  symbol: string
  companyName: string
  sector?: string | null
  industry?: string | null
}

export interface CreateGeoInterestInput {
  displayName: string
  type: GeoType
  keywords: string[]
}

export interface PollSummary {
  startedAt: number
  durationMs: number
  feedsPolled: number
  articlesInserted: number
  errors: Array<{ feedId: number; title: string; error: string }>
}

export interface ProbeFeedResult {
  status: 'ok' | 'error'
  title?: string
  description?: string | null
  homepageURL?: string | null
  error?: string
}

export type TtsEngine = 'kokoro' | 'piper' | 'say'
export type Theme = 'system' | 'default' | 'light' | 'fiesta' | 'zazu' | 'ocean' | 'casino'
export type ResolvedTheme = Exclude<Theme, 'system'>

export interface Preferences {
  pollIntervalMin: number
  digestIntervalMin: number
  quietHoursStart: string
  quietHoursEnd: string
  quietHoursEnabled: boolean
  launchAtLogin: boolean
  density: 'compact' | 'comfortable'
  favoriteTeamAlertsEnabled: boolean
  ttsEngine: TtsEngine
  ttsVoice: string
  theme: Theme
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

export interface FavoriteTeam {
  id: number
  leagueId: string
  teamId: string
  teamName: string
  abbreviation: string
  logoURL: string | null
  alertsEnabled: boolean
  addedAt: number
}

export interface AddFavoriteTeamInput {
  leagueId: string
  teamId: string
  teamName: string
  abbreviation: string
  logoURL?: string | null
}

export interface FavoriteAthlete {
  id: number
  leagueId: string
  athleteId: string
  athleteName: string
  teamId: string | null
  teamAbbreviation: string | null
  position: string | null
  headshotURL: string | null
  addedAt: number
}

export interface AddFavoriteAthleteInput {
  leagueId: string
  athleteId: string
  athleteName: string
  teamId?: string | null
  teamAbbreviation?: string | null
  position?: string | null
  headshotURL?: string | null
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

export interface SportsGameOpenPayload {
  leagueId: string
  leaguePath: string
  eventId: string
}

export interface DiscoverySuggestion {
  id: number
  ticker: string
  companyName: string
  reason: string
  sourceArticleIds: number[]
  createdAt: number
  isViewed: boolean
  mode: string
}

export interface StockQuote {
  symbol: string
  price: number | null
  open: number | null
  high: number | null
  low: number | null
  change: number | null
  changePct: number | null
  volume: number | null
  time: string | null
}

export type HistoryRange = '1D' | '5D' | '1W' | '1M' | '3M' | '1Y' | '5Y' | 'MAX'

export interface HistoryPoint {
  t: number
  v: number
}

export interface Fundamentals {
  peRatio: number | null
  forwardPE: number | null
  eps: number | null
  marketCap: number | null
  dividendYield: number | null
  weekHigh52: number | null
  weekLow52: number | null
  currency: string | null
  fetchedAt: number
}

export interface CompanyProfile {
  symbol: string
  description: string
  generatedAt: number
}

export interface SportsLeague {
  id: string
  name: string
  sport: string
  shortName: string
  paths: string[]
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

export interface SeasonGames {
  games: Game[]
  range: { start: number; end: number; label: string } | null
}

export interface SportsReelGroup {
  league: SportsLeague
  games: Game[]
}

export interface SportsReelSnapshot {
  groups: SportsReelGroup[]
  warmed: boolean
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

export interface GameDetail extends Game {
  stats: GameDetailStat[]
  headlines: Array<{ title: string; link: string | null; description: string | null }>
  leaders: Array<{ team: 'home' | 'away'; category: string; athlete: string; value: string }>
  highlightSearchQuery: string
  linescore?: Linescore
  playerStats?: TeamPlayerStats[]
}

export interface ReaderResult {
  status: 'ok' | 'error'
  title?: string
  byline?: string | null
  siteName?: string | null
  contentHTML?: string
  textLength?: number
  excerpt?: string | null
  error?: string
}

export interface SmartLookup {
  term: string
  title: string | null
  summary: string
  source: 'wikipedia' | 'ollama'
  sourceURL: string | null
  thumbnailURL: string | null
  createdAt: number
}

export interface FeedFinderCandidate {
  title: string
  url: string
  category: string
  reason: string
  alreadySubscribed: boolean
}

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
  date: number
  title: string
  subtitle: string | null
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
    category?: string
  }
}

export interface CalendarStrip {
  from: number
  to: number
  events: CalendarEvent[]
  fetchedAt: number
}

export interface FeedFinderResult {
  status: 'ok' | 'ollama-offline' | 'no-candidates'
  reply: string
  candidates: FeedFinderCandidate[]
}

export interface FeedProbeResult {
  status: 'ok' | 'error'
  title?: string
  description?: string | null
  homepageURL?: string | null
  error?: string
}

// Hyperintelligence dispatcher payload shapes. The renderer switches on
// `kind` and renders the appropriate card cluster per turn.
export type SettingsTab =
  | 'categories'
  | 'feeds'
  | 'tickers'
  | 'locations'
  | 'teams'
  | 'preferences'

export interface SettingsDescriptor {
  key: string
  label: string
  tab: SettingsTab
  keywords: string[]
}

export interface SettingsSnapshot {
  descriptor: SettingsDescriptor
  value: string
  note?: string
}

export interface InspectSettingsResult {
  status: 'ok' | 'no-match'
  question: string
  snapshots: SettingsSnapshot[]
  reply: string
}

export interface HyperQaResult {
  answer: string
  source: 'wikipedia' | 'ollama' | 'none'
  sourceTitle: string | null
  sourceURL: string | null
  confident: boolean
}

// Settings write path — the Hyperintelligence dispatcher can propose a
// change, the renderer shows a before→after card with an APPLY button, and
// the opaque `change` blob rides back through hyper:applySettings for the
// actual commit.
export interface SettingsProposalDescriptor {
  key: string
  label: string
  tab: SettingsTab
}

export type SettingsChange =
  | {
      kind: 'pref'
      // `keyof Preferences` — stringly typed here because Preferences is
      // declared separately and both sides share the underlying store.
      key: string
      value: string | number | boolean
    }
  | { kind: 'calendarWindow'; days: number }

export interface SettingsProposal {
  descriptor: SettingsProposalDescriptor
  currentValueDisplay: string
  proposedValueDisplay: string
  change: SettingsChange
  reply: string
}

export interface SettingsRejection {
  descriptor: SettingsProposalDescriptor
  requestedValue: string
  reason: string
  allowedValues: string[]
  reply: string
}

export type HyperResponse =
  | { kind: 'feeds'; reply: string; payload: FeedFinderResult }
  | {
      kind: 'articles'
      reply: string
      payload: { articles: Article[]; query: string }
    }
  | { kind: 'qa'; reply: string; payload: HyperQaResult }
  | { kind: 'settings'; reply: string; payload: InspectSettingsResult }
  | { kind: 'settings-proposal'; reply: string; payload: SettingsProposal }
  | { kind: 'settings-rejection'; reply: string; payload: SettingsRejection }
  | { kind: 'offline'; reply: string }

export interface HyperChatMeta {
  id: number
  title: string
  createdAt: number
  updatedAt: number
}

export interface HyperChat extends HyperChatMeta {
  turns: unknown[]
}

export interface SaveHyperChatInput {
  id: number | null
  title: string
  turns: unknown[]
}

export type CalendarEventKindId =
  | 'earnings'
  | 'games'
  | 'launches'
  | 'dividends'
  | 'ipos'
  | 'stockSplits'
  | 'fedMeetings'
  | 'econReleases'
  | 'worldEvents'

export interface PulseConfig {
  version: number
  calendar: {
    windowDays: number
    eventKinds: Record<CalendarEventKindId, { enabled: boolean }>
  }
}

export interface PulseConfigPatch {
  calendar?: {
    windowDays?: number
    eventKinds?: Partial<Record<CalendarEventKindId, { enabled: boolean }>>
  }
}

export type ConfigExportResult =
  | { ok: true; path: string }
  | { ok: false; canceled?: true; error?: string }

export type ConfigImportResult =
  | { ok: true; config: PulseConfig }
  | { ok: false; canceled?: true; error?: string }

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

const api = {
  app: {
    getTheme: () => invoke<'dark' | 'light'>('app:getTheme'),
    rendererReady: () => invoke<void>('app:rendererReady'),
    showMainWindow: () => invoke<void>('app:showMainWindow'),
    hidePopover: () => invoke<void>('app:hidePopover'),
    getOllamaStatus: () => invoke<'online' | 'offline'>('app:getOllamaStatus'),
    onOllamaStatusChange: (cb: (status: 'online' | 'offline') => void): (() => void) => {
      const listener = (_e: unknown, status: 'online' | 'offline'): void => cb(status)
      ipcRenderer.on('app:ollamaStatus', listener)
      return (): void => {
        ipcRenderer.off('app:ollamaStatus', listener)
      }
    }
  },
  categories: {
    list: () => invoke<Category[]>('db:categories:list'),
    create: (name: string, domain: Domain) =>
      invoke<Category>('db:categories:create', name, domain),
    rename: (id: number, name: string) => invoke<void>('db:categories:rename', id, name),
    setNotifications: (id: number, enabled: boolean) =>
      invoke<void>('db:categories:setNotifications', id, enabled),
    setDomain: (id: number, domain: Domain) =>
      invoke<void>('db:categories:setDomain', id, domain),
    delete: (id: number) => invoke<void>('db:categories:delete', id),
    reorder: (ids: number[]) => invoke<void>('db:categories:reorder', ids)
  },
  feeds: {
    list: () => invoke<Feed[]>('db:feeds:list'),
    countsByCategory: () => invoke<Record<number, number>>('db:feeds:countsByCategory'),
    create: (input: CreateFeedInput) => invoke<Feed>('db:feeds:create', input),
    delete: (id: number) => invoke<void>('db:feeds:delete', id),
    setEnabled: (id: number, enabled: boolean) =>
      invoke<void>('db:feeds:setEnabled', id, enabled),
    rename: (id: number, title: string) => invoke<void>('db:feeds:rename', id, title),
    setCategory: (id: number, categoryId: number) =>
      invoke<void>('db:feeds:setCategory', id, categoryId),
    probe: (url: string) => invoke<ProbeFeedResult>('feeds:probe', url),
    refreshAll: () => invoke<PollSummary>('feeds:refreshAll'),
    onPolled: (cb: (summary: PollSummary) => void): (() => void) => {
      const listener = (_e: unknown, summary: PollSummary): void => cb(summary)
      ipcRenderer.on('feeds:polled', listener)
      return (): void => {
        ipcRenderer.off('feeds:polled', listener)
      }
    }
  },
  articles: {
    list: (opts: ListArticlesOptions = {}) => invoke<Article[]>('db:articles:list', opts),
    unreadCountsByCategory: () =>
      invoke<Record<number, number>>('db:articles:unreadCountsByCategory'),
    recentCountsByCategory: (sinceMs: number) =>
      invoke<Record<number, number>>('db:articles:recentCountsByCategory', sinceMs),
    countBookmarked: () => invoke<number>('db:articles:countBookmarked'),
    markRead: (id: number, read: boolean) => invoke<void>('db:articles:markRead', id, read),
    setBookmarked: (id: number, bookmarked: boolean) =>
      invoke<void>('db:articles:setBookmarked', id, bookmarked),
    listForTicker: (tickerId: number) =>
      invoke<Article[]>('db:articles:listForTicker', tickerId),
    onOpen: (cb: (articleId: number) => void): (() => void) => {
      const listener = (_e: unknown, id: number): void => cb(id)
      ipcRenderer.on('articles:open', listener)
      return (): void => {
        ipcRenderer.off('articles:open', listener)
      }
    }
  },
  tickers: {
    list: () => invoke<Ticker[]>('db:tickers:list'),
    create: (input: CreateTickerInput) => invoke<Ticker>('db:tickers:create', input),
    delete: (id: number) => invoke<void>('db:tickers:delete', id),
    summarize: (id: number) =>
      invoke<{
        summary: string | null
        articleCount: number
        generatedAt: number | null
      } | null>('tickers:summarize', id),
    onSummaryUpdated: (cb: (tickerId: number) => void): (() => void) => {
      const listener = (_e: unknown, id: number): void => cb(id)
      ipcRenderer.on('tickers:summaryUpdated', listener)
      return (): void => {
        ipcRenderer.off('tickers:summaryUpdated', listener)
      }
    }
  },
  geo: {
    list: () => invoke<GeoInterest[]>('db:geo:list'),
    create: (input: CreateGeoInterestInput) => invoke<GeoInterest>('db:geo:create', input),
    updateKeywords: (id: number, keywords: string[]) =>
      invoke<void>('db:geo:updateKeywords', id, keywords),
    delete: (id: number) => invoke<void>('db:geo:delete', id)
  },
  prefs: {
    get: () => invoke<Preferences>('db:prefs:get'),
    set: (key: keyof Preferences, value: string | number | boolean) =>
      invoke<void>('db:prefs:set', key, value),
    apply: () => invoke<void>('prefs:apply'),
    getResolvedTheme: () => invoke<ResolvedTheme>('prefs:getResolvedTheme'),
    onDensityChange: (cb: (density: 'compact' | 'comfortable') => void): (() => void) => {
      const listener = (_e: unknown, d: 'compact' | 'comfortable'): void => cb(d)
      ipcRenderer.on('prefs:density', listener)
      return (): void => {
        ipcRenderer.off('prefs:density', listener)
      }
    },
    onThemeChange: (cb: (theme: ResolvedTheme) => void): (() => void) => {
      const listener = (_e: unknown, t: ResolvedTheme): void => cb(t)
      ipcRenderer.on('prefs:theme', listener)
      return (): void => {
        ipcRenderer.off('prefs:theme', listener)
      }
    }
  },
  discovery: {
    list: () => invoke<DiscoverySuggestion[]>('db:discovery:list'),
    countUnviewed: () => invoke<number>('db:discovery:countUnviewed'),
    markViewed: (id: number) => invoke<void>('db:discovery:markViewed', id),
    markAllViewed: () => invoke<void>('db:discovery:markAllViewed'),
    delete: (id: number) => invoke<void>('db:discovery:delete', id),
    runDaily: () => invoke<number>('discovery:runDaily'),
    runWeekly: () => invoke<number>('discovery:runWeekly'),
    runPortfolioGaps: () => invoke<number>('discovery:runPortfolioGaps')
  },
  reader: {
    extract: (url: string) => invoke<ReaderResult>('reader:extract', url),
    smartLookup: (term: string, context?: string) =>
      invoke<SmartLookup | null>('reader:smartLookup', term, context)
  },
  ipo: {
    getBrief: (input: { symbol: string; companyName: string }) =>
      invoke<ReaderResult>('ipo:getBrief', input)
  },
  feedFinder: {
    ask: (message: string) => invoke<FeedFinderResult>('feedFinder:ask', message),
    probe: (url: string) => invoke<FeedProbeResult>('feedFinder:probe', url),
    add: (input: { title: string; url: string; categoryName: string; domain: Domain }) =>
      invoke<Feed>('feedFinder:add', input)
  },
  hyper: {
    ask: (message: string) => invoke<HyperResponse>('hyper:ask', message),
    applySettings: (change: SettingsChange) =>
      invoke<void>('hyper:applySettings', change)
  },
  hyperChats: {
    list: () => invoke<HyperChatMeta[]>('hyperChats:list'),
    get: (id: number) => invoke<HyperChat | null>('hyperChats:get', id),
    save: (input: SaveHyperChatInput) => invoke<number>('hyperChats:save', input),
    delete: (id: number) => invoke<void>('hyperChats:delete', id)
  },
  stocks: {
    getQuotes: () => invoke<StockQuote[]>('stocks:getQuotes'),
    refresh: () => invoke<StockQuote[]>('stocks:refresh'),
    getHistory: (symbol: string, range: HistoryRange) =>
      invoke<HistoryPoint[]>('stocks:getHistory', symbol, range),
    getFundamentals: (symbol: string) =>
      invoke<Fundamentals | null>('stocks:getFundamentals', symbol),
    getCompanyProfile: (symbol: string) =>
      invoke<CompanyProfile | null>('stocks:getCompanyProfile', symbol),
    ensureCompanyProfile: (symbol: string, companyName: string) =>
      invoke<CompanyProfile | null>('stocks:ensureCompanyProfile', symbol, companyName),
    regenerateCompanyProfile: (symbol: string, companyName: string) =>
      invoke<CompanyProfile | null>('stocks:regenerateCompanyProfile', symbol, companyName),
    onUpdated: (cb: (quotes: StockQuote[]) => void): (() => void) => {
      const listener = (_e: unknown, quotes: StockQuote[]): void => cb(quotes)
      ipcRenderer.on('stocks:updated', listener)
      return (): void => {
        ipcRenderer.off('stocks:updated', listener)
      }
    }
  },
  sports: {
    listLeagues: () => invoke<SportsLeague[]>('sports:listLeagues'),
    listGames: (leagueId: string) => invoke<Game[]>('sports:listGames', leagueId),
    listSeasonGames: (leagueId: string) => invoke<SeasonGames>('sports:listSeasonGames', leagueId),
    listTeams: (leagueId: string) => invoke<SportsTeam[]>('sports:listTeams', leagueId),
    getGameDetail: (leagueId: string, leaguePath: string, eventId: string) =>
      invoke<GameDetail | null>('sports:getGameDetail', leagueId, leaguePath, eventId),
    listLeagueLeaders: (leagueId: string) =>
      invoke<StatCategory[]>('sports:listLeagueLeaders', leagueId),
    listTeamLeaders: (leagueId: string, teamId: string) =>
      invoke<StatCategory[]>('sports:listTeamLeaders', leagueId, teamId),
    getReelGroups: () => invoke<SportsReelSnapshot>('sports:getReelGroups'),
    onReelUpdated: (cb: (snapshot: SportsReelSnapshot) => void): (() => void) => {
      const listener = (_e: unknown, snapshot: SportsReelSnapshot): void => cb(snapshot)
      ipcRenderer.on('sports:reelUpdated', listener)
      return (): void => {
        ipcRenderer.off('sports:reelUpdated', listener)
      }
    },
    onOpenGame: (cb: (payload: SportsGameOpenPayload) => void): (() => void) => {
      const listener = (_e: unknown, payload: SportsGameOpenPayload): void => cb(payload)
      ipcRenderer.on('sports:openGame', listener)
      return (): void => {
        ipcRenderer.off('sports:openGame', listener)
      }
    }
  },
  calendar: {
    get: () => invoke<CalendarStrip>('calendar:get')
  },
  config: {
    get: () => invoke<PulseConfig>('config:get'),
    update: (patch: PulseConfigPatch) => invoke<PulseConfig>('config:update', patch),
    export: () => invoke<ConfigExportResult>('config:export'),
    import: () => invoke<ConfigImportResult>('config:import')
  },
  favoriteTeams: {
    list: () => invoke<FavoriteTeam[]>('db:favoriteTeams:list'),
    add: (input: AddFavoriteTeamInput) => invoke<FavoriteTeam>('db:favoriteTeams:add', input),
    delete: (id: number) => invoke<void>('db:favoriteTeams:delete', id),
    setAlerts: (id: number, enabled: boolean) =>
      invoke<void>('db:favoriteTeams:setAlerts', id, enabled)
  },
  favoriteAthletes: {
    list: () => invoke<FavoriteAthlete[]>('db:favoriteAthletes:list'),
    add: (input: AddFavoriteAthleteInput) =>
      invoke<FavoriteAthlete>('db:favoriteAthletes:add', input),
    delete: (id: number) => invoke<void>('db:favoriteAthletes:delete', id)
  },
  reels: {
    list: (limit?: number) => invoke<Reel[]>('db:reels:list', limit),
    count: () => invoke<number>('db:reels:count'),
    delete: (id: number) => invoke<void>('db:reels:delete', id),
    generate: () => invoke<number>('reels:generate'),
    generateForArticle: (articleId: number) =>
      invoke<{ ok: true; reelId: number } | { ok: false; reason: string }>(
        'reels:generateForArticle',
        articleId
      ),
    rebuildAudio: () => invoke<number>('reels:rebuildAudio'),
    rebuildOne: (id: number) => invoke<boolean>('reels:rebuildOne', id),
    getPiperStatus: () => invoke<PiperStatus>('reels:piperStatus'),
    getVideoGenStatus: () => invoke<VideoGenStatus>('reels:videoGenStatus'),
    getMediaToolsStatus: () => invoke<MediaToolsStatus>('reels:mediaToolsStatus'),
    getKokoroStatus: () => invoke<KokoroStatus>('reels:kokoroStatus'),
    listKokoroVoices: () => invoke<KokoroVoice[]>('reels:kokoroVoices'),
    onPiperStatus: (cb: (status: PiperStatus) => void): (() => void) => {
      const listener = (_e: unknown, status: PiperStatus): void => cb(status)
      ipcRenderer.on('piper:status', listener)
      return (): void => {
        ipcRenderer.off('piper:status', listener)
      }
    },
    onKokoroStatus: (cb: (status: KokoroStatus) => void): (() => void) => {
      const listener = (_e: unknown, status: KokoroStatus): void => cb(status)
      ipcRenderer.on('kokoro:status', listener)
      return (): void => {
        ipcRenderer.off('kokoro:status', listener)
      }
    },
    onVideoGenStatus: (cb: (status: VideoGenStatus) => void): (() => void) => {
      const listener = (_e: unknown, status: VideoGenStatus): void => cb(status)
      ipcRenderer.on('videoGen:status', listener)
      return (): void => {
        ipcRenderer.off('videoGen:status', listener)
      }
    },
    onMediaToolsStatus: (cb: (status: MediaToolsStatus) => void): (() => void) => {
      const listener = (_e: unknown, status: MediaToolsStatus): void => cb(status)
      ipcRenderer.on('mediaTools:status', listener)
      return (): void => {
        ipcRenderer.off('mediaTools:status', listener)
      }
    },
    onUpdated: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('reels:updated', listener)
      return (): void => {
        ipcRenderer.off('reels:updated', listener)
      }
    }
  }
}

export type PulseApi = typeof api

contextBridge.exposeInMainWorld('api', api)
