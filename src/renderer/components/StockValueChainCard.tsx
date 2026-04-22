import { useMemo } from 'react'
import graph from '../../data/supplyChainGraph.json'

interface ChainStage {
  id: string
  label: string
}
interface ChainNode {
  symbol: string
  stage: string
  sector: string
  blurb?: string
}
interface ChainEdge {
  from: string
  to: string
  note?: string
}
interface ChainGraph {
  stages: ChainStage[]
  nodes: ChainNode[]
  edges: ChainEdge[]
}

const CHAIN = graph as unknown as ChainGraph

export function StockValueChainCard({ symbol }: { symbol: string }): JSX.Element | null {
  const upper = symbol.toUpperCase()

  const { node, outgoing, incoming, stageLabelById, nodeBySymbol } = useMemo(() => {
    const stageLabelById = new Map<string, string>()
    for (const s of CHAIN.stages) stageLabelById.set(s.id, s.label)
    const nodeBySymbol = new Map<string, ChainNode>()
    for (const n of CHAIN.nodes) nodeBySymbol.set(n.symbol, n)
    const node = nodeBySymbol.get(upper) ?? null
    const outgoing: ChainEdge[] = []
    const incoming: ChainEdge[] = []
    for (const e of CHAIN.edges) {
      if (e.from === upper) outgoing.push(e)
      if (e.to === upper) incoming.push(e)
    }
    return { node, outgoing, incoming, stageLabelById, nodeBySymbol }
  }, [upper])

  if (!node) return null
  if (outgoing.length === 0 && incoming.length === 0) return null

  return (
    <section className="mt-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/[0.04] p-5 shadow-[0_0_32px_-10px_rgba(16,185,129,0.55)]">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[13px] leading-none text-emerald-400">◆</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
          Value chain
        </h2>
        <span className="h-px flex-1 bg-emerald-500/20" />
        <span className="text-[10px] uppercase tracking-[0.22em] text-emerald-400/80">
          {stageLabelById.get(node.stage) ?? node.stage}
        </span>
      </div>
      {node.blurb && (
        <p className="text-[12.5px] leading-snug text-zinc-300 mb-4 max-w-[720px]">
          {node.blurb}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <EdgeColumn
          title="Supplies to"
          arrow="↗"
          edges={outgoing}
          direction="to"
          stageLabelById={stageLabelById}
          nodeBySymbol={nodeBySymbol}
        />
        <EdgeColumn
          title="Supplied by"
          arrow="↙"
          edges={incoming}
          direction="from"
          stageLabelById={stageLabelById}
          nodeBySymbol={nodeBySymbol}
        />
      </div>
    </section>
  )
}

function EdgeColumn({
  title,
  arrow,
  edges,
  direction,
  stageLabelById,
  nodeBySymbol
}: {
  title: string
  arrow: string
  edges: ChainEdge[]
  direction: 'from' | 'to'
  stageLabelById: Map<string, string>
  nodeBySymbol: Map<string, ChainNode>
}): JSX.Element {
  const sorted = useMemo(() => {
    return [...edges].sort((a, b) => {
      const sa = nodeBySymbol.get(a[direction])?.stage ?? ''
      const sb = nodeBySymbol.get(b[direction])?.stage ?? ''
      return sa.localeCompare(sb)
    })
  }, [edges, direction, nodeBySymbol])

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[13px] text-emerald-400/80 leading-none">{arrow}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-300">
          {title}
        </span>
        <span className="text-[10px] tabular-nums text-zinc-600">· {edges.length}</span>
      </div>
      {sorted.length === 0 ? (
        <div className="text-[11px] text-zinc-600 italic">None in graph.</div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((e, i) => {
            const counterparty = e[direction]
            const stageId = nodeBySymbol.get(counterparty)?.stage
            const stageLabel = stageId ? stageLabelById.get(stageId) ?? stageId : ''
            return (
              <li key={i} className="flex gap-2.5 text-[12px] items-start">
                <span className="font-bold tabular-nums text-zinc-100 w-[58px] shrink-0 leading-snug">
                  {counterparty}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500 mb-0.5">
                    {stageLabel}
                  </div>
                  <div className="text-zinc-300 leading-snug text-[11.5px]">
                    {e.note ?? <span className="text-zinc-600">—</span>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
