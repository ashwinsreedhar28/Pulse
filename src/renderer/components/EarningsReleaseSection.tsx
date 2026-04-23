// Earnings release summary — surfaces the most recent 8-K Item 2.02 for a
// ticker at the top of the detail page with an AI-summarized overview, key
// numbers, guidance, and management quotes, plus out-links to external
// transcript services. Hidden when there's no recent earnings release on
// file so inactive / post-IPO symbols don't render an empty shell.
//
// Rationale: the earnings release is the single biggest "what happened this
// quarter" signal Pulse has on a ticker. Burying it in a row that needs an
// explicit click meant users missed it; surfacing the latest one as a
// top-of-page briefing makes the detail page feel like a quarter-in-review
// page rather than a filings database.

import { useEffect, useState } from 'react'

import type { EarningsReleaseRow, SecFiling } from '../../preload'
import { CollapsibleSection } from './CollapsibleSection'

export function EarningsReleaseSection({ symbol }: { symbol: string }): JSX.Element | null {
  const [latest, setLatest] = useState<{
    filing: SecFiling
    summary: EarningsReleaseRow | null
  } | null | undefined>(undefined)
  const [working, setWorking] = useState(false)

  const load = (): Promise<void> =>
    Promise.all([
      window.api.sec.getFilings(symbol, 25, true),
      window.api.sec.getReleaseSummariesForSymbol(symbol, 25)
    ]).then(([filings, summaries]) => {
      const latestEarnings = filings.find(isEarningsRelease)
      if (!latestEarnings) {
        setLatest(null)
        return
      }
      const summary =
        summaries.find((s) => s.accessionNumber === latestEarnings.accessionNumber) ?? null
      setLatest({ filing: latestEarnings, summary })
    })

  useEffect(() => {
    let cancelled = false
    setLatest(undefined)
    load().catch(() => {
      if (!cancelled) setLatest(null)
    })
    return () => {
      cancelled = true
    }
  }, [symbol])

  useEffect(() => {
    return window.api.sec.onReleaseSummaryUpdated((updatedSymbol) => {
      if (updatedSymbol.toUpperCase() !== symbol.toUpperCase()) return
      void load()
    })
  }, [symbol])

  useEffect(() => {
    return window.api.sec.onUpdated((updatedSymbol) => {
      if (updatedSymbol.toUpperCase() !== symbol.toUpperCase()) return
      void load()
    })
  }, [symbol])

  // Still loading on first mount — avoid the flash.
  if (latest === undefined) {
    return (
      <CollapsibleSection title="Earnings release" meta="latest 8-K Item 2.02" defaultOpen>
        <div className="text-[12px] text-zinc-500">Looking for the latest earnings release…</div>
      </CollapsibleSection>
    )
  }

  // No earnings 8-K on file for this ticker. Hide rather than render an empty
  // section — the symbol might not be public, might not have reported yet, or
  // filings might not have been fetched. SEC filings below will explain.
  if (latest === null) return null

  const handleGenerate = (): void => {
    setWorking(true)
    window.api.sec
      .summarizeRelease(symbol, latest.filing.accessionNumber)
      .then((row) => {
        if (row) setLatest({ filing: latest.filing, summary: row })
      })
      .catch(() => {
        /* status will flip to 'error' on broadcast refetch */
      })
      .finally(() => {
        setWorking(false)
      })
  }

  const filedStr = new Date(latest.filing.filedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

  const canGenerate =
    !latest.summary ||
    latest.summary.status === 'offline' ||
    latest.summary.status === 'error' ||
    (latest.summary.status === 'ready' && !latest.summary.summary)

  return (
    <CollapsibleSection
      title="Earnings release"
      meta={`${filedStr} · 8-K`}
      defaultOpen
    >
      <EarningsSummaryCard
        summary={latest.summary}
        canGenerate={canGenerate}
        working={working || latest.summary?.status === 'pending'}
        onGenerate={handleGenerate}
      />
      <TranscriptLinks symbol={symbol} filedAt={latest.filing.filedAt} />
      <div className="mt-3 pt-3 border-t border-edge/30 flex items-center justify-between gap-3">
        <span className="text-[10px] text-zinc-600">
          Accession {latest.filing.accessionNumber}
        </span>
        <a
          href={latest.filing.primaryDocUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25"
        >
          Open full filing ↗
        </a>
      </div>
    </CollapsibleSection>
  )
}

function isEarningsRelease(filing: SecFiling): boolean {
  if (!filing.formType.startsWith('8-K')) return false
  if (!filing.items) return false
  return filing.items.split(',').some((code) => code.trim() === '2.02')
}

// Self-contained render of the structured summary. Mirrors the SummaryBody
// inside SecFilingsSection — kept parallel deliberately so both surfaces show
// identical prose, numbers, guidance, and quotes. If you tweak one, tweak the
// other.
function EarningsSummaryCard({
  summary,
  canGenerate,
  working,
  onGenerate
}: {
  summary: EarningsReleaseRow | null
  canGenerate: boolean
  working: boolean
  onGenerate: () => void
}): JSX.Element {
  if (working) {
    return (
      <div className="text-[11.5px] text-zinc-400 italic">
        Summarizing the earnings release via local Ollama… (~15-30 seconds the first time)
      </div>
    )
  }
  if (!summary || !summary.summary) {
    const offlineLabel =
      summary?.status === 'offline'
        ? 'Ollama was offline when we last tried. Retry?'
        : summary?.status === 'error'
          ? 'Summary failed previously (usually a non-HTML exhibit). Retry anyway?'
          : 'Generate an AI summary of the latest earnings release?'
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11.5px] text-zinc-400">{offlineLabel}</div>
        {canGenerate && (
          <button
            onClick={onGenerate}
            className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-500/40 hover:bg-sky-500/25"
          >
            Generate summary
          </button>
        )}
      </div>
    )
  }

  const s = summary.summary
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1">
          Overview
        </div>
        <p className="text-[13px] text-zinc-100 leading-relaxed">{s.overview}</p>
      </div>
      {s.keyNumbers.length > 0 && (
        <div>
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1.5">
            Key numbers
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
            {s.keyNumbers.map((kn, i) => (
              <div key={i} className="flex flex-col min-w-0">
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500"
                  title={kn.label}
                >
                  {kn.label}
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-zinc-100 leading-snug break-words">
                  {kn.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {s.guidance.length > 0 && (
        <div>
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1">
            Guidance
          </div>
          <ul className="text-[12px] text-zinc-300 leading-snug list-disc ml-4 space-y-0.5">
            {s.guidance.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {s.quotes.length > 0 && (
        <div>
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1">
            Quotes
          </div>
          <div className="space-y-1">
            {s.quotes.map((q, i) => (
              <blockquote
                key={i}
                className="text-[12px] text-zinc-300 italic border-l-2 border-sky-500/40 pl-2.5"
              >
                {q}
              </blockquote>
            ))}
          </div>
        </div>
      )}
      {summary.generatedAt && (
        <div className="text-[9.5px] text-zinc-600 pt-1">
          Generated by local Ollama · {new Date(summary.generatedAt).toLocaleString()} ·{' '}
          {summary.rawTextLength?.toLocaleString() ?? '?'} chars extracted from filing
        </div>
      )}
    </div>
  )
}

function TranscriptLinks({ symbol, filedAt }: { symbol: string; filedAt: number }): JSX.Element {
  const year = new Date(filedAt).getFullYear()
  const quarter = Math.floor(new Date(filedAt).getMonth() / 3) + 1
  const sa = `https://seekingalpha.com/symbol/${encodeURIComponent(symbol)}/earnings/transcripts`
  const yahoo = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`
  const foolSearch = `https://www.google.com/search?q=${encodeURIComponent(
    `${symbol} Q${quarter} ${year} earnings call transcript site:fool.com`
  )}`
  return (
    <div className="mt-4 pt-3 border-t border-edge/30">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1.5">
        Call transcripts & replays
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip label="Seeking Alpha" href={sa} />
        <Chip label="Motley Fool" href={foolSearch} />
        <Chip label="Yahoo Finance" href={yahoo} />
      </div>
      <p className="mt-1.5 text-[10px] text-zinc-600 leading-snug">
        The summary above is built from the company&apos;s 8-K press release (Item 2.02
        exhibit). For the live Q&amp;A, these external sources carry the full transcript —
        Pulse doesn&apos;t mirror them locally.
      </p>
    </div>
  )
}

function Chip({ label, href }: { label: string; href: string }): JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[10px] font-semibold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full bg-zinc-800/70 text-zinc-300 ring-1 ring-inset ring-zinc-600/60 hover:bg-zinc-700 hover:text-zinc-100"
    >
      {label} ↗
    </a>
  )
}
