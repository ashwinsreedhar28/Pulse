import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  GraphEdgeOverride,
  GraphNodeOverride,
  StockQuote,
  Ticker
} from '../../preload'
import graph from '../../data/supplyChainGraph.json'
import { resolveDisplayQuote } from './quoteDisplay'

interface ChainStage {
  id: string
  label: string
}
interface ChainNode {
  symbol: string
  stage: string
  sector: string
  blurb?: string
  name?: string
}
interface ChainEdge {
  from: string
  to: string
  note?: string
  // 0..1 edge strength from overlay weights. Null for static-JSON edges
  // (they're hand-curated, so we treat them as full-weight by default).
  weight?: number | null
  // Source tags ("news_cooccurrence", "sec_10k_concentration", or a
  // comma-joined consensus list) — drives which tone modifier the diagram
  // applies so 10-K-backed edges can render slightly more prominently.
  source?: string | null
}
interface ChainGraph {
  stages: ChainStage[]
  nodes: ChainNode[]
  edges: ChainEdge[]
  competitors: string[][]
}

const CHAIN = graph as unknown as ChainGraph

const COMPETITOR_MAP: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>()
  for (const pair of CHAIN.competitors ?? []) {
    if (pair.length !== 2) continue
    const [a, b] = pair
    if (!m.has(a)) m.set(a, new Set())
    if (!m.has(b)) m.set(b, new Set())
    m.get(a)!.add(b)
    m.get(b)!.add(a)
  }
  return m
})()

// Turn a kebab-case stage id ("retail-banking") into a display title
// ("Retail Banking") when a generated chain surfaces a stage that's not
// in the curated supplyChainGraph pipeline. Mirrors the same helper in
// ValueChain.tsx — kept local to the diagram so neither component has to
// depend on the other.
function humanizeStageId(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Layout constants — SVG user units. The viewBox maps the entire content
// rectangle into the canvas, and pan/zoom just mutate the viewBox, so node
// placements never move in their own coordinate system.
const NODE_W = 180
const NODE_H = 52
const V_GAP = 18
const COL_GAP = 340
const ARROW_STAGGER_SPREAD = 40

type Role = 'focus' | 'supplier' | 'customer' | 'competitor'
type EdgeTone = 'supplier' | 'customer' | 'competitor'

interface ToneStyle {
  stroke: string
  dashed: boolean
  label: string
  // Tint colors for edge-origin tooltips — subtle tinted background, a matching
  // ring, and a slightly lifted text color so the box reads as "this came from
  // a supplier arrow" vs "this came from a customer arrow" without shouting.
  tipBg: string
  tipRing: string
  tipText: string
}

const TONE: Record<EdgeTone, ToneStyle> = {
  supplier: {
    stroke: 'rgb(129, 140, 248)',
    dashed: false,
    label: 'Suppliers',
    tipBg: 'rgba(79, 70, 229, 0.22)',
    tipRing: 'rgba(129, 140, 248, 0.55)',
    tipText: 'rgb(224, 231, 255)'
  },
  customer: {
    stroke: 'rgb(52, 211, 153)',
    dashed: false,
    label: 'Customers',
    tipBg: 'rgba(16, 185, 129, 0.2)',
    tipRing: 'rgba(52, 211, 153, 0.55)',
    tipText: 'rgb(209, 250, 229)'
  },
  competitor: {
    stroke: 'rgb(251, 146, 60)',
    dashed: true,
    label: 'Competitors',
    tipBg: 'rgba(249, 115, 22, 0.2)',
    tipRing: 'rgba(251, 146, 60, 0.55)',
    tipText: 'rgb(254, 215, 170)'
  }
}

interface LaidOutNode {
  symbol: string
  x: number
  y: number
  stage: string
  stageLabel: string
  companyName: string
  quote: StockQuote | undefined
  hasTickerRow: boolean
  role: Role
  isPrimary: boolean
}

interface LaidOutEdge {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  note: string | null
  tone: EdgeTone
  // 0..1 confidence when the edge came from an overlay; null for static
  // graph edges (rendered at full strength).
  weight: number | null
  // Source chain ("news_cooccurrence,sec_10k_concentration" for multi-source
  // consensus edges). Null for static edges.
  source: string | null
}

// Pinned tooltips are anchored in SVG coordinates so they move with pan/zoom.
// We keep them decoupled from specific edge IDs — a tooltip you pinned while
// viewing NVDA should survive when you add AMZN as a second focus and some
// edges get re-indexed.
interface PinnedTooltip {
  id: number
  note: string
  svgX: number
  svgY: number
  tone: EdgeTone
}

export function ValueChainDiagram({
  initialSymbol,
  tickers,
  quotes,
  onClose,
  onOpenTicker,
  onActivateTicker
}: {
  initialSymbol: string
  tickers: Ticker[]
  quotes: StockQuote[]
  onClose: () => void
  onOpenTicker: (tickerId: number) => void
  onActivateTicker: (tickerId: number) => void
}): JSX.Element {
  // Multi-hop exploration state.
  //  - focusSet: every symbol currently pinned as a focus. Its suppliers,
  //    customers, and competitors are all visible around it.
  //  - primarySymbol: the "active" focus. Header + Open detail + Watchlist
  //    buttons operate on this one. Clicking any focus node re-primaries it.
  const [focusSet, setFocusSet] = useState<Set<string>>(() => new Set([initialSymbol]))
  const [primarySymbol, setPrimarySymbol] = useState(initialSymbol)

  // Per-node position overrides, applied on top of the auto-layout so users can
  // drag nodes around to their liking. Kept keyed by symbol so the override
  // survives focus-set changes as long as that node is still on screen.
  const [overrides, setOverrides] = useState<Map<string, { x: number; y: number }>>(new Map())

  // Dynamic edge + node overlays from the graph-growth pipeline. Fetched
  // once on mount and refreshed on every graph:updated broadcast. The
  // edges merge into CHAIN.edges + the competitor map; the nodes merge
  // into nodeBySymbol so auto-discovered tickers can participate in
  // layout as first-class tiles.
  const [edgeOverrides, setEdgeOverrides] = useState<GraphEdgeOverride[]>([])
  const [nodeOverrides, setNodeOverrides] = useState<GraphNodeOverride[]>([])
  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api.graph.listOverrides(),
      window.api.graph.listNodeOverrides()
    ])
      .then(([edges, nodes]) => {
        if (cancelled) return
        setEdgeOverrides(edges)
        setNodeOverrides(nodes)
      })
      .catch((err: unknown) => {
        console.warn('[valueChainDiagram] overrides fetch failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    return window.api.graph.onUpdated(() => {
      Promise.all([
        window.api.graph.listOverrides(),
        window.api.graph.listNodeOverrides()
      ])
        .then(([edges, nodes]) => {
          setEdgeOverrides(edges)
          setNodeOverrides(nodes)
        })
        .catch(() => {
          /* keep prior overrides */
        })
    })
  }, [])

  // Merged graph data. Starts with the static JSON and layers in accepted
  // overlay edges for supplier/partner kinds; competitor overrides extend
  // the competitor map. weight + source ride along so the renderer can
  // scale edge thickness / opacity by confidence (D1).
  const mergedEdges = useMemo<ChainEdge[]>(() => {
    // Absorber normalizes customer edges to supplier form at write time;
    // the swap branch below catches any legacy pre-normalization rows.
    // Dedupe by (from, to) so cross-chain duplicates draw one arrow.
    const out: ChainEdge[] = CHAIN.edges.map((e) => ({ ...e, weight: null, source: null }))
    for (const o of edgeOverrides) {
      if (o.relationship === 'supplier' || o.relationship === 'partner') {
        out.push({
          from: o.fromSymbol.toUpperCase(),
          to: o.toSymbol.toUpperCase(),
          note: o.note ?? undefined,
          weight: o.weight,
          source: o.source
        })
      } else if (o.relationship === 'customer') {
        out.push({
          from: o.toSymbol.toUpperCase(),
          to: o.fromSymbol.toUpperCase(),
          note: o.note ?? undefined,
          weight: o.weight,
          source: o.source
        })
      }
    }
    const seen = new Set<string>()
    const deduped: ChainEdge[] = []
    for (const edge of out) {
      const key = `${edge.from}→${edge.to}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(edge)
    }
    return deduped
  }, [edgeOverrides])

  const mergedCompetitorMap = useMemo<Map<string, Set<string>>>(() => {
    const m = new Map<string, Set<string>>()
    for (const [k, v] of COMPETITOR_MAP) {
      m.set(k, new Set(v))
    }
    for (const o of edgeOverrides) {
      if (o.relationship !== 'competitor') continue
      const a = o.fromSymbol.toUpperCase()
      const b = o.toSymbol.toUpperCase()
      if (!m.has(a)) m.set(a, new Set())
      if (!m.has(b)) m.set(b, new Set())
      m.get(a)!.add(b)
      m.get(b)!.add(a)
    }
    return m
  }, [edgeOverrides])

  const quoteBySymbol = useMemo(() => {
    const m = new Map<string, StockQuote>()
    for (const q of quotes) m.set(q.symbol.toUpperCase(), q)
    return m
  }, [quotes])

  const tickerBySymbol = useMemo(() => {
    const m = new Map<string, Ticker>()
    for (const t of tickers) m.set(t.symbol.toUpperCase(), t)
    return m
  }, [tickers])

  const nodeBySymbol = useMemo(() => {
    const m = new Map<string, ChainNode>()
    for (const n of CHAIN.nodes) m.set(n.symbol, n)
    // Overlay auto-discovered nodes on top. Static entries win on collision
    // so baseline curation isn't silently overwritten.
    for (const o of nodeOverrides) {
      const sym = o.symbol.toUpperCase()
      if (m.has(sym)) continue
      m.set(sym, {
        symbol: sym,
        stage: o.stage,
        sector: o.sector ?? 'other',
        name: o.name ?? undefined,
        blurb: o.blurb ?? undefined
      })
    }
    return m
  }, [nodeOverrides])

  // Stages the diagram lays nodes into. Start with the curated pipeline,
  // then append any novel stages that appear on absorbed overrides (COF
  // chains use "retail-banking", "credit-services"; XOM chains use
  // "refining", "marketing" — none of which exist in the tech pipeline).
  // Without this, absorbed nodes would fall through with stage index
  // undefined and get clustered at x=0 alongside the raw-materials column.
  const activeStages = useMemo<ChainStage[]>(() => {
    const seen = new Set<string>(CHAIN.stages.map((s) => s.id))
    const out: ChainStage[] = [...CHAIN.stages]
    for (const o of nodeOverrides) {
      if (!o.stage || seen.has(o.stage)) continue
      seen.add(o.stage)
      out.push({ id: o.stage, label: humanizeStageId(o.stage) })
    }
    return out
  }, [nodeOverrides])

  const stageLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of activeStages) m.set(s.id, s.label)
    return m
  }, [activeStages])

  const stageIdx = useMemo(() => {
    const m = new Map<string, number>()
    activeStages.forEach((s, i) => m.set(s.id, i))
    return m
  }, [activeStages])

  // Full layout: focuses in the center column, unioned suppliers on the left,
  // unioned customers on the right. Competitors are NOT drawn in the SVG —
  // they live in a separate per-focus chip strip so the diagram stays readable
  // without a tangle of dashed arcs over the top of the canvas.
  //
  // Edges are emitted per-focus with per-focus stagger so many-counterparty
  // focuses don't collapse all their arrows onto a single pixel.
  const { nodes, edges, bounds, competitorsByFocus } = useMemo(() => {
    const focusSyms = Array.from(focusSet)
    const focusNodes = focusSyms
      .map((s) => nodeBySymbol.get(s))
      .filter((n): n is ChainNode => Boolean(n))
    if (focusNodes.length === 0) {
      return {
        nodes: [] as LaidOutNode[],
        edges: [] as LaidOutEdge[],
        bounds: { minX: -400, minY: -300, maxX: 400, maxY: 300 },
        competitorsByFocus: [] as { focusSymbol: string; competitors: ChainNode[] }[]
      }
    }

    // Competitor union across all focuses. Competitor takes precedence over
    // supplier/customer so a node can't appear in two columns if it's
    // simultaneously a rival of one focus and a counterparty of another.
    const competitorUnion = new Set<string>()
    for (const f of focusNodes) {
      const rivals = mergedCompetitorMap.get(f.symbol) ?? new Set()
      for (const r of rivals) if (!focusSet.has(r)) competitorUnion.add(r)
    }

    const blockedFromSideColumns = new Set<string>([...focusSet, ...competitorUnion])

    // For each side-column node, remember which focus(es) it serves and the
    // note attached to each specific edge — this is what feeds per-focus arrow
    // stagger below. weight + source are captured so D1 (visual thickness)
    // can render overlay edges at the confidence the pipeline assigned them.
    const supplierUnion = new Map<
      string,
      {
        node: ChainNode
        notesByFocus: Map<string, string | null>
        weightByFocus: Map<string, number | null>
        sourceByFocus: Map<string, string | null>
      }
    >()
    const customerUnion = new Map<
      string,
      {
        node: ChainNode
        notesByFocus: Map<string, string | null>
        weightByFocus: Map<string, number | null>
        sourceByFocus: Map<string, string | null>
      }
    >()
    // First-column-seen wins — a node that supplies one focus and buys from
    // another is placed as whichever role appears first in the edge list.
    const columnOf = new Map<string, 'supplier' | 'customer'>()

    // Edges between two focuses are rendered as lightweight loops off the
    // center column rather than dropping into the side columns.
    const focusToFocus: { fromSym: string; toSym: string; note: string | null }[] = []

    for (const e of mergedEdges) {
      const fromIsFocus = focusSet.has(e.from)
      const toIsFocus = focusSet.has(e.to)
      if (!fromIsFocus && !toIsFocus) continue
      if (fromIsFocus && toIsFocus) {
        focusToFocus.push({ fromSym: e.from, toSym: e.to, note: e.note ?? null })
        continue
      }
      // Exactly one endpoint is a focus.
      const otherSym = fromIsFocus ? e.to : e.from
      if (blockedFromSideColumns.has(otherSym)) continue
      const otherNode = nodeBySymbol.get(otherSym)
      if (!otherNode) continue

      const intended: 'supplier' | 'customer' = toIsFocus ? 'supplier' : 'customer'
      const existing = columnOf.get(otherSym)
      if (existing && existing !== intended) continue // first-role wins
      columnOf.set(otherSym, intended)

      const focusSym = fromIsFocus ? e.from : e.to
      if (intended === 'supplier') {
        let entry = supplierUnion.get(otherSym)
        if (!entry) {
          entry = {
            node: otherNode,
            notesByFocus: new Map(),
            weightByFocus: new Map(),
            sourceByFocus: new Map()
          }
          supplierUnion.set(otherSym, entry)
        }
        entry.notesByFocus.set(focusSym, e.note ?? null)
        entry.weightByFocus.set(focusSym, e.weight ?? null)
        entry.sourceByFocus.set(focusSym, e.source ?? null)
      } else {
        let entry = customerUnion.get(otherSym)
        if (!entry) {
          entry = {
            node: otherNode,
            notesByFocus: new Map(),
            weightByFocus: new Map(),
            sourceByFocus: new Map()
          }
          customerUnion.set(otherSym, entry)
        }
        entry.notesByFocus.set(focusSym, e.note ?? null)
        entry.weightByFocus.set(focusSym, e.weight ?? null)
        entry.sourceByFocus.set(focusSym, e.source ?? null)
      }
    }

    const byStageThenSym = (a: ChainNode, b: ChainNode): number => {
      const sa = stageIdx.get(a.stage) ?? 999
      const sb = stageIdx.get(b.stage) ?? 999
      if (sa !== sb) return sa - sb
      return a.symbol.localeCompare(b.symbol)
    }

    // --- Focus column (x = 0) ---
    const focusesSorted = [...focusNodes].sort(byStageThenSym)
    const fCount = focusesSorted.length
    const fTotalH = fCount * NODE_H + (fCount > 1 ? (fCount - 1) * V_GAP : 0)
    let fY = -fTotalH / 2 + NODE_H / 2
    const focusLaid: LaidOutNode[] = focusesSorted.map((n) => {
      const laid = toLaidOutNode(
        n,
        0,
        fY,
        'focus',
        n.symbol === primarySymbol,
        stageLabelById,
        tickerBySymbol,
        quoteBySymbol
      )
      fY += NODE_H + V_GAP
      return laid
    })

    // --- Supplier / customer columns ---
    const layoutColumn = (
      entries: { node: ChainNode }[],
      x: number,
      role: 'supplier' | 'customer'
    ): LaidOutNode[] => {
      const sorted = [...entries].sort((a, b) => byStageThenSym(a.node, b.node))
      const n = sorted.length
      const totalH = n * NODE_H + (n > 1 ? (n - 1) * V_GAP : 0)
      let y = -totalH / 2 + NODE_H / 2
      const out: LaidOutNode[] = []
      for (const item of sorted) {
        out.push(
          toLaidOutNode(
            item.node,
            x,
            y,
            role,
            false,
            stageLabelById,
            tickerBySymbol,
            quoteBySymbol
          )
        )
        y += NODE_H + V_GAP
      }
      return out
    }

    const supplierLaid = layoutColumn(Array.from(supplierUnion.values()), -COL_GAP, 'supplier')
    const customerLaid = layoutColumn(Array.from(customerUnion.values()), COL_GAP, 'customer')

    // Per-focus competitor lists for the out-of-canvas chip strip. Kept keyed
    // by focus symbol so the strip can render one row per focus even when two
    // focuses share a rival.
    const competitorsByFocus: { focusSymbol: string; competitors: ChainNode[] }[] = focusLaid.map(
      (f) => {
        const rivals = mergedCompetitorMap.get(f.symbol) ?? new Set<string>()
        const list: ChainNode[] = []
        for (const r of rivals) {
          if (focusSet.has(r)) continue
          const n = nodeBySymbol.get(r)
          if (n) list.push(n)
        }
        list.sort((a, b) => a.symbol.localeCompare(b.symbol))
        return { focusSymbol: f.symbol, competitors: list }
      }
    )

    const allNodes: LaidOutNode[] = [...focusLaid, ...supplierLaid, ...customerLaid]

    // Bounds are computed from the AUTO-layout, before overrides are applied,
    // so "Reset view" frames the canonical skeleton and doesn't jitter around
    // as the user drags individual nodes. Users pan/zoom to reach dragged
    // nodes if they park them far away.
    const autoXs = allNodes.map((n) => n.x)
    const autoYs = allNodes.map((n) => n.y)
    const minX = Math.min(...autoXs) - NODE_W / 2 - 60
    const maxX = Math.max(...autoXs) + NODE_W / 2 + 60
    const minY = Math.min(...autoYs) - NODE_H / 2 - 60
    const maxY = Math.max(...autoYs) + NODE_H / 2 + 60

    // Apply user drag overrides in-place. focusLaid / supplierLaid /
    // customerLaid all reference the same LaidOutNode instances as allNodes,
    // so mutating here flows through to edge computation below.
    for (const n of allNodes) {
      const o = overrides.get(n.symbol)
      if (o) {
        n.x = o.x
        n.y = o.y
      }
    }

    const laidBySymbol = new Map<string, LaidOutNode>()
    for (const n of allNodes) laidBySymbol.set(n.symbol, n)

    // --- Edges ---
    const staggerOffsets = (count: number): number[] => {
      if (count === 0) return []
      if (count === 1) return [0]
      const spread = Math.min(ARROW_STAGGER_SPREAD, NODE_H - 10)
      const step = spread / (count - 1)
      return Array.from({ length: count }, (_, i) => -spread / 2 + i * step)
    }

    const laidEdges: LaidOutEdge[] = []

    for (const focus of focusLaid) {
      const focusSym = focus.symbol
      // Suppliers that feed THIS focus specifically (may be a subset of the
      // full supplier column).
      const supOfFocus: {
        laid: LaidOutNode
        note: string | null
        weight: number | null
        source: string | null
      }[] = []
      for (const entry of supplierUnion.values()) {
        if (entry.notesByFocus.has(focusSym)) {
          const laid = laidBySymbol.get(entry.node.symbol)
          if (laid)
            supOfFocus.push({
              laid,
              note: entry.notesByFocus.get(focusSym) ?? null,
              weight: entry.weightByFocus.get(focusSym) ?? null,
              source: entry.sourceByFocus.get(focusSym) ?? null
            })
        }
      }
      supOfFocus.sort((a, b) => a.laid.y - b.laid.y)
      const supOffsets = staggerOffsets(supOfFocus.length)
      supOfFocus.forEach((item, i) => {
        laidEdges.push({
          id: `sup-${focusSym}-${item.laid.symbol}`,
          fromX: item.laid.x + NODE_W / 2,
          fromY: item.laid.y,
          toX: focus.x - NODE_W / 2,
          toY: focus.y + supOffsets[i],
          note: item.note,
          tone: 'supplier',
          weight: item.weight,
          source: item.source
        })
      })

      const custOfFocus: {
        laid: LaidOutNode
        note: string | null
        weight: number | null
        source: string | null
      }[] = []
      for (const entry of customerUnion.values()) {
        if (entry.notesByFocus.has(focusSym)) {
          const laid = laidBySymbol.get(entry.node.symbol)
          if (laid)
            custOfFocus.push({
              laid,
              note: entry.notesByFocus.get(focusSym) ?? null,
              weight: entry.weightByFocus.get(focusSym) ?? null,
              source: entry.sourceByFocus.get(focusSym) ?? null
            })
        }
      }
      custOfFocus.sort((a, b) => a.laid.y - b.laid.y)
      const custOffsets = staggerOffsets(custOfFocus.length)
      custOfFocus.forEach((item, i) => {
        laidEdges.push({
          id: `cust-${focusSym}-${item.laid.symbol}`,
          fromX: focus.x + NODE_W / 2,
          fromY: focus.y + custOffsets[i],
          toX: item.laid.x - NODE_W / 2,
          toY: item.laid.y,
          note: item.note,
          tone: 'customer',
          weight: item.weight,
          source: item.source
        })
      })
    }

    // Focus → focus edges. mergedEdges is canonicalized to supplier-form
    // at absorption, so every entry here means "from supplies to".
    // - Exit the supplier focus's RIGHT side, enter the customer focus's
    //   LEFT side — matches how supplier/customer arrows render for
    //   single-focus layouts, so the visual semantic ("flows enter on the
    //   left, exit on the right") stays consistent as users add focuses.
    // - Color follows the PRIMARY focus's perspective:
    //     * primary = supplier end → the other focus is primary's customer
    //       → emerald (customer tone)
    //     * primary = customer end → the other focus is primary's supplier
    //       → indigo (supplier tone)
    //     * primary = neither (rare, 3+ focuses) → default to supplier tone
    //   This way adding MSFT to an NVDA-focused view renders the NVDA→MSFT
    //   arrow in emerald (MSFT is NVDA's customer), while a user viewing
    //   from MSFT's side sees the same edge in indigo.
    for (const ff of focusToFocus) {
      const from = laidBySymbol.get(ff.fromSym)
      const to = laidBySymbol.get(ff.toSym)
      if (!from || !to) continue
      const tone: EdgeTone =
        primarySymbol === ff.fromSym
          ? 'customer'
          : primarySymbol === ff.toSym
            ? 'supplier'
            : 'supplier'
      laidEdges.push({
        id: `ff-${ff.fromSym}-${ff.toSym}`,
        fromX: from.x + NODE_W / 2,
        fromY: from.y,
        toX: to.x - NODE_W / 2,
        toY: to.y,
        note: ff.note,
        tone,
        weight: null,
        source: null
      })
    }

    return {
      nodes: allNodes,
      edges: laidEdges,
      bounds: { minX, minY, maxX, maxY },
      competitorsByFocus
    }
  }, [
    focusSet,
    primarySymbol,
    overrides,
    nodeBySymbol,
    stageLabelById,
    stageIdx,
    quoteBySymbol,
    tickerBySymbol,
    mergedEdges,
    mergedCompetitorMap
  ])

  const svgRef = useRef<SVGSVGElement>(null)

  // View state drives the SVG viewBox. Kept in a ref alongside React state so
  // native wheel/mousemove listeners can read the latest value without
  // reattaching on every pan tick.
  const [view, setView] = useState({ x: -600, y: -400, w: 1600, h: 900 })
  const viewRef = useRef(view)
  viewRef.current = view

  const [dragging, setDragging] = useState<{
    startClientX: number
    startClientY: number
    startViewX: number
    startViewY: number
    moved: boolean
  } | null>(null)
  const draggingRef = useRef(dragging)
  draggingRef.current = dragging

  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  // Hover preview (single, transient) — separate from pinned tooltips.
  const [hoverTip, setHoverTip] = useState<{
    note: string
    svgX: number
    svgY: number
    tone: EdgeTone
  } | null>(null)
  const [pinned, setPinned] = useState<PinnedTooltip[]>([])
  const pinnedIdRef = useRef(0)

  const clientToSvg = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const v = viewRef.current
    const px = (clientX - rect.left) / rect.width
    const py = (clientY - rect.top) / rect.height
    return { x: v.x + px * v.w, y: v.y + py * v.h }
  }

  // Project SVG coords to client (screen) coords using the current view. Used
  // every render for pinned + hover tooltips so they track pan/zoom smoothly.
  const svgToClient = (svgX: number, svgY: number): { x: number; y: number } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const v = view
    const px = (svgX - v.x) / v.w
    const py = (svgY - v.y) / v.h
    return { x: rect.left + px * rect.width, y: rect.top + py * rect.height }
  }

  // Fit content to viewport whenever layout or size changes. "Reset view" also
  // calls this so there's one source of truth for the initial framing.
  const fitView = (): void => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const aspect = rect.width / rect.height
    const contentW = bounds.maxX - bounds.minX
    const contentH = bounds.maxY - bounds.minY
    let w = contentW * 1.15
    let h = contentH * 1.15
    if (w / h > aspect) h = w / aspect
    else w = h * aspect
    const cx = (bounds.minX + bounds.maxX) / 2
    const cy = (bounds.minY + bounds.maxY) / 2
    setView({ x: cx - w / 2, y: cy - h / 2, w, h })
  }

  useEffect(() => {
    fitView()
    // Depending on primitive bounds values (not the object) keeps fit-view from
    // firing on every drag tick — bounds is computed from the auto-layout, so
    // these numbers only change when the focus set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const v = viewRef.current
      const rect = svg.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      const ptX = v.x + px * v.w
      const ptY = v.y + py * v.h
      const factor = e.deltaY < 0 ? 0.88 : 1.14
      const newW = Math.max(500, Math.min(v.w * factor, 7000))
      const newH = newW * (v.h / v.w)
      setView({
        x: ptX - px * newW,
        y: ptY - py * newH,
        w: newW,
        h: newH
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent): void => {
      const svg = svgRef.current
      const d = draggingRef.current
      if (!svg || !d) return
      const rect = svg.getBoundingClientRect()
      const v = viewRef.current
      const dx = ((e.clientX - d.startClientX) / rect.width) * v.w
      const dy = ((e.clientY - d.startClientY) / rect.height) * v.h
      // Track whether the user actually moved the cursor; a stationary
      // mousedown shouldn't be treated as a drag (otherwise micro-drags
      // swallow click events we want to fire on mouseup).
      const moved =
        d.moved ||
        Math.abs(e.clientX - d.startClientX) > 2 ||
        Math.abs(e.clientY - d.startClientY) > 2
      if (moved !== d.moved) draggingRef.current = { ...d, moved }
      setView({ ...v, x: d.startViewX - dx, y: d.startViewY - dy })
    }
    const onUp = (): void => setDragging(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  const onSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>): void => {
    const target = e.target as SVGElement
    if (target.closest('[data-node]') || target.closest('[data-edge]')) return
    setDragging({
      startClientX: e.clientX,
      startClientY: e.clientY,
      startViewX: view.x,
      startViewY: view.y,
      moved: false
    })
  }

  const handleNodeClick = (symbol: string): void => {
    if (focusSet.has(symbol)) {
      // Clicking an existing focus promotes IT to primary — useful when
      // the user wants to flip perspective and see the graph through the
      // second focus's eyes.
      if (symbol !== primarySymbol) setPrimarySymbol(symbol)
      return
    }
    // Adding a NEW focus keeps the original primary. Otherwise the focus-
    // to-focus edge tone flips (the user's "original" ticker suddenly
    // renders as the new focus's supplier/customer rather than the other
    // way around), which fights the user's mental model: "I'm looking at
    // X; I added Y to see how Y relates to X."
    setFocusSet((prev) => {
      const next = new Set(prev)
      next.add(symbol)
      return next
    })
  }

  // Keep a ref to the latest click handler so the global mouseup listener
  // (which only reattaches when the drag state toggles) can invoke the current
  // closure rather than a stale one.
  const handleNodeClickRef = useRef(handleNodeClick)
  handleNodeClickRef.current = handleNodeClick

  // Node-drag state. Stored in a ref so mousemove doesn't re-render on every
  // tick just to update the drag descriptor; React state is used only to
  // toggle listener attachment.
  const nodeDragRef = useRef<{
    symbol: string
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const [isNodeDragging, setIsNodeDragging] = useState(false)

  const handleNodeMouseDown = (e: React.MouseEvent, n: LaidOutNode): void => {
    // Don't let this bubble to the SVG's onMouseDown (which would start a pan).
    e.stopPropagation()
    nodeDragRef.current = {
      symbol: n.symbol,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: n.x,
      startY: n.y,
      moved: false
    }
    setIsNodeDragging(true)
  }

  useEffect(() => {
    if (!isNodeDragging) return
    const onMove = (e: MouseEvent): void => {
      const d = nodeDragRef.current
      const svg = svgRef.current
      if (!d || !svg) return
      const rect = svg.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const v = viewRef.current
      const dxSvg = ((e.clientX - d.startClientX) / rect.width) * v.w
      const dySvg = ((e.clientY - d.startClientY) / rect.height) * v.h
      const moved =
        d.moved ||
        Math.abs(e.clientX - d.startClientX) > 2 ||
        Math.abs(e.clientY - d.startClientY) > 2
      if (moved !== d.moved) nodeDragRef.current = { ...d, moved }
      if (moved) {
        setOverrides((prev) => {
          const next = new Map(prev)
          next.set(d.symbol, { x: d.startX + dxSvg, y: d.startY + dySvg })
          return next
        })
      }
    }
    const onUp = (): void => {
      const d = nodeDragRef.current
      // A stationary mousedown is a click, not a drag — fire through to the
      // focus-promotion handler so single-click UX survives the drag wiring.
      if (d && !d.moved) handleNodeClickRef.current(d.symbol)
      nodeDragRef.current = null
      setIsNodeDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isNodeDragging])

  const handleClearAdditions = (): void => {
    setFocusSet(new Set([initialSymbol]))
    setPrimarySymbol(initialSymbol)
    setPinned([])
    setOverrides(new Map())
  }

  const handleEdgeClick = (edge: LaidOutEdge, clientX: number, clientY: number): void => {
    if (!edge.note) return
    const pt = clientToSvg(clientX, clientY)
    if (!pt) return
    setPinned((prev) => [
      ...prev,
      { id: ++pinnedIdRef.current, note: edge.note!, svgX: pt.x, svgY: pt.y, tone: edge.tone }
    ])
  }

  const primaryNode = nodes.find((n) => n.role === 'focus' && n.isPrimary) ?? null
  const primaryTicker = primaryNode ? tickerBySymbol.get(primaryNode.symbol.toUpperCase()) : null
  const addedCount = focusSet.size - 1

  const edgePath = (e: LaidOutEdge): string => {
    // Unified S-curve for every edge shape. Control points sit on the
    // straight segment between from and to, biased to 45% / 55% so the
    // tangents at both ends leave/enter horizontally and the curve
    // swoops through the vertical gap. Works for left→right supplier
    // arrows, focus→customer arrows, and focus→focus arrows regardless
    // of whether fromX < toX or fromX > toX — the bezier naturally
    // produces an S rather than a loop.
    const dx = e.toX - e.fromX
    const c1x = e.fromX + dx * 0.45
    const c2x = e.fromX + dx * 0.55
    return `M ${e.fromX} ${e.fromY} C ${c1x} ${e.fromY}, ${c2x} ${e.toY}, ${e.toX} ${e.toY}`
  }

  // D1 — scale stroke weight by edge confidence. Static JSON edges render at
  // the full (baseline) thickness because they're hand-curated. Overlay edges
  // ride a 0..1 weight from the classifier: 0.6 → 1.52px, 1.0 → 2.0px, so
  // high-confidence auto-edges visually match the hand-curated ones while
  // lower-confidence overlays read as fainter at a glance.
  //
  // Consensus edges (both news + 10-K agree) get a thickness + opacity bump
  // so they stand out from single-source overlays without screaming.
  const edgeStrokeWidth = (e: LaidOutEdge, isHovered: boolean): number => {
    if (isHovered) return 2.8
    if (e.weight === null) return 1.6
    const base = 0.8 + e.weight * 1.2
    const consensus = (e.source ?? '').includes(',')
    return base + (consensus ? 0.4 : 0)
  }
  const edgeStrokeOpacity = (e: LaidOutEdge, isHovered: boolean): number => {
    if (isHovered) return 1
    if (e.weight === null) return 0.7
    const base = 0.4 + e.weight * 0.45
    const consensus = (e.source ?? '').includes(',')
    return Math.min(1, base + (consensus ? 0.1 : 0))
  }

  return (
    <div className="no-drag fixed inset-0 z-50 bg-surface-0 flex flex-col">
      {/* pl-24 keeps the title clear of the macOS traffic-light cluster in
          the hidden-inset title bar (~70px wide at the default size). */}
      <header className="shrink-0 pl-24 pr-6 py-4 flex items-center gap-4 border-b border-edge/40">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-400/90">
          Value chain diagram
        </div>
        {primaryNode && (
          <>
            <span className="text-zinc-700">·</span>
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[15px] font-bold tracking-[0.04em] text-zinc-50 shrink-0">
                {primaryNode.symbol}
              </span>
              <span className="text-[12px] text-zinc-400 truncate">
                {primaryNode.companyName}
              </span>
              <span className="text-[9px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full bg-zinc-800/70 text-zinc-300 shrink-0">
                {primaryNode.stageLabel}
              </span>
              {addedCount > 0 && (
                <span className="text-[9px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 shrink-0">
                  +{addedCount} added
                </span>
              )}
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={fitView}
            className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80 hover:text-zinc-100"
          >
            Reset view
          </button>
          {addedCount > 0 && (
            <button
              onClick={handleClearAdditions}
              className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80 hover:text-zinc-100"
              title={`Clear ${addedCount} added focus${addedCount === 1 ? '' : 'es'}`}
            >
              Clear added
            </button>
          )}
          {overrides.size > 0 && (
            <button
              onClick={() => setOverrides(new Map())}
              className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80 hover:text-zinc-100"
              title={`Reset ${overrides.size} dragged node${overrides.size === 1 ? '' : 's'} to computed positions`}
            >
              Restore layout
            </button>
          )}
          {pinned.length > 0 && (
            <button
              onClick={() => setPinned([])}
              className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80 hover:text-zinc-100"
              title="Dismiss all pinned notes"
            >
              Clear notes
            </button>
          )}
          {primaryTicker && (
            <button
              onClick={() => onOpenTicker(primaryTicker.id)}
              className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25"
            >
              Open detail →
            </button>
          )}
          {primaryTicker && !primaryTicker.isActive && (
            <button
              onClick={() => onActivateTicker(primaryTicker.id)}
              className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25"
            >
              + Watchlist
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"
            title="Close (Esc)"
          >
            Close ✕
          </button>
        </div>
      </header>

      <div className="shrink-0 px-6 py-2 flex items-center gap-5 border-b border-edge/30 text-[10px] uppercase tracking-[0.22em] text-zinc-500">
        <LegendSwatch tone="supplier" />
        <LegendSwatch tone="customer" />
        <span className="ml-auto text-zinc-600 normal-case tracking-normal text-[11px]">
          Click node to add focus · Drag node to reposition · Click arrow to pin note · Drag empty to pan · Scroll to zoom
        </span>
      </div>

      <CompetitorsStrip
        groups={competitorsByFocus}
        quoteBySymbol={quoteBySymbol}
        tickerBySymbol={tickerBySymbol}
        onPick={handleNodeClick}
      />

      <div className="flex-1 relative overflow-hidden">
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          onMouseDown={onSvgMouseDown}
        >
          <defs>
            <marker
              id="arrow-supplier"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={TONE.supplier.stroke} />
            </marker>
            <marker
              id="arrow-customer"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={TONE.customer.stroke} />
            </marker>
          </defs>

          {edges.map((e) => {
            const tone = TONE[e.tone]
            const isHovered = hoveredEdgeId === e.id
            return (
              <g key={e.id} data-edge={e.id}>
                {/* Wide transparent hit path — SVG stroke hit-testing is pixel-
                    accurate, so a 1.5px line is nearly unselectable otherwise.
                    Click pins the note; hover is just a preview. */}
                <path
                  d={edgePath(e)}
                  stroke="transparent"
                  strokeWidth={16}
                  fill="none"
                  style={{ cursor: e.note ? 'pointer' : 'default' }}
                  onMouseEnter={(ev) => {
                    setHoveredEdgeId(e.id)
                    if (e.note) {
                      const pt = clientToSvg(ev.clientX, ev.clientY)
                      if (pt) setHoverTip({ note: e.note, svgX: pt.x, svgY: pt.y, tone: e.tone })
                    }
                  }}
                  onMouseMove={(ev) => {
                    if (e.note && hoveredEdgeId === e.id) {
                      const pt = clientToSvg(ev.clientX, ev.clientY)
                      if (pt) setHoverTip({ note: e.note, svgX: pt.x, svgY: pt.y, tone: e.tone })
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredEdgeId(null)
                    setHoverTip(null)
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    handleEdgeClick(e, ev.clientX, ev.clientY)
                  }}
                />
                <path
                  d={edgePath(e)}
                  stroke={tone.stroke}
                  strokeWidth={edgeStrokeWidth(e, isHovered)}
                  strokeDasharray={tone.dashed ? '7 5' : undefined}
                  strokeOpacity={edgeStrokeOpacity(e, isHovered)}
                  fill="none"
                  markerEnd={e.tone === 'competitor' ? undefined : `url(#arrow-${e.tone})`}
                  pointerEvents="none"
                />
              </g>
            )
          })}

          {nodes.map((n) => (
            <NodeBox
              key={n.symbol}
              n={n}
              dragging={isNodeDragging}
              onMouseDown={(e) => handleNodeMouseDown(e, n)}
            />
          ))}
        </svg>

        {/* Hover preview tooltip — single, transient, replaced as the cursor
            moves across different edges. Tinted by edge tone so you can tell
            at a glance whether you're reading a supplier or customer note. */}
        {hoverTip &&
          (() => {
            const pt = svgToClient(hoverTip.svgX, hoverTip.svgY)
            if (!pt) return null
            const t = TONE[hoverTip.tone]
            return (
              <div
                className="pointer-events-none fixed z-[60] px-3 py-2 rounded-md backdrop-blur text-[11.5px] leading-snug max-w-[300px] shadow-lg"
                style={{
                  left: pt.x + 14,
                  top: pt.y + 14,
                  backgroundColor: t.tipBg,
                  boxShadow: `inset 0 0 0 1px ${t.tipRing}, 0 4px 16px rgba(0,0,0,0.35)`,
                  color: t.tipText
                }}
              >
                {hoverTip.note}
              </div>
            )
          })()}

        {/* Pinned tooltips — stick around until individually dismissed. They
            re-project every render so they stay anchored to the SVG point
            where the user clicked even as the view pans or zooms. Tone-tinted
            to match the arrow they came from. */}
        {pinned.map((p) => {
          const pt = svgToClient(p.svgX, p.svgY)
          if (!pt) return null
          const t = TONE[p.tone]
          return (
            <div
              key={p.id}
              className="fixed z-[61] px-3 py-2 pr-7 rounded-md backdrop-blur text-[11.5px] leading-snug max-w-[300px] shadow-lg"
              style={{
                left: pt.x + 14,
                top: pt.y + 14,
                backgroundColor: t.tipBg,
                boxShadow: `inset 0 0 0 1px ${t.tipRing}, 0 4px 16px rgba(0,0,0,0.35)`,
                color: t.tipText
              }}
            >
              {p.note}
              <button
                onClick={() => setPinned((prev) => prev.filter((x) => x.id !== p.id))}
                className="absolute top-1 right-1.5 text-zinc-400 hover:text-zinc-100 text-[14px] leading-none"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function toLaidOutNode(
  n: ChainNode,
  x: number,
  y: number,
  role: Role,
  isPrimary: boolean,
  stageLabelById: Map<string, string>,
  tickerBySymbol: Map<string, Ticker>,
  quoteBySymbol: Map<string, StockQuote>
): LaidOutNode {
  const sym = n.symbol.toUpperCase()
  return {
    symbol: n.symbol,
    x,
    y,
    stage: n.stage,
    stageLabel: stageLabelById.get(n.stage) ?? n.stage,
    companyName: tickerBySymbol.get(sym)?.companyName ?? n.name ?? n.symbol,
    quote: quoteBySymbol.get(sym),
    hasTickerRow: tickerBySymbol.has(sym),
    role,
    isPrimary
  }
}

// Competitors live outside the SVG canvas now. Grouping them by focus keeps the
// "who competes with whom" mapping explicit even when multiple focuses share a
// rival (e.g. NVDA and AMD both list AVGO). Clicking a chip promotes the rival
// into the focus set so its own suppliers/customers enter the diagram.
function CompetitorsStrip({
  groups,
  quoteBySymbol,
  tickerBySymbol,
  onPick
}: {
  groups: { focusSymbol: string; competitors: ChainNode[] }[]
  quoteBySymbol: Map<string, StockQuote>
  tickerBySymbol: Map<string, Ticker>
  onPick: (symbol: string) => void
}): JSX.Element | null {
  const withAny = groups.filter((g) => g.competitors.length > 0)
  if (withAny.length === 0) return null
  return (
    <div className="shrink-0 px-6 py-2.5 border-b border-edge/30 bg-surface-1/40 max-h-[28vh] overflow-y-auto">
      <div className="flex flex-col gap-1.5">
        {withAny.map((g) => (
          <div key={g.focusSymbol} className="flex items-start gap-3">
            <div className="flex items-center gap-1.5 shrink-0 pt-[3px] w-[120px]">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">
                {g.focusSymbol}
              </span>
              <span className="text-[10px] text-zinc-600">competitors</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.competitors.map((c) => (
                <CompetitorChip
                  key={c.symbol}
                  node={c}
                  quote={quoteBySymbol.get(c.symbol.toUpperCase())}
                  ticker={tickerBySymbol.get(c.symbol.toUpperCase())}
                  onClick={() => onPick(c.symbol)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CompetitorChip({
  node,
  quote,
  ticker,
  onClick
}: {
  node: ChainNode
  quote: StockQuote | undefined
  ticker: Ticker | undefined
  onClick: () => void
}): JSX.Element {
  const rq = quote ? resolveDisplayQuote(quote) : null
  const change = rq?.change ?? 0
  const displayPrice = rq?.price ?? null
  const priceColor =
    change > 0 ? 'text-emerald-400' : change < 0 ? 'text-red-400' : 'text-zinc-400'
  const companyName = ticker?.companyName ?? node.name ?? node.symbol
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Add ${companyName} to focus set`}
      className="group flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2/70 ring-1 ring-inset ring-orange-500/30 hover:bg-surface-2 hover:ring-orange-400/60 transition-colors"
    >
      <span className="text-[10.5px] font-semibold tracking-[0.12em] text-zinc-100">
        {node.symbol}
      </span>
      {rq?.sessionBadge && (
        <span className="text-[8px] font-semibold uppercase tracking-[0.1em] px-1 py-0 rounded bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40">
          {rq.sessionBadge}
        </span>
      )}
      {displayPrice != null && (
        <span className={`tabular-nums text-[10.5px] font-semibold ${priceColor}`}>
          {displayPrice.toFixed(2)}
        </span>
      )}
    </button>
  )
}

function LegendSwatch({ tone }: { tone: EdgeTone }): JSX.Element {
  const t = TONE[tone]
  return (
    <div className="flex items-center gap-1.5">
      <svg width={28} height={8}>
        <line
          x1={2}
          y1={4}
          x2={26}
          y2={4}
          stroke={t.stroke}
          strokeWidth={2}
          strokeDasharray={t.dashed ? '5 3' : undefined}
        />
      </svg>
      <span>{t.label}</span>
    </div>
  )
}

function NodeBox({
  n,
  dragging,
  onMouseDown
}: {
  n: LaidOutNode
  dragging: boolean
  onMouseDown: (e: React.MouseEvent) => void
}): JSX.Element {
  const isFocus = n.role === 'focus'
  const width = NODE_W
  const height = NODE_H
  const x = n.x - width / 2
  const y = n.y - height / 2

  let fill = 'rgb(24, 24, 27)'
  let stroke = 'rgba(82, 82, 91, 0.6)'
  let symbolColor = 'rgb(228, 228, 231)'
  let strokeWidth = 1
  if (isFocus) {
    if (n.isPrimary) {
      fill = 'rgba(16, 185, 129, 0.16)'
      stroke = 'rgb(52, 211, 153)'
      symbolColor = 'rgb(250, 250, 250)'
      strokeWidth = 2
    } else {
      // Secondary focuses: unmistakably a focus, but visually recessive so
      // the primary still reads as the active one.
      fill = 'rgba(16, 185, 129, 0.08)'
      stroke = 'rgba(52, 211, 153, 0.7)'
      symbolColor = 'rgb(209, 250, 229)'
      strokeWidth = 1.5
    }
  } else if (n.role === 'supplier') {
    fill = 'rgba(99, 102, 241, 0.10)'
    stroke = 'rgba(129, 140, 248, 0.55)'
    symbolColor = 'rgb(224, 231, 255)'
  } else if (n.role === 'customer') {
    fill = 'rgba(16, 185, 129, 0.10)'
    stroke = 'rgba(52, 211, 153, 0.55)'
    symbolColor = 'rgb(209, 250, 229)'
  } else if (n.role === 'competitor') {
    fill = 'rgba(249, 115, 22, 0.10)'
    stroke = 'rgba(251, 146, 60, 0.65)'
    symbolColor = 'rgb(254, 215, 170)'
  }

  // Resolve the display quote once so the diagram node's change % and the
  // price cell both track the current trading session (regular / AH / pre).
  const rq = n.quote ? resolveDisplayQuote(n.quote) : null
  const change = rq?.changePct ?? null
  const displayPrice = rq?.price ?? null
  const up = (change ?? 0) > 0
  const down = (change ?? 0) < 0
  const changeColor = up
    ? 'rgb(52, 211, 153)'
    : down
      ? 'rgb(248, 113, 113)'
      : 'rgb(113, 113, 122)'

  // Reserve room for the right-aligned price (~60px at 10px tabular-nums)
  // so long company names can't drift into the dollar figure. Fall back to a
  // wider budget when the row won't render a price at all.
  const hasPrice = n.hasTickerRow && displayPrice != null
  const maxChars = hasPrice ? 18 : 26
  const displayName =
    n.companyName.length > maxChars ? n.companyName.slice(0, maxChars - 1) + '…' : n.companyName

  // Grab while idle, grabbing during an active drag. The click vs. drag
  // distinction is handled by the global mouseup listener — a stationary
  // mousedown still counts as a click (re-prime focus, or add a new focus).
  const cursor = dragging ? 'grabbing' : 'grab'

  return (
    <g
      data-node={n.symbol}
      transform={`translate(${x}, ${y})`}
      onMouseDown={onMouseDown}
      style={{ cursor }}
    >
      <rect
        width={width}
        height={height}
        rx={8}
        ry={8}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <text
        x={11}
        y={20}
        fontSize={13}
        fontWeight={700}
        fill={symbolColor}
        style={{ fontFamily: 'inherit', letterSpacing: '0.04em' }}
      >
        {n.symbol}
      </text>
      {n.hasTickerRow && change !== null && (
        <text
          x={width - 11}
          y={20}
          fontSize={11}
          fontWeight={600}
          fill={changeColor}
          textAnchor="end"
          style={{ fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}
        >
          {change >= 0 ? '+' : ''}
          {change.toFixed(1)}%
        </text>
      )}
      <text
        x={11}
        y={39}
        fontSize={10}
        fill="rgb(161, 161, 170)"
        style={{ fontFamily: 'inherit' }}
      >
        {displayName}
      </text>
      {hasPrice && (
        <text
          x={width - 11}
          y={39}
          fontSize={10}
          fill="rgb(161, 161, 170)"
          textAnchor="end"
          style={{ fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}
        >
          ${displayPrice!.toFixed(2)}
        </text>
      )}
    </g>
  )
}
