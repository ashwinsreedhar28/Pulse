// Per-ticker AI-generated value chain, rendered on the stock detail page.
// Cold state shows a "Generate" button; once generated, nodes are grouped
// by the Ollama-proposed industry-appropriate stages and colored by their
// role vs the focus (supplier / customer / competitor / partner).
//
// Edges aren't drawn as SVG lines — keeping the layout simple (CSS grid of
// stage rows with node pills) reads better for most industries than a
// force-directed diagram, and users can cross-reference relationships via
// the edges pane below.

import { useCallback, useEffect, useState } from 'react'

import type {
  CompanyValueChain,
  CompanyValueChainEdge,
  CompanyValueChainNode,
  CompanyValueChainRow
} from '../../preload'
import { CollapsibleSection } from './CollapsibleSection'

type Role = 'focus' | 'supplier' | 'customer' | 'competitor' | 'partner' | 'none'

const ROLE_TONE: Record<Role, { fill: string; border: string; label: string }> = {
  focus: {
    fill: 'bg-emerald-500/20',
    border: 'border-emerald-400',
    label: 'Focus'
  },
  supplier: {
    fill: 'bg-indigo-500/[0.08]',
    border: 'border-indigo-400/80',
    label: 'Supplier'
  },
  customer: {
    fill: 'bg-emerald-500/[0.08]',
    border: 'border-emerald-400/80',
    label: 'Customer'
  },
  competitor: {
    fill: 'bg-orange-500/[0.08]',
    border: 'border-orange-400/80',
    label: 'Competitor'
  },
  partner: {
    fill: 'bg-sky-500/[0.08]',
    border: 'border-sky-400/80',
    label: 'Partner'
  },
  none: {
    fill: 'bg-surface-0',
    border: 'border-edge/60',
    label: ''
  }
}

function classifyRole(graph: CompanyValueChain, nodeSymbol: string): Role {
  if (nodeSymbol === graph.focus) return 'focus'
  // Roles are computed relative to the focus — an edge with the focus on
  // one end tells us how this node relates.
  for (const e of graph.edges) {
    if (e.from === nodeSymbol && e.to === graph.focus) {
      if (e.relationship === 'supplier') return 'supplier'
      if (e.relationship === 'customer') return 'customer'
      if (e.relationship === 'competitor') return 'competitor'
      if (e.relationship === 'partner') return 'partner'
    }
    if (e.from === graph.focus && e.to === nodeSymbol) {
      // Focus → node: focus supplies/sells/etc. this node.
      if (e.relationship === 'supplier') return 'customer'
      if (e.relationship === 'customer') return 'supplier'
      if (e.relationship === 'competitor') return 'competitor'
      if (e.relationship === 'partner') return 'partner'
    }
  }
  return 'none'
}

export function CompanyValueChainSection({
  symbol,
  companyName,
  onOpenTicker
}: {
  symbol: string
  companyName: string
  // Called when the user clicks a resolved-ticker node. The parent
  // (StockDetail) ensures a passive row exists and navigates. Unresolved
  // nodes don't fire this — they render as non-clickable chips.
  onOpenTicker?: (symbol: string) => void
}): JSX.Element {
  const [row, setRow] = useState<CompanyValueChainRow | null | undefined>(undefined)
  const [working, setWorking] = useState(false)

  const reload = useCallback((): Promise<void> => {
    return window.api.stocks
      .getCompanyChain(symbol)
      .then((r) => {
        setRow(r)
      })
      .catch(() => {
        setRow(null)
      })
  }, [symbol])

  useEffect(() => {
    setRow(undefined)
    void reload()
  }, [reload])

  useEffect(() => {
    return window.api.stocks.onCompanyChainUpdated((updatedSymbol) => {
      if (updatedSymbol.toUpperCase() !== symbol.toUpperCase()) return
      void reload()
    })
  }, [reload, symbol])

  const onGenerate = async (force = false): Promise<void> => {
    setWorking(true)
    try {
      await window.api.stocks.generateCompanyChain(symbol, companyName, force)
      await reload()
    } finally {
      setWorking(false)
    }
  }

  const status = row?.status ?? null
  const isWorking = working || status === 'pending'

  const meta = row?.generatedAt
    ? `Generated ${new Date(row.generatedAt).toLocaleDateString()}`
    : 'Industry subgraph, on demand'

  return (
    <CollapsibleSection title="Value chain" meta={meta} defaultOpen>
      {row === undefined ? (
        <div className="text-[12px] text-zinc-500">Checking for a cached value chain…</div>
      ) : !row || !row.graph ? (
        <ColdState
          status={status}
          working={isWorking}
          sourceContext={row?.sourceContext ?? null}
          onGenerate={() => onGenerate(false)}
        />
      ) : (
        <ReadyState
          graph={row.graph}
          sourceContext={row.sourceContext}
          working={isWorking}
          onRegenerate={() => onGenerate(true)}
          onOpenTicker={onOpenTicker}
        />
      )}
    </CollapsibleSection>
  )
}

function ColdState({
  status,
  working,
  sourceContext,
  onGenerate
}: {
  status: string | null
  working: boolean
  sourceContext: string | null
  onGenerate: () => void
}): JSX.Element {
  const label =
    status === 'offline'
      ? 'Ollama was offline last time. Retry?'
      : status === 'error'
        ? 'Generation failed previously. Try again?'
        : 'Generate an AI-authored value chain for this ticker.'
  const hint =
    status === 'pending'
      ? 'Generation in progress — hang tight.'
      : 'The pipeline reads the company profile, latest 10-K Item 1, and recent news, then asks the local Ollama to structure an industry-appropriate subgraph.'
  return (
    <div className="space-y-3">
      <div className="text-[12.5px] text-zinc-300">{label}</div>
      <div className="text-[11px] text-zinc-500 leading-snug max-w-2xl">{hint}</div>
      <button
        onClick={onGenerate}
        disabled={working}
        className={`text-[10.5px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full ring-1 ring-inset transition-colors ${
          working
            ? 'bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait'
            : 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40 hover:bg-emerald-500/25'
        }`}
      >
        {working ? 'Generating…' : 'Generate value chain'}
      </button>
      {sourceContext && (
        <div className="text-[10px] text-zinc-600">Context: {sourceContext}</div>
      )}
    </div>
  )
}

function ReadyState({
  graph,
  sourceContext,
  working,
  onRegenerate,
  onOpenTicker
}: {
  graph: CompanyValueChain
  sourceContext: string | null
  working: boolean
  onRegenerate: () => void
  onOpenTicker?: (symbol: string) => void
}): JSX.Element {
  const nodeBySymbol = new Map(graph.nodes.map((n) => [n.symbol, n]))
  const nodesByStage = new Map<string, CompanyValueChainNode[]>()
  for (const s of graph.stages) nodesByStage.set(s.id, [])
  for (const n of graph.nodes) {
    if (!nodesByStage.has(n.stage)) nodesByStage.set(n.stage, [])
    nodesByStage.get(n.stage)!.push(n)
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap text-[10px] uppercase tracking-[0.2em]">
          <LegendChip role="focus" />
          <LegendChip role="supplier" />
          <LegendChip role="customer" />
          <LegendChip role="competitor" />
          <LegendChip role="partner" />
        </div>
        <button
          onClick={onRegenerate}
          disabled={working}
          className={`text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full ring-1 ring-inset ${
            working
              ? 'bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait'
              : 'bg-zinc-800/70 text-zinc-300 ring-zinc-700 hover:bg-zinc-700'
          }`}
          title="Re-run the Ollama generator with fresh context."
        >
          {working ? 'Regenerating…' : 'Regenerate'}
        </button>
      </header>

      <div className="space-y-3">
        {graph.stages.map((stage) => {
          const stageNodes = nodesByStage.get(stage.id) ?? []
          if (stageNodes.length === 0) return null
          return (
            <div key={stage.id}>
              <div className="flex items-center gap-3 mb-2">
                <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500 shrink-0">
                  {stage.label}
                </div>
                <span className="h-px flex-1 bg-edge/60" />
                <span className="text-[10px] tabular-nums text-zinc-600">
                  {stageNodes.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {stageNodes.map((n) => (
                  <NodeTile
                    key={n.symbol}
                    node={n}
                    role={classifyRole(graph, n.symbol)}
                    onOpenTicker={onOpenTicker}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <EdgesPane graph={graph} nodeBySymbol={nodeBySymbol} />

      {sourceContext && (
        <div className="text-[10px] text-zinc-600 pt-2 border-t border-edge/30">
          Context: {sourceContext} · Generated by local Ollama
        </div>
      )}
    </div>
  )
}

function NodeTile({
  node,
  role,
  onOpenTicker
}: {
  node: CompanyValueChainNode
  role: Role
  onOpenTicker?: (symbol: string) => void
}): JSX.Element {
  const tone = ROLE_TONE[role]
  const clickable = node.kind === 'ticker' && onOpenTicker !== undefined
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[12px] font-bold tracking-[0.04em] text-zinc-50">
            {node.symbol}
          </span>
          {node.kind === 'unverified' && (
            <span
              className="text-[8.5px] font-semibold uppercase tracking-[0.1em] px-1 py-0.5 rounded bg-zinc-800/80 text-zinc-500"
              title="Ollama named this company but we couldn't resolve it to a known ticker — treat as inferred."
            >
              Inferred
            </span>
          )}
        </div>
        {role !== 'none' && role !== 'focus' && (
          <span className="text-[8.5px] uppercase tracking-[0.14em] text-zinc-500">
            {tone.label}
          </span>
        )}
      </div>
      <div className="mt-1 text-[10px] text-zinc-500 truncate max-w-[200px]" title={node.name}>
        {node.name}
      </div>
      {node.blurb && (
        <div className="mt-1 text-[10.5px] text-zinc-400 leading-snug line-clamp-2">
          {node.blurb}
        </div>
      )}
    </>
  )
  const base = `relative rounded-lg border px-3 py-2 min-w-[160px] max-w-[260px] ${tone.fill} ${tone.border}`
  if (clickable) {
    return (
      <button
        onClick={() => onOpenTicker!(node.symbol)}
        className={`${base} text-left transition-colors hover:bg-surface-2/50`}
        title={`Open ${node.symbol} detail`}
      >
        {body}
      </button>
    )
  }
  return <div className={base}>{body}</div>
}

function EdgesPane({
  graph,
  nodeBySymbol
}: {
  graph: CompanyValueChain
  nodeBySymbol: Map<string, CompanyValueChainNode>
}): JSX.Element | null {
  // Only surface edges that involve the focus. Edges between two non-focus
  // nodes are noise in a single-ticker subgraph — the user can regenerate
  // a chain centered on a different ticker if they want to see that.
  const focusEdges = graph.edges.filter(
    (e) => e.from === graph.focus || e.to === graph.focus
  )
  if (focusEdges.length === 0) return null
  return (
    <div className="pt-2 border-t border-edge/30">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1.5">
        Relationships ({focusEdges.length})
      </div>
      <ul className="space-y-1">
        {focusEdges.map((e, i) => (
          <EdgeRow
            key={`${e.from}-${e.to}-${i}`}
            edge={e}
            focus={graph.focus}
            nodeBySymbol={nodeBySymbol}
          />
        ))}
      </ul>
    </div>
  )
}

function EdgeRow({
  edge,
  focus,
  nodeBySymbol
}: {
  edge: CompanyValueChainEdge
  focus: string
  nodeBySymbol: Map<string, CompanyValueChainNode>
}): JSX.Element {
  const other = edge.from === focus ? edge.to : edge.from
  const node = nodeBySymbol.get(other)
  const relTone =
    edge.relationship === 'supplier'
      ? 'bg-indigo-500/15 text-indigo-200 ring-indigo-500/40'
      : edge.relationship === 'competitor'
        ? 'bg-orange-500/15 text-orange-200 ring-orange-500/40'
        : edge.relationship === 'partner'
          ? 'bg-sky-500/15 text-sky-200 ring-sky-500/40'
          : 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40'
  return (
    <li className="flex items-start gap-3 text-[11.5px]">
      <span
        className={`shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.15em] px-2 py-0.5 rounded ring-1 ring-inset ${relTone} min-w-[76px] text-center`}
      >
        {edge.relationship}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-zinc-200 tabular-nums">
          {edge.from} → {edge.to}
          {node?.name && <span className="text-zinc-500"> · {node.name}</span>}
        </div>
        {edge.note && (
          <div className="text-[10.5px] text-zinc-400 leading-snug">{edge.note}</div>
        )}
      </div>
    </li>
  )
}

function LegendChip({ role }: { role: Role }): JSX.Element {
  const tone = ROLE_TONE[role]
  return (
    <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded ${tone.fill}`}>
      <span className={`h-2 w-2 rounded-sm ${tone.border.replace('border', 'bg')}`} />
      <span className="text-zinc-400">{tone.label}</span>
    </span>
  )
}
