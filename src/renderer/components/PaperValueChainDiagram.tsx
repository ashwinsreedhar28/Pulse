// Horizontal time-axis layout for a paper value chain. One column per
// stage, ordered left → right (Upstream-Foundational … Focal … Downstream-
// Replications). Each column shows a header + a vertical stack of paper
// cards. The relationship is implicit via column placement; no SVG
// connector layer in 3A — we lean on the column ordering to communicate
// "upstream / focal / downstream" without the geometry overhead of the
// force-directed company diagram.
//
// Click a card → onOpenPaper. Same affordance the rest of ResearchPage
// uses; keeps the in-app reader as the canonical detail surface.

import type {
  PaperValueChain,
  PaperValueChainNode,
  PaperValueChainStage
} from '../../preload'

interface Props {
  chain: PaperValueChain
  selectedPaperId: string | null
  onSelectPaper: (paperId: string) => void
}

// Visual treatment per band — keeps the reader's eye anchored on the
// focal column without needing arrows. Tints picked to match the
// existing Research surfaces (foundational uses amber elsewhere).
const BAND_STYLES: Record<
  PaperValueChainStage['band'],
  { header: string; column: string; accent: string }
> = {
  upstream: {
    header: 'text-amber-300/90',
    column: 'bg-amber-500/[0.04]',
    accent: 'border-amber-500/30'
  },
  focal: {
    header: 'text-zinc-100',
    column: 'bg-zinc-100/[0.06]',
    accent: 'border-zinc-300/50'
  },
  downstream: {
    header: 'text-sky-300/90',
    column: 'bg-sky-500/[0.04]',
    accent: 'border-sky-500/30'
  }
}

export function PaperValueChainDiagram({
  chain,
  selectedPaperId,
  onSelectPaper
}: Props): JSX.Element {
  const nodesByStage = new Map<string, PaperValueChainNode[]>()
  for (const stage of chain.stages) nodesByStage.set(stage.id, [])
  for (const node of chain.nodes) {
    const list = nodesByStage.get(node.stage)
    if (list) list.push(node)
  }

  return (
    <div className="w-full overflow-x-auto pb-3">
      <div
        className="flex gap-2 min-w-max"
        // 9 stages × ~210px each + gaps; horizontal scroll on narrow
        // viewports rather than squeezing columns into unreadable widths.
        style={{ minWidth: chain.stages.length * 218 }}
      >
        {chain.stages.map((stage) => (
          <PaperValueChainColumn
            key={stage.id}
            stage={stage}
            nodes={nodesByStage.get(stage.id) ?? []}
            selectedPaperId={selectedPaperId}
            onSelectPaper={onSelectPaper}
          />
        ))}
      </div>
    </div>
  )
}

function PaperValueChainColumn({
  stage,
  nodes,
  selectedPaperId,
  onSelectPaper
}: {
  stage: PaperValueChainStage
  nodes: PaperValueChainNode[]
  selectedPaperId: string | null
  onSelectPaper: (paperId: string) => void
}): JSX.Element {
  const styles = BAND_STYLES[stage.band]
  return (
    <div
      className={`flex flex-col gap-2 px-2 py-2 rounded-md ${styles.column} w-[210px] shrink-0`}
    >
      <div className={`text-[10px] uppercase tracking-[0.18em] font-semibold ${styles.header}`}>
        {stage.label}
        {nodes.length > 0 && (
          <span className="ml-1.5 text-zinc-500 tabular-nums">{nodes.length}</span>
        )}
      </div>
      {nodes.length === 0 ? (
        <div className="text-[11px] text-zinc-600 italic px-1 py-1">
          {stage.id === 'downstream-replications' ? '— Phase 3D —' : 'No papers'}
        </div>
      ) : (
        nodes.map((node) => (
          <PaperValueChainNodeCard
            key={node.paperId}
            node={node}
            selected={node.paperId === selectedPaperId}
            accentClass={styles.accent}
            onClick={() => onSelectPaper(node.paperId)}
          />
        ))
      )}
    </div>
  )
}

function PaperValueChainNodeCard({
  node,
  selected,
  accentClass,
  onClick
}: {
  node: PaperValueChainNode
  selected: boolean
  accentClass: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left w-full rounded border px-2 py-1.5 transition-colors ${
        selected
          ? `bg-zinc-100/10 ${accentClass}`
          : 'bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900/90 hover:border-zinc-700'
      }`}
    >
      <div className="text-[10px] tabular-nums text-zinc-500 flex items-center justify-between">
        <span>{node.authorYearLabel}</span>
        {node.influentialCitationCount > 0 && (
          <span className="text-amber-400/80">★ {node.influentialCitationCount}</span>
        )}
      </div>
      <div className="text-[12px] text-zinc-200 leading-snug line-clamp-2 mt-0.5">
        {node.title}
      </div>
      {node.kind === 'unverified' && (
        <div className="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">
          unverified
        </div>
      )}
    </button>
  )
}
