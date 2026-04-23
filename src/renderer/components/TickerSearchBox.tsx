// Live ticker autocomplete backed by Yahoo's search endpoint. Type to filter
// across any US-listed equity / ETF / index (not just the ~65 in our curated
// graph); selecting a result expands an inline profile preview with Open-
// details and Add-to-watchlist actions.
//
// Keyboard: ↑↓ move within the dropdown, Enter selects, Esc closes.

import { useEffect, useRef, useState } from 'react'

import type { TickerSearchResult } from '../../preload'

const DEBOUNCE_MS = 220

interface PreviewSelection extends TickerSearchResult {}

export function TickerSearchBox({
  onOpenDetail,
  onAddToWatchlist,
  autoFocus = false
}: {
  // Open the stock detail page for this symbol. Parent is responsible for
  // ensuring a tickers-table row exists (creating a passive row if needed)
  // and navigating.
  onOpenDetail: (result: TickerSearchResult) => void
  // Add to watchlist + navigate. Same signature — the parent decides the
  // activation semantics.
  onAddToWatchlist: (result: TickerSearchResult) => void
  autoFocus?: boolean
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TickerSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [preview, setPreview] = useState<PreviewSelection | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Request-sequencing: late-arriving responses from obsolete queries get
  // dropped so the dropdown doesn't flicker with stale matches.
  const reqIdRef = useRef(0)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 1) {
      setResults([])
      setLoading(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current
      setLoading(true)
      window.api.stocks
        .searchTickers(q, 10)
        .then((rows) => {
          if (reqIdRef.current !== reqId) return
          setResults(rows)
          setSelectedIdx(0)
        })
        .catch(() => {
          if (reqIdRef.current !== reqId) return
          setResults([])
        })
        .finally(() => {
          if (reqIdRef.current === reqId) setLoading(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const picked = results[selectedIdx]
      if (picked) {
        setPreview(picked)
        setResults([])
        setQuery(picked.symbol)
      }
    } else if (e.key === 'Escape') {
      setResults([])
      setQuery('')
      setPreview(null)
    }
  }

  const pick = (r: TickerSearchResult): void => {
    setPreview(r)
    setResults([])
    setQuery(r.symbol)
  }

  const clear = (): void => {
    setQuery('')
    setResults([])
    setPreview(null)
    inputRef.current?.focus()
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (preview && e.target.value !== preview.symbol) setPreview(null)
          }}
          onKeyDown={onKey}
          placeholder="Search any US ticker — e.g. KO, PLTR, COST, ASML…"
          className="w-full bg-surface-0 border border-edge rounded-lg px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-edge focus:ring-1 focus:ring-emerald-500/40"
        />
        {query.length > 0 && (
          <button
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-300"
            title="Clear (Esc)"
          >
            Clear
          </button>
        )}
        {results.length > 0 && (
          <ul className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-edge bg-surface-1 shadow-xl overflow-hidden">
            {loading && (
              <li className="px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                Searching…
              </li>
            )}
            {results.map((r, i) => (
              <li key={`${r.symbol}-${i}`}>
                <button
                  onClick={() => pick(r)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`w-full text-left flex items-start gap-3 px-3 py-2 transition-colors ${
                    i === selectedIdx
                      ? 'bg-surface-2/80'
                      : 'bg-transparent hover:bg-surface-2/50'
                  }`}
                >
                  <span className="shrink-0 text-[12px] font-bold tracking-[0.06em] text-zinc-50 min-w-[60px]">
                    {r.symbol}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-zinc-200 truncate">{r.name}</div>
                    <div className="text-[10px] text-zinc-500 truncate">
                      {[r.exchangeDisplay ?? r.exchange, r.sector, r.industry]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  {r.quoteType && (
                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-zinc-800/70 text-zinc-400">
                      {r.quoteType}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading && results.length === 0 && query.length >= 1 && (
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">
          Searching…
        </div>
      )}
      {!loading && results.length === 0 && query.length >= 2 && !preview && (
        <div className="text-[11.5px] text-zinc-500 italic">
          No matches. Yahoo search only covers US-listed symbols.
        </div>
      )}

      {preview && <PreviewCard result={preview} onOpenDetail={onOpenDetail} onAddToWatchlist={onAddToWatchlist} />}
    </div>
  )
}

function PreviewCard({
  result,
  onOpenDetail,
  onAddToWatchlist
}: {
  result: TickerSearchResult
  onOpenDetail: (r: TickerSearchResult) => void
  onAddToWatchlist: (r: TickerSearchResult) => void
}): JSX.Element {
  return (
    <div className="rounded-lg border border-edge bg-surface-0 p-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[16px] font-bold tracking-[0.04em] text-zinc-50">
            {result.symbol}
          </span>
          {result.quoteType && (
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded bg-zinc-800/70 text-zinc-400">
              {result.quoteType}
            </span>
          )}
          {result.exchangeDisplay && (
            <span className="text-[10px] text-zinc-500">{result.exchangeDisplay}</span>
          )}
        </div>
        <div className="text-[13px] text-zinc-200 mb-1 leading-snug">{result.name}</div>
        <div className="text-[11px] text-zinc-500">
          {[result.sector, result.industry].filter(Boolean).join(' · ') ||
            'No sector/industry on file from Yahoo.'}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button
          onClick={() => onOpenDetail(result)}
          className="text-[10px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25"
        >
          Open detail
        </button>
        <button
          onClick={() => onAddToWatchlist(result)}
          className="text-[10px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25"
        >
          + Watchlist
        </button>
      </div>
    </div>
  )
}
