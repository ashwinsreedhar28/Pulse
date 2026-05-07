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
  // Owning ticker when this feed was provisioned for a specific symbol
  // (Yahoo / Nasdaq RSS for a watchlist ticker). Null for general
  // category-owned feeds. The IPC handler's return shape always
  // includes this; mirroring it on the typed bridge prevents silent
  // contract drift if a future renderer surface reads it.
  tickerId: number | null
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
// Cloud AI routing for value-chain generation + sector classification.
// 'auto' picks Claude when a key is configured, else Ollama.
export type AiProvider = 'auto' | 'ollama' | 'claude'

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
  mediaPipelineEnabled: boolean
  aiProvider: AiProvider
  // Anthropic API key. Stored in the local pulse.db only; never logged.
  // Empty string when the user hasn't configured cloud AI.
  anthropicApiKey: string
  // FRED API key for the macro panel (rates, inflation, labor, vol).
  // Free, no charges. Empty string disables the panel with a "configure
  // in Settings" hint instead of empty data.
  fredApiKey: string
  // Semantic Scholar API key. Free; gives a dedicated 1 RPS lane for the
  // Research tab. Empty string falls back to the shared anonymous pool
  // (functional but unreliable during peak hours).
  semanticScholarApiKey: string
  // Notification dispatcher settings (Phase 1 of the central notification
  // overhaul). Daily cap is enforced across all categories; per-category
  // toggles disable specific sources independently.
  notificationDailyCap: number
  notifyArticlesEnabled: boolean
  notifyStocksEnabled: boolean
  notifySportsEnabled: boolean
  notifyFilingsEnabled: boolean
  notifyMacroEnabled: boolean
  // Stock-alert thresholds (Phase 2). Daily move triggers when a quote's
  // changePct (or extended-hours equivalent) crosses ±N%. Gap triggers
  // when (open - prevClose) / prevClose crosses ±N% at market open.
  stockDailyMovePct: number
  stockGapOpenPct: number
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
  // Extended-session overlay from Yahoo's chart endpoint. Populated during
  // pre/post-market windows so the UI can show an "AH +0.42 (+0.8%)" badge
  // alongside the Stooq regular-session close.
  postMarketPrice: number | null
  postMarketChange: number | null
  postMarketChangePct: number | null
  preMarketPrice: number | null
  preMarketChange: number | null
  preMarketChangePct: number | null
  marketState: 'pre' | 'regular' | 'post' | 'closed' | null
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

// Quarterly cashflow + income snapshot for the value-chain overlay. `ttm`
// rolls the last 4 quarters; `qoq` / `yoy` are point-in-time deltas against
// the most-recent quarter. All money values are raw dollars (not billions).
export interface FinancialQuarter {
  periodEnd: number
  revenue: number | null
  operatingCashFlow: number | null
  capex: number | null
  freeCashFlow: number | null
  netIncome: number | null
  grossProfit: number | null
}

export interface FinancialsSnapshot {
  symbol: string
  currency: string | null
  // 'quarterly' is the common case (8 quarters of data). 'annual' kicks in
  // for tickers Yahoo only carries full-year statements for (e.g. several
  // Japanese ADRs like ATEYY) — each entry in `quarters` is one fiscal
  // year and the UI relabels accordingly ("Last 4 years").
  cadence: 'quarterly' | 'annual'
  quarters: FinancialQuarter[]
  ttm: {
    revenue: number | null
    freeCashFlow: number | null
    operatingCashFlow: number | null
    netIncome: number | null
    fcfMargin: number | null
    ocfMargin: number | null
  }
  qoq: { revenue: number | null; freeCashFlow: number | null }
  yoy: { revenue: number | null; freeCashFlow: number | null }
  fetchedAt: number | null
}

export interface EarningsHistoryQuarter {
  quarter: number
  epsActual: number | null
  epsEstimate: number | null
  surprisePct: number | null
}

export interface EarningsBadge {
  symbol: string
  nextDate: number | null
  isEstimate: boolean
  lastReportEnd: number | null
  history: EarningsHistoryQuarter[]
  fetchedAt: number | null
}

export interface EstimatePeriod {
  avg: number | null
  high: number | null
  low: number | null
  count: number | null
}

export interface RecommendationSplit {
  strongBuy: number
  buy: number
  hold: number
  sell: number
  strongSell: number
}

export interface AnalystEstimates {
  symbol: string
  nextQuarter: EstimatePeriod | null
  currentYear: EstimatePeriod | null
  nextYear: EstimatePeriod | null
  targetMean: number | null
  targetHigh: number | null
  targetLow: number | null
  targetMedian: number | null
  analystCount: number | null
  // 1.0 = strong buy, 5.0 = strong sell (Yahoo's scale)
  recommendationMean: number | null
  recommendationKey: string | null
  consensus: RecommendationSplit | null
  upgradesLast30d: number
  downgradesLast30d: number
  fetchedAt: number
}

// Value-chain growth pipeline: audit log rows + accepted-edge overlay.
// Kinds and statuses mirror the main-process types so a shared helper can
// reason about both sides.
export type GraphCandidateKind = 'edge' | 'node' | 'sector_move' | 'note_refresh'
export type GraphCandidateStatus = 'pending' | 'accepted' | 'rejected'

export interface GraphCandidateEvidence {
  kind: 'article' | 'filing'
  id: number | string
  title: string
  url: string | null
  publishedAt: number | null
}

export interface GraphCandidateEdgePayload {
  relationship: 'supplier' | 'customer' | 'competitor' | 'partner' | 'unclear'
  note: string
}

export interface GraphCandidate {
  id: number
  kind: GraphCandidateKind
  fromSymbol: string | null
  toSymbol: string | null
  symbol: string | null
  payload: GraphCandidateEdgePayload | Record<string, unknown>
  evidence: GraphCandidateEvidence[]
  confidence: number
  source: string
  status: GraphCandidateStatus
  createdAt: number
  reviewedAt: number | null
  reviewNote: string | null
}

export interface GraphEdgeOverride {
  fromSymbol: string
  toSymbol: string
  relationship: string
  note: string | null
  weight: number | null
  source: string
  acceptedAt: number
  // Unified-graph sector tag. Identifies which sector's value-chain view
  // this edge naturally lives in. Nullable on pre-v35 rows until the
  // bootstrap service backfills.
  sectorId?: string | null
  // Per-edge citations array. Multi-cite chains can carry several documents
  // per edge (10-K + news article + analyst action); the renderer stacks
  // them so the user can pick which source to open. Empty on legacy rows
  // and on hand-curated overrides.
  citations?: CompanyValueChainEdgeCitation[]
  // DEPRECATED: legacy single-citation field kept so any caller using the
  // pre-multi-cite shape still compiles. Hydrate populates this with the
  // first entry of citations.
  citation?: CompanyValueChainEdgeCitation | null
}

// Auto-discovered node. Rendered as a first-class tile alongside the hand-
// curated graph; Undo removes the override and the discovered edges that
// pointed at it become dangling (filtered out at render time).
export interface GraphNodeOverride {
  symbol: string
  stage: string
  sector: string | null
  name: string | null
  blurb: string | null
  source: string
  acceptedAt: number
  // Unified-graph sector FK. Nullable on pre-v35 rows; set by the
  // bootstrap backfill (legacy sector → sectorId via catalog legacyIds)
  // and by future writers (chain absorber, classifier).
  sectorId?: string | null
}

export interface GraphSweepSummary {
  proposed: number
  accepted: number
  rejected: number
  skipped: number
}

// Ollama-generated value chain scoped to a single ticker. Rendered on the
// stock detail page when the user clicks "Generate value chain". Unlike
// the main supplyChainGraph.json overlay, this subgraph carries its own
// industry-appropriate stage taxonomy so non-tech tickers (consumer
// staples, pharma, utilities) get a sensible value-chain visualization.
export type CompanyValueChainStatus = 'pending' | 'ready' | 'offline' | 'error'

export interface CompanyValueChainStage {
  id: string
  label: string
}

export interface CompanyValueChainNode {
  symbol: string
  stage: string
  name: string
  blurb: string | null
  // 'ticker' = resolver verified this symbol against our ticker map;
  // 'unverified' = model named a company the resolver couldn't match, so
  // the UI flags it as inferred.
  kind: 'ticker' | 'unverified'
}

// Provenance for the edge claim. Restricted to primary-document sources:
// 'filings' (SEC 10-K/10-Q/8-K), 'news' (in-app reader article), or
// 'model' (un-grounded training-knowledge claim). Profile blurbs and
// analyst rating pages used to live here but were dropped — they don't
// evidence supplier/customer/competitor relationships, just self-
// description or price-target sentiment. Null on legacy chains.
export type CompanyValueChainEdgeSource = 'filings' | 'news' | 'model'

// Specific document the edge claim points to. Renderer turns this into a
// clickable chip — opens the SEC URL externally for filings, the in-app
// reader for articles. Null on legacy edges and on 'model'-grounded
// edges where there's no document to point at.
export type CompanyValueChainEdgeCitation =
  | {
      kind: 'filing'
      accession: string
      cik: string
      formType: string
      filedAt: number
      url: string
    }
  | {
      kind: 'article'
      // null = external (web-searched) article without a local DB row.
      // Renderer opens via system browser when null; otherwise routes
      // through the in-app reader.
      articleId: number | null
      title: string
      url: string | null
      publishedAt: number | null
      feedTitle: string | null
    }
  | {
      kind: 'model'
      // Free-text source attribution from the model's training knowledge
      // (e.g. "Apple FY2023 10-K", "Bloomberg coverage 2022-2024"). Not
      // clickable — there's no URL — but the renderer shows it as the
      // badge label instead of the generic "Model" so the user sees a
      // real source name. Absent on legacy chains and on truly-no-attribution
      // claims.
      attribution?: string
    }

export interface CompanyValueChainEdge {
  from: string
  to: string
  relationship: 'supplier' | 'customer' | 'competitor' | 'partner'
  note: string | null
  source: CompanyValueChainEdgeSource | null
  // Multi-citation array — each entry is a clickable source pill. Old
  // chains generated before multi-cite shipped used a single `citation`
  // field; main-process hydrate normalizes both shapes into this array
  // before the renderer ever sees them.
  citations?: CompanyValueChainEdgeCitation[]
  // DEPRECATED: legacy single-citation (kept for type compat with
  // pre-multi-cite chains; never set on new writes).
  citation?: CompanyValueChainEdgeCitation | null
}

export interface CompanyValueChain {
  focus: string
  stages: CompanyValueChainStage[]
  nodes: CompanyValueChainNode[]
  edges: CompanyValueChainEdge[]
}

export interface CompanyValueChainRow {
  symbol: string
  status: CompanyValueChainStatus
  graph: CompanyValueChain | null
  sourceContext: string | null
  generatedAt: number | null
  updatedAt: number
}

// Yahoo ticker search result. Drives the autocomplete dropdown on the
// Stocks-page Explore card. Sector + industry come through when Yahoo has
// them — null for less-indexed names (some ADRs, recent IPOs).
export interface TickerSearchResult {
  symbol: string
  name: string
  exchange: string | null
  exchangeDisplay: string | null
  quoteType: string | null
  sector: string | null
  industry: string | null
}

// Nearest-expiry options snapshot. IV is a decimal (0.42 = 42%). Put/call
// ratio > 1 means more puts outstanding (defensive tilt).
export interface OptionsSnapshot {
  symbol: string
  underlyingPrice: number | null
  expiryDate: number
  daysToExpiry: number
  atmStrike: number | null
  impliedVol: number | null
  expectedMoveUsd: number | null
  expectedMovePct: number | null
  putCallOiRatio: number | null
  totalCallOi: number | null
  totalPutOi: number | null
  fetchedAt: number
}

// Structured AI summary of an earnings press release (8-K Item 2.02 /
// Exhibit 99.1). overview is prose; keyNumbers / guidance / quotes render
// as typed blocks in the UI.
export interface EarningsReleaseSummary {
  overview: string
  keyNumbers: Array<{ label: string; value: string }>
  guidance: string[]
  quotes: string[]
}

export type EarningsReleaseStatus = 'pending' | 'ready' | 'offline' | 'error'

export interface EarningsReleaseRow {
  symbol: string
  accessionNumber: string
  status: EarningsReleaseStatus
  summary: EarningsReleaseSummary | null
  rawTextLength: number | null
  filedAt: number
  generatedAt: number | null
}

// SEC EDGAR filing record. Dates are unix ms. filingUrl is the accession
// index page; primaryDocUrl is the main document (10-K, 8-K body, etc.).
export interface SecFiling {
  symbol: string
  accessionNumber: string
  cik: string
  formType: string
  filedAt: number
  reportDate: number | null
  primaryDocument: string | null
  primaryDocDescription: string | null
  // Comma-separated list of 8-K item codes (e.g. "2.02,9.01" for earnings
  // release + exhibits). Null for non-8-K forms.
  items: string | null
  filingUrl: string
  primaryDocUrl: string
}

export interface SportsLeague {
  id: string
  name: string
  sport: string
  shortName: string
  paths: string[]
  // True when "today" falls inside this league's hard-coded season
  // window. Renderer uses this to default the active tab to a league
  // that's actually in session — avoids landing on NFL in July.
  inSeason: boolean
  // True when the league is currently in its postseason window
  // (NBA / NFL / MLB / NHL / CFP). Drives the orange Playoffs pill
  // on the league tab and the Playoffs/Regular-Season split on the
  // league-leaders panel.
  inPlayoffs: boolean
}

// NCAA conferences (returned by sports.listNcaaConferences). Used to
// filter the scoreboard via ESPN's `groups` query parameter — only
// applies to leagueId === 'ncaaf' or 'ncaam'.
export interface NcaaConference {
  id: string
  name: string
  shortName: string
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
  // Playoff series record. Populated for multi-game series (NBA/NHL
  // playoff rounds, MLB postseason rounds, NBA Finals, World Series,
  // Stanley Cup Final). Renderer surfaces "homeWins-awayWins" + the
  // series title in the game card during playoff windows. Null for
  // regular-season + one-off knockouts (Super Bowl, CFP semifinals).
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
  leaders: Array<{
    team: 'home' | 'away'
    category: string
    athlete: string
    value: string
    // ESPN headshot URL when available; null when missing.
    headshotURL: string | null
    // Team crest URL — used as a graceful fallback when the player
    // headshot 404s (common for soccer leagues; ESPN's CDN doesn't
    // ship player photos for many MLS / La Liga / EPL athletes).
    teamLogoURL: string | null
  }>
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

// "Why this matters to you" — reader sidebar that grounds an article against
// the user's watchlist, value-chain graph, favorite teams/athletes, and
// tracked geos. Matches compute synchronously; the prose summary is generated
// by Ollama in the background and pushed via `relevance:updated`.
export type PersonalMatchKind =
  | 'ticker-direct'
  | 'ticker-indirect'
  | 'team'
  | 'athlete'
  | 'geo'

export type RelevanceStatus =
  | 'no_matches'
  | 'ready'
  | 'offline'
  | 'pending'
  | 'error'

export interface PersonalMatch {
  kind: PersonalMatchKind
  label: string
  detail: string
  symbol?: string
  relatedSymbol?: string
  relation?: 'supplier' | 'customer' | 'competitor'
}

export interface RelevanceRequestInput {
  articleId: number
  title: string
  summary: string | null
  body?: string | null
}

export interface RelevanceResponse {
  articleId: number
  matches: PersonalMatch[]
  summary: string | null
  status: RelevanceStatus
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
  // 'ollama' covers either local Ollama or cloud Claude (renderer reads
  // `provider` for the actual badge).
  source: 'wikipedia' | 'ollama' | 'none'
  sourceTitle: string | null
  sourceURL: string | null
  confident: boolean
  provider?: 'claude' | 'ollama'
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

// Unified multi-sector graph types. `Sector` mirrors the sector catalog
// entry; `SectorWithContent` adds direct + rolled-up ticker counts so the
// UI can hide empty sectors. `TickerSector` is the many-to-many row
// between a symbol and a sector (one isPrimary=true per symbol, up to 5
// secondaries with confidence ≥ 0.6).
export interface SectorStage {
  id: string
  name: string
}
export interface Sector {
  id: string
  parentId: string | null
  name: string
  description: string | null
  stages: SectorStage[]
}
export interface SectorWithContent extends Sector {
  tickerCount: number
  descendantTickerCount: number
}
export interface TickerSector {
  symbol: string
  sectorId: string
  isPrimary: boolean
  confidence: number | null
  source: string
  assignedAt: number
}

// Progress snapshot emitted by the bulk regenerate-all-chains run.
// Broadcast on 'chainRegen:progress' after each symbol finishes so the
// Settings UI can show a live counter without polling.
export interface RegenerateAllProgress {
  total: number
  completed: number
  currentSymbol: string | null
  succeeded: number
  failed: number
  running: boolean
}

// Daily Claude-authored watchlist digest. Mirror of BriefPayload from
// the main process so the renderer can lay out sections without re-
// parsing markdown. Citations resolve client-side: 'article' → in-app
// reader, 'filing' → SEC archive URL, 'symbol' → ticker detail page.
export type BriefCitationType = 'article' | 'filing' | 'symbol'
export interface BriefCitation {
  type: BriefCitationType
  ref: string
  url?: string
  label?: string
}
export interface BriefBullet {
  text: string
  citations?: BriefCitation[]
}
export interface BriefSection {
  kind: string
  title: string
  bullets: BriefBullet[]
}
export interface BriefPayload {
  headline: string
  generatedAtIso: string
  sections: BriefSection[]
  inputs: {
    watchlistSize: number
    articleCount: number
    earningsCount: number
    filingsCount: number
    ivMoverCount: number
  }
}
export interface MorningBriefRow {
  generatedAt: number
  payload: BriefPayload
  watchlistSize: number
  provider: 'claude' | 'ollama' | null
}

// ---- Research (academia) ---------------------------------------------------
//
// Semantic Scholar paper metadata that the renderer consumes. We keep it
// flat (no nested authors object) so React can render lists without
// re-mapping. ID is Semantic Scholar's `paperId`; arXivId / doi are
// optional external refs the renderer uses to deep-link to PDFs.
export interface ResearchPaper {
  paperId: string
  title: string
  abstract: string | null
  year: number | null
  authors: string[] // up to ~5 — we truncate at fetch time
  venue: string | null
  citationCount: number
  influentialCitationCount: number
  // Best canonical URL: openAccessPdf when available, else paper landing.
  url: string | null
  pdfUrl: string | null
  arxivId: string | null
  doi: string | null
}

// One citation reference inside a research-brief bullet. `paperId` lets
// the renderer route to the in-app paper detail panel; `url` is the
// fallback canonical link (arXiv abstract or S2 landing).
export interface ResearchBriefCitation {
  paperId: string
  label: string // "Smith et al. 2024" — short, scannable
  url: string | null
}
export interface ResearchBriefBullet {
  text: string
  citations: ResearchBriefCitation[]
}
export interface ResearchBriefSection {
  // 'findings' / 'trends' / 'methods' / 'datasets' / 'open-questions' /
  // 'notable'. Renderer styles by kind; unknown kinds get a generic look.
  kind: string
  title: string
  bullets: ResearchBriefBullet[]
}
export interface ResearchBriefPayload {
  headline: string
  generatedAtIso: string
  sections: ResearchBriefSection[]
  // Diagnostic context for the brief — surfaced under the headline.
  inputs: {
    query: string
    papersConsidered: number
    papersFiltered: number
  }
}

// Saved research topic — a query the user wants to track. The
// scheduler regenerates the brief weekly so the user gets fresh
// synthesis on subsequent visits without re-typing the search.
export interface ResearchTopic {
  id: number
  query: string
  label: string // display name, defaults to query
  createdAt: number
  lastBriefAt: number | null
}

// Persisted brief tied to a topic. Topic-less briefs (one-shot
// searches the user didn't save) aren't persisted.
export interface ResearchBriefRow {
  topicId: number
  generatedAt: number
  payload: ResearchBriefPayload
  paperIds: string[] // for the cards rendered alongside the brief
}

// One-shot search response — no DB persistence, just the brief + the
// papers it synthesized over (so the renderer can show paper cards
// underneath the brief).
export interface ResearchSearchResult {
  brief: ResearchBriefPayload
  papers: ResearchPaper[]
}

// Local bookmark row. Stores the full ResearchPaper inline so the
// Bookmarks view renders without round-tripping to Semantic Scholar.
export interface ResearchBookmarkRow {
  paperId: string
  savedAt: number // unix ms
  paper: ResearchPaper
}

// Bridge paper — a paper cited as foundational by ≥2 of the user's
// bookmarks but not yet bookmarked itself. Surfaces in the Bookmarks
// view as a "papers worth adding" suggestion list, ranked by how many
// of your existing bookmarks build on it.
export interface BridgePaperResult {
  paper: ResearchPaper
  citedByBookmarkCount: number
  citingBookmarkIds: string[]
}

// Auto-recorded recent search. Renderer renders these as a third chip
// group in the Saved strip — "stuff you searched lately, click to
// re-run." Distinct from saved topics (no scheduler / weekly brief)
// and bookmarks (no associated papers).
export interface RecentSearchRow {
  query: string
  lastSearchedAt: number
  searchCount: number
}

// Many-to-many tagging junction between bookmarks and saved topics.
// listAllBookmarkTopicLinks returns every row; the renderer indexes
// in-memory to avoid per-bookmark IPC calls when rendering chip lists.
export interface BookmarkTopicLink {
  bookmarkPaperId: string
  topicId: number
  createdAt: number
}

// Directed edge among the user's bookmarks. `from` builds on `to`
// (i.e. `to` appears in `from`'s foundational cache). Drives the
// Research Map visualization's edge set.
export interface BookmarkFoundationalEdge {
  from: string
  to: string
}

// ---- Paper Value Chain (Research Phase 3A) -------------------------------
// Renderer-facing types for the per-paper lineage chain. Mirror of the
// shapes in src/main/database/paperValueChains.ts; kept synchronized
// manually since main can't safely import preload types and vice-versa.

export interface PaperValueChainStage {
  id: string
  label: string
  order: number
  band: 'upstream' | 'focal' | 'downstream'
}

export interface PaperValueChainNode {
  paperId: string
  stage: string
  title: string
  authorYearLabel: string
  abstract: string | null
  year: number | null
  citationCount: number
  influentialCitationCount: number
  url: string | null
  pdfUrl: string | null
  kind: 'paper' | 'unverified'
}

export type PaperValueChainEdgeCitation =
  | {
      kind: 's2-influential'
      intent: 'background' | 'methodology' | 'extension' | 'result' | 'comparison'
      otherPaperId: string
    }
  | {
      kind: 's2-intent'
      intent: 'background' | 'methodology' | 'extension' | 'result' | 'comparison'
      otherPaperId: string
    }
  | { kind: 'bilateral'; otherPaperId: string }
  | { kind: 'haiku-pdf'; excerpt: string; otherPaperId: string }
  | { kind: 'model'; attribution?: string }

export type PaperValueChainRelationship =
  | 'builds-on'
  | 'uses-method'
  | 'extends'
  | 'contrasts'
  | 'replicates'
  | 'refutes'

export interface PaperValueChainEdge {
  from: string
  to: string
  relationship: PaperValueChainRelationship
  note: string | null
  citations: PaperValueChainEdgeCitation[]
}

export interface PaperValueChain {
  focusPaperId: string
  focusLabel: string
  stages: PaperValueChainStage[]
  nodes: PaperValueChainNode[]
  edges: PaperValueChainEdge[]
  s2CallsUsed: number
}

// Result from a regenerate call. `chain` is the freshly-built chain on
// success; `reason` carries a tagged failure mode the UI can render
// distinctly ('rate_limited' → "try again in ~30s", 'focal_not_found'
// → "S2 doesn't have this paper", 'empty' → "no refs/citations to
// build a chain from"). When ok=true and reason='empty', `chain` still
// has the focal node so the UI can show a degraded-but-valid view.
export interface GeneratePaperValueChainResult {
  ok: boolean
  chain: PaperValueChain | null
  s2CallsUsed: number
  reason?: 'rate_limited' | 'focal_not_found' | 'empty'
}

// FRED macro panel snapshot. Mirror of FredSeriesSnapshot from the main
// process. `format` tells the renderer how to print latestValue:
// 'percent' → '4.50%', 'percent-change-yoy' → '+3.1%', 'index' → '14.85',
// 'count-thousands' → '212K'. preferredDirection tints the delta:
// 'lower' colors a negative change green ("inflation cooled"), 'higher'
// colors positive green, 'either' stays neutral.
export type FredFormat = 'percent' | 'percent-change-yoy' | 'index' | 'count-thousands'
export interface FredSeriesSnapshot {
  id: string
  label: string
  group: 'rates' | 'inflation' | 'labor' | 'volatility'
  format: FredFormat
  preferredDirection: 'higher' | 'lower' | 'either'
  latestValue: number | null
  latestDate: string | null
  delta: number | null
  series: Array<{ date: string; value: number | null }>
  units: string | null
  frequency: string | null
  lastFetchedAt: number | null
}

// User-flagged corrections to per-ticker value chains. Mirror of types
// from src/main/services/chainCorrectionsService.ts. Renderer applies
// corrections via right-click on counterparty chips in the focus panel;
// each verdict feeds back into the Claude generator prompt as ground-truth
// on the next regen.
export type ChainCorrectionSubjectType = 'counterparty' | 'edge' | 'node'
export type ChainCorrectionType = 'not-relevant' | 'wrong-direction' | 'wrong-relationship'
export interface ChainCorrectionValue {
  direction?: 'supplier' | 'customer'
  relationship?: 'supplier' | 'customer' | 'competitor' | 'partner'
}
export interface ChainCorrection {
  focusSymbol: string
  subjectType: ChainCorrectionSubjectType
  subjectKey: string
  correctionType: ChainCorrectionType
  correctedValue: ChainCorrectionValue | null
  note: string | null
  createdAt: number
  appliedAt: number | null
}
export interface UpsertChainCorrectionInput {
  focusSymbol: string
  subjectType: ChainCorrectionSubjectType
  subjectKey: string
  correctionType: ChainCorrectionType
  correctedValue?: ChainCorrectionValue | null
  note?: string | null
}

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
    },
    // Notification click → switch to a top-level route. Fired by the
    // central notificationService for digest + macro-shock notifications
    // whose click action is `{ kind: 'route', route: 'home' | 'stocks' |
    // 'sports' }`.
    onNavigate: (cb: (route: 'home' | 'stocks' | 'sports') => void): (() => void) => {
      const listener = (_e: unknown, route: 'home' | 'stocks' | 'sports'): void => cb(route)
      ipcRenderer.on('app:navigate', listener)
      return (): void => {
        ipcRenderer.off('app:navigate', listener)
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
    getById: (id: number) => invoke<Article | null>('db:articles:getById', id),
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
    ensurePassive: (input: CreateTickerInput) =>
      invoke<Ticker>('db:tickers:ensurePassive', input),
    delete: (id: number) => invoke<void>('db:tickers:delete', id),
    activate: (id: number) => invoke<Ticker | null>('db:tickers:activate', id),
    summarize: (id: number) =>
      invoke<{
        summary: string | null
        articleCount: number
        relevantCount: number | null
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
  // Find-in-page API. start() runs a search via the host webContents'
  // findInPage; the result fires back asynchronously through the
  // 'find:result' broadcast. stop() clears the highlight. onResult
  // returns an unsubscribe so callers can clean up on unmount.
  find: {
    start: (
      query: string,
      options?: { forward?: boolean; findNext?: boolean; matchCase?: boolean }
    ) => invoke<null>('find:start', query, options),
    stop: () => invoke<null>('find:stop'),
    onResult: (
      cb: (payload: {
        requestId: number
        matches: number
        activeMatchOrdinal: number
        finalUpdate: boolean
      }) => void
    ): (() => void) => {
      const listener = (_e: unknown, payload: Parameters<typeof cb>[0]): void => cb(payload)
      ipcRenderer.on('find:result', listener)
      return (): void => {
        ipcRenderer.off('find:result', listener)
      }
    }
  },
  relevance: {
    get: (input: RelevanceRequestInput) =>
      invoke<RelevanceResponse>('relevance:get', input),
    onUpdated: (cb: (payload: RelevanceResponse) => void): (() => void) => {
      const listener = (_e: unknown, payload: RelevanceResponse): void => cb(payload)
      ipcRenderer.on('relevance:updated', listener)
      return (): void => {
        ipcRenderer.off('relevance:updated', listener)
      }
    }
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
    getFinancials: (symbol: string) =>
      invoke<FinancialsSnapshot>('stocks:getFinancials', symbol),
    getFinancialsBatch: (symbols: string[]) =>
      invoke<FinancialsSnapshot[]>('stocks:getFinancialsBatch', symbols),
    refreshFinancials: (symbol: string) =>
      invoke<FinancialsSnapshot>('stocks:refreshFinancials', symbol),
    getEarnings: (symbol: string) =>
      invoke<EarningsBadge>('stocks:getEarnings', symbol),
    getEarningsBatch: (symbols: string[]) =>
      invoke<EarningsBadge[]>('stocks:getEarningsBatch', symbols),
    getEstimates: (symbol: string) =>
      invoke<AnalystEstimates | null>('stocks:getEstimates', symbol),
    getEstimatesBatch: (symbols: string[]) =>
      invoke<AnalystEstimates[]>('stocks:getEstimatesBatch', symbols),
    refreshEstimates: (symbol: string) =>
      invoke<AnalystEstimates | null>('stocks:refreshEstimates', symbol),
    // Single mount-bundle for the ValueChain page. Replaces six separate
    // batch IPCs that fired on every mount with one round-trip. Incremental
    // refreshes still come through the existing *:updated subscriptions.
    getValueChainMountBundle: (
      symbols: string[],
      filingsSinceMs: number
    ): Promise<{
      financials: FinancialsSnapshot[]
      earnings: EarningsBadge[]
      estimates: AnalystEstimates[]
      sectorsWithContent: SectorWithContent[]
      primaryIndex: Record<string, string>
      edgeOverrides: GraphEdgeOverride[]
      nodeOverrides: GraphNodeOverride[]
      recentFilings: Record<string, SecFiling[]>
      // Symbols (uppercase) that have a saved generated chain. Used by the
      // unified Value Chain renderer to suppress static-graph edges for
      // any focus the user has regenerated, so the unified view doesn't
      // keep showing stale curated edges after a regen.
      generatedChainSymbols: string[]
    }> =>
      invoke('valueChain:getMountBundle', symbols, filingsSinceMs),
    getOptionsSnapshot: (symbol: string) =>
      invoke<OptionsSnapshot | null>('stocks:getOptionsSnapshot', symbol),
    searchTickers: (query: string, limit?: number) =>
      invoke<TickerSearchResult[]>('stocks:searchTickers', query, limit),
    generateCompanyChain: (symbol: string, companyName: string, force?: boolean) =>
      invoke<CompanyValueChainRow | null>(
        'stocks:generateCompanyChain',
        symbol,
        companyName,
        force
      ),
    getCompanyChain: (symbol: string) =>
      invoke<CompanyValueChainRow | null>('stocks:getCompanyChain', symbol),
    regenerateAllChains: (): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>('stocks:regenerateAllChains'),
    // One-shot Claude-only regen. Bypasses the local cap counter and
    // disables Ollama fallback. Used to backfill citations across the
    // entire watchlist with maximum quality — accept the API cost.
    regenerateAllChainsForceClaude: (): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>('stocks:regenerateAllChainsForceClaude'),
    getRegenerateAllProgress: (): Promise<RegenerateAllProgress> =>
      invoke<RegenerateAllProgress>('stocks:getRegenerateAllProgress'),
    // In-memory Claude call counter — telemetry only, no longer gates
    // anything. Reset clears the counter (useful during heavy debugging
    // sessions to see how many calls a single flow makes).
    resetClaudeUsage: (): Promise<{ count: number }> =>
      invoke<{ count: number }>('stocks:resetClaudeUsage'),
    getClaudeUsage: (): Promise<{ count: number }> =>
      invoke<{ count: number }>('stocks:getClaudeUsage'),
    onRegenerateAllProgress: (cb: (p: RegenerateAllProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: RegenerateAllProgress): void => cb(p)
      ipcRenderer.on('chainRegen:progress', listener)
      return (): void => {
        ipcRenderer.off('chainRegen:progress', listener)
      }
    },
    onCompanyChainUpdated: (cb: (symbol: string) => void): (() => void) => {
      const listener = (_e: unknown, symbol: string): void => cb(symbol)
      ipcRenderer.on('companyChain:updated', listener)
      return (): void => {
        ipcRenderer.off('companyChain:updated', listener)
      }
    },
    // Notification click → open the symbol's detail page. Fired by the
    // central notificationService when the user clicks a stock alert
    // (daily move, gap, 52w touch, analyst change, etc.).
    onOpenSymbol: (cb: (symbol: string) => void): (() => void) => {
      const listener = (_e: unknown, symbol: string): void => cb(symbol)
      ipcRenderer.on('stocks:openSymbol', listener)
      return (): void => {
        ipcRenderer.off('stocks:openSymbol', listener)
      }
    },
    onUpdated: (cb: (quotes: StockQuote[]) => void): (() => void) => {
      const listener = (_e: unknown, quotes: StockQuote[]): void => cb(quotes)
      ipcRenderer.on('stocks:updated', listener)
      return (): void => {
        ipcRenderer.off('stocks:updated', listener)
      }
    },
    onFinancialsUpdated: (cb: (symbol: string) => void): (() => void) => {
      const listener = (_e: unknown, symbol: string): void => cb(symbol)
      ipcRenderer.on('financials:updated', listener)
      return (): void => {
        ipcRenderer.off('financials:updated', listener)
      }
    },
    onEarningsUpdated: (cb: (symbol: string) => void): (() => void) => {
      const listener = (_e: unknown, symbol: string): void => cb(symbol)
      ipcRenderer.on('earnings:updated', listener)
      return (): void => {
        ipcRenderer.off('earnings:updated', listener)
      }
    },
    onEstimatesUpdated: (cb: (symbol: string) => void): (() => void) => {
      const listener = (_e: unknown, symbol: string): void => cb(symbol)
      ipcRenderer.on('estimates:updated', listener)
      return (): void => {
        ipcRenderer.off('estimates:updated', listener)
      }
    }
  },
  brief: {
    getCurrent: (): Promise<MorningBriefRow | null> =>
      invoke<MorningBriefRow | null>('brief:getCurrent'),
    refresh: (): Promise<{ ok: boolean }> => invoke<{ ok: boolean }>('brief:refresh'),
    onUpdated: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('morningBrief:updated', listener)
      return (): void => {
        ipcRenderer.off('morningBrief:updated', listener)
      }
    }
  },
  research: {
    // One-shot search: hits Semantic Scholar + Claude synthesis
    // immediately. Use when the user types a query without saving.
    search: (query: string): Promise<ResearchSearchResult> =>
      invoke<ResearchSearchResult>('research:search', query),
    // Saved-topic management. Topics are persisted; their briefs
    // refresh weekly via the background scheduler.
    listTopics: (): Promise<ResearchTopic[]> =>
      invoke<ResearchTopic[]>('research:listTopics'),
    createTopic: (input: { query: string; label?: string }): Promise<ResearchTopic> =>
      invoke<ResearchTopic>('research:createTopic', input),
    deleteTopic: (id: number): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>('research:deleteTopic', id),
    getBrief: (topicId: number): Promise<ResearchBriefRow | null> =>
      invoke<ResearchBriefRow | null>('research:getBrief', topicId),
    refreshTopic: (topicId: number): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>('research:refreshTopic', topicId),
    onTopicUpdated: (cb: (topicId: number) => void): (() => void) => {
      const listener = (_e: unknown, id: number): void => cb(id)
      ipcRenderer.on('research:topic-updated', listener)
      return (): void => {
        ipcRenderer.off('research:topic-updated', listener)
      }
    },
    // Per-paper detail panel + citation lineage.
    getPaper: (paperId: string): Promise<ResearchPaper | null> =>
      invoke<ResearchPaper | null>('research:getPaper', paperId),
    listCiting: (paperId: string): Promise<ResearchPaper[]> =>
      invoke<ResearchPaper[]>('research:listCiting', paperId),
    listReferences: (paperId: string): Promise<ResearchPaper[]> =>
      invoke<ResearchPaper[]>('research:listReferences', paperId),
    // Bookmarks — local-only, persisted in research_bookmarks. Returns
    // the full hydrated paper alongside the savedAt so the Bookmarks
    // view renders without re-hitting Semantic Scholar.
    listBookmarks: (): Promise<ResearchBookmarkRow[]> =>
      invoke<ResearchBookmarkRow[]>('research:listBookmarks'),
    bookmark: (paper: ResearchPaper): Promise<ResearchBookmarkRow> =>
      invoke<ResearchBookmarkRow>('research:bookmark', paper),
    unbookmark: (paperId: string): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>('research:unbookmark', paperId),
    // Foundational refs — papers this work explicitly builds on per S2's
    // isInfluential + intents (background/methodology/extension)
    // classifier. Cached locally, auto-fetched on bookmark.
    getFoundational: (paperId: string): Promise<ResearchPaper[]> =>
      invoke<ResearchPaper[]>('research:getFoundational', paperId),
    // Inverse direction — bookmarks that name this paper as foundational.
    getFoundationalFor: (paperId: string): Promise<ResearchPaper[]> =>
      invoke<ResearchPaper[]>('research:getFoundationalFor', paperId),
    // Bridge papers — papers cited as foundational by ≥2 of your
    // bookmarks but not yet bookmarked themselves. Suggested adds to
    // the library, computed entirely from local caches (no S2 calls).
    listBridgePapers: (): Promise<BridgePaperResult[]> =>
      invoke<BridgePaperResult[]>('research:listBridgePapers'),
    // Auto-recorded recent searches. Click a chip to re-run the query.
    listRecent: (limit?: number): Promise<RecentSearchRow[]> =>
      invoke<RecentSearchRow[]>('research:listRecent', limit),
    recordRecent: (query: string): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>('research:recordRecent', query),
    clearRecent: (query: string): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>('research:clearRecent', query),
    // Topic ↔ bookmark tagging (many-to-many).
    listTopicsForBookmark: (paperId: string): Promise<ResearchTopic[]> =>
      invoke<ResearchTopic[]>('research:listTopicsForBookmark', paperId),
    listBookmarksForTopic: (topicId: number): Promise<ResearchBookmarkRow[]> =>
      invoke<ResearchBookmarkRow[]>('research:listBookmarksForTopic', topicId),
    tagBookmark: (paperId: string, topicId: number): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>('research:tagBookmark', paperId, topicId),
    untagBookmark: (paperId: string, topicId: number): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>('research:untagBookmark', paperId, topicId),
    listAllBookmarkTopicLinks: (): Promise<BookmarkTopicLink[]> =>
      invoke<BookmarkTopicLink[]>('research:listAllBookmarkTopicLinks'),
    // Directed edges among bookmarks (foundational links). Used by the
    // Research Map. Computed entirely from local caches, no S2 calls.
    listBookmarkFoundationalEdges: (): Promise<BookmarkFoundationalEdge[]> =>
      invoke<BookmarkFoundationalEdge[]>('research:listBookmarkFoundationalEdges'),
    // Paper Value Chain — per-paper lineage. getPaperChain is cache-first
    // (returns null when no chain has been generated yet); regenerate
    // forces a fresh build.
    getPaperChain: (paperId: string): Promise<PaperValueChain | null> =>
      invoke<PaperValueChain | null>('research:getPaperChain', paperId),
    regeneratePaperChain: (paperId: string): Promise<GeneratePaperValueChainResult> =>
      invoke<GeneratePaperValueChainResult>('research:regeneratePaperChain', paperId)
  },
  fred: {
    getSnapshot: (): Promise<FredSeriesSnapshot[]> =>
      invoke<FredSeriesSnapshot[]>('fred:getSnapshot'),
    refresh: (): Promise<{ ok: boolean }> => invoke<{ ok: boolean }>('fred:refresh'),
    onUpdated: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('fred:updated', listener)
      return (): void => {
        ipcRenderer.off('fred:updated', listener)
      }
    }
  },
  chainCorrections: {
    list: (focusSymbol: string): Promise<ChainCorrection[]> =>
      invoke<ChainCorrection[]>('chainCorrections:list', focusSymbol),
    upsert: (input: UpsertChainCorrectionInput): Promise<ChainCorrection> =>
      invoke<ChainCorrection>('chainCorrections:upsert', input),
    delete: (input: {
      focusSymbol: string
      subjectType: ChainCorrectionSubjectType
      subjectKey: string
      correctionType: ChainCorrectionType
    }): Promise<{ ok: boolean }> => invoke<{ ok: boolean }>('chainCorrections:delete', input),
    onUpdated: (cb: (focusSymbol: string) => void): (() => void) => {
      const listener = (_e: unknown, sym: string): void => cb(sym)
      ipcRenderer.on('chainCorrections:updated', listener)
      return (): void => {
        ipcRenderer.off('chainCorrections:updated', listener)
      }
    }
  },
  sec: {
    getFilings: (symbol: string, limit?: number, onlyInteresting?: boolean) =>
      invoke<SecFiling[]>('sec:getFilings', symbol, limit, onlyInteresting),
    getRecentFilings: (symbols: string[], sinceMs: number, onlyInteresting?: boolean) =>
      invoke<Record<string, SecFiling[]>>(
        'sec:getRecentFilings',
        symbols,
        sinceMs,
        onlyInteresting
      ),
    refreshFilings: (symbol: string) => invoke<number | null>('sec:refreshFilings', symbol),
    onUpdated: (cb: (symbol: string) => void): (() => void) => {
      const listener = (_e: unknown, symbol: string): void => cb(symbol)
      ipcRenderer.on('secFilings:updated', listener)
      return (): void => {
        ipcRenderer.off('secFilings:updated', listener)
      }
    },
    getReleaseSummary: (symbol: string, accessionNumber: string) =>
      invoke<EarningsReleaseRow | null>('sec:getReleaseSummary', symbol, accessionNumber),
    getReleaseSummariesForSymbol: (symbol: string, limit?: number) =>
      invoke<EarningsReleaseRow[]>('sec:getReleaseSummariesForSymbol', symbol, limit),
    summarizeRelease: (symbol: string, accessionNumber: string) =>
      invoke<EarningsReleaseRow | null>('sec:summarizeRelease', symbol, accessionNumber),
    onReleaseSummaryUpdated: (cb: (symbol: string) => void): (() => void) => {
      const listener = (_e: unknown, symbol: string): void => cb(symbol)
      ipcRenderer.on('earningsReleases:updated', listener)
      return (): void => {
        ipcRenderer.off('earningsReleases:updated', listener)
      }
    }
  },
  graph: {
    listCandidates: (opts?: {
      status?: GraphCandidateStatus
      limit?: number
    }): Promise<GraphCandidate[]> => invoke<GraphCandidate[]>('graph:listCandidates', opts),
    listOverrides: (): Promise<GraphEdgeOverride[]> =>
      invoke<GraphEdgeOverride[]>('graph:listOverrides'),
    listNodeOverrides: (): Promise<GraphNodeOverride[]> =>
      invoke<GraphNodeOverride[]>('graph:listNodeOverrides'),
    undoNodeOverride: (
      symbol: string,
      candidateId?: number | null
    ): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>('graph:undoNodeOverride', symbol, candidateId ?? null),
    countSince: (sinceMs: number): Promise<{ accepted: number; rejected: number }> =>
      invoke<{ accepted: number; rejected: number }>('graph:countSince', sinceMs),
    runSweep: (): Promise<GraphSweepSummary> =>
      invoke<GraphSweepSummary>('graph:runSweep'),
    runTenKScan: (): Promise<{
      processed: number
      accepted: number
      rejected: number
      skipped: number
    }> =>
      invoke<{
        processed: number
        accepted: number
        rejected: number
        skipped: number
      }>('graph:runTenKScan'),
    undoOverride: (
      fromSymbol: string,
      toSymbol: string,
      relationship: string,
      candidateId?: number | null
    ): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>(
        'graph:undoOverride',
        fromSymbol,
        toSymbol,
        relationship,
        candidateId ?? null
      ),
    onUpdated: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('graph:updated', listener)
      return (): void => {
        ipcRenderer.off('graph:updated', listener)
      }
    }
  },
  sectors: {
    list: (): Promise<Sector[]> => invoke<Sector[]>('sectors:list'),
    listWithContent: (): Promise<SectorWithContent[]> =>
      invoke<SectorWithContent[]>('sectors:listWithContent'),
    forSymbol: (symbol: string): Promise<TickerSector[]> =>
      invoke<TickerSector[]>('sectors:forSymbol', symbol),
    // Map of symbol → primary sectorId. Useful for bulk cross-sector edge
    // detection in the value-chain renderer without N round-trips.
    primaryIndex: (): Promise<Record<string, string>> =>
      invoke<Record<string, string>>('sectors:primaryIndex'),
    topLevelAncestor: (sectorId: string): Promise<string | null> =>
      invoke<string | null>('sectors:topLevelAncestor', sectorId)
  },
  sports: {
    listLeagues: () => invoke<SportsLeague[]>('sports:listLeagues'),
    listGames: (leagueId: string, groupId?: string | null) =>
      invoke<Game[]>('sports:listGames', leagueId, groupId ?? null),
    listSeasonGames: (leagueId: string) => invoke<SeasonGames>('sports:listSeasonGames', leagueId),
    listNcaaConferences: (leagueId: string) =>
      invoke<NcaaConference[]>('sports:listNcaaConferences', leagueId),
    listTeams: (leagueId: string) => invoke<SportsTeam[]>('sports:listTeams', leagueId),
    getGameDetail: (leagueId: string, leaguePath: string, eventId: string) =>
      invoke<GameDetail | null>('sports:getGameDetail', leagueId, leaguePath, eventId),
    listLeagueLeaders: (leagueId: string, seasonType: 'regular' | 'postseason' = 'regular') =>
      invoke<StatCategory[]>('sports:listLeagueLeaders', leagueId, seasonType),
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
