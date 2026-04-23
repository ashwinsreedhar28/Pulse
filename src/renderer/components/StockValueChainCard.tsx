import { useMemo } from 'react'
import type { Ticker } from '../../preload'
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
  // Optional display name for nodes that have no matching row in the
  // tickers table (e.g. private companies like Xanadu). Falls through
  // to the raw symbol if absent.
  name?: string
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
  competitors: string[][]
}

const CHAIN = graph as unknown as ChainGraph

export type Category = 'customer' | 'supplier' | 'competitor'

export interface Counterparty {
  symbol: string
  stage: string
  stageLabel: string
  companyName: string
  note: string | null
}

// Palette maps to the three relationship categories used throughout the value
// chain UI. Emerald = customers (revenue flowing in); indigo = suppliers
// (dependencies flowing in); orange = competitors (lateral rivals). Keeping
// these in one place so the focus-panel chips in the main graph view and the
// detail-card clusters here stay in sync.
export const TONE: Record<
  Category,
  {
    label: string
    glyph: string
    accent: string
    chipBorder: string
    chipBg: string
    chipText: string
    chipRing: string
    chipHoverBg: string
    headerAccent: string
    rail: string
    glowRgba: string
    shadowRgba: string
    glowOrigin: string
  }
> = {
  customer: {
    label: 'Customers',
    glyph: '→',
    accent: 'text-emerald-300',
    chipBorder: 'border-emerald-400/50',
    chipBg: 'bg-emerald-500/10',
    chipText: 'text-emerald-100',
    chipRing: 'ring-emerald-500/30',
    chipHoverBg: 'hover:bg-emerald-500/25',
    headerAccent: 'text-emerald-400',
    rail: 'bg-emerald-500/60',
    glowRgba: 'rgba(16, 185, 129, 0.16)',
    shadowRgba: 'rgba(16, 185, 129, 0.55)',
    glowOrigin: '100% 0%'
  },
  supplier: {
    label: 'Suppliers',
    glyph: '→',
    accent: 'text-indigo-300',
    chipBorder: 'border-indigo-400/50',
    chipBg: 'bg-indigo-500/10',
    chipText: 'text-indigo-100',
    chipRing: 'ring-indigo-500/30',
    chipHoverBg: 'hover:bg-indigo-500/25',
    headerAccent: 'text-indigo-400',
    rail: 'bg-indigo-500/60',
    glowRgba: 'rgba(99, 102, 241, 0.14)',
    shadowRgba: 'rgba(99, 102, 241, 0.5)',
    glowOrigin: '0% 100%'
  },
  competitor: {
    label: 'Competitors',
    glyph: '⇌',
    accent: 'text-orange-300',
    chipBorder: 'border-orange-400/50',
    chipBg: 'bg-orange-500/10',
    chipText: 'text-orange-100',
    chipRing: 'ring-orange-500/30',
    chipHoverBg: 'hover:bg-orange-500/25',
    headerAccent: 'text-orange-400',
    rail: 'bg-orange-500/60',
    glowRgba: 'rgba(249, 115, 22, 0.13)',
    shadowRgba: 'rgba(249, 115, 22, 0.5)',
    glowOrigin: '50% 0%'
  }
}

export function StockValueChainCard({
  symbol,
  tickers
}: {
  symbol: string
  tickers: Ticker[]
}): JSX.Element | null {
  const upper = symbol.toUpperCase()

  const { node, stageLabelById, customers, suppliers, competitors } = useMemo(() => {
    const stageLabelById = new Map<string, string>()
    for (const s of CHAIN.stages) stageLabelById.set(s.id, s.label)
    const nodeBySymbol = new Map<string, ChainNode>()
    for (const n of CHAIN.nodes) nodeBySymbol.set(n.symbol, n)
    const nameBySymbol = new Map<string, string>()
    for (const t of tickers) nameBySymbol.set(t.symbol.toUpperCase(), t.companyName)
    const node = nodeBySymbol.get(upper) ?? null

    const toCounterparty = (sym: string, note: string | null): Counterparty => {
      const n = nodeBySymbol.get(sym)
      const stage = n?.stage ?? ''
      return {
        symbol: sym,
        stage,
        stageLabel: stage ? stageLabelById.get(stage) ?? stage : '—',
        companyName: nameBySymbol.get(sym) ?? n?.name ?? sym,
        note
      }
    }

    const customers: Counterparty[] = []
    const suppliers: Counterparty[] = []
    for (const e of CHAIN.edges) {
      if (e.from === upper) customers.push(toCounterparty(e.to, e.note ?? null))
      if (e.to === upper) suppliers.push(toCounterparty(e.from, e.note ?? null))
    }

    const competitorSet = new Set<string>()
    for (const pair of CHAIN.competitors ?? []) {
      if (pair.length !== 2) continue
      const [a, b] = pair
      if (a === upper) competitorSet.add(b)
      else if (b === upper) competitorSet.add(a)
    }
    const competitors: Counterparty[] = [...competitorSet].map((s) => toCounterparty(s, null))

    return { node, stageLabelById, customers, suppliers, competitors }
  }, [upper, tickers])

  if (!node) return null
  if (customers.length === 0 && suppliers.length === 0 && competitors.length === 0) return null

  const stageLabel = stageLabelById.get(node.stage) ?? node.stage

  // Only light up the backlight for categories that actually have counterparties,
  // so a supplier-only node shows indigo, a rival-heavy node shows orange, etc.
  const presentCategories: Category[] = []
  if (customers.length > 0) presentCategories.push('customer')
  if (suppliers.length > 0) presentCategories.push('supplier')
  if (competitors.length > 0) presentCategories.push('competitor')

  const { boxShadow, glowBackground } = categoryGlow(presentCategories)

  const gridColsClass =
    presentCategories.length === 3
      ? 'md:grid-cols-3'
      : presentCategories.length === 2
        ? 'md:grid-cols-2'
        : ''

  return (
    <section
      className="mt-6 rounded-2xl border border-edge bg-gradient-to-br from-surface-1 to-surface-0 p-5 relative overflow-hidden"
      style={{ boxShadow }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: glowBackground }}
      />

      <div className="relative flex items-center gap-3 mb-4">
        <span className="text-[12px] leading-none text-emerald-400">◆</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-200">
          Value chain
        </h2>
        <span className="h-px flex-1 bg-edge/60" />
        <span className="text-[9px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80">
          {stageLabel}
        </span>
        <span className="text-[9px] uppercase tracking-[0.22em] text-zinc-500 tabular-nums">
          {customers.length + suppliers.length + competitors.length} links
        </span>
      </div>

      {node.blurb && (
        <p className="relative text-[12.5px] leading-snug text-zinc-300 mb-5 max-w-[720px]">
          {node.blurb}
        </p>
      )}

      <div className={`relative grid grid-cols-1 gap-6 items-start ${gridColsClass}`}>
        <TransactionCluster category="supplier" items={suppliers} />
        <TransactionCluster category="competitor" items={competitors} />
        <TransactionCluster category="customer" items={customers} />
      </div>
    </section>
  )
}

// Compose a box-shadow + layered radial-gradient backlight from whichever
// categories are present. Customer = TR corner, supplier = BL, competitor = TL.
// Layered overlays tint the whole card rather than painting a visible blob in
// one corner, which matches the premium feel of the rest of the detail view.
// Exported so the ValueChain focus panel can apply the same treatment.
export function categoryGlow(present: Category[]): {
  boxShadow: string
  glowBackground: string
} {
  const boxShadow = present.map((cat) => `0 0 40px -18px ${TONE[cat].shadowRgba}`).join(', ')
  const glowBackground = present
    .map(
      (cat) =>
        `radial-gradient(ellipse 70% 70% at ${TONE[cat].glowOrigin}, ${TONE[cat].glowRgba}, transparent 65%)`
    )
    .join(', ')
  return { boxShadow, glowBackground }
}

function useStageGroups(items: Counterparty[]): {
  stage: string
  label: string
  items: Counterparty[]
}[] {
  return useMemo(() => {
    const byStage = new Map<string, Counterparty[]>()
    for (const item of items) {
      if (!item.stage) continue
      if (!byStage.has(item.stage)) byStage.set(item.stage, [])
      byStage.get(item.stage)!.push(item)
    }
    const stageOrder = CHAIN.stages.map((s) => s.id)
    return stageOrder
      .filter((id) => byStage.has(id))
      .map((id) => ({
        stage: id,
        label: CHAIN.stages.find((s) => s.id === id)?.label ?? id,
        items: (byStage.get(id) ?? []).sort((a, b) => a.symbol.localeCompare(b.symbol))
      }))
  }, [items])
}

// All three relationship categories render with the same structure: a
// cluster header (arrow + label + count), then stage-grouped rows of
// [symbol pill] [company name + optional transaction note]. Competitors
// simply omit the note. Keeping the layouts identical makes the three
// sections scan as a consistent unit instead of one section looking like
// a different component.
//
// Interaction props are optional: the stock-detail page uses the cluster as
// a passive reference list, but the ValueChain focus panel makes the symbol
// chip clickable for quick navigation between tickers. Passing any of the
// handlers upgrades the chip to a <button>.
export function TransactionCluster({
  category,
  items,
  onPick,
  onHover,
  onLeave
}: {
  category: Category
  items: Counterparty[]
  onPick?: (symbol: string) => void
  onHover?: (symbol: string) => void
  onLeave?: () => void
}): JSX.Element | null {
  const tone = TONE[category]
  const groups = useStageGroups(items)
  if (items.length === 0) return null
  const interactive = Boolean(onPick || onHover || onLeave)

  return (
    <div className="relative pl-3">
      <div className={`absolute left-0 top-1 bottom-1 w-[2px] rounded-full ${tone.rail}`} />
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[13px] leading-none ${tone.headerAccent}`}>{tone.glyph}</span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${tone.accent}`}
        >
          {tone.label}
        </span>
        <span className="text-[10px] tabular-nums text-zinc-600">· {items.length}</span>
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.stage}>
            <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500 mb-1.5">
              {g.label}
            </div>
            <ul className="space-y-1.5">
              {g.items.map((item) => {
                const chipClasses = `inline-flex items-center justify-center shrink-0 px-2 py-[3px] rounded-md border text-[11px] font-bold tabular-nums tracking-[0.04em] min-w-[58px] ${tone.chipBorder} ${tone.chipBg} ${tone.chipText} ring-1 ring-inset ${tone.chipRing}`
                return (
                  <li key={item.symbol} className="flex items-start gap-2.5">
                    {interactive ? (
                      <button
                        type="button"
                        onClick={() => onPick?.(item.symbol)}
                        onMouseEnter={() => onHover?.(item.symbol)}
                        onMouseLeave={() => onLeave?.()}
                        className={`${chipClasses} ${tone.chipHoverBg} transition-colors`}
                      >
                        {item.symbol}
                      </button>
                    ) : (
                      <span className={chipClasses}>{item.symbol}</span>
                    )}
                    <div className="min-w-0 flex-1 pt-[1px]">
                      <div className="text-[12px] leading-snug text-zinc-200 truncate">
                        {item.companyName}
                      </div>
                      {item.note && (
                        <div className="text-[11px] leading-snug text-zinc-400 mt-0.5">
                          {item.note}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
