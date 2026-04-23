// Audit panel for the value-chain growth pipeline. Surfaces:
//   - Last-7-days accept/reject counts
//   - "Run sweep now" button for ad-hoc kicks
//   - Active overlay edges with Undo buttons
//   - Recent audit log (both accepts and rejects) so users can spot-check
//     the auto-judge's decisions
//
// The queue is automatic — there's no pre-commit gate — but every decision
// is legible here so users can roll back anything that looks wrong.

import { useCallback, useEffect, useState } from 'react'

import type {
  GraphCandidate,
  GraphCandidateEdgePayload,
  GraphCandidateStatus,
  GraphEdgeOverride,
  GraphSweepSummary
} from '../../preload'

const DAY_MS = 24 * 60 * 60 * 1000

function relationshipTone(rel: string): string {
  switch (rel) {
    case 'supplier':
      return 'bg-indigo-500/15 text-indigo-200 ring-indigo-500/40'
    case 'competitor':
      return 'bg-orange-500/15 text-orange-200 ring-orange-500/40'
    case 'partner':
      return 'bg-sky-500/15 text-sky-200 ring-sky-500/40'
    case 'customer':
      return 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40'
    default:
      return 'bg-zinc-700/50 text-zinc-300 ring-zinc-600/50'
  }
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function GraphUpdatesTab(): JSX.Element {
  const [overrides, setOverrides] = useState<GraphEdgeOverride[]>([])
  const [candidates, setCandidates] = useState<GraphCandidate[]>([])
  const [counts, setCounts] = useState<{ accepted: number; rejected: number }>({
    accepted: 0,
    rejected: 0
  })
  const [sweeping, setSweeping] = useState(false)
  const [lastSummary, setLastSummary] = useState<GraphSweepSummary | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    const [overrideRows, auditRows, weekCounts] = await Promise.all([
      window.api.graph.listOverrides(),
      window.api.graph.listCandidates({ limit: 40 }),
      window.api.graph.countSince(Date.now() - 7 * DAY_MS)
    ])
    setOverrides(overrideRows)
    setCandidates(auditRows)
    setCounts(weekCounts)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return window.api.graph.onUpdated(() => {
      void reload()
    })
  }, [reload])

  const onRunSweep = async (): Promise<void> => {
    setSweeping(true)
    try {
      const summary = await window.api.graph.runSweep()
      setLastSummary(summary)
      await reload()
    } finally {
      setSweeping(false)
    }
  }

  const onUndo = async (
    fromSymbol: string,
    toSymbol: string,
    relationship: string
  ): Promise<void> => {
    // Find the most recent accepted candidate for this edge so the undo
    // call can flip it to rejected in the audit log too.
    const candidate = candidates.find(
      (c) =>
        c.kind === 'edge' &&
        c.status === 'accepted' &&
        c.fromSymbol === fromSymbol &&
        c.toSymbol === toSymbol
    )
    await window.api.graph.undoOverride(
      fromSymbol,
      toSymbol,
      relationship,
      candidate?.id ?? null
    )
    await reload()
  }

  return (
    <div className="p-5 space-y-6">
      <header>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400 mb-2">
          Automated graph growth
        </h3>
        <p className="text-[12px] text-zinc-400 leading-snug max-w-2xl">
          A weekly sweep scans articles for ticker pairs that co-occur, asks the
          local Ollama judge whether the pair is a genuine supplier / customer
          / competitor / partner relationship, and auto-commits high-confidence
          edges onto the value-chain graph. The log below shows every decision;
          Undo removes an accepted edge and blocks it from being re-proposed.
        </p>
      </header>

      <section className="rounded-xl border border-edge bg-surface-0 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-[11.5px] text-zinc-300 tabular-nums">
            <span>
              <span className="text-emerald-300 font-semibold">{counts.accepted}</span>{' '}
              <span className="text-zinc-500">accepted · last 7d</span>
            </span>
            <span>
              <span className="text-red-300 font-semibold">{counts.rejected}</span>{' '}
              <span className="text-zinc-500">rejected · last 7d</span>
            </span>
            <span>
              <span className="text-zinc-200 font-semibold">{overrides.length}</span>{' '}
              <span className="text-zinc-500">active overlays</span>
            </span>
          </div>
          <button
            onClick={onRunSweep}
            disabled={sweeping}
            className={`text-[10.5px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full ring-1 ring-inset transition-colors ${
              sweeping
                ? 'bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait'
                : 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40 hover:bg-emerald-500/25'
            }`}
          >
            {sweeping ? 'Sweeping…' : 'Run sweep now'}
          </button>
        </div>
        {lastSummary && (
          <div className="mt-2 text-[11px] text-zinc-500">
            Last sweep — {lastSummary.proposed} proposed · {lastSummary.accepted}{' '}
            accepted · {lastSummary.rejected} rejected · {lastSummary.skipped} skipped
          </div>
        )}
      </section>

      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2">
          Active overlay edges ({overrides.length})
        </h4>
        {overrides.length === 0 ? (
          <p className="text-[12px] text-zinc-500">
            No edges auto-accepted yet. The first sweep runs ~5 minutes after the
            app starts; weekly after that.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {overrides.map((o) => (
              <li
                key={`${o.fromSymbol}-${o.toSymbol}-${o.relationship}`}
                className="flex items-start gap-3 rounded-lg border border-edge/60 bg-surface-0 px-3 py-2"
              >
                <span
                  className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.15em] px-2 py-0.5 rounded ring-1 ring-inset ${relationshipTone(
                    o.relationship
                  )}`}
                >
                  {o.relationship}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-zinc-200 font-semibold tabular-nums">
                    {o.fromSymbol} → {o.toSymbol}
                  </div>
                  {o.note && (
                    <div className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                      {o.note}
                    </div>
                  )}
                  <div className="text-[10px] text-zinc-600 mt-0.5 tabular-nums">
                    {formatDate(o.acceptedAt)} · source: {o.source}
                    {o.weight !== null && ` · confidence ${o.weight.toFixed(2)}`}
                  </div>
                </div>
                <button
                  onClick={() => onUndo(o.fromSymbol, o.toSymbol, o.relationship)}
                  className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-red-500/15 text-red-200 ring-1 ring-inset ring-red-500/40 hover:bg-red-500/25"
                  title="Remove this edge from the overlay. It won't be re-proposed."
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2">
          Recent audit log
        </h4>
        {candidates.length === 0 ? (
          <p className="text-[12px] text-zinc-500">
            No decisions logged yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {candidates.map((c) => (
              <CandidateRow key={c.id} candidate={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function CandidateRow({ candidate }: { candidate: GraphCandidate }): JSX.Element {
  const [open, setOpen] = useState(false)
  const payload = candidate.payload as GraphCandidateEdgePayload
  const statusTone: Record<GraphCandidateStatus, string> = {
    accepted: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40',
    rejected: 'bg-zinc-700/50 text-zinc-400 ring-zinc-600/50',
    pending: 'bg-amber-500/15 text-amber-200 ring-amber-500/40'
  }
  return (
    <li className="rounded-lg border border-edge/40 bg-surface-0/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-surface-2/30 rounded-lg"
      >
        <span
          className={`shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.16em] px-2 py-0.5 rounded ring-1 ring-inset ${
            statusTone[candidate.status]
          }`}
        >
          {candidate.status}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] text-zinc-200 tabular-nums">
            {candidate.fromSymbol ?? '—'} → {candidate.toSymbol ?? '—'}
            {payload?.relationship && payload.relationship !== 'unclear' && (
              <span className="text-zinc-500"> · {payload.relationship}</span>
            )}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5 tabular-nums">
            {formatDate(candidate.createdAt)} · confidence{' '}
            {candidate.confidence.toFixed(2)} · {candidate.source}
          </div>
        </div>
        <span className="shrink-0 text-[10px] text-zinc-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 text-[11px] leading-snug">
          {payload?.note && (
            <div>
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Proposed note
              </div>
              <div className="text-zinc-300">{payload.note}</div>
            </div>
          )}
          {candidate.reviewNote && (
            <div>
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Judge rationale
              </div>
              <div className="text-zinc-400 italic">{candidate.reviewNote}</div>
            </div>
          )}
          {candidate.evidence.length > 0 && (
            <div>
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-1">
                Evidence ({candidate.evidence.length})
              </div>
              <ul className="space-y-0.5">
                {candidate.evidence.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    {e.url ? (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-300 hover:text-zinc-100 underline decoration-dotted underline-offset-2"
                      >
                        {e.title}
                      </a>
                    ) : (
                      <span className="text-zinc-300">{e.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
