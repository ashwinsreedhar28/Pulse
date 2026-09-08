// Landing view for Research: recent notable work across a spread of fields.
//
// Replaces an empty search box, which was a bad front door twice over. It
// assumed the user already knew what to search for, and because the paper
// graph only grows from papers they engage with, an empty start meant the
// graph never filled. Every card here is a valid graph seed, so browsing is
// also how the graph gets built.
//
// Reads cache only. Refresh happens in the background, because Semantic
// Scholar throttles intermittently and ten live searches on mount would be
// slow and frequently render with holes.

import { useCallback, useEffect, useState } from 'react'
import type { DiscoverMode, DiscoverSection, ResearchPaper } from '../../preload'

interface Props {
  onSelectPaper: (p: ResearchPaper) => void
  /** Seeds the citation graph from this paper and opens the graph view. */
  onBuildGraph: (p: ResearchPaper) => void
  onSearch: (query: string) => void
}

function relativeAge(ms: number | null): string {
  if (ms === null) return 'not fetched yet'
  const hours = (Date.now() - ms) / 3_600_000
  if (hours < 1) return 'updated just now'
  if (hours < 24) return `updated ${Math.round(hours)}h ago`
  return `updated ${Math.round(hours / 24)}d ago`
}

export function ResearchDiscover({
  onSelectPaper,
  onBuildGraph,
  onSearch
}: Props): JSX.Element {
  const [sections, setSections] = useState<DiscoverSection[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // 'newest' is arXiv preprints by submission date — often days old. Journals
  // publish ~a year after acceptance, so anything with citations behind it is
  // necessarily months behind the field.
  const [mode, setMode] = useState<DiscoverMode>('trending')

  const load = useCallback(async (): Promise<void> => {
    try {
      setSections(await window.api.research.discover(mode))
    } catch (err) {
      console.warn('[discover] load failed:', err)
      setSections([])
    }
  }, [mode])

  useEffect(() => {
    void load()
  }, [load])

  // First open has nothing cached, so fetch once rather than showing an empty
  // page and waiting for the background scheduler's first tick.
  useEffect(() => {
    if (sections === null) return
    if (sections.some((s) => s.papers.length > 0)) return
    if (refreshing) return
    setRefreshing(true)
    void window.api.research
      .refreshDiscover(false, mode)
      .then(() => load())
      .catch((err) => console.warn('[discover] initial refresh failed:', err))
      .finally(() => setRefreshing(false))
    // Intentionally keyed on the empty state only — this must fire once when
    // the cache turns out to be cold, not on every sections update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sections === null ? null : sections.some((s) => s.papers.length > 0)])

  if (sections === null) {
    return <div className="p-8 text-sm text-zinc-400">Loading…</div>
  }

  const empty = sections.every((s) => s.papers.length === 0)

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-zinc-100">
            What&apos;s moving in research
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {mode === 'newest'
              ? 'Fresh arXiv preprints by submission date — this is the frontier, before peer review and before citations exist.'
              : 'Recent work ranked by citations per year. Open one to read it, or build a citation graph outward from it.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface-1 p-0.5 ring-1 ring-edge/60">
          {(['trending', 'newest'] as DiscoverMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setSections(null)
              }}
              title={
                m === 'newest'
                  ? 'arXiv preprints by submission date — often days old'
                  : 'Recent work ranked by citations per year'
              }
              className={
                'rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ' +
                (mode === m
                  ? 'bg-violet-500/20 text-violet-200'
                  : 'text-zinc-500 hover:text-zinc-200')
              }
            >
              {m === 'newest' ? 'Newest' : 'Trending'}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setRefreshing(true)
            void window.api.research
              .refreshDiscover(true, mode)
              .then(() => load())
              .finally(() => setRefreshing(false))
          }}
          disabled={refreshing}
          className="shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 ring-1 ring-inset ring-zinc-700 hover:bg-surface-2 hover:text-zinc-100 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {empty && refreshing && (
        <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-6 text-center text-xs text-zinc-400">
          Fetching recent work across {sections.length} fields…
          <div className="mt-1 text-[10px] text-zinc-500">
            Paced against Semantic Scholar&apos;s rate limit, so this takes a
            moment the first time. It&apos;s cached afterwards.
          </div>
        </div>
      )}

      {empty && !refreshing && (
        <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-6 text-center text-xs text-zinc-400">
          Nothing cached yet. Hit Refresh, or search for a topic directly.
        </div>
      )}

      {sections
        .filter((s) => s.papers.length > 0)
        .map((section) => (
          <section key={section.fieldId}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
                {section.label}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-600">
                  {relativeAge(section.fetchedAt)}
                </span>
                <button
                  onClick={() => onSearch(section.label)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-200"
                >
                  search this field →
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {section.papers.map((p) => (
                <article
                  key={p.paperId}
                  className="group flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 hover:border-zinc-700"
                >
                  <button
                    onClick={() => onSelectPaper(p)}
                    className="text-left text-[12px] font-medium leading-snug text-zinc-100 hover:text-violet-200"
                    title={p.title}
                  >
                    {p.title}
                  </button>
                  <div className="mt-1 text-[10px] text-zinc-500">
                    {p.authors.slice(0, 2).join(', ')}
                    {p.authors.length > 2 ? ' et al.' : ''}
                    {/* Exact date where we have it — in 'newest' the whole
                        point is that this is days old, which a bare year hides. */}
                    {p.publicationDate ? ` · ${p.publicationDate}` : p.year ? ` · ${p.year}` : ''}
                  </div>
                  {p.venue && (
                    <div className="truncate text-[10px] text-zinc-600" title={p.venue}>
                      {p.venue}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                    {/* A week-old preprint has zero citations by definition,
                        so showing "0 cites" would read as a quality signal
                        when it is only a statement about age. */}
                    {(p.citationCount > 0 || mode === 'trending') && (
                      <span className="rounded px-1 py-0.5 text-zinc-400 ring-1 ring-zinc-800">
                        {p.citationCount.toLocaleString()} cites
                      </span>
                    )}
                    {p.influentialCitationCount > 0 && (
                      <span className="rounded bg-amber-500/10 px-1 py-0.5 text-amber-300/90 ring-1 ring-amber-500/20">
                        {p.influentialCitationCount} infl.
                      </span>
                    )}
                  </div>
                  {/* Graph seeding is the point of this page, so it gets a
                      real affordance rather than being buried in the detail
                      panel. */}
                  <button
                    onClick={() => onBuildGraph(p)}
                    className="mt-2 rounded bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300/90 opacity-0 ring-1 ring-inset ring-sky-500/25 transition-opacity hover:bg-sky-500/20 group-hover:opacity-100"
                  >
                    Build graph
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))}
    </div>
  )
}
