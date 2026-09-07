import { BrowserWindow, dialog, ipcMain } from 'electron'
import * as categoriesDb from '../database/categories'
import * as feedsDb from '../database/feeds'
import * as articlesDb from '../database/articles'
import * as tickersDb from '../database/tickers'
import * as geoDb from '../database/geoInterests'
import * as discoveryDb from '../database/discovery'
import * as prefsDb from '../database/preferences'
import { extractReadable } from '../services/readerService'
import { probeFeed } from '../services/rssParser'
import { runDailyDrip, runWeeklyCurated, runPortfolioGaps } from '../services/discoveryService'
import { getLastQuotes, refreshStocksNow } from '../services/stocksScheduler'
import {
  getFundamentals,
  getHistory,
  getOptionsSnapshot,
  searchTickers,
  type HistoryRange
} from '../services/yahooFinanceService'
import {
  computeSnapshot,
  computeSnapshotsForSymbols,
  forceRefreshFinancials
} from '../services/financialsService'
import {
  getEarningsBadge,
  getEarningsBadgesForSymbols
} from '../services/earningsService'
import {
  forceRefreshEstimates,
  getEstimatesSnapshot,
  getEstimatesSnapshotsForSymbols
} from '../services/analystEstimatesService'
import { forceRefreshFilings } from '../services/secFilingsService'
import {
  getFilingsForSymbol,
  getRecentFilingsForSymbols
} from '../database/secFilings'
import {
  buildFilingUrl,
  buildPrimaryDocUrl,
  INTERESTING_FORMS
} from '../services/secService'
import {
  isEarningsRelease,
  summarizeRelease
} from '../services/earningsReleasesService'
import {
  getEarningsRelease,
  getEarningsReleasesForSymbol
} from '../database/earningsReleases'
import { runGraphSweep } from '../services/graphCandidatesService'
import { runTenKScanNow } from '../services/tenKConcentrationService'
import {
  countCandidatesSince,
  listCandidates,
  markCandidateRejected
} from '../database/graphCandidates'
import {
  deleteEdgeOverride,
  listEdgeOverrides
} from '../database/graphOverrides'
import { listCompanyValueChainSymbols } from '../database/companyValueChains'
import {
  deleteNodeOverride,
  listNodeOverrides
} from '../database/graphNodeOverrides'
import {
  buildPrimarySectorIndex,
  getSectorsForSymbol,
  getTopLevelAncestor,
  listSectors,
  listSectorsWithContent
} from '../services/sectorService'
import {
  ensureCompanyProfile,
  getCompanyProfile,
  regenerateCompanyProfile
} from '../services/companyProfileService'
import {
  listLeagues,
  listGames,
  listSeasonGames,
  getGameDetail,
  listTeams,
  listLeagueLeaders,
  listTeamLeaders,
  listNcaaConferences
} from '../services/sportsService'
import {
  getLastReelGroups,
  isSportsReelWarmed
} from '../services/sportsReelScheduler'
import * as favoriteTeamsDb from '../database/favoriteTeams'
import * as favoriteAthletesDb from '../database/favoriteAthletes'
import { resetSportsAlertState } from '../services/sportsAlertsService'
import * as reelsDb from '../database/reels'
import {
  deleteReelById,
  generateReelFromArticleId,
  rebuildAllReelAudio,
  rebuildReelAudio,
  runReelGeneration
} from '../services/reelService'
import { classifyAllArticlesForTicker, pollAllFeeds } from '../services/feedPoller'
import { invalidateMatcherCache } from '../services/tickerRelevance'
import { invalidateNameIndex } from '../services/companyNameResolver'
import { deleteMatchesForSymbol } from '../database/articleTickerMatches'
import {
  getOrComputeRelevance,
  type RelevanceRequestInput
} from '../services/personalRelevance'
import { invalidateAllRelevance } from '../database/articleRelevance'
import { provisionFeedsForTicker } from '../services/tickerFeedsService'
import {
  getTickerSummary,
  refreshTickerSummary
} from '../services/tickerSummaryService'
import { lookupTerm } from '../services/smartLookupService'
import {
  findFeedCandidates,
  probeCandidate,
  addSuggestedFeed
} from '../services/feedFinderService'
import { dispatchHyperMessage } from '../services/hyperDispatcherService'
import { getCalendarStrip } from '../services/calendarService'
import { getIpoBrief } from '../services/ipoBriefService'
import {
  CONFIG_FILENAME,
  exportConfigTo,
  importConfigFrom,
  loadConfig,
  updateConfig,
  type ConfigPatch
} from '../services/configFileService'
import {
  listHyperChats,
  getHyperChat,
  saveHyperChat,
  deleteHyperChat,
  type SaveHyperChatInput
} from '../database/hyperChats'

export function registerDbIpc(): void {
  // Find-in-page bridge. The renderer's reader content is regular DOM,
  // but Electron doesn't fire Cmd+F → native find UI by default. We
  // expose webContents.findInPage / stopFindInPage and forward the
  // 'found-in-page' event back so the renderer can show match counts
  // in a custom FindBar overlay.
  ipcMain.handle(
    'find:start',
    (e, query: string, options?: { forward?: boolean; findNext?: boolean; matchCase?: boolean }) => {
      const text = (query ?? '').trim()
      if (!text) return null
      const win = BrowserWindow.fromWebContents(e.sender)
      win?.webContents.findInPage(text, {
        forward: options?.forward ?? true,
        findNext: options?.findNext ?? false,
        matchCase: options?.matchCase ?? false
      })
      return null
    }
  )
  ipcMain.handle('find:stop', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.webContents.stopFindInPage('clearSelection')
    return null
  })

  // categories
  ipcMain.handle('db:categories:list', () => categoriesDb.listCategories())
  ipcMain.handle('db:categories:create', (_e, name: string, domain: categoriesDb.Domain) =>
    categoriesDb.createCategory(name, domain)
  )
  ipcMain.handle('db:categories:rename', (_e, id: number, name: string) =>
    categoriesDb.renameCategory(id, name)
  )
  ipcMain.handle('db:categories:setNotifications', (_e, id: number, enabled: boolean) =>
    categoriesDb.setCategoryNotifications(id, enabled)
  )
  ipcMain.handle('db:categories:delete', (_e, id: number) => categoriesDb.deleteCategory(id))
  ipcMain.handle('db:categories:reorder', (_e, ids: number[]) => categoriesDb.reorderCategories(ids))
  ipcMain.handle('db:categories:setDomain', (_e, id: number, domain: categoriesDb.Domain) =>
    categoriesDb.setCategoryDomain(id, domain)
  )

  // feeds
  ipcMain.handle('db:feeds:list', () => feedsDb.listFeeds())
  ipcMain.handle('db:feeds:countsByCategory', () => feedsDb.countFeedsByCategory())
  ipcMain.handle('db:feeds:create', (_e, input: feedsDb.CreateFeedInput) => feedsDb.createFeed(input))
  ipcMain.handle('db:feeds:delete', (_e, id: number) => feedsDb.deleteFeed(id))
  ipcMain.handle('db:feeds:setEnabled', (_e, id: number, enabled: boolean) =>
    feedsDb.setFeedEnabled(id, enabled)
  )
  ipcMain.handle('db:feeds:rename', (_e, id: number, title: string) => feedsDb.renameFeed(id, title))
  ipcMain.handle('db:feeds:setCategory', (_e, id: number, categoryId: number) =>
    feedsDb.setFeedCategory(id, categoryId)
  )
  ipcMain.handle('feeds:probe', (_e, url: string) => probeFeed(url))

  // articles
  ipcMain.handle('db:articles:list', (_e, opts: articlesDb.ListArticlesOptions) =>
    articlesDb.listArticles(opts ?? {})
  )
  ipcMain.handle('db:articles:unreadCountsByCategory', () => articlesDb.countUnreadByCategory())
  ipcMain.handle('db:articles:recentCountsByCategory', (_e, sinceMs: number) =>
    articlesDb.countRecentByCategory(sinceMs)
  )
  ipcMain.handle('db:articles:countBookmarked', () => articlesDb.countBookmarked())
  ipcMain.handle('db:articles:markRead', (_e, id: number, read: boolean) =>
    articlesDb.markRead(id, read)
  )
  ipcMain.handle('db:articles:getById', (_e, id: number) => articlesDb.getArticleById(id))
  ipcMain.handle('db:articles:setBookmarked', (_e, id: number, bookmarked: boolean) =>
    articlesDb.setBookmarked(id, bookmarked)
  )
  ipcMain.handle('db:articles:listForTicker', (_e, tickerId: number) => {
    const ticker = tickersDb.listTickers().find((t) => t.id === tickerId)
    if (!ticker) return []
    // Strong-only: only articles that mention the full company name or a
    // distinctive alias. Drops "ARM instruction set" noise under Arm Holdings
    // and keeps the coverage list aligned with what the summarizer sees.
    return articlesDb.listArticlesForTicker(ticker.symbol, { limit: 60 })
  })

  ipcMain.handle('tickers:summarize', (_e, tickerId: number) => {
    const cached = getTickerSummary(tickerId)
    // If we've never run for this ticker (app just upgraded, ticker just added,
    // or refresh hasn't finished its first lap), kick a background pass so
    // the next event updates the UI.
    if (!cached) {
      refreshTickerSummary(tickerId)
      return { summary: null, articleCount: 0, relevantCount: null, generatedAt: null }
    }
    return {
      summary: cached.summary,
      articleCount: cached.articleCount,
      relevantCount: cached.relevantCount,
      generatedAt: cached.generatedAt
    }
  })

  // tickers
  ipcMain.handle('db:tickers:list', () => tickersDb.listTickers())
  ipcMain.handle(
    'db:tickers:ensurePassive',
    (_e, input: tickersDb.CreateTickerInput) => {
      const t = tickersDb.ensurePassiveTicker(input)
      // Warm the company profile so the detail page isn't cold. Fire-and-
      // forget; the detail page falls back to Yahoo fundamentals if the
      // Ollama-generated profile isn't ready yet.
      void ensureCompanyProfile(t.symbol, t.companyName ?? t.symbol)
      return t
    }
  )
  ipcMain.handle('db:tickers:create', (_e, input: tickersDb.CreateTickerInput) => {
    // A passive graph row may already exist for this symbol (migration v24
    // seeds ~75 value-chain tickers with isActive=0). In that case, promote
    // the existing row instead of hitting the UNIQUE-constraint.
    const existing = tickersDb.getTickerBySymbol(input.symbol)
    const t = existing
      ? (tickersDb.setTickerActive(existing.id, true), tickersDb.getTicker(existing.id)!)
      : tickersDb.createTicker(input)
    invalidateMatcherCache(t.symbol)
    invalidateNameIndex()
    // Provision this ticker's dedicated Yahoo + Nasdaq news feeds so the
    // poller picks them up on its next cycle (and on the force-triggered
    // poll we kick below).
    provisionFeedsForTicker(t)
    // Classify existing articles against the newly-added ticker so the brief
    // and coverage list aren't empty until the next poll. Runs in the
    // background; summary refresh chains after it completes.
    void classifyAllArticlesForTicker(t).finally(() => refreshTickerSummary(t.id))
    // Kick an immediate full-feed poll so the newly-provisioned ticker feeds
    // ingest their first articles right away instead of waiting up to five
    // minutes for the scheduler. `force: true` bypasses the ML-cold-start
    // deferral check since we're explicitly responding to user intent.
    void pollAllFeeds({ force: true })
    // Fire-and-forget profile warm-up so opening the new ticker's detail page
    // doesn't hit the cold path.
    void ensureCompanyProfile(t.symbol, t.companyName ?? t.symbol)
    // Filings + analyst estimates warm-up — both are per-watchlist and have
    // multi-hour staleness gates, so we kick an immediate refresh here so
    // the detail page has data to render on first open.
    void forceRefreshFilings(t.symbol)
    void forceRefreshEstimates(t.symbol)
    // Financials warm-up. Without this, the FCF/revenue tiles on the
    // detail page render blank ("—") until the 6h maintenance sweep
    // happens to pick the symbol up — confusing for the user since
    // every other panel populates immediately on add.
    void forceRefreshFinancials(t.symbol).catch((err) =>
      console.warn(`[financials] post-create refresh failed for ${t.symbol}:`, err)
    )
    // Earnings calendar warm-up — same rationale as financials: the
    // Value Chain "Reports in N days" pill needs data immediately, not
    // 30 min later when the next earnings sweep arrives.
    void import('../services/earningsScheduler').then(({ forceRefreshEarnings }) =>
      forceRefreshEarnings(t.symbol).catch((err) =>
        console.warn(`[earnings] post-create refresh failed for ${t.symbol}:`, err)
      )
    )
    // Personal-relevance cache keys off the watchlist, so any mutation
    // there must blow it away — otherwise cached "Why this matters" rows
    // miss the newly added ticker.
    invalidateAllRelevance()
    return t
  })
  ipcMain.handle('db:tickers:delete', (_e, id: number) => {
    const t = tickersDb.listTickers().find((x) => x.id === id)
    tickersDb.deleteTicker(id)
    if (t) {
      invalidateMatcherCache(t.symbol)
      invalidateNameIndex()
      deleteMatchesForSymbol(t.symbol)
    }
    invalidateAllRelevance()
  })
  // Promote a passive graph ticker into the watchlist. Mirrors the warm-up
  // behavior of `db:tickers:create` (provision per-ticker RSS, classify
  // existing articles, force a poll, warm the company profile) but on an
  // already-existing row rather than creating a new one.
  ipcMain.handle('db:tickers:activate', (_e, id: number) => {
    tickersDb.setTickerActive(id, true)
    const t = tickersDb.getTicker(id)
    if (!t) return null
    invalidateMatcherCache(t.symbol)
    invalidateNameIndex()
    provisionFeedsForTicker(t)
    void classifyAllArticlesForTicker(t).finally(() => refreshTickerSummary(t.id))
    void pollAllFeeds({ force: true })
    void ensureCompanyProfile(t.symbol, t.companyName ?? t.symbol)
    void forceRefreshFilings(t.symbol)
    void forceRefreshEstimates(t.symbol)
    void forceRefreshFinancials(t.symbol).catch((err) =>
      console.warn(`[financials] post-activate refresh failed for ${t.symbol}:`, err)
    )
    void import('../services/earningsScheduler').then(({ forceRefreshEarnings }) =>
      forceRefreshEarnings(t.symbol).catch((err) =>
        console.warn(`[earnings] post-activate refresh failed for ${t.symbol}:`, err)
      )
    )
    invalidateAllRelevance()
    return t
  })

  // geo interests
  ipcMain.handle('db:geo:list', () => geoDb.listGeoInterests())
  ipcMain.handle('db:geo:create', (_e, input: geoDb.CreateGeoInterestInput) => {
    const g = geoDb.createGeoInterest(input)
    invalidateAllRelevance()
    return g
  })
  ipcMain.handle('db:geo:updateKeywords', (_e, id: number, keywords: string[]) => {
    geoDb.updateGeoKeywords(id, keywords)
    invalidateAllRelevance()
  })
  ipcMain.handle('db:geo:delete', (_e, id: number) => {
    geoDb.deleteGeoInterest(id)
    invalidateAllRelevance()
  })

  // discovery
  ipcMain.handle('db:discovery:list', () => discoveryDb.listSuggestions())
  ipcMain.handle('db:discovery:countUnviewed', () => discoveryDb.countUnviewed())
  ipcMain.handle('db:discovery:markViewed', (_e, id: number) => discoveryDb.markViewed(id))
  ipcMain.handle('db:discovery:markAllViewed', () => discoveryDb.markAllViewed())
  ipcMain.handle('db:discovery:delete', (_e, id: number) => discoveryDb.deleteSuggestion(id))
  ipcMain.handle('discovery:runDaily', () => runDailyDrip())
  ipcMain.handle('discovery:runWeekly', () => runWeeklyCurated())
  ipcMain.handle('discovery:runPortfolioGaps', () => runPortfolioGaps())

  // preferences
  ipcMain.handle('db:prefs:get', () => prefsDb.getPreferences())
  ipcMain.handle(
    'db:prefs:set',
    (_e, key: keyof prefsDb.Preferences, value: string | number | boolean) => {
      // Trust-boundary whitelist: the renderer can only set keys that exist
      // in the Preferences interface. Without this, a renderer payload
      // could overwrite internal counters stored in the same `preferences`
      // table (e.g. _claudeUsageCount), corrupting the daily-cap tracking.
      if (!prefsDb.isPreferenceKey(key)) {
        console.warn(`[ipc] db:prefs:set rejected unknown key "${String(key)}"`)
        return
      }
      prefsDb.setPreference(key, value)
    }
  )

  // reader
  ipcMain.handle('reader:extract', (_e, url: string) => extractReadable(url))
  ipcMain.handle('reader:smartLookup', (_e, term: string, context?: string) =>
    lookupTerm(term, context)
  )

  // "Why this matters to you" — per-article personal relevance. Returns the
  // cached row (matches + prose) when present, otherwise computes matches
  // synchronously and enqueues the Ollama summary. The renderer subscribes to
  // `relevance:updated` to swap prose in once the background task lands.
  ipcMain.handle('relevance:get', (_e, input: RelevanceRequestInput) =>
    getOrComputeRelevance(input)
  )

  // feed finder (Hyperintelligence)
  ipcMain.handle('feedFinder:ask', (_e, message: string) => findFeedCandidates(message))
  ipcMain.handle('feedFinder:probe', (_e, url: string) => probeCandidate(url))
  ipcMain.handle(
    'feedFinder:add',
    (_e, input: {
      title: string
      url: string
      categoryName: string
      domain: categoriesDb.Domain
    }) => addSuggestedFeed(input)
  )

  // hyperintelligence dispatcher — routes to feeds, articles, Q&A, or
  // settings based on intent classification. The old feedFinder:ask handler
  // stays in place for back-compat (e.g. tests) but the renderer now calls
  // hyper:ask so the router can pick.
  ipcMain.handle('hyper:ask', (_e, message: string) => dispatchHyperMessage(message))

  // hyperintelligence chat history (last 5 sessions)
  ipcMain.handle('hyperChats:list', () => listHyperChats())
  ipcMain.handle('hyperChats:get', (_e, id: number) => getHyperChat(id))
  ipcMain.handle('hyperChats:save', (_e, input: SaveHyperChatInput) => saveHyperChat(input))
  ipcMain.handle('hyperChats:delete', (_e, id: number) => deleteHyperChat(id))

  // stocks
  ipcMain.handle('stocks:getQuotes', () => getLastQuotes())
  ipcMain.handle('stocks:refresh', () => refreshStocksNow())
  ipcMain.handle('stocks:getHistory', (_e, symbol: string, range: HistoryRange) =>
    getHistory(symbol, range)
  )
  ipcMain.handle('stocks:getFundamentals', (_e, symbol: string) => getFundamentals(symbol))
  ipcMain.handle('stocks:getCompanyProfile', (_e, symbol: string) =>
    getCompanyProfile(symbol)
  )
  ipcMain.handle(
    'stocks:ensureCompanyProfile',
    (_e, symbol: string, companyName: string) => ensureCompanyProfile(symbol, companyName)
  )
  ipcMain.handle(
    'stocks:regenerateCompanyProfile',
    (_e, symbol: string, companyName: string) => regenerateCompanyProfile(symbol, companyName)
  )
  // Cashflow overlay: value-chain view pulls snapshots in bulk (one call for
  // every visible tile); the per-symbol endpoint backs the stock detail page
  // and any drilldown.
  ipcMain.handle('stocks:getFinancials', (_e, symbol: string) => computeSnapshot(symbol))
  ipcMain.handle('stocks:getFinancialsBatch', (_e, symbols: string[]) =>
    computeSnapshotsForSymbols(symbols)
  )
  ipcMain.handle('stocks:refreshFinancials', (_e, symbol: string) =>
    forceRefreshFinancials(symbol)
  )
  // Earnings-pulse badges (next scheduled earnings + most-recent reported
  // quarter-end). Batch variant feeds the value-chain overlay; per-symbol
  // endpoint is for focused fetches / tooling.
  ipcMain.handle('stocks:getEarnings', (_e, symbol: string) =>
    getEarningsBadge(symbol)
  )
  ipcMain.handle('stocks:getEarningsBatch', (_e, symbols: string[]) =>
    getEarningsBadgesForSymbols(symbols)
  )
  // Analyst consensus (forward EPS, price targets, upgrade/downgrade tally).
  // Batch variant backs the value-chain focus panel + peer-compare modal;
  // refresh endpoint bypasses the weekly staleness gate for manual kicks.
  ipcMain.handle('stocks:getEstimates', (_e, symbol: string) =>
    getEstimatesSnapshot(symbol)
  )
  ipcMain.handle('stocks:getEstimatesBatch', (_e, symbols: string[]) =>
    getEstimatesSnapshotsForSymbols(symbols)
  )
  ipcMain.handle('stocks:refreshEstimates', (_e, symbol: string) =>
    forceRefreshEstimates(symbol)
  )
  // Single mount-bundle for the ValueChain page. Collapses six independent
  // IPC round-trips (financials + earnings + estimates + sectors-with-
  // content + primary-index + edge-overrides + node-overrides + recent-
  // filings) into one. The handler runs them concurrently in main and
  // returns a single payload — saves seven IPC ping-pongs on every page
  // mount and lets the renderer commit all the data in one render pass
  // instead of rendering empty maps for each slice as it resolves.
  // Incremental refresh still flows through the existing *:updated
  // broadcasts; the bundle is only used at mount.
  ipcMain.handle(
    'valueChain:getMountBundle',
    async (_e, symbols: string[], filingsSinceMs: number) => {
      const sinceMs =
        Number.isFinite(filingsSinceMs) && filingsSinceMs > 0
          ? filingsSinceMs
          : Date.now() - 72 * 60 * 60 * 1000
      const [
        financials,
        earnings,
        estimates,
        sectorsWithContent,
        primaryIndex,
        edgeOverrides,
        nodeOverrides,
        generatedChainSymbols
      ] = await Promise.all([
        Promise.resolve(computeSnapshotsForSymbols(symbols)),
        getEarningsBadgesForSymbols(symbols),
        Promise.resolve(getEstimatesSnapshotsForSymbols(symbols)),
        Promise.resolve(listSectorsWithContent()),
        Promise.resolve(buildPrimarySectorIndex()),
        Promise.resolve(listEdgeOverrides()),
        Promise.resolve(listNodeOverrides()),
        Promise.resolve(listCompanyValueChainSymbols())
      ])
      const filingsMap = getRecentFilingsForSymbols(symbols, sinceMs, INTERESTING_FORMS)
      const recentFilings: Record<string, unknown[]> = {}
      for (const [sym, list] of filingsMap) {
        recentFilings[sym] = list.map((f) => ({
          ...f,
          filingUrl: buildFilingUrl(f.cik, f.accessionNumber),
          primaryDocUrl: buildPrimaryDocUrl(f.cik, f.accessionNumber, f.primaryDocument)
        }))
      }
      return {
        financials,
        earnings,
        estimates,
        sectorsWithContent,
        primaryIndex,
        edgeOverrides,
        nodeOverrides,
        recentFilings,
        generatedChainSymbols
      }
    }
  )
  // SEC EDGAR filings. Per-symbol list (ticker detail page), batch-recent
  // (value-chain "new 8-K" badges), and a force-refresh hook for promotion
  // flows that can't wait for the daily sweep.
  ipcMain.handle(
    'sec:getFilings',
    (_e, symbol: string, limit?: number, onlyInteresting?: boolean) =>
      getFilingsForSymbol(
        symbol,
        limit ?? 20,
        onlyInteresting ? INTERESTING_FORMS : undefined
      ).map((f) => ({
        ...f,
        filingUrl: buildFilingUrl(f.cik, f.accessionNumber),
        primaryDocUrl: buildPrimaryDocUrl(f.cik, f.accessionNumber, f.primaryDocument)
      }))
  )
  ipcMain.handle(
    'sec:getRecentFilings',
    (_e, symbols: string[], sinceMs: number, onlyInteresting?: boolean) => {
      const map = getRecentFilingsForSymbols(
        symbols,
        sinceMs,
        onlyInteresting ? INTERESTING_FORMS : undefined
      )
      // Serialize to a plain object for IPC; Maps survive structured clone
      // but an object is easier to consume on the renderer side.
      const out: Record<string, unknown[]> = {}
      for (const [sym, filings] of map) {
        out[sym] = filings.map((f) => ({
          ...f,
          filingUrl: buildFilingUrl(f.cik, f.accessionNumber),
          primaryDocUrl: buildPrimaryDocUrl(f.cik, f.accessionNumber, f.primaryDocument)
        }))
      }
      return out
    }
  )
  ipcMain.handle('sec:refreshFilings', (_e, symbol: string) => forceRefreshFilings(symbol))

  // Earnings-release AI summaries. getReleaseSummary returns the cached row
  // (null when we haven't processed this accession yet); summarizeRelease
  // fetches the 8-K primary doc, extracts text, and runs the Ollama
  // pipeline — useful when a user expands an old 8-K that landed before
  // this feature was installed.
  ipcMain.handle(
    'sec:getReleaseSummary',
    (_e, symbol: string, accessionNumber: string) =>
      getEarningsRelease(symbol, accessionNumber)
  )
  ipcMain.handle(
    'sec:getReleaseSummariesForSymbol',
    (_e, symbol: string, limit?: number) =>
      getEarningsReleasesForSymbol(symbol, limit ?? 12)
  )
  ipcMain.handle(
    'sec:summarizeRelease',
    async (_e, symbol: string, accessionNumber: string) => {
      const filings = getFilingsForSymbol(symbol, 50)
      const match = filings.find((f) => f.accessionNumber === accessionNumber)
      if (!match || !isEarningsRelease(match)) return null
      const ticker = tickersDb
        .listTickers()
        .find((t) => t.symbol.toUpperCase() === symbol.toUpperCase())
      const companyName = ticker?.companyName ?? symbol
      return summarizeRelease({ symbol, companyName, filing: match })
    }
  )

  // Options snapshot — nearest-expiry IV, put/call OI ratio, ATM straddle
  // cost (= expected move through expiry). 15-min in-memory cache inside
  // yahooFinanceService handles intraday refresh; the IPC handler just
  // passes through.
  ipcMain.handle('stocks:getOptionsSnapshot', (_e, symbol: string) =>
    getOptionsSnapshot(symbol)
  )

  // Ticker autocomplete — any US-listed name, not just the curated graph.
  // Powers the Explore-tickers search on the Stocks page.
  ipcMain.handle('stocks:searchTickers', (_e, query: string, limit?: number) =>
    searchTickers(query, limit ?? 8)
  )

  // Per-ticker Ollama-generated value chain. Lives on the stock detail page;
  // explicitly triggered by the "Generate value chain" button so Ollama
  // doesn't run for every ticker the user merely browses past.
  ipcMain.handle(
    'stocks:generateCompanyChain',
    async (_e, symbol: string, companyName: string, force?: boolean) => {
      const { generateCompanyChain, readCompanyChain } = await import(
        '../services/companyValueChainService'
      )
      await generateCompanyChain({ symbol, companyName, force })
      return readCompanyChain(symbol)
    }
  )
  ipcMain.handle('stocks:getCompanyChain', async (_e, symbol: string) => {
    const { readCompanyChain } = await import('../services/companyValueChainService')
    return readCompanyChain(symbol)
  })
  // Bulk regenerate every existing company_value_chains row. Useful after
  // pipeline improvements so existing chains pick up new classifier /
  // absorber behavior without the user re-clicking Generate on each detail
  // page. Fire-and-forget from the renderer's perspective — progress is
  // broadcast on 'chainRegen:progress'.
  ipcMain.handle('stocks:regenerateAllChains', async () => {
    const { regenerateAllChains } = await import('../services/companyValueChainService')
    void regenerateAllChains()
    return { ok: true }
  })
  // One-shot Claude-only variant. Bypasses the local cap counter and
  // disables Ollama fallback so the entire run uses Sonnet for maximum
  // citation quality. The renderer surfaces this as a separate explicit
  // action rather than a toggle on the regular regen — different cost
  // profile, different risk profile, deserves its own button click.
  ipcMain.handle('stocks:regenerateAllChainsForceClaude', async () => {
    const { regenerateAllChains } = await import('../services/companyValueChainService')
    void regenerateAllChains({ forceProvider: 'claude' })
    return { ok: true }
  })
  ipcMain.handle('stocks:getRegenerateAllProgress', async () => {
    const { getRegenerateAllProgress } = await import('../services/companyValueChainService')
    return getRegenerateAllProgress()
  })
  // Manual reset of today's Claude usage counter. Use after a one-shot
  // bypass run (regen-all with the gate disabled) inflated the counter
  // — without this, the rest of the day's Claude calls fall back to
  // Ollama because count > cap. Returns the new state for confirmation.
  ipcMain.handle('stocks:resetClaudeUsage', async () => {
    const { resetClaudeUsage } = await import('../services/aiClient')
    return resetClaudeUsage()
  })
  ipcMain.handle('stocks:getClaudeUsage', async () => {
    const { getClaudeUsage } = await import('../services/aiClient')
    return getClaudeUsage()
  })

  // ---- Daily morning brief --------------------------------------------------
  // Read the cached brief (returns null when nothing's been generated yet),
  // or trigger a forced refresh that bypasses the staleness gate. The
  // 'morningBrief:updated' broadcast fires when refreshMorningBrief writes
  // a new row, so the renderer can subscribe and re-fetch.
  ipcMain.handle('brief:getCurrent', async () => {
    const { getCurrentMorningBrief } = await import('../services/morningBriefService')
    return getCurrentMorningBrief()
  })
  ipcMain.handle('brief:refresh', async () => {
    const { refreshMorningBrief } = await import('../services/morningBriefService')
    void refreshMorningBrief({ force: true })
    return { ok: true }
  })

  // ---- Research (academia search + multi-paper synthesis) -----------------
  // Papers only — no synthesis. research:search below blocks on a Sonnet
  // call at maxTokens 4000 before returning ANYTHING, which is 30-60s of
  // empty UI and reads as "search is broken". The renderer now fetches
  // papers first and the brief separately, so cards appear in ~2s.
  ipcMain.handle('research:searchPapersOnly', async (_e, query: string) => {
    const { searchPapers } = await import('../services/researchService')
    try {
      return await searchPapers(query)
    } catch (err) {
      console.warn(
        '[research] searchPapersOnly failed:',
        err instanceof Error ? err.message : err
      )
      return []
    }
  })

  // Synthesis for an already-fetched paper set. Returns null rather than
  // throwing when Claude is unavailable, so a failed brief never costs the
  // user their search results.
  ipcMain.handle(
    'research:synthesize',
    async (_e, query: string, papers: unknown) => {
      const { synthesizeResearchBrief } = await import('../services/researchService')
      try {
        return await synthesizeResearchBrief(
          query,
          Array.isArray(papers) ? papers : []
        )
      } catch (err) {
        console.warn(
          '[research] synthesize failed:',
          err instanceof Error ? err.message : err
        )
        return null
      }
    }
  )

  ipcMain.handle('research:search', async (_e, query: string) => {
    const { searchAndSynthesize } = await import('../services/researchService')
    return searchAndSynthesize(query)
  })
  ipcMain.handle('research:listTopics', async () => {
    const { listResearchTopics } = await import('../database/researchTopics')
    return listResearchTopics()
  })
  ipcMain.handle(
    'research:createTopic',
    async (_e, input: { query: string; label?: string }) => {
      const { createResearchTopic } = await import('../database/researchTopics')
      const topic = createResearchTopic(input)
      // Kick off the first synthesis in the background so the user
      // sees a brief on next visit without waiting for the weekly tick.
      const { refreshTopicNow } = await import('../services/researchScheduler')
      void refreshTopicNow(topic.id)
      return topic
    }
  )
  ipcMain.handle('research:deleteTopic', async (_e, id: number) => {
    const { deleteResearchTopic } = await import('../database/researchTopics')
    const { deleteResearchBrief } = await import('../database/researchBriefs')
    deleteResearchBrief(id)
    deleteResearchTopic(id)
    return { ok: true }
  })
  // Rehydrate a brief's paper cards from its persisted paperIds — one S2
  // batch call, no search and no Sonnet synthesis. See hydratePapersByIds.
  ipcMain.handle('research:hydratePapers', async (_e, paperIds: string[]) => {
    const { hydratePapersByIds } = await import('../services/researchService')
    return hydratePapersByIds(Array.isArray(paperIds) ? paperIds : [])
  })

  // ---- research: semantic layer, unified graph, corpus, finance bridge ----

  // SPECTER2 nearest neighbours. Fetches any missing vectors first, so the
  // first call on a paper pays one S2 batch request and later ones are local.
  ipcMain.handle('research:similar', async (_e, paperId: string, limit?: number) => {
    const { ensureEmbeddings, findSimilar } = await import(
      '../services/paperSimilarityService'
    )
    const { getBookmarkedPaperIds } = await import('../database/researchBookmarks')
    await ensureEmbeddings([paperId, ...getBookmarkedPaperIds()])
    return findSimilar(paperId, limit ?? 10)
  })

  // Rank candidates against the centroid of the saved library — a
  // recommendation that needs no query at all.
  ipcMain.handle('research:recommend', async (_e, candidateIds: string[], limit?: number) => {
    const { ensureEmbeddings, recommendFromLibrary } = await import(
      '../services/paperSimilarityService'
    )
    const { getBookmarkedPaperIds } = await import('../database/researchBookmarks')
    const ids = Array.isArray(candidateIds) ? candidateIds : []
    await ensureEmbeddings([...ids, ...getBookmarkedPaperIds()])
    return recommendFromLibrary(ids, limit ?? 10)
  })

  // Union of every paper chain — the "universe view" over
  // paper_value_chain_edges, which was populated but never read.
  ipcMain.handle('research:graph', async () => {
    const { getResearchGraph } = await import('../services/researchGraphService')
    return getResearchGraph()
  })

  // Grow the graph one bounded pass. Each run walks a slice of the frontier
  // and marks it expanded, so repeated calls make progress rather than
  // re-walking the same papers.
  ipcMain.handle('research:expandGraph', async (_e, papers?: number) => {
    const { expandGraph } = await import('../services/researchGraphExpander')
    return expandGraph(typeof papers === 'number' ? { papers } : {})
  })

  // Grow from one specific paper, seeding it if the graph has not seen it.
  ipcMain.handle('research:expandFromPaper', async (_e, paperId: string) => {
    const { expandFromPaper } = await import('../services/researchGraphExpander')
    return expandFromPaper(paperId)
  })

  ipcMain.handle('research:coCited', async (_e, paperId: string, limit?: number) => {
    const { findCoCited } = await import('../services/researchGraphService')
    return findCoCited(paperId, limit ?? 15)
  })

  // Multi-source search. S2 first so its richer metadata wins the merge.
  ipcMain.handle('research:searchAll', async (_e, query: string) => {
    const { searchPapers } = await import('../services/researchService')
    const { searchOpenAlex, searchArxiv, mergePaperSources } = await import(
      '../services/corpusService'
    )
    const [s2, openalex, arxiv] = await Promise.all([
      searchPapers(query).catch(() => []),
      searchOpenAlex(query).catch(() => ({ papers: [], concepts: [] })),
      searchArxiv(query).catch(() => [])
    ])
    return {
      papers: mergePaperSources(s2, openalex.papers, arxiv),
      concepts: openalex.concepts
    }
  })

  // Research <-> finance bridge.
  ipcMain.handle(
    'research:linkTickers',
    async (_e, input: { paperId: string; title: string; abstract?: string | null }) => {
      const { linkPaperToTickers } = await import('../services/researchFinanceBridge')
      return linkPaperToTickers(input)
    }
  )
  ipcMain.handle('research:linksForPaper', async (_e, paperId: string) => {
    const { listLinksForPaper } = await import('../database/paperTickerLinks')
    return listLinksForPaper(paperId)
  })
  ipcMain.handle('research:linksForSymbol', async (_e, symbol: string) => {
    const { listLinksForSymbol } = await import('../database/paperTickerLinks')
    return listLinksForSymbol(symbol)
  })

  ipcMain.handle('research:getBrief', async (_e, topicId: number) => {
    const { getResearchBrief } = await import('../database/researchBriefs')
    return getResearchBrief(topicId)
  })
  ipcMain.handle('research:refreshTopic', async (_e, topicId: number) => {
    const { refreshTopicNow } = await import('../services/researchScheduler')
    void refreshTopicNow(topicId)
    return { ok: true }
  })
  ipcMain.handle('research:getPaper', async (_e, paperId: string) => {
    const { getPaper } = await import('../services/researchService')
    return getPaper(paperId)
  })
  ipcMain.handle('research:listCiting', async (_e, paperId: string) => {
    const { listCitingPapers } = await import('../services/researchService')
    return listCitingPapers(paperId)
  })
  ipcMain.handle('research:listReferences', async (_e, paperId: string) => {
    const { listReferencedPapers } = await import('../services/researchService')
    return listReferencedPapers(paperId)
  })
  // Bookmarks — local-only, stored in research_bookmarks (v48). Renderer
  // reads listBookmarks once on Research tab mount, then keeps a local
  // Set in sync via the bookmark/unbookmark response payloads.
  ipcMain.handle('research:listBookmarks', async () => {
    const { listResearchBookmarks } = await import('../database/researchBookmarks')
    return listResearchBookmarks()
  })
  ipcMain.handle('research:bookmark', async (_e, paper: import('../../preload').ResearchPaper) => {
    const { bookmarkResearchPaper } = await import('../database/researchBookmarks')
    const row = bookmarkResearchPaper(paper)
    // Auto-fetch foundational refs so the "Built on" section renders
    // immediately when the user opens detail later. Fire-and-forget;
    // the user sees the bookmark land instantly even if S2 is slow.
    void (async () => {
      try {
        const { getFoundationalCache, upsertFoundationalCache } = await import(
          '../database/researchFoundational'
        )
        if (getFoundationalCache(paper.paperId)) return
        const { fetchFoundationalReferences } = await import('../services/researchService')
        const foundational = await fetchFoundationalReferences(paper.paperId)
        upsertFoundationalCache(paper.paperId, foundational)
      } catch (err) {
        console.warn(
          '[research] auto-fetch foundational on bookmark failed:',
          err instanceof Error ? err.message : err
        )
      }
    })()
    return row
  })
  ipcMain.handle('research:unbookmark', async (_e, paperId: string) => {
    const { unbookmarkResearchPaper } = await import('../database/researchBookmarks')
    unbookmarkResearchPaper(paperId)
    return { ok: true }
  })
  // Foundational refs lookup. Cache-first; on miss, fetches from S2,
  // applies the isInfluential + intents heuristic, persists, and
  // returns. Renderer calls this when the paper detail panel opens.
  ipcMain.handle('research:getFoundational', async (_e, paperId: string) => {
    const { getFoundationalCache, upsertFoundationalCache } = await import(
      '../database/researchFoundational'
    )
    const cached = getFoundationalCache(paperId)
    if (cached) return cached.foundational
    const { fetchFoundationalReferences } = await import('../services/researchService')
    const foundational = await fetchFoundationalReferences(paperId)
    upsertFoundationalCache(paperId, foundational)
    return foundational
  })
  // Inverse direction — given a paper P, return the user's bookmarks
  // that named P as foundational (i.e. P appears in their cached list).
  // Walks all bookmark caches in-memory; cheap at hundreds of bookmarks,
  // doesn't hit S2 at all.
  ipcMain.handle('research:getFoundationalFor', async (_e, paperId: string) => {
    const { listResearchBookmarks } = await import('../database/researchBookmarks')
    const { getFoundationalCache } = await import('../database/researchFoundational')
    const bookmarks = listResearchBookmarks()
    const out: import('../../preload').ResearchPaper[] = []
    for (const b of bookmarks) {
      const cache = getFoundationalCache(b.paperId)
      if (!cache) continue
      if (cache.foundational.some((p) => p.paperId === paperId)) {
        out.push(b.paper)
      }
    }
    return out
  })
  // Topic ↔ bookmark tagging — many-to-many junction. Each call wraps
  // a single row mutation; the renderer fans these out.
  ipcMain.handle('research:listTopicsForBookmark', async (_e, paperId: string) => {
    const { listTopicsForBookmark } = await import('../database/researchBookmarkTopics')
    return listTopicsForBookmark(paperId)
  })
  ipcMain.handle('research:listBookmarksForTopic', async (_e, topicId: number) => {
    const { listBookmarksForTopic } = await import('../database/researchBookmarkTopics')
    return listBookmarksForTopic(topicId)
  })
  ipcMain.handle(
    'research:tagBookmark',
    async (_e, paperId: string, topicId: number) => {
      const { tagBookmark } = await import('../database/researchBookmarkTopics')
      tagBookmark(paperId, topicId)
      return { ok: true }
    }
  )
  ipcMain.handle(
    'research:untagBookmark',
    async (_e, paperId: string, topicId: number) => {
      const { untagBookmark } = await import('../database/researchBookmarkTopics')
      untagBookmark(paperId, topicId)
      return { ok: true }
    }
  )
  ipcMain.handle('research:listAllBookmarkTopicLinks', async () => {
    const { getAllBookmarkTopicLinks } = await import(
      '../database/researchBookmarkTopics'
    )
    return getAllBookmarkTopicLinks()
  })
  // Directed edges among bookmarks where one bookmark's foundational
  // list names another bookmark. Drives the Research Map's edge set —
  // visualizes the citation web inside the user's library. Pure
  // in-memory walk over local caches; no S2 calls.
  ipcMain.handle('research:listBookmarkFoundationalEdges', async () => {
    const { listResearchBookmarks } = await import('../database/researchBookmarks')
    const { getFoundationalCache } = await import('../database/researchFoundational')
    const bookmarks = listResearchBookmarks()
    const bookmarkedIds = new Set(bookmarks.map((b) => b.paperId))
    const edges: Array<{ from: string; to: string }> = []
    for (const b of bookmarks) {
      const cache = getFoundationalCache(b.paperId)
      if (!cache) continue
      for (const f of cache.foundational) {
        // Edge only if the foundational target is also bookmarked.
        // Directed: b builds on f, so the arrow is b → f.
        if (bookmarkedIds.has(f.paperId)) {
          edges.push({ from: b.paperId, to: f.paperId })
        }
      }
    }
    return edges
  })
  // Auto-recorded recent searches — distinct from saved topics and
  // bookmarks. Just a "stuff I searched recently" list.
  ipcMain.handle('research:listRecent', async (_e, limit?: number) => {
    const { listRecentSearches } = await import('../database/researchRecentSearches')
    return listRecentSearches(limit ?? 10)
  })
  ipcMain.handle('research:recordRecent', async (_e, query: string) => {
    const { recordRecentSearch } = await import('../database/researchRecentSearches')
    recordRecentSearch(query)
    return { ok: true }
  })
  ipcMain.handle('research:clearRecent', async (_e, query: string) => {
    const { clearRecentSearch } = await import('../database/researchRecentSearches')
    clearRecentSearch(query)
    return { ok: true }
  })
  // Bridge papers — papers cited as foundational by ≥2 of the user's
  // bookmarks but not yet bookmarked themselves. Surfaces high-leverage
  // suggestions in the Bookmarks view: papers that anchor multiple
  // works in your library are likely worth opening. Computed entirely
  // from local caches (research_bookmarks + research_paper_foundational),
  // no S2 calls.
  ipcMain.handle('research:listBridgePapers', async () => {
    const { listResearchBookmarks } = await import('../database/researchBookmarks')
    const { getFoundationalCache } = await import('../database/researchFoundational')
    const { computeBridgePapers } = await import('../services/researchService')
    const bookmarks = listResearchBookmarks()
    const bookmarkedIds = new Set(bookmarks.map((b) => b.paperId))
    const foundationalByBookmark = new Map<
      string,
      import('../../preload').ResearchPaper[]
    >()
    for (const b of bookmarks) {
      const cache = getFoundationalCache(b.paperId)
      if (cache) foundationalByBookmark.set(b.paperId, cache.foundational)
    }
    return computeBridgePapers(bookmarkedIds, foundationalByBookmark)
  })

  // ---- Paper Value Chain (Research Phase 3A) -----------------------------
  // Cache-first read. Returns the persisted chain when present, null
  // otherwise. Renderer calls this on mount to render instantly when a
  // chain has been generated before; falls back to regenerate when null.
  ipcMain.handle('research:getPaperChain', async (_e, paperId: string) => {
    const { getCachedPaperValueChain } = await import('../services/paperValueChainService')
    return getCachedPaperValueChain(paperId)
  })
  // On-demand regeneration. The button on each paper card calls this;
  // returns the freshly-generated chain (or a tagged failure result so
  // the UI can surface rate-limit / focal-not-found states distinctly).
  ipcMain.handle('research:regeneratePaperChain', async (_e, paperId: string) => {
    const { regeneratePaperValueChain } = await import(
      '../services/paperValueChainService'
    )
    return regeneratePaperValueChain(paperId)
  })

  // ---- FRED macro panel ----------------------------------------------------
  ipcMain.handle('fred:getSnapshot', async () => {
    const { getMacroSnapshot } = await import('../services/fredService')
    return getMacroSnapshot()
  })
  ipcMain.handle('fred:refresh', async () => {
    const { refreshAllFredSeries } = await import('../services/fredService')
    void refreshAllFredSeries(true)
    return { ok: true }
  })

  // ---- Chain corrections ---------------------------------------------------
  // User-flagged fixes to per-ticker value chains. Applied in two places:
  // (1) at chain-read time to mutate the rendered focus panel immediately,
  // and (2) injected into the Claude generator prompt on the next regen so
  // the model honors the verdict instead of repeating the original mistake.
  // 'chainCorrections:updated' broadcasts on every write so the renderer's
  // focus panel can re-fetch.
  ipcMain.handle('chainCorrections:list', async (_e, focusSymbol: string) => {
    const { listForFocus } = await import('../services/chainCorrectionsService')
    return listForFocus(focusSymbol)
  })
  ipcMain.handle(
    'chainCorrections:upsert',
    async (
      _e,
      input: import('../services/chainCorrectionsService').UpsertCorrectionInput
    ) => {
      const { applyCorrection } = await import('../services/chainCorrectionsService')
      return applyCorrection(input)
    }
  )
  ipcMain.handle(
    'chainCorrections:delete',
    async (
      _e,
      input: {
        focusSymbol: string
        subjectType: import('../services/chainCorrectionsService').ChainCorrectionSubjectType
        subjectKey: string
        correctionType: import('../services/chainCorrectionsService').ChainCorrectionType
      }
    ) => {
      const { removeCorrection } = await import('../services/chainCorrectionsService')
      removeCorrection(input)
      return { ok: true }
    }
  )

  // Value-chain growth pipeline. Renderer surfaces the audit log + overlay
  // list in Settings, lets users trigger a sweep manually, and hit Undo on
  // any auto-accepted edge they disagree with. The Undo flow deletes the
  // override and marks the source candidate rejected so next sweep doesn't
  // re-propose.
  ipcMain.handle(
    'graph:listCandidates',
    (_e, opts?: { status?: 'accepted' | 'rejected' | 'pending'; limit?: number }) =>
      listCandidates(opts)
  )
  ipcMain.handle('graph:listOverrides', () => listEdgeOverrides())
  ipcMain.handle('graph:listNodeOverrides', () => listNodeOverrides())
  ipcMain.handle(
    'graph:undoNodeOverride',
    (_e, symbol: string, candidateId?: number | null) => {
      deleteNodeOverride(symbol)
      if (candidateId) {
        markCandidateRejected(candidateId, 'User removed node override via audit panel')
      }
      // Broadcast graph:updated so the main Value Chain view refreshes its
      // overrides cache and the removed node disappears from stage groups.
      // Without this, the undo only affected the Settings panel's reload()
      // and the main view kept showing stale tiles.
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('graph:updated')
      }
      return { ok: true }
    }
  )
  ipcMain.handle(
    'graph:countSince',
    (_e, sinceMs: number) => countCandidatesSince(sinceMs)
  )
  ipcMain.handle('graph:runSweep', async () => {
    const summary = await runGraphSweep()
    return summary
  })
  ipcMain.handle('graph:runTenKScan', async () => {
    const summary = await runTenKScanNow()
    return summary
  })
  ipcMain.handle(
    'graph:undoOverride',
    (
      _e,
      fromSymbol: string,
      toSymbol: string,
      relationship: string,
      candidateId?: number | null
    ) => {
      deleteEdgeOverride(fromSymbol, toSymbol, relationship)
      if (candidateId) {
        markCandidateRejected(candidateId, 'User removed override via audit panel')
      }
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('graph:updated')
      }
      return { ok: true }
    }
  )

  // sectors — unified multi-sector graph. listWithContent rolls up ticker
  // counts so the UI only surfaces top-level GICS sectors that actually
  // have assigned tickers. primarySectorIndex + topLevelAncestor power the
  // cross-sector edge badge (endpoints whose primary sectors resolve to
  // different top-level parents are "cross-sector").
  // Whole-market graph — nodes, edges, sector ancestry, sizing metrics and
  // news co-mentions in one round-trip. See marketGraphService.
  ipcMain.handle('graph:getMarketGraph', async () => {
    const { getMarketGraph } = await import('../services/marketGraphService')
    return getMarketGraph()
  })

  ipcMain.handle('sectors:list', () => listSectors())
  ipcMain.handle('sectors:listWithContent', () => listSectorsWithContent())
  ipcMain.handle('sectors:forSymbol', (_e, symbol: string) => getSectorsForSymbol(symbol))
  ipcMain.handle('sectors:primaryIndex', () => buildPrimarySectorIndex())
  ipcMain.handle('sectors:topLevelAncestor', (_e, sectorId: string) =>
    getTopLevelAncestor(sectorId)
  )

  // sports
  ipcMain.handle('sports:listLeagues', () => listLeagues())
  ipcMain.handle(
    'sports:listGames',
    (_e, leagueId: string, groupId?: string | null) =>
      listGames(leagueId, undefined, groupId ?? null)
  )
  ipcMain.handle('sports:listSeasonGames', (_e, leagueId: string) => listSeasonGames(leagueId))
  ipcMain.handle('sports:listNcaaConferences', (_e, leagueId: string) =>
    listNcaaConferences(leagueId)
  )
  ipcMain.handle('sports:listTeams', (_e, leagueId: string) => listTeams(leagueId))
  ipcMain.handle(
    'sports:getGameDetail',
    (_e, leagueId: string, leaguePath: string, eventId: string) =>
      getGameDetail(leagueId, leaguePath, eventId)
  )
  ipcMain.handle(
    'sports:listLeagueLeaders',
    (_e, leagueId: string, seasonType?: 'regular' | 'postseason') =>
      listLeagueLeaders(leagueId, seasonType ?? 'regular')
  )
  ipcMain.handle('sports:listTeamLeaders', (_e, leagueId: string, teamId: string) =>
    listTeamLeaders(leagueId, teamId)
  )
  ipcMain.handle('sports:getReelGroups', () => ({
    groups: getLastReelGroups(),
    warmed: isSportsReelWarmed()
  }))

  // calendar
  ipcMain.handle('calendar:get', () => getCalendarStrip())
  ipcMain.handle(
    'ipo:getBrief',
    (_e, input: { symbol: string; companyName: string }) => getIpoBrief(input)
  )

  // user config (pulse-preferences.json)
  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:update', (_e, patch: ConfigPatch) => updateConfig(patch))
  ipcMain.handle('config:export', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showSaveDialog(win, {
          title: 'Export Pulse preferences',
          defaultPath: CONFIG_FILENAME,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
      : await dialog.showSaveDialog({
          title: 'Export Pulse preferences',
          defaultPath: CONFIG_FILENAME,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
    if (result.canceled || !result.filePath) return { ok: false as const, canceled: true }
    try {
      await exportConfigTo(result.filePath)
      return { ok: true as const, path: result.filePath }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('config:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Import Pulse preferences',
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile']
        })
      : await dialog.showOpenDialog({
          title: 'Import Pulse preferences',
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile']
        })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, canceled: true }
    }
    try {
      const config = await importConfigFrom(result.filePaths[0])
      return { ok: true as const, config }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // favorite teams
  ipcMain.handle('db:favoriteTeams:list', () => favoriteTeamsDb.listFavoriteTeams())
  ipcMain.handle(
    'db:favoriteTeams:add',
    (_e, input: favoriteTeamsDb.AddFavoriteTeamInput) => {
      const fav = favoriteTeamsDb.addFavoriteTeam(input)
      resetSportsAlertState()
      invalidateAllRelevance()
      return fav
    }
  )
  ipcMain.handle('db:favoriteTeams:delete', (_e, id: number) => {
    favoriteTeamsDb.deleteFavoriteTeam(id)
    resetSportsAlertState()
    invalidateAllRelevance()
  })
  ipcMain.handle('db:favoriteTeams:setAlerts', (_e, id: number, enabled: boolean) =>
    favoriteTeamsDb.setFavoriteTeamAlerts(id, enabled)
  )

  // favorite athletes
  ipcMain.handle('db:favoriteAthletes:list', () => favoriteAthletesDb.listFavoriteAthletes())
  ipcMain.handle(
    'db:favoriteAthletes:add',
    (_e, input: favoriteAthletesDb.AddFavoriteAthleteInput) => {
      const fav = favoriteAthletesDb.addFavoriteAthlete(input)
      invalidateAllRelevance()
      return fav
    }
  )
  ipcMain.handle('db:favoriteAthletes:delete', (_e, id: number) => {
    favoriteAthletesDb.deleteFavoriteAthlete(id)
    invalidateAllRelevance()
  })

  // reels
  ipcMain.handle('db:reels:list', (_e, limit?: number) => reelsDb.listReels(limit ?? 50))
  ipcMain.handle('db:reels:count', () => reelsDb.countReels())
  ipcMain.handle('db:reels:delete', (_e, id: number) => deleteReelById(id))
  ipcMain.handle('reels:generate', () => runReelGeneration(true))
  ipcMain.handle('reels:generateForArticle', (_e, articleId: number) =>
    generateReelFromArticleId(articleId)
  )
  ipcMain.handle('reels:rebuildAudio', () => rebuildAllReelAudio())
  ipcMain.handle('reels:rebuildOne', (_e, id: number) => rebuildReelAudio(id))
}
