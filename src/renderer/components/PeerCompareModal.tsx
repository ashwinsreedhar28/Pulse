// Side-by-side comparison of a focus ticker against its competitors. Pulls
// every metric that the value-chain grid/focus-panel already knows how to
// render — quote delta, TTM revenue, rev YoY, FCF margin, FCF 8Q sparkline,
// EPS beat/miss — into a single table so picking a winner reads at a glance.
//
// Competitors come from the `competitors[]` pairs in supplyChainGraph.json
// (surfaced via the `peers` prop). When Yahoo has no data for a graph node
// (private competitors, tombstoned 404s) we still render the row with em-dashes
// — the shape of the ecosystem matters even when a peer's financials are
// missing.
//
// Escape or backdrop-click closes. The modal is a narrow centered sheet
// rather than full-screen, so the user still sees the grid behind it.

import { useEffect, useMemo, useState } from 'react'

import type {
  AnalystEstimates,
  EarningsBadge,
  FinancialsSnapshot,
  StockQuote,
  Ticker
} from '../../preload'
import { EarningsBeatMiss } from './EarningsBeatMiss'
import { FcfSparkline } from './FcfSparkline'
import {
  fcfMarginTone,
  formatEpsDelta,
  formatMoneyCompact,
  formatPctDelta,
  formatPctValue
} from './financialsFormat'
import { resolveDisplayQuote } from './quoteDisplay'

type SortKey =
  | 'symbol'
  | 'changePct'
  | 'revenueTTM'
  | 'revYoY'
  | 'fcfMargin'
  | 'recentDelta'
  | 'ptUpside'

interface Row {
  symbol: string
  companyName: string
  isFocus: boolean
  ticker: Ticker | undefined
  quote: StockQuote | undefined
  financials: FinancialsSnapshot | undefined
  earnings: EarningsBadge | undefined
  estimates: AnalystEstimates | undefined
}

function rowSortValue(row: Row, key: SortKey): number | null {
  switch (key) {
    case 'symbol':
      // Symbols sort alphabetically; returning char codes works fine but the
      // caller falls back to string comparison when the key is 'symbol'.
      return null
    case 'changePct':
      return row.quote ? resolveDisplayQuote(row.quote).changePct : null
    case 'revenueTTM':
      return row.financials?.ttm.revenue ?? null
    case 'revYoY':
      return row.financials?.yoy.revenue ?? null
    case 'fcfMargin':
      return row.financials?.ttm.fcfMargin ?? null
    case 'recentDelta': {
      const q = row.earnings?.history[0]
      if (!q || q.epsActual === null || q.epsEstimate === null) return null
      return q.epsActual - q.epsEstimate
    }
    case 'ptUpside': {
      const price = row.quote ? resolveDisplayQuote(row.quote).price : null
      const target = row.estimates?.targetMean ?? null
      if (price === null || target === null || price <= 0) return null
      return (target - price) / price
    }
  }
}

export function PeerCompareModal({
  focusSymbol,
  peers,
  tickerBySymbol,
  quoteBySymbol,
  financialsBySymbol,
  earningsBySymbol,
  estimatesBySymbol,
  onClose,
  onOpenTicker,
  onActivateTicker
}: {
  focusSymbol: string
  peers: string[]
  tickerBySymbol: Map<string, Ticker>
  quoteBySymbol: Map<string, StockQuote>
  financialsBySymbol: Map<string, FinancialsSnapshot>
  earningsBySymbol: Map<string, EarningsBadge>
  estimatesBySymbol: Map<string, AnalystEstimates>
  onClose: () => void
  onOpenTicker: (tickerId: number) => void
  onActivateTicker: (tickerId: number) => void
}): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('revenueTTM')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rows = useMemo<Row[]>(() => {
    const build = (symbol: string, isFocus: boolean): Row => {
      const sym = symbol.toUpperCase()
      const ticker = tickerBySymbol.get(sym)
      return {
        symbol: sym,
        companyName: ticker?.companyName ?? sym,
        isFocus,
        ticker,
        quote: quoteBySymbol.get(sym),
        financials: financialsBySymbol.get(sym),
        earnings: earningsBySymbol.get(sym),
        estimates: estimatesBySymbol.get(sym)
      }
    }
    const all: Row[] = [build(focusSymbol, true), ...peers.map((p) => build(p, false))]
    return all
  }, [
    focusSymbol,
    peers,
    tickerBySymbol,
    quoteBySymbol,
    financialsBySymbol,
    earningsBySymbol,
    estimatesBySymbol
  ])

  const sortedRows = useMemo<Row[]>(() => {
    // Focus ticker always pins to the top regardless of sort — the point of
    // the modal is "vs competitors", not "rank all participants".
    const focus = rows.filter((r) => r.isFocus)
    const peers = rows.filter((r) => !r.isFocus)
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'symbol') {
      peers.sort((a, b) => a.symbol.localeCompare(b.symbol) * dir)
    } else {
      peers.sort((a, b) => {
        const av = rowSortValue(a, sortKey)
        const bv = rowSortValue(b, sortKey)
        // Null-last regardless of direction — a missing metric shouldn't rank
        // above a real one just because asc/desc swapped.
        if (av === null && bv === null) return 0
        if (av === null) return 1
        if (bv === null) return -1
        return (av - bv) * dir
      })
    }
    return [...focus, ...peers]
  }, [rows, sortKey, sortDir])

  const toggleSort = (key: SortKey): void => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'symbol' ? 'asc' : 'desc')
    }
  }

  return (
    <div
      className="no-drag fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-surface-0 rounded-xl border border-edge shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 px-6 py-4 flex items-center gap-4 border-b border-edge/40">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-400/90">
            Peer compare
          </div>
          <span className="text-zinc-700">·</span>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[15px] font-bold tracking-[0.04em] text-zinc-50 shrink-0">
              {focusSymbol}
            </span>
            <span className="text-[12px] text-zinc-400 truncate">
              vs {peers.length} peer{peers.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"
            title="Close (Esc)"
          >
            Close ✕
          </button>
        </header>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[11.5px] tabular-nums">
            <thead className="sticky top-0 bg-surface-0 z-10">
              <tr className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 border-b border-edge/40">
                <HeaderCell
                  label="Ticker"
                  sortKey="symbol"
                  currentKey={sortKey}
                  dir={sortDir}
                  onClick={() => toggleSort('symbol')}
                  align="left"
                />
                <HeaderCell
                  label="1D Δ"
                  sortKey="changePct"
                  currentKey={sortKey}
                  dir={sortDir}
                  onClick={() => toggleSort('changePct')}
                />
                <HeaderCell
                  label="Revenue TTM"
                  sortKey="revenueTTM"
                  currentKey={sortKey}
                  dir={sortDir}
                  onClick={() => toggleSort('revenueTTM')}
                />
                <HeaderCell
                  label="Rev YoY"
                  sortKey="revYoY"
                  currentKey={sortKey}
                  dir={sortDir}
                  onClick={() => toggleSort('revYoY')}
                />
                <HeaderCell
                  label="FCF margin"
                  sortKey="fcfMargin"
                  currentKey={sortKey}
                  dir={sortDir}
                  onClick={() => toggleSort('fcfMargin')}
                />
                <th className="text-right font-semibold py-3 px-3">FCF 8Q</th>
                <HeaderCell
                  label="Last EPS Δ"
                  sortKey="recentDelta"
                  currentKey={sortKey}
                  dir={sortDir}
                  onClick={() => toggleSort('recentDelta')}
                />
                <th className="text-right font-semibold py-3 px-3">EPS Δ 4Q</th>
                <HeaderCell
                  label="PT upside"
                  sortKey="ptUpside"
                  currentKey={sortKey}
                  dir={sortDir}
                  onClick={() => toggleSort('ptUpside')}
                />
                <th className="py-3 px-3" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <PeerRow
                  key={row.symbol}
                  row={row}
                  onOpenTicker={onOpenTicker}
                  onActivateTicker={onActivateTicker}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function HeaderCell({
  label,
  sortKey,
  currentKey,
  dir,
  onClick,
  align = 'right'
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  dir: 'asc' | 'desc'
  onClick: () => void
  align?: 'left' | 'right'
}): JSX.Element {
  const active = sortKey === currentKey
  const arrow = active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''
  return (
    <th
      className={`font-semibold py-3 px-3 cursor-pointer select-none hover:text-zinc-300 ${
        align === 'left' ? 'text-left' : 'text-right'
      } ${active ? 'text-emerald-300' : ''}`}
      onClick={onClick}
    >
      {label}
      {arrow}
    </th>
  )
}

function PeerRow({
  row,
  onOpenTicker,
  onActivateTicker
}: {
  row: Row
  onOpenTicker: (tickerId: number) => void
  onActivateTicker: (tickerId: number) => void
}): JSX.Element {
  const fin = row.financials
  // Resolve to the live session's price so both the 1D Δ column and the PT
  // upside math below reflect after-hours moves, not yesterday's 4pm close.
  const rq = row.quote ? resolveDisplayQuote(row.quote) : null
  const changePct = rq?.changePct ?? null
  const change = rq?.change ?? 0
  const changeColor =
    change > 0 ? 'text-emerald-400' : change < 0 ? 'text-red-400' : 'text-zinc-500'
  const revenue = formatMoneyCompact(fin?.ttm.revenue ?? null)
  const revYoY = formatPctDelta(fin?.yoy.revenue ?? null)
  const revYoYColor =
    fin?.yoy.revenue === null || fin?.yoy.revenue === undefined
      ? 'text-zinc-500'
      : fin.yoy.revenue > 0
        ? 'text-emerald-300'
        : fin.yoy.revenue < 0
          ? 'text-red-300'
          : 'text-zinc-300'
  const marginTone = fcfMarginTone(fin?.ttm.fcfMargin ?? null)
  const marginPct = formatPctValue(fin?.ttm.fcfMargin ?? null)
  const recentQuarter = row.earnings?.history[0]
  const recentDeltaLabel = formatEpsDelta(
    recentQuarter?.epsActual ?? null,
    recentQuarter?.epsEstimate ?? null
  )
  const recentDeltaValue =
    recentQuarter && recentQuarter.epsActual !== null && recentQuarter.epsEstimate !== null
      ? recentQuarter.epsActual - recentQuarter.epsEstimate
      : null
  const recentDeltaColor =
    recentDeltaValue === null
      ? 'text-zinc-500'
      : recentDeltaValue > 0
        ? 'text-emerald-300'
        : recentDeltaValue < 0
          ? 'text-red-300'
          : 'text-zinc-300'

  const price = rq?.price ?? null
  const targetMean = row.estimates?.targetMean ?? null
  const ptUpside =
    price !== null && targetMean !== null && price > 0 ? (targetMean - price) / price : null
  const ptUpsideColor =
    ptUpside === null
      ? 'text-zinc-500'
      : ptUpside > 0
        ? 'text-emerald-300'
        : ptUpside < 0
          ? 'text-red-300'
          : 'text-zinc-300'
  const ptUpsideLabel =
    ptUpside !== null ? `${ptUpside >= 0 ? '+' : ''}${(ptUpside * 100).toFixed(1)}%` : null

  const rowBg = row.isFocus
    ? 'bg-emerald-500/[0.06] hover:bg-emerald-500/[0.10]'
    : 'hover:bg-surface-1'
  const border = row.isFocus ? 'border-b border-emerald-500/20' : 'border-b border-edge/20'

  return (
    <tr className={`${rowBg} ${border}`}>
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          <span
            className={`text-[12.5px] font-bold tracking-[0.04em] ${
              row.isFocus ? 'text-emerald-200' : row.ticker?.isActive ? 'text-zinc-50' : 'text-zinc-200'
            }`}
          >
            {row.symbol}
          </span>
          {row.isFocus && (
            <span className="text-[9px] uppercase tracking-[0.22em] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/40">
              Focus
            </span>
          )}
          {!row.isFocus && row.ticker?.isActive && (
            <span className="text-[9px] uppercase tracking-[0.22em] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/30">
              Held
            </span>
          )}
        </div>
        <div className="text-[10px] text-zinc-500 truncate max-w-[260px] mt-0.5">
          {row.companyName}
        </div>
      </td>
      <td className={`py-3 px-3 text-right ${changeColor}`}>
        {changePct !== null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
      </td>
      <td className="py-3 px-3 text-right text-zinc-200">{revenue ?? '—'}</td>
      <td className={`py-3 px-3 text-right ${revYoYColor}`}>{revYoY ?? '—'}</td>
      <td className={`py-3 px-3 text-right ${marginTone.color}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-1 w-1 rounded-full ${marginTone.dot}`} />
          {marginPct ?? '—'}
        </span>
      </td>
      <td className="py-3 px-3">
        <div className="flex justify-end">
          <FcfSparkline financials={fin} variant="strip" />
        </div>
      </td>
      <td
        className={`py-3 px-3 text-right ${recentDeltaColor}`}
        title={
          recentQuarter
            ? `EPS actual ${recentQuarter.epsActual?.toFixed(2) ?? '—'} vs est ${recentQuarter.epsEstimate?.toFixed(2) ?? '—'}`
            : undefined
        }
      >
        {recentDeltaLabel ?? '—'}
      </td>
      <td className="py-3 px-3">
        <div className="flex justify-end">
          <EarningsBeatMiss history={row.earnings?.history} variant="tile" />
        </div>
      </td>
      <td
        className={`py-3 px-3 text-right ${ptUpsideColor}`}
        title={
          row.estimates
            ? `Price target $${targetMean?.toFixed(2) ?? '—'} · ${row.estimates.analystCount ?? 0} analysts`
            : undefined
        }
      >
        {ptUpsideLabel ?? '—'}
      </td>
      <td className="py-3 px-3">
        {row.ticker ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => onOpenTicker(row.ticker!.id)}
              className="text-[9px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25"
              title="Open ticker detail"
            >
              Open
            </button>
            {!row.ticker.isActive && (
              <button
                onClick={() => onActivateTicker(row.ticker!.id)}
                className="text-[9px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25"
                title="Add to watchlist"
              >
                +
              </button>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-zinc-600">—</span>
        )}
      </td>
    </tr>
  )
}
