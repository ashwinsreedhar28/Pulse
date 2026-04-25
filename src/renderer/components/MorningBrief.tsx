// Top-of-feed card showing the latest Claude-authored watchlist digest.
// Lives above the CalendarStrip on the main FeedView. Collapsible so a
// user who's seen it can scroll past without losing real estate; "fresh"
// state (within ~4h of generation) renders pre-expanded so morning users
// see it immediately.

import { useEffect, useState } from 'react'

import type {
  BriefBullet,
  BriefCitation,
  BriefSection,
  MorningBriefRow
} from '../../preload'
import { CollapseChevron, useCollapsedSection } from './collapseUI'

interface Props {
  // Article-id click handler — opens the in-app reader (FeedView already
  // owns this; we just pass through).
  onOpenArticle: (id: number) => void
  // Symbol click handler — opens the ticker detail page.
  onOpenSymbol: (symbol: string) => void
}

// Section icons + accents indexed by `kind`. Unknown kinds fall back to a
// generic look so a future Claude-side prompt change can introduce a new
// section without breaking rendering.
const SECTION_TONE: Record<
  string,
  { glyph: string; tone: string; tint: string }
> = {
  headlines: { glyph: '◆', tone: 'text-emerald-300', tint: 'border-emerald-500/30' },
  earnings: { glyph: '$', tone: 'text-amber-300', tint: 'border-amber-500/30' },
  filings: { glyph: '§', tone: 'text-sky-300', tint: 'border-sky-500/30' },
  iv: { glyph: 'σ', tone: 'text-violet-300', tint: 'border-violet-500/30' }
}

function sectionStyle(kind: string): { glyph: string; tone: string; tint: string } {
  return SECTION_TONE[kind] ?? { glyph: '·', tone: 'text-zinc-300', tint: 'border-zinc-600/40' }
}

function relativeAge(generatedAt: number): string {
  const diffMin = Math.round((Date.now() - generatedAt) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const hours = Math.round(diffMin / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function CitationChip({
  citation,
  onOpenArticle,
  onOpenSymbol
}: {
  citation: BriefCitation
  onOpenArticle: (id: number) => void
  onOpenSymbol: (symbol: string) => void
}): JSX.Element {
  const handleClick = (): void => {
    if (citation.type === 'article') {
      const id = Number(citation.ref)
      if (Number.isFinite(id)) onOpenArticle(id)
    } else if (citation.type === 'symbol') {
      onOpenSymbol(citation.ref)
    } else if (citation.type === 'filing' && citation.url) {
      // Filing URLs are SEC archive links — route via shell.openExternal
      // through the standard external-URL bridge that FeedView's onOpenURL
      // helper uses elsewhere. We don't have that handler in this scope,
      // so fall back to window.open which Electron routes through the
      // setWindowOpenHandler that already exists for external links.
      window.open(citation.url, '_blank', 'noopener')
    }
  }
  const label =
    citation.label ??
    (citation.type === 'article'
      ? 'article'
      : citation.type === 'filing'
        ? 'filing'
        : citation.ref)
  const isClickable =
    citation.type !== 'filing' || !!citation.url
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isClickable}
      className={`shrink-0 inline-flex items-center px-1.5 py-[1px] rounded-full text-[9.5px] font-semibold uppercase tracking-[0.16em] border transition-colors ${
        isClickable
          ? 'border-zinc-600 bg-zinc-800/60 text-zinc-300 hover:border-emerald-400/60 hover:text-emerald-300 cursor-pointer'
          : 'border-zinc-700 bg-zinc-900/40 text-zinc-500 cursor-default'
      }`}
      title={
        citation.type === 'article'
          ? `Open article #${citation.ref}`
          : citation.type === 'symbol'
            ? `Open ${citation.ref} detail`
            : citation.url ?? `Filing ${citation.ref}`
      }
    >
      {label}
    </button>
  )
}

function Bullet({
  bullet,
  onOpenArticle,
  onOpenSymbol
}: {
  bullet: BriefBullet
  onOpenArticle: (id: number) => void
  onOpenSymbol: (symbol: string) => void
}): JSX.Element {
  return (
    <li className="flex items-start gap-2.5 leading-relaxed">
      <span className="text-zinc-600 select-none mt-[2px]">·</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-zinc-200">{bullet.text}</div>
        {bullet.citations && bullet.citations.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {bullet.citations.map((c, i) => (
              <CitationChip
                key={`${c.type}-${c.ref}-${i}`}
                citation={c}
                onOpenArticle={onOpenArticle}
                onOpenSymbol={onOpenSymbol}
              />
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function Section({
  section,
  onOpenArticle,
  onOpenSymbol
}: {
  section: BriefSection
  onOpenArticle: (id: number) => void
  onOpenSymbol: (symbol: string) => void
}): JSX.Element {
  const style = sectionStyle(section.kind)
  return (
    <section className={`pl-3 border-l ${style.tint}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[12px] leading-none ${style.tone}`}>{style.glyph}</span>
        <h3 className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${style.tone}`}>
          {section.title}
        </h3>
      </div>
      <ul className="space-y-2">
        {section.bullets.map((b, i) => (
          <Bullet
            key={i}
            bullet={b}
            onOpenArticle={onOpenArticle}
            onOpenSymbol={onOpenSymbol}
          />
        ))}
      </ul>
    </section>
  )
}

export function MorningBrief({ onOpenArticle, onOpenSymbol }: Props): JSX.Element | null {
  const [row, setRow] = useState<MorningBriefRow | null | undefined>(undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useCollapsedSection('morningBrief', false)

  // Auto-collapse if the existing brief is more than 6h old — by then the
  // morning frame has passed, so it's clutter rather than headline space.
  // Respects the persisted preference: if the user explicitly opened a
  // stale brief in this session, we don't fight them on every refresh.
  useEffect(() => {
    if (row && row.generatedAt > 0) {
      const ageMs = Date.now() - row.generatedAt
      if (ageMs > 6 * 60 * 60 * 1000) setCollapsed(true)
    }
  }, [row, setCollapsed])

  useEffect(() => {
    let cancelled = false
    void window.api.brief
      .getCurrent()
      .then((r) => {
        if (!cancelled) setRow(r)
      })
      .catch(() => {
        if (!cancelled) setRow(null)
      })
    const unsub = window.api.brief.onUpdated(() => {
      void window.api.brief
        .getCurrent()
        .then((r) => {
          if (!cancelled) setRow(r)
        })
        .catch(() => {
          /* keep prior */
        })
    })
    return (): void => {
      cancelled = true
      unsub()
    }
  }, [])

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await window.api.brief.refresh()
      // Result lands via onUpdated broadcast; refreshing flag flips off
      // when the new row arrives or after a short timeout in case the
      // call quietly skipped (cap reached, etc).
      setTimeout(() => setRefreshing(false), 30_000)
    } catch {
      setRefreshing(false)
    }
  }

  // Render nothing while we're still resolving the initial fetch — avoids
  // a placeholder flicker on cold boot. Cold state (resolved to null with
  // no brief yet) renders a thin "first brief generating…" hint instead.
  if (row === undefined) return null

  if (row === null) {
    return (
      <div className="mx-6 mt-3 mb-1 rounded-xl border border-edge/60 bg-surface-1/60 px-4 py-3 text-[12px] text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">◆</span>
          <span className="font-semibold uppercase tracking-[0.22em] text-[10px]">
            Morning Brief
          </span>
          <span className="text-zinc-600">·</span>
          <span>Generating your first watchlist digest. Comes online a few minutes after launch.</span>
        </div>
      </div>
    )
  }

  const { payload, generatedAt } = row
  const totalBullets = payload.sections.reduce((acc, s) => acc + s.bullets.length, 0)
  return (
    <div className="mx-6 mt-3 mb-2 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-surface-1 to-surface-1 overflow-hidden">
      <header className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-400">
              ◆ Morning Brief
            </span>
            <span className="text-[10px] text-zinc-600">·</span>
            <span className="text-[10px] text-zinc-500">{relativeAge(generatedAt)}</span>
            <span className="text-[10px] text-zinc-600">·</span>
            <span className="text-[10px] text-zinc-500 tabular-nums">
              {payload.inputs.watchlistSize} tickers · {totalBullets} bullets
            </span>
          </div>
          <h2 className="text-[14.5px] font-semibold text-zinc-50 leading-snug max-w-[820px]">
            {payload.headline}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Regenerate the brief now (uses one Claude call)"
            className={`text-[9.5px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full ring-1 ring-inset ${
              refreshing
                ? 'bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait'
                : 'bg-zinc-800/70 text-zinc-300 ring-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!collapsed}
            className="flex items-center text-zinc-500 hover:text-zinc-300 px-1.5 py-1"
          >
            <CollapseChevron open={!collapsed} />
          </button>
        </div>
      </header>
      {!collapsed && (
        <div className="px-4 pb-4 pt-1 space-y-4">
          {payload.sections.map((s, i) => (
            <Section
              key={`${s.kind}-${i}`}
              section={s}
              onOpenArticle={onOpenArticle}
              onOpenSymbol={onOpenSymbol}
            />
          ))}
        </div>
      )}
    </div>
  )
}
