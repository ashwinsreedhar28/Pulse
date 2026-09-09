// Rankings over the market graph.
//
// The graph shows you shape; this answers "who matters and why". Everything
// here is computed in one pass over the edge rows in marketGraphService and
// fetched on its own IPC channel, because betweenness is O(V·E) and has no
// business riding along with every graph refresh.
//
// Provenance is shown on every row rather than tucked into a footnote. These
// edges are overwhelmingly LLM-generated from a single source class, so a
// "most connected" ranking is a ranking of one model's opinions until proven
// otherwise. Presenting it as a measurement without saying so would be the
// most misleading thing this screen could do.

import { useCallback, useEffect, useState } from 'react'
import type { MarketGraphStats, MarketRankEntry } from '../../preload'

interface Props {
  onSelectSymbol?: (symbol: string, name?: string | null) => void
}

const CARD = 'rounded-lg border border-edge/60 bg-surface-1/70 p-3'

function pct(n: number, d: number): string {
  if (d === 0) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

function RankCard({
  title,
  hint,
  rows,
  format,
  onSelectSymbol
}: {
  title: string
  hint: string
  rows: MarketRankEntry[]
  format?: (v: number) => string
  onSelectSymbol?: (symbol: string, name?: string | null) => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? rows : rows.slice(0, 8)
  return (
    <div className={CARD}>
      <div className="mb-1">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
          {title}
        </h4>
        <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <div className="py-3 text-[11px] text-zinc-600">No data yet.</div>
      ) : (
        <ol className="space-y-0.5">
          {shown.map((r, i) => (
            <li key={r.symbol}>
              <button
                onClick={() => onSelectSymbol?.(r.symbol, r.name)}
                className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-2"
                title={r.name ?? r.symbol}
              >
                <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-zinc-600">
                  {i + 1}
                </span>
                <span className="w-14 shrink-0 text-[11px] font-semibold text-zinc-100">
                  {r.symbol}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-500">
                  {r.name ?? r.sectorName ?? ''}
                </span>
                {/* Citation coverage for this symbol's edges. Amber when most
                    of its links rest on nothing but the model. */}
                <span
                  className={
                    'shrink-0 text-[9px] tabular-nums ' +
                    (r.total > 0 && r.cited / r.total >= 0.5
                      ? 'text-emerald-400/70'
                      : 'text-amber-400/70')
                  }
                  title={`${r.cited} of ${r.total} edges carry a filing or article citation`}
                >
                  {pct(r.cited, r.total)}
                </span>
                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-zinc-300">
                  {format ? format(r.value) : r.value}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {rows.length > 8 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          {expanded ? 'show less' : `show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}

export default function MarketAnalytics({ onSelectSymbol }: Props): JSX.Element {
  const [stats, setStats] = useState<MarketGraphStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    window.api.graph
      .getMarketStats()
      .then((s) => {
        setStats(s)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !stats) {
    return <div className="p-8 text-sm text-zinc-400">Computing graph statistics…</div>
  }
  if (error) {
    return <div className="p-8 text-sm text-red-400">Could not compute statistics: {error}</div>
  }
  if (!stats) return <div className="p-8 text-sm text-zinc-400">No graph data.</div>

  const { totals, provenance, ranks, sectorFlows } = stats

  return (
    <div className="space-y-4 overflow-y-auto p-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="text-[13px] font-semibold text-zinc-100">Graph analytics</h3>
        <span className="text-[11px] text-zinc-500">
          {totals.connected.toLocaleString()} connected of {totals.nodes.toLocaleString()} symbols ·{' '}
          {totals.edges.toLocaleString()} links ({totals.supplier} supplier ·{' '}
          {totals.competitor} competitor · {totals.partner} partner)
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 ring-1 ring-inset ring-zinc-700 hover:bg-surface-2 hover:text-zinc-100 disabled:opacity-50"
        >
          {loading ? 'Computing…' : 'Recompute'}
        </button>
      </header>

      {/* Provenance banner. This is the single most important caveat on the
          page and it goes at the top, not the bottom. */}
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-snug text-amber-200/80">
        <strong className="font-semibold">How much of this is evidence.</strong>{' '}
        {pct(provenance.cited, provenance.total)} of links ({provenance.cited.toLocaleString()} of{' '}
        {provenance.total.toLocaleString()}) cite a filing or article. Only{' '}
        {provenance.corroborated.toLocaleString()} come from more than one independent source
        class — the rest are a single model&apos;s judgement, so treat these rankings as a
        well-informed prior rather than a measurement.
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <RankCard
          title="Most connected"
          hint="Total links of any kind. The broadest measure of presence in the graph."
          rows={ranks.degree}
          onSelectSymbol={onSelectSymbol}
        />
        <RankCard
          title="Supplies the most"
          hint="Outgoing supplier links — upstream chokepoints. Foundries and EDA vendors should dominate."
          rows={ranks.suppliesTo}
          onSelectSymbol={onSelectSymbol}
        />
        <RankCard
          title="Depends on the most"
          hint="Incoming supplier links — downstream exposure to a broad supplier base."
          rows={ranks.dependsOn}
          onSelectSymbol={onSelectSymbol}
        />
        <RankCard
          title="Most brokered (betweenness)"
          hint="Sits on the most shortest paths. Finds connectors that raw link count misses entirely."
          rows={ranks.betweenness}
          onSelectSymbol={onSelectSymbol}
        />
        <RankCard
          title="Most cross-sector"
          hint="Number of distinct sectors a company links into, excluding its own."
          rows={ranks.bridges}
          onSelectSymbol={onSelectSymbol}
        />
        <RankCard
          title="Most influential (PageRank)"
          hint="Connected to well-connected companies, not merely to many."
          rows={ranks.pagerank}
          format={(v) => (v * 1000).toFixed(1)}
          onSelectSymbol={onSelectSymbol}
        />
        <RankCard
          title="Most competitors"
          hint="Companies named as rivals most often."
          rows={ranks.competitors}
          onSelectSymbol={onSelectSymbol}
        />
        <RankCard
          title="Most partners"
          hint="Named partnership and alliance links."
          rows={ranks.partners}
          onSelectSymbol={onSelectSymbol}
        />

        <div className={CARD}>
          <div className="mb-1">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
              Strongest sector flows
            </h4>
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
              Links spanning two top-level sectors — where the economy actually couples.
            </p>
          </div>
          {sectorFlows.length === 0 ? (
            <div className="py-3 text-[11px] text-zinc-600">No cross-sector links yet.</div>
          ) : (
            <ol className="space-y-0.5">
              {sectorFlows.slice(0, 10).map((f) => (
                <li
                  key={`${f.a}>${f.b}`}
                  className="flex items-baseline gap-2 px-1 py-0.5 text-[10px]"
                >
                  <span className="min-w-0 flex-1 truncate text-zinc-400">
                    {f.a} <span className="text-zinc-600">↔</span> {f.b}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-300">{f.count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
