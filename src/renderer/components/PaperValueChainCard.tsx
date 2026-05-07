// Wrapper for the per-paper value chain. Mounts inside the Research
// detail panel; loads the cached chain on render, kicks off generation
// when none exists. Mirrors UnifiedValueChainCard's shape but for
// research papers — header with focus label + regen button, body is the
// horizontal-stage diagram.

import { useCallback, useEffect, useState } from 'react'
import type {
  GeneratePaperValueChainResult,
  PaperValueChain,
  ResearchPaper
} from '../../preload'
import { PaperValueChainDiagram } from './PaperValueChainDiagram'

interface Props {
  // The paper we're rendering a chain for. Caller passes the full paper
  // object (already in hand) so we can render the header before the
  // chain finishes loading.
  paper: ResearchPaper
  // When the user clicks a card in the diagram. Caller routes this back
  // through ResearchPage's existing paper-selection flow so the right
  // detail panel updates without us re-fetching.
  onOpenPaperById: (paperId: string) => void
}

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; chain: PaperValueChain }
  | { kind: 'empty'; chain: PaperValueChain }
  | { kind: 'error'; reason: GeneratePaperValueChainResult['reason'] }

export function PaperValueChainCard({ paper, onOpenPaperById }: Props): JSX.Element {
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
          setView(activeNodes > 0 ? { kind: 'ready', chain } : { kind: 'empty', chain })
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
          ? { kind: 'ready', chain: result.chain }
          : { kind: 'empty', chain: result.chain }
      )
    } catch {
      setView({ kind: 'error', reason: 'empty' })
    }
  }, [paper.paperId])

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 mt-3">
      <header className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">
          Value chain
          {(view.kind === 'ready' || view.kind === 'empty') && (
            <span className="ml-2 text-zinc-600 tabular-nums normal-case tracking-normal">
              {view.chain.s2CallsUsed} S2 call{view.chain.s2CallsUsed === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={view.kind === 'loading'}
          className="text-[11px] text-zinc-400 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-progress"
        >
          {view.kind === 'idle' ? 'Generate' : 'Regenerate'}
        </button>
      </header>

      {view.kind === 'idle' && (
        <div className="text-[12px] text-zinc-500 italic px-1 py-2">
          Click <span className="text-zinc-300">Generate</span> to build a citation lineage
          for this paper. Uses Semantic Scholar only — typically 3 API calls.
        </div>
      )}

      {view.kind === 'loading' && (
        <div className="text-[12px] text-zinc-400 italic px-1 py-3">
          Building chain… (focal lookup → references → citations)
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
    </section>
  )
}
