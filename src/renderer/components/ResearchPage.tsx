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
  ResearchBriefBullet,
  ResearchBriefPayload,
  ResearchBriefSection,
  ResearchPaper,
  ResearchTopic
} from '../../preload'
import { CollapseChevron, useCollapsedSection } from './collapseUI'

interface Props {
  onClose: () => void
  // Reuse the in-app external reader to open paper PDFs / abstracts.
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
}

interface ViewState {
  // 'idle' = initial blank state, 'loading' = mid-search,
  // 'results' = brief + papers loaded, 'topic' = viewing a saved
  // topic's cached brief.
  kind: 'idle' | 'loading' | 'results' | 'topic'
  query: string
  brief: ResearchBriefPayload | null
  papers: ResearchPaper[]
  // When kind='topic', the topicId being viewed (so refresh routes
  // to the right row).
  topicId: number | null
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
  const inputRef = useRef<HTMLInputElement>(null)

  // ----- saved topics -----
  const reloadTopics = useCallback(async (): Promise<void> => {
    const list = await window.api.research.listTopics()
    setTopics(list)
  }, [])

  useEffect(() => {
    void reloadTopics()
    const unsub = window.api.research.onTopicUpdated((topicId) => {
      void reloadTopics()
      // If we're viewing this topic, refresh the brief automatically.
      if (view.kind === 'topic' && view.topicId === topicId) {
        void window.api.research.getBrief(topicId).then((row) => {
          if (!row) return
          setView((prev) => ({ ...prev, brief: row.payload }))
        })
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const row = await window.api.research.getBrief(topic.id)
    if (row) {
      // Re-fetch papers via search to fill the cards (we only persist
      // paperIds + the brief payload; not the full paper objects).
      const result = await window.api.research.search(topic.query)
      setView({
        kind: 'topic',
        query: topic.query,
        brief: row.payload,
        papers: result.papers,
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
      setView((prev) => ({ ...prev, kind: 'loading' }))
      await window.api.research.refreshTopic(view.topicId)
      // Brief lands via onTopicUpdated.
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
          {topics.length > 0 && (
            <SavedTopicsStrip
              topics={topics}
              activeId={view.topicId}
              onOpen={openTopic}
              onDelete={deleteTopic}
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

          {view.papers.length > 0 && (
            <PaperList
              papers={view.papers}
              onSelect={(p) => setSelectedPaper(p)}
              selectedId={selectedPaper?.paperId ?? null}
              onOpenURL={onOpenURL}
            />
          )}
        </div>

        {selectedPaper && (
          <PaperDetailPanel
            paper={selectedPaper}
            onClose={() => setSelectedPaper(null)}
            onOpenURL={onOpenURL}
            onSelectPaper={setSelectedPaper}
          />
        )}
      </div>
    </section>
  )
}

// ---------- Saved-topics strip --------------------------------------------

function SavedTopicsStrip({
  topics,
  activeId,
  onOpen,
  onDelete
}: {
  topics: ResearchTopic[]
  activeId: number | null
  onOpen: (t: ResearchTopic) => void
  onDelete: (id: number) => void
}): JSX.Element {
  return (
    <div className="mb-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2">
        Saved Topics
      </div>
      <div className="flex flex-wrap gap-1.5">
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
  onOpenURL
}: {
  papers: ResearchPaper[]
  onSelect: (p: ResearchPaper) => void
  selectedId: string | null
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
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
          Papers
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
            />
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
  onOpenURL
}: {
  paper: ResearchPaper
  selected: boolean
  onSelect: () => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
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
      {(paper.url || paper.pdfUrl) && (
        <div className="mt-2 flex items-center gap-2">
          {paper.pdfUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenURL(paper.pdfUrl!, paper.title, paper.venue)
              }}
              className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
            >
              PDF ↗
            </button>
          )}
          {paper.url && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenURL(paper.url!, paper.title, paper.venue)
              }}
              className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"
            >
              Source ↗
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Detail panel (citation lineage) -------------------------------

function PaperDetailPanel({
  paper,
  onClose,
  onOpenURL,
  onSelectPaper
}: {
  paper: ResearchPaper
  onClose: () => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
  onSelectPaper: (p: ResearchPaper) => void
}): JSX.Element {
  const [citing, setCiting] = useState<ResearchPaper[] | null>(null)
  const [refs, setRefs] = useState<ResearchPaper[] | null>(null)
  useEffect(() => {
    let cancelled = false
    setCiting(null)
    setRefs(null)
    void window.api.research.listCiting(paper.paperId).then((list) => {
      if (!cancelled) setCiting(list)
    })
    void window.api.research.listReferences(paper.paperId).then((list) => {
      if (!cancelled) setRefs(list)
    })
    return (): void => {
      cancelled = true
    }
  }, [paper.paperId])

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
          {(paper.pdfUrl || paper.url) && (
            <div className="mt-3 flex items-center gap-2">
              {paper.pdfUrl && (
                <button
                  onClick={() => onOpenURL(paper.pdfUrl!, paper.title, paper.venue)}
                  className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30"
                >
                  Read PDF ↗
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
          )}
        </div>

        <LineageList
          title="Cited by"
          subtitle="Top influential papers that cite this work"
          papers={citing}
          onSelectPaper={onSelectPaper}
        />
        <LineageList
          title="References"
          subtitle="Top-cited foundational papers this work builds on"
          papers={refs}
          onSelectPaper={onSelectPaper}
        />
      </div>
    </aside>
  )
}

function LineageList({
  title,
  subtitle,
  papers,
  onSelectPaper
}: {
  title: string
  subtitle: string
  papers: ResearchPaper[] | null
  onSelectPaper: (p: ResearchPaper) => void
}): JSX.Element {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
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
