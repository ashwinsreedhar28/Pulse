// SEC EDGAR filings feed for a single ticker. Each row is a filing; 8-K Item
// 2.02 rows (earnings releases) expand into an AI-summarized card with
// structured overview / key numbers / guidance / quotes plus out-links to
// external transcript services for the live-call Q&A.
//
// The scheduler populates the filings table daily; the earnings-release
// summary pipeline picks up new 8-K 2.02s automatically, but users can
// manually trigger summarization on older rows that landed pre-feature.

import { useEffect, useState } from 'react'

import type { EarningsReleaseRow, SecFiling } from '../../preload'
import { CollapsibleSection } from './CollapsibleSection'

const FORM_BUCKET: Record<string, { tone: string; label: string }> = {
  '8-K': { tone: 'bg-sky-500/15 text-sky-200 ring-sky-500/40', label: '8-K' },
  '8-K/A': { tone: 'bg-sky-500/15 text-sky-200 ring-sky-500/40', label: '8-K/A' },
  '10-Q': { tone: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40', label: '10-Q' },
  '10-Q/A': { tone: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40', label: '10-Q/A' },
  '10-K': { tone: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40', label: '10-K' },
  '10-K/A': { tone: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40', label: '10-K/A' },
  'DEF 14A': { tone: 'bg-indigo-500/15 text-indigo-200 ring-indigo-500/40', label: 'Proxy' },
  DEFA14A: { tone: 'bg-indigo-500/15 text-indigo-200 ring-indigo-500/40', label: 'Proxy+' },
  '4': { tone: 'bg-amber-500/15 text-amber-200 ring-amber-500/40', label: 'Form 4' },
  'SC 13D': { tone: 'bg-orange-500/15 text-orange-200 ring-orange-500/40', label: '13D' },
  'SC 13D/A': { tone: 'bg-orange-500/15 text-orange-200 ring-orange-500/40', label: '13D/A' },
  'SC 13G': { tone: 'bg-orange-500/15 text-orange-200 ring-orange-500/40', label: '13G' },
  'SC 13G/A': { tone: 'bg-orange-500/15 text-orange-200 ring-orange-500/40', label: '13G/A' },
  'S-1': { tone: 'bg-purple-500/15 text-purple-200 ring-purple-500/40', label: 'S-1' },
  'S-1/A': { tone: 'bg-purple-500/15 text-purple-200 ring-purple-500/40', label: 'S-1/A' },
  '424B5': { tone: 'bg-purple-500/15 text-purple-200 ring-purple-500/40', label: 'Pricing' },
  '424B2': { tone: 'bg-purple-500/15 text-purple-200 ring-purple-500/40', label: 'Pricing' },
  'F-1': { tone: 'bg-purple-500/15 text-purple-200 ring-purple-500/40', label: 'F-1' }
}

function bucketFor(formType: string): { tone: string; label: string } {
  return (
    FORM_BUCKET[formType] ?? {
      tone: 'bg-zinc-700/50 text-zinc-300 ring-zinc-600/50',
      label: formType
    }
  )
}

function formatFiledDate(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const ITEM_LABEL: Record<string, string> = {
  '1.01': 'Material agreement',
  '1.02': 'Terminated agreement',
  '2.01': 'Acquisition / disposition',
  '2.02': 'Results of operations',
  '2.03': 'New material obligation',
  '2.05': 'Restructuring costs',
  '2.06': 'Material impairments',
  '3.01': 'Listing transfer / notice',
  '3.02': 'Unregistered securities',
  '4.01': 'Auditor change',
  '4.02': 'Financial restatement',
  '5.01': 'Change in control',
  '5.02': 'Leadership change',
  '5.03': 'Bylaw amendment',
  '5.07': 'Shareholder vote',
  '7.01': 'Reg FD disclosure',
  '8.01': 'Other events',
  '9.01': 'Financial exhibits'
}

function describeItems(items: string | null): string | null {
  if (!items) return null
  const labels = items
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((code) => ITEM_LABEL[code] ?? code)
  if (labels.length === 0) return null
  return [...new Set(labels)].join(' · ')
}

function isEarningsRelease(filing: SecFiling): boolean {
  if (!filing.formType.startsWith('8-K')) return false
  if (!filing.items) return false
  return filing.items.split(',').some((code) => code.trim() === '2.02')
}

export function SecFilingsSection({ symbol }: { symbol: string }): JSX.Element {
  const [filings, setFilings] = useState<SecFiling[] | null>(null)
  const [summaries, setSummaries] = useState<Map<string, EarningsReleaseRow>>(() => new Map())
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api.sec.getFilings(symbol, 25, true),
      window.api.sec.getReleaseSummariesForSymbol(symbol, 25)
    ])
      .then(([rows, releases]) => {
        if (cancelled) return
        setFilings(rows)
        const m = new Map<string, EarningsReleaseRow>()
        for (const r of releases) m.set(r.accessionNumber, r)
        setSummaries(m)
        if (rows.length === 0) {
          setRefreshing(true)
          window.api.sec
            .refreshFilings(symbol)
            .then(() => window.api.sec.getFilings(symbol, 25, true))
            .then((rows2) => {
              if (!cancelled) setFilings(rows2)
            })
            .catch(() => {
              /* swallow — empty state stays */
            })
            .finally(() => {
              if (!cancelled) setRefreshing(false)
            })
        }
      })
      .catch(() => {
        if (!cancelled) setFilings([])
      })
    return () => {
      cancelled = true
    }
  }, [symbol])

  useEffect(() => {
    return window.api.sec.onUpdated((updatedSymbol) => {
      if (updatedSymbol.toUpperCase() !== symbol.toUpperCase()) return
      window.api.sec
        .getFilings(symbol, 25, true)
        .then(setFilings)
        .catch(() => {
          /* keep prior list */
        })
    })
  }, [symbol])

  // Summary broadcasts come in whenever the earnings-release pipeline flips
  // a row's status. Refetch the batch so every row reflects the latest state
  // in one pass rather than tracking per-accession updates.
  useEffect(() => {
    return window.api.sec.onReleaseSummaryUpdated((updatedSymbol) => {
      if (updatedSymbol.toUpperCase() !== symbol.toUpperCase()) return
      window.api.sec
        .getReleaseSummariesForSymbol(symbol, 25)
        .then((releases) => {
          const m = new Map<string, EarningsReleaseRow>()
          for (const r of releases) m.set(r.accessionNumber, r)
          setSummaries(m)
        })
        .catch(() => {
          /* keep prior map */
        })
    })
  }, [symbol])

  return (
    <CollapsibleSection title="SEC filings" meta="via EDGAR" defaultOpen>
      {filings === null && (
        <div className="text-[12px] text-zinc-500">Loading filings…</div>
      )}
      {filings !== null && filings.length === 0 && !refreshing && (
        <div className="text-[12px] text-zinc-500">
          No filings on record for this symbol yet. The scheduler will pick it up on
          the next sweep.
        </div>
      )}
      {filings !== null && filings.length === 0 && refreshing && (
        <div className="text-[12px] text-zinc-500">Fetching filings from EDGAR…</div>
      )}
      {filings !== null && filings.length > 0 && (
        <ul className="space-y-1.5">
          {filings.map((f) => (
            <FilingRow
              key={`${f.symbol}-${f.accessionNumber}`}
              filing={f}
              summary={summaries.get(f.accessionNumber) ?? null}
              symbol={symbol}
            />
          ))}
        </ul>
      )}
    </CollapsibleSection>
  )
}

function FilingRow({
  filing,
  summary,
  symbol
}: {
  filing: SecFiling
  summary: EarningsReleaseRow | null
  symbol: string
}): JSX.Element {
  const bucket = bucketFor(filing.formType)
  const itemsLabel = describeItems(filing.items)
  const desc = filing.primaryDocDescription?.trim() || null
  const title = desc && desc !== 'Primary Document' ? desc : null
  const earnings = isEarningsRelease(filing)
  const [expanded, setExpanded] = useState(false)

  return (
    <li className="py-1.5 border-b border-edge/30 last:border-b-0">
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 inline-block text-[10px] font-semibold uppercase tracking-[0.15em] px-2 py-0.5 rounded ring-1 ring-inset ${bucket.tone} min-w-[52px] text-center`}
        >
          {bucket.label}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] text-zinc-200 leading-snug">
            {title ?? filing.formType}
            {itemsLabel && <span className="text-zinc-400"> · {itemsLabel}</span>}
          </div>
          <div className="text-[10.5px] text-zinc-500 tabular-nums">
            {formatFiledDate(filing.filedAt)}
            <span className="text-zinc-700"> · </span>
            <span className="font-mono">{filing.accessionNumber}</span>
          </div>
        </div>
        {earnings && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-500/40 hover:bg-sky-500/25"
            title={expanded ? 'Collapse AI summary' : 'Open AI summary + transcript links'}
          >
            {expanded ? 'Hide' : 'AI summary ▾'}
          </button>
        )}
        <a
          href={filing.primaryDocUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25"
          title="Open filing at SEC.gov"
        >
          Open
        </a>
      </div>
      {earnings && expanded && (
        <EarningsReleasePanel
          symbol={symbol}
          accessionNumber={filing.accessionNumber}
          filedAt={filing.filedAt}
          summary={summary}
        />
      )}
    </li>
  )
}

function EarningsReleasePanel({
  symbol,
  accessionNumber,
  filedAt,
  summary
}: {
  symbol: string
  accessionNumber: string
  filedAt: number
  summary: EarningsReleaseRow | null
}): JSX.Element {
  const [working, setWorking] = useState(false)
  const [localSummary, setLocalSummary] = useState<EarningsReleaseRow | null>(summary)

  useEffect(() => {
    setLocalSummary(summary)
  }, [summary])

  const canGenerate =
    !localSummary ||
    localSummary.status === 'offline' ||
    localSummary.status === 'error' ||
    (localSummary.status === 'ready' && !localSummary.summary)

  const onGenerate = (): void => {
    setWorking(true)
    window.api.sec
      .summarizeRelease(symbol, accessionNumber)
      .then((row) => {
        setLocalSummary(row)
      })
      .catch(() => {
        /* swallow — status will say 'error' on refetch */
      })
      .finally(() => {
        setWorking(false)
      })
  }

  return (
    <div className="mt-2 ml-[64px] rounded-xl border border-edge/60 bg-surface-0 p-4">
      <SummaryBody
        summary={localSummary}
        canGenerate={canGenerate}
        working={working || localSummary?.status === 'pending'}
        onGenerate={onGenerate}
      />
      <TranscriptLinks symbol={symbol} filedAt={filedAt} />
    </div>
  )
}

function SummaryBody({
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
        Summarizing release via local Ollama… (this takes ~15-30 seconds the first time)
      </div>
    )
  }
  if (!summary || !summary.summary) {
    const offlineLabel =
      summary?.status === 'offline'
        ? 'Ollama was offline when we tried. Retry?'
        : summary?.status === 'error'
          ? 'Summary failed previously (usually a non-HTML exhibit). Retry anyway?'
          : 'Generate an AI summary of this earnings release?'
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
        <p className="text-[12.5px] text-zinc-200 leading-snug">{s.overview}</p>
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
                <span className="text-[12px] font-semibold tabular-nums text-zinc-100 leading-snug break-words">
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
          <ul className="text-[11.5px] text-zinc-300 leading-snug list-disc ml-4 space-y-0.5">
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
                className="text-[11.5px] text-zinc-300 italic border-l-2 border-sky-500/40 pl-2.5"
              >
                {q}
              </blockquote>
            ))}
          </div>
        </div>
      )}
      {summary.generatedAt && (
        <div className="text-[9.5px] text-zinc-600 pt-1 border-t border-edge/30">
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
    <div className="mt-3 pt-3 border-t border-edge/30">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1.5">
        Call transcripts & replays
      </div>
      <div className="flex flex-wrap gap-1.5">
        <TranscriptChip label="Seeking Alpha" href={sa} />
        <TranscriptChip label="Motley Fool" href={foolSearch} />
        <TranscriptChip label="Yahoo Finance" href={yahoo} />
      </div>
      <p className="mt-1.5 text-[10px] text-zinc-600 leading-snug">
        The AI summary above reflects the company&apos;s own press release (Item 2.02
        exhibit). For the live Q&amp;A session, these external sources carry full
        transcripts — Pulse doesn&apos;t mirror them locally.
      </p>
    </div>
  )
}

function TranscriptChip({ label, href }: { label: string; href: string }): JSX.Element {
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
