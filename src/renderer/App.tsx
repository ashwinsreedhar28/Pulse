import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCategories } from './hooks/useCategories'
import { useArticles } from './hooks/useArticles'
import { Settings } from './components/Settings'
import { Discovery } from './components/Discovery'
import { Hyperintelligence } from './components/Hyperintelligence'
import { Reels } from './components/Reels'
import { CalendarStrip } from './components/CalendarStrip'
import { ExternalReader } from './components/ExternalReader'
import { FindBar } from './components/FindBar'
import { ResearchPage } from './components/ResearchPage'
import { CollapseChevron, useCollapsedSection } from './components/collapseUI'
import { ValueChain } from './components/ValueChain'
import MarketGraph from './components/MarketGraph'
import { UnifiedValueChainCard } from './components/UnifiedValueChainCard'
import { ValueChainDiagram } from './components/ValueChainDiagram'
import { MorningBrief } from './components/MorningBrief'
import { MacroPanel } from './components/MacroPanel'
import { FcfSparkline } from './components/FcfSparkline'
import {
  fcfMarginTone,
  formatMoneyCompact,
  formatPctDelta,
  formatPctValue
} from './components/financialsFormat'
import { SecFilingsSection } from './components/SecFilingsSection'
import { OptionsSnapshotSection } from './components/OptionsSnapshotSection'
import { EarningsReleaseSection } from './components/EarningsReleaseSection'
import { CollapsibleSection } from './components/CollapsibleSection'
import { WhyThisMatters } from './components/WhyThisMatters'
import { resolveDisplayQuote } from './components/quoteDisplay'
import { TickerSearchBox } from './components/TickerSearchBox'
import {
  ScoreFlourish,
  sportForLeagueId,
  useAdaptiveInterval,
  useScoreEvent
} from './sportsAnimations'
import type { ScoreEvent } from './sportsAnimations'
import type {
  Article,
  Category,
  CompanyProfile,
  Domain,
  FavoriteTeam,
  FavoriteAthlete,
  FinancialsSnapshot,
  Fundamentals,
  Game,
  GameDetail,
  GameTeam,
  HistoryPoint,
  HistoryRange,
  NcaaConference,
  ReaderResult,
  SmartLookup,
  SportsLeague,
  SportsReelGroup,
  StatCategory,
  StatLeader,
  StockQuote,
  TeamPlayerStats,
  Ticker
} from '../preload'

type DomainFilter = 'all' | 'finance' | 'news'

export default function App(): JSX.Element {
  const [filter, setFilter] = useState<DomainFilter>('all')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [bookmarksOnly, setBookmarksOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { categories, recentCounts, bookmarkCount, refresh: refreshCategories } = useCategories()

  const articlesOpts = useMemo(
    () => ({
      domain: bookmarksOnly
        ? undefined
        : selectedCategoryId !== null
          ? undefined
          : ((filter === 'all' ? undefined : filter === 'finance' ? 'finance' : 'general') as
              | Domain
              | undefined),
      categoryId: bookmarksOnly ? undefined : selectedCategoryId ?? undefined,
      bookmarkedOnly: bookmarksOnly || undefined,
      limit: 200
    }),
    [filter, selectedCategoryId, bookmarksOnly]
  )

  const handleFilterChange = useCallback((f: DomainFilter): void => {
    setFilter(f)
    setSelectedCategoryId(null)
    setBookmarksOnly(false)
  }, [])

  const handleCategorySelect = useCallback((id: number): void => {
    setSelectedCategoryId(id)
    setBookmarksOnly(false)
  }, [])

  const handleShowBookmarks = useCallback((): void => {
    setBookmarksOnly(true)
    setSelectedCategoryId(null)
  }, [])
  const { articles, loading, refresh, patchArticle } = useArticles(articlesOpts)
  // Out-of-view fallback: when a citation chip (MorningBrief, etc.)
  // points at an article that isn't in the currently-loaded slice,
  // articles.find returns null and ArticleReader silently no-ops.
  // Fetch the article directly by id so opening a citation always
  // resolves regardless of which category/filter the user is on.
  const [fallbackArticle, setFallbackArticle] = useState<Article | null>(null)
  useEffect(() => {
    if (selectedId === null) {
      setFallbackArticle(null)
      return
    }
    if (articles.find((a) => a.id === selectedId)) {
      setFallbackArticle(null)
      return
    }
    let cancelled = false
    void window.api.articles
      .getById(selectedId)
      .then((row) => {
        if (cancelled) return
        setFallbackArticle(row)
      })
      .catch((err) => {
        console.warn('[ui] articles.getById failed:', err)
      })
    return (): void => {
      cancelled = true
    }
  }, [selectedId, articles])
  const selected =
    articles.find((a) => a.id === selectedId) ??
    (fallbackArticle && fallbackArticle.id === selectedId ? fallbackArticle : null)

  const handleSelect = useCallback(
    (id: number): void => {
      setSelectedId(id)
      const a = articles.find((x) => x.id === id)
      if (a && !a.isRead) {
        patchArticle(id, { isRead: true })
        void window.api.articles.markRead(id, true).then(() => refreshCategories())
      }
    },
    [articles, patchArticle, refreshCategories]
  )

  const handleToggleBookmark = useCallback(
    (article: Article): void => {
      const next = !article.isBookmarked
      patchArticle(article.id, { isBookmarked: next })
      void window.api.articles.setBookmarked(article.id, next).then(() => refreshCategories())
    },
    [patchArticle, refreshCategories]
  )

  const handleRefresh = async (): Promise<void> => {
    await window.api.feeds.refreshAll()
    await Promise.all([refresh(), refreshCategories()])
  }

  const [discoveryOpen, setDiscoveryOpen] = useState(false)
  const [discoveryCount, setDiscoveryCount] = useState(0)
  const [hyperOpen, setHyperOpen] = useState(false)
  const [reelsOpen, setReelsOpen] = useState(false)
  const [reelsCount, setReelsCount] = useState(0)
  const [videoReady, setVideoReady] = useState(false)
  const [flashPending, setFlashPending] = useState<{ articleId: number; title: string } | null>(
    null
  )

  const handleMakeFlash = useCallback(
    async (
      articleId: number,
      title: string
    ): Promise<{ ok: true; reelId: number } | { ok: false; reason: string }> => {
      setFlashPending({ articleId, title })
      try {
        return await window.api.reels.generateForArticle(articleId)
      } catch {
        return { ok: false, reason: 'generation-failed' }
      } finally {
        setFlashPending((cur) => (cur?.articleId === articleId ? null : cur))
      }
    },
    []
  )
  const [stocksOpen, setStocksOpen] = useState(false)
  const [sportsOpen, setSportsOpen] = useState(false)
  const [researchOpen, setResearchOpen] = useState(false)
  const [pendingStockSymbol, setPendingStockSymbol] = useState<string | null>(null)
  const [pendingGame, setPendingGame] = useState<Game | null>(null)
  const [density, setDensity] = useState<'compact' | 'comfortable'>('comfortable')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'categories' | 'feeds' | 'tickers' | 'locations' | 'teams' | 'preferences' | undefined
  >(undefined)
  // In-app viewer for arbitrary URLs (calendar pills, smart-lookup source
  // links, Hyperintelligence feed-candidate links, etc.). Takes precedence
  // over every other main-area view while non-null.
  const [externalView, setExternalView] = useState<{
    url: string | null
    title: string
    subtitle: string | null
    initialReader?: ReaderResult | null
  } | null>(null)
  // Find-in-page state. Cmd+F (or Ctrl+F on non-mac) opens a small
  // overlay that searches the current document. When a webview is the
  // active surface we route to its own findInPage instead.
  const [findOpen, setFindOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const cmdOrCtrl = e.metaKey || e.ctrlKey
      if (cmdOrCtrl && e.key.toLowerCase() === 'f') {
        // Don't intercept when the user is typing in an input that
        // probably wants browser-default behavior — but the overlay is
        // useful in any context, so we always open. Stops the OS-level
        // beep / native menu from also firing.
        e.preventDefault()
        setFindOpen(true)
      } else if (e.key === 'Escape' && findOpen) {
        setFindOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [findOpen])

  const handleOpenURL = useCallback(
    (url: string, title: string, subtitle?: string | null): void => {
      if (!url || !url.startsWith('http')) return
      setExternalView({ url, title, subtitle: subtitle ?? null })
    },
    []
  )

  // IPO briefs synthesize content from Nasdaq calendar + SEC EDGAR + news
  // search, then render it in reader view with no backing URL. Fetch kicks
  // off immediately; the ExternalReader shows a loading state until the
  // brief arrives and then renders it directly (no extra reader extraction).
  const handleOpenIpoBrief = useCallback(
    (symbol: string, companyName: string): void => {
      const title = symbol
        ? `${symbol} IPO brief`
        : `${companyName || 'IPO'} brief`
      setExternalView({
        url: null,
        title,
        subtitle: companyName || null,
        initialReader: null
      })
      void window.api.ipo
        .getBrief({ symbol, companyName })
        .then((brief) => {
          setExternalView((prev) =>
            prev && prev.title === title
              ? { ...prev, initialReader: brief }
              : prev
          )
        })
        .catch((err) => {
          console.warn('[ipo] brief failed:', err)
          setExternalView((prev) =>
            prev && prev.title === title
              ? {
                  ...prev,
                  initialReader: {
                    status: 'error',
                    error: 'Could not assemble an IPO brief from the public sources.'
                  }
                }
              : prev
          )
        })
    },
    []
  )

  const handleTickerOpenStock = useCallback((symbol: string): void => {
    setPendingStockSymbol(symbol)
    setStocksOpen(true)
    setSportsOpen(false)
    setDiscoveryOpen(false)
    setHyperOpen(false)
    setReelsOpen(false)
    setResearchOpen(false)
    setSelectedId(null)
    setExternalView(null)
  }, [])
  const handleTickerOpenArticle = useCallback(
    (id: number): void => {
      setStocksOpen(false)
      setSportsOpen(false)
      setDiscoveryOpen(false)
      setHyperOpen(false)
      setReelsOpen(false)
      setResearchOpen(false)
      setBookmarksOnly(false)
      setSelectedCategoryId(null)
      setFilter('all')
      setSelectedId(id)
      setExternalView(null)
      void window.api.articles.markRead(id, true).then(() => {
        void refresh()
        void refreshCategories()
      })
    },
    [refresh, refreshCategories]
  )
  const handleTickerOpenGame = useCallback((game: Game): void => {
    setPendingGame(game)
    setSportsOpen(true)
    setStocksOpen(false)
    setDiscoveryOpen(false)
    setHyperOpen(false)
    setReelsOpen(false)
    setResearchOpen(false)
    setSelectedId(null)
    setExternalView(null)
  }, [])
  const handleCalendarOpenGame = useCallback(
    (leagueId: string, gameId: string): void => {
      void window.api.sports.listGames(leagueId).then((games) => {
        const match = games.find((g) => g.id === gameId)
        if (match) handleTickerOpenGame(match)
      })
    },
    [handleTickerOpenGame]
  )
  const handleSettingsChange = useCallback(() => {
    void refresh()
    void refreshCategories()
  }, [refresh, refreshCategories])

  const refreshDiscoveryCount = useCallback(async () => {
    setDiscoveryCount(await window.api.discovery.countUnviewed())
  }, [])
  useEffect(() => {
    void refreshDiscoveryCount()
  }, [refreshDiscoveryCount])

  // Signal the main process once initial data has loaded AND React has
  // painted a frame. Main holds the splash until this fires so the handoff
  // has no jitter.
  const rendererReadyFiredRef = useRef(false)
  useEffect(() => {
    if (rendererReadyFiredRef.current) return
    if (loading) return
    rendererReadyFiredRef.current = true
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void window.api.app.rendererReady()
      })
    })
    return () => cancelAnimationFrame(raf1)
  }, [loading])

  useEffect(() => {
    const fallback = setTimeout(() => {
      if (rendererReadyFiredRef.current) return
      rendererReadyFiredRef.current = true
      void window.api.app.rendererReady()
    }, 2000)
    return () => clearTimeout(fallback)
  }, [])

  useEffect(() => {
    // document.hidden only flips on minimize / Cmd+H / other-Space; it stays
    // false when another app simply covers our window. Combine with window
    // focus so animations also pause when Pulse is out of focus.
    const sync = (): void => {
      const inactive = document.hidden || !document.hasFocus()
      document.body.classList.toggle('pulse-hidden', inactive)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('blur', sync)
    window.addEventListener('focus', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('blur', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  const refreshReelsCount = useCallback(async () => {
    setReelsCount(await window.api.reels.count())
  }, [])
  useEffect(() => {
    void refreshReelsCount()
    const unsub = window.api.reels.onUpdated(() => void refreshReelsCount())
    return unsub
  }, [refreshReelsCount])

  useEffect(() => {
    void window.api.reels.getVideoGenStatus().then((s) => setVideoReady(s.state === 'ready'))
    const unsub = window.api.reels.onVideoGenStatus((s) => setVideoReady(s.state === 'ready'))
    return unsub
  }, [])

  useEffect(() => {
    void window.api.prefs.get().then((p) => setDensity(p.density))
    const unsub = window.api.prefs.onDensityChange(setDensity)
    return unsub
  }, [])

  // Media-pipeline gate (reels + TTS). Hidden Flash UI when disabled
  // since Flash generation goes through the same pipeline. Polled on
  // settings changes via the broadcast that Settings already fires.
  const [mediaPipelineEnabled, setMediaPipelineEnabled] = useState(false)
  useEffect(() => {
    void window.api.prefs.get().then((p) => setMediaPipelineEnabled(p.mediaPipelineEnabled))
  }, [])

  // Theme: pull the resolved theme on mount (handles 'system' → light/dark
  // mapping in the main process) and subscribe to future changes (pref flips
  // + OS appearance changes while 'system' is selected).
  useEffect(() => {
    const applyTheme = (t: string): void => {
      document.documentElement.setAttribute('data-theme', t)
    }
    void window.api.prefs.getResolvedTheme().then(applyTheme)
    const unsub = window.api.prefs.onThemeChange(applyTheme)
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.api.articles.onOpen((articleId) => {
      setBookmarksOnly(false)
      setSelectedCategoryId(null)
      setFilter('all')
      setStocksOpen(false)
      setSportsOpen(false)
      setDiscoveryOpen(false)
      setHyperOpen(false)
      setReelsOpen(false)
      setResearchOpen(false)
      setSelectedId(articleId)
      void window.api.articles.markRead(articleId, true).then(() => {
        void refresh()
        void refreshCategories()
      })
    })
    return unsub
  }, [refresh, refreshCategories])

  // Notification click → open a symbol's detail page. Fired by the
  // central notificationService for stock-alert notifications. Routes
  // through the same handleTickerOpenStock flow used by the markets
  // ticker bar so users land on the same StockDetail surface either way.
  useEffect(() => {
    const unsub = window.api.stocks.onOpenSymbol((symbol) => {
      handleTickerOpenStock(symbol)
    })
    return unsub
  }, [handleTickerOpenStock])

  // Notification click → open a sports game's detail. Fired for fav-team
  // started/final/score-change alerts and league-wide NBA milestones.
  // Routes through handleCalendarOpenGame which already does the listGames
  // → match → handleTickerOpenGame fan-in.
  useEffect(() => {
    const unsub = window.api.sports.onOpenGame((payload) => {
      handleCalendarOpenGame(payload.leagueId, payload.eventId)
    })
    return unsub
  }, [handleCalendarOpenGame])

  // Notification click → switch top-level route. Used by the digest
  // notification (route to home), macro-shock alerts (home), and any
  // future source that wants a coarse-grained navigation rather than
  // a specific entity.
  useEffect(() => {
    const unsub = window.api.app.onNavigate((route) => {
      if (route === 'stocks') {
        setStocksOpen(true)
      } else if (route === 'sports') {
        setSportsOpen(true)
      } else {
        // 'home' = back to the article feed (close any modals).
        setStocksOpen(false)
        setSportsOpen(false)
        setDiscoveryOpen(false)
        setHyperOpen(false)
        setReelsOpen(false)
        setResearchOpen(false)
        setSelectedId(null)
        setExternalView(null)
      }
    })
    return unsub
  }, [])

  // Eyebrow color tracks the filter-tab underline: Top Stories = red-500,
  // Finance = yellow-400, News = accent/blue. When a sidebar category is
  // active the domain dot's color (yellow or blue) is used instead so the
  // header ties visually to the list beneath it.
  const viewHeading: { eyebrow: string; title: string; eyebrowClass: string } = bookmarksOnly
    ? { eyebrow: 'Library', title: 'Bookmarks', eyebrowClass: 'text-accent/90' }
    : selectedCategoryId !== null
      ? {
          eyebrow: categories.find((c) => c.id === selectedCategoryId)?.domain === 'finance'
            ? 'Finance'
            : 'News',
          title: categories.find((c) => c.id === selectedCategoryId)?.name ?? 'Feed',
          eyebrowClass:
            categories.find((c) => c.id === selectedCategoryId)?.domain === 'finance'
              ? 'text-yellow-400'
              : 'text-accent/90'
        }
      : filter === 'finance'
        ? { eyebrow: 'Portfolio intelligence', title: 'Finance', eyebrowClass: 'text-yellow-400' }
        : filter === 'news'
          ? { eyebrow: 'World & local', title: 'News', eyebrowClass: 'text-accent/90' }
          : { eyebrow: 'Your dashboard', title: 'Top Stories', eyebrowClass: 'text-red-500' }

  const activeCategory =
    selectedCategoryId !== null ? categories.find((c) => c.id === selectedCategoryId) : null
  // Category-aware calendar filter. Bookmarks spans both domains, so it falls
  // back to 'all'. A selected category's domain wins over the active tab so
  // the strip matches what the user is actually looking at.
  const calendarFilter: 'all' | 'finance' | 'news' = bookmarksOnly
    ? 'all'
    : activeCategory
      ? activeCategory.domain === 'finance'
        ? 'finance'
        : 'news'
      : filter

  // Stable key for the currently-visible view — Smart Lookup uses this to
  // clear stale docks when the user navigates. Docks were bound to the
  // original view, so carrying them into unrelated tabs looks like a ghost.
  const viewKey: string = externalView
    ? `ext:${externalView.url ?? externalView.title}`
    : settingsOpen
      ? 'settings'
      : stocksOpen
        ? 'stocks'
        : sportsOpen
          ? 'sports'
          : discoveryOpen
            ? 'discovery'
            : hyperOpen
              ? 'hyper'
              : reelsOpen
                ? 'reels'
                : selected
                  ? `article:${selected.id}`
                  : bookmarksOnly
                    ? 'bookmarks'
                    : selectedCategoryId !== null
                      ? `cat:${selectedCategoryId}`
                      : `filter:${filter}`
  // Memoize the lookupContext string — it's written as a DOM attribute on
  // the scroll container (data-lookup-context) and only read on mouseup
  // by SmartLookupLayer. App re-renders on every state slice change
  // (currently a lot of them), so without memoization we were rebuilding
  // and writing the attribute on each render even when none of the inputs
  // had changed.
  const feedLookupContext = useMemo(() => {
    if (bookmarksOnly) {
      return 'Bookmarked news articles across finance (semiconductor value chain, defense, mining) and general news (US geopolitics, space, world events).'
    }
    if (activeCategory) {
      return activeCategory.domain === 'finance'
        ? `Finance news feed, category "${activeCategory.name}" — semiconductor value chain (fabless, foundries, equipment, EDA, packaging), defense/aerospace, mining. Ambiguous terms are usually companies, products, or executives.`
        : `General news feed, category "${activeCategory.name}" — US politics and geopolitics, space exploration, local/regional news, and world events. Ambiguous terms are usually people, places, or policy.`
    }
    if (filter === 'finance') {
      return 'Finance news feed — semiconductor value chain (fabless, foundries, equipment, EDA, packaging), defense/aerospace, mining. Ambiguous terms are usually public companies, products, or executives.'
    }
    if (filter === 'news') {
      return 'General news feed — US politics and geopolitics, space exploration, local/regional news, and world events. Ambiguous terms are usually people, places, or policy.'
    }
    return 'Mixed news dashboard covering finance (semiconductors, defense, mining) and general news (US geopolitics, space, world events).'
  }, [bookmarksOnly, activeCategory, filter])

  return (
    <div
      className={`h-full w-full flex flex-col bg-surface-0 text-zinc-100 ${density === 'compact' ? 'density-compact' : ''}`}
    >
      <TitleBar onRefresh={handleRefresh} onOpenSettings={() => setSettingsOpen(true)} />
      <TickerStrip
        onOpenStock={handleTickerOpenStock}
        onOpenArticle={handleTickerOpenArticle}
        onOpenGame={handleTickerOpenGame}
      />
      <TopNav
        filter={filter}
        onFilterChange={(f) => {
          handleFilterChange(f)
          setStocksOpen(false)
          setSportsOpen(false)
          setDiscoveryOpen(false)
          setHyperOpen(false)
          setReelsOpen(false)
          setResearchOpen(false)
        }}
        categories={categories}
        recentCounts={recentCounts}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={(id) => {
          handleCategorySelect(id)
          setStocksOpen(false)
          setSportsOpen(false)
          setDiscoveryOpen(false)
          setHyperOpen(false)
          setReelsOpen(false)
          setResearchOpen(false)
        }}
        bookmarksActive={bookmarksOnly}
        bookmarkCount={bookmarkCount}
        onShowBookmarks={() => {
          handleShowBookmarks()
          setStocksOpen(false)
          setSportsOpen(false)
          setDiscoveryOpen(false)
          setHyperOpen(false)
          setReelsOpen(false)
          setResearchOpen(false)
        }}
        reelsCount={reelsCount}
        reelsActive={reelsOpen}
        // When the media pipeline is off in preferences, the Reels/Flash
        // surface is dead weight (no Python worker, no TTS, no video
        // gen). Reporting reelsAvailable=false keeps the toolbar entry
        // hidden so it doesn't clutter the bar.
        reelsAvailable={mediaPipelineEnabled && (videoReady || reelsCount > 0)}
        onShowReels={() => {
          setReelsOpen(true)
          setStocksOpen(false)
          setSportsOpen(false)
          setDiscoveryOpen(false)
          setHyperOpen(false)
          setResearchOpen(false)
          setBookmarksOnly(false)
          setSelectedId(null)
        }}
        discoveryCount={discoveryCount}
        discoveryActive={discoveryOpen}
        onShowDiscovery={() => {
          setDiscoveryOpen(true)
          setHyperOpen(false)
          setStocksOpen(false)
          setSportsOpen(false)
          setReelsOpen(false)
          setResearchOpen(false)
          setBookmarksOnly(false)
          setSelectedId(null)
        }}
        hyperActive={hyperOpen}
        onShowHyper={() => {
          setHyperOpen(true)
          setDiscoveryOpen(false)
          setStocksOpen(false)
          setSportsOpen(false)
          setReelsOpen(false)
          setResearchOpen(false)
          setBookmarksOnly(false)
          setSelectedId(null)
        }}
        stocksActive={stocksOpen}
        onShowStocks={() => {
          setStocksOpen(true)
          setSportsOpen(false)
          setDiscoveryOpen(false)
          setHyperOpen(false)
          setReelsOpen(false)
          setResearchOpen(false)
          setBookmarksOnly(false)
          setSelectedId(null)
        }}
        sportsActive={sportsOpen}
        onShowSports={() => {
          setSportsOpen(true)
          setStocksOpen(false)
          setDiscoveryOpen(false)
          setHyperOpen(false)
          setReelsOpen(false)
          setResearchOpen(false)
          setBookmarksOnly(false)
          setSelectedId(null)
        }}
        researchActive={researchOpen}
        onShowResearch={() => {
          setResearchOpen(true)
          setSportsOpen(false)
          setStocksOpen(false)
          setDiscoveryOpen(false)
          setHyperOpen(false)
          setReelsOpen(false)
          setBookmarksOnly(false)
          setSelectedId(null)
        }}
        flashPending={mediaPipelineEnabled ? flashPending : null}
      />
      <main className="flex-1 min-h-0 overflow-hidden relative">
        {externalView ? (
          <ExternalReader
            url={externalView.url}
            title={externalView.title}
            subtitle={externalView.subtitle}
            initialReader={externalView.initialReader}
            onClose={() => setExternalView(null)}
            onLinkClick={handleOpenURL}
          />
        ) : stocksOpen ? (
          <StocksPage
            onClose={() => {
              setStocksOpen(false)
              setPendingStockSymbol(null)
            }}
            initialTickerSymbol={pendingStockSymbol}
            onOpenURL={handleOpenURL}
            onOpenArticle={handleTickerOpenArticle}
            onOpenIpoBrief={handleOpenIpoBrief}
          />
        ) : sportsOpen ? (
          <SportsPage
            onClose={() => {
              setSportsOpen(false)
              setPendingGame(null)
            }}
            initialGame={pendingGame}
            onOpenURL={handleOpenURL}
          />
        ) : researchOpen ? (
          <ResearchPage
            onClose={() => setResearchOpen(false)}
            onOpenURL={handleOpenURL}
          />
        ) : discoveryOpen ? (
          <Discovery
            onClose={() => {
              setDiscoveryOpen(false)
              setHyperOpen(false)
              void refreshDiscoveryCount()
            }}
          />
        ) : hyperOpen ? (
          <Hyperintelligence
            onClose={() => setHyperOpen(false)}
            onFeedsChanged={() => {
              void refresh()
              void refreshCategories()
            }}
            onOpenURL={handleOpenURL}
            onOpenArticle={handleTickerOpenArticle}
            onOpenSettings={(tab) => {
              setSettingsInitialTab(tab)
              setSettingsOpen(true)
            }}
          />
        ) : reelsOpen ? (
          <Reels
            onClose={() => {
              setReelsOpen(false)
              void refreshReelsCount()
            }}
            onOpenArticle={handleTickerOpenArticle}
          />
        ) : selected ? (
          <ArticleReader
            article={selected}
            onBack={() => setSelectedId(null)}
            onToggleBookmark={handleToggleBookmark}
            // Suppress Flash button + pending state inside the article
            // reader when the media pipeline preference is off — clicking
            // it would just dead-end on a missing TTS/video worker.
            onMakeFlash={mediaPipelineEnabled ? handleMakeFlash : undefined}
            flashPendingForThis={
              mediaPipelineEnabled ? flashPending?.articleId === selected.id : false
            }
          />
        ) : (
          <FeedView
            heading={viewHeading}
            lookupContext={feedLookupContext}
            articles={articles}
            loading={loading}
            onSelect={handleSelect}
            onOpenAnyArticle={handleTickerOpenArticle}
            onRefresh={handleRefresh}
            calendarFilter={calendarFilter}
            onOpenStock={handleTickerOpenStock}
            onOpenGame={handleCalendarOpenGame}
            onOpenURL={handleOpenURL}
            onOpenIpoBrief={handleOpenIpoBrief}
          />
        )}
      </main>
      <SmartLookupLayer viewKey={viewKey} onOpenURL={handleOpenURL} />
      {settingsOpen && (
        <Settings
          onClose={() => {
            setSettingsOpen(false)
            setSettingsInitialTab(undefined)
          }}
          onDataChanged={handleSettingsChange}
          initialTab={settingsInitialTab}
        />
      )}
      {findOpen && (
        <FindBar
          // Route to the currently mounted <webview>, if any. Detected
          // at render time via querySelector — ExternalReader's web
          // mode mounts a single <webview>, otherwise the find runs
          // on the host webContents (reader DOM, app chrome, etc.).
          webview={document.querySelector<HTMLElement>('webview')}
          onClose={() => setFindOpen(false)}
        />
      )}
    </div>
  )
}

function TitleBar({
  onRefresh,
  onOpenSettings
}: {
  onRefresh: () => Promise<void>
  onOpenSettings: () => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [aiStatus, setAiStatus] = useState<'online' | 'offline'>('offline')

  useEffect(() => {
    void window.api.app.getOllamaStatus().then(setAiStatus)
    const unsub = window.api.app.onOllamaStatusChange(setAiStatus)
    return unsub
  }, [])

  const click = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await onRefresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="drag h-11 flex items-center justify-between px-4 border-b border-edge bg-surface-1/80 backdrop-blur">
      <div className="w-16" />
      <div className="flex items-center gap-2">
        {/* Static accent dot — no animate-ping. The previous pulsing
            indicator was a screen-capture jitter source on macOS, and
            losing it doesn't change anything informational about the
            app being active. */}
        <span className="w-2 h-2 rounded-full bg-accent" />
        <span className="text-[11px] tracking-[0.28em] uppercase text-zinc-200 font-semibold">
          Pulse
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span
          title={
            aiStatus === 'online'
              ? 'AI scoring online'
              : 'AI scoring offline — run Ollama to enable'
          }
          className={`no-drag flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] ${
            aiStatus === 'online' ? 'text-emerald-400' : 'text-zinc-500'
          }`}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              aiStatus === 'online' ? 'bg-emerald-400' : 'bg-zinc-600'
            }`}
          />
          AI
        </span>
        <button
          onClick={click}
          disabled={busy}
          className="no-drag text-[11px] text-zinc-400 hover:text-zinc-100 disabled:text-zinc-600"
        >
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          onClick={onOpenSettings}
          className="no-drag w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>
  )
}

type TickerMode = 'markets' | 'stories' | 'sports'

const TICKER_MODES: TickerMode[] = ['markets', 'stories', 'sports']

const TICKER_MODE_STYLES: Record<
  TickerMode,
  { label: string; bgTint: string; dot: string; text: string }
> = {
  markets: {
    label: 'Markets',
    bgTint: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300'
  },
  stories: {
    label: 'Top Stories',
    bgTint: 'bg-accent/10 hover:bg-accent/20',
    dot: 'bg-accent',
    text: 'text-accent'
  },
  sports: {
    label: 'Sports',
    bgTint: 'bg-orange-500/10 hover:bg-orange-500/20',
    dot: 'bg-orange-400',
    text: 'text-orange-300'
  }
}

function TickerStrip({
  onOpenStock,
  onOpenArticle,
  onOpenGame
}: {
  onOpenStock: (symbol: string) => void
  onOpenArticle: (id: number) => void
  onOpenGame: (game: Game) => void
}): JSX.Element {
  const [mode, setMode] = useState<TickerMode>('markets')
  const style = TICKER_MODE_STYLES[mode]
  const cycle = (): void => {
    setMode((m) => TICKER_MODES[(TICKER_MODES.indexOf(m) + 1) % TICKER_MODES.length])
  }
  return (
    <div className="ticker-strip h-9 shrink-0 border-b border-edge bg-surface-1/40 overflow-hidden flex items-center">
      <button
        type="button"
        onClick={cycle}
        title="Click to cycle: Markets → Top Stories → Sports"
        className={`no-drag shrink-0 flex items-center gap-2 px-4 h-full border-r border-edge transition-colors ${style.bgTint}`}
      >
        {/* Static dot — see TitleBar comment about the animate-ping
            removal. Mode color (markets/stories/sports) still
            distinguishes the three reels. */}
        <span className={`w-2 h-2 rounded-full ${style.dot}`} />
        <span className={`text-[10px] font-bold uppercase tracking-[0.24em] ${style.text}`}>
          {style.label}
        </span>
      </button>
      <div className="ticker-viewport flex-1 overflow-hidden">
        {mode === 'markets' ? (
          <MarketsReel onOpenStock={onOpenStock} />
        ) : mode === 'stories' ? (
          <StoriesReel onOpenArticle={onOpenArticle} />
        ) : (
          <SportsReel onOpenGame={onOpenGame} />
        )}
      </div>
    </div>
  )
}

// rAF-driven horizontal auto-scroll for the ticker reels. Replaces the
// previous CSS keyframe `transform: translate3d(0)→(-50%, 0, 0)` marquee.
// Why: GPU-composited transform animations don't sync with macOS screen-
// capture sampling, so screen-sharing Pulse showed visible jitter. Native
// scrollLeft updates ride through the regular paint pipeline and capture
// cleanly. The track is rendered with its content doubled so wrapping
// reset (when scrollLeft >= halfWidth) is invisible.
//
// Pauses while the pointer is over the viewport (so manual scrubbing
// works) and while the window is occluded (the existing pulse-hidden
// CSS pause-everything was the prior mechanism; we mirror it here).
function useTickerAutoScroll(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  trackRef: React.RefObject<HTMLDivElement | null>,
  pixelsPerSecond = 28
): void {
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    let rafId = 0
    let last = performance.now()
    let pointerOver = false
    const onEnter = (): void => {
      pointerOver = true
    }
    const onLeave = (): void => {
      pointerOver = false
    }
    viewport.addEventListener('pointerenter', onEnter)
    viewport.addEventListener('pointerleave', onLeave)

    const tick = (now: number): void => {
      // Clamp dt so a tab-resume after long inactivity doesn't cause a
      // huge jump on the next frame.
      const dt = Math.min(now - last, 100)
      last = now
      const v = viewportRef.current
      const t = trackRef.current
      const occluded = document.body.classList.contains('pulse-hidden')
      if (v && t && !pointerOver && !occluded) {
        const halfWidth = t.scrollWidth / 2
        if (halfWidth > 0) {
          let next = v.scrollLeft + (pixelsPerSecond * dt) / 1000
          if (next >= halfWidth) next -= halfWidth
          v.scrollLeft = next
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      viewport.removeEventListener('pointerenter', onEnter)
      viewport.removeEventListener('pointerleave', onLeave)
    }
  }, [viewportRef, trackRef, pixelsPerSecond])
}

function MarketsReel({ onOpenStock }: { onOpenStock: (symbol: string) => void }): JSX.Element {
  const [quotes, setQuotes] = useState<StockQuote[]>([])
  const [tickers, setTickers] = useState<Ticker[]>([])
  useEffect(() => {
    void window.api.stocks.getQuotes().then(setQuotes).catch((err) => {
      console.warn('[ui] stocks.getQuotes failed:', err)
    })
    const unsub = window.api.stocks.onUpdated(setQuotes)
    void window.api.tickers.list().then(setTickers).catch((err) => {
      console.warn('[ui] tickers.list failed:', err)
    })
    return unsub
  }, [])

  const sectorGroups = useMemo(() => {
    const bySymbol = new Map(tickers.map((t) => [t.symbol, t] as const))
    const sectorOrder: string[] = []
    const buckets = new Map<string, StockQuote[]>()
    for (const q of quotes) {
      if (q.price === null) continue
      const sector = bySymbol.get(q.symbol)?.sector?.trim() || 'Other'
      if (!buckets.has(sector)) {
        buckets.set(sector, [])
        sectorOrder.push(sector)
      }
      buckets.get(sector)!.push(q)
    }
    return sectorOrder.map((s) => ({ sector: s, quotes: buckets.get(s)! }))
  }, [quotes, tickers])

  // Memoize the cell list and the doubled (loop) version on the same deps
  // as sectorGroups. Without this the marquee's ~130-node child set was
  // rebuilt and reconciled on every quote tick (every minute during market
  // hours), causing GPU helper CPU to spike inside the animating ticker.
  type MarketCell =
    | { kind: 'header'; sector: string; key: string }
    | { kind: 'quote'; quote: StockQuote; key: string }
    | { kind: 'sep'; key: string }
  const doubled = useMemo(() => {
    const cells: MarketCell[] = []
    for (const g of sectorGroups) {
      cells.push({ kind: 'header', sector: g.sector, key: `mh-${g.sector}` })
      g.quotes.forEach((q, i) => {
        if (i > 0) cells.push({ kind: 'sep', key: `msep-${g.sector}-${q.symbol}` })
        cells.push({ kind: 'quote', quote: q, key: `mq-${g.sector}-${q.symbol}` })
      })
    }
    return [...cells, ...cells.map((c) => ({ ...c, key: `${c.key}-x` }))]
  }, [sectorGroups])

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  useTickerAutoScroll(viewportRef, trackRef)

  if (sectorGroups.length === 0) return <ReelPlaceholder text="Awaiting quotes\u2026" />

  return (
    <div
      ref={viewportRef}
      className="h-full overflow-x-auto overflow-y-hidden scrollbar-none"
    >
      <div
        ref={trackRef}
        className="flex items-center gap-4 whitespace-nowrap pl-8"
      >
        {doubled.map((cell) => {
          if (cell.kind === 'header') {
            return <SectorHeaderChip key={cell.key} sector={cell.sector} />
          }
          if (cell.kind === 'sep') {
            return <TickerDivider key={cell.key} />
          }
          return (
            <StockTickerItem
              key={cell.key}
              quote={cell.quote}
              onOpen={() => onOpenStock(cell.quote.symbol)}
            />
          )
        })}
      </div>
    </div>
  )
}

function SectorHeaderChip({ sector }: { sector: string }): JSX.Element {
  return (
    <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] font-bold text-emerald-300">
      <span className="h-3 w-px bg-emerald-400/50" />
      {sector}
      <span className="text-zinc-600 font-normal">—</span>
    </span>
  )
}

function StoriesReel({
  onOpenArticle
}: {
  onOpenArticle: (id: number) => void
}): JSX.Element {
  const [articles, setArticles] = useState<Article[]>([])
  useEffect(() => {
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null
    const load = async (): Promise<void> => {
      try {
        const a = await window.api.articles.list({ limit: 25 })
        if (!cancelled) setArticles(a)
      } catch {
        if (!cancelled) setArticles([])
      }
    }
    const startInterval = (): void => {
      if (intervalId) return
      intervalId = setInterval(() => void load(), 120_000)
    }
    const stopInterval = (): void => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
    // Visibility-gated polling. The reel marquee is one of the only
    // background-polling components left; without this gate it kept
    // re-fetching every 2 minutes even while the window was occluded,
    // defeating the body.pulse-hidden plumbing that pauses animations.
    const onVisibilityChange = (): void => {
      if (document.hidden) {
        stopInterval()
      } else {
        void load()
        startInterval()
      }
    }
    void load()
    if (!document.hidden) startInterval()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      stopInterval()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  useTickerAutoScroll(viewportRef, trackRef)

  if (articles.length === 0) return <ReelPlaceholder text="Fetching headlines…" />
  const items = [...articles, ...articles]
  return (
    <div
      ref={viewportRef}
      className="h-full overflow-x-auto overflow-y-hidden scrollbar-none"
    >
      <div
        ref={trackRef}
        className="flex items-center gap-4 whitespace-nowrap pl-8"
      >
        {items.flatMap((a, i) => {
          const key = `s-${a.id}-${i}`
          return [
            <StoryTickerItem key={key} article={a} onOpen={() => onOpenArticle(a.id)} />,
            <TickerDivider key={`${key}-d`} />
          ]
        })}
      </div>
    </div>
  )
}

function StoryTickerItem({
  article,
  onOpen
}: {
  article: Article
  onOpen: () => void
}): JSX.Element {
  const tier = urgencyTier(article.urgencyScore)
  const badgeColor =
    tier === 'urgent' ? 'text-red-300' : tier === 'medium' ? 'text-amber-300' : 'text-sky-400'
  const label =
    tier === 'urgent'
      ? 'URGENT'
      : tier === 'medium'
        ? 'WATCH'
        : article.feedTitle.toUpperCase()
  return (
    <button
      type="button"
      onClick={onOpen}
      title={article.title}
      className="flex items-center gap-2 text-[11px] hover:bg-surface-2/80 rounded px-2 py-0.5 -mx-2 transition-colors"
    >
      <span className={`font-bold uppercase tracking-[0.16em] shrink-0 ${badgeColor}`}>{label}</span>
      <span className="text-zinc-200 truncate max-w-[420px]">{article.title}</span>
    </button>
  )
}

function SportsReel({ onOpenGame }: { onOpenGame: (g: Game) => void }): JSX.Element {
  // Cache + subscribe. sportsReelScheduler on the main side owns the fetch/
  // filter/sort and warms itself at boot, so by the time the user cycles to
  // Sports this invoke resolves against a hot cache and paints immediately.
  const [groups, setGroups] = useState<SportsReelGroup[]>([])
  const [warmed, setWarmed] = useState(false)
  useEffect(() => {
    let cancelled = false
    void window.api.sports.getReelGroups().then((snap) => {
      if (cancelled) return
      setGroups(snap.groups)
      setWarmed(snap.warmed)
    })
    const off = window.api.sports.onReelUpdated((snap) => {
      setGroups(snap.groups)
      setWarmed(snap.warmed)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])
  // Look up the sport for each game so animations render correctly without
  // plumbing the league down through props.
  const sportById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const g of groups) for (const game of g.games) m[game.id] = g.league.sport
    return m
  }, [groups])
  if (!warmed && groups.length === 0) return <ReelPlaceholder text="Warming up scoreboard…" />
  if (groups.length === 0) return <ReelPlaceholder text="No games to show right now" />

  type Cell =
    | { kind: 'header'; league: SportsLeague; key: string }
    | { kind: 'game'; game: Game; key: string }
    | { kind: 'sep'; key: string }
  // Inter-game dividers ARE rendered now that cells are natural-width
  // (the original "divider in the middle" problem came from min-w
  // padding that left trailing whitespace inside cells before the
  // divider — gone now). Wider wrapper gap-5 keeps games legibly
  // separated even with the divider's natural padding.
  const cells: Cell[] = []
  for (const g of groups) {
    cells.push({ kind: 'header', league: g.league, key: `h-${g.league.id}` })
    g.games.forEach((game, i) => {
      if (i > 0) cells.push({ kind: 'sep', key: `s-${g.league.id}-${i}` })
      cells.push({ kind: 'game', game, key: `g-${game.id}` })
    })
  }
  const doubled = [...cells, ...cells.map((c) => ({ ...c, key: `${c.key}-x` }))]
  return (
    <SportsReelView
      doubled={doubled}
      sportById={sportById}
      onOpenGame={onOpenGame}
    />
  )
}

function SportsReelView({
  doubled,
  sportById,
  onOpenGame
}: {
  doubled: Array<{ key: string } & ({ kind: 'header'; league: SportsLeague } | { kind: 'sep' } | { kind: 'game'; game: Game })>
  sportById: Record<string, string>
  onOpenGame: (g: Game) => void
}): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  useTickerAutoScroll(viewportRef, trackRef)
  return (
    <div
      ref={viewportRef}
      className="h-full overflow-x-auto overflow-y-hidden scrollbar-none"
    >
      <div
        ref={trackRef}
        className="flex items-center gap-5 whitespace-nowrap pl-8"
      >
        {doubled.map((cell) => {
          if (cell.kind === 'header') {
            return <LeagueHeaderChip key={cell.key} league={cell.league} />
          }
          if (cell.kind === 'sep') {
            return <TickerDivider key={cell.key} />
          }
          return (
            <GameTickerItem
              key={cell.key}
              game={cell.game}
              sport={sportById[cell.game.id] ?? ''}
              onOpen={() => onOpenGame(cell.game)}
            />
          )
        })}
      </div>
    </div>
  )
}

function LeagueHeaderChip({ league }: { league: SportsLeague }): JSX.Element {
  return (
    <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] font-bold text-orange-300">
      <span className="h-3 w-px bg-orange-400/50" />
      {league.shortName}
      <span className="text-zinc-600 font-normal">—</span>
    </span>
  )
}

function formatLiveShortLabel(game: Game): string {
  const short = (game.statusShort ?? '').trim()
  const detail = (game.statusDetail ?? '').trim()
  const clock = (game.displayClock ?? '').trim()
  const period = game.period

  // MLB — ESPN emits "Top 5th" / "Bot 3rd" / "Mid 7th" / "End 4th".
  // Map top/bottom to ↑/↓ arrows; keep mid/end as abbreviations.
  if (game.leagueId === 'mlb') {
    const src = short && !/^0:00$/.test(short) ? short : detail
    if (src) {
      const m = /^(top|bot|bottom|mid|middle|end)\s+(\d+)/i.exec(src)
      if (m) {
        const phase = m[1].toLowerCase()
        const inning = m[2]
        if (phase === 'top') return `↑ ${inning}`
        if (phase === 'bot' || phase === 'bottom') return `↓ ${inning}`
        if (phase === 'mid' || phase === 'middle') return `MID ${inning}`
        if (phase === 'end') return `END ${inning}`
      }
      return src.toUpperCase()
    }
    if (period !== null) return `INN ${period}`
    return 'LIVE'
  }

  // Basketball/football/hockey — prefix the clock with quarter/period.
  const prefixByLeague: Record<string, string> = {
    nba: 'Q',
    nfl: 'Q',
    nhl: 'P'
  }
  const prefix = prefixByLeague[game.leagueId]
  if (prefix && period !== null) {
    if (clock) return `${prefix}${period} ${clock}`
    return `${prefix}${period}`
  }

  // Soccer — ESPN returns the in-match clock ("45+2'", "67'") in displayClock
  // or statusShort. Prefer whichever is non-empty and not "0:00".
  if (clock && clock !== '0:00') return clock
  if (short && short !== '0:00') return short
  return 'LIVE'
}

function GameTickerItem({
  game,
  sport,
  onOpen
}: {
  game: Game
  sport: string
  onOpen: () => void
}): JSX.Element {
  const isLive = game.status === 'in_progress'
  const isFinal = game.status === 'final'
  const isUpcoming = game.status === 'scheduled'
  const timeLabel = isLive
    ? formatLiveShortLabel(game)
    : isFinal
      ? 'FINAL'
      : isUpcoming
        ? new Date(game.date).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit'
          })
        : game.statusShort || game.status.toUpperCase()
  const statusColor = isLive ? 'text-red-300' : isFinal ? 'text-zinc-500' : 'text-zinc-400'
  const scoreEvent = useScoreEvent(game)
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${game.away.shortName} @ ${game.home.shortName}`}
      className="flex items-center gap-2 text-[11px] hover:bg-surface-2/80 rounded px-2 py-0.5 -mx-2 transition-colors shrink-0"
    >
      <span className={`font-bold uppercase tracking-[0.16em] tabular-nums shrink-0 min-w-[52px] ${statusColor}`}>
        {timeLabel}
      </span>
      <span className="relative font-semibold tracking-[0.08em] text-zinc-100">
        {game.away.abbreviation}
        {game.away.score !== null ? (
          <span className="ml-1 tabular-nums">{game.away.score}</span>
        ) : null}
        {scoreEvent?.side === 'away' && (
          <span className="absolute -top-3 right-0 translate-x-1">
            <ScoreFlourish
              event={scoreEvent}
              sport={sport}
              size="sm"
              teamColor={game.away.color ?? game.away.altColor}
            />
          </span>
        )}
      </span>
      <span className="text-zinc-600">@</span>
      <span className="relative font-semibold tracking-[0.08em] text-zinc-100">
        {game.home.abbreviation}
        {game.home.score !== null ? (
          <span className="ml-1 tabular-nums">{game.home.score}</span>
        ) : null}
        {scoreEvent?.side === 'home' && (
          <span className="absolute -top-3 right-0 translate-x-1">
            <ScoreFlourish
              event={scoreEvent}
              sport={sport}
              size="sm"
              teamColor={game.home.color ?? game.home.altColor}
            />
          </span>
        )}
      </span>
    </button>
  )
}

function ReelPlaceholder({ text }: { text: string }): JSX.Element {
  return (
    <div className="pl-6 text-[11px] uppercase tracking-[0.18em] text-zinc-600">{text}</div>
  )
}

function TickerDivider(): JSX.Element {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 2,
        height: 18,
        backgroundColor: 'rgba(161, 161, 170, 0.55)',
        borderRadius: 1,
        flexShrink: 0
      }}
    />
  )
}

function StockTickerItem({
  quote,
  onOpen
}: {
  quote: StockQuote
  onOpen: () => void
}): JSX.Element {
  const rq = resolveDisplayQuote(quote)
  const up = (rq.change ?? 0) > 0
  const down = (rq.change ?? 0) < 0
  const color = up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-zinc-400'
  const arrow = up ? '▲' : down ? '▼' : '·'
  const pct =
    rq.changePct !== null
      ? `${rq.changePct >= 0 ? '+' : ''}${rq.changePct.toFixed(2)}%`
      : '—'
  const price = rq.price !== null ? rq.price.toFixed(2) : '—'
  return (
    <button
      type="button"
      onClick={onOpen}
      title={
        rq.sessionBadge
          ? `${quote.symbol} · ${rq.sessionBadge} ${price} (${pct})`
          : `Open ${quote.symbol}`
      }
      className={`flex items-center gap-2 text-[11px] hover:bg-surface-2/80 rounded px-2 py-0.5 -mx-2 transition-colors shrink-0 ${
        rq.sessionBadge ? 'min-w-[175px]' : 'min-w-[130px]'
      }`}
    >
      <span className="font-semibold tracking-[0.14em] text-zinc-100">{quote.symbol}</span>
      {rq.sessionBadge && (
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40">
          {rq.sessionBadge}
        </span>
      )}
      <span className="tabular-nums text-zinc-300">{price}</span>
      <span className={`tabular-nums font-semibold ${color} whitespace-nowrap`}>
        {arrow}&nbsp;{pct}
      </span>
    </button>
  )
}

const FeedSource = memo(function FeedSource({ article }: { article: Article }): JSX.Element {
  const fallback = (
    <span
      className={`w-4 h-4 rounded-sm shrink-0 flex items-center justify-center text-[9px] font-bold ${
        article.domain === 'finance'
          ? 'bg-amber-400/15 text-amber-300'
          : 'bg-blue-400/15 text-blue-300'
      }`}
    >
      {article.feedTitle.charAt(0).toUpperCase()}
    </span>
  )
  if (!article.feedIconURL) return fallback
  return (
    <img
      src={article.feedIconURL}
      alt=""
      className="w-4 h-4 rounded-sm shrink-0 object-cover bg-surface-2"
      onError={(e) => {
        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
      }}
    />
  )
})

function BoltIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="w-3 h-3 text-yellow-300"
      fill="currentColor"
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  )
}

function FlashToolbarIcon({
  state
}: {
  state: 'idle' | 'pending' | 'added' | 'exists' | 'failed'
}): JSX.Element {
  // Active states get the yellow treatment; pending gets a spin animation.
  const color =
    state === 'added' || state === 'exists'
      ? 'text-yellow-300'
      : state === 'failed'
        ? 'text-red-400'
        : ''
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`w-3.5 h-3.5 ${color} ${state === 'pending' ? 'animate-pulse' : ''}`}
      fill="currentColor"
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  )
}

function BookmarkStarIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="w-3 h-3 text-purple-300"
      fill="currentColor"
    >
      <path d="m12 17.3-5.87 3.46 1.58-6.65L2.6 9.72l6.81-.55L12 3l2.59 6.17 6.81.55-5.11 4.39 1.58 6.65z" />
    </svg>
  )
}

function HyperSparkIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="w-3 h-3 text-teal-300"
      fill="currentColor"
    >
      <path d="M12 2 13.6 8.4 20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2zm6 12 .9 2.9L22 18l-3.1.9L18 22l-.9-3.1L14 18l3.1-1.1L18 14z" />
    </svg>
  )
}

function DiscoveryDiamondIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="w-3 h-3 text-sky-400"
      fill="currentColor"
    >
      <path d="M12 2 2 12l10 10 10-10L12 2zm0 3.2L18.8 12 12 18.8 5.2 12 12 5.2z" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  )
}

function TopNav({
  filter,
  onFilterChange,
  categories,
  recentCounts,
  selectedCategoryId,
  onSelectCategory,
  bookmarksActive,
  bookmarkCount,
  onShowBookmarks,
  reelsCount,
  reelsActive,
  reelsAvailable,
  onShowReels,
  discoveryCount,
  discoveryActive,
  onShowDiscovery,
  hyperActive,
  onShowHyper,
  stocksActive,
  onShowStocks,
  sportsActive,
  onShowSports,
  researchActive,
  onShowResearch,
  flashPending
}: {
  filter: DomainFilter
  onFilterChange: (f: DomainFilter) => void
  categories: Category[]
  recentCounts: Record<number, number>
  selectedCategoryId: number | null
  onSelectCategory: (id: number) => void
  bookmarksActive: boolean
  bookmarkCount: number
  onShowBookmarks: () => void
  reelsCount: number
  reelsActive: boolean
  reelsAvailable: boolean
  onShowReels: () => void
  discoveryCount: number
  discoveryActive: boolean
  onShowDiscovery: () => void
  hyperActive: boolean
  onShowHyper: () => void
  stocksActive: boolean
  onShowStocks: () => void
  sportsActive: boolean
  onShowSports: () => void
  researchActive: boolean
  onShowResearch: () => void
  flashPending: { articleId: number; title: string } | null
}): JSX.Element {
  const primaryActive =
    !bookmarksActive &&
    selectedCategoryId === null &&
    !discoveryActive &&
    !hyperActive &&
    !stocksActive &&
    !sportsActive &&
    !researchActive &&
    !reelsActive
  const visibleCategories = categories.filter((c) => {
    if (filter === 'finance') return c.domain === 'finance'
    if (filter === 'news') return c.domain === 'general'
    return true
  })

  return (
    <nav className="border-b border-edge bg-surface-1/50 backdrop-blur">
      <div className="flex items-center gap-1 px-6 pt-3">
        {(['all', 'finance', 'news'] as const).map((key) => {
          const active = primaryActive && filter === key
          const label = key === 'all' ? 'Top Stories' : key === 'finance' ? 'Finance' : 'News'
          return (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
              className={`relative px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors ${
                active ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {label}
              {active && (
                <span
                  className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-full ${
                    key === 'all'
                      ? 'bg-red-500'
                      : key === 'finance'
                        ? 'bg-yellow-400'
                        : 'bg-accent'
                  }`}
                />
              )}
            </button>
          )
        })}
        <button
          onClick={onShowStocks}
          className={`relative px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors ${
            stocksActive ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-200'
          }`}
        >
          Stocks
          {stocksActive && (
            <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-emerald-400 rounded-full" />
          )}
        </button>
        <button
          onClick={onShowSports}
          className={`relative px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors ${
            sportsActive ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-200'
          }`}
        >
          Sports
          {sportsActive && (
            <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-orange-400 rounded-full" />
          )}
        </button>
        <button
          onClick={onShowResearch}
          className={`relative px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors ${
            researchActive ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-200'
          }`}
        >
          Research
          {researchActive && (
            <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-violet-400 rounded-full" />
          )}
        </button>
        <span className="w-px h-5 bg-edge mx-2" />
        <button
          onClick={onShowBookmarks}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
            bookmarksActive
              ? 'bg-purple-500/15 text-purple-300 ring-1 ring-inset ring-purple-400/30'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface-2'
          }`}
        >
          <BookmarkStarIcon />
          <span>Bookmarks</span>
          {bookmarkCount > 0 && (
            <span className="tabular-nums text-[10px] text-zinc-500">{bookmarkCount}</span>
          )}
        </button>
        {reelsAvailable && (
          <button
            onClick={onShowReels}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
              reelsActive
                ? 'bg-yellow-300/15 text-yellow-200 ring-1 ring-inset ring-yellow-300/30'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface-2'
            }`}
          >
            <BoltIcon />
            <span>Flash</span>
            {reelsCount > 0 && (
              <span className="tabular-nums text-[10px] text-zinc-500">{reelsCount}</span>
            )}
          </button>
        )}
        <button
          onClick={onShowDiscovery}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
            discoveryActive
              ? 'bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/30'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface-2'
          }`}
        >
          <DiscoveryDiamondIcon />
          <span>Discovery</span>
          {discoveryCount > 0 && (
            <span className="tabular-nums text-[10px] px-1.5 py-px rounded-full bg-sky-500 text-white">
              {discoveryCount}
            </span>
          )}
        </button>
        <button
          onClick={onShowHyper}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
            hyperActive
              ? 'bg-teal-500/15 text-teal-200 ring-1 ring-inset ring-teal-400/30'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface-2'
          }`}
          title="Find feeds by asking the local AI"
        >
          <HyperSparkIcon />
          <span>Hyperintelligence</span>
        </button>
        {flashPending && (
          <div
            className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] bg-yellow-300/10 text-yellow-200 ring-1 ring-inset ring-yellow-300/25"
            title={flashPending.title}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-300" />
            </span>
            <span className="font-medium">Generating Flash</span>
            <span className="max-w-[340px] truncate text-zinc-400">{flashPending.title}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-6 py-2.5 overflow-x-auto scrollbar-none">
        {visibleCategories.map((c) => {
          const active = selectedCategoryId === c.id
          const count = recentCounts[c.id] ?? 0
          const accent = c.domain === 'finance' ? 'amber' : 'blue'
          return (
            <button
              key={c.id}
              onClick={() => onSelectCategory(c.id)}
              title={`${c.name} — ${count} new in the last 24h`}
              className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                active
                  ? accent === 'amber'
                    ? 'bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-400/30'
                    : 'bg-blue-400/15 text-blue-200 ring-1 ring-inset ring-blue-400/30'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface-2'
              }`}
            >
              <span
                className={`w-1 h-1 rounded-full ${accent === 'amber' ? 'bg-amber-400' : 'bg-blue-400'}`}
              />
              <span className="whitespace-nowrap">{c.name}</span>
              {count > 0 && (
                <span className="tabular-nums text-[10px] text-zinc-500">{count}</span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function FeedView({
  heading,
  lookupContext,
  articles,
  loading,
  onSelect,
  onOpenAnyArticle,
  onRefresh,
  calendarFilter,
  onOpenStock,
  onOpenGame,
  onOpenURL,
  onOpenIpoBrief
}: {
  heading: { eyebrow: string; title: string; eyebrowClass: string }
  lookupContext: string
  articles: Article[]
  loading: boolean
  onSelect: (id: number) => void
  // Open an article that may not be in the currently-rendered articles
  // array (e.g. a MorningBrief citation referencing a different category).
  // The App handler resets filters + refreshes the article list so the
  // selected article actually shows up in ArticleReader. Without this,
  // setSelectedId on an out-of-view article finds no match in `articles`
  // and silently no-ops.
  onOpenAnyArticle: (id: number) => void
  onRefresh: () => Promise<void>
  calendarFilter: 'all' | 'finance' | 'news'
  onOpenStock: (symbol: string) => void
  onOpenGame: (leagueId: string, gameId: string) => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
  onOpenIpoBrief: (symbol: string, companyName: string) => void
}): JSX.Element {
  const dateGroups = useMemo(() => groupArticlesByDate(articles), [articles])
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)

  useEffect(() => {
    if (dateGroups.length === 0) {
      setSelectedDateKey(null)
      return
    }
    if (selectedDateKey && dateGroups.some((g) => g.key === selectedDateKey)) return
    const today = dateKey(new Date())
    if (dateGroups.some((g) => g.key === today)) {
      setSelectedDateKey(today)
      return
    }
    setSelectedDateKey(dateGroups[dateGroups.length - 1].key)
  }, [dateGroups, selectedDateKey])

  if (loading && articles.length === 0) return <FeedSkeleton heading={heading} />
  if (articles.length === 0) return <FeedEmpty heading={heading} onRefresh={onRefresh} />

  const currentGroup =
    dateGroups.find((g) => g.key === selectedDateKey) ?? dateGroups[dateGroups.length - 1]
  const dateArticles = currentGroup?.articles ?? []
  const hero = dateArticles.find((a) => (a.urgencyScore ?? 0) >= 4) ?? dateArticles[0]
  const rest = hero
    ? diversifyBySource(dateArticles.filter((a) => a.id !== hero.id))
    : []
  const urgentCount = articles.filter((a) => (a.urgencyScore ?? 0) >= 4).length
  const unreadCount = articles.filter((a) => !a.isRead).length

  return (
    <div className="h-full overflow-y-auto" data-lookup-context={lookupContext}>
      <FeedHeader heading={heading} totalCount={articles.length} urgentCount={urgentCount} unreadCount={unreadCount} />
      <MacroPanel />
      <MorningBrief onOpenArticle={onOpenAnyArticle} onOpenSymbol={onOpenStock} />
      <CalendarStrip
        filter={calendarFilter}
        onOpenStock={onOpenStock}
        onOpenGame={onOpenGame}
        onOpenURL={onOpenURL}
        onOpenIpoBrief={onOpenIpoBrief}
      />
      {dateGroups.length > 1 && (
        <ArticleDateRail
          groups={dateGroups}
          selectedKey={currentGroup?.key ?? null}
          onSelect={setSelectedDateKey}
        />
      )}
      {hero && (
        <div className="px-6 pt-4 pb-4">
          <HeroCard article={hero} onSelect={onSelect} />
        </div>
      )}
      {rest.length > 0 && currentGroup && (
        <section className="px-6 pt-2 pb-6">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
              {dateLongLabel(currentGroup.key)}
            </h2>
            <span className="h-px flex-1 bg-edge/80" />
            <span className="text-[10px] tabular-nums text-zinc-500">{dateArticles.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
            {rest.map((a) => (
              <FeedCard key={a.id} article={a} onSelect={onSelect} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function FeedHeader({
  heading,
  totalCount,
  urgentCount,
  unreadCount
}: {
  heading: { eyebrow: string; title: string; eyebrowClass: string }
  totalCount: number
  urgentCount: number
  unreadCount: number
}): JSX.Element {
  const now = new Date()
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
  return (
    <header className="px-6 pt-6 pb-5">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div
            className={`text-[10px] font-semibold uppercase tracking-[0.28em] mb-1.5 ${heading.eyebrowClass}`}
          >
            {heading.eyebrow}
          </div>
          <h1 className="text-[28px] leading-none font-bold text-zinc-50 tracking-tight">
            {heading.title}
          </h1>
          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{dateStr}</div>
        </div>
        <div className="flex items-center gap-5 text-[11px] uppercase tracking-wider">
          <Stat label="Stories" value={totalCount} />
          <Stat label="Unread" value={unreadCount} tone="accent" />
          <Stat label="Urgent" value={urgentCount} tone={urgentCount > 0 ? 'urgent' : 'muted'} />
        </div>
      </div>
    </header>
  )
}

function Stat({
  label,
  value,
  tone = 'muted'
}: {
  label: string
  value: number
  tone?: 'muted' | 'accent' | 'urgent'
}): JSX.Element {
  const color =
    tone === 'urgent' ? 'text-red-400' : tone === 'accent' ? 'text-accent' : 'text-zinc-300'
  return (
    <div className="flex flex-col items-end">
      <div className={`text-lg font-semibold tabular-nums leading-none ${color}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 tracking-[0.2em] mt-1">{label}</div>
    </div>
  )
}

function StocksViewTab({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${
        active
          ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-500/40'
          : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  )
}

interface ArticleDateGroup {
  key: string
  ts: number
  articles: Article[]
}

function diversifyBySource(
  articles: Article[],
  { maxPerSource = 6, minGap = 2 }: { maxPerSource?: number; minGap?: number } = {}
): Article[] {
  if (articles.length <= 1) return articles

  const counts = new Map<number, number>()
  const capped: Article[] = []
  for (const a of articles) {
    const n = counts.get(a.feedId) ?? 0
    if (n >= maxPerSource) continue
    counts.set(a.feedId, n + 1)
    capped.push(a)
  }

  const out: Article[] = []
  const remaining = [...capped]
  while (remaining.length > 0) {
    const recentIds = new Set(out.slice(-minGap).map((a) => a.feedId))
    let pickIdx = remaining.findIndex((a) => !recentIds.has(a.feedId))
    if (pickIdx === -1) pickIdx = 0
    out.push(remaining.splice(pickIdx, 1)[0])
  }
  return out
}

function groupArticlesByDate(articles: Article[]): ArticleDateGroup[] {
  const map = new Map<string, ArticleDateGroup>()
  for (const a of articles) {
    if (!a.publishedAt) continue
    const d = new Date(a.publishedAt)
    const key = dateKey(d)
    let group = map.get(key)
    if (!group) {
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      group = { key, ts: midnight, articles: [] }
      map.set(key, group)
    }
    group.articles.push(a)
  }
  return Array.from(map.values()).sort((a, b) => a.ts - b.ts)
}

function ArticleDateRail({
  groups,
  selectedKey,
  onSelect
}: {
  groups: ArticleDateGroup[]
  selectedKey: string | null
  onSelect: (key: string) => void
}): JSX.Element {
  const railRef = useRef<HTMLDivElement | null>(null)
  const todayKey = dateKey(new Date())

  useEffect(() => {
    if (!railRef.current || !selectedKey) return
    const el = railRef.current.querySelector<HTMLElement>(`[data-article-date="${selectedKey}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selectedKey])

  return (
    <div
      ref={railRef}
      className="px-6 py-3 flex items-stretch gap-1.5 overflow-x-auto scrollbar-none border-b border-edge"
    >
      {groups.map((g) => {
        const active = g.key === selectedKey
        const isToday = g.key === todayKey
        const unread = g.articles.filter((a) => !a.isRead).length
        const urgent = g.articles.filter((a) => (a.urgencyScore ?? 0) >= 4).length
        const { primary, sub } = dateShortLabel(g.key, todayKey)
        return (
          <button
            key={g.key}
            data-article-date={g.key}
            onClick={() => onSelect(g.key)}
            className={`shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg text-center transition-colors min-w-[68px] ${
              active
                ? 'bg-accent/15 ring-1 ring-inset ring-accent/40 text-zinc-50'
                : isToday
                  ? 'text-zinc-200 hover:bg-surface-2 ring-1 ring-inset ring-edge'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 ring-1 ring-inset ring-transparent'
            }`}
          >
            <span className="text-[11px] font-semibold tracking-[0.04em] leading-none">
              {primary}
            </span>
            <span className="text-[10px] uppercase tracking-[0.16em] tabular-nums text-zinc-500 leading-none">
              {sub}
            </span>
            <span className="flex items-center gap-1 mt-0.5 text-[10px] tabular-nums">
              {urgent > 0 ? (
                <>
                  <span className="relative flex w-1.5 h-1.5">
                    <span className="absolute inset-0 rounded-full opacity-60 animate-ping bg-red-400" />
                    <span className="relative w-1.5 h-1.5 rounded-full bg-red-400" />
                  </span>
                  <span className="text-red-300">{urgent} urgent</span>
                </>
              ) : unread > 0 ? (
                <span className="text-accent">{unread} new</span>
              ) : (
                <span className="text-zinc-500">{g.articles.length}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function CoverageDateRail({
  groups
}: {
  groups: { key: string; label: string; count: number }[]
}): JSX.Element {
  const scrollTo = (key: string): void => {
    const el = document.getElementById(`coverage-${key}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <div
      className="sticky top-0 z-10 -mx-1 px-1 py-2 flex items-stretch gap-1.5 overflow-x-auto scrollbar-none bg-surface-0/95 backdrop-blur-sm border-b border-edge/60"
    >
      {groups.slice().reverse().map((g) => (
        <button
          key={g.key}
          onClick={() => scrollTo(g.key)}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-[0.04em] text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 ring-1 ring-inset ring-transparent hover:ring-edge transition-colors"
        >
          <span>{g.label}</span>
          <span className="text-[10px] tabular-nums text-zinc-500">{g.count}</span>
        </button>
      ))}
    </div>
  )
}

const URGENCY_STYLES = {
  urgent: {
    bar: 'bg-red-500',
    glow: 'shadow-[0_0_24px_rgba(239,68,68,0.35)]',
    badge: 'bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30',
    label: 'Urgent'
  },
  medium: {
    bar: 'bg-amber-400',
    glow: '',
    badge: 'bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-400/25',
    label: 'Watch'
  },
  low: {
    bar: '',
    glow: '',
    badge: '',
    label: ''
  }
} as const

function urgencyTier(score: number | null): 'urgent' | 'medium' | 'low' {
  if (score !== null && score >= 4) return 'urgent'
  if (score !== null && score >= 2) return 'medium'
  return 'low'
}

const UrgencyBadge = memo(function UrgencyBadge({
  article,
  size = 'sm'
}: {
  article: Article
  size?: 'sm' | 'md'
}): JSX.Element | null {
  const tier = urgencyTier(article.urgencyScore)
  if (tier === 'low') return null
  const styles = URGENCY_STYLES[tier]
  const paddings = size === 'md' ? 'px-2 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[9px]'
  return (
    <span
      title={article.urgencyReason ?? ''}
      className={`font-semibold uppercase tracking-[0.16em] rounded ${paddings} ${styles.badge}`}
    >
      {styles.label}
    </span>
  )
})

const HeroCard = memo(function HeroCard({
  article,
  onSelect
}: {
  article: Article
  onSelect: (id: number) => void
}): JSX.Element {
  const tier = urgencyTier(article.urgencyScore)
  const styles = URGENCY_STYLES[tier]
  const domainAccent = article.domain === 'finance' ? 'text-amber-400' : 'text-blue-400'
  const hasImage = Boolean(article.imageURL)
  return (
    <button
      onClick={() => onSelect(article.id)}
      className="hero-aurora group card-lift relative w-full text-left rounded-2xl overflow-hidden border border-edge bg-gradient-to-br from-surface-1 via-surface-1 to-surface-2 hover:from-surface-2 hover:via-surface-2 hover:to-surface-3 hover:shadow-[0_14px_40px_rgba(0,0,0,0.4)]"
    >
      {tier !== 'low' && (
        <span
          aria-hidden
          className={`absolute left-0 top-0 bottom-0 w-1 ${styles.bar} ${styles.glow} z-10`}
        />
      )}
      <div aria-hidden className="absolute inset-0 pointer-events-none opacity-[0.08] bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.6),_transparent_60%)]" />
      <div
        className={`relative ${hasImage ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}
      >
        <div className="p-7 md:p-9 order-2 lg:order-1 flex flex-col">
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-accent/90">
              Leading now
            </span>
            <span className="text-zinc-700">/</span>
            <FeedSource article={article} />
            <span className={`text-[11px] font-bold uppercase tracking-[0.18em] ${domainAccent}`}>
              {article.feedTitle}
            </span>
            <UrgencyBadge article={article} size="md" />
            <span className="ml-auto text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              {formatRelativeTime(article.publishedAt)}
            </span>
          </div>
          <h2 className="text-[clamp(22px,3vw,34px)] font-bold leading-[1.15] tracking-tight text-zinc-50 mb-3 max-w-4xl group-hover:text-white">
            {article.title}
          </h2>
          {article.summary && (
            <p className="text-[15px] leading-relaxed text-zinc-400 line-clamp-3 max-w-3xl">
              {article.summary}
            </p>
          )}
          <div className="mt-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-zinc-400 group-hover:text-zinc-200 transition-colors">
            <span>Read article</span>
            <span className="transition-transform group-hover:translate-x-1">→</span>
            {article.isBookmarked && (
              <span className="ml-auto text-amber-400 normal-case tracking-normal">★ Saved</span>
            )}
          </div>
        </div>
        {hasImage && <HeroImage src={article.imageURL!} />}
      </div>
    </button>
  )
})

function HeroImage({ src }: { src: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className="hidden lg:block" />
  return (
    <div className="order-1 lg:order-2 relative min-h-[200px] lg:min-h-[320px] bg-surface-2 overflow-hidden">
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-surface-1/90 via-surface-1/30 to-transparent lg:from-surface-1 lg:via-surface-1/60 lg:to-transparent"
      />
    </div>
  )
}

const FeedCard = memo(function FeedCard({
  article,
  onSelect,
  featured = false
}: {
  article: Article
  onSelect: (id: number) => void
  featured?: boolean
}): JSX.Element {
  const tier = urgencyTier(article.urgencyScore)
  const styles = URGENCY_STYLES[tier]
  const domainAccent = article.domain === 'finance' ? 'text-amber-400' : 'text-blue-400'
  const showImage = featured && Boolean(article.imageURL)
  return (
    <button
      onClick={() => onSelect(article.id)}
      className={`group card-lift relative text-left rounded-xl border bg-surface-1 hover:bg-surface-2 overflow-hidden h-full flex ${
        showImage ? 'flex-row' : 'flex-col'
      } ${
        tier === 'urgent'
          ? 'border-red-500/30 hover:border-red-500/50 hover:shadow-[0_8px_24px_rgba(239,68,68,0.15)]'
          : 'border-edge/70 hover:border-edge hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
      }`}
    >
      {tier !== 'low' && (
        <span
          aria-hidden
          className={`absolute left-0 top-0 bottom-0 w-[3px] ${styles.bar} ${styles.glow} z-10`}
        />
      )}
      {showImage && <FeedCardImage src={article.imageURL!} />}
      <div className="p-5 pl-6 flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <FeedSource article={article} />
            <span className={`text-[10px] font-bold uppercase tracking-[0.16em] truncate ${domainAccent}`}>
              {article.feedTitle}
            </span>
            <UrgencyBadge article={article} />
            {article.isBookmarked && (
              <span className="ml-auto text-amber-400 text-xs shrink-0">★</span>
            )}
          </div>
          {article.summary ? (
            <>
              <h3
                className={`${featured ? 'text-[20px]' : 'text-[15px]'} font-semibold leading-snug mb-2 line-clamp-3 tracking-tight ${
                  article.isRead ? 'text-zinc-400' : 'text-zinc-50 group-hover:text-white'
                }`}
              >
                {article.title}
              </h3>
              <p
                className={`${featured ? 'text-[13.5px] line-clamp-3' : 'text-[12.5px] line-clamp-2'} leading-relaxed text-zinc-500`}
              >
                {article.summary}
              </p>
            </>
          ) : (
            <h3
              className={`flex-1 flex items-center ${
                featured ? 'text-[28px]' : 'text-[22px]'
              } font-semibold leading-[1.15] tracking-tight line-clamp-6 ${
                article.isRead ? 'text-zinc-400' : 'text-zinc-50 group-hover:text-white'
              }`}
            >
              <span className="block">{article.title}</span>
            </h3>
          )}
        </div>
        <div className="mt-4 pt-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500 border-t border-edge/40">
          <span>{formatRelativeTime(article.publishedAt)}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {!article.isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </div>
      </div>
    </button>
  )
})

function FeedCardImage({ src }: { src: string }): JSX.Element | null {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <div className="relative shrink-0 w-[38%] min-w-[180px] bg-surface-2 overflow-hidden">
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <span
        aria-hidden
        className="absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-surface-1/80"
      />
    </div>
  )
}

function FeedSkeleton({
  heading
}: {
  heading: { eyebrow: string; title: string; eyebrowClass: string }
}): JSX.Element {
  return (
    <div className="h-full overflow-y-auto">
      <header className="px-6 pt-6 pb-5">
        <div
          className={`text-[10px] font-semibold uppercase tracking-[0.28em] mb-1.5 ${heading.eyebrowClass}`}
        >
          {heading.eyebrow}
        </div>
        <h1 className="text-[28px] leading-none font-bold text-zinc-50 tracking-tight">
          {heading.title}
        </h1>
      </header>
      <div className="px-6 pb-4">
        <div className="rounded-2xl border border-edge bg-surface-1 p-9 h-48 animate-pulse" />
      </div>
      <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-edge/70 bg-surface-1 p-5 h-48 animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}

function FeedEmpty({
  heading,
  onRefresh
}: {
  heading: { eyebrow: string; title: string; eyebrowClass: string }
  onRefresh: () => Promise<void>
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const click = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await onRefresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="h-full overflow-y-auto flex flex-col">
      <header className="px-6 pt-6 pb-5">
        <div
          className={`text-[10px] font-semibold uppercase tracking-[0.28em] mb-1.5 ${heading.eyebrowClass}`}
        >
          {heading.eyebrow}
        </div>
        <h1 className="text-[28px] leading-none font-bold text-zinc-50 tracking-tight">
          {heading.title}
        </h1>
      </header>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="mx-auto mb-5 w-14 h-14 rounded-full border border-edge flex items-center justify-center text-zinc-500 text-xl">
            ◦
          </div>
          <div className="text-xs uppercase tracking-[0.28em] text-zinc-500 mb-2">
            Nothing in this view
          </div>
          <div className="text-sm text-zinc-400 leading-relaxed mb-5">
            Either there are no matching stories yet, or the next poll hasn't run. Pull the latest
            batch from your feeds below.
          </div>
          <button
            onClick={click}
            disabled={busy}
            className="px-4 py-2 rounded-full bg-accent text-white text-[11px] font-semibold uppercase tracking-[0.18em] hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? 'Refreshing…' : 'Refresh feeds'}
          </button>
        </div>
      </div>
    </div>
  )
}

type ViewMode = 'web' | 'reader'

type LookupPrompt =
  | { kind: 'idle' }
  | { kind: 'prompt'; term: string; context: string; rect: DOMRect }

type DockStatus =
  | { kind: 'loading'; term: string; rect: DOMRect }
  | { kind: 'result'; term: string; rect: DOMRect; result: SmartLookup }
  | { kind: 'error'; term: string; rect: DOMRect; message: string }

type DockItem = DockStatus & { id: number; minimized: boolean }

function ArticleReader({
  article,
  onBack,
  onToggleBookmark,
  onMakeFlash,
  flashPendingForThis
}: {
  article: Article
  onBack: () => void
  onToggleBookmark: (a: Article) => void
  // Optional: caller passes undefined when the media pipeline
  // preference is off so the Flash button is hidden entirely.
  onMakeFlash?: (
    articleId: number,
    title: string
  ) => Promise<{ ok: true; reelId: number } | { ok: false; reason: string }>
  flashPendingForThis: boolean
}): JSX.Element {
  const webviewRef = useRef<HTMLElement | null>(null)
  const autoFellBackRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ViewMode>('reader')
  const [reader, setReader] = useState<ReaderResult | null>(null)
  const [readerLoading, setReaderLoading] = useState(false)
  const [flashState, setFlashState] = useState<
    'idle' | 'pending' | 'added' | 'exists' | 'failed'
  >('idle')

  useEffect(() => {
    setMode('reader')
    setReader(null)
    setReaderLoading(false)
    autoFellBackRef.current = false
    setFlashState('idle')
  }, [article.id])

  const makeFlash = useCallback(async (): Promise<void> => {
    if (!onMakeFlash) return
    if (flashState === 'pending' || flashState === 'added' || flashState === 'exists') return
    setFlashState('pending')
    const res = await onMakeFlash(article.id, article.title)
    if (res.ok) setFlashState('added')
    else if (res.reason === 'already-exists') setFlashState('exists')
    else setFlashState('failed')
  }, [article.id, article.title, flashState, onMakeFlash])

  useEffect(() => {
    if (flashPendingForThis && flashState === 'idle') setFlashState('pending')
  }, [flashPendingForThis, flashState])

  useEffect(() => {
    if (mode === 'reader' && !reader && !readerLoading) {
      void (async () => {
        setReaderLoading(true)
        try {
          const result = await window.api.reader.extract(article.url)
          setReader(result)
          if (result.status === 'error' && !autoFellBackRef.current) {
            autoFellBackRef.current = true
            setMode('web')
          }
        } finally {
          setReaderLoading(false)
        }
      })()
    }
  }, [article.id, mode, reader, readerLoading])

  useEffect(() => {
    if (mode !== 'web') return
    setLoading(true)
    const el = webviewRef.current
    if (!el) return
    const onStart = (): void => setLoading(true)
    const onStop = (): void => setLoading(false)
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    return () => {
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
    }
  }, [article.id, mode])

  const loadReader = useCallback(async (): Promise<void> => {
    setReaderLoading(true)
    try {
      const result = await window.api.reader.extract(article.url)
      setReader(result)
    } finally {
      setReaderLoading(false)
    }
  }, [article.url])

  const reload = (): void => {
    if (mode === 'web') {
      const el = webviewRef.current as unknown as { reload?: () => void } | null
      el?.reload?.()
    } else {
      setReader(null)
      void loadReader()
    }
  }

  const openExternal = (): void => {
    if (article.url.startsWith('http')) {
      window.open(article.url, '_blank', 'noreferrer')
    }
  }

  const toggleMode = (): void => {
    const next: ViewMode = mode === 'web' ? 'reader' : 'web'
    setMode(next)
    if (next === 'reader' && !reader && !readerLoading) void loadReader()
  }

  const readerLookupContext = `${
    article.domain === 'finance' ? 'Finance' : 'General news'
  } article "${article.title}" from ${article.feedTitle}. Use surrounding sentences to pick the intended sense of any ambiguous term.`

  return (
    <section
      className="h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden"
      data-lookup-context={readerLookupContext}
    >
      <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-edge bg-surface-1/60 backdrop-blur">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] text-zinc-300 hover:text-zinc-50 hover:bg-surface-2 transition-colors"
        >
          <span className="text-base leading-none">←</span>
          <span className="uppercase tracking-[0.18em]">Feed</span>
        </button>
        <span className="w-px h-5 bg-edge" />
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
              article.domain === 'finance' ? 'bg-amber-400' : 'bg-blue-400'
            }`}
          />
          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-300 truncate">
            {article.feedTitle}
          </span>
          <span className="text-zinc-700 text-[10px]">·</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 shrink-0">
            {formatRelativeTime(article.publishedAt)}
          </span>
          {((mode === 'web' && loading) || (mode === 'reader' && readerLoading)) && (
            <span className="text-[10px] text-zinc-500 ml-1">loading…</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={toggleMode}
            title="Toggle reader mode"
            className={`no-drag h-7 px-2 flex items-center justify-center rounded text-[10px] uppercase tracking-[0.18em] transition-colors ${
              mode === 'reader'
                ? 'bg-surface-2 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface-2'
            }`}
          >
            {mode === 'reader' ? 'Web' : 'Reader'}
          </button>
          {onMakeFlash && (
            <ToolbarButton
              label={
                flashState === 'added'
                  ? 'Added to Flash'
                  : flashState === 'exists'
                    ? 'Already a Flash'
                    : flashState === 'pending'
                      ? 'Generating Flash…'
                      : flashState === 'failed'
                        ? 'Flash failed — click to retry'
                        : 'Make Flash'
              }
              active={flashState === 'added' || flashState === 'exists'}
              onClick={() => void makeFlash()}
            >
              <FlashToolbarIcon state={flashState} />
            </ToolbarButton>
          )}
          <ToolbarButton
            label={article.isBookmarked ? 'Bookmarked' : 'Bookmark'}
            active={article.isBookmarked}
            onClick={() => onToggleBookmark(article)}
          >
            {article.isBookmarked ? '★' : '☆'}
          </ToolbarButton>
          <ToolbarButton label="Reload" onClick={reload}>
            ↻
          </ToolbarButton>
          <ToolbarButton label="Open in system browser" onClick={openExternal}>
            ↗
          </ToolbarButton>
        </div>
      </header>
      {mode === 'web' ? (
        <div className="flex-1 min-h-0 bg-white">
          <webview
            ref={(el) => {
              webviewRef.current = el
            }}
            src={article.url}
            partition="persist:webview"
            style={{ display: 'flex', width: '100%', height: '100%' }}
          />
        </div>
      ) : (
        <ReaderView
          article={article}
          reader={reader}
          loading={readerLoading}
          onRetry={loadReader}
        />
      )}
    </section>
  )
}

function ReaderView({
  article,
  reader,
  loading,
  onRetry
}: {
  article: Article
  reader: ReaderResult | null
  loading: boolean
  onRetry: () => void
}): JSX.Element {
  // Plain-text body for the relevance matcher. Stripping inside the renderer
  // (where we already parse the HTML for display) is cheaper than shipping
  // the raw HTML through IPC and stripping it main-side again. We cap at
  // 4000 chars — the matcher only needs enough context to catch an entity
  // mention, and the Ollama prompt truncates to 2400 anyway.
  const readerBodyText = useMemo<string | null>(() => {
    const html = reader?.contentHTML
    if (!html) return null
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const text = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return null
    return text.slice(0, 4000)
  }, [reader?.contentHTML])

  if (loading && !reader) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-zinc-500">
        Extracting readable content…
      </div>
    )
  }
  if (!reader || reader.status === 'error') {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-center px-8">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-zinc-600 mb-3">
            Reader unavailable
          </div>
          <div className="text-sm text-zinc-500 max-w-sm mb-4">
            {reader?.error ?? 'Could not extract readable content from this page.'}
          </div>
          <button
            onClick={onRetry}
            className="text-[11px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-surface-0">
      <article className="select-text max-w-[720px] mx-auto px-8 py-12">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-4">
          <span>{reader.siteName ?? article.feedTitle}</span>
          <span className="text-zinc-700">·</span>
          <span>{formatRelativeTime(article.publishedAt)}</span>
        </div>
        <h1 className="text-[30px] font-bold text-zinc-50 leading-[1.2] tracking-tight mb-3">
          {reader.title ?? article.title}
        </h1>
        {reader.byline && <div className="text-sm text-zinc-400 mb-8">{reader.byline}</div>}
        <WhyThisMatters
          articleId={article.id}
          title={article.title}
          summary={article.summary}
          body={readerBodyText}
        />
        <div
          className="reader-content text-[15.5px] leading-[1.75] text-zinc-200"
          dangerouslySetInnerHTML={{ __html: reader.contentHTML ?? '' }}
        />
      </article>
    </div>
  )
}

// App-wide selection watcher so Smart Lookup works on every page, not just
// the reader. Ignores selections inside inputs / editable fields / the webview
// so typing in Settings or Hyperintelligence doesn't fire a lookup.
function SmartLookupLayer({
  viewKey,
  onOpenURL
}: {
  viewKey: string
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
}): JSX.Element {
  const [lookup, setLookup] = useState<LookupPrompt>({ kind: 'idle' })
  const [docks, setDocks] = useState<DockItem[]>([])
  const dockIdRef = useRef(0)

  // Docks are bound to the page that triggered them, so when the user
  // navigates away (clicks a tab, opens an article, etc.), clear them. Leaving
  // docks pinned across unrelated views looks like a ghost.
  useEffect(() => {
    setDocks([])
    setLookup({ kind: 'idle' })
  }, [viewKey])

  useEffect(() => {
    const isEditable = (el: HTMLElement | null): boolean => {
      if (!el) return false
      return Boolean(
        el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], webview')
      )
    }

    const handleMouseUp = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && target.closest('[data-lookup-ui]')) return
      if (isEditable(target)) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
      const text = sel.toString().trim()
      if (text.length === 0 || text.length > 120 || !/[A-Za-z0-9]/.test(text)) return
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      const node = range.startContainer
      const paragraphText =
        (node.nodeType === Node.TEXT_NODE
          ? node.parentElement?.textContent
          : (node as Element).textContent) ?? ''
      // Walk up for a `data-lookup-context` hint so short selections on
      // domain-specific pages (e.g., an NBA roster) still disambiguate correctly.
      const anchor =
        node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
      const hintEl = anchor?.closest('[data-lookup-context]') as HTMLElement | null
      const hint = hintEl?.dataset.lookupContext?.trim() ?? ''
      const mergedContext = hint
        ? `[Page context: ${hint}]\n${paragraphText}`.slice(0, 500)
        : paragraphText.slice(0, 500)
      setLookup({ kind: 'prompt', term: text, context: mergedContext, rect })
    }

    const handleDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && target.closest('[data-lookup-ui]')) return
      setLookup((prev) => (prev.kind === 'idle' ? prev : { kind: 'idle' }))
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleDown, true)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleDown, true)
    }
  }, [])

  const runLookup = useCallback(async (): Promise<void> => {
    if (lookup.kind !== 'prompt') return
    const { term, context, rect } = lookup
    const id = ++dockIdRef.current
    setDocks((prev) => [...prev, { id, minimized: false, kind: 'loading', term, rect }])
    setLookup({ kind: 'idle' })
    try {
      const res = await window.api.reader.smartLookup(term, context)
      setDocks((prev) =>
        prev.map((d) =>
          d.id === id
            ? res
              ? { id, minimized: d.minimized, kind: 'result', term, rect, result: res }
              : {
                  id,
                  minimized: d.minimized,
                  kind: 'error',
                  term,
                  rect,
                  message: 'No definition found.'
                }
            : d
        )
      )
    } catch {
      setDocks((prev) =>
        prev.map((d) =>
          d.id === id
            ? { id, minimized: d.minimized, kind: 'error', term, rect, message: 'Lookup failed.' }
            : d
        )
      )
    }
  }, [lookup])

  const toggleDockMinimize = useCallback((id: number): void => {
    setDocks((prev) => prev.map((d) => (d.id === id ? { ...d, minimized: !d.minimized } : d)))
  }, [])

  const closeDock = useCallback((id: number): void => {
    setDocks((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const dockLayout = useMemo(() => computeDockLayout(docks), [docks])

  return (
    <>
      {lookup.kind === 'prompt' && (
        <SmartLookupChip state={lookup} onConfirm={() => void runLookup()} />
      )}
      {docks.map((dock) => (
        <SmartLookupDock
          key={dock.id}
          dock={dock}
          top={dockLayout.get(dock.id) ?? 80}
          onToggleMinimize={() => toggleDockMinimize(dock.id)}
          onClose={() => closeDock(dock.id)}
          onOpenURL={onOpenURL}
        />
      ))}
    </>
  )
}

function SmartLookupChip({
  state,
  onConfirm
}: {
  state: Extract<LookupPrompt, { kind: 'prompt' }>
  onConfirm: () => void
}): JSX.Element {
  const rect = state.rect
  const chipWidth = 220
  const gap = 8
  const vpW = window.innerWidth
  const vpH = window.innerHeight
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - chipWidth / 2, 12),
    vpW - chipWidth - 12
  )
  const aboveTop = rect.top - 36 - gap
  const top = aboveTop >= 12 ? aboveTop : Math.min(rect.bottom + gap, vpH - 48)

  return (
    <div
      data-lookup-ui
      className="fixed z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-zinc-900 border border-edge shadow-lg shadow-black/60"
      style={{ top, left, width: chipWidth }}
    >
      <button
        onClick={onConfirm}
        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300 hover:text-amber-200 px-1"
      >
        Look up
      </button>
      <span className="text-[11px] text-zinc-500 flex-1 truncate">"{state.term}"</span>
    </div>
  )
}

function computeDockLayout(docks: DockItem[]): Map<number, number> {
  const minTop = 80
  const gap = 8
  const bottomPad = 16
  // Viewport height — guarded for SSR-ish render (not applicable here but
  // cheap) and also for the case where window isn't fully laid out yet.
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 900
  const sorted = [...docks].sort((a, b) => a.rect.top - b.rect.top)
  const positions = new Map<number, number>()
  let cursor = minTop
  for (const d of sorted) {
    const height = d.minimized ? 40 : d.kind === 'result' ? 260 : 90
    const raw = Math.max(d.rect.top - 8, minTop)
    let top = Math.max(raw, cursor)
    // Clamp to viewport bottom so a lookup made near the end of a long reader
    // scroll doesn't spill off-screen. Scrollable dock body handles long
    // content so cramping the top coord is the right escape.
    const maxTop = viewportH - height - bottomPad
    if (top > maxTop) top = Math.max(minTop, maxTop)
    positions.set(d.id, top)
    cursor = top + height + gap
  }
  return positions
}

function SmartLookupDock({
  dock,
  top,
  onToggleMinimize,
  onClose,
  onOpenURL
}: {
  dock: DockItem
  top: number
  onToggleMinimize: () => void
  onClose: () => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
}): JSX.Element {
  const { minimized } = dock
  const title =
    dock.kind === 'result' && dock.result.title ? dock.result.title : dock.term

  return (
    <div
      data-lookup-ui
      className={`fixed right-6 z-40 rounded-lg bg-zinc-900/95 backdrop-blur border border-edge shadow-xl shadow-black/60 overflow-hidden transition-[width] ${
        minimized ? 'w-[220px]' : 'w-[300px]'
      }`}
      style={{ top }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-edge">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
          Lookup
        </span>
        <span
          className="text-[11px] text-zinc-300 truncate flex-1"
          title={title}
        >
          {title}
        </span>
        <button
          onClick={onToggleMinimize}
          className="text-zinc-500 hover:text-zinc-200 text-sm leading-none px-1"
          aria-label={minimized ? 'Expand' : 'Minimize'}
          title={minimized ? 'Expand' : 'Minimize'}
        >
          {minimized ? '+' : '–'}
        </button>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-200 text-sm leading-none px-1"
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
      </div>
      {!minimized && (
        <div className="px-3 py-3 text-[12.5px] leading-[1.55] text-zinc-200 max-h-[320px] overflow-y-auto">
          {dock.kind === 'loading' && (
            <span className="text-zinc-500">Looking up…</span>
          )}
          {dock.kind === 'error' && <span className="text-zinc-400">{dock.message}</span>}
          {dock.kind === 'result' && (
            <div className="space-y-2">
              {dock.result.thumbnailURL && (
                <img
                  src={dock.result.thumbnailURL}
                  alt=""
                  className="w-full h-28 rounded object-contain bg-surface-2"
                />
              )}
              <p className="whitespace-pre-wrap break-words">{dock.result.summary}</p>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                <span>
                  {dock.result.source === 'wikipedia' ? 'Wikipedia' : 'Local AI'}
                </span>
                {dock.result.sourceURL && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        const url = dock.result.sourceURL
                        if (!url) return
                        onOpenURL(
                          url,
                          dock.result.title ?? dock.term,
                          dock.result.source === 'wikipedia' ? 'Wikipedia' : null
                        )
                      }}
                      className="text-amber-300 hover:text-amber-200 normal-case tracking-normal"
                    >
                      Open article ↗
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToolbarButton({
  children,
  label,
  active,
  onClick
}: {
  children: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`no-drag h-7 w-7 flex items-center justify-center rounded text-sm transition-colors ${
        active
          ? 'text-amber-400 bg-surface-2'
          : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  )
}

function StocksPage({
  onClose,
  initialTickerSymbol,
  onOpenURL,
  onOpenArticle,
  onOpenIpoBrief
}: {
  onClose: () => void
  initialTickerSymbol?: string | null
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
  onOpenArticle: (id: number) => void
  onOpenIpoBrief: (symbol: string, companyName: string) => void
}): JSX.Element {
  const [quotes, setQuotes] = useState<StockQuote[]>([])
  const [tickers, setTickers] = useState<Ticker[]>([])
  const [busy, setBusy] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [selectedTickerId, setSelectedTickerId] = useState<number | null>(null)
  const [view, setView] = useState<'holdings' | 'chain' | 'graph'>('holdings')
  // Symbol handed to ValueChain when the user searches while the chain
  // view is active. Cleared by ValueChain once it accepts the request
  // (via onExternalFocusHandled) so subsequent searches fire cleanly.
  const [chainFocus, setChainFocus] = useState<string | null>(null)
  // Last initialTickerSymbol value the resolver effect already acted on.
  // The effect's deps include `tickers`, so without this ref it re-fires
  // every time setTickers runs (e.g. after a ticker-search ensurePassive
  // → setTickers chain) and re-overwrites selectedTickerId back to the
  // PRIOR initialTickerSymbol — which produces the bug where opening
  // detail on a freshly-looked-up ticker reverts to the previously-
  // viewed one. Resolving once per initialTickerSymbol value keeps the
  // intent of the effect (run on mount with a pending symbol) without
  // the surprise re-resolution.
  const lastResolvedInitialSymbol = useRef<string | null>(null)

  useEffect(() => {
    if (!initialTickerSymbol || tickers.length === 0) return
    if (lastResolvedInitialSymbol.current === initialTickerSymbol) return
    lastResolvedInitialSymbol.current = initialTickerSymbol
    const match = tickers.find(
      (t) => t.symbol.toUpperCase() === initialTickerSymbol.toUpperCase()
    )
    if (match) setSelectedTickerId(match.id)
  }, [initialTickerSymbol, tickers])

  useEffect(() => {
    void window.api.tickers
      .list()
      .then(setTickers)
      .catch((err) => console.warn('[ui] tickers.list failed:', err))
    void window.api.stocks
      .getQuotes()
      .then((q) => {
        setQuotes(q)
        if (q.length > 0) setLastUpdatedAt(Date.now())
      })
      .catch((err) => console.warn('[ui] stocks.getQuotes failed:', err))
    const unsub = window.api.stocks.onUpdated((q) => {
      setQuotes(q)
      setLastUpdatedAt(Date.now())
    })
    return unsub
  }, [])

  const refresh = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const q = await window.api.stocks.refresh()
      setQuotes(q)
      setLastUpdatedAt(Date.now())
    } finally {
      setBusy(false)
    }
  }

  // bySymbol legitimately invalidates on every quote tick — child cards
  // need the fresh quote object. The sectorOrder/grouped derivation
  // only depends on `tickers` (rare to mutate during a session) so
  // memo-ing it stops the per-tick allocation pass.
  const bySymbol = useMemo(
    () => new Map(quotes.map((q) => [q.symbol.toUpperCase(), q])),
    [quotes]
  )
  const { sectorOrder, grouped } = useMemo(() => {
    const order: string[] = []
    const buckets: Record<string, Ticker[]> = {}
    for (const t of tickers) {
      if (!t.isActive) continue
      const sector = t.sector?.trim() || 'Other'
      if (!(sector in buckets)) {
        buckets[sector] = []
        order.push(sector)
      }
      buckets[sector].push(t)
    }
    return { sectorOrder: order, grouped: buckets }
  }, [tickers])

  const gainers = quotes.filter((q) => (q.change ?? 0) > 0).length
  const losers = quotes.filter((q) => (q.change ?? 0) < 0).length

  return (
    <section
      className="h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden"
      data-lookup-context="Stock portfolio page — US equity tickers and company names, mostly semiconductor value chain (fabless AI designers, foundries, equipment, EDA, packaging), defense/aerospace, and mining. Ambiguous terms are almost always publicly traded companies, not homonymous people or places."
    >
      <header className="px-6 pt-6 pb-5 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-400/90 mb-1.5">
            Live markets via stooq.com
          </div>
          <h1 className="text-[28px] leading-none font-bold text-zinc-50 tracking-tight">Stocks</h1>
          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {lastUpdatedAt
              ? `Updated ${formatRelativeTime(lastUpdatedAt)}`
              : 'Awaiting first quote'}
          </div>
        </div>
        <div className="flex items-center gap-5 text-[11px] uppercase tracking-wider">
          <div className="flex items-center gap-1 rounded-full bg-surface-1 ring-1 ring-edge/60 p-0.5">
            <StocksViewTab label="Holdings" active={view === 'holdings'} onClick={() => setView('holdings')} />
            <StocksViewTab label="Value Chain" active={view === 'chain'} onClick={() => setView('chain')} />
            <StocksViewTab label="Graph" active={view === 'graph'} onClick={() => setView('graph')} />
          </div>
          <Stat label="Holdings" value={tickers.filter((t) => t.isActive).length} />
          <Stat label="Gainers" value={gainers} tone="accent" />
          <Stat label="Losers" value={losers} tone={losers > 0 ? 'urgent' : 'muted'} />
          <button
            onClick={refresh}
            disabled={busy}
            className="px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 text-[10px] font-semibold uppercase tracking-[0.18em] hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
          >
            Close
          </button>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <CalendarStrip
          filter="finance"
          onOpenStock={(symbol) => {
            const match = tickers.find(
              (t) => t.symbol.toUpperCase() === symbol.toUpperCase()
            )
            if (match) setSelectedTickerId(match.id)
          }}
          onOpenGame={() => {}}
          onOpenURL={onOpenURL}
          onOpenIpoBrief={onOpenIpoBrief}
        />
        <MacroPanel />
        <div className="px-6 pt-4">
          <CollapsibleSection title="Explore tickers" meta="Yahoo search · any US symbol" defaultOpen={false}>
            <TickerSearchBox
              onOpenDetail={async (r) => {
                const t = await window.api.tickers.ensurePassive({
                  symbol: r.symbol,
                  companyName: r.name,
                  sector: r.sector ?? null,
                  industry: r.industry ?? null
                })
                const updated = await window.api.tickers.list()
                setTickers(updated)
                // On the chain view, searching means "find this ticker in
                // the diagram" — light up + scroll the matching tile
                // instead of covering the graph with a detail modal. On
                // the holdings view, the modal is still the right answer.
                if (view === 'chain') {
                  setChainFocus(r.symbol.toUpperCase())
                } else {
                  setSelectedTickerId(t.id)
                }
              }}
              onAddToWatchlist={async (r) => {
                const t = await window.api.tickers.create({
                  symbol: r.symbol,
                  companyName: r.name,
                  sector: r.sector ?? null,
                  industry: r.industry ?? null
                })
                const updated = await window.api.tickers.list()
                setTickers(updated)
                if (view === 'chain') {
                  setChainFocus(r.symbol.toUpperCase())
                } else {
                  setSelectedTickerId(t.id)
                }
              }}
            />
          </CollapsibleSection>
        </div>
        {view === 'graph' ? (
          // Whole-universe relationship graph. Quotes are passed for the
          // live change tint only — MarketGraph never lays out from them,
          // so a 60s tick recolours without re-running the simulation.
          <MarketGraph
            quotes={quotes}
            onSelectSymbol={(symbol) => {
              const t = tickers.find((x) => x.symbol === symbol)
              if (t) setSelectedTickerId(t.id)
            }}
          />
        ) : view === 'chain' ? (
          <ValueChain
            tickers={tickers}
            quotes={quotes}
            onOpenTicker={(id) => setSelectedTickerId(id)}
            onActivateTicker={async (id) => {
              await window.api.tickers.activate(id)
              const updated = await window.api.tickers.list()
              setTickers(updated)
            }}
            externalFocus={chainFocus}
            // Don't clear chainFocus once accepted — keeping it set
            // means a tab switch (chain → holdings → chain) re-locks
            // the same ticker on remount, and closing a detail page
            // returns the user to the chain view with that ticker
            // already focused (instead of forcing a re-search).
            onExternalFocusHandled={() => {}}
            onOpenURL={onOpenURL}
          />
        ) : tickers.filter((t) => t.isActive).length === 0 ? (
          <div className="px-6 py-20 text-center text-sm text-zinc-500">
            No active tickers in your watchlist. Add some from Settings → Tickers.
          </div>
        ) : (
          sectorOrder.map((sector) => (
            <section key={sector} className="px-6 pt-2 pb-6">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                  {sector}
                </h2>
                <span className="h-px flex-1 bg-edge/80" />
                <span className="text-[10px] tabular-nums text-zinc-500">
                  {grouped[sector].length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
                {grouped[sector].map((t) => (
                  <StockCard
                    key={t.id}
                    ticker={t}
                    quote={bySymbol.get(t.symbol.toUpperCase())}
                    onOpen={() => setSelectedTickerId(t.id)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      {selectedTickerId !== null && (() => {
        const t = tickers.find((x) => x.id === selectedTickerId)
        if (!t) return null
        return (
          <StockDetail
            ticker={t}
            tickers={tickers}
            quote={bySymbol.get(t.symbol.toUpperCase())}
            onClose={() => {
              // Remember the ticker the user was just looking at so
              // the value chain page lands on it (no re-search) when
              // they navigate back. Works whether they were already on
              // chain view (re-locks the same tile) or switch to it
              // afterwards (externalFocus fires on remount).
              setChainFocus(t.symbol)
              setSelectedTickerId(null)
            }}
            onOpenArticle={onOpenArticle}
            onOpenURL={onOpenURL}
            onActivate={async () => {
              await window.api.tickers.activate(t.id)
              const updated = await window.api.tickers.list()
              setTickers(updated)
            }}
            onOpenTicker={(id) => setSelectedTickerId(id)}
          />
        )
      })()}
    </section>
  )
}

function StockCard({
  ticker,
  quote,
  onOpen
}: {
  ticker: Ticker
  quote: StockQuote | undefined
  onOpen: () => void
}): JSX.Element {
  const rq = quote ? resolveDisplayQuote(quote) : null
  const price = rq?.price ?? null
  const change = rq?.change ?? null
  const changePct = rq?.changePct ?? null
  const up = (change ?? 0) > 0
  const down = (change ?? 0) < 0
  const tone = up ? 'emerald' : down ? 'red' : 'zinc'
  const color =
    tone === 'emerald' ? 'text-emerald-400' : tone === 'red' ? 'text-red-400' : 'text-zinc-400'
  const ring =
    tone === 'emerald'
      ? 'border-emerald-500/30 hover:border-emerald-500/50 hover:shadow-[0_8px_24px_rgba(16,185,129,0.15)]'
      : tone === 'red'
        ? 'border-red-500/30 hover:border-red-500/50 hover:shadow-[0_8px_24px_rgba(239,68,68,0.15)]'
        : 'border-edge/70 hover:border-edge hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]'

  return (
    <button
      onClick={onOpen}
      className={`card-lift relative rounded-xl border bg-surface-1 hover:bg-surface-2 p-5 flex flex-col min-w-0 h-full text-left transition-colors ${ring}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="text-[18px] font-bold tracking-[0.06em] text-zinc-50 leading-none">
              {ticker.symbol}
            </div>
            {rq?.sessionBadge && (
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40">
                {rq.sessionBadge}
              </span>
            )}
          </div>
          <div className="text-[12px] text-zinc-400 truncate">{ticker.companyName}</div>
        </div>
        <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${color} shrink-0`}>
          {up ? '▲' : down ? '▼' : '·'} {changePct !== null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
        </div>
      </div>
      <div className="flex items-end gap-3 mb-4">
        <div className="text-[26px] font-bold tabular-nums leading-none text-zinc-50">
          {price !== null ? price.toFixed(2) : '—'}
        </div>
        {change !== null && (
          <div className={`text-[12px] tabular-nums font-semibold pb-1 ${color}`}>
            {change >= 0 ? '+' : ''}
            {change.toFixed(2)}
          </div>
        )}
      </div>
      <div className="mt-auto grid grid-cols-3 gap-2 pt-3 border-t border-edge/40 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        <StockStat label="Open" value={quote?.open} />
        <StockStat label="High" value={quote?.high} />
        <StockStat label="Low" value={quote?.low} />
      </div>
      {quote?.time && (
        <div className="mt-2 text-[9px] uppercase tracking-[0.22em] text-zinc-600 tabular-nums">
          {quote.time}
        </div>
      )}
    </button>
  )
}

function StockStat({ label, value }: { label: string; value: number | null | undefined }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span>{label}</span>
      <span className="text-zinc-300 tabular-nums text-[12px] normal-case tracking-normal">
        {value !== null && value !== undefined ? value.toFixed(2) : '—'}
      </span>
    </div>
  )
}

function FundamentalCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </span>
      <span className="text-[15px] font-semibold tabular-nums text-zinc-100 truncate">
        {value}
      </span>
    </div>
  )
}

// Quarterly-statement-driven KPIs paired with the 8-quarter FCF strip. Same
// data source (ticker_financials + computeSnapshot) that the peer-compare
// modal + Value Chain tiles use, so numbers stay consistent across surfaces.
// Null financials renders a pending placeholder — the scheduler broadcast
// will flip us to populated state without a remount.
function FinancialsDetailSection({
  financials
}: {
  financials: FinancialsSnapshot | null
}): JSX.Element {
  const ttm = financials?.ttm
  const yoyRev = financials?.yoy?.revenue ?? null
  const margin = ttm?.fcfMargin ?? null
  const marginStyling = fcfMarginTone(margin)
  const yoyTone =
    yoyRev === null
      ? 'text-zinc-300'
      : yoyRev > 0
        ? 'text-emerald-300'
        : yoyRev < 0
          ? 'text-red-300'
          : 'text-zinc-300'
  // Annual-cadence tickers (e.g. ATEYY) have no quarterly data — the
  // sparkline shows fiscal years and the labels need to match so the
  // user doesn't think Q4-2024 when they're looking at FY2024.
  const isAnnual = financials?.cadence === 'annual'
  const sectionMeta = isAnnual ? 'Last 4 years' : 'Last 8 quarters'
  const sparklineLabel = isAnnual
    ? 'Free cash flow · last 4 fiscal years'
    : 'Free cash flow · last 8 quarters'
  return (
    <CollapsibleSection title="Financial performance" meta={sectionMeta} defaultOpen>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 items-center">
        <FinancialsCell
          label={isAnnual ? 'Revenue (FY)' : 'Revenue TTM'}
          value={formatMoneyCompact(ttm?.revenue ?? null) ?? '—'}
          tone="text-zinc-100"
        />
        <FinancialsCell
          label="Revenue YoY"
          value={formatPctDelta(yoyRev) ?? '—'}
          tone={yoyTone}
        />
        <FinancialsCell
          label={isAnnual ? 'FCF (FY)' : 'FCF TTM'}
          value={formatMoneyCompact(ttm?.freeCashFlow ?? null) ?? '—'}
          tone="text-zinc-100"
        />
        <FinancialsCell
          label="FCF margin"
          value={formatPctValue(margin) ?? '—'}
          tone={marginStyling.color}
        />
      </div>
      <div className="mt-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2">
          {sparklineLabel}
        </div>
        <FcfSparkline financials={financials ?? undefined} variant="card" />
      </div>
    </CollapsibleSection>
  )
}

function FinancialsCell({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: string
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </span>
      <span className={`text-[17px] font-semibold tabular-nums truncate ${tone}`}>{value}</span>
    </div>
  )
}

function currencySymbol(code: string | null): string {
  if (!code) return ''
  if (code === 'USD') return '$'
  if (code === 'EUR') return '€'
  if (code === 'GBP') return '£'
  if (code === 'JPY') return '¥'
  return `${code} `
}

function formatPE(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  return v.toFixed(2)
}

function formatEps(v: number | null, currency: string | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  const sign = v < 0 ? '-' : ''
  return `${sign}${currencySymbol(currency)}${Math.abs(v).toFixed(2)}`
}

function formatYield(v: number | null): string {
  if (v === null || !Number.isFinite(v) || v === 0) return '—'
  // Yahoo reports as decimal (e.g. 0.0125 = 1.25%)
  return `${(v * 100).toFixed(2)}%`
}

function formatMarketCap(v: number | null, currency: string | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  const prefix = currencySymbol(currency)
  const abs = Math.abs(v)
  if (abs >= 1e12) return `${prefix}${(v / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${prefix}${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${prefix}${(v / 1e6).toFixed(2)}M`
  return `${prefix}${v.toFixed(0)}`
}

function format52wRange(low: number | null, high: number | null, currency: string | null): string {
  if (low === null || high === null || !Number.isFinite(low) || !Number.isFinite(high)) return '—'
  const prefix = currencySymbol(currency)
  return `${prefix}${low.toFixed(2)} – ${prefix}${high.toFixed(2)}`
}

const STOCK_RANGE_ORDER: HistoryRange[] = ['1D', '5D', '1W', '1M', '3M', '1Y', '5Y', 'MAX']

function parseBriefSummary(summary: string): { intro: string | null; items: string[] } {
  const text = summary.trim()
  const firstMatch = text.match(/(^|[\s\n])1[.)]\s+/)
  if (!firstMatch || firstMatch.index === undefined) {
    return { intro: null, items: [text] }
  }
  const listStart = firstMatch.index + (firstMatch[1] ? firstMatch[1].length : 0)
  const intro = text.slice(0, listStart).trim()
  const rest = text.slice(listStart)
  const pieces = rest
    .split(/(?:^|\n|\s)(?=\d+[.)]\s+)/)
    .map((p) => p.trim())
    .filter(Boolean)
  const items: string[] = []
  for (const p of pieces) {
    const m = p.match(/^\d+[.)]\s+([\s\S]+)$/)
    if (m) items.push(m[1].trim())
  }
  if (items.length < 2) {
    return { intro: null, items: [text] }
  }
  return { intro: intro.length > 0 ? intro : null, items }
}

function BriefSummary({ summary }: { summary: string }): JSX.Element {
  const { intro, items } = parseBriefSummary(summary)
  if (items.length < 2) {
    return <p className="text-[14px] leading-relaxed text-zinc-200">{items[0]}</p>
  }
  return (
    <div className="space-y-3">
      {intro && <p className="text-[14px] leading-relaxed text-zinc-200">{intro}</p>}
      <ol className="space-y-2">
        {items.map((item, idx) => (
          <li
            key={idx}
            className="flex gap-3 text-[14px] leading-relaxed text-zinc-200"
          >
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-500 w-5 pt-[3px]">
              {idx + 1}.
            </span>
            <span className="flex-1">{item}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function StockDetail({
  ticker,
  tickers,
  quote,
  onClose,
  onOpenArticle,
  onActivate,
  onOpenTicker,
  onOpenURL
}: {
  ticker: Ticker
  tickers: Ticker[]
  quote: StockQuote | undefined
  onClose: () => void
  onOpenArticle: (id: number) => void
  onActivate: () => void
  // Navigate to another ticker's detail page. Used by the generated value
  // chain when users click a resolved node. Parent owns the state (the
  // ticker-id selector on StocksPage), so this just re-fires that handler.
  onOpenTicker: (tickerId: number) => void
  // Open an external URL in the in-app reader. Wired into the value-chain
  // citation chips so users can click through from an edge to the cited
  // 10-K filing or news article.
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
}): JSX.Element {
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [range, setRange] = useState<HistoryRange>('1D')
  const [articles, setArticles] = useState<Article[]>([])
  const [loadingArticles, setLoadingArticles] = useState(true)
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryCount, setSummaryCount] = useState<number>(0)
  const [summaryState, setSummaryState] = useState<
    'loading' | 'ready' | 'offline' | 'empty' | 'no-material'
  >('loading')
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null)
  const [financials, setFinancials] = useState<FinancialsSnapshot | null>(null)
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  // Diagram modal state — opened by the "View diagram" button on the
  // value chain card, closes either via its own ✕ or by setting null.
  // Symbol is captured at click time so the modal stays bound to the
  // right ticker even if the user navigates inside it.
  const [diagramSymbol, setDiagramSymbol] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.stocks
      .getFundamentals(ticker.symbol)
      .then((f) => {
        if (!cancelled) setFundamentals(f)
      })
      .catch((err) => console.warn('[ui] stocks.getFundamentals failed:', err))
    return () => {
      cancelled = true
    }
  }, [ticker.symbol])

  // Quarterly financials (TTM revenue, FCF margin, YoY deltas, 8Q FCF strip).
  // Batched fetch on the stocks page already populates most tickers; this
  // per-symbol call ensures the detail page is never blocked waiting on the
  // batch and also picks up live updates when the scheduler re-broadcasts.
  useEffect(() => {
    let cancelled = false
    setFinancials(null)
    void window.api.stocks
      .getFinancials(ticker.symbol)
      .then((snap) => {
        if (!cancelled) setFinancials(snap)
      })
      .catch(() => {
        /* swallow — section renders a pending state when null */
      })
    const unsub = window.api.stocks.onFinancialsUpdated((sym) => {
      if (sym.toUpperCase() !== ticker.symbol.toUpperCase()) return
      void window.api.stocks
        .getFinancials(ticker.symbol)
        .then((snap) => {
          if (!cancelled) setFinancials(snap)
        })
        .catch(() => {
          /* ignore */
        })
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [ticker.symbol])

  useEffect(() => {
    let cancelled = false
    setProfile(null)
    setProfileLoading(true)
    void window.api.stocks
      .ensureCompanyProfile(ticker.symbol, ticker.companyName)
      .then((p) => {
        if (!cancelled) {
          setProfile(p)
          setProfileLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setProfileLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ticker.symbol, ticker.companyName])

  useEffect(() => {
    let cancelled = false
    setLoadingHistory(true)
    void window.api.stocks
      .getHistory(ticker.symbol, range)
      .then((rows) => {
        if (cancelled) return
        setHistory(rows)
        setLoadingHistory(false)
      })
      .catch((err) => {
        if (!cancelled) setLoadingHistory(false)
        console.warn('[ui] stocks.getHistory failed:', err)
      })
    return () => {
      cancelled = true
    }
  }, [ticker.symbol, range])

  useEffect(() => {
    setLoadingArticles(true)
    void window.api.articles
      .listForTicker(ticker.id)
      .then(setArticles)
      .finally(() => setLoadingArticles(false))
  }, [ticker.id])

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void window.api.tickers.summarize(ticker.id).then((res) => {
        if (cancelled) return
        if (!res) {
          setSummaryState('loading')
          return
        }
        setSummaryCount(res.articleCount)
        if (res.generatedAt === null) {
          // Cache miss — server-side refresh just kicked off. Hold loading state
          // until the summaryUpdated event arrives.
          setSummary(null)
          setSummaryState('loading')
          return
        }
        if (res.articleCount === 0) {
          setSummary(null)
          setSummaryState('empty')
          return
        }
        if (res.summary) {
          setSummary(res.summary)
          setSummaryState('ready')
          return
        }
        // summary === null. Disambiguate with relevantCount: 0 = LLM ran and
        // found nothing material; null = LLM never ran (Ollama offline / pre-v22).
        setSummary(null)
        if (res.relevantCount === 0) {
          setSummaryState('no-material')
        } else {
          setSummaryState('offline')
        }
      })
    }
    setSummaryState('loading')
    setSummary(null)
    setSummaryCount(0)
    load()
    const unsub = window.api.tickers.onSummaryUpdated((id) => {
      if (id === ticker.id) load()
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [ticker.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const points = appendLiveQuote(history, range, quote)
  const rangeBounds = computeRangeDelta(points, range)
  const currency = '$' // .us listings are USD

  const down = (rangeBounds.delta ?? 0) < 0
  const up = (rangeBounds.delta ?? 0) > 0
  const deltaColor = up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-zinc-400'
  const chartColor = up ? '#34d399' : down ? '#f87171' : '#a1a1aa'

  const grouped = groupArticlesByDay(articles)
  const stockLookupContext = `Stock detail for ${ticker.symbol} (${ticker.companyName}${
    ticker.sector ? `, ${ticker.sector}` : ''
  }) — ambiguous terms are usually related companies, products, executives, suppliers, customers, or competitors in the same industry.`

  return (
    <div
      className="absolute inset-0 z-30 bg-surface-0 flex flex-col overflow-hidden"
      data-lookup-context={stockLookupContext}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1180px] mx-auto px-6 py-6">
          <header className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[28px] font-bold tracking-[0.06em] text-zinc-50 leading-none">
                  {ticker.symbol}
                </span>
                {ticker.sector && (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    {ticker.sector}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[14px] text-zinc-300">{ticker.companyName}</div>
              {profile ? (
                <p className="mt-2 max-w-[640px] text-[13px] leading-snug text-zinc-400">
                  {profile.description}
                </p>
              ) : profileLoading ? (
                <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-zinc-600">
                  Generating company profile…
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                {(() => {
                  if (!quote)
                    return (
                      <div className="text-[26px] font-bold tabular-nums leading-none text-zinc-50">—</div>
                    )
                  const rq = resolveDisplayQuote(quote)
                  const deltaColor =
                    (rq.change ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  const sessionSuffix =
                    rq.session === 'post'
                      ? 'after hours'
                      : rq.session === 'pre'
                        ? 'pre-market'
                        : rq.session === 'closed'
                          ? 'at close'
                          : 'today'
                  return (
                    <>
                      <div className="flex items-baseline justify-end gap-2">
                        {rq.sessionBadge && (
                          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40">
                            {rq.sessionBadge}
                          </span>
                        )}
                        <span className="text-[26px] font-bold tabular-nums leading-none text-zinc-50">
                          {rq.price !== null ? `${currency}${rq.price.toFixed(2)}` : '—'}
                        </span>
                      </div>
                      {rq.changePct !== null && (
                        <div className={`text-[12px] font-semibold tabular-nums mt-1 ${deltaColor}`}>
                          {(rq.change ?? 0) >= 0 ? '+' : ''}
                          {rq.change !== null ? rq.change.toFixed(2) : '—'} (
                          {(rq.changePct ?? 0) >= 0 ? '+' : ''}
                          {rq.changePct.toFixed(2)}%) {sessionSuffix}
                        </div>
                      )}
                      {/* Show the regular-session close as a secondary line
                          during extended hours so users can see both prices
                          on the detail page. Hidden during regular hours
                          since the primary price IS the regular price. */}
                      {rq.sessionBadge && quote.price !== null && (
                        <div className="text-[10px] tabular-nums text-zinc-500 mt-0.5">
                          Reg close {currency}
                          {quote.price.toFixed(2)}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
              {ticker.isActive ? (
                <span
                  className="ml-2 px-3 h-9 flex items-center rounded-full bg-emerald-500/15 text-emerald-200 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset ring-emerald-500/40"
                  title="This ticker is in your watchlist — news and briefs are ingested."
                >
                  ✓ Watchlist
                </span>
              ) : (
                <button
                  onClick={onActivate}
                  className="ml-2 px-3 h-9 rounded-full bg-indigo-500/15 text-indigo-200 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25 transition-colors"
                >
                  + Watchlist
                </button>
              )}
              {/* Diagram launcher — sits next to the watchlist control so
                  primary actions are co-located. Same purple treatment as
                  the matching button on the ValueChain focus panel. */}
              <button
                onClick={() => setDiagramSymbol(ticker.symbol)}
                title="Open zoomable subgraph diagram"
                className="ml-2 px-3 h-9 rounded-full bg-purple-500/15 text-purple-200 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset ring-purple-500/40 hover:bg-purple-500/25 transition-colors"
              >
                Diagram
              </button>
              <button
                onClick={onClose}
                className="ml-2 h-9 w-9 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 transition-colors text-xl"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </header>

          <section className="rounded-2xl border border-edge bg-surface-1 overflow-hidden">
            <div className="px-6 pt-5 flex items-end justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500 mb-1.5">
                  {range} change
                </div>
                <div className="flex items-baseline gap-3">
                  <span className={`text-[32px] font-bold tabular-nums leading-none ${deltaColor}`}>
                    {rangeBounds.delta !== null
                      ? `${rangeBounds.delta >= 0 ? '+' : '−'}${currency}${Math.abs(rangeBounds.delta).toFixed(2)}`
                      : '—'}
                  </span>
                  {rangeBounds.deltaPct !== null && (
                    <span className={`text-[14px] font-semibold tabular-nums ${deltaColor}`}>
                      {rangeBounds.deltaPct >= 0 ? '+' : ''}
                      {rangeBounds.deltaPct.toFixed(2)}%
                    </span>
                  )}
                </div>
                {rangeBounds.from && rangeBounds.to && (
                  <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    {rangeBounds.from} → {rangeBounds.to}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {STOCK_RANGE_ORDER.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-[0.08em] transition-colors ${
                      range === r
                        ? 'bg-surface-3 text-zinc-50 ring-1 ring-inset ring-edge'
                        : 'text-zinc-500 hover:text-zinc-200 hover:bg-surface-2'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-3 pb-3 pt-4">
              {loadingHistory ? (
                <div className="h-64 flex items-center justify-center text-[11px] uppercase tracking-[0.22em] text-zinc-600">
                  Loading history…
                </div>
              ) : points.length < 2 ? (
                <div className="h-64 flex items-center justify-center text-[11px] uppercase tracking-[0.22em] text-zinc-600">
                  Not enough data for this range
                </div>
              ) : (
                <StockChart points={points} color={chartColor} />
              )}
            </div>
            <div className="px-5 pb-3 flex justify-end">
              <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                via Yahoo Finance
              </span>
            </div>
          </section>

          {fundamentals && (
            <CollapsibleSection title="Key stats" meta="via Yahoo Finance" defaultOpen>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-3">
                <FundamentalCell label="P/E" value={formatPE(fundamentals.peRatio)} />
                <FundamentalCell label="Fwd P/E" value={formatPE(fundamentals.forwardPE)} />
                <FundamentalCell label="EPS" value={formatEps(fundamentals.eps, fundamentals.currency)} />
                <FundamentalCell label="Market cap" value={formatMarketCap(fundamentals.marketCap, fundamentals.currency)} />
                <FundamentalCell label="Div yield" value={formatYield(fundamentals.dividendYield)} />
                <FundamentalCell label="52W range" value={format52wRange(fundamentals.weekLow52, fundamentals.weekHigh52, fundamentals.currency)} />
              </div>
            </CollapsibleSection>
          )}

          <FinancialsDetailSection financials={financials} />

          <UnifiedValueChainCard
            symbol={ticker.symbol}
            companyName={ticker.companyName ?? ticker.symbol}
            tickers={tickers}
            onOpenCitation={onOpenURL}
            onOpenTicker={async (sym) => {
              // Ensure a passive ticker row exists for the clicked node,
              // then navigate to its detail page. Falls back to companyName
              // = symbol when we can't find a richer label in the merged
              // chain's nodes.
              const existing = tickers.find(
                (t) => t.symbol.toUpperCase() === sym.toUpperCase()
              )
              if (existing) {
                onOpenTicker(existing.id)
                return
              }
              const t = await window.api.tickers.ensurePassive({
                symbol: sym,
                companyName: sym
              })
              onOpenTicker(t.id)
            }}
          />

          <EarningsReleaseSection symbol={ticker.symbol} />

          {ticker.isActive && (
            <CollapsibleSection
              title="Today's brief"
              meta={
                summaryCount > 0
                  ? `${summaryCount} ${summaryCount === 1 ? 'article' : 'articles'}`
                  : undefined
              }
              defaultOpen
            >
              {summaryState === 'loading' && (
                <div className="text-[12px] uppercase tracking-[0.22em] text-zinc-600">
                  Summarizing…
                </div>
              )}
              {summaryState === 'empty' && (
                <div className="text-[13px] text-zinc-500">
                  No news today for {ticker.symbol}.
                </div>
              )}
              {summaryState === 'no-material' && (
                <div className="text-[13px] text-zinc-500">
                  No material news today for {ticker.symbol}. {summaryCount}{' '}
                  {summaryCount === 1 ? 'article' : 'articles'} surfaced but none were
                  substantively about the company (see below).
                </div>
              )}
              {summaryState === 'offline' && (
                <div className="text-[13px] text-zinc-500">
                  AI summary unavailable — Ollama is offline. {summaryCount}{' '}
                  {summaryCount === 1 ? 'article' : 'articles'} in the last 24h (see below).
                </div>
              )}
              {summaryState === 'ready' && summary && <BriefSummary summary={summary} />}
            </CollapsibleSection>
          )}

          <SecFilingsSection symbol={ticker.symbol} />

          <OptionsSnapshotSection symbol={ticker.symbol} />

          {!ticker.isActive ? (
            <CollapsibleSection
              title="News coverage"
              meta={<span className="text-indigo-300">tracked · not in watchlist</span>}
              defaultOpen
              tone="dashed"
            >
              <p className="text-[13px] text-zinc-400 leading-snug">
                {ticker.symbol} is tracked for quotes and value-chain context, but no news
                feeds are ingested until it's added to your watchlist.
              </p>
              <button
                onClick={onActivate}
                className="mt-4 px-3 h-9 rounded-full bg-indigo-500/15 text-indigo-200 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25 transition-colors"
              >
                + Add {ticker.symbol} to watchlist
              </button>
            </CollapsibleSection>
          ) : (
            <CollapsibleSection title="Latest coverage" meta={String(articles.length)} defaultOpen>
            {loadingArticles ? (
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-600 py-10 text-center">
                Searching feeds…
              </div>
            ) : articles.length === 0 ? (
              <div className="text-sm text-zinc-500 py-10 text-center">
                No recent articles mention {ticker.symbol}. Check back after the next poll.
              </div>
            ) : (
              <div className="space-y-6">
                {grouped.length > 1 && (
                  <CoverageDateRail
                    groups={grouped.map((g) => ({
                      key: g.key,
                      label: g.label,
                      count: g.items.length
                    }))}
                  />
                )}
                {grouped.map((g) => (
                  <div key={g.key} id={`coverage-${g.key}`} className="scroll-mt-20">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                        {g.label}
                      </h3>
                      <span className="h-px flex-1 bg-edge/50" />
                      <span className="text-[10px] tabular-nums text-zinc-600">
                        {g.items.length}
                      </span>
                    </div>
                    <ul className="divide-y divide-edge/40 rounded-lg border border-edge/60 bg-surface-1 overflow-hidden">
                      {g.items.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => onOpenArticle(a.id)}
                            className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
                          >
                            <FeedSource article={a} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-[0.16em] truncate ${
                                    a.domain === 'finance' ? 'text-amber-400' : 'text-blue-400'
                                  }`}
                                >
                                  {a.feedTitle}
                                </span>
                                <UrgencyBadge article={a} />
                                <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-zinc-500 shrink-0">
                                  {formatRelativeTime(a.publishedAt)}
                                </span>
                              </div>
                              <div className="text-[13.5px] leading-snug text-zinc-100 font-medium line-clamp-2">
                                {a.title}
                              </div>
                              {a.summary && (
                                <div className="text-[12px] leading-snug text-zinc-500 mt-1 line-clamp-2">
                                  {a.summary}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            </CollapsibleSection>
          )}
        </div>
      </div>
      {diagramSymbol && (
        <ValueChainDiagram
          initialSymbol={diagramSymbol}
          tickers={tickers}
          quotes={quote ? [quote] : []}
          onClose={() => setDiagramSymbol(null)}
          onOpenTicker={(id) => {
            setDiagramSymbol(null)
            onOpenTicker(id)
          }}
          onActivateTicker={(id) => {
            void window.api.tickers.activate(id)
          }}
          onOpenURL={onOpenURL}
        />
      )}
    </div>
  )
}

function appendLiveQuote(
  history: HistoryPoint[],
  range: HistoryRange,
  quote: StockQuote | undefined
): HistoryPoint[] {
  if (history.length === 0) return []
  // Extend the chart with whichever session is live — post-market overlay
  // during 4-8pm ET, pre-market during 4-9:30am ET, regular otherwise — so
  // the chart's right edge matches the headline price instead of stopping
  // at yesterday's close.
  const price = quote ? resolveDisplayQuote(quote).price : null
  if (price === null || price === undefined) return history
  const last = history[history.length - 1]
  // For intraday ranges, Yahoo's last candle is usually the most recent 5/30m bar —
  // append live price only if it's newer. For daily+, replace last point if same day.
  const isIntraday = range === '1D' || range === '5D' || range === '1W'
  const sameDay = new Date(last.t).toDateString() === new Date().toDateString()
  if (isIntraday && sameDay) {
    return [...history, { t: Date.now(), v: price }]
  }
  if (sameDay) {
    return [...history.slice(0, -1), { t: Date.now(), v: price }]
  }
  return [...history, { t: Date.now(), v: price }]
}

function computeRangeDelta(
  points: HistoryPoint[],
  range: HistoryRange
): {
  delta: number | null
  deltaPct: number | null
  from: string | null
  to: string | null
} {
  if (points.length < 2) return { delta: null, deltaPct: null, from: null, to: null }
  const first = points[0]
  const last = points[points.length - 1]
  const delta = last.v - first.v
  const deltaPct = first.v !== 0 ? (delta / first.v) * 100 : null
  const intraday = range === '1D'
  return {
    delta,
    deltaPct,
    from: formatPointLabel(first.t, intraday),
    to: formatPointLabel(last.t, intraday)
  }
}

function formatPointLabel(ts: number, intraday: boolean): string {
  const d = new Date(ts)
  if (intraday) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function StockChart({
  points,
  color
}: {
  points: HistoryPoint[]
  color: string
}): JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const width = 1100
  const height = 260
  const padX = 12
  const padY = 18
  // Path + coords are O(N) in points; mousemove updates `hoverIdx` only, so
  // recomputing on every hover is pure waste. Memo on `points` identity.
  const { coords, linePath, areaPath, xStep } = useMemo(() => {
    if (points.length === 0) {
      return { coords: [] as { x: number; y: number }[], linePath: '', areaPath: '', xStep: 0 }
    }
    let minV = Infinity
    let maxV = -Infinity
    for (const p of points) {
      if (p.v < minV) minV = p.v
      if (p.v > maxV) maxV = p.v
    }
    const range = maxV - minV || 1
    const step = (width - padX * 2) / Math.max(points.length - 1, 1)
    const cs = points.map((p, i) => ({
      x: padX + i * step,
      y: padY + (1 - (p.v - minV) / range) * (height - padY * 2)
    }))
    const line = cs
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
      .join(' ')
    const area = `${line} L${cs[cs.length - 1].x.toFixed(2)},${height - padY} L${cs[0].x.toFixed(2)},${height - padY} Z`
    return { coords: cs, linePath: line, areaPath: area, xStep: step }
  }, [points])

  const gradId = useMemo(() => `chart-grad-${Math.round(Math.random() * 1e6)}`, [])

  const handleMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * width
    const rawIdx = Math.round((relX - padX) / xStep)
    const idx = Math.max(0, Math.min(points.length - 1, rawIdx))
    setHoverIdx(idx)
  }

  const handleLeave = (): void => setHoverIdx(null)

  const activePoint = hoverIdx !== null ? points[hoverIdx] : null
  const activeCoord = hoverIdx !== null ? coords[hoverIdx] : null
  const dateIsIntraday = activePoint
    ? new Date(activePoint.t).toDateString() === new Date().toDateString() &&
      points.length > 0 &&
      points[points.length - 1].t - points[0].t < 3 * 24 * 60 * 60 * 1000
    : false
  const dateLabel = activePoint
    ? new Date(activePoint.t).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...(dateIsIntraday ? { hour: 'numeric', minute: '2-digit' } : {})
      })
    : ''
  const priceLabel = activePoint ? `$${activePoint.v.toFixed(2)}` : ''

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-64 cursor-crosshair"
      role="img"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#27272a" strokeWidth="1" strokeDasharray="2 4" />
      <line
        x1={padX}
        y1={height / 2}
        x2={width - padX}
        y2={height / 2}
        stroke="#27272a"
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      <line
        x1={padX}
        y1={height - padY}
        x2={width - padX}
        y2={height - padY}
        stroke="#27272a"
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r="3.5"
        fill={color}
      />
      {activeCoord && activePoint && (
        <g pointerEvents="none">
          <line
            x1={activeCoord.x}
            y1={padY}
            x2={activeCoord.x}
            y2={height - padY}
            stroke="#71717a"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <circle cx={activeCoord.x} cy={activeCoord.y} r="4" fill={color} />
          <circle
            cx={activeCoord.x}
            cy={activeCoord.y}
            r="6"
            fill="none"
            stroke={color}
            strokeOpacity="0.35"
            strokeWidth="2"
          />
          {/* Date label along the top edge */}
          {(() => {
            const labelW = Math.max(90, dateLabel.length * 6.5)
            const labelH = 18
            const lx = Math.min(
              Math.max(activeCoord.x - labelW / 2, padX),
              width - padX - labelW
            )
            return (
              <g>
                <rect
                  x={lx}
                  y={2}
                  width={labelW}
                  height={labelH}
                  rx={3}
                  fill="#18181b"
                  stroke="#3f3f46"
                  strokeWidth="1"
                />
                <text
                  x={lx + labelW / 2}
                  y={15}
                  textAnchor="middle"
                  fontSize="11"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fill="#d4d4d8"
                >
                  {dateLabel}
                </text>
              </g>
            )
          })()}
          {/* Price label anchored at the intersection point */}
          {(() => {
            const labelW = 62
            const labelH = 18
            const flipRight = activeCoord.x + 10 + labelW > width - padX
            const lx = flipRight ? activeCoord.x - 10 - labelW : activeCoord.x + 10
            const ly = Math.min(
              Math.max(activeCoord.y - labelH / 2, padY),
              height - padY - labelH
            )
            return (
              <g>
                <rect
                  x={lx}
                  y={ly}
                  width={labelW}
                  height={labelH}
                  rx={3}
                  fill={color}
                  fillOpacity="0.18"
                  stroke={color}
                  strokeWidth="1"
                />
                <text
                  x={lx + labelW / 2}
                  y={ly + 13}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fill="#fafafa"
                >
                  {priceLabel}
                </text>
              </g>
            )
          })()}
        </g>
      )}
    </svg>
  )
}

function groupArticlesByDay(articles: Article[]): { key: string; label: string; items: Article[] }[] {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const bucketByKey = new Map<string, { key: string; label: string; items: Article[] }>()
  for (const a of articles) {
    const ts = a.publishedAt ?? 0
    let key: string
    let label: string
    if (ts >= startOfDay) {
      key = 'today'
      label = 'Today'
    } else if (ts >= startOfDay - 86_400_000) {
      key = 'yesterday'
      label = 'Yesterday'
    } else if (ts > 0) {
      const d = new Date(ts)
      key = d.toISOString().slice(0, 10)
      label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    } else {
      key = 'older'
      label = 'Undated'
    }
    const bucket = bucketByKey.get(key) ?? { key, label, items: [] }
    bucket.items.push(a)
    bucketByKey.set(key, bucket)
  }
  // Sort each bucket: urgency desc, then recency desc. Buckets themselves: most recent date first.
  const groups = Array.from(bucketByKey.values()).map((g) => ({
    ...g,
    items: [...g.items].sort((a, b) => {
      const ua = a.urgencyScore ?? 0
      const ub = b.urgencyScore ?? 0
      if (ub !== ua) return ub - ua
      return (b.publishedAt ?? 0) - (a.publishedAt ?? 0)
    })
  }))
  const nowMs = Date.now()
  const bucketTs = (k: string): number => {
    if (k === 'today') return nowMs
    if (k === 'yesterday') return nowMs - 86_400_000
    if (k === 'older') return -Infinity
    return Date.parse(k) || 0
  }
  groups.sort((a, b) => bucketTs(b.key) - bucketTs(a.key))
  return groups
}

function formatRelativeTime(ts: number | null): string {
  if (!ts) return '—'
  const diff = Date.now() - ts
  const min = 60_000
  const hr = 60 * min
  const day = 24 * hr
  if (diff < min) return 'just now'
  if (diff < hr) return `${Math.floor(diff / min)}m ago`
  if (diff < day) return `${Math.floor(diff / hr)}h ago`
  return `${Math.floor(diff / day)}d ago`
}

// ---------- Sports ----------

function SportsPage({
  onClose,
  initialGame,
  onOpenURL
}: {
  onClose: () => void
  initialGame?: Game | null
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
}): JSX.Element {
  const [leagues, setLeagues] = useState<SportsLeague[]>([])
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [favoriteTeams, setFavoriteTeams] = useState<FavoriteTeam[]>([])
  const [leagueLeaders, setLeagueLeaders] = useState<StatCategory[]>([])
  const [playoffLeaders, setPlayoffLeaders] = useState<StatCategory[]>([])
  const [teamLeaders, setTeamLeaders] = useState<StatCategory[]>([])
  const [leadersLoading, setLeadersLoading] = useState(false)
  const [teamLeadersLoading, setTeamLeadersLoading] = useState(false)
  const [scope, setScope] = useState<'recent' | 'season'>('recent')
  const [seasonLabel, setSeasonLabel] = useState<string | null>(null)
  const [favoriteAthletes, setFavoriteAthletes] = useState<FavoriteAthlete[]>([])
  // NCAA conference filter — only used when active league is ncaaf or
  // ncaam. null = "All conferences"; otherwise a specific group id
  // that gets passed to ESPN's scoreboard via &groups=.
  const [ncaaConferences, setNcaaConferences] = useState<NcaaConference[]>([])
  const [activeConferenceId, setActiveConferenceId] = useState<string | null>(null)
  const isNcaaLeague = activeLeagueId === 'ncaaf' || activeLeagueId === 'ncaam'

  useEffect(() => {
    void window.api.favoriteAthletes.list().then(setFavoriteAthletes)
  }, [])

  const favoriteAthleteByKey = useMemo(() => {
    const map = new Map<string, FavoriteAthlete>()
    for (const fav of favoriteAthletes) map.set(`${fav.leagueId}:${fav.athleteId}`, fav)
    return map
  }, [favoriteAthletes])

  const toggleFavoriteAthlete = async (leagueId: string, leader: StatLeader): Promise<void> => {
    if (!leader.athleteId) return
    const key = `${leagueId}:${leader.athleteId}`
    const existing = favoriteAthleteByKey.get(key)
    if (existing) {
      await window.api.favoriteAthletes.delete(existing.id)
    } else {
      await window.api.favoriteAthletes.add({
        leagueId,
        athleteId: leader.athleteId,
        athleteName: leader.athleteName,
        teamId: leader.teamId,
        teamAbbreviation: leader.teamAbbreviation,
        headshotURL: leader.headshotURL
      })
    }
    const fresh = await window.api.favoriteAthletes.list()
    setFavoriteAthletes(fresh)
  }

  useEffect(() => {
    void window.api.favoriteTeams.list().then(setFavoriteTeams)
  }, [])

  const favoriteForLeague = useMemo(
    () => favoriteTeams.find((f) => f.leagueId === activeLeagueId) ?? null,
    [favoriteTeams, activeLeagueId]
  )

  const activeLeagueObj = leagues.find((l) => l.id === activeLeagueId) ?? null
  const isPlayoffs = activeLeagueObj?.inPlayoffs ?? false

  useEffect(() => {
    if (!activeLeagueId) return
    let cancelled = false
    setLeagueLeaders([])
    setPlayoffLeaders([])
    setLeadersLoading(true)
    // Always pull regular-season leaders. When the league is in
    // playoff window, fetch postseason leaders in parallel so the
    // Playoffs box can show alongside Regular Season.
    const tasks: Promise<unknown>[] = [
      window.api.sports
        .listLeagueLeaders(activeLeagueId, 'regular')
        .then((data) => {
          if (!cancelled) setLeagueLeaders(data)
        })
        .catch(() => {
          if (!cancelled) setLeagueLeaders([])
        })
    ]
    if (isPlayoffs) {
      tasks.push(
        window.api.sports
          .listLeagueLeaders(activeLeagueId, 'postseason')
          .then((data) => {
            if (!cancelled) setPlayoffLeaders(data)
          })
          .catch(() => {
            if (!cancelled) setPlayoffLeaders([])
          })
      )
    }
    void Promise.all(tasks).finally(() => {
      if (!cancelled) setLeadersLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [activeLeagueId, isPlayoffs])

  useEffect(() => {
    if (!activeLeagueId || !favoriteForLeague) {
      setTeamLeaders([])
      return
    }
    let cancelled = false
    setTeamLeaders([])
    setTeamLeadersLoading(true)
    void window.api.sports
      .listTeamLeaders(activeLeagueId, favoriteForLeague.teamId)
      .then((data) => {
        if (!cancelled) setTeamLeaders(data)
      })
      .catch(() => {
        if (!cancelled) setTeamLeaders([])
      })
      .finally(() => {
        if (!cancelled) setTeamLeadersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeLeagueId, favoriteForLeague])

  useEffect(() => {
    void window.api.sports.listLeagues().then((ls) => {
      setLeagues(ls)
      if (ls.length > 0) {
        // If the user clicked into a specific game, that league wins.
        if (initialGame?.leagueId) {
          setActiveLeagueId(initialGame.leagueId)
          return
        }
        // Otherwise pick the highest-priority league that's currently
        // in season. Priority order requested by user:
        //   NFL > NBA > CFB > MLB > UCL > EPL > SerieA > La Liga > CBB > MLS
        // NHL isn't in the user's list — fall back to it before the
        // first-list-entry catchall so an October NHL fan doesn't
        // land on a league not in session.
        const PRIORITY = [
          'nfl',
          'nba',
          'ncaaf',
          'mlb',
          'ucl',
          'epl',
          'seriea',
          'laliga',
          'ncaam',
          'mls',
          'nhl'
        ]
        const firstActive = PRIORITY.map((id) => ls.find((l) => l.id === id)).find(
          (l) => l && l.inSeason
        )
        setActiveLeagueId(firstActive?.id ?? ls[0].id)
      }
    })
  }, [initialGame])

  useEffect(() => {
    if (!initialGame) return
    setSelectedGame(initialGame)
    setSelectedDateKey(dateKey(new Date(initialGame.date)))
  }, [initialGame])

  // Recent-scope polling is adaptive: fast while games are in progress, slow
  // otherwise, fully paused when the window is hidden. Season data is historical,
  // so we don't poll it at all.
  const anyLive = games.some((g) => g.status === 'in_progress')
  const recentInterval = useAdaptiveInterval({
    anyLive,
    liveMs: 8_000,
    idleMs: 30_000,
    hiddenMs: null
  })
  // Reset once per league/scope switch. Keeping this separate from the polling
  // effect matters — the polling effect's deps include `recentInterval`, which
  // depends on `anyLive`, which depends on `games`. If we cleared games inside
  // the polling effect, each live↔idle transition would re-clear games and
  // bounce the interval back, creating a render loop.
  useEffect(() => {
    setGames([])
    setSeasonLabel(null)
    setLoading(true)
    // Reset the conference filter when leaving an NCAA league or
    // switching between ncaaf/ncaam (their conference IDs are
    // different namespaces, so a stale id would 0-match).
    if (!isNcaaLeague) setActiveConferenceId(null)
  }, [activeLeagueId, scope, isNcaaLeague])
  // Fetch NCAA conferences when an NCAA league becomes active.
  useEffect(() => {
    if (!isNcaaLeague || !activeLeagueId) {
      setNcaaConferences([])
      return
    }
    let cancelled = false
    void window.api.sports.listNcaaConferences(activeLeagueId).then((cs) => {
      if (!cancelled) setNcaaConferences(cs)
    })
    return (): void => {
      cancelled = true
    }
  }, [activeLeagueId, isNcaaLeague])
  useEffect(() => {
    if (!activeLeagueId) return
    let cancelled = false
    const pull = async (): Promise<void> => {
      if (scope === 'season') {
        const res = await window.api.sports.listSeasonGames(activeLeagueId)
        if (cancelled) return
        setGames(res.games)
        setSeasonLabel(res.range?.label ?? null)
      } else {
        const g = await window.api.sports.listGames(activeLeagueId, activeConferenceId)
        if (cancelled) return
        setGames(g)
      }
      setLoading(false)
    }
    void pull()
    if (scope !== 'recent' || recentInterval === null) {
      return () => {
        cancelled = true
      }
    }
    const t = setInterval(() => void pull(), recentInterval)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [activeLeagueId, scope, recentInterval, activeConferenceId])

  const dateGroups = useMemo(() => groupGamesByDate(games), [games])

  useEffect(() => {
    if (dateGroups.length === 0) {
      setSelectedDateKey(null)
      return
    }
    if (selectedDateKey && dateGroups.some((g) => g.key === selectedDateKey)) return
    const today = dateKey(new Date())
    const hasLiveToday = dateGroups.some(
      (g) => g.key === today && g.games.some((x) => x.status === 'in_progress')
    )
    if (hasLiveToday) {
      setSelectedDateKey(today)
      return
    }
    const liveGroup = dateGroups.find((g) => g.games.some((x) => x.status === 'in_progress'))
    if (liveGroup) {
      setSelectedDateKey(liveGroup.key)
      return
    }
    if (dateGroups.some((g) => g.key === today)) {
      setSelectedDateKey(today)
      return
    }
    const upcoming = dateGroups.find((g) => g.key > today)
    setSelectedDateKey((upcoming ?? dateGroups[dateGroups.length - 1]).key)
  }, [dateGroups, selectedDateKey])

  const refresh = async (): Promise<void> => {
    if (!activeLeagueId) return
    setLoading(true)
    try {
      if (scope === 'season') {
        const res = await window.api.sports.listSeasonGames(activeLeagueId)
        setGames(res.games)
        setSeasonLabel(res.range?.label ?? null)
      } else {
        const g = await window.api.sports.listGames(activeLeagueId, activeConferenceId)
        setGames(g)
      }
    } finally {
      setLoading(false)
    }
  }

  const liveCount = games.filter((g) => g.status === 'in_progress').length
  const selectedGroup = dateGroups.find((g) => g.key === selectedDateKey) ?? null
  const sortedGames = selectedGroup ? sortGamesForDate(selectedGroup.games) : []
  const activeLeague = leagues.find((l) => l.id === activeLeagueId) ?? null
  const lookupContext = activeLeague
    ? `${activeLeague.name} ${activeLeague.sport} league — page lists teams, players, coaches, and games.`
    : 'Professional sports league page — teams, players, coaches, and games.'

  return (
    <section
      className="h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden"
      data-lookup-context={lookupContext}
    >
      <header className="px-6 pt-6 pb-4 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400/90 mb-1.5">
            Live scores via ESPN
          </div>
          <h1 className="text-[28px] leading-none font-bold text-zinc-50 tracking-tight">Sports</h1>
          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {games.length} games ·{' '}
            {scope === 'season'
              ? seasonLabel
                ? `${seasonLabel} season`
                : 'Full season'
              : '±21 day window'}
          </div>
        </div>
        <div className="flex items-center gap-5 text-[11px] uppercase tracking-wider">
          <Stat label="Live" value={liveCount} tone={liveCount > 0 ? 'urgent' : 'muted'} />
          <Stat label="Days" value={dateGroups.length} tone="accent" />
          <div className="flex items-center rounded-full bg-surface-2 p-0.5 ring-1 ring-inset ring-edge">
            {(['recent', 'season'] as const).map((s) => {
              const active = scope === s
              return (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${
                    active
                      ? 'bg-orange-500/20 text-orange-200'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {s === 'recent' ? 'Recent' : 'Season'}
                </button>
              )
            })}
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 rounded-full bg-orange-500/15 text-orange-300 ring-1 ring-inset ring-orange-500/30 text-[10px] font-semibold uppercase tracking-[0.18em] hover:bg-orange-500/25 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
          >
            Close
          </button>
        </div>
      </header>
      <div className="px-6 pb-3 flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-edge">
        {leagues.map((l) => {
          const active = l.id === activeLeagueId
          return (
            <button
              key={l.id}
              onClick={() => setActiveLeagueId(l.id)}
              className={`shrink-0 px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors relative inline-flex items-center gap-1.5 ${
                active ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <span>{l.shortName}</span>
              {l.inPlayoffs && (
                // Compact orange dot + pill so the indicator scales
                // with the tab strip; full "Playoffs" word would
                // crowd the row at small widths.
                <span
                  title="Playoffs in progress"
                  className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded-full bg-orange-500/15 ring-1 ring-inset ring-orange-500/40 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-orange-300"
                >
                  <span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse" />
                  Playoffs
                </span>
              )}
              {active && (
                <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-orange-400 rounded-full" />
              )}
            </button>
          )
        })}
      </div>
      {/* NCAA conference filter — only visible for college leagues, and
          only when the conference list has loaded. "All" is the default
          and clears the filter. Hidden in season scope because ESPN's
          season endpoint already returns the full league. */}
      {isNcaaLeague && scope === 'recent' && ncaaConferences.length > 0 && (
        <div className="px-6 py-2 flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-edge bg-surface-1/40">
          <button
            onClick={() => setActiveConferenceId(null)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
              activeConferenceId === null
                ? 'bg-orange-500/20 text-orange-200'
                : 'text-zinc-500 hover:text-zinc-100 hover:bg-surface-2'
            }`}
          >
            All
          </button>
          {ncaaConferences.map((c) => {
            const active = c.id === activeConferenceId
            return (
              <button
                key={c.id}
                onClick={() => setActiveConferenceId(c.id)}
                title={c.name}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                  active
                    ? 'bg-orange-500/20 text-orange-200'
                    : 'text-zinc-500 hover:text-zinc-100 hover:bg-surface-2'
                }`}
              >
                {c.shortName}
              </button>
            )
          })}
        </div>
      )}
      {dateGroups.length > 0 && (
        <DateRail
          groups={dateGroups}
          selectedKey={selectedDateKey}
          onSelect={(k) => setSelectedDateKey(k)}
        />
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && games.length === 0 ? (
          <div className="px-6 py-20 text-center text-sm text-zinc-500">Loading scoreboard…</div>
        ) : games.length === 0 ? (
          <div className="px-6 py-20 text-center text-sm text-zinc-500">
            {scope === 'season'
              ? 'No games found for this season.'
              : 'No games scheduled in the current window.'}
          </div>
        ) : !selectedGroup ? (
          <div className="px-6 py-20 text-center text-sm text-zinc-500">
            Select a date above.
          </div>
        ) : (
          <section className="px-6 pt-4 pb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                {dateLongLabel(selectedGroup.key)}
              </h2>
              <span className="h-px flex-1 bg-edge/80" />
              <span className="text-[10px] tabular-nums text-zinc-500">{sortedGames.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
              {sortedGames.map((g) => (
                <GameCard
                  key={g.id}
                  game={g}
                  sport={activeLeague?.sport ?? ''}
                  onOpen={() => setSelectedGame(g)}
                />
              ))}
            </div>
            {isPlayoffs ? (
              <>
                <LeagueLeadersSection
                  leagueShort={activeLeagueObj?.shortName ?? ''}
                  categories={playoffLeaders}
                  loading={leadersLoading}
                  leagueId={activeLeagueId}
                  segment="playoffs"
                  segmentTone="orange"
                  isFavorite={(id) =>
                    favoriteAthleteByKey.has(`${activeLeagueId}:${id}`)
                  }
                  onToggleFavorite={(leader) =>
                    activeLeagueId && void toggleFavoriteAthlete(activeLeagueId, leader)
                  }
                />
                <LeagueLeadersSection
                  leagueShort={activeLeagueObj?.shortName ?? ''}
                  categories={leagueLeaders}
                  loading={leadersLoading}
                  leagueId={activeLeagueId}
                  segment="regular"
                  segmentTone="sky"
                  isFavorite={(id) =>
                    favoriteAthleteByKey.has(`${activeLeagueId}:${id}`)
                  }
                  onToggleFavorite={(leader) =>
                    activeLeagueId && void toggleFavoriteAthlete(activeLeagueId, leader)
                  }
                />
              </>
            ) : (
              <LeagueLeadersSection
                leagueShort={activeLeagueObj?.shortName ?? ''}
                categories={leagueLeaders}
                loading={leadersLoading}
                leagueId={activeLeagueId}
                isFavorite={(id) =>
                  favoriteAthleteByKey.has(`${activeLeagueId}:${id}`)
                }
                onToggleFavorite={(leader) =>
                  activeLeagueId && void toggleFavoriteAthlete(activeLeagueId, leader)
                }
              />
            )}
            <TeamLeadersSection
              favorite={favoriteForLeague}
              categories={teamLeaders}
              loading={teamLeadersLoading}
              leagueId={activeLeagueId}
              isFavorite={(id) => favoriteAthleteByKey.has(`${activeLeagueId}:${id}`)}
              onToggleFavorite={(leader) =>
                activeLeagueId && void toggleFavoriteAthlete(activeLeagueId, leader)
              }
            />
            <SavedPlayersSection
              leagueId={activeLeagueId}
              athletes={favoriteAthletes.filter((a) => a.leagueId === activeLeagueId)}
              onRemove={async (id) => {
                await window.api.favoriteAthletes.delete(id)
                const fresh = await window.api.favoriteAthletes.list()
                setFavoriteAthletes(fresh)
              }}
            />
          </section>
        )}
      </div>
      {selectedGame && (
        <GameDetailOverlay
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
          onOpenURL={onOpenURL}
        />
      )}
    </section>
  )
}

function LeagueLeadersSection({
  leagueShort,
  leagueId,
  categories,
  loading,
  isFavorite,
  onToggleFavorite,
  // When non-null, prepends a label tag (e.g. "Playoffs",
  // "Regular Season") to the heading and uses a separate
  // collapse-state key so each segment remembers its own toggle.
  segment,
  segmentTone
}: {
  leagueShort: string
  categories: StatCategory[]
  loading: boolean
  leagueId: string | null
  isFavorite: (athleteId: string) => boolean
  onToggleFavorite: (leader: StatLeader) => void
  segment?: 'playoffs' | 'regular' | null
  segmentTone?: 'orange' | 'sky'
}): JSX.Element | null {
  // Collapse key is per-league + per-segment so a user's choice on
  // (NBA Playoffs, collapsed) doesn't bleed into (NBA Regular,
  // expanded). When no segment is passed we still collapse-key per
  // league so the choice persists across visits.
  const collapseKey = `leagueLeaders:${leagueId ?? 'unknown'}:${segment ?? 'all'}`
  // Default open for playoffs (that's the new/notable view), closed
  // for regular when segmented (avoids two long lists pre-expanded).
  const defaultCollapsed = segment === 'regular'
  const [collapsed, setCollapsed] = useCollapsedSection(collapseKey, defaultCollapsed)
  if (!loading && categories.length === 0) return null
  const tint = segmentTone ?? 'orange'
  const baseTitle = leagueShort
    ? `${leagueShort} Statistical Leaders`
    : 'Statistical Leaders'
  const title =
    segment === 'playoffs'
      ? `${baseTitle} — Playoffs`
      : segment === 'regular'
        ? `${baseTitle} — Regular Season`
        : baseTitle
  return (
    <section className="mt-10">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-3 mb-3 group"
      >
        {segment === 'playoffs' && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-500/10 ring-1 ring-inset ring-orange-500/30 text-[9px] font-semibold uppercase tracking-[0.18em] text-orange-300">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            Playoffs
          </span>
        )}
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 group-hover:text-zinc-200 transition-colors">
          {title}
        </h2>
        <span className="h-px flex-1 bg-edge/80" />
        <span className="text-[10px] tabular-nums text-zinc-500">{categories.length}</span>
        <CollapseChevron open={!collapsed} />
      </button>
      {!collapsed &&
        (loading ? (
          <div className="py-8 text-center text-[12px] text-zinc-500">Loading leaders…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {categories.map((cat) => (
              <LeaderCategoryCard
                key={cat.key}
                category={cat}
                tint={tint}
                isFavorite={isFavorite}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        ))}
    </section>
  )
}

function TeamLeadersSection({
  favorite,
  categories,
  loading,
  isFavorite,
  onToggleFavorite
}: {
  favorite: FavoriteTeam | null
  categories: StatCategory[]
  loading: boolean
  leagueId: string | null
  isFavorite: (athleteId: string) => boolean
  onToggleFavorite: (leader: StatLeader) => void
}): JSX.Element | null {
  if (!favorite) {
    return (
      <section className="mt-10">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            Favorite Team Leaders
          </h2>
          <span className="h-px flex-1 bg-edge/80" />
        </div>
        <div className="py-6 text-center text-[12px] text-zinc-500">
          Add a favorite team for this league in Settings → Sports to see per-player leaders.
        </div>
      </section>
    )
  }
  return (
    <section className="mt-10 pb-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          {favorite.logoURL && (
            <img src={favorite.logoURL} alt="" className="w-5 h-5 rounded-full" />
          )}
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-300">
            {favorite.teamName} Leaders
          </h2>
        </div>
        <span className="h-px flex-1 bg-edge/80" />
        <span className="text-[10px] tabular-nums text-zinc-500">{categories.length}</span>
      </div>
      {loading ? (
        <div className="py-8 text-center text-[12px] text-zinc-500">Loading team leaders…</div>
      ) : categories.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-zinc-500">
          ESPN did not return per-player leaders for this team.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {categories.map((cat) => (
            <LeaderCategoryCard
              key={cat.key}
              category={cat}
              tint="sky"
              isFavorite={isFavorite}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function SavedPlayersSection({
  leagueId,
  athletes,
  onRemove
}: {
  leagueId: string | null
  athletes: FavoriteAthlete[]
  onRemove: (id: number) => void | Promise<void>
}): JSX.Element | null {
  if (!leagueId || athletes.length === 0) return null
  return (
    <section className="mt-10 pb-6">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300">
          Saved players
        </h2>
        <span className="h-px flex-1 bg-edge/80" />
        <span className="text-[10px] tabular-nums text-zinc-500">{athletes.length}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {athletes.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface-1/60 border border-edge"
          >
            {a.headshotURL ? (
              <img
                src={a.headshotURL}
                alt=""
                className="w-8 h-8 rounded-full object-cover bg-surface-2"
              />
            ) : (
              <span className="w-8 h-8 rounded-full bg-surface-2" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-zinc-100 truncate">{a.athleteName}</div>
              {a.teamAbbreviation && (
                <div className="text-[10px] text-zinc-500 tabular-nums">{a.teamAbbreviation}</div>
              )}
            </div>
            <button
              onClick={() => void onRemove(a.id)}
              className="text-zinc-500 hover:text-red-300 text-[11px] font-semibold uppercase tracking-[0.18em]"
              aria-label="Remove saved player"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function LeaderCategoryCard({
  category,
  tint,
  isFavorite,
  onToggleFavorite
}: {
  category: StatCategory
  tint: 'orange' | 'sky'
  isFavorite?: (athleteId: string) => boolean
  onToggleFavorite?: (leader: StatLeader) => void
}): JSX.Element {
  const accent = tint === 'orange' ? 'text-orange-300' : 'text-sky-300'
  return (
    <div className="rounded-lg border border-edge bg-surface-1/60 px-4 py-3">
      <div
        className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${accent} mb-2`}
      >
        {category.name}
      </div>
      <ol className="space-y-1.5">
        {category.leaders.map((ldr, i) => (
          <LeaderRow
            key={`${ldr.athleteId || ldr.athleteName}-${i}`}
            rank={i + 1}
            leader={ldr}
            favorited={isFavorite ? Boolean(ldr.athleteId) && isFavorite(ldr.athleteId) : false}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </ol>
    </div>
  )
}

function LeaderRow({
  rank,
  leader,
  favorited,
  onToggleFavorite
}: {
  rank: number
  leader: StatLeader
  favorited?: boolean
  onToggleFavorite?: (leader: StatLeader) => void
}): JSX.Element {
  const canFavorite = Boolean(leader.athleteId) && Boolean(onToggleFavorite)
  return (
    <li className="group flex items-center gap-2 text-[12px]">
      <span className="w-4 tabular-nums text-[10px] text-zinc-500">{rank}</span>
      {leader.headshotURL ? (
        <img
          src={leader.headshotURL}
          alt=""
          className="w-6 h-6 rounded-full object-cover bg-surface-2"
        />
      ) : (
        <span className="w-6 h-6 rounded-full bg-surface-2" />
      )}
      <span className="flex-1 min-w-0 truncate text-zinc-200">{leader.athleteName}</span>
      {leader.teamAbbreviation && (
        <span className="text-[10px] tabular-nums text-zinc-500">{leader.teamAbbreviation}</span>
      )}
      <span className="tabular-nums font-semibold text-zinc-100">{leader.value}</span>
      {canFavorite && (
        <button
          onClick={() => onToggleFavorite?.(leader)}
          className={`text-[12px] leading-none transition-opacity ${
            favorited
              ? 'text-amber-300 opacity-100'
              : 'text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-amber-300'
          }`}
          aria-label={favorited ? 'Unsave player' : 'Save player'}
          title={favorited ? 'Unsave player' : 'Save player'}
        >
          {favorited ? '★' : '☆'}
        </button>
      )}
    </li>
  )
}

interface GameDateGroup {
  key: string // YYYY-MM-DD in local time
  ts: number // millis at local midnight
  games: Game[]
}

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

function groupGamesByDate(games: Game[]): GameDateGroup[] {
  const map = new Map<string, GameDateGroup>()
  for (const g of games) {
    if (!g.date) continue
    const d = new Date(g.date)
    const key = dateKey(d)
    let group = map.get(key)
    if (!group) {
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      group = { key, ts: midnight, games: [] }
      map.set(key, group)
    }
    group.games.push(g)
  }
  return Array.from(map.values()).sort((a, b) => a.ts - b.ts)
}

function sortGamesForDate(games: Game[]): Game[] {
  const order: Record<Game['status'], number> = {
    in_progress: 0,
    scheduled: 1,
    postponed: 2,
    final: 3,
    canceled: 4
  }
  return [...games].sort((a, b) => {
    const ord = order[a.status] - order[b.status]
    if (ord !== 0) return ord
    return a.date - b.date
  })
}

function dateShortLabel(key: string, todayKey: string): { primary: string; sub: string } {
  if (key === todayKey) {
    const d = parseDateKey(key)
    return { primary: 'Today', sub: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
  }
  const d = parseDateKey(key)
  const todayD = parseDateKey(todayKey)
  const diffDays = Math.round((d.getTime() - todayD.getTime()) / 86_400_000)
  if (diffDays === 1) return { primary: 'Tomorrow', sub: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
  if (diffDays === -1) return { primary: 'Yesterday', sub: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
  return {
    primary: d.toLocaleDateString(undefined, { weekday: 'short' }),
    sub: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
}

function dateLongLabel(key: string): string {
  const d = parseDateKey(key)
  const today = dateKey(new Date())
  if (key === today) return `Today · ${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map((s) => parseInt(s, 10))
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function DateRail({
  groups,
  selectedKey,
  onSelect
}: {
  groups: GameDateGroup[]
  selectedKey: string | null
  onSelect: (key: string) => void
}): JSX.Element {
  const railRef = useRef<HTMLDivElement | null>(null)
  const todayKey = dateKey(new Date())

  useEffect(() => {
    if (!railRef.current || !selectedKey) return
    const el = railRef.current.querySelector<HTMLElement>(`[data-date-key="${selectedKey}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selectedKey])

  return (
    <div
      ref={railRef}
      className="px-6 py-3 flex items-stretch gap-1.5 overflow-x-auto scrollbar-none border-b border-edge"
    >
      {groups.map((g) => {
        const active = g.key === selectedKey
        const isToday = g.key === todayKey
        const liveCount = g.games.filter((x) => x.status === 'in_progress').length
        const { primary, sub } = dateShortLabel(g.key, todayKey)
        return (
          <button
            key={g.key}
            data-date-key={g.key}
            onClick={() => onSelect(g.key)}
            className={`shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg text-center transition-colors min-w-[68px] ${
              active
                ? 'bg-orange-500/15 ring-1 ring-inset ring-orange-500/40 text-zinc-50'
                : isToday
                  ? 'text-zinc-200 hover:bg-surface-2 ring-1 ring-inset ring-edge'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 ring-1 ring-inset ring-transparent'
            }`}
          >
            <span className="text-[11px] font-semibold tracking-[0.04em] leading-none">
              {primary}
            </span>
            <span className="text-[10px] uppercase tracking-[0.16em] tabular-nums text-zinc-500 leading-none">
              {sub}
            </span>
            <span className="flex items-center gap-1 mt-0.5 text-[10px] tabular-nums">
              {liveCount > 0 ? (
                <>
                  <span className="relative flex w-1.5 h-1.5">
                    <span className="absolute inset-0 rounded-full opacity-60 animate-ping bg-red-400" />
                    <span className="relative w-1.5 h-1.5 rounded-full bg-red-400" />
                  </span>
                  <span className="text-red-300">{liveCount} live</span>
                </>
              ) : (
                <span className="text-zinc-500">{g.games.length}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function GameCard({
  game,
  sport,
  onOpen
}: {
  game: Game
  sport: string
  onOpen: () => void
}): JSX.Element {
  const isLive = game.status === 'in_progress'
  const isFinal = game.status === 'final'
  const ring = isLive
    ? 'border-red-500/40 hover:border-red-500/60 hover:shadow-[0_8px_24px_rgba(239,68,68,0.15)]'
    : isFinal
      ? 'border-edge/70 hover:border-edge'
      : 'border-edge/70 hover:border-edge'
  const scoreEvent = useScoreEvent(game)
  const showScore = !game.status.startsWith('sched') && game.status !== 'postponed'
  return (
    <button
      onClick={onOpen}
      className={`card-lift relative rounded-xl border bg-surface-1 hover:bg-surface-2 p-5 flex flex-col min-w-0 h-full text-left transition-colors ${ring}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <GameStatusBadge game={game} />
        <span
          className={`text-[10px] uppercase tracking-[0.18em] tabular-nums ${
            isLive ? 'text-red-300 font-semibold' : 'text-zinc-500'
          }`}
        >
          {formatGameTime(game)}
        </span>
      </div>
      {game.series && (
        // Playoff series header. Shows the round title (e.g. "Western
        // Conference Finals" or "World Series") plus a compact win
        // count if ESPN populated the per-team series wins. Tied at
        // 0-0 means the series just started; we still want the title
        // visible so the context is clear.
        <div className="mb-3 px-2 py-1.5 rounded-md bg-orange-500/8 ring-1 ring-inset ring-orange-500/25 flex items-center justify-between gap-2">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-orange-300 truncate">
            {game.series.title ?? game.series.summary ?? 'Playoff Series'}
          </span>
          {(game.series.homeWins > 0 || game.series.awayWins > 0) && (
            <span className="text-[10.5px] font-semibold tabular-nums text-orange-200 shrink-0">
              {game.away.abbreviation} {game.series.awayWins} ·{' '}
              {game.series.homeWins} {game.home.abbreviation}
            </span>
          )}
        </div>
      )}
      <GameTeamRow
        team={game.away}
        winner={game.away.winner === true}
        showScore={showScore}
        flourish={scoreEvent?.side === 'away' ? scoreEvent : null}
        sport={sport}
      />
      <div className="my-2 h-px bg-edge/50" />
      <GameTeamRow
        team={game.home}
        winner={game.home.winner === true}
        showScore={showScore}
        flourish={scoreEvent?.side === 'home' ? scoreEvent : null}
        sport={sport}
      />
      <div className="mt-4 pt-3 border-t border-edge/40 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        <span className="truncate">{game.venue ?? '—'}</span>
        {game.broadcasts.length > 0 && (
          <span className="text-zinc-400 truncate text-right">{game.broadcasts[0]}</span>
        )}
      </div>
    </button>
  )
}

function GameStatusBadge({ game }: { game: Game }): JSX.Element {
  if (game.status === 'in_progress') {
    return (
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15 ring-1 ring-inset ring-red-500/30 text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute inset-0 rounded-full opacity-60 animate-ping bg-red-400" />
          <span className="relative w-1.5 h-1.5 rounded-full bg-red-400" />
        </span>
        Live · {game.statusShort || `Q${game.period ?? ''}`}
      </span>
    )
  }
  if (game.status === 'final') {
    return (
      <span className="px-2 py-0.5 rounded-full bg-zinc-500/15 ring-1 ring-inset ring-zinc-500/30 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300">
        Final
      </span>
    )
  }
  if (game.status === 'postponed') {
    return (
      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 ring-1 ring-inset ring-amber-500/30 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
        Postponed
      </span>
    )
  }
  if (game.status === 'canceled') {
    return (
      <span className="px-2 py-0.5 rounded-full bg-zinc-500/10 ring-1 ring-inset ring-zinc-500/30 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
        Canceled
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded-full bg-blue-500/10 ring-1 ring-inset ring-blue-500/30 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">
      Scheduled
    </span>
  )
}

function GameTeamRow({
  team,
  winner,
  showScore,
  flourish,
  sport
}: {
  team: GameTeam
  winner: boolean
  showScore: boolean
  flourish?: ScoreEvent | null
  sport?: string
}): JSX.Element {
  return (
    <div className={`flex items-center gap-3 ${winner ? 'text-zinc-50' : 'text-zinc-300'}`}>
      <TeamLogo logoURL={team.logoURL} abbreviation={team.abbreviation} />
      <div className="min-w-0 flex-1">
        <div className={`text-[14px] truncate ${winner ? 'font-bold' : 'font-semibold'}`}>
          {team.shortName}
        </div>
        {team.record && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mt-0.5 truncate">
            {team.record}
          </div>
        )}
      </div>
      {showScore && (
        <div className={`relative text-[20px] tabular-nums leading-none shrink-0 ${winner ? 'font-bold text-zinc-50' : 'font-semibold'}`}>
          {team.score ?? '—'}
          {flourish && (
            <span className="absolute -top-5 right-0 translate-x-2 pointer-events-none">
              <ScoreFlourish
                event={flourish}
                sport={sport ?? ''}
                size="md"
                teamColor={team.color ?? team.altColor}
              />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function TeamLogo({
  logoURL,
  abbreviation
}: {
  logoURL: string | null
  abbreviation: string
}): JSX.Element {
  if (logoURL) {
    return (
      <img
        src={logoURL}
        alt=""
        className="w-7 h-7 shrink-0 object-contain"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }
  return (
    <span className="w-7 h-7 shrink-0 rounded bg-surface-2 flex items-center justify-center text-[10px] font-bold text-zinc-300">
      {abbreviation.slice(0, 3)}
    </span>
  )
}

function formatGameTime(game: Game): string {
  if (!game.date) return ''
  const d = new Date(game.date)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return time
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${date} · ${time}`
}

function GameDetailOverlay({
  game,
  onClose,
  onOpenURL
}: {
  game: Game
  onClose: () => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
}): JSX.Element {
  const [detail, setDetail] = useState<GameDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showHighlights, setShowHighlights] = useState(false)

  // Focused game detail gets the tightest cadence: 5s when live + visible,
  // paused when hidden, and not polled at all for finished/scheduled games.
  const isLive = (detail?.status ?? game.status) === 'in_progress'
  const detailInterval = useAdaptiveInterval({
    anyLive: isLive,
    liveMs: 5_000,
    idleMs: 60_000,
    hiddenMs: null
  })
  // Reset once per game switch (not on every interval flip) — see the matching
  // comment in SportsPage for why this is split from the polling effect.
  useEffect(() => {
    setDetail(null)
    setLoading(true)
  }, [game.id])
  useEffect(() => {
    let cancelled = false
    const pull = async (): Promise<void> => {
      const d = await window.api.sports.getGameDetail(
        game.leagueId,
        game.leaguePath,
        game.id
      )
      if (cancelled) return
      if (d) setDetail(d)
      setLoading(false)
    }
    void pull()
    if (!isLive || detailInterval === null) {
      return () => {
        cancelled = true
      }
    }
    const t = setInterval(() => void pull(), detailInterval)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [game.leagueId, game.leaguePath, game.id, isLive, detailInterval])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setShowHighlights(false)
  }, [game.id])

  const displayGame: Game = detail ?? game
  const isPast = game.status === 'final'
  const sport = sportForLeagueId(game.leagueId)
  const scoreEvent = useScoreEvent(displayGame)
  const highlightQuery =
    detail?.highlightSearchQuery ?? `${game.away.name} vs ${game.home.name} highlights`
  const searchURL = `https://www.youtube.com/results?search_query=${encodeURIComponent(highlightQuery)}`

  return (
    <div className="absolute inset-0 z-30 bg-surface-0 flex flex-col min-h-0">
      <header className="px-6 pt-5 pb-4 border-b border-edge flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400/90 mb-1.5">
            {LeagueName(game.leagueId)} · {formatGameTime(game)}
          </div>
          <div className="flex items-center gap-4">
            <ScoreBlock
              team={displayGame.away}
              status={displayGame.status}
              flourish={scoreEvent?.side === 'away' ? scoreEvent : null}
              sport={sport}
            />
            <span className="text-[14px] font-semibold uppercase tracking-[0.2em] text-zinc-500">@</span>
            <ScoreBlock
              team={displayGame.home}
              status={displayGame.status}
              flourish={scoreEvent?.side === 'home' ? scoreEvent : null}
              sport={sport}
            />
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            <span
              className={
                displayGame.status === 'in_progress' ? 'text-red-300 font-semibold' : undefined
              }
            >
              {displayGame.statusDetail || displayGame.statusShort || '—'}
            </span>
            {displayGame.venue && <span> · {displayGame.venue}</span>}
            {displayGame.broadcasts.length > 0 && <span> · {displayGame.broadcasts.join(', ')}</span>}
          </div>
          {displayGame.series && (
            // Mirror the game-card series header on the detail page so
            // the round + series score stays visible while the user
            // scrolls through stats. Larger and slightly more prominent
            // here since the detail page has the room.
            <div className="mt-3 inline-flex items-center gap-3 px-3 py-1.5 rounded-md bg-orange-500/10 ring-1 ring-inset ring-orange-500/30">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-300">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                {displayGame.series.title ??
                  displayGame.series.summary ??
                  'Playoff Series'}
              </span>
              {(displayGame.series.homeWins > 0 || displayGame.series.awayWins > 0) && (
                <span className="text-[12px] font-semibold tabular-nums text-orange-100">
                  {displayGame.away.abbreviation} {displayGame.series.awayWins} ·{' '}
                  {displayGame.series.homeWins} {displayGame.home.abbreviation}
                </span>
              )}
              {displayGame.series.summary &&
                displayGame.series.summary !== displayGame.series.title && (
                  <span className="text-[10.5px] text-orange-200/80 normal-case tracking-normal">
                    {displayGame.series.summary}
                  </span>
                )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isPast && (
            <button
              onClick={() => setShowHighlights((v) => !v)}
              className="px-3 py-1.5 rounded-full bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30 text-[10px] font-semibold uppercase tracking-[0.18em] hover:bg-red-500/25"
            >
              {showHighlights ? 'Hide highlights' : '▶ Highlights'}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
          >
            Close
          </button>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {showHighlights && isPast && (
          <div className="px-6 pt-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                YouTube highlights
              </div>
            </div>
            <div
              className="rounded-xl border border-edge bg-black overflow-hidden"
              style={{ height: 480 }}
            >
              <webview
                key={`search-${searchURL}`}
                src={searchURL}
                partition="persist:youtube"
                style={{ display: 'flex', width: '100%', height: '100%' }}
              />
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Query: <span className="text-zinc-300 normal-case tracking-normal">{highlightQuery}</span>
            </div>
          </div>
        )}
        {loading ? (
          <div className="px-6 py-12 text-sm text-zinc-500">Loading game details…</div>
        ) : detail ? (
          <GameDetailBody detail={detail} onOpenURL={onOpenURL} />
        ) : (
          <div className="px-6 py-12 text-sm text-zinc-500">
            No additional detail is available for this game yet.
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreBlock({
  team,
  status,
  flourish,
  sport
}: {
  team: GameTeamLike
  status: Game['status']
  flourish?: ScoreEvent | null
  sport?: string
}): JSX.Element {
  const showScore = status !== 'scheduled' && status !== 'postponed' && status !== 'canceled'
  const winner = team.winner === true
  return (
    <div className="flex items-center gap-3 min-w-0">
      <TeamLogo logoURL={team.logoURL} abbreviation={team.abbreviation} />
      <div className="min-w-0">
        <div className={`text-[18px] truncate ${winner ? 'font-bold text-zinc-50' : 'font-semibold text-zinc-200'}`}>
          {team.shortName}
        </div>
        {team.record && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 truncate">
            {team.record}
          </div>
        )}
      </div>
      {showScore && (
        <div className={`relative text-[28px] tabular-nums leading-none ${winner ? 'font-bold text-zinc-50' : 'font-semibold text-zinc-300'}`}>
          {team.score ?? '—'}
          {flourish && (
            <span className="absolute -top-7 right-0 translate-x-2 pointer-events-none">
              <ScoreFlourish
                event={flourish}
                sport={sport ?? ''}
                size="lg"
                teamColor={team.color ?? team.altColor}
              />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

interface GameTeamLike {
  shortName: string
  abbreviation: string
  logoURL: string | null
  score: number | null
  record: string | null
  winner: boolean | null
  color: string | null
  altColor: string | null
}

function LeagueName(leagueId: string): string {
  switch (leagueId) {
    case 'nfl':
      return 'NFL'
    case 'nba':
      return 'NBA'
    case 'mlb':
      return 'MLB'
    case 'nhl':
      return 'NHL'
    case 'ucl':
      return 'UEFA Champions League'
    case 'epl':
      return 'Premier League'
    case 'laliga':
      return 'La Liga'
    case 'seriea':
      return 'Serie A'
    case 'cricket':
      return 'Cricket'
    default:
      return leagueId.toUpperCase()
  }
}

function GameDetailBody({
  detail,
  onOpenURL
}: {
  detail: GameDetail
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
}): JSX.Element {
  const homeLeaders = detail.leaders.filter((l) => l.team === 'home')
  const awayLeaders = detail.leaders.filter((l) => l.team === 'away')
  const isMlb = detail.leagueId === 'mlb'
  const isNba = detail.leagueId === 'nba'
  const homePlayers = detail.playerStats?.find((p) => p.team === 'home')
  const awayPlayers = detail.playerStats?.find((p) => p.team === 'away')
  return (
    <div className="px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {isMlb && detail.linescore && (
        <section className="rounded-xl border border-edge bg-surface-1 p-5 lg:col-span-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-4">
            Line score
          </h3>
          <LinescoreTable detail={detail} />
        </section>
      )}
      {isMlb && (awayPlayers || homePlayers) && (
        <section className="rounded-xl border border-edge bg-surface-1 p-5 lg:col-span-2 space-y-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            Batting & pitching
          </h3>
          <MlbPlayerStats
            awayLabel={detail.away.shortName}
            homeLabel={detail.home.shortName}
            awayPlayers={awayPlayers}
            homePlayers={homePlayers}
          />
        </section>
      )}
      {isNba && (awayPlayers || homePlayers) && (
        <section className="rounded-xl border border-edge bg-surface-1 p-5 lg:col-span-2 space-y-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            Player stats
          </h3>
          <NbaPlayerStats
            awayLabel={detail.away.shortName}
            homeLabel={detail.home.shortName}
            awayPlayers={awayPlayers}
            homePlayers={homePlayers}
          />
        </section>
      )}
      {detail.stats.length > 0 && (
        <section className="rounded-xl border border-edge bg-surface-1 p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-4">
            Team stats
          </h3>
          {/* Two-column layout for the stat list — pairs of stats sit
              side-by-side so a 22-stat NBA game renders in ~11 rows
              instead of 22. Each column is its own [away | label |
              home] grid. Splits the array down the middle so the
              first half sits on the left, second half on the right. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
            {(() => {
              const half = Math.ceil(detail.stats.length / 2)
              const left = detail.stats.slice(0, half)
              const right = detail.stats.slice(half)
              const renderColumn = (
                items: typeof detail.stats,
                key: string
              ): JSX.Element => (
                <div
                  key={key}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-1.5 text-[12px]"
                >
                  <div className="text-right text-[9.5px] uppercase tracking-[0.18em] text-zinc-500">
                    {detail.away.abbreviation}
                  </div>
                  <div className="text-[9.5px] uppercase tracking-[0.18em] text-zinc-500 text-center">
                    Stat
                  </div>
                  <div className="text-[9.5px] uppercase tracking-[0.18em] text-zinc-500">
                    {detail.home.abbreviation}
                  </div>
                  {items.map((s) => (
                    <FragmentRow key={s.label} stat={s} />
                  ))}
                </div>
              )
              return [renderColumn(left, 'left'), renderColumn(right, 'right')]
            })()}
          </div>
        </section>
      )}
      {(awayLeaders.length > 0 || homeLeaders.length > 0) && (
        <section className="rounded-xl border border-edge bg-surface-1 p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-4">
            Leaders
          </h3>
          <div className="grid grid-cols-2 gap-6 text-[12px]">
            <LeaderColumn label={detail.away.shortName} leaders={awayLeaders} />
            <LeaderColumn label={detail.home.shortName} leaders={homeLeaders} />
          </div>
        </section>
      )}
      {detail.headlines.length > 0 && (
        <section className="rounded-xl border border-edge bg-surface-1 p-5 lg:col-span-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-4">
            Headlines
          </h3>
          <ul className="space-y-2">
            {detail.headlines.map((h, i) => (
              <li key={i}>
                {h.link ? (
                  <button
                    type="button"
                    onClick={() => onOpenURL(h.link ?? '', h.title, h.description ?? null)}
                    className="text-[13px] text-zinc-200 hover:text-zinc-50 text-left"
                  >
                    {h.title}
                  </button>
                ) : (
                  <span className="text-[13px] text-zinc-200">{h.title}</span>
                )}
                {h.description && (
                  <div className="text-[11px] text-zinc-500 mt-0.5">{h.description}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function FragmentRow({ stat }: { stat: { label: string; home: string; away: string } }): JSX.Element {
  return (
    <>
      <div className="text-right tabular-nums text-zinc-200">{stat.away}</div>
      <div className="text-center text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {stat.label}
      </div>
      <div className="tabular-nums text-zinc-200">{stat.home}</div>
    </>
  )
}

// Initials fallback for leaders missing an ESPN headshot. "Bones Hyland"
// → "BH", single-token names → first letter only, empty / "—" → "?".
function leaderInitials(athlete: string): string {
  const tokens = athlete.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return '?'
  if (tokens.length === 1) return tokens[0].charAt(0).toUpperCase()
  return (tokens[0].charAt(0) + tokens[tokens.length - 1].charAt(0)).toUpperCase()
}

function LeaderHeadshot({
  url,
  teamLogoURL,
  athlete
}: {
  url: string | null
  teamLogoURL: string | null
  athlete: string
}): JSX.Element {
  // Resolution order: player headshot → team crest → initials.
  // Soccer leagues rarely ship player headshots, so the team crest
  // fallback is what gives those panels visual identity.
  // 'player' state is "primary URL succeeds"; 'team' is "primary
  // failed, try team logo"; 'initials' is "both failed or missing".
  type Stage = 'player' | 'team' | 'initials'
  const initialStage: Stage = url ? 'player' : teamLogoURL ? 'team' : 'initials'
  const [stage, setStage] = useState<Stage>(initialStage)
  useEffect(() => {
    setStage(url ? 'player' : teamLogoURL ? 'team' : 'initials')
  }, [url, teamLogoURL])

  if (stage === 'player' && url) {
    return (
      <img
        src={url}
        alt={athlete}
        loading="lazy"
        onError={() => setStage(teamLogoURL ? 'team' : 'initials')}
        className="w-16 h-16 rounded-full object-cover bg-surface-2 ring-1 ring-edge shrink-0"
      />
    )
  }
  if (stage === 'team' && teamLogoURL) {
    return (
      <img
        src={teamLogoURL}
        alt={`${athlete} (team crest)`}
        loading="lazy"
        onError={() => setStage('initials')}
        // contain — team crests aren't square headshots; cover would
        // crop the wordmark on horizontal logos.
        className="w-16 h-16 rounded-full object-contain bg-surface-2 ring-1 ring-edge shrink-0 p-1.5"
      />
    )
  }
  return (
    <span className="w-16 h-16 rounded-full bg-surface-2 ring-1 ring-edge text-[16px] font-semibold tracking-wide text-zinc-300 flex items-center justify-center shrink-0">
      {leaderInitials(athlete)}
    </span>
  )
}

function LeaderColumn({
  label,
  leaders
}: {
  label: string
  leaders: GameDetail['leaders']
}): JSX.Element {
  // 64px headshot per leader — fills the previously-empty bottom of
  // the panel and gives each row strong visual identity. Category
  // stacks above the athlete name so the text block reads as a
  // mini player card. Value sits right-aligned at a larger size
  // since it's the headline number for that category.
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-3">
        {label}
      </div>
      <ul className="space-y-3">
        {leaders.length === 0 && <li className="text-[11px] text-zinc-500">—</li>}
        {leaders.map((l, i) => (
          <li
            key={i}
            className="grid grid-cols-[64px_1fr_auto] items-center gap-3"
          >
            <LeaderHeadshot
              url={l.headshotURL}
              teamLogoURL={l.teamLogoURL}
              athlete={l.athlete}
            />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 leading-tight mb-1">
                {l.category}
              </div>
              <div className="text-[13.5px] text-zinc-100 leading-tight truncate">
                {l.athlete || '—'}
              </div>
            </div>
            <span className="text-[20px] font-semibold tabular-nums text-zinc-100">
              {l.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LinescoreTable({ detail }: { detail: GameDetail }): JSX.Element {
  const ls = detail.linescore!
  const cols = Math.max(ls.columns, 9)
  const pad = (xs: Array<number | null>): Array<number | null> => {
    const out = xs.slice()
    while (out.length < cols) out.push(null)
    return out
  }
  const awayInnings = pad(ls.away.innings)
  const homeInnings = pad(ls.home.innings)
  const inningCells = Array.from({ length: cols }, (_, i) => i + 1)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] tabular-nums">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            <th className="text-left font-medium py-1.5 pr-4">Team</th>
            {inningCells.map((i) => (
              <th key={i} className="px-2 font-medium text-center">
                {i}
              </th>
            ))}
            <th className="pl-4 pr-2 font-semibold text-center text-zinc-300">R</th>
            <th className="px-2 font-semibold text-center text-zinc-300">H</th>
            <th className="px-2 font-semibold text-center text-zinc-300">E</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge/60">
          <LinescoreRow
            label={detail.away.abbreviation}
            innings={awayInnings}
            totals={ls.away}
          />
          <LinescoreRow
            label={detail.home.abbreviation}
            innings={homeInnings}
            totals={ls.home}
          />
        </tbody>
      </table>
    </div>
  )
}

function LinescoreRow({
  label,
  innings,
  totals
}: {
  label: string
  innings: Array<number | null>
  totals: { runs: number | null; hits: number | null; errors: number | null }
}): JSX.Element {
  return (
    <tr>
      <td className="py-1.5 pr-4 font-semibold tracking-[0.12em] uppercase text-[11px] text-zinc-200">
        {label}
      </td>
      {innings.map((v, i) => (
        <td key={i} className="px-2 text-center text-zinc-300">
          {v === null ? '—' : v}
        </td>
      ))}
      <td className="pl-4 pr-2 text-center font-semibold text-zinc-100">
        {totals.runs ?? '—'}
      </td>
      <td className="px-2 text-center text-zinc-200">{totals.hits ?? '—'}</td>
      <td className="px-2 text-center text-zinc-200">{totals.errors ?? '—'}</td>
    </tr>
  )
}

function MlbPlayerStats({
  awayLabel,
  homeLabel,
  awayPlayers,
  homePlayers
}: {
  awayLabel: string
  homeLabel: string
  awayPlayers: TeamPlayerStats | undefined
  homePlayers: TeamPlayerStats | undefined
}): JSX.Element {
  const categories = ['batting', 'pitching'] as const
  return (
    <div className="space-y-5">
      {categories.map((cat) => {
        const awayGroup = awayPlayers?.groups.find((g) => matchesCategory(g.category, cat))
        const homeGroup = homePlayers?.groups.find((g) => matchesCategory(g.category, cat))
        if (!awayGroup && !homeGroup) return null
        return (
          <div key={cat} className="space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
              {cat}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {awayGroup && <PlayerStatTable teamLabel={awayLabel} group={awayGroup} />}
              {homeGroup && <PlayerStatTable teamLabel={homeLabel} group={homeGroup} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function matchesCategory(category: string, target: 'batting' | 'pitching'): boolean {
  return category.toLowerCase().includes(target)
}

function NbaPlayerStats({
  awayLabel,
  homeLabel,
  awayPlayers,
  homePlayers
}: {
  awayLabel: string
  homeLabel: string
  awayPlayers: TeamPlayerStats | undefined
  homePlayers: TeamPlayerStats | undefined
}): JSX.Element {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {awayPlayers && <NbaTeamTable teamLabel={awayLabel} team={awayPlayers} />}
      {homePlayers && <NbaTeamTable teamLabel={homeLabel} team={homePlayers} />}
    </div>
  )
}

function NbaTeamTable({
  teamLabel,
  team
}: {
  teamLabel: string
  team: TeamPlayerStats
}): JSX.Element {
  const group = team.groups[0]
  if (!group) return <div />
  const starters = group.players.filter((p) => p.isStarter)
  const bench = group.players.filter((p) => !p.isStarter)
  const ordered = [...starters, ...bench]
  const merged = { labels: group.labels, players: ordered, totals: group.totals }
  return <PlayerStatTable teamLabel={teamLabel} group={merged} />
}

function PlayerStatTable({
  teamLabel,
  group
}: {
  teamLabel: string
  group: { labels: string[]; players: Array<{ athlete: string; position: string; stats: string[] }>; totals: string[] | null }
}): JSX.Element {
  return (
    <div className="rounded-lg border border-edge/70 bg-surface-2/40 overflow-hidden">
      <div className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-400 border-b border-edge/70">
        {teamLabel}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              <th className="text-left font-medium px-3 py-1.5">Player</th>
              {group.labels.map((l, i) => (
                <th key={i} className="px-2 py-1.5 text-right font-medium">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/40">
            {group.players.map((p, i) => (
              <tr key={i}>
                <td className="px-3 py-1 text-left text-zinc-200">
                  <span className="truncate">{p.athlete}</span>
                  {p.position && (
                    <span className="ml-1.5 text-[10px] text-zinc-500 uppercase tracking-[0.12em]">
                      {p.position}
                    </span>
                  )}
                </td>
                {p.stats.map((s, j) => (
                  <td key={j} className="px-2 py-1 text-right text-zinc-300">
                    {s || '—'}
                  </td>
                ))}
              </tr>
            ))}
            {group.totals && (
              <tr className="bg-surface-1/40">
                <td className="px-3 py-1 text-left text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                  Totals
                </td>
                {group.totals.map((s, j) => (
                  <td key={j} className="px-2 py-1 text-right text-zinc-200 font-semibold">
                    {s || '—'}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
