// Top-of-feed card showing the latest Claude-authored watchlist digest.
// Lives above the CalendarStrip on the main FeedView. Collapsible so a
// user who's seen it can scroll past without losing real estate; "fresh"
// state (within ~4h of generation) renders pre-expanded so morning users
// see it immediately.

import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  Article,
  BriefBullet,
  BriefCitation,
  BriefSection,
  MorningBriefRow,
  StockQuote
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

// YYYY-MM-DD formatter to match the value-chain SourceBadge style.
function formatCiteDate(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

function CitationChip({
  citation,
  article,
  quote,
  onOpenArticle,
  onOpenSymbol
}: {
  citation: BriefCitation
  // Article metadata for article-typed citations. Provided by parent
  // when available so the chip can render "Feed · YYYY-MM-DD" instead
  // of the generic "article" fallback.
  article: Article | null
  // Quote for symbol-typed citations, used to color the chip green
  // (up) / red (down) / neutral. Null when the symbol isn't in the
  // current quotes snapshot.
  quote: StockQuote | null
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
      window.open(citation.url, '_blank', 'noopener')
    }
  }

  // Symbol citations: color by quote direction. Up = emerald, down =
  // rose, flat / no quote = zinc. Same palette as the stock cards.
  if (citation.type === 'symbol') {
    const change = quote?.change ?? null
    const tone =
      change === null || change === 0
        ? 'border-zinc-600/60 bg-zinc-800/60 text-zinc-300 hover:border-zinc-400'
        : change > 0
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:brightness-125'
          : 'border-rose-500/40 bg-rose-500/10 text-rose-200 hover:brightness-125'
    const pctStr =
      quote?.changePct !== null && quote?.changePct !== undefined
        ? ` ${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%`
        : ''
    return (
      <button
        type="button"
        onClick={handleClick}
        title={`Open ${citation.ref} detail${pctStr ? ` ·${pctStr}` : ''}`}
        className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-[1px] rounded-md border text-[9.5px] font-semibold uppercase tracking-[0.16em] transition cursor-pointer ${tone}`}
      >
        <span>{citation.label ?? citation.ref}</span>
        {pctStr && <span className="font-bold">{pctStr.trim()}</span>}
      </button>
    )
  }

  // Article + filing chips use the same visual language as
  // StockValueChainCard's SourceBadge: rounded-md, kind-toned border
  // + bg + text, ↗ arrow to signal clickability.
  if (citation.type === 'article') {
    const dateStr = article ? formatCiteDate(article.publishedAt) : ''
    const sourceStr = article?.feedTitle ?? citation.label ?? 'News'
    const label = dateStr ? `${sourceStr} · ${dateStr}` : sourceStr
    return (
      <button
        type="button"
        onClick={handleClick}
        title={
          article
            ? `${article.title}${dateStr ? ` (${dateStr})` : ''} — click to open`
            : `Open article #${citation.ref}`
        }
        className="shrink-0 inline-flex items-start gap-1 px-2 py-[3px] rounded-md border text-[10.5px] font-semibold uppercase tracking-[0.12em] max-w-full whitespace-normal break-words leading-[1.35] border-sky-500/40 bg-sky-500/10 text-sky-200 cursor-pointer hover:brightness-125 hover:underline underline-offset-2 text-left transition"
      >
        <span className="flex-1 min-w-0">{label}</span>
        <span aria-hidden="true" className="shrink-0 text-[9px] opacity-80 mt-[1px]">
          ↗
        </span>
      </button>
    )
  }

  // Filing — emerald tone matching the value-chain "10-K" pill. Only
  // clickable when we have a URL.
  const filingHasUrl = !!citation.url
  const filingLabel = citation.label ?? '10-K'
  if (filingHasUrl) {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={citation.url ?? `Filing ${citation.ref}`}
        className="shrink-0 inline-flex items-start gap-1 px-2 py-[3px] rounded-md border text-[10.5px] font-semibold uppercase tracking-[0.12em] max-w-full whitespace-normal break-words leading-[1.35] border-emerald-500/40 bg-emerald-500/10 text-emerald-200 cursor-pointer hover:brightness-125 hover:underline underline-offset-2 text-left transition"
      >
        <span className="flex-1 min-w-0">{filingLabel}</span>
        <span aria-hidden="true" className="shrink-0 text-[9px] opacity-80 mt-[1px]">
          ↗
        </span>
      </button>
    )
  }
  return (
    <span
      title={`Filing ${citation.ref}`}
      className="shrink-0 inline-flex items-center px-2 py-[3px] rounded-md border text-[10.5px] font-semibold uppercase tracking-[0.12em] border-emerald-500/40 bg-emerald-500/10 text-emerald-200/70"
    >
      {filingLabel}
    </span>
  )
}

function Bullet({
  bullet,
  articleByRef,
  quoteBySymbol,
  onOpenArticle,
  onOpenSymbol
}: {
  bullet: BriefBullet
  articleByRef: Map<number, Article>
  quoteBySymbol: Map<string, StockQuote>
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
            {bullet.citations.map((c, i) => {
              const article =
                c.type === 'article'
                  ? (articleByRef.get(Number(c.ref)) ?? null)
                  : null
              const quote =
                c.type === 'symbol'
                  ? (quoteBySymbol.get(c.ref.toUpperCase()) ?? null)
                  : null
              return (
                <CitationChip
                  key={`${c.type}-${c.ref}-${i}`}
                  citation={c}
                  article={article}
                  quote={quote}
                  onOpenArticle={onOpenArticle}
                  onOpenSymbol={onOpenSymbol}
                />
              )
            })}
          </div>
        )}
      </div>
    </li>
  )
}

function Section({
  section,
  articleByRef,
  quoteBySymbol,
  onOpenArticle,
  onOpenSymbol
}: {
  section: BriefSection
  articleByRef: Map<number, Article>
  quoteBySymbol: Map<string, StockQuote>
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
            articleByRef={articleByRef}
            quoteBySymbol={quoteBySymbol}
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
  const [quotes, setQuotes] = useState<StockQuote[]>([])
  // Per-citation article cache so chips render "Reuters · 2026-04-25"
  // instead of the generic "article" fallback. Fetched lazily after the
  // brief lands; updates are merged so re-fetches don't blow away
  // previously-resolved articles.
  const [articleCache, setArticleCache] = useState<Map<number, Article>>(() => new Map())

  // Quotes drive the ticker chip color (green/red/zinc). Stocks
  // scheduler already broadcasts updates; we just subscribe so a
  // refresh after the bar mounts repaints the chips without
  // remounting the whole brief.
  useEffect(() => {
    let cancelled = false
    void window.api.stocks.getQuotes().then((q) => {
      if (!cancelled) setQuotes(q)
    })
    const unsub = window.api.stocks.onUpdated((q) => {
      if (!cancelled) setQuotes(q)
    })
    return (): void => {
      cancelled = true
      unsub()
    }
  }, [])

  // Auto-collapse if the brief is more than 6h old — by then the morning
  // frame has passed, so it's clutter rather than headline space.
  //
  // This fires AT MOST ONCE per unique brief: we track the generatedAt of
  // the brief we already evaluated, and skip the auto-collapse on every
  // subsequent setRow (broadcasts, refetches). Otherwise the user's manual
  // expand on a stale brief would be slammed shut on the next refresh AND
  // persisted via useCollapsedSection, silently corrupting their preference.
  const autoCollapsedForRef = useRef<number | null>(null)
  useEffect(() => {
    if (!row || row.generatedAt === 0) return
    if (autoCollapsedForRef.current === row.generatedAt) return
    autoCollapsedForRef.current = row.generatedAt
    const ageMs = Date.now() - row.generatedAt
    if (ageMs > 6 * 60 * 60 * 1000) setCollapsed(true)
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

  // Pull metadata for every article-typed citation when a brief loads
  // so chips can show "Feed · YYYY-MM-DD". One-shot per ID; cache
  // dedups across re-renders + brief refreshes.
  useEffect(() => {
    if (!row) return
    const ids = new Set<number>()
    for (const section of row.payload.sections) {
      for (const bullet of section.bullets) {
        for (const c of bullet.citations ?? []) {
          if (c.type !== 'article') continue
          const id = Number(c.ref)
          if (!Number.isFinite(id)) continue
          if (articleCache.has(id)) continue
          ids.add(id)
        }
      }
    }
    if (ids.size === 0) return
    let cancelled = false
    void Promise.all(
      [...ids].map((id) =>
        window.api.articles.getById(id).then((row) => ({ id, row }))
      )
    ).then((results) => {
      if (cancelled) return
      setArticleCache((prev) => {
        const next = new Map(prev)
        for (const { id, row } of results) {
          if (row) next.set(id, row)
        }
        return next
      })
    })
    return (): void => {
      cancelled = true
    }
    // articleCache intentionally omitted — only refetch when the brief
    // changes; otherwise updating the cache would re-trigger this
    // effect on every fetch settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row])

  const quoteBySymbol = useMemo<Map<string, StockQuote>>(() => {
    const m = new Map<string, StockQuote>()
    for (const q of quotes) m.set(q.symbol.toUpperCase(), q)
    return m
  }, [quotes])

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
              articleByRef={articleCache}
              quoteBySymbol={quoteBySymbol}
              onOpenArticle={onOpenArticle}
              onOpenSymbol={onOpenSymbol}
            />
          ))}
        </div>
      )}
    </div>
  )
}
