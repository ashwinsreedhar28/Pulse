// SEC EDGAR filings feed for a single ticker, rendered on the StockDetail
// page below the value-chain card. One row per filing, form-type badge on
// the left, filed-date + description + item codes in the middle, link out
// to the SEC archive on the right.
//
// The scheduler populates this table daily; we hit the cache on mount + a
// one-time force-refresh if the row is empty (new watchlist additions
// wouldn't have filings yet).

import { useEffect, useState } from 'react'

import type { SecFiling } from '../../preload'

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

// 8-K "Items" codes carry the real meaning of the filing. Map the common
// ones to a human-readable fragment; anything unknown falls back to the
// raw code so power users still see it.
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
  // Dedupe to avoid "Material agreement, Material agreement" when multiple
  // sub-items map to the same human label.
  return [...new Set(labels)].join(' · ')
}

export function SecFilingsSection({ symbol }: { symbol: string }): JSX.Element {
  const [filings, setFilings] = useState<SecFiling[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.sec
      .getFilings(symbol, 25, true)
      .then((rows) => {
        if (cancelled) return
        setFilings(rows)
        // Cold cache: no filings yet for this symbol. Kick a one-time force
        // refresh so the user sees data within a few seconds instead of
        // waiting for the daily scheduler sweep.
        if (rows.length === 0) {
          setRefreshing(true)
          window.api.sec
            .refreshFilings(symbol)
            .then(() => window.api.sec.getFilings(symbol, 25, true))
            .then((rows2) => {
              if (!cancelled) setFilings(rows2)
            })
            .catch(() => {
              /* swallow — empty state stays visible */
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

  return (
    <section className="mt-6 rounded-2xl border border-edge bg-surface-1 p-5">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          SEC filings
        </h2>
        <span className="h-px flex-1 bg-edge/80" />
        <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          via EDGAR
        </span>
      </div>
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
            <FilingRow key={`${f.symbol}-${f.accessionNumber}`} filing={f} />
          ))}
        </ul>
      )}
    </section>
  )
}

function FilingRow({ filing }: { filing: SecFiling }): JSX.Element {
  const bucket = bucketFor(filing.formType)
  const itemsLabel = describeItems(filing.items)
  const desc = filing.primaryDocDescription?.trim() || null
  const title = desc && desc !== 'Primary Document' ? desc : null
  return (
    <li className="flex items-start gap-3 py-1.5 border-b border-edge/30 last:border-b-0">
      <span
        className={`shrink-0 inline-block text-[10px] font-semibold uppercase tracking-[0.15em] px-2 py-0.5 rounded ring-1 ring-inset ${bucket.tone} min-w-[52px] text-center`}
      >
        {bucket.label}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-zinc-200 leading-snug">
          {title ?? filing.formType}
          {itemsLabel && (
            <span className="text-zinc-400"> · {itemsLabel}</span>
          )}
        </div>
        <div className="text-[10.5px] text-zinc-500 tabular-nums">
          {formatFiledDate(filing.filedAt)}
          <span className="text-zinc-700"> · </span>
          <span className="font-mono">{filing.accessionNumber}</span>
        </div>
      </div>
      <a
        href={filing.primaryDocUrl}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25"
        title="Open filing at SEC.gov"
      >
        Open
      </a>
    </li>
  )
}
