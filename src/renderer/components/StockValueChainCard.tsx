import { useMemo, type MouseEvent as ReactMouseEvent } from 'react'
import type {
  CompanyValueChainEdgeCitation,
  CompanyValueChainEdgeSource,
  Ticker
} from '../../preload'
import graph from '../../data/supplyChainGraph.json'
import { CollapsibleSection } from './CollapsibleSection'

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
  // Name of the counterparty's top-level GICS sector when it differs from
  // the focus ticker's top-level sector. Rendered as a small pill next to
  // the company name to badge cross-sector relationships (e.g. Capital One
  // → AWS shows "Technology" on the AWS row when viewed from a financials
  // focus).
  crossSectorLabel?: string | null
  // Provenance for the note, populated by generated chains only. Curated
  // or legacy edges leave this null and no badge renders. 'filings' / 'news'
  // / 'profile' are real groundings; 'model' means the LLM claimed the
  // relationship from training knowledge without any supplied context.
  source?: CompanyValueChainEdgeSource | null
  // Multi-citation array — each entry is one document supporting this
  // edge. Renderer stacks them as multiple clickable pills. When empty
  // or absent, falls back to the legacy single `citation` field on
  // chains generated before multi-cite shipped.
  citations?: CompanyValueChainEdgeCitation[]
  // DEPRECATED: legacy single-citation. Read paths normalize this into
  // citations: [...] before passing to the renderer; kept here only for
  // any caller still building Counterparty manually with the old shape.
  citation?: CompanyValueChainEdgeCitation | null
  // True when this counterparty is a Claude-named entity that didn't
  // resolve to a real public ticker (private companies, brand labels
  // like ROVI_LABEL, unverified placeholders). Renders as a muted, non-
  // clickable chip so the relationship is visible without implying we
  // can deep-link into it.
  unverified?: boolean
}

// Short label + styling per provenance kind. Tooltip spells out the
// full explanation so the condensed pill stays compact. Kept near the
// Counterparty definition so new provenance values can't drift.
export const SOURCE_BADGE: Record<
  CompanyValueChainEdgeSource,
  { label: string; className: string; title: string }
> = {
  filings: {
    label: '10-K',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    title: 'Cited in the company’s 10-K filing excerpt'
  },
  news: {
    label: 'News',
    className: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
    title: 'Cited in a recent news article fed into the generator'
  },
  profile: {
    label: 'Profile',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    title: 'Cited in the company profile description'
  },
  analyst: {
    label: 'Analyst',
    className: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200',
    title: 'Cited in an analyst rating action'
  },
  model: {
    label: 'Model',
    className: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
    title:
      'From the model’s training knowledge — not grounded in any supplied filing or article'
  }
}

// Format an article's date as YYYY-MM-DD for the citation tooltip. Returns
// empty string when no date is available so the title string degrades
// gracefully ("Article: ..." with no date suffix).
function formatCiteDate(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

// SourceBadge: renders the provenance pill next to an edge note. When a
// citation + onOpen handler are both present, the pill becomes a clickable
// link to the actual document. Falls back to a static pill (matching the
// legacy non-cited UX) for: edges without citations, edges with citations
// but kinds that have no URL ('profile'/'model'), or callers that didn't
// wire a handler.
function SourceBadge({
  source,
  citation,
  onOpen
}: {
  source?: CompanyValueChainEdgeSource | null
  citation?: CompanyValueChainEdgeCitation | null
  onOpen?: (url: string, title: string, subtitle?: string | null) => void
}): JSX.Element | null {
  // Derive the source CATEGORY from the citation kind when we have a
  // citation — that's truer than the edge's overall `source` field which
  // is just the model's "dominant" pick. Multi-cite means each pill can
  // be a different category (e.g., 10-K + Bloomberg = filings + news,
  // each with its own color).
  const derivedSource: CompanyValueChainEdgeSource | null = citation
    ? citation.kind === 'filing'
      ? 'filings'
      : citation.kind === 'article'
        ? 'news'
        : citation.kind === 'analyst'
          ? 'analyst'
          : citation.kind === 'profile'
            ? 'profile'
            : 'model'
    : (source ?? null)
  if (!derivedSource) return null
  const meta = SOURCE_BADGE[derivedSource]
  if (!meta) return null

  let label = meta.label
  let title = meta.title
  let openArgs: { url: string; title: string; subtitle: string | null } | null = null

  if (citation?.kind === 'filing') {
    const dateStr = formatCiteDate(citation.filedAt)
    // Show form type + date on the pill so the user can see WHEN the
    // filing was made without hovering. Full label always rendered;
    // pill wraps to multiple lines if needed.
    label = dateStr ? `${citation.formType} · ${dateStr}` : citation.formType
    title = `${citation.formType} filed ${dateStr} · ${citation.accession} — click to open SEC filing`
    openArgs = {
      url: citation.url,
      title: `${citation.formType} (${dateStr})`,
      subtitle: citation.accession
    }
  } else if (citation?.kind === 'article' && citation.url) {
    const dateStr = formatCiteDate(citation.publishedAt)
    const sourceStr = citation.feedTitle ?? 'News'
    // Full source + date — no truncation, the pill wraps onto multiple
    // lines for long publisher names.
    label = dateStr ? `${sourceStr} · ${dateStr}` : sourceStr
    title = `${citation.title}${dateStr ? ` (${dateStr})` : ''} — click to open`
    openArgs = {
      url: citation.url,
      title: citation.title,
      subtitle: dateStr
        ? `${citation.feedTitle ?? 'Article'} · ${dateStr}`
        : (citation.feedTitle ?? null)
    }
  } else if (citation?.kind === 'analyst') {
    // Analyst rating event citation. URL is Yahoo's per-symbol analyst
    // page (concrete public link; per-rating-report URLs are paywalled).
    const dateStr = citation.date ? ` · ${citation.date}` : ''
    label = `${citation.firm}${dateStr}`
    title = `${citation.firm} analyst action${dateStr} — click to open Yahoo Finance analyst page`
    openArgs = {
      url: citation.url,
      title: `${citation.firm} — analyst coverage`,
      subtitle: citation.date || null
    }
  } else if (citation?.kind === 'model' && citation.attribution) {
    // Model-grounded edge with a free-text training attribution that
    // wasn't pattern-resolvable to a real link. In STRICT mode these
    // get dropped before reaching the renderer; this branch only fires
    // for legacy chains generated before strict mode shipped.
    label = citation.attribution
    title = `${citation.attribution} — from the model's training knowledge (no live link)`
  }

  // Multi-line-friendly pill. `whitespace-normal break-words` lets long
  // labels wrap onto multiple lines inside the rounded shape rather than
  // ellipsizing or busting the column width. Padding bumped slightly so
  // wrapped lines don't look cramped.
  const baseClasses = `inline-flex items-start gap-1 px-2 py-[3px] rounded-md border text-[10.5px] font-semibold uppercase tracking-[0.12em] max-w-full whitespace-normal break-words leading-[1.35] ${meta.className}`

  if (openArgs && onOpen) {
    const args = openArgs
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onOpen(args.url, args.title, args.subtitle)
        }}
        className={`${baseClasses} cursor-pointer hover:brightness-125 hover:underline underline-offset-2 text-left`}
        title={title}
      >
        <span className="flex-1 min-w-0">{label}</span>
        {/* Link arrow makes the click affordance obvious — without it the
            pill looks like a static badge. shrink-0 + slightly indented
            from the top so it aligns with the first line of a wrapped
            label, not the visual center. */}
        <span aria-hidden="true" className="shrink-0 text-[9px] opacity-80 mt-[1px]">
          ↗
        </span>
      </button>
    )
  }
  return (
    <span className={baseClasses} title={title}>
      <span className="flex-1 min-w-0">{label}</span>
    </span>
  )
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

  const linkCount = customers.length + suppliers.length + competitors.length
  const meta = (
    <span className="flex items-center gap-2">
      <span className="px-2 py-0.5 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80 normal-case tracking-[0.22em]">
        {stageLabel}
      </span>
      <span className="tabular-nums text-zinc-500">{linkCount} links</span>
    </span>
  )

  return (
    <CollapsibleSection
      title="Value chain"
      meta={meta}
      defaultOpen
      gradient
      // Role-based backlight covers the ENTIRE section (header + body),
      // not just the collapsed content area — passing it as backdropStyle
      // lets CollapsibleSection position it absolutely at section level.
      // Without this the gradient/glow stopped at the collapsible's
      // content container and the header sat on plain surface-1.
      backdropStyle={{ backgroundImage: glowBackground, boxShadow }}
    >
      {node.blurb && (
        <p className="text-[12.5px] leading-snug text-zinc-300 mb-5 max-w-[720px]">
          {node.blurb}
        </p>
      )}
      <div className={`grid grid-cols-1 gap-6 items-start ${gridColsClass}`}>
        <TransactionCluster category="supplier" items={suppliers} />
        <TransactionCluster category="competitor" items={competitors} />
        <TransactionCluster category="customer" items={customers} />
      </div>
    </CollapsibleSection>
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
    // Order: curated supplyChainGraph stages first (stable ordering for
    // tech-focused views) + any novel stages found in `items` appended at
    // the end. Without appending, counterparties with stages from generated
    // chains (e.g. "refining" for XOM) would be silently dropped — their
    // stage ids aren't in the curated tech pipeline, so the filter would
    // reject them even though the cluster header's count showed them.
    const curatedIds = CHAIN.stages.map((s) => s.id)
    const curatedSet = new Set(curatedIds)
    const sortSym = (xs: Counterparty[]): Counterparty[] =>
      [...xs].sort((a, b) => a.symbol.localeCompare(b.symbol))
    // Items already carry their stageLabel (populated by the caller's
    // buildCounterparty / toCounterparty helpers, which consult a
    // stageLabelById map that includes both CHAIN.stages and any
    // activeStages in scope). Fall back to curated label or humanized id.
    const labelFor = (id: string): string => {
      const first = byStage.get(id)?.[0]
      if (first?.stageLabel && first.stageLabel !== '—') return first.stageLabel
      return CHAIN.stages.find((s) => s.id === id)?.label ?? id
    }
    const out: Array<{ stage: string; label: string; items: Counterparty[] }> = []
    for (const id of curatedIds) {
      if (!byStage.has(id)) continue
      out.push({ stage: id, label: labelFor(id), items: sortSym(byStage.get(id)!) })
    }
    for (const [id, bucket] of byStage) {
      if (curatedSet.has(id)) continue
      out.push({ stage: id, label: labelFor(id), items: sortSym(bucket) })
    }
    return out
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
  onLeave,
  onContextMenu,
  correctedSymbols,
  onOpenCitation
}: {
  category: Category
  items: Counterparty[]
  onPick?: (symbol: string) => void
  onHover?: (symbol: string) => void
  onLeave?: () => void
  // Right-click handler for the symbol chip. When provided, chips become
  // right-clickable to open the chain-correction menu. Coordinates are
  // viewport-relative (clientX/Y) so the caller can position a menu.
  onContextMenu?: (symbol: string, x: number, y: number) => void
  // Set of symbols (uppercase) the user has corrected. Chips in this set
  // get a small "user-corrected" badge so the user can see at a glance
  // which entries are theirs vs Claude's original.
  correctedSymbols?: Set<string>
  // Click handler for the source-citation pill. When provided, edges with
  // resolvable citations (filings or news articles with URLs) become
  // clickable — the badge calls this with the URL so the consuming screen
  // can route through its existing external-reader pattern.
  onOpenCitation?: (url: string, title: string, subtitle?: string | null) => void
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
                // Unverified chips: dashed border + lower opacity + no
                // hover handlers so the user reads "present in Claude's
                // chain but not a live ticker row." The symbol string is
                // usually Claude's placeholder label (ROVI_LABEL, VENDING)
                // which we truncate since it can be long.
                const unverifiedChipClasses = `inline-flex items-center justify-center shrink-0 px-2 py-[3px] rounded-md border border-dashed text-[10px] font-semibold tabular-nums tracking-[0.04em] min-w-[58px] max-w-[120px] truncate border-zinc-600 bg-zinc-800/40 text-zinc-400 opacity-80`
                const isUnverified = Boolean(item.unverified)
                const nameTone = isUnverified ? 'text-zinc-400 italic' : 'text-zinc-200'
                const isCorrected = Boolean(
                  correctedSymbols && correctedSymbols.has(item.symbol.toUpperCase())
                )
                const handleContextMenu = onContextMenu
                  ? (e: ReactMouseEvent<HTMLElement>): void => {
                      e.preventDefault()
                      e.stopPropagation()
                      onContextMenu(item.symbol, e.clientX, e.clientY)
                    }
                  : undefined
                return (
                  <li key={item.symbol} className="flex items-start gap-2.5">
                    {isUnverified ? (
                      <span
                        className={unverifiedChipClasses}
                        title="Unverified — no public ticker"
                        onContextMenu={handleContextMenu}
                      >
                        {item.symbol}
                      </span>
                    ) : interactive ? (
                      <button
                        type="button"
                        onClick={() => onPick?.(item.symbol)}
                        onMouseEnter={() => onHover?.(item.symbol)}
                        onMouseLeave={() => onLeave?.()}
                        onContextMenu={handleContextMenu}
                        className={`${chipClasses} ${tone.chipHoverBg} transition-colors ${
                          isCorrected ? 'ring-2 ring-amber-400/50' : ''
                        }`}
                        title={
                          isCorrected
                            ? 'You corrected this entry — right-click to manage'
                            : onContextMenu
                              ? 'Right-click to correct this entry'
                              : undefined
                        }
                      >
                        {item.symbol}
                      </button>
                    ) : (
                      <span className={chipClasses} onContextMenu={handleContextMenu}>
                        {item.symbol}
                      </span>
                    )}
                    <div className="min-w-0 flex-1 pt-[1px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className={`text-[12px] leading-snug truncate ${nameTone}`}>
                          {item.companyName}
                        </div>
                        {item.crossSectorLabel && (
                          <span
                            className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-200 text-[9px] font-semibold uppercase tracking-[0.18em]"
                            title={`Cross-sector: ${item.crossSectorLabel}`}
                          >
                            <span className="text-[8px]">↗</span>
                            {item.crossSectorLabel}
                          </span>
                        )}
                      </div>
                      {item.note && (
                        <div className="text-[11px] leading-snug text-zinc-400 mt-0.5">
                          {item.note}
                        </div>
                      )}
                      {/* Citation pills — multi-citation when the model
                          cited more than one document. Stacked vertically
                          so each is independently scannable + clickable.
                          Falls back to the single legacy `citation` field
                          for chains generated before multi-cite shipped. */}
                      {(() => {
                        const cites: CompanyValueChainEdgeCitation[] =
                          item.citations && item.citations.length > 0
                            ? item.citations
                            : item.citation
                              ? [item.citation]
                              : []
                        if (cites.length === 0) return null
                        return (
                          <div className="mt-1 flex flex-col gap-1">
                            {cites.map((c, i) => (
                              <SourceBadge
                                key={i}
                                source={item.source}
                                citation={c}
                                onOpen={onOpenCitation}
                              />
                            ))}
                          </div>
                        )
                      })()}
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
