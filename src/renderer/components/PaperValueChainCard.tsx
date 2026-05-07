// Wrapper for the per-paper value chain. Mounts inside the Research
// detail panel; loads the cached chain on render, kicks off generation
// when none exists. Mirrors UnifiedValueChainCard's shape but for
// research papers — header with focus label + regen button, body is
// the horizontal-stage diagram, plus a Phase 3B "Quoted from focal
// paper" panel listing edges that Haiku grounded with paper-pdf
// citations.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  GeneratePaperValueChainResult,
  PaperValueChain,
  PaperValueChainEdge,
  PaperValueChainEdgeCitation,
  PaperValueChainNode,
  ResearchPaper
} from '../../preload'
import { PaperValueChainDiagram } from './PaperValueChainDiagram'

interface Props {
  // The paper we're rendering a chain for. Caller passes the full paper
  // object (already in hand) so we can render the header before the
  // chain finishes loading.
  paper: ResearchPaper
  // When the user clicks a node card in the diagram. Caller routes this
  // back through ResearchPage's existing paper-selection flow.
  onOpenPaperById: (paperId: string) => void
  // Phase 3B — open the focal paper's PDF at a specific page in the
  // in-window reader. Triggered by clicking a paper-pdf citation pill.
  onOpenFocalPdfAtPage?: (pageOffset: number) => void
  // Phase 3C — open an arbitrary counterpart paper's PDF at a specific
  // page. Used by the bilateral doubled-pill: clicking the
  // counterpart-side pill opens THAT paper, not the focal. Caller
  // composes from the {url, title, subtitle, pageOffset} payload.
  onOpenCounterpartPdf?: (input: {
    url: string
    title: string
    subtitle: string | null
    pageOffset: number
  }) => void
}

// `lastResult` carries the most recent regenerate outcome (badge,
// reason, S2 calls). Persisted in state so the user sees the badge
// after a fresh generation; the cache-first read path doesn't fill it
// (the badge for cached reads is implicit — if the chain has paper-pdf
// citations, enrichment ran).
type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; chain: PaperValueChain; lastResult: GeneratePaperValueChainResult | null }
  | { kind: 'empty'; chain: PaperValueChain; lastResult: GeneratePaperValueChainResult | null }
  | { kind: 'error'; reason: GeneratePaperValueChainResult['reason'] }

export function PaperValueChainCard({
  paper,
  onOpenPaperById,
  onOpenFocalPdfAtPage,
  onOpenCounterpartPdf
}: Props): JSX.Element {
  const [view, setView] = useState<ViewState>({ kind: 'idle' })

  // Cache-first read on mount. If nothing is cached the user explicitly
  // clicks "Generate" — we don't auto-fire S2 calls just because the
  // panel rendered (cost-respect even with no caps; user should opt-in
  // per chain).
  useEffect(() => {
    let cancelled = false
    void window.api.research
      .getPaperChain(paper.paperId)
      .then((chain) => {
        if (cancelled) return
        if (chain) {
          // Edge case: a previously-saved chain with no non-focal nodes
          // (paper had <5 refs/citations at generation time). Keep the
          // 'empty' tag so the UI can show its degraded message.
          const activeNodes = chain.nodes.length - 1
          setView(
            activeNodes > 0
              ? { kind: 'ready', chain, lastResult: null }
              : { kind: 'empty', chain, lastResult: null }
          )
        } else {
          setView({ kind: 'idle' })
        }
      })
      .catch(() => {
        if (!cancelled) setView({ kind: 'idle' })
      })
    return () => {
      cancelled = true
    }
  }, [paper.paperId])

  const onRegenerate = useCallback(async (): Promise<void> => {
    setView({ kind: 'loading' })
    try {
      const result = await window.api.research.regeneratePaperChain(paper.paperId)
      if (!result.ok || !result.chain) {
        setView({ kind: 'error', reason: result.reason })
        return
      }
      const activeNodes = result.chain.nodes.length - 1
      setView(
        activeNodes > 0
          ? { kind: 'ready', chain: result.chain, lastResult: result }
          : { kind: 'empty', chain: result.chain, lastResult: result }
      )
    } catch {
      setView({ kind: 'error', reason: 'empty' })
    }
  }, [paper.paperId])

  const chain = view.kind === 'ready' || view.kind === 'empty' ? view.chain : null
  const lastResult = view.kind === 'ready' || view.kind === 'empty' ? view.lastResult : null
  const paperPdfRows = useMemo(() => {
    if (!chain) return []
    return collectPaperPdfRows(chain)
  }, [chain])
  const bilateralRows = useMemo(() => {
    if (!chain) return []
    return collectBilateralRows(chain)
  }, [chain])

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 mt-3">
      <header className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-semibold flex items-center gap-2 min-w-0">
          <span className="shrink-0">Value chain</span>
          {chain && (
            <span className="text-zinc-600 tabular-nums normal-case tracking-normal shrink-0">
              {chain.s2CallsUsed} S2 call{chain.s2CallsUsed === 1 ? '' : 's'}
            </span>
          )}
          <EnrichmentBadge result={lastResult} chain={chain} />
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={view.kind === 'loading'}
          className="text-[11px] text-zinc-400 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-progress shrink-0"
        >
          {view.kind === 'idle' ? 'Generate' : 'Regenerate'}
        </button>
      </header>

      {view.kind === 'idle' && (
        <div className="text-[12px] text-zinc-500 italic px-1 py-2">
          Click <span className="text-zinc-300">Generate</span> to build a citation lineage
          for this paper. Pulls Semantic Scholar, then reads the paper's intro with Haiku
          if the PDF is open access.
        </div>
      )}

      {view.kind === 'loading' && (
        <div className="text-[12px] text-zinc-400 italic px-1 py-3">
          Building chain… (S2 lookups → focal PDF read → Haiku enrichment, ~10-30s)
        </div>
      )}

      {view.kind === 'error' && (
        <div className="text-[12px] text-red-300/80 px-1 py-2">
          {view.reason === 'rate_limited'
            ? 'Semantic Scholar rate-limited. Try again in ~30s, or add an API key in Settings → AI.'
            : view.reason === 'focal_not_found'
              ? `Couldn't find this paper in Semantic Scholar (paperId: ${paper.paperId}).`
              : 'Generation failed. Try again.'}
        </div>
      )}

      {view.kind === 'empty' && (
        <>
          <div className="text-[12px] text-zinc-500 italic px-1 py-2">
            This paper doesn't have enough references or citations on Semantic
            Scholar to populate any stage besides Focal.
          </div>
          <PaperValueChainDiagram
            chain={view.chain}
            selectedPaperId={paper.paperId}
            onSelectPaper={onOpenPaperById}
          />
        </>
      )}

      {view.kind === 'ready' && (
        <PaperValueChainDiagram
          chain={view.chain}
          selectedPaperId={paper.paperId}
          onSelectPaper={onOpenPaperById}
        />
      )}

      {paperPdfRows.length > 0 && (
        <PaperPdfQuotesPanel
          rows={paperPdfRows}
          onOpenFocalPdfAtPage={onOpenFocalPdfAtPage}
        />
      )}

      {bilateralRows.length > 0 && (
        <BilateralPanel
          rows={bilateralRows}
          onOpenFocalPdfAtPage={onOpenFocalPdfAtPage}
          onOpenCounterpartPdf={onOpenCounterpartPdf}
        />
      )}
    </section>
  )
}

// Renders the badge in the header. Pulls from lastResult when present
// (post-regen), otherwise inspects the chain for any paper-pdf citation
// (cached chain that was previously enriched).
function EnrichmentBadge({
  result,
  chain
}: {
  result: GeneratePaperValueChainResult | null
  chain: PaperValueChain | null
}): JSX.Element | null {
  let badge: 'enriched' | 'metadata-only' | 'cache' | null = result?.enrichmentBadge ?? null
  if (!badge && chain) {
    // Heuristic for cached chains: any paper-pdf citation means
    // enrichment ran on this chain at some point. Otherwise the badge
    // stays hidden — the cache might pre-date 3B.
    const hasPaperPdf = chain.edges.some((e) =>
      e.citations.some((c) => c.kind === 'paper-pdf')
    )
    if (hasPaperPdf) badge = 'cache'
  }
  if (!badge) return null
  if (badge === 'metadata-only') {
    return (
      <span
        title="Focal paper PDF wasn't open-access or couldn't be parsed; chain is S2-only."
        className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 normal-case px-1.5 py-0.5 rounded-full ring-1 ring-inset ring-zinc-700"
      >
        metadata only
      </span>
    )
  }
  if (badge === 'enriched') {
    return (
      <span
        title="Focal paper intro was read by Haiku; some edges carry quoted-sentence citations."
        className="text-[9px] uppercase tracking-[0.16em] text-emerald-300 normal-case px-1.5 py-0.5 rounded-full bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30"
      >
        enriched
      </span>
    )
  }
  return (
    <span
      title="Loaded from enrichment cache; no Haiku call this round."
      className="text-[9px] uppercase tracking-[0.16em] text-sky-300 normal-case px-1.5 py-0.5 rounded-full bg-sky-500/10 ring-1 ring-inset ring-sky-500/30"
    >
      cached
    </span>
  )
}

// One row per paper-pdf-cited edge. The pill renders the page number;
// click → opens the focal PDF at #page=N in the in-window reader.
interface PaperPdfRow {
  edge: PaperValueChainEdge
  citation: Extract<PaperValueChainEdgeCitation, { kind: 'paper-pdf' }>
  otherNode: PaperValueChainNode | null
}

function collectPaperPdfRows(chain: PaperValueChain): PaperPdfRow[] {
  const nodesById = new Map(chain.nodes.map((n) => [n.paperId, n]))
  const rows: PaperPdfRow[] = []
  for (const edge of chain.edges) {
    for (const citation of edge.citations) {
      if (citation.kind !== 'paper-pdf') continue
      const otherId = citation.otherPaperId
      const otherNode = nodesById.get(otherId) ?? null
      rows.push({ edge, citation, otherNode })
    }
  }
  // Order by page so a reader following along has a natural top-to-
  // bottom flow through the focal paper's intro.
  rows.sort((a, b) => a.citation.pageOffset - b.citation.pageOffset)
  return rows
}

function PaperPdfQuotesPanel({
  rows,
  onOpenFocalPdfAtPage
}: {
  rows: PaperPdfRow[]
  onOpenFocalPdfAtPage?: (pageOffset: number) => void
}): JSX.Element {
  return (
    <section className="mt-3 pt-3 border-t border-zinc-800/80">
      <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/90 font-semibold mb-2">
        Quoted from focal paper · {rows.length}
      </div>
      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li
            key={`${row.citation.otherPaperId}-${row.citation.pageOffset}-${i}`}
            className="rounded border border-emerald-500/15 bg-emerald-500/[0.03] px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                disabled={!onOpenFocalPdfAtPage}
                onClick={() => onOpenFocalPdfAtPage?.(row.citation.pageOffset)}
                className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 tabular-nums"
                title="Open focal paper PDF at this page"
              >
                p.{row.citation.pageOffset}
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-zinc-300 truncate">
                  <span className="text-emerald-300/80">{relationshipLabel(row.edge.relationship)}</span>
                  {row.otherNode ? (
                    <>
                      {' → '}
                      <span className="text-zinc-100">{row.otherNode.authorYearLabel}</span>
                      <span className="text-zinc-500"> · {row.otherNode.title}</span>
                    </>
                  ) : (
                    <span className="text-zinc-500"> {row.citation.otherPaperId}</span>
                  )}
                </div>
                <blockquote className="mt-1 text-[11px] text-zinc-400 italic leading-snug border-l border-emerald-500/30 pl-2">
                  "{row.citation.quotedSentence}"
                </blockquote>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function relationshipLabel(rel: PaperValueChainEdge['relationship']): string {
  switch (rel) {
    case 'builds-on':
      return 'builds on'
    case 'uses-method':
      return 'uses method of'
    case 'extends':
      return 'extends'
    case 'contrasts':
      return 'contrasts with'
    case 'replicates':
      return 'replicates'
    case 'refutes':
      return 'refutes'
  }
}

// ---- Phase 3C: bilateral citation rendering -----------------------------

interface BilateralRow {
  edge: PaperValueChainEdge
  citation: Extract<PaperValueChainEdgeCitation, { kind: 'bilateral' }>
  counterpartNode: PaperValueChainNode | null
}

function collectBilateralRows(chain: PaperValueChain): BilateralRow[] {
  const focusId = chain.focusPaperId
  const nodesById = new Map(chain.nodes.map((n) => [n.paperId, n]))
  const out: BilateralRow[] = []
  for (const edge of chain.edges) {
    for (const citation of edge.citations) {
      if (citation.kind !== 'bilateral') continue
      // The "other" side of the edge — counterpart paperId.
      const counterpartId = edge.from === focusId ? edge.to : edge.from
      const counterpartNode = nodesById.get(counterpartId) ?? null
      out.push({ edge, citation, counterpartNode })
    }
  }
  // Order: mutual-cite first (highest confidence), then framing-alignment,
  // then forward-reference. Matches the spec's confidence hierarchy so
  // strongest signals are visually surfaced first.
  const reasonOrder: Record<typeof out[number]['citation']['matchReason'], number> = {
    'mutual-cite': 0,
    'framing-alignment': 1,
    'forward-reference': 2
  }
  out.sort(
    (a, b) =>
      reasonOrder[a.citation.matchReason] -
      reasonOrder[b.citation.matchReason]
  )
  return out
}

function bilateralReasonLabel(
  reason: BilateralRow['citation']['matchReason']
): string {
  switch (reason) {
    case 'mutual-cite':
      return 'Mutual cite'
    case 'forward-reference':
      return 'Forward reference'
    case 'framing-alignment':
      return 'Framing alignment'
  }
}

function BilateralPanel({
  rows,
  onOpenFocalPdfAtPage,
  onOpenCounterpartPdf
}: {
  rows: BilateralRow[]
  onOpenFocalPdfAtPage?: (pageOffset: number) => void
  onOpenCounterpartPdf?: (input: {
    url: string
    title: string
    subtitle: string | null
    pageOffset: number
  }) => void
}): JSX.Element {
  return (
    <section className="mt-3 pt-3 border-t border-zinc-800/80">
      <div className="text-[10px] uppercase tracking-[0.22em] text-violet-300/90 font-semibold mb-2">
        Bilateral reinforcement · {rows.length}
      </div>
      <ul className="space-y-2">
        {rows.map((row, i) => {
          const focal = row.citation.focalCitation
          const counterpart = row.citation.counterpartCitation
          const focalPage = focal.kind === 'paper-pdf' ? focal.pageOffset : null
          const counterpartPdfUrl = row.counterpartNode?.pdfUrl ?? null
          const reason = row.citation.matchReason
          return (
            <li
              key={`${row.edge.from}-${row.edge.to}-${reason}-${i}`}
              className="rounded border border-violet-500/15 bg-violet-500/[0.03] px-3 py-2"
            >
              <div className="flex items-start gap-2">
                {/* Doubled pill: focal page on top, counterpart page (or
                    "S2" badge for mutual-cite) below. Stacked vertically
                    so they read as a pair without horizontal crowding. */}
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={!onOpenFocalPdfAtPage || focalPage === null}
                    onClick={() =>
                      focalPage !== null && onOpenFocalPdfAtPage?.(focalPage)
                    }
                    className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed tabular-nums"
                    title="Open focal paper PDF at this page"
                  >
                    {focalPage !== null ? `p.${focalPage}` : 'S2'}
                  </button>
                  {counterpart ? (
                    <button
                      type="button"
                      disabled={
                        !onOpenCounterpartPdf || !counterpartPdfUrl
                      }
                      onClick={() => {
                        if (!counterpartPdfUrl || !row.counterpartNode) return
                        onOpenCounterpartPdf?.({
                          url: counterpartPdfUrl,
                          title: row.counterpartNode.title,
                          subtitle: row.counterpartNode.authorYearLabel,
                          pageOffset: counterpart.pageOffset
                        })
                      }}
                      className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed tabular-nums"
                      title="Open counterpart paper PDF at this page"
                    >
                      p.{counterpart.pageOffset}
                    </button>
                  ) : (
                    <span
                      className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 ring-1 ring-inset ring-zinc-700 tabular-nums"
                      title="Mutual cite confirmed via Semantic Scholar — counterpart's reference list contains this paper. No PDF read."
                    >
                      S2
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-zinc-300 truncate">
                    <span className="text-violet-300/90 uppercase tracking-[0.16em] text-[9px] font-semibold mr-1">
                      {bilateralReasonLabel(reason)}
                    </span>
                    <span className="text-emerald-300/80">
                      {relationshipLabel(row.edge.relationship)}
                    </span>
                    {row.counterpartNode ? (
                      <>
                        {' → '}
                        <span className="text-zinc-100">
                          {row.counterpartNode.authorYearLabel}
                        </span>
                        <span className="text-zinc-500">
                          {' '}
                          · {row.counterpartNode.title}
                        </span>
                      </>
                    ) : null}
                  </div>
                  {/* Two stacked quotes when both sides have text;
                      single focal quote for mutual-cite (counterpart
                      side has no quoted sentence). */}
                  {focal.kind === 'paper-pdf' && (
                    <blockquote className="mt-1 text-[11px] text-zinc-400 italic leading-snug border-l border-emerald-500/30 pl-2">
                      <span className="not-italic text-[9px] uppercase tracking-[0.18em] text-emerald-400/70 mr-1">
                        focal
                      </span>
                      "{focal.quotedSentence}"
                    </blockquote>
                  )}
                  {counterpart && (
                    <blockquote className="mt-1 text-[11px] text-zinc-400 italic leading-snug border-l border-violet-500/30 pl-2">
                      <span className="not-italic text-[9px] uppercase tracking-[0.18em] text-violet-400/70 mr-1">
                        counterpart
                      </span>
                      "{counterpart.quotedSentence}"
                    </blockquote>
                  )}
                  {row.citation.trigger && reason !== 'framing-alignment' && (
                    <div className="mt-1 text-[10px] text-zinc-500">
                      Trigger:{' '}
                      <span className="text-zinc-300">
                        {row.citation.trigger}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
