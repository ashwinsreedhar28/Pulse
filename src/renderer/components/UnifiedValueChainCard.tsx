// One Value Chain card per ticker on the stock detail page. Picks the
// richest available data source (Claude-generated chain > curated
// supplyChainGraph.json > cold state) and renders them through a single
// layout — the 3-column Supplier / Competitor / Customer grid from
// StockValueChainCard. Before this merge, a static-graph ticker like
// NVDA or GOOGL rendered two visually inconsistent sections stacked on
// top of each other (curated + Claude), which was confusing. Now it's one
// card with a source badge in the header.

import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  CompanyValueChainEdgeSource,
  CompanyValueChainRow,
  Ticker
} from '../../preload'
import graph from '../../data/supplyChainGraph.json'
import { CollapsibleSection } from './CollapsibleSection'
import {
  TransactionCluster,
  categoryGlow,
  type Category,
  type Counterparty
} from './StockValueChainCard'

// Shape from supplyChainGraph.json — kept local so this file is self-
// contained. `sector` is the legacy text field; we don't use it here.
interface StaticNode {
  symbol: string
  stage: string
  sector: string
  blurb?: string
  name?: string
}
interface StaticEdge {
  from: string
  to: string
  note?: string
}
interface StaticStage {
  id: string
  label: string
}
const CHAIN = graph as unknown as {
  stages: StaticStage[]
  nodes: StaticNode[]
  edges: StaticEdge[]
  competitors: string[][]
}

// Shared shape the rendering path consumes. Either data source converts to
// this before we render. Focus-agnostic in its fields so we could hoist
// this into a util file later if the peer-compare panels want the same.
interface PreparedChain {
  source: 'claude' | 'ollama' | 'curated'
  focusStageLabel: string
  blurb: string | null
  suppliers: Counterparty[]
  customers: Counterparty[]
  competitors: Counterparty[]
  sourceContext: string | null
  generatedAt: number | null
}

export function UnifiedValueChainCard({
  symbol,
  companyName,
  tickers,
  onOpenTicker,
  onOpenCitation
}: {
  symbol: string
  companyName: string
  tickers: Ticker[]
  // Parent handles passive-ticker ensure + navigation. Not wired for the
  // curated fallback (TransactionCluster has its own onPick hook that we
  // don't set here — current StockValueChainCard never did either).
  onOpenTicker?: (symbol: string) => void
  // Forwarded into TransactionCluster as onOpenCitation. Lets edge
  // citation pills route to the in-app external reader for the cited
  // SEC filing or news article.
  onOpenCitation?: (url: string, title: string, subtitle?: string | null) => void
}): JSX.Element | null {
  const upper = symbol.toUpperCase()
  const [row, setRow] = useState<CompanyValueChainRow | null | undefined>(undefined)
  const [working, setWorking] = useState(false)

  const reload = useCallback((): Promise<void> => {
    return window.api.stocks
      .getCompanyChain(upper)
      .then((r) => setRow(r))
      .catch(() => setRow(null))
  }, [upper])

  useEffect(() => {
    setRow(undefined)
    void reload()
  }, [reload])

  useEffect(() => {
    return window.api.stocks.onCompanyChainUpdated((updated) => {
      if (updated.toUpperCase() !== upper) return
      void reload()
    })
  }, [reload, upper])

  const onGenerate = async (force = false): Promise<void> => {
    setWorking(true)
    try {
      await window.api.stocks.generateCompanyChain(upper, companyName, force)
      await reload()
    } finally {
      setWorking(false)
    }
  }

  const prepared = useMemo<PreparedChain | null>(() => {
    // Preferred path: Claude-generated (or Ollama-fallback) chain.
    if (row?.status === 'ready' && row.graph) {
      return prepareFromGenerated(row, tickers)
    }
    // Fallback: curated supplyChainGraph.json entry, if any.
    return prepareFromCurated(upper, tickers)
  }, [row, tickers, upper])

  // Still waiting on the first getCompanyChain() response — render a
  // silent placeholder to avoid flashing the cold state then immediately
  // swapping to ready.
  if (row === undefined) {
    return (
      <CollapsibleSection title="Value chain" meta="Checking…" defaultOpen gradient>
        <div className="text-[12px] text-zinc-500">
          Checking for a cached value chain…
        </div>
      </CollapsibleSection>
    )
  }

  // No generated chain AND not in the curated graph → cold state with a
  // generate button. Same shell as the prepared state so the card
  // silhouette doesn't shift when the chain arrives.
  if (!prepared) {
    const coldStatus = row?.status ?? null
    return (
      <CollapsibleSection
        title="Value chain"
        meta="Industry subgraph, on demand"
        defaultOpen
        gradient
      >
        <ColdState
          status={coldStatus}
          working={working || coldStatus === 'pending'}
          sourceContext={row?.sourceContext ?? null}
          onGenerate={() => onGenerate(false)}
        />
      </CollapsibleSection>
    )
  }

  // Prepared (generated or curated). Render the 3-column TransactionCluster
  // layout with the full-card gradient + role-based glow.
  const presentCategories: Category[] = []
  if (prepared.customers.length > 0) presentCategories.push('customer')
  if (prepared.suppliers.length > 0) presentCategories.push('supplier')
  if (prepared.competitors.length > 0) presentCategories.push('competitor')
  const { boxShadow, glowBackground } = categoryGlow(presentCategories)
  const gridColsClass =
    presentCategories.length === 3
      ? 'md:grid-cols-3'
      : presentCategories.length === 2
        ? 'md:grid-cols-2'
        : ''

  const linkCount =
    prepared.customers.length + prepared.suppliers.length + prepared.competitors.length
  const sourceLabel =
    prepared.source === 'claude'
      ? 'Claude'
      : prepared.source === 'ollama'
        ? 'Ollama'
        : 'Curated'
  const meta = (
    <span className="flex items-center gap-2">
      <span className="px-2 py-0.5 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80 normal-case tracking-[0.22em]">
        {prepared.focusStageLabel}
      </span>
      <span className="tabular-nums text-zinc-500">{linkCount} links</span>
      <span
        className={`text-[9px] font-semibold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-full ring-1 ring-inset ${
          prepared.source === 'curated'
            ? 'bg-sky-500/10 text-sky-300 ring-sky-500/30'
            : 'bg-violet-500/10 text-violet-300 ring-violet-500/30'
        }`}
        title={
          prepared.source === 'curated'
            ? 'From the hand-curated supply-chain graph'
            : `Generated by ${sourceLabel}${prepared.sourceContext ? ' · ' + prepared.sourceContext : ''}`
        }
      >
        {sourceLabel}
      </span>
    </span>
  )

  const canRegenerate = prepared.source !== 'curated'

  return (
    <CollapsibleSection
      title="Value chain"
      meta={meta}
      defaultOpen
      gradient
      backdropStyle={{ backgroundImage: glowBackground, boxShadow }}
    >
      {prepared.blurb && (
        <p className="text-[12.5px] leading-snug text-zinc-300 mb-4 max-w-[720px]">
          {prepared.blurb}
        </p>
      )}
      {canRegenerate && (
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => void onGenerate(true)}
            disabled={working}
            className={`text-[9.5px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full ring-1 ring-inset ${
              working
                ? 'bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait'
                : 'bg-zinc-800/70 text-zinc-300 ring-zinc-700 hover:bg-zinc-700'
            }`}
            title="Re-run the value-chain generator with fresh context. Takes 30–60s."
          >
            {working ? 'Regenerating…' : 'Regenerate'}
          </button>
          {prepared.generatedAt && (
            <span className="text-[10px] text-zinc-500">
              Generated {new Date(prepared.generatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
      <div className={`grid grid-cols-1 gap-6 items-start ${gridColsClass}`}>
        <TransactionCluster
          category="supplier"
          items={prepared.suppliers}
          onPick={onOpenTicker}
          onOpenCitation={onOpenCitation}
        />
        <TransactionCluster
          category="competitor"
          items={prepared.competitors}
          onPick={onOpenTicker}
          onOpenCitation={onOpenCitation}
        />
        <TransactionCluster
          category="customer"
          items={prepared.customers}
          onPick={onOpenTicker}
          onOpenCitation={onOpenCitation}
        />
      </div>
    </CollapsibleSection>
  )
}

// ---- data preparation -------------------------------------------------------

function prepareFromCurated(upper: string, tickers: Ticker[]): PreparedChain | null {
  const stageLabelById = new Map<string, string>()
  for (const s of CHAIN.stages) stageLabelById.set(s.id, s.label)
  const nodeBySymbol = new Map<string, StaticNode>()
  for (const n of CHAIN.nodes) nodeBySymbol.set(n.symbol, n)
  const nameBySymbol = new Map<string, string>()
  for (const t of tickers) nameBySymbol.set(t.symbol.toUpperCase(), t.companyName)
  const node = nodeBySymbol.get(upper) ?? null
  if (!node) return null

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

  if (customers.length === 0 && suppliers.length === 0 && competitors.length === 0) {
    return null
  }

  return {
    source: 'curated',
    focusStageLabel: stageLabelById.get(node.stage) ?? node.stage,
    blurb: node.blurb ?? null,
    suppliers,
    customers,
    competitors,
    sourceContext: null,
    generatedAt: null
  }
}

function prepareFromGenerated(
  row: CompanyValueChainRow,
  tickers: Ticker[]
): PreparedChain | null {
  const graph = row.graph
  if (!graph) return null
  const focus = graph.focus.toUpperCase()

  const stageLabelById = new Map<string, string>()
  for (const s of graph.stages) stageLabelById.set(s.id, s.label)
  // Also include static stage labels as a fallback — a Claude chain for a
  // tech ticker might occasionally use a static-pipeline stage name and
  // we'd rather show the curated label than a raw kebab-case id.
  for (const s of CHAIN.stages) {
    if (!stageLabelById.has(s.id)) stageLabelById.set(s.id, s.label)
  }
  const nodeBySymbol = new Map(graph.nodes.map((n) => [n.symbol.toUpperCase(), n]))
  const nameBySymbol = new Map<string, string>()
  for (const t of tickers) nameBySymbol.set(t.symbol.toUpperCase(), t.companyName)

  const focusNode = nodeBySymbol.get(focus)
  if (!focusNode) return null

  const toCounterparty = (
    sym: string,
    note: string | null,
    source: CompanyValueChainEdgeSource | null,
    citation: import('../../preload').CompanyValueChainEdgeCitation | null
  ): Counterparty => {
    const n = nodeBySymbol.get(sym)
    const stage = n?.stage ?? ''
    return {
      symbol: sym,
      stage,
      stageLabel: stage ? stageLabelById.get(stage) ?? humanize(stage) : '—',
      companyName: nameBySymbol.get(sym) ?? n?.name ?? sym,
      note,
      source,
      citation
    }
  }

  // Same role-bucketing logic as the ValueChain page's focus panel, so
  // supplier / customer / competitor semantics stay consistent across
  // views. Partner edges fold into customer (looking down-chain) when the
  // focus is the `from` side, supplier (looking up) when it's `to`.
  const suppliers: Counterparty[] = []
  const customers: Counterparty[] = []
  const competitors: Counterparty[] = []
  const seenSuppliers = new Set<string>()
  const seenCustomers = new Set<string>()
  const seenCompetitors = new Set<string>()

  for (const e of graph.edges) {
    const from = e.from.toUpperCase()
    const to = e.to.toUpperCase()
    const rel = e.relationship
    const note = e.note ?? null
    const source = e.source ?? null
    const citation = e.citation ?? null
    if (rel === 'competitor') {
      if (from === focus && !seenCompetitors.has(to)) {
        competitors.push(toCounterparty(to, note, source, citation))
        seenCompetitors.add(to)
      } else if (to === focus && !seenCompetitors.has(from)) {
        competitors.push(toCounterparty(from, note, source, citation))
        seenCompetitors.add(from)
      }
      continue
    }
    if (rel === 'supplier') {
      // from supplies to.
      if (to === focus && !seenSuppliers.has(from)) {
        suppliers.push(toCounterparty(from, note, source, citation))
        seenSuppliers.add(from)
      } else if (from === focus && !seenCustomers.has(to)) {
        customers.push(toCounterparty(to, note, source, citation))
        seenCustomers.add(to)
      }
      continue
    }
    if (rel === 'customer') {
      // from is customer of to (so to supplies from).
      if (from === focus && !seenSuppliers.has(to)) {
        suppliers.push(toCounterparty(to, note, source, citation))
        seenSuppliers.add(to)
      } else if (to === focus && !seenCustomers.has(from)) {
        customers.push(toCounterparty(from, note, source, citation))
        seenCustomers.add(from)
      }
      continue
    }
    if (rel === 'partner') {
      // Symmetric — fold into customers when focus is `from`, suppliers
      // otherwise. This matches ValueChain's logic.
      if (from === focus && !seenCustomers.has(to)) {
        customers.push(toCounterparty(to, note, source, citation))
        seenCustomers.add(to)
      } else if (to === focus && !seenSuppliers.has(from)) {
        suppliers.push(toCounterparty(from, note, source, citation))
        seenSuppliers.add(from)
      }
    }
  }

  if (suppliers.length === 0 && customers.length === 0 && competitors.length === 0) {
    return null
  }

  // Source detection — the provenance string we stamp during generation
  // starts with "Claude" or "local Ollama". Default to 'claude' because
  // that's the current primary path; if the string explicitly calls out
  // Ollama, downgrade the tag.
  const sourceContext = row.sourceContext ?? ''
  const source: PreparedChain['source'] = /ollama/i.test(sourceContext)
    ? 'ollama'
    : 'claude'

  return {
    source,
    focusStageLabel:
      stageLabelById.get(focusNode.stage) ?? humanize(focusNode.stage),
    blurb: focusNode.blurb ?? null,
    suppliers,
    customers,
    competitors,
    sourceContext: sourceContext || null,
    generatedAt: row.generatedAt ?? null
  }
}

function humanize(stageId: string): string {
  return stageId
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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
    status === 'offline' || status === 'error'
      ? 'Previous attempt didn’t return a usable chain. Retry — it’ll regenerate with fresh context.'
      : 'Generate an AI-authored value chain for this ticker.'
  const hint =
    status === 'pending'
      ? 'Generation in progress — hang tight.'
      : 'Pulls the company profile, latest 10-K Item 1, and recent news, then asks the configured AI to structure an industry-appropriate subgraph. First run takes 30–60 s.'
  return (
    <div className="space-y-3">
      <div className="text-[12.5px] text-zinc-300 leading-snug">{label}</div>
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
        <div className="text-[10px] text-zinc-600">Last context: {sourceContext}</div>
      )}
    </div>
  )
}
