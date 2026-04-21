import { ipcMain } from 'electron'
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
import { getFundamentals, getHistory, type HistoryRange } from '../services/yahooFinanceService'
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
  listTeamLeaders
} from '../services/sportsService'
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
import { buildTickerTerms } from '../services/tickerTerms'
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
import {
  listHyperChats,
  getHyperChat,
  saveHyperChat,
  deleteHyperChat,
  type SaveHyperChatInput
} from '../database/hyperChats'

export function registerDbIpc(): void {
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
  ipcMain.handle('db:articles:setBookmarked', (_e, id: number, bookmarked: boolean) =>
    articlesDb.setBookmarked(id, bookmarked)
  )
  ipcMain.handle('db:articles:listForTicker', (_e, tickerId: number) => {
    const ticker = tickersDb.listTickers().find((t) => t.id === tickerId)
    if (!ticker) return []
    return articlesDb.listArticlesMatching(buildTickerTerms(ticker), 60)
  })

  ipcMain.handle('tickers:summarize', (_e, tickerId: number) => {
    const cached = getTickerSummary(tickerId)
    // If we've never run for this ticker (app just upgraded, ticker just added,
    // or refresh hasn't finished its first lap), kick a background pass so
    // the next event updates the UI.
    if (!cached) {
      refreshTickerSummary(tickerId)
      return { summary: null, articleCount: 0, generatedAt: null }
    }
    return {
      summary: cached.summary,
      articleCount: cached.articleCount,
      generatedAt: cached.generatedAt
    }
  })

  // tickers
  ipcMain.handle('db:tickers:list', () => tickersDb.listTickers())
  ipcMain.handle('db:tickers:create', (_e, input: tickersDb.CreateTickerInput) => {
    const t = tickersDb.createTicker(input)
    refreshTickerSummary(t.id)
    // Fire-and-forget profile warm-up so opening the new ticker's detail page
    // doesn't hit the cold path.
    void ensureCompanyProfile(t.symbol, t.companyName ?? t.symbol)
    return t
  })
  ipcMain.handle('db:tickers:delete', (_e, id: number) => tickersDb.deleteTicker(id))

  // geo interests
  ipcMain.handle('db:geo:list', () => geoDb.listGeoInterests())
  ipcMain.handle('db:geo:create', (_e, input: geoDb.CreateGeoInterestInput) =>
    geoDb.createGeoInterest(input)
  )
  ipcMain.handle('db:geo:updateKeywords', (_e, id: number, keywords: string[]) =>
    geoDb.updateGeoKeywords(id, keywords)
  )
  ipcMain.handle('db:geo:delete', (_e, id: number) => geoDb.deleteGeoInterest(id))

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
    (_e, key: keyof prefsDb.Preferences, value: string | number | boolean) =>
      prefsDb.setPreference(key, value)
  )

  // reader
  ipcMain.handle('reader:extract', (_e, url: string) => extractReadable(url))
  ipcMain.handle('reader:smartLookup', (_e, term: string, context?: string) =>
    lookupTerm(term, context)
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

  // sports
  ipcMain.handle('sports:listLeagues', () => listLeagues())
  ipcMain.handle('sports:listGames', (_e, leagueId: string) => listGames(leagueId))
  ipcMain.handle('sports:listSeasonGames', (_e, leagueId: string) => listSeasonGames(leagueId))
  ipcMain.handle('sports:listTeams', (_e, leagueId: string) => listTeams(leagueId))
  ipcMain.handle(
    'sports:getGameDetail',
    (_e, leagueId: string, leaguePath: string, eventId: string) =>
      getGameDetail(leagueId, leaguePath, eventId)
  )
  ipcMain.handle('sports:listLeagueLeaders', (_e, leagueId: string) =>
    listLeagueLeaders(leagueId)
  )
  ipcMain.handle('sports:listTeamLeaders', (_e, leagueId: string, teamId: string) =>
    listTeamLeaders(leagueId, teamId)
  )

  // favorite teams
  ipcMain.handle('db:favoriteTeams:list', () => favoriteTeamsDb.listFavoriteTeams())
  ipcMain.handle(
    'db:favoriteTeams:add',
    (_e, input: favoriteTeamsDb.AddFavoriteTeamInput) => {
      const fav = favoriteTeamsDb.addFavoriteTeam(input)
      resetSportsAlertState()
      return fav
    }
  )
  ipcMain.handle('db:favoriteTeams:delete', (_e, id: number) => {
    favoriteTeamsDb.deleteFavoriteTeam(id)
    resetSportsAlertState()
  })
  ipcMain.handle('db:favoriteTeams:setAlerts', (_e, id: number, enabled: boolean) =>
    favoriteTeamsDb.setFavoriteTeamAlerts(id, enabled)
  )

  // favorite athletes
  ipcMain.handle('db:favoriteAthletes:list', () => favoriteAthletesDb.listFavoriteAthletes())
  ipcMain.handle(
    'db:favoriteAthletes:add',
    (_e, input: favoriteAthletesDb.AddFavoriteAthleteInput) =>
      favoriteAthletesDb.addFavoriteAthlete(input)
  )
  ipcMain.handle('db:favoriteAthletes:delete', (_e, id: number) =>
    favoriteAthletesDb.deleteFavoriteAthlete(id)
  )

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
