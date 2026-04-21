import { useCallback, useEffect, useState } from 'react'
import type { DiscoverySuggestion } from '../../preload'

type RunMode = 'daily' | 'weekly' | 'portfolio-gaps'

export function Discovery({ onClose }: { onClose: () => void }): JSX.Element {
  const [suggestions, setSuggestions] = useState<DiscoverySuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<RunMode | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.api.discovery.list()
      setSuggestions(data)
      void window.api.discovery.markAllViewed()
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const run = async (mode: RunMode): Promise<void> => {
    if (running) return
    setRunning(mode)
    try {
      if (mode === 'daily') await window.api.discovery.runDaily()
      else if (mode === 'weekly') await window.api.discovery.runWeekly()
      else await window.api.discovery.runPortfolioGaps()
      await reload()
    } finally {
      setRunning(null)
    }
  }

  const handleDelete = async (id: number): Promise<void> => {
    await window.api.discovery.delete(id)
    setSuggestions((prev) => prev.filter((s) => s.id !== id))
  }

  const daily = suggestions.filter((s) => s.mode === 'daily')
  const weekly = suggestions.filter((s) => s.mode === 'weekly')
  const gaps = suggestions.filter((s) => s.mode === 'portfolio-gaps')

  return (
    <section
      className="h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden"
      data-lookup-context="Stock discovery page — emerging and adjacent publicly traded companies in the user's semiconductor value chain, defense/aerospace, and mining portfolio. Ambiguous terms are almost always companies or tickers, not people or places."
    >
      <header className="h-11 shrink-0 flex items-center gap-3 px-4 border-b border-edge bg-surface-1/60">
        <button
          onClick={onClose}
          className="text-[11px] text-zinc-400 hover:text-zinc-100"
          title="Back"
        >
          ← Back
        </button>
        <span className="text-[11px] uppercase tracking-widest text-zinc-300">
          Stock Discovery
        </span>
        <div className="ml-auto flex items-center gap-2">
          <RunButton label="Daily Scan" running={running === 'daily'} onClick={() => run('daily')} disabled={running !== null} />
          <RunButton label="Weekly AI" running={running === 'weekly'} onClick={() => run('weekly')} disabled={running !== null} />
          <RunButton label="Portfolio Gaps" running={running === 'portfolio-gaps'} onClick={() => run('portfolio-gaps')} disabled={running !== null} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        {loading && suggestions.length === 0 && (
          <p className="text-sm text-zinc-500">Loading suggestions…</p>
        )}
        {!loading && suggestions.length === 0 && (
          <div className="text-center py-16">
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-600 mb-3">No suggestions yet</p>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto">
              Click "Daily Scan" for keyword-based picks, or "Weekly AI" / "Portfolio Gaps" for Ollama-powered analysis.
            </p>
          </div>
        )}

        {daily.length > 0 && (
          <SuggestionGroup title="Daily Drip" accent="text-blue-400" items={daily} onDelete={handleDelete} />
        )}
        {weekly.length > 0 && (
          <SuggestionGroup title="Weekly Curated" accent="text-amber-400" items={weekly} onDelete={handleDelete} />
        )}
        {gaps.length > 0 && (
          <SuggestionGroup title="Portfolio Gaps" accent="text-emerald-400" items={gaps} onDelete={handleDelete} />
        )}
      </div>
    </section>
  )
}

function RunButton({
  label,
  running,
  onClick,
  disabled
}: {
  label: string
  running: boolean
  onClick: () => void
  disabled: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="no-drag text-[10px] uppercase tracking-wider px-2 py-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 disabled:text-zinc-600 disabled:hover:bg-transparent"
    >
      {running ? 'Running…' : label}
    </button>
  )
}

function SuggestionGroup({
  title,
  accent,
  items,
  onDelete
}: {
  title: string
  accent: string
  items: DiscoverySuggestion[]
  onDelete: (id: number) => Promise<void>
}): JSX.Element {
  return (
    <div>
      <h3 className={`text-[10px] font-semibold tracking-[0.18em] uppercase ${accent} mb-3`}>
        {title}
      </h3>
      <div className="space-y-3">
        {items.map((s) => (
          <SuggestionCard key={s.id} suggestion={s} onDelete={() => onDelete(s.id)} />
        ))}
      </div>
    </div>
  )
}

function SuggestionCard({
  suggestion: s,
  onDelete
}: {
  suggestion: DiscoverySuggestion
  onDelete: () => void
}): JSX.Element {
  return (
    <div className="bg-surface-1 border border-edge rounded-lg px-4 py-3 flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-zinc-100 tracking-wide">{s.ticker}</span>
          <span className="text-[11px] text-zinc-400">{s.companyName}</span>
          <span className="text-[10px] text-zinc-600 ml-auto shrink-0">{formatAge(s.createdAt)}</span>
        </div>
        <p className="text-[12px] text-zinc-300 leading-relaxed">{s.reason}</p>
      </div>
      <button
        onClick={onDelete}
        title="Dismiss"
        className="shrink-0 text-zinc-600 hover:text-zinc-300 text-[11px] mt-0.5"
      >
        ×
      </button>
    </div>
  )
}

function formatAge(ts: number): string {
  const diff = Date.now() - ts
  const hr = 60 * 60 * 1000
  const day = 24 * hr
  if (diff < hr) return 'just now'
  if (diff < day) return `${Math.floor(diff / hr)}h ago`
  return `${Math.floor(diff / day)}d ago`
}
