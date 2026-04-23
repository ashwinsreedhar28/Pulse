import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  PersonalMatch,
  PersonalMatchKind,
  RelevanceResponse
} from '../../preload'

// Per-article personalization card rendered above the reader body. Matches
// compute synchronously and paint instantly; the one-sentence Ollama brief
// arrives via the `relevance:updated` broadcast and swaps in without a
// layout shift.
interface Tone {
  label: string
  chipBorder: string
  chipBg: string
  chipText: string
  dot: string
}

const TONE: Record<PersonalMatchKind, Tone> = {
  'ticker-direct': {
    label: 'Watchlist',
    chipBorder: 'border-emerald-400/50',
    chipBg: 'bg-emerald-500/10',
    chipText: 'text-emerald-100',
    dot: 'bg-emerald-400'
  },
  'ticker-indirect': {
    label: 'Value chain',
    chipBorder: 'border-indigo-400/50',
    chipBg: 'bg-indigo-500/10',
    chipText: 'text-indigo-100',
    dot: 'bg-indigo-400'
  },
  team: {
    label: 'Team',
    chipBorder: 'border-amber-400/50',
    chipBg: 'bg-amber-500/10',
    chipText: 'text-amber-100',
    dot: 'bg-amber-400'
  },
  athlete: {
    label: 'Athlete',
    chipBorder: 'border-rose-400/50',
    chipBg: 'bg-rose-500/10',
    chipText: 'text-rose-100',
    dot: 'bg-rose-400'
  },
  geo: {
    label: 'Location',
    chipBorder: 'border-sky-400/50',
    chipBg: 'bg-sky-500/10',
    chipText: 'text-sky-100',
    dot: 'bg-sky-400'
  }
}

export interface WhyThisMattersProps {
  articleId: number
  title: string
  summary: string | null
  body: string | null
}

export function WhyThisMatters({
  articleId,
  title,
  summary,
  body
}: WhyThisMattersProps): JSX.Element | null {
  const [state, setState] = useState<RelevanceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)

  // Reset state when the user switches articles so the skeleton shows for a
  // fresh fetch. Body/summary changes on the same article should not flash
  // the skeleton — they just refine the match set.
  useEffect(() => {
    setState(null)
    setError(null)
  }, [articleId])

  // Fetch cached (or compute) relevance. Re-runs when body arrives after
  // the initial reader extract so the matcher has the full text to work
  // with. If the row is already cached (common case), the second call is a
  // cheap lookup that won't redo Ollama work.
  useEffect(() => {
    const reqId = ++reqRef.current
    let cancelled = false
    window.api.relevance
      .get({ articleId, title, summary, body })
      .then((res) => {
        if (cancelled || reqRef.current !== reqId) return
        setState(res)
      })
      .catch((err: unknown) => {
        if (cancelled || reqRef.current !== reqId) return
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [articleId, title, summary, body])

  // Subscribe to background summary completion. Only swap in payloads for
  // the current article.
  useEffect(() => {
    const off = window.api.relevance.onUpdated((payload) => {
      if (payload.articleId !== articleId) return
      setState(payload)
    })
    return off
  }, [articleId])

  const visibleMatches = useMemo<PersonalMatch[]>(
    () => (state?.matches ?? []).slice(0, 4),
    [state]
  )

  if (error) return null
  if (!state) {
    // Initial paint before the IPC round-trip lands. Keeps the layout stable
    // so the article body doesn't jump once matches arrive. Only shows up
    // for a few ms on cached rows.
    return <WhyThisMattersSkeleton />
  }
  if (state.status === 'no_matches' || visibleMatches.length === 0) return null

  const prose = state.summary
  const showPending = state.status === 'pending' && !prose
  const showOffline = state.status === 'offline' && !prose
  const showError = state.status === 'error' && !prose

  return (
    <aside
      data-lookup-context="Pulse personalization card"
      className="mb-10 rounded-xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/10 via-zinc-900/50 to-violet-500/10 px-5 py-4 shadow-[0_1px_30px_-12px_rgba(129,140,248,0.35)]"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />
        <span className="text-[10px] uppercase tracking-[0.22em] text-indigo-200/80">
          Why this matters to you
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {visibleMatches.map((m, i) => (
          <MatchChip key={`${m.kind}:${m.label}:${i}`} match={m} />
        ))}
      </div>
      {prose ? (
        <p className="text-[13.5px] leading-[1.6] text-zinc-200">{prose}</p>
      ) : showPending ? (
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" />
          <span>Pulse is connecting this to your world…</span>
        </div>
      ) : showOffline ? (
        <p className="text-[12px] text-zinc-500">
          Ollama is offline — showing the matches only. Start Ollama to get the
          personalized brief on your next reopen.
        </p>
      ) : showError ? (
        <p className="text-[12px] text-zinc-500">
          The brief couldn’t be generated this time. Try reopening the article.
        </p>
      ) : null}
    </aside>
  )
}

function MatchChip({ match }: { match: PersonalMatch }): JSX.Element {
  const tone = TONE[match.kind]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone.chipBorder} ${tone.chipBg} ${tone.chipText}`}
      title={match.detail}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      <span>{match.label}</span>
      <span className="text-[10px] opacity-70">· {match.detail}</span>
    </span>
  )
}

function WhyThisMattersSkeleton(): JSX.Element {
  return (
    <aside className="mb-10 rounded-xl border border-zinc-800/60 bg-zinc-900/20 px-5 py-4">
      <div className="h-2 w-28 rounded bg-zinc-800/70 animate-pulse mb-3" />
      <div className="flex gap-1.5 mb-3">
        <div className="h-5 w-20 rounded-full bg-zinc-800/60 animate-pulse" />
        <div className="h-5 w-28 rounded-full bg-zinc-800/60 animate-pulse" />
      </div>
      <div className="h-2 w-3/4 rounded bg-zinc-800/50 animate-pulse" />
    </aside>
  )
}
