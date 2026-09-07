// Research tab — keyword search across Semantic Scholar with a
// Claude-authored multi-paper synthesis brief on top, paper cards
// below, and a side-panel detail view that surfaces citation
// lineage (top citing + top references) when a paper is selected.
//
// Saved-topic flow: user can save the current query as a topic;
// the background scheduler regenerates the brief weekly so a
// returning visit renders instantly from the cached payload.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BookmarkFoundationalEdge,
  BookmarkTopicLink,
  BridgePaperResult,
  RecentSearchRow,
  ResearchBookmarkRow,
  ResearchBriefBullet,
  ResearchBriefPayload,
  ResearchBriefSection,
  ResearchPaper,
  SimilarPaper,
  PaperTickerLink,
  ResearchTopic
} from '../../preload'
import { CollapseChevron, useCollapsedSection } from './collapseUI'
import { ResearchMap } from './ResearchMap'
import { PaperValueChainCard } from './PaperValueChainCard'

interface Props {
  onClose: () => void
  // Reuse the in-app external reader to open paper PDFs / abstracts.
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
}

interface ViewState {
  // 'idle' = initial blank state, 'loading' = mid-search,
  // 'results' = brief + papers loaded, 'topic' = viewing a saved
  // topic's cached brief, 'bookmarks' = browsing saved papers.
  kind: 'idle' | 'loading' | 'results' | 'topic' | 'bookmarks'
  query: string
  brief: ResearchBriefPayload | null
  papers: ResearchPaper[]
  // When kind='topic', the topicId being viewed (so refresh routes
  // to the right row).
  topicId: number | null
}

// In-window PDF reader state. When non-null, the right detail pane
// shows the PDF (via <webview>) instead of the paper-detail card. Keeps
// the user in the Research tab — no bounce to ExternalReader covering
// the whole UI.
interface PdfReaderState {
  url: string
  title: string
  subtitle: string | null
  // Phase 3B — optional 1-indexed page hint for deep-linking via the
  // Chromium PDF viewer's `#page=N` fragment. When set, the webview
  // src becomes `${url}#page=${pageOffset}` and Chromium opens the
  // viewer scrolled to that page. Sentence-level highlighting requires
  // a pdfjs-rendered viewer (planned for a future phase) — Chromium's
  // built-in viewer doesn't reliably honor `#search=` across builds.
  pageOffset?: number
}

export function ResearchPage({ onClose, onOpenURL }: Props): JSX.Element {
  const [view, setView] = useState<ViewState>({
    kind: 'idle',
    query: '',
    brief: null,
    papers: [],
    topicId: null
  })
  const [topics, setTopics] = useState<ResearchTopic[]>([])
  const [draft, setDraft] = useState('')
  const [selectedPaper, setSelectedPaper] = useState<ResearchPaper | null>(null)
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set())
  const [pdfReader, setPdfReader] = useState<PdfReaderState | null>(null)
  const [recentSearches, setRecentSearches] = useState<RecentSearchRow[]>([])
  // Phase 3A — paper-value-chain takeover. When non-null, the center
  // pane shows the chain at the top (above the brief / paper list); the
  // paper itself stays in the source list so the user keeps context.
  // Cleared via the chain card's "Close" button.
  const [chainPaper, setChainPaper] = useState<ResearchPaper | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Bookmarks + recent searches: load once on mount.
  useEffect(() => {
    let cancelled = false
    void window.api.research
      .listBookmarks()
      .then((rows) => {
        if (cancelled) return
        setBookmarkedIds(new Set(rows.map((r) => r.paperId)))
      })
      .catch(() => {
        /* keep prior state */
      })
    void window.api.research
      .listRecent(10)
      .then((rows) => {
        if (cancelled) return
        setRecentSearches(rows)
      })
      .catch(() => {
        /* keep prior state */
      })
    return (): void => {
      cancelled = true
    }
  }, [])

  const reloadRecent = useCallback(async (): Promise<void> => {
    try {
      const rows = await window.api.research.listRecent(10)
      setRecentSearches(rows)
    } catch (err) {
      console.warn('[research] listRecent failed:', err)
    }
  }, [])

  const removeRecent = useCallback(
    async (query: string): Promise<void> => {
      // Optimistic removal so the chip disappears instantly.
      setRecentSearches((prev) => prev.filter((r) => r.query !== query))
      try {
        await window.api.research.clearRecent(query)
      } catch (err) {
        console.warn('[research] clearRecent failed:', err)
        void reloadRecent()
      }
    },
    [reloadRecent]
  )

  const toggleBookmark = useCallback(
    async (paper: ResearchPaper): Promise<void> => {
      const isBookmarked = bookmarkedIds.has(paper.paperId)
      // Optimistic update so the ⭐ flips instantly; rollback on IPC fail.
      setBookmarkedIds((prev) => {
        const next = new Set(prev)
        if (isBookmarked) next.delete(paper.paperId)
        else next.add(paper.paperId)
        return next
      })
      try {
        if (isBookmarked) {
          await window.api.research.unbookmark(paper.paperId)
        } else {
          await window.api.research.bookmark(paper)
        }
      } catch (err) {
        console.warn('[research] bookmark toggle failed:', err)
        setBookmarkedIds((prev) => {
          const next = new Set(prev)
          if (isBookmarked) next.add(paper.paperId)
          else next.delete(paper.paperId)
          return next
        })
      }
    },
    [bookmarkedIds]
  )

  // Bridge papers — populated whenever the Bookmarks view opens so the
  // suggestion list is fresh against the current bookmark set + cache
  // state. Cheap (in-memory walk over caches), no S2 calls.
  const [bridges, setBridges] = useState<BridgePaperResult[]>([])

  // Research Map data + display toggle. The map view is a swap-in for
  // the bookmarks list, not a separate top-level view kind — keeps the
  // bookmark detail/PDF pane logic shared.
  const [bookmarksMode, setBookmarksMode] = useState<'list' | 'map'>('list')
  const [bookmarksFull, setBookmarksFull] = useState<ResearchBookmarkRow[]>([])
  const [foundationalEdges, setFoundationalEdges] = useState<BookmarkFoundationalEdge[]>([])
  const [bookmarkTopicLinks, setBookmarkTopicLinks] = useState<BookmarkTopicLink[]>([])

  const reloadMapData = useCallback(async (): Promise<void> => {
    try {
      const [bms, edges, links] = await Promise.all([
        window.api.research.listBookmarks(),
        window.api.research.listBookmarkFoundationalEdges(),
        window.api.research.listAllBookmarkTopicLinks()
      ])
      setBookmarksFull(bms)
      setFoundationalEdges(edges)
      setBookmarkTopicLinks(links)
    } catch (err) {
      console.warn('[research] reloadMapData failed:', err)
    }
  }, [])

  const reloadBridges = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.research.listBridgePapers()
      setBridges(list)
    } catch (err) {
      console.warn('[research] listBridgePapers failed:', err)
      setBridges([])
    }
  }, [])

  const openBookmarks = useCallback(async (): Promise<void> => {
    try {
      const rows = await window.api.research.listBookmarks()
      setView({
        kind: 'bookmarks',
        query: '',
        brief: null,
        papers: rows.map((r) => r.paper),
        topicId: null
      })
      setBookmarkedIds(new Set(rows.map((r) => r.paperId)))
      setSelectedPaper(null)
      setDraft('')
      void reloadBridges()
      // Map view needs the full bookmark rows + edges + topic links.
      // Always preload so flipping to map is instant — these are
      // small payloads and pure local DB reads.
      void reloadMapData()
    } catch (err) {
      console.warn('[research] listBookmarks failed:', err)
    }
  }, [reloadBridges, reloadMapData])

  // Tagged bookmarks for the current topic view. Populated when
  // openTopic runs alongside the brief fetch. Cleared when leaving
  // topic view.
  const [topicBookmarks, setTopicBookmarks] = useState<ResearchBookmarkRow[]>([])

  // Increments whenever a paper's tag set changes — used by
  // PaperDetailPanel to invalidate its internal taggedTopics fetch
  // without lifting that state up to ResearchPage.
  const [tagsRevision, setTagsRevision] = useState(0)
  const onTagsChanged = useCallback((): void => {
    setTagsRevision((r) => r + 1)
    // If we're viewing a topic, refresh its tagged-bookmarks list so a
    // newly-tagged paper appears immediately and an untagged one drops.
    if (view.kind === 'topic' && view.topicId !== null) {
      const tid = view.topicId
      void window.api.research
        .listBookmarksForTopic(tid)
        .then(setTopicBookmarks)
        .catch(() => {
          /* keep prior */
        })
    }
  }, [view])

  // Refresh bridges + map data whenever the bookmark set or tag set
  // changes in the Bookmarks view — bookmarking a bridge candidate
  // drops it off the suggestion list, tagging a bookmark recolors the
  // map node, etc. Note: the new bookmark's foundational cache
  // populates async via auto-fetch, so a fresh bridge "from this
  // bookmark's foundationals" + the corresponding map edge appear on
  // the next reload (a few seconds later, fine).
  useEffect(() => {
    if (view.kind !== 'bookmarks') return
    void reloadBridges()
    void reloadMapData()
    // bookmarkedIds + tagsRevision are the triggers — reloaders are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarkedIds, tagsRevision, view.kind])

  // ----- saved topics -----
  const reloadTopics = useCallback(async (): Promise<void> => {
    const list = await window.api.research.listTopics()
    setTopics(list)
  }, [])

  // The onTopicUpdated subscription below is registered once (deps are
  // [reloadTopics], which is stable). Reading `view` directly inside its
  // callback captured the mount-time value forever — always
  // {kind:'idle', topicId:null} — so the match never succeeded and the
  // brief never arrived. Since refreshCurrent sets kind:'loading' and then
  // waits for exactly this callback, every topic refresh spun indefinitely.
  // The eslint-disable on the old effect is what kept that hidden.
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    void reloadTopics()
    const unsub = window.api.research.onTopicUpdated((topicId) => {
      void reloadTopics()
      // Match on topicId alone, not kind. refreshCurrent has already moved
      // us to kind:'loading' by the time this fires, so a `kind === 'topic'`
      // test would still miss — and clearing 'loading' is the whole point.
      if (viewRef.current.topicId !== topicId) return
      void window.api.research
        .getBrief(topicId)
        .then((row) => {
          if (!row) {
            // Nothing came back; drop out of 'loading' rather than hang.
            setView((prev) => (prev.topicId === topicId ? { ...prev, kind: 'topic' } : prev))
            return
          }
          setView((prev) =>
            prev.topicId === topicId ? { ...prev, kind: 'topic', brief: row.payload } : prev
          )
        })
        .catch((err) => {
          console.warn('[research] getBrief after topic update failed:', err)
          setView((prev) => (prev.topicId === topicId ? { ...prev, kind: 'topic' } : prev))
        })
    })
    return unsub
  }, [reloadTopics])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ----- search -----
  const runSearch = useCallback(async (query: string): Promise<void> => {
    const q = query.trim()
    if (!q) return
    setView({ kind: 'loading', query: q, brief: null, papers: [], topicId: null })
    setSelectedPaper(null)
    // Record the search regardless of whether S2 returns results — the
    // user expressed intent, and they may want to retry the same query
    // later if S2 was rate-limited or empty.
    void window.api.research
      .recordRecent(q)
      .then(() => reloadRecent())
      .catch(() => {
        /* silent — recents are nice-to-have */
      })
    try {
      const result = await window.api.research.search(q)
      setView({
        kind: 'results',
        query: q,
        brief: result.brief,
        papers: result.papers,
        topicId: null
      })
    } catch (err) {
      console.warn('[research] search failed:', err)
      setView({ kind: 'idle', query: q, brief: null, papers: [], topicId: null })
    }
  }, [])

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    void runSearch(draft)
  }

  // ----- saved-topic actions -----
  const saveCurrentQuery = async (): Promise<void> => {
    if (!view.query) return
    if (topics.some((t) => t.query.toLowerCase() === view.query.toLowerCase())) return
    const topic = await window.api.research.createTopic({ query: view.query })
    await reloadTopics()
    // Show the new topic immediately (uses today's just-fetched brief
    // even though the scheduler will refresh on cadence). Stays on
    // results view since we already have the brief in memory.
    setView((prev) => ({ ...prev, kind: 'topic', topicId: topic.id }))
  }

  const openTopic = async (topic: ResearchTopic): Promise<void> => {
    setView({
      kind: 'loading',
      query: topic.query,
      brief: null,
      papers: [],
      topicId: topic.id
    })
    setDraft(topic.query)
    setSelectedPaper(null)
    // Fetch tagged bookmarks in parallel with the brief — they render
    // alongside the synthesis in the topic view.
    void window.api.research
      .listBookmarksForTopic(topic.id)
      .then(setTopicBookmarks)
      .catch(() => setTopicBookmarks([]))
    const row = await window.api.research.getBrief(topic.id)
    if (row) {
      // Refill the cards from the brief's persisted paperIds. This used to
      // call research.search(), i.e. a fresh S2 search plus a Sonnet
      // synthesis at maxTokens 4000 — whose brief was then discarded in
      // favour of row.payload below. Every click on a saved topic paid for
      // a synthesis nobody read. hydratePapers is one S2 batch call.
      const papers = await window.api.research.hydratePapers(row.paperIds)
      setView({
        kind: 'topic',
        query: topic.query,
        brief: row.payload,
        papers,
        topicId: topic.id
      })
    } else {
      // No cached brief yet (just-saved topic, scheduler hasn't
      // ticked). Trigger refresh + show the in-flight one we get.
      await window.api.research.refreshTopic(topic.id)
      const result = await window.api.research.search(topic.query)
      setView({
        kind: 'topic',
        query: topic.query,
        brief: result.brief,
        papers: result.papers,
        topicId: topic.id
      })
    }
  }

  const deleteTopic = async (id: number): Promise<void> => {
    await window.api.research.deleteTopic(id)
    await reloadTopics()
    if (view.topicId === id) {
      setView({ kind: 'idle', query: '', brief: null, papers: [], topicId: null })
      setDraft('')
    }
  }

  const refreshCurrent = async (): Promise<void> => {
    if (view.topicId !== null) {
      const topicId = view.topicId
      setView((prev) => ({ ...prev, kind: 'loading' }))
      try {
        await window.api.research.refreshTopic(topicId)
        // Brief lands via onTopicUpdated, which clears 'loading'.
      } catch (err) {
        // Without this the spinner is permanent: nothing else clears
        // 'loading' when the refresh itself fails.
        console.warn('[research] refreshTopic failed:', err)
        setView((prev) => (prev.topicId === topicId ? { ...prev, kind: 'topic' } : prev))
      }
    } else {
      await runSearch(view.query)
    }
  }

  const querySaved = useMemo(
    () =>
      view.query &&
      topics.some((t) => t.query.toLowerCase() === view.query.toLowerCase()),
    [topics, view.query]
  )

  // ----- render -----
  return (
    <section className="h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden">
      <header className="px-6 pt-6 pb-4 flex items-end justify-between gap-6 flex-wrap border-b border-edge">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-400/90 mb-1.5">
            Academic synthesis · Semantic Scholar
          </div>
          <h1 className="text-[28px] leading-none font-bold text-zinc-50 tracking-tight">
            Research
          </h1>
          <form onSubmit={onSubmit} className="mt-4 flex items-center gap-2 max-w-[640px]">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. transformer attention mechanisms, RDMA networking, GPU scheduling…"
              className="flex-1 bg-surface-1 ring-1 ring-inset ring-edge rounded-md px-3 py-2 text-[13px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-violet-500/40"
            />
            <button
              type="submit"
              disabled={!draft.trim() || view.kind === 'loading'}
              className="px-4 py-2 rounded-md bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/30 text-[11px] font-semibold uppercase tracking-[0.18em] hover:bg-violet-500/25 disabled:opacity-50"
            >
              {view.kind === 'loading' ? 'Synthesizing…' : 'Search'}
            </button>
          </form>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
        >
          Close
        </button>
      </header>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
          {chainPaper && (
            <section className="mb-5 rounded-lg border border-violet-500/30 bg-violet-500/[0.04] p-3">
              <header className="flex items-baseline justify-between mb-2 gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-violet-300 font-semibold">
                    Paper value chain
                  </div>
                  <div className="text-[13px] text-zinc-100 mt-0.5 truncate" title={chainPaper.title}>
                    {chainPaper.title}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setChainPaper(null)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-100 shrink-0"
                >
                  Close ×
                </button>
              </header>
              <PaperValueChainCard
                paper={chainPaper}
                onOpenPaperById={(paperId) => {
                  // Within the chain, clicking a node card opens the
                  // existing detail panel for that paper. We don't
                  // recurse into a chain-of-a-chain — keeps the
                  // navigation model simple (one chain at a time).
                  const found = view.papers.find((p) => p.paperId === paperId)
                  if (found) setSelectedPaper(found)
                }}
                onOpenPdf={(input) => {
                  // Single PDF opener — card composes the full payload
                  // from its own chain.nodes (always fresh after regen),
                  // bypassing the stale-pdfUrl path that used to live
                  // in this callback.
                  setPdfReader(input)
                }}
              />
            </section>
          )}

          {(topics.length > 0 ||
            bookmarkedIds.size > 0 ||
            recentSearches.length > 0) && (
            <SavedTopicsStrip
              topics={topics}
              activeId={view.topicId}
              onOpen={openTopic}
              onDelete={deleteTopic}
              bookmarksCount={bookmarkedIds.size}
              isBookmarksActive={view.kind === 'bookmarks'}
              onOpenBookmarks={openBookmarks}
              recentSearches={recentSearches}
              activeQuery={view.kind === 'results' ? view.query : null}
              onRunRecent={(q) => {
                setDraft(q)
                void runSearch(q)
              }}
              onRemoveRecent={(q) => void removeRecent(q)}
            />
          )}

          {view.kind === 'idle' && (
            <div className="mt-12 text-center">
              <div className="text-[12px] text-zinc-500 max-w-md mx-auto">
                Search the academic literature. Pulse pulls top papers from
                Semantic Scholar, filters to the most-cited / most-influential,
                and synthesizes a brief on what's groundbreaking.
              </div>
            </div>
          )}
          {view.kind === 'loading' && (
            <div className="mt-12 text-center text-[12px] text-zinc-500">
              Searching Semantic Scholar + synthesizing brief… (typically 5-15s)
            </div>
          )}

          {view.brief && (
            <ResearchBriefCard
              brief={view.brief}
              query={view.query}
              isTopic={view.kind === 'topic'}
              querySaved={!!querySaved}
              onSaveTopic={saveCurrentQuery}
              onRefresh={refreshCurrent}
              onOpenPaperById={(paperId) => {
                const found = view.papers.find((p) => p.paperId === paperId)
                if (found) setSelectedPaper(found)
              }}
            />
          )}

          {view.kind === 'topic' && topicBookmarks.length > 0 && (
            <PaperList
              papers={topicBookmarks.map((b) => b.paper)}
              onSelect={(p) => setSelectedPaper(p)}
              selectedId={selectedPaper?.paperId ?? null}
              onOpenURL={onOpenURL}
              onOpenPdfInline={(url, title, subtitle) =>
                setPdfReader({ url, title, subtitle })
              }
              bookmarkedIds={bookmarkedIds}
              onToggleBookmark={(p) => void toggleBookmark(p)}
              onOpenChain={(p) => setChainPaper(p)}
              title="Your tagged bookmarks"
            />
          )}

          {view.kind === 'bookmarks' && view.papers.length === 0 && (
            <div className="mt-12 text-center text-[12px] text-zinc-500">
              No bookmarked papers yet. Hit ☆ on a paper card to save it.
            </div>
          )}

          {view.kind === 'bookmarks' && view.papers.length > 0 && (
            <div className="mt-2 mb-4 flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mr-1">
                View
              </span>
              <button
                onClick={() => setBookmarksMode('list')}
                className={`text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full transition-colors ${
                  bookmarksMode === 'list'
                    ? 'bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/40'
                    : 'text-zinc-400 ring-1 ring-inset ring-edge hover:text-zinc-100'
                }`}
              >
                List
              </button>
              <button
                onClick={() => setBookmarksMode('map')}
                className={`text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full transition-colors ${
                  bookmarksMode === 'map'
                    ? 'bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/40'
                    : 'text-zinc-400 ring-1 ring-inset ring-edge hover:text-zinc-100'
                }`}
              >
                Map
              </button>
            </div>
          )}

          {view.kind === 'bookmarks' && bookmarksMode === 'map' && (
            <ResearchMap
              bookmarks={bookmarksFull}
              edges={foundationalEdges}
              topicLinks={bookmarkTopicLinks}
              selectedId={selectedPaper?.paperId ?? null}
              onSelect={(p) => setSelectedPaper(p)}
            />
          )}

          {(view.kind !== 'bookmarks' || bookmarksMode === 'list') &&
            view.kind === 'bookmarks' &&
            bridges.length > 0 && (
              <BridgePapersSection
                bridges={bridges}
                bookmarkedIds={bookmarkedIds}
                onToggleBookmark={(p) => void toggleBookmark(p)}
                onSelect={(p) => setSelectedPaper(p)}
                onOpenURL={onOpenURL}
                onOpenPdfInline={(url, title, subtitle) =>
                  setPdfReader({ url, title, subtitle })
                }
              />
            )}

          {(view.kind !== 'bookmarks' || bookmarksMode === 'list') &&
            view.papers.length > 0 && (
              <PaperList
                papers={view.papers}
                onSelect={(p) => setSelectedPaper(p)}
                selectedId={selectedPaper?.paperId ?? null}
                onOpenURL={onOpenURL}
                onOpenPdfInline={(url, title, subtitle) =>
                  setPdfReader({ url, title, subtitle })
                }
                bookmarkedIds={bookmarkedIds}
                onToggleBookmark={(p) => void toggleBookmark(p)}
                onOpenChain={(p) => setChainPaper(p)}
                title={view.kind === 'bookmarks' ? 'Bookmarks' : 'Papers'}
              />
            )}
        </div>

        {pdfReader ? (
          <PdfReaderPane
            state={pdfReader}
            onClose={() => setPdfReader(null)}
          />
        ) : (
          selectedPaper && (
            <PaperDetailPanel
              paper={selectedPaper}
              onClose={() => setSelectedPaper(null)}
              onOpenURL={onOpenURL}
              onOpenPdfInline={(url, title, subtitle) =>
                setPdfReader({ url, title, subtitle })
              }
              onSelectPaper={setSelectedPaper}
              isBookmarked={bookmarkedIds.has(selectedPaper.paperId)}
              onToggleBookmark={() => void toggleBookmark(selectedPaper)}
              availableTopics={topics}
              tagsRevision={tagsRevision}
              onTagsChanged={onTagsChanged}
            />
          )
        )}
      </div>
    </section>
  )
}

// ---------- In-window PDF reader -----------------------------------------

function PdfReaderPane({
  state,
  onClose
}: {
  state: PdfReaderState
  onClose: () => void
}): JSX.Element {
  return (
    <aside className="w-[640px] xl:w-[760px] shrink-0 border-l border-edge bg-surface-1 flex flex-col min-h-0">
      <header className="px-4 py-2.5 border-b border-edge flex items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
          PDF · in-window
        </span>
        <div className="min-w-0 flex-1 truncate text-[12px] text-zinc-300" title={state.title}>
          {state.title}
        </div>
        <button
          onClick={onClose}
          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-100 px-2 py-0.5 shrink-0"
        >
          Close ×
        </button>
      </header>
      {/* Chromium's built-in PDF viewer is loaded automatically when the
          response Content-Type is application/pdf, which is what
          openAccessPdf URLs (arxiv.org/pdf/..., S2 mirrors) all return.
          allowpopups omitted on purpose — links inside the PDF that
          would open new windows route through setWindowOpenHandler →
          shell.openExternal, matching the rest of the app.

          When pageOffset is set (Phase 3B paper-pdf deep-linking), append
          `#page=N` to the URL — Chromium's PDF viewer parses the fragment
          and opens scrolled to that page. ±1 page tolerance accepted by
          spec; sentence-level highlighting needs a pdfjs-rendered
          viewer (deferred). */}
      <webview
        src={state.pageOffset ? `${state.url}#page=${state.pageOffset}` : state.url}
        className="flex-1 min-h-0"
        partition="persist:pdfreader"
        style={{ width: '100%', height: '100%', display: 'flex' }}
      />
    </aside>
  )
}

// ---------- Saved-topics strip --------------------------------------------

function SavedTopicsStrip({
  topics,
  activeId,
  onOpen,
  onDelete,
  bookmarksCount,
  isBookmarksActive,
  onOpenBookmarks,
  recentSearches,
  activeQuery,
  onRunRecent,
  onRemoveRecent
}: {
  topics: ResearchTopic[]
  activeId: number | null
  onOpen: (t: ResearchTopic) => void
  onDelete: (id: number) => void
  bookmarksCount: number
  isBookmarksActive: boolean
  onOpenBookmarks: () => void
  recentSearches: RecentSearchRow[]
  activeQuery: string | null
  onRunRecent: (query: string) => void
  onRemoveRecent: (query: string) => void
}): JSX.Element {
  // Hide recent-search chips that duplicate a saved topic — saved
  // topics are persistent + scheduled and read more authoritatively.
  const topicQueries = new Set(topics.map((t) => t.query.toLowerCase()))
  const filteredRecent = recentSearches.filter(
    (r) => !topicQueries.has(r.query.toLowerCase())
  )
  return (
    <div className="mb-5 space-y-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2">
          Saved
        </div>
        <div className="flex flex-wrap gap-1.5">
          {/* Bookmarks chip — sky-toned to match the per-paper ⭐ color. */}
          {bookmarksCount > 0 && (
            <button
              onClick={onOpenBookmarks}
              title="Browse your bookmarked papers"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                isBookmarksActive
                  ? 'border-sky-400/60 bg-sky-500/15 text-sky-200'
                  : 'border-edge bg-surface-1 text-zinc-300 hover:border-sky-500/40 hover:text-sky-300'
              }`}
            >
              <span>★ Bookmarks</span>
              <span className="text-[10px] tabular-nums opacity-70">{bookmarksCount}</span>
            </button>
          )}
          {topics.map((t) => {
            const active = t.id === activeId
            return (
              <div
                key={t.id}
                className={`group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                  active
                    ? 'border-violet-400/50 bg-violet-500/10 text-violet-200'
                    : 'border-edge bg-surface-1 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                <button onClick={() => onOpen(t)} className="text-left">
                  {t.label || t.query}
                </button>
                <button
                  onClick={() => onDelete(t.id)}
                  title="Remove topic"
                  className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-opacity"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      </div>
      {/* Recent searches — auto-recorded chip group, neutral zinc tone
          to read as "history" rather than "saved." Hidden when there's
          nothing to show (filtered against saved topics). */}
      {filteredRecent.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2">
            Recent
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filteredRecent.map((r) => {
              const active =
                activeQuery !== null &&
                r.query.toLowerCase() === activeQuery.toLowerCase()
              return (
                <div
                  key={r.query}
                  className={`group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                    active
                      ? 'border-zinc-400/60 bg-zinc-500/15 text-zinc-100'
                      : 'border-edge/70 bg-surface-1/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  <button
                    onClick={() => onRunRecent(r.query)}
                    className="text-left"
                    title={`Searched ${r.searchCount}× — click to re-run`}
                  >
                    {r.query}
                  </button>
                  <button
                    onClick={() => onRemoveRecent(r.query)}
                    title="Remove from recents"
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Brief card ----------------------------------------------------

const SECTION_TONE: Record<string, { glyph: string; tone: string; tint: string }> = {
  findings: { glyph: '◆', tone: 'text-violet-300', tint: 'border-violet-500/30' },
  trends: { glyph: '↗', tone: 'text-sky-300', tint: 'border-sky-500/30' },
  methods: { glyph: '⚙', tone: 'text-emerald-300', tint: 'border-emerald-500/30' },
  datasets: { glyph: '◧', tone: 'text-amber-300', tint: 'border-amber-500/30' },
  'open-questions': { glyph: '?', tone: 'text-rose-300', tint: 'border-rose-500/30' },
  notable: { glyph: '★', tone: 'text-fuchsia-300', tint: 'border-fuchsia-500/30' }
}
function sectionStyle(kind: string): { glyph: string; tone: string; tint: string } {
  return SECTION_TONE[kind] ?? { glyph: '·', tone: 'text-zinc-300', tint: 'border-zinc-600/40' }
}

function ResearchBriefCard({
  brief,
  query,
  isTopic,
  querySaved,
  onSaveTopic,
  onRefresh,
  onOpenPaperById
}: {
  brief: ResearchBriefPayload
  query: string
  isTopic: boolean
  querySaved: boolean
  onSaveTopic: () => void
  onRefresh: () => void
  onOpenPaperById: (paperId: string) => void
}): JSX.Element {
  return (
    <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-950/30 via-surface-1 to-surface-1 px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-300">
              ◆ Synthesis
            </span>
            <span className="text-[10px] text-zinc-600">·</span>
            <span className="text-[10px] text-zinc-500 truncate">"{query}"</span>
            <span className="text-[10px] text-zinc-600">·</span>
            <span className="text-[10px] text-zinc-500">
              {brief.inputs.papersFiltered} of {brief.inputs.papersConsidered} papers
            </span>
          </div>
          <h2 className="text-[15px] font-semibold text-zinc-50 leading-snug max-w-[820px]">
            {brief.headline}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isTopic && !querySaved && (
            <button
              onClick={onSaveTopic}
              title="Save this query as a topic — Pulse refreshes the brief weekly"
              className="text-[9.5px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25"
            >
              ＋ Save topic
            </button>
          )}
          <button
            onClick={onRefresh}
            title="Re-synthesize from a fresh paper search"
            className="text-[9.5px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"
          >
            ↻ Refresh
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {brief.sections.map((section, i) => (
          <BriefSection
            key={`${section.kind}-${i}`}
            section={section}
            onOpenPaperById={onOpenPaperById}
          />
        ))}
      </div>
    </div>
  )
}

function BriefSection({
  section,
  onOpenPaperById
}: {
  section: ResearchBriefSection
  onOpenPaperById: (paperId: string) => void
}): JSX.Element {
  const style = sectionStyle(section.kind)
  return (
    <section className={`pl-3 border-l ${style.tint}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[12px] leading-none ${style.tone}`}>{style.glyph}</span>
        <h3
          className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${style.tone}`}
        >
          {section.title}
        </h3>
      </div>
      <ul className="space-y-1.5">
        {section.bullets.map((b, i) => (
          <BriefBullet key={i} bullet={b} onOpenPaperById={onOpenPaperById} />
        ))}
      </ul>
    </section>
  )
}

function BriefBullet({
  bullet,
  onOpenPaperById
}: {
  bullet: ResearchBriefBullet
  onOpenPaperById: (paperId: string) => void
}): JSX.Element {
  return (
    <li className="flex items-start gap-2 leading-relaxed">
      <span className="text-zinc-600 select-none mt-[2px]">·</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-zinc-200">{bullet.text}</div>
        {bullet.citations.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {bullet.citations.map((c, i) => (
              <button
                key={i}
                onClick={() => onOpenPaperById(c.paperId)}
                title={`Open ${c.label}`}
                className="shrink-0 inline-flex items-center px-1.5 py-[1px] rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-200 text-[9.5px] font-semibold uppercase tracking-[0.16em] hover:bg-violet-500/20 transition-colors"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

// ---------- Paper list ----------------------------------------------------

function PaperList({
  papers,
  onSelect,
  selectedId,
  onOpenURL,
  onOpenPdfInline,
  bookmarkedIds,
  onToggleBookmark,
  onOpenChain,
  title = 'Papers'
}: {
  papers: ResearchPaper[]
  onSelect: (p: ResearchPaper) => void
  selectedId: string | null
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
  onOpenPdfInline?: (url: string, title: string, subtitle: string | null) => void
  bookmarkedIds: Set<string>
  onToggleBookmark: (paper: ResearchPaper) => void
  // Phase 3A: opens the per-paper value chain takeover.
  onOpenChain?: (paper: ResearchPaper) => void
  title?: string
}): JSX.Element {
  const [collapsed, setCollapsed] = useCollapsedSection('researchPapers', false)
  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-3 mb-3 group"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 group-hover:text-zinc-200">
          {title}
        </h3>
        <span className="h-px flex-1 bg-edge/80" />
        <span className="text-[10px] tabular-nums text-zinc-500">{papers.length}</span>
        <CollapseChevron open={!collapsed} />
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {papers.map((p) => (
            <PaperCard
              key={p.paperId}
              paper={p}
              selected={p.paperId === selectedId}
              onSelect={() => onSelect(p)}
              onOpenURL={onOpenURL}
              onOpenPdfInline={onOpenPdfInline}
              isBookmarked={bookmarkedIds.has(p.paperId)}
              onToggleBookmark={() => onToggleBookmark(p)}
              onOpenChain={onOpenChain ? () => onOpenChain(p) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// Bridge papers section — surfaces papers cited as foundational by 2+
// of the user's bookmarks but not bookmarked themselves. Suggested
// adds, ranked by how many of the library's papers anchor to them.
function BridgePapersSection({
  bridges,
  bookmarkedIds,
  onToggleBookmark,
  onSelect,
  onOpenURL,
  onOpenPdfInline
}: {
  bridges: BridgePaperResult[]
  bookmarkedIds: Set<string>
  onToggleBookmark: (paper: ResearchPaper) => void
  onSelect: (paper: ResearchPaper) => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
  onOpenPdfInline?: (url: string, title: string, subtitle: string | null) => void
}): JSX.Element {
  const [collapsed, setCollapsed] = useCollapsedSection('researchBridges', false)
  return (
    <section className="mt-2 mb-2">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-3 mb-3 group"
      >
        <span className="text-[12px] leading-none text-amber-300">▲</span>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300 group-hover:text-amber-200">
          Suggested
        </h3>
        <span className="text-[10px] text-zinc-500 normal-case tracking-normal">
          papers cited as foundational by 2+ of your bookmarks
        </span>
        <span className="h-px flex-1 bg-amber-500/20" />
        <span className="text-[10px] tabular-nums text-amber-300/80">{bridges.length}</span>
        <CollapseChevron open={!collapsed} />
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {bridges.map((b) => (
            <div
              key={b.paper.paperId}
              className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] px-4 py-3"
            >
              <button onClick={() => onSelect(b.paper)} className="w-full text-left min-w-0">
                <div className="flex items-start gap-2">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-500/30 shrink-0 tabular-nums"
                    title={`Cited as foundational by ${b.citedByBookmarkCount} of your bookmarks`}
                  >
                    {b.citedByBookmarkCount}× foundational
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-zinc-100 leading-snug">
                      {b.paper.title}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500 truncate">
                      {b.paper.authors.slice(0, 3).join(', ')}
                      {b.paper.authors.length > 3 && ' et al.'}
                      {b.paper.year && ` · ${b.paper.year}`}
                      {b.paper.venue && ` · ${b.paper.venue}`}
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                      <span>{b.paper.citationCount.toLocaleString()} citations</span>
                      {b.paper.influentialCitationCount > 0 && (
                        <span className="text-violet-300">
                          {b.paper.influentialCitationCount} influential
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleBookmark(b.paper)
                  }}
                  title={
                    bookmarkedIds.has(b.paper.paperId)
                      ? 'Remove bookmark'
                      : 'Add to bookmarks'
                  }
                  className={`text-[11px] leading-none px-2 py-0.5 rounded-full transition-colors ${
                    bookmarkedIds.has(b.paper.paperId)
                      ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-500/40 hover:bg-sky-500/30'
                      : 'text-zinc-400 hover:text-sky-300 hover:bg-sky-500/10 ring-1 ring-inset ring-edge'
                  }`}
                >
                  {bookmarkedIds.has(b.paper.paperId) ? '★ Bookmarked' : '☆ Bookmark'}
                </button>
                {b.paper.pdfUrl && onOpenPdfInline && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenPdfInline(b.paper.pdfUrl!, b.paper.title, b.paper.venue)
                    }}
                    className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
                  >
                    PDF
                  </button>
                )}
                {b.paper.url && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenURL(b.paper.url!, b.paper.title, b.paper.venue)
                    }}
                    className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"
                  >
                    Source ↗
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PaperCard({
  paper,
  selected,
  onSelect,
  onOpenURL,
  onOpenPdfInline,
  isBookmarked,
  onToggleBookmark,
  onOpenChain
}: {
  paper: ResearchPaper
  selected: boolean
  onSelect: () => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
  // Open the PDF in the in-window reader (right pane) instead of
  // bouncing to the full-screen ExternalReader. Falls back to onOpenURL
  // if the caller doesn't provide it.
  onOpenPdfInline?: (url: string, title: string, subtitle: string | null) => void
  isBookmarked: boolean
  onToggleBookmark: () => void
  // Phase 3A — open the paper value chain takeover. Optional so callers
  // that haven't been migrated keep working.
  onOpenChain?: () => void
}): JSX.Element {
  const authorLine =
    paper.authors.length === 0
      ? '—'
      : paper.authors.length <= 3
        ? paper.authors.join(', ')
        : `${paper.authors.slice(0, 3).join(', ')} et al.`
  return (
    <div
      className={`rounded-lg border bg-surface-1 px-4 py-3 transition-colors ${
        selected
          ? 'border-violet-500/50 bg-violet-500/5'
          : 'border-edge/70 hover:border-edge'
      }`}
    >
      <button onClick={onSelect} className="w-full text-left min-w-0">
        <div className="text-[13px] text-zinc-100 leading-snug">{paper.title}</div>
        <div className="mt-1 text-[11px] text-zinc-500 truncate">
          {authorLine}
          {paper.year && <span> · {paper.year}</span>}
          {paper.venue && <span> · {paper.venue}</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          <span>{paper.citationCount.toLocaleString()} citations</span>
          {paper.influentialCitationCount > 0 && (
            <span className="text-violet-300">
              {paper.influentialCitationCount} influential
            </span>
          )}
        </div>
      </button>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleBookmark()
          }}
          title={isBookmarked ? 'Remove bookmark' : 'Bookmark this paper'}
          aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
          className={`text-[11px] leading-none px-2 py-0.5 rounded-full transition-colors ${
            isBookmarked
              ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-500/40 hover:bg-sky-500/30'
              : 'text-zinc-500 hover:text-sky-300 hover:bg-sky-500/10'
          }`}
        >
          {isBookmarked ? '★' : '☆'}
        </button>
        {/* Single primary "Source" affordance: opens the PDF in the
            in-window reader when one is available, otherwise the
            metadata page (S2 / arXiv abs / DOI) externally. The
            previous two-button layout had a redundant PDF + Source
            split where Source always opened the metadata page; the
            common-case action is reading the paper, so prefer PDF. */}
        {(paper.pdfUrl || paper.url) && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (paper.pdfUrl && onOpenPdfInline) {
                onOpenPdfInline(paper.pdfUrl, paper.title, paper.venue)
              } else if (paper.pdfUrl) {
                onOpenURL(paper.pdfUrl, paper.title, paper.venue)
              } else if (paper.url) {
                onOpenURL(paper.url, paper.title, paper.venue)
              }
            }}
            className={
              paper.pdfUrl
                ? 'text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25'
                : 'text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2'
            }
          >
            {paper.pdfUrl ? 'Read PDF' : 'Source ↗'}
          </button>
        )}
        {onOpenChain && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpenChain()
            }}
            title="Generate a citation lineage chain for this paper"
            className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25"
          >
            Chain
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- Detail panel (citation lineage) -------------------------------

function PaperDetailPanel({
  paper,
  onClose,
  onOpenURL,
  onOpenPdfInline,
  onSelectPaper,
  isBookmarked,
  onToggleBookmark,
  availableTopics,
  tagsRevision,
  onTagsChanged
}: {
  paper: ResearchPaper
  onClose: () => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
  onOpenPdfInline: (url: string, title: string, subtitle: string | null) => void
  onSelectPaper: (p: ResearchPaper) => void
  isBookmarked: boolean
  onToggleBookmark: () => void
  // All saved topics, for the tag picker. Tagging requires the paper
  // to be bookmarked first (the FK enforces this).
  availableTopics: ResearchTopic[]
  // Bumped by the parent whenever any tag mutates so this panel re-
  // fetches its taggedTopics list (covers cross-bookmark tag changes
  // even though they're rare).
  tagsRevision: number
  onTagsChanged: () => void
}): JSX.Element {
  const [citing, setCiting] = useState<ResearchPaper[] | null>(null)
  const [refs, setRefs] = useState<ResearchPaper[] | null>(null)
  const [foundational, setFoundational] = useState<ResearchPaper[] | null>(null)
  const [foundationalFor, setFoundationalFor] = useState<ResearchPaper[] | null>(null)
  const [taggedTopics, setTaggedTopics] = useState<ResearchTopic[]>([])
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  // Semantic neighbours (SPECTER2) and the research/finance bridge.
  const [similar, setSimilar] = useState<SimilarPaper[] | null>(null)
  const [tickerLinks, setTickerLinks] = useState<PaperTickerLink[] | null>(null)
  const [linking, setLinking] = useState(false)
  useEffect(() => {
    let cancelled = false
    setCiting(null)
    setRefs(null)
    setFoundational(null)
    setFoundationalFor(null)
    void window.api.research.listCiting(paper.paperId).then((list) => {
      if (!cancelled) setCiting(list)
    })
    void window.api.research.listReferences(paper.paperId).then((list) => {
      if (!cancelled) setRefs(list)
    })
    // Foundational refs — what THIS paper builds on. Cache-first; first
    // call after bookmark may be slow if S2 is throttled, but the
    // bookmark auto-fetch usually populates it before the user opens
    // detail.
    void window.api.research.getFoundational(paper.paperId).then((list) => {
      if (!cancelled) setFoundational(list)
    })
    // Inverse — bookmarks that name this paper as foundational.
    void window.api.research.getFoundationalFor(paper.paperId).then((list) => {
      if (!cancelled) setFoundationalFor(list)
    })
    // Semantic neighbours. First call for a paper pays one S2 batch request
    // to fetch missing vectors; afterwards it is a local scan.
    setSimilar(null)
    void window.api.research
      .similar(paper.paperId, 6)
      .then((list) => {
        if (!cancelled) setSimilar(list)
      })
      .catch(() => {
        if (!cancelled) setSimilar([])
      })
    // Existing company links only — generating them costs a Claude call, so
    // that stays behind an explicit button.
    setTickerLinks(null)
    void window.api.research
      .linksForPaper(paper.paperId)
      .then((list) => {
        if (!cancelled) setTickerLinks(list)
      })
      .catch(() => {
        if (!cancelled) setTickerLinks([])
      })
    return (): void => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.paperId])

  // Tag fetch — runs on paper change AND when tagsRevision bumps
  // (covers tag mutations from elsewhere in the renderer that might
  // affect this paper's set, though that's rare).
  useEffect(() => {
    let cancelled = false
    if (!isBookmarked) {
      // Tag UI hidden when not bookmarked; skip the fetch.
      setTaggedTopics([])
      return
    }
    void window.api.research
      .listTopicsForBookmark(paper.paperId)
      .then((list) => {
        if (!cancelled) setTaggedTopics(list)
      })
      .catch(() => {
        /* keep prior */
      })
    return (): void => {
      cancelled = true
    }
  }, [paper.paperId, isBookmarked, tagsRevision])

  const handleTag = async (topicId: number): Promise<void> => {
    // Optimistic add — show the chip instantly, roll back on failure.
    const topic = availableTopics.find((t) => t.id === topicId)
    if (!topic) return
    setTaggedTopics((prev) => (prev.some((t) => t.id === topicId) ? prev : [...prev, topic]))
    setTagMenuOpen(false)
    try {
      await window.api.research.tagBookmark(paper.paperId, topicId)
      onTagsChanged()
    } catch (err) {
      console.warn('[research] tagBookmark failed:', err)
      setTaggedTopics((prev) => prev.filter((t) => t.id !== topicId))
    }
  }

  const handleUntag = async (topicId: number): Promise<void> => {
    const removed = taggedTopics.find((t) => t.id === topicId)
    setTaggedTopics((prev) => prev.filter((t) => t.id !== topicId))
    try {
      await window.api.research.untagBookmark(paper.paperId, topicId)
      onTagsChanged()
    } catch (err) {
      console.warn('[research] untagBookmark failed:', err)
      if (removed) {
        setTaggedTopics((prev) => [...prev, removed])
      }
    }
  }

  // Topics not yet tagged — populate the dropdown options.
  const taggedIds = new Set(taggedTopics.map((t) => t.id))
  const untaggedTopics = availableTopics.filter((t) => !taggedIds.has(t.id))

  const authorLine =
    paper.authors.length === 0
      ? '—'
      : paper.authors.length <= 4
        ? paper.authors.join(', ')
        : `${paper.authors.slice(0, 4).join(', ')} et al.`

  return (
    <aside className="w-[400px] shrink-0 border-l border-edge bg-surface-1 flex flex-col min-h-0">
      <header className="px-4 py-3 border-b border-edge flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          Paper detail
        </span>
        <button
          onClick={onClose}
          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-100 px-2 py-0.5"
        >
          Close ×
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
        <div>
          <div className="text-[14px] font-semibold text-zinc-50 leading-snug">
            {paper.title}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">{authorLine}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {paper.year ?? '—'}
            {paper.venue && <span> · {paper.venue}</span>}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            <span>{paper.citationCount.toLocaleString()} citations</span>
            {paper.influentialCitationCount > 0 && (
              <span className="text-violet-300">
                {paper.influentialCitationCount} influential
              </span>
            )}
          </div>
          {paper.abstract && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-300">
              {paper.abstract}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={onToggleBookmark}
              className={`text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full transition-colors ${
                isBookmarked
                  ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-500/40 hover:bg-sky-500/30'
                  : 'text-zinc-400 ring-1 ring-inset ring-edge hover:text-sky-300 hover:ring-sky-500/40'
              }`}
            >
              {isBookmarked ? '★ Bookmarked' : '☆ Bookmark'}
            </button>
            {paper.pdfUrl && (
              <button
                onClick={() => onOpenPdfInline(paper.pdfUrl!, paper.title, paper.venue)}
                className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
              >
                Read PDF here
              </button>
            )}
            {paper.pdfUrl && (
              <button
                onClick={() => onOpenURL(paper.pdfUrl!, paper.title, paper.venue)}
                className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"
                title="Open in the full-screen reader"
              >
                Open external ↗
              </button>
            )}
            {paper.url && (
              <button
                onClick={() => onOpenURL(paper.url!, paper.title, paper.venue)}
                className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"
              >
                View source ↗
              </button>
            )}
          </div>

          {/* Topics — only when bookmarked, since the FK enforces that
              the paper has a bookmark row before it can be tagged. */}
          {isBookmarked && (
            <div className="mt-3 flex items-start flex-wrap gap-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mt-1 mr-1 shrink-0">
                Topics
              </span>
              {taggedTopics.map((t) => (
                <div
                  key={t.id}
                  className="group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border border-violet-400/40 bg-violet-500/10 text-violet-200"
                >
                  <span>{t.label || t.query}</span>
                  <button
                    onClick={() => void handleUntag(t.id)}
                    title="Remove tag"
                    className="opacity-50 group-hover:opacity-100 hover:text-rose-300 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
              {untaggedTopics.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setTagMenuOpen((o) => !o)}
                    className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full text-zinc-400 ring-1 ring-inset ring-edge hover:text-violet-300 hover:ring-violet-500/40"
                  >
                    + Tag
                  </button>
                  {tagMenuOpen && (
                    <div className="absolute z-20 mt-1 left-0 min-w-[200px] max-h-[260px] overflow-y-auto rounded-md border border-edge bg-surface-2 shadow-xl py-1">
                      {untaggedTopics.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => void handleTag(t.id)}
                          className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-violet-500/10 hover:text-violet-200"
                        >
                          {t.label || t.query}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {availableTopics.length === 0 && (
                <span className="text-[10px] text-zinc-600 italic">
                  Save a topic to tag bookmarks with it
                </span>
              )}
            </div>
          )}
        </div>

        <LineageList
          title="Built on"
          subtitle="Foundational papers this work explicitly builds on (S2 isInfluential + intent in background/methodology/extension)"
          papers={foundational}
          onSelectPaper={onSelectPaper}
          accent="amber"
          glyph="▲"
        />
        {foundationalFor && foundationalFor.length > 0 && (
          <LineageList
            title="Foundational for"
            subtitle="Bookmarks that name this paper as foundational"
            papers={foundationalFor}
            onSelectPaper={onSelectPaper}
            accent="amber"
            glyph="▲"
          />
        )}
        <LineageList
          title="Cited by"
          subtitle="Top influential papers that cite this work"
          papers={citing}
          onSelectPaper={onSelectPaper}
        />
        <LineageList
          title="References"
          subtitle="Top-cited papers this work references (full bibliography)"
          papers={refs}
          onSelectPaper={onSelectPaper}
        />
        {/* Semantic neighbours. Distinct from the citation lists above:
            SPECTER2 finds papers doing the same work that may never have
            cited each other — exactly what a citation graph cannot show. */}
        {similar && similar.length > 0 && (
          <section className="mt-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
              Semantically similar
            </h4>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              Nearest SPECTER2 neighbours in your library — related work, not citations
            </p>
            <ul className="mt-1.5 space-y-1">
              {similar.map((s) => (
                <li key={s.paperId} className="flex items-center gap-2 text-[11px]">
                  <span className="shrink-0 tabular-nums text-zinc-500">
                    {(s.score * 100).toFixed(0)}%
                  </span>
                  <span className="truncate text-zinc-300">{s.paperId}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Research -> finance bridge. Generation costs a Claude call, so it
            is explicit rather than automatic on panel open. */}
        <section className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
              Related companies
            </h4>
            <button
              onClick={async () => {
                setLinking(true)
                try {
                  const links = await window.api.research.linkTickers({
                    paperId: paper.paperId,
                    title: paper.title,
                    abstract: paper.abstract
                  })
                  setTickerLinks(links)
                } catch (err) {
                  console.warn('[research] linkTickers failed:', err)
                } finally {
                  setLinking(false)
                }
              }}
              disabled={linking}
              className="rounded px-1.5 py-0.5 text-[10px] text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {linking ? 'Linking…' : tickerLinks && tickerLinks.length > 0 ? 'Regenerate' : 'Find'}
            </button>
          </div>
          {tickerLinks && tickerLinks.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {tickerLinks.map((l) => (
                <li key={l.symbol} className="text-[11px]">
                  <span className="font-semibold text-zinc-200">{l.symbol}</span>
                  <span className="ml-1 tabular-nums text-zinc-500">
                    {(l.confidence * 100).toFixed(0)}%
                  </span>
                  {l.rationale && (
                    <span className="ml-1 text-zinc-400">— {l.rationale}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-[10px] text-zinc-500">
              {tickerLinks === null
                ? 'Loading…'
                : 'No links yet — Find asks Claude which tracked companies this bears on.'}
            </p>
          )}
        </section>
      </div>
    </aside>
  )
}

function LineageList({
  title,
  subtitle,
  papers,
  onSelectPaper,
  accent,
  glyph
}: {
  title: string
  subtitle: string
  papers: ResearchPaper[] | null
  onSelectPaper: (p: ResearchPaper) => void
  // Optional accent — currently 'amber' for the foundational sections
  // (Built on / Foundational for) to distinguish them from the
  // emerald-tinted Cited-by / References lineage. Default is the
  // existing zinc/violet styling.
  accent?: 'amber'
  glyph?: string
}): JSX.Element {
  const titleTone =
    accent === 'amber' ? 'text-amber-300' : 'text-zinc-400'
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        {glyph && (
          <span className={`text-[12px] leading-none ${titleTone}`}>{glyph}</span>
        )}
        <h4
          className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${titleTone}`}
        >
          {title}
        </h4>
        {papers !== null && (
          <span className="text-[10px] tabular-nums text-zinc-600">{papers.length}</span>
        )}
      </div>
      <div className="text-[10px] text-zinc-600 mb-2">{subtitle}</div>
      {papers === null ? (
        <div className="text-[11px] text-zinc-500">Loading…</div>
      ) : papers.length === 0 ? (
        <div className="text-[11px] text-zinc-500">No data</div>
      ) : (
        <ul className="space-y-1.5">
          {papers.map((p) => (
            <li key={p.paperId}>
              <button
                onClick={() => onSelectPaper(p)}
                className="w-full text-left rounded px-2 py-1.5 hover:bg-surface-2 transition-colors"
              >
                <div className="text-[12px] text-zinc-200 leading-snug truncate">
                  {p.title}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">
                  {p.authors.slice(0, 2).join(', ')}
                  {p.authors.length > 2 && ' et al.'}
                  {p.year && ` · ${p.year}`}
                  {p.influentialCitationCount > 0 && (
                    <span className="text-violet-400">
                      {' · '}
                      {p.influentialCitationCount} influential
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
