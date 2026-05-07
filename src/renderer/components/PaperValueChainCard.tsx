// Wrapper for the per-paper value chain. Mounts inside the Research
// detail panel; loads the cached chain on render, kicks off generation
// when none exists. Mirrors UnifiedValueChainCard's shape but for
// research papers.
//
// Layout (post-3C consolidation):
//   - Header strip: focus title + S2 calls + enrichment badge + Regen
//   - Diagram: 9-column horizontal stage layout (PaperValueChainDiagram)
//   - Citations timeline: ONE collapsible panel listing every grounded
//     edge, ordered by where in the focal paper the citation appears.
//     Bilateral upgrades surface inline as a counterpart pill + quote
//     under the focal row, NOT as a separate panel. Pre-3D this was
//     two separate panels (Quoted-from-focal + Bilateral) which felt
//     disorganized when both fired on the same edge.
//
// PDF URL resolution intentionally pulls from chain.nodes (always
// fresh after regen) rather than the parent-passed `paper` prop —
// the parent's paper object can be stale when chainPaper was set
// before the latest empty-openAccessPdf normalization landed. Card
// owns its own opener composition; ResearchPage just routes the
// resulting {url, title, subtitle, pageOffset} into the in-window
// reader.

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

interface OpenPdfPayload {
  url: string
  title: string
  subtitle: string | null
  pageOffset: number
}

interface Props {
  // The paper we're rendering a chain for. Used for the header and as
  // a fallback for PDF URL resolution if the chain hasn't loaded yet.
  paper: ResearchPaper
  // When the user clicks a node card in the diagram. Caller routes this
  // back through ResearchPage's existing paper-selection flow.
  onOpenPaperById: (paperId: string) => void
  // Generic PDF opener — replaces the per-side callbacks from earlier
  // 3B/3C iterations. Card composes the {url, title, subtitle,
  // pageOffset} payload from its own chain data so a stale parent
  // `paper` prop can't break clicks.
  onOpenPdf?: (payload: OpenPdfPayload) => void
}

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; chain: PaperValueChain; lastResult: GeneratePaperValueChainResult | null }
  | { kind: 'empty'; chain: PaperValueChain; lastResult: GeneratePaperValueChainResult | null }
  | { kind: 'error'; reason: GeneratePaperValueChainResult['reason'] }

export function PaperValueChainCard({
  paper,
  onOpenPaperById,
  onOpenPdf
}: Props): JSX.Element {
  const [view, setView] = useState<ViewState>({ kind: 'idle' })
  const [citationsCollapsed, setCitationsCollapsed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.api.research
      .getPaperChain(paper.paperId)
      .then((chain) => {
        if (cancelled) return
        if (chain) {
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

  // Build a paperId → node lookup used both for PDF URL resolution
  // (focal + counterpart pills) and for the citations row's target
  // metadata.
  const nodesById = useMemo(() => {
    if (!chain) return new Map<string, PaperValueChainNode>()
    return new Map(chain.nodes.map((n) => [n.paperId, n]))
  }, [chain])

  // Resolve the focal paper's PDF URL from chain.nodes first (always
  // fresh after regen), falling back to the parent's paper prop only
  // when the chain hasn't loaded yet. This was the source of the
  // stale-pdfUrl click bug pre-rewrite.
  const focalNode = chain ? nodesById.get(chain.focusPaperId) ?? null : null
  const focalPdfUrl = focalNode?.pdfUrl ?? paper.pdfUrl ?? null
  const focalTitle = focalNode?.title ?? paper.title
  const focalSubtitle = paper.venue ?? null

  const openFocalAtPage = useCallback(
    (pageOffset: number): void => {
      if (!onOpenPdf || !focalPdfUrl) {
        console.warn(
          '[paper-chain-card] focal click ignored:',
          !onOpenPdf ? 'no onOpenPdf prop' : 'no focal pdfUrl resolvable'
        )
        return
      }
      onOpenPdf({
        url: focalPdfUrl,
        title: focalTitle,
        subtitle: focalSubtitle,
        pageOffset
      })
    },
    [onOpenPdf, focalPdfUrl, focalTitle, focalSubtitle]
  )

  const openCounterpartAtPage = useCallback(
    (counterpartPaperId: string, pageOffset: number): void => {
      const node = nodesById.get(counterpartPaperId)
      if (!onOpenPdf || !node?.pdfUrl) {
        console.warn(
          '[paper-chain-card] counterpart click ignored:',
          !onOpenPdf ? 'no onOpenPdf prop' : `no pdfUrl for ${counterpartPaperId}`
        )
        return
      }
      onOpenPdf({
        url: node.pdfUrl,
        title: node.title,
        subtitle: node.authorYearLabel,
        pageOffset
      })
    },
    [onOpenPdf, nodesById]
  )

  const citationRows = useMemo(() => {
    if (!chain) return []
    return collectCitationRows(chain, nodesById)
  }, [chain, nodesById])

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
          Building chain… (S2 lookups → focal PDF read → Haiku enrichment → bilateral check)
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

      {citationRows.length > 0 && (
        <CitationsPanel
          rows={citationRows}
          collapsed={citationsCollapsed}
          onToggle={() => setCitationsCollapsed((c) => !c)}
          onOpenFocalAtPage={openFocalAtPage}
          onOpenCounterpartAtPage={openCounterpartAtPage}
        />
      )}
    </section>
  )
}

function EnrichmentBadge({
  result,
  chain
}: {
  result: GeneratePaperValueChainResult | null
  chain: PaperValueChain | null
}): JSX.Element | null {
  let badge: 'enriched' | 'metadata-only' | 'cache' | null = result?.enrichmentBadge ?? null
  if (!badge && chain) {
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

// ---- Unified citations timeline -----------------------------------------

// One row per edge that carries at least one paper-pdf citation. The
// row is keyed by edge identity (from + to) so the user sees a single
// entry per cited paper, even when both 3B (paper-pdf) and 3C
// (bilateral) fired. Bilateral data renders as an inline annotation
// — counterpart pill + counterpart quote — under the focal row.
interface CitationRow {
  edge: PaperValueChainEdge
  // Always set when this row is included in the timeline.
  focalPaperPdf: Extract<PaperValueChainEdgeCitation, { kind: 'paper-pdf' }>
  // The bilateral upgrade, when present. Null when only 3B fired.
  bilateral: Extract<PaperValueChainEdgeCitation, { kind: 'bilateral' }> | null
  targetNode: PaperValueChainNode | null
  // Counterpart paperId for the click handler. Always equals
  // edge.to (focal cites counterpart; we filter to focal-as-from edges).
  counterpartPaperId: string
}

function collectCitationRows(
  chain: PaperValueChain,
  nodesById: Map<string, PaperValueChainNode>
): CitationRow[] {
  const rows: CitationRow[] = []
  for (const edge of chain.edges) {
    // Only surface edges where the focal cites the counterpart.
    // Downstream edges (counterpart cites focal) are visible in the
    // diagram but don't carry quotable citations from the focal's
    // intro.
    if (edge.from !== chain.focusPaperId) continue
    const focalPaperPdf = edge.citations.find(
      (c) => c.kind === 'paper-pdf'
    ) as Extract<PaperValueChainEdgeCitation, { kind: 'paper-pdf' }> | undefined
    if (!focalPaperPdf) continue
    const bilateral =
      (edge.citations.find((c) => c.kind === 'bilateral') as
        | Extract<PaperValueChainEdgeCitation, { kind: 'bilateral' }>
        | undefined) ?? null
    rows.push({
      edge,
      focalPaperPdf,
      bilateral,
      targetNode: nodesById.get(edge.to) ?? null,
      counterpartPaperId: edge.to
    })
  }
  // Sort by where the citation appears in the focal paper — the
  // reader can scan top-to-bottom in the same order they'd encounter
  // the citations while reading the paper.
  rows.sort((a, b) => a.focalPaperPdf.pageOffset - b.focalPaperPdf.pageOffset)
  return rows
}

function CitationsPanel({
  rows,
  collapsed,
  onToggle,
  onOpenFocalAtPage,
  onOpenCounterpartAtPage
}: {
  rows: CitationRow[]
  collapsed: boolean
  onToggle: () => void
  onOpenFocalAtPage: (pageOffset: number) => void
  onOpenCounterpartAtPage: (counterpartPaperId: string, pageOffset: number) => void
}): JSX.Element {
  const bilateralCount = rows.filter((r) => r.bilateral).length
  return (
    <section className="mt-3 pt-3 border-t border-zinc-800/80">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 mb-2 group"
      >
        <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/90 font-semibold flex items-center gap-2">
          <span>Citations</span>
          <span className="text-zinc-500 normal-case tracking-normal tabular-nums">
            {rows.length}
          </span>
          {bilateralCount > 0 && (
            <span
              className="text-[9px] uppercase tracking-[0.16em] text-violet-300 normal-case px-1.5 py-0.5 rounded-full bg-violet-500/10 ring-1 ring-inset ring-violet-500/30"
              title={`${bilateralCount} edge${
                bilateralCount === 1 ? '' : 's'
              } reinforced by bilateral check`}
            >
              {bilateralCount} bilateral
            </span>
          )}
        </div>
        <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300">
          {collapsed ? '▸ show' : '▾ hide'}
        </span>
      </button>

      {!collapsed && (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <CitationRowView
              key={`${row.edge.from}-${row.edge.to}-${i}`}
              row={row}
              onOpenFocalAtPage={onOpenFocalAtPage}
              onOpenCounterpartAtPage={onOpenCounterpartAtPage}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function CitationRowView({
  row,
  onOpenFocalAtPage,
  onOpenCounterpartAtPage
}: {
  row: CitationRow
  onOpenFocalAtPage: (pageOffset: number) => void
  onOpenCounterpartAtPage: (counterpartPaperId: string, pageOffset: number) => void
}): JSX.Element {
  const { focalPaperPdf, bilateral, targetNode, counterpartPaperId } = row
  const counterpartCitation = bilateral?.counterpartCitation ?? null
  const counterpartHasPdf = !!targetNode?.pdfUrl
  // For mutual-cite, counterpartCitation is null but we still want to
  // surface the upgrade with an "S2" badge. For forward-reference /
  // framing-alignment, we render the counterpart pill clickable when
  // we have both pageOffset and a pdfUrl.
  return (
    <li
      className={`rounded border px-3 py-2 ${
        bilateral
          ? 'border-violet-500/20 bg-violet-500/[0.04]'
          : 'border-emerald-500/15 bg-emerald-500/[0.03]'
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Pill column — focal page on top, counterpart below for
            bilateral upgrades. Counterpart slot stays empty for
            non-bilateral rows. */}
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onOpenFocalAtPage(focalPaperPdf.pageOffset)}
            className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 tabular-nums"
            title="Open focal paper PDF at this page"
          >
            p.{focalPaperPdf.pageOffset}
          </button>
          {bilateral &&
            (counterpartCitation ? (
              <button
                type="button"
                disabled={!counterpartHasPdf}
                onClick={() =>
                  onOpenCounterpartAtPage(
                    counterpartPaperId,
                    counterpartCitation.pageOffset
                  )
                }
                className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed tabular-nums"
                title={
                  counterpartHasPdf
                    ? 'Open counterpart paper PDF at this page'
                    : 'Counterpart PDF not available'
                }
              >
                p.{counterpartCitation.pageOffset}
              </button>
            ) : (
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 ring-1 ring-inset ring-zinc-700 tabular-nums text-center"
                title="Mutual cite confirmed via Semantic Scholar — counterpart's reference list contains this paper. No PDF read."
              >
                S2
              </span>
            ))}
        </div>

        <div className="min-w-0 flex-1">
          {/* Header line: relationship + target paper + bilateral chip */}
          <div className="text-[11px] text-zinc-300 truncate flex items-baseline gap-1.5">
            <span className="text-emerald-300/80">
              {relationshipLabel(row.edge.relationship)}
            </span>
            {targetNode ? (
              <>
                <span className="text-zinc-500">→</span>
                <span className="text-zinc-100 truncate">
                  {targetNode.authorYearLabel}
                </span>
                <span className="text-zinc-500 truncate"> · {targetNode.title}</span>
              </>
            ) : (
              <span className="text-zinc-500">{counterpartPaperId}</span>
            )}
          </div>
          {bilateral && (
            <div className="mt-0.5 text-[10px]">
              <span className="text-violet-300 uppercase tracking-[0.16em] font-semibold">
                {bilateralReasonLabel(bilateral.matchReason)}
              </span>
              {bilateral.trigger && bilateral.matchReason !== 'framing-alignment' && (
                <span className="text-zinc-500">
                  {' '}— trigger:{' '}
                  <span className="text-zinc-300">{bilateral.trigger}</span>
                </span>
              )}
            </div>
          )}
          <blockquote className="mt-1 text-[11px] text-zinc-400 italic leading-snug border-l border-emerald-500/30 pl-2">
            "{focalPaperPdf.quotedSentence}"
          </blockquote>
          {counterpartCitation && (
            <blockquote className="mt-1 text-[11px] text-zinc-400 italic leading-snug border-l border-violet-500/30 pl-2">
              <span className="not-italic text-[9px] uppercase tracking-[0.18em] text-violet-400/70 mr-1">
                counterpart
              </span>
              "{counterpartCitation.quotedSentence}"
            </blockquote>
          )}
        </div>
      </div>
    </li>
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

function bilateralReasonLabel(
  reason: 'mutual-cite' | 'forward-reference' | 'framing-alignment'
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
