import { useEffect, useMemo, useState } from 'react'
import type { CalendarEvent, CalendarStrip as CalendarStripData } from '../../preload'
import { CollapseChevron, useCollapsedSection } from './collapseUI'

export type CalendarFilter = 'all' | 'finance' | 'news'

interface Props {
  filter: CalendarFilter
  onOpenStock: (symbol: string) => void
  onOpenGame: (leagueId: string, gameId: string) => void
  // Generic URL opener — launches/Fed/econ/world pills route through here
  // rather than shelling out to the system browser. See App.tsx handleOpenURL.
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
  // IPOs get a dedicated handler that synthesizes a reader-view brief from
  // Nasdaq calendar + SEC EDGAR + news search, instead of opening a URL.
  onOpenIpoBrief: (symbol: string, companyName: string) => void
}

type Kind = CalendarEvent['kind']

// Filter mapping — finance shows anything market-moving, news shows macro,
// launches, and world events (curated human-signal bullets). Fed + econ
// releases appear in both because they're market-moving *and* top-of-the-
// hour headlines.
const FINANCE_KINDS: ReadonlySet<Kind> = new Set<Kind>([
  'earnings',
  'dividend',
  'ipo',
  'stockSplit',
  'fedMeeting',
  'econRelease'
])
// IPOs live in both buckets — they're market-moving for a watchlist audience
// *and* they're general-interest news (headline coverage, "who's going public
// this week" angle). Classifying them as news-only or finance-only leaves a
// gap in whichever filter the user is on.
const NEWS_KINDS: ReadonlySet<Kind> = new Set<Kind>([
  'launch',
  'fedMeeting',
  'econRelease',
  'ipo',
  'worldEvent'
])

// Persistence key for the collapsed state. Default collapsed=true: user
// explicitly flagged that the strip takes up too much screen real estate,
// so we optimize for screen reclaim on first run. One click re-expands.
// Uses the shared useCollapsedSection hook from collapseUI so all top-of-
// page panels (Calendar / Macro / Brief) persist their state under the
// same `pulse:collapsed:*` namespace and survive page navigation.

export function CalendarStrip({
  filter,
  onOpenStock,
  onOpenGame,
  onOpenURL,
  onOpenIpoBrief
}: Props): JSX.Element | null {
  const [data, setData] = useState<CalendarStripData | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useCollapsedSection('calendar', true)

  useEffect(() => {
    let alive = true
    void window.api.calendar
      .get()
      .then((res) => {
        if (!alive) return
        setData(res)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const filteredEvents = useMemo(() => {
    if (!data) return []
    if (filter === 'finance') return data.events.filter((e) => FINANCE_KINDS.has(e.kind))
    if (filter === 'news') return data.events.filter((e) => NEWS_KINDS.has(e.kind))
    return data.events
  }, [data, filter])

  const groups = useMemo(() => groupByDay(filteredEvents), [filteredEvents])

  if (loading) return null
  if (!data || filteredEvents.length === 0) return null

  const now = Date.now()
  const rangeLabel = formatRangeLabel(data.from, data.to, now)
  const label =
    filter === 'finance'
      ? 'Market Calendar'
      : filter === 'news'
        ? 'News Calendar'
        : 'On the Radar'
  const total = filteredEvents.length

  return (
    <div className="border-b border-edge/60 bg-surface-1/40 px-6 py-3">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-3 text-left group"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 group-hover:text-zinc-200 transition-colors">
          {label}
        </h3>
        <span className="text-[11px] tabular-nums text-zinc-500">
          {total} {total === 1 ? 'item' : 'items'}
        </span>
        {collapsed ? (
          <SummaryStrip groups={groups} onOpenDay={() => setCollapsed(false)} />
        ) : (
          // Divider only renders in the expanded state. When collapsed,
          // SummaryStrip already fills the row — keeping the divider here
          // would force the pills to share flex space with it, clipping
          // the trailing days behind the range label.
          <span className="h-px flex-1 bg-edge/60 mx-1" />
        )}
        <span className="text-[11px] tabular-nums text-zinc-500 shrink-0">{rangeLabel}</span>
        <CollapseChevron open={!collapsed} className="text-zinc-500" />
      </button>
      {!collapsed && (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 pt-2">
          {groups.map((group) => (
            <div key={group.key} className="flex-shrink-0 flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2 px-1">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${group.isPast ? 'text-zinc-500' : 'text-zinc-300'}`}
                >
                  {group.weekday}
                </span>
                <span className="text-[10px] tabular-nums text-zinc-500">{group.monthDay}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {group.events.map((ev) => (
                  <EventPill
                    key={ev.id}
                    event={ev}
                    onOpenStock={onOpenStock}
                    onOpenGame={onOpenGame}
                    onOpenURL={onOpenURL}
                    onOpenIpoBrief={onOpenIpoBrief}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// Collapsed summary: one horizontal row of per-day chips showing the day
// label and a stack of kind icons from that day. Each chip re-expands the
// strip when clicked. Keeps the information density of the expanded view
// without the vertical cost.
function SummaryStrip({
  groups,
  onOpenDay
}: {
  groups: DayGroup[]
  onOpenDay: () => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0 scrollbar-none">
      {groups.slice(0, 8).map((group) => {
        const kindsInDay = Array.from(new Set(group.events.map((e) => e.kind))).slice(0, 4)
        return (
          <span
            key={group.key}
            onClick={(e) => {
              e.stopPropagation()
              onOpenDay()
            }}
            className={`inline-flex items-center gap-2 flex-shrink-0 px-2.5 py-1.5 rounded-full border text-[11px] cursor-pointer transition-colors ${
              group.isPast
                ? 'border-edge/40 bg-surface-2/40 hover:bg-surface-2/70 text-zinc-500'
                : 'border-edge/60 bg-surface-2 hover:bg-surface-3 text-zinc-300'
            }`}
            title={`${group.weekday} ${group.monthDay} · ${group.events.length} ${group.events.length === 1 ? 'event' : 'events'}`}
          >
            <span className="font-semibold uppercase tracking-[0.14em]">{group.dayTag}</span>
            <span className="inline-flex items-center gap-1">
              {kindsInDay.map((k) => (
                <MiniIcon key={k} kind={k} />
              ))}
            </span>
            <span className="tabular-nums text-zinc-500">{group.events.length}</span>
          </span>
        )
      })}
    </div>
  )
}

// Compact kind badge for the collapsed summary — a 10px colored dot plus the
// kind's stroke icon. Designed to read at a glance without the surrounding
// pill chrome.
function MiniIcon({ kind }: { kind: Kind }): JSX.Element {
  const styles = KIND_STYLES[kind]
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${styles.bg} ring-1 ring-inset ${styles.border}`}
    >
      <KindIcon kind={kind} className={`w-3 h-3 ${styles.icon}`} />
    </span>
  )
}

// Central per-kind styling — keep border/bg/hover/icon aligned. Emerald for
// earnings/dividends (growth signals), violet for IPOs, cyan for splits,
// amber for Fed (macro policy), rose for econ releases (data prints),
// orange for games, sky for launches, slate for world events (neutral —
// they're categorized by Wikipedia, not by our domain taxonomy).
const KIND_STYLES: Record<Kind, { border: string; bg: string; hover: string; icon: string }> = {
  earnings: {
    border: 'border-emerald-400/20',
    bg: 'bg-emerald-500/5',
    hover: 'hover:bg-emerald-500/10',
    icon: 'text-emerald-300'
  },
  dividend: {
    border: 'border-emerald-400/20',
    bg: 'bg-emerald-500/5',
    hover: 'hover:bg-emerald-500/10',
    icon: 'text-emerald-300'
  },
  ipo: {
    border: 'border-violet-400/20',
    bg: 'bg-violet-500/5',
    hover: 'hover:bg-violet-500/10',
    icon: 'text-violet-300'
  },
  stockSplit: {
    border: 'border-cyan-400/20',
    bg: 'bg-cyan-500/5',
    hover: 'hover:bg-cyan-500/10',
    icon: 'text-cyan-300'
  },
  fedMeeting: {
    border: 'border-amber-400/20',
    bg: 'bg-amber-500/5',
    hover: 'hover:bg-amber-500/10',
    icon: 'text-amber-300'
  },
  econRelease: {
    border: 'border-rose-400/20',
    bg: 'bg-rose-500/5',
    hover: 'hover:bg-rose-500/10',
    icon: 'text-rose-300'
  },
  game: {
    border: 'border-orange-400/20',
    bg: 'bg-orange-500/5',
    hover: 'hover:bg-orange-500/10',
    icon: 'text-orange-300'
  },
  launch: {
    border: 'border-sky-400/20',
    bg: 'bg-sky-500/5',
    hover: 'hover:bg-sky-500/10',
    icon: 'text-sky-300'
  },
  worldEvent: {
    border: 'border-slate-400/20',
    bg: 'bg-slate-500/10',
    hover: 'hover:bg-slate-500/20',
    icon: 'text-slate-200'
  }
}

// IPO pills open a synthesized brief (Nasdaq calendar + SEC EDGAR + news
// coverage) in reader view rather than routing to a URL. They're always
// clickable as long as we have either a symbol or a company name to search.
function isClickable(event: CalendarEvent): boolean {
  if (event.kind === 'earnings' || event.kind === 'dividend' || event.kind === 'stockSplit') {
    return !!event.meta.symbol
  }
  if (event.kind === 'game') return !!(event.meta.leagueId && event.meta.gameId)
  if (event.kind === 'ipo') return !!(event.meta.symbol || event.subtitle)
  if (
    event.kind === 'launch' ||
    event.kind === 'fedMeeting' ||
    event.kind === 'econRelease' ||
    event.kind === 'worldEvent'
  ) {
    return !!event.meta.url
  }
  return false
}

function EventPill({
  event,
  onOpenStock,
  onOpenGame,
  onOpenURL,
  onOpenIpoBrief
}: {
  event: CalendarEvent
  onOpenStock: (symbol: string) => void
  onOpenGame: (leagueId: string, gameId: string) => void
  onOpenURL: (url: string, title: string, subtitle?: string | null) => void
  onOpenIpoBrief: (symbol: string, companyName: string) => void
}): JSX.Element {
  const time = formatTime(event.date, event.kind)
  const clickable = isClickable(event)

  const handleClick = (): void => {
    if (
      (event.kind === 'earnings' ||
        event.kind === 'dividend' ||
        event.kind === 'stockSplit') &&
      event.meta.symbol
    ) {
      onOpenStock(event.meta.symbol)
    } else if (event.kind === 'game' && event.meta.leagueId && event.meta.gameId) {
      onOpenGame(event.meta.leagueId, event.meta.gameId)
    } else if (event.kind === 'ipo') {
      onOpenIpoBrief(event.meta.symbol ?? '', event.subtitle ?? '')
    } else if (event.meta.url) {
      onOpenURL(event.meta.url, event.title, event.subtitle)
    }
  }

  const styles = KIND_STYLES[event.kind]
  // World events carry a full-sentence title; widen the pill so the first
  // clause is readable before truncation. Other kinds stay at the compact
  // width to keep the strip scannable.
  const widthCls =
    event.kind === 'worldEvent'
      ? 'min-w-[220px] max-w-[320px]'
      : 'min-w-[160px] max-w-[240px]'
  const base = `flex items-start gap-2 ${widthCls} rounded-md px-2.5 py-1.5 text-left transition-colors border`
  const klass = `${base} ${styles.border} ${styles.bg} ${clickable ? styles.hover : ''}`

  const content = (
    <>
      <span className="flex-shrink-0 pt-[2px]">
        <KindIcon
          kind={event.kind}
          leagueId={event.meta.leagueId}
          className={`w-3.5 h-3.5 ${styles.icon}`}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={`text-[11px] font-semibold text-zinc-100 ${event.kind === 'worldEvent' ? 'line-clamp-2 leading-[1.25]' : 'truncate'}`}
        >
          {event.title}
          {event.kind === 'earnings' && event.meta.isEstimate && (
            <span className="ml-1 text-[9px] font-normal text-zinc-500 normal-case tracking-normal">
              est.
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 min-w-0">
          <span className="tabular-nums whitespace-nowrap flex-shrink-0">{time}</span>
          {event.subtitle && (
            <>
              <span className="text-zinc-600 flex-shrink-0">·</span>
              <span className="truncate">{event.subtitle}</span>
            </>
          )}
        </div>
      </div>
    </>
  )

  if (clickable) {
    return (
      <button type="button" onClick={handleClick} className={klass}>
        {content}
      </button>
    )
  }
  return <div className={klass}>{content}</div>
}

// Map ESPN league id → sport family so one icon covers every soccer league
// (UCL, EPL, La Liga, Serie A, MLS) without listing each.
function sportFor(leagueId?: string): 'basketball' | 'football' | 'baseball' | 'hockey' | 'soccer' {
  if (!leagueId) return 'basketball'
  if (leagueId === 'nfl') return 'football'
  if (leagueId === 'mlb') return 'baseball'
  if (leagueId === 'nhl') return 'hockey'
  if (leagueId === 'nba') return 'basketball'
  return 'soccer'
}

function KindIcon({
  kind,
  leagueId,
  className
}: {
  kind: Kind
  leagueId?: string
  className?: string
}): JSX.Element {
  const cls = `flex-shrink-0 ${className ?? `w-3.5 h-3.5 ${KIND_STYLES[kind].icon}`}`
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }
  if (kind === 'earnings') {
    return (
      <svg className={cls} {...common}>
        <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 7h7v7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'dividend') {
    // Dollar sign — dividends are cash payouts.
    return (
      <svg className={cls} {...common}>
        <path d="M12 3v18" strokeLinecap="round" />
        <path
          d="M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (kind === 'ipo') {
    // Rocket/arrow-up — new listing launching.
    return (
      <svg className={cls} {...common}>
        <path d="M12 19V5" strokeLinecap="round" />
        <path d="M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="19" r="1.5" />
      </svg>
    )
  }
  if (kind === 'stockSplit') {
    // Branching lines — a share splitting in two.
    return (
      <svg className={cls} {...common}>
        <path d="M12 3v6" strokeLinecap="round" />
        <path d="M12 9l-5 6v6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 9l5 6v6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'fedMeeting') {
    // Columned building — central-bank classic.
    return (
      <svg className={cls} {...common}>
        <path d="M3 10l9-6 9 6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 10v8M9 10v8M15 10v8M19 10v8" strokeLinecap="round" />
        <path d="M3 20h18" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'econRelease') {
    // Bar chart — macro data print.
    return (
      <svg className={cls} {...common}>
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'worldEvent') {
    // Globe — classic world-news signifier.
    return (
      <svg className={cls} {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" strokeLinecap="round" />
        <path
          d="M12 3c3 3 4.5 6 4.5 9s-1.5 6-4.5 9c-3-3-4.5-6-4.5-9s1.5-6 4.5-9z"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (kind === 'game') {
    const sport = sportFor(leagueId)
    if (sport === 'football') {
      // American football — elongated oval with vertical laces.
      return (
        <svg className={cls} {...common}>
          <ellipse cx="12" cy="12" rx="9" ry="5" transform="rotate(-24 12 12)" />
          <path d="M10 12h4M11 10.5v3M13 10.5v3" strokeLinecap="round" />
        </svg>
      )
    }
    if (sport === 'baseball') {
      // Baseball — circle with curved stitching.
      return (
        <svg className={cls} {...common}>
          <circle cx="12" cy="12" r="9" />
          <path
            d="M5.5 6C8 8.5 8 15.5 5.5 18M18.5 6C16 8.5 16 15.5 18.5 18"
            strokeLinecap="round"
          />
        </svg>
      )
    }
    if (sport === 'hockey') {
      // Hockey — puck (flat ellipse) with side stripes.
      return (
        <svg className={cls} {...common}>
          <ellipse cx="12" cy="13" rx="9" ry="3" />
          <path d="M3 13v3M21 13v3" strokeLinecap="round" />
          <ellipse cx="12" cy="16" rx="9" ry="3" />
        </svg>
      )
    }
    if (sport === 'soccer') {
      // Soccer — ball with the iconic pentagon centerpiece.
      return (
        <svg className={cls} {...common}>
          <circle cx="12" cy="12" r="9" />
          <polygon points="12,8 15,10.4 13.9,14 10.1,14 9,10.4" />
          <path d="M12 3v5M21 12h-6M3 12h6M15 19.5L13.9 14M9 19.5l1.1-5.5" strokeLinecap="round" />
        </svg>
      )
    }
    // Basketball (default) — seams over a ball.
    return (
      <svg className={cls} {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 12h17M12 3.5v17M5.5 5.5c4.5 3 9 3 13 0M5.5 18.5c4.5-3 9-3 13 0" />
      </svg>
    )
  }
  return (
    <svg className={cls} {...common}>
      <path
        d="M12 2c3 3 5 6.5 5 10v6l-3-2h-4l-3 2v-6c0-3.5 2-7 5-10z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="1.5" />
    </svg>
  )
}

interface DayGroup {
  key: string
  weekday: string
  monthDay: string
  // Short tag for the collapsed summary: "Today"/"Tue"/"Mon" — stays short
  // enough for the chip row to fit ~8 days on a reasonable window width.
  dayTag: string
  isPast: boolean
  events: CalendarEvent[]
}

function groupByDay(events: CalendarEvent[]): DayGroup[] {
  const byKey = new Map<string, DayGroup>()
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const tomorrowKey = `${tomorrow.getFullYear()}-${tomorrow.getMonth()}-${tomorrow.getDate()}`
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`

  for (const ev of events) {
    const d = new Date(ev.date)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!byKey.has(key)) {
      const weekday = d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()
      const dayTag =
        key === todayKey
          ? 'TODAY'
          : key === tomorrowKey
            ? 'TMRW'
            : key === yesterdayKey
              ? 'YDAY'
              : weekday
      byKey.set(key, {
        key,
        weekday,
        monthDay: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        dayTag,
        isPast: d.getTime() < now.getTime() && key !== todayKey,
        events: []
      })
    }
    byKey.get(key)!.events.push(ev)
  }
  return Array.from(byKey.values()).sort((a, b) => a.events[0].date - b.events[0].date)
}

// World events don't carry a timestamp from Wikipedia; render an "All day"
// badge for them instead of a misleading 12:00 AM. Everything else uses
// the event's actual time — or "All day" if it lands on local midnight.
function formatTime(unixMs: number, kind: Kind): string {
  if (kind === 'worldEvent') return 'All day'
  const d = new Date(unixMs)
  if (d.getHours() === 0 && d.getMinutes() === 0) return 'All day'
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// Produces "Past 3d · Next 7d" / "Next 7 days" / etc. The prior "Next {N}
// days" labeling was misleading once worldEvents widened the strip backward.
function formatRangeLabel(from: number, to: number, now: number): string {
  const MS = 86_400_000
  const pastDays = Math.max(0, Math.round((now - from) / MS))
  const nextDays = Math.max(1, Math.round((to - now) / MS))
  if (pastDays > 0) return `Past ${pastDays}d · Next ${nextDays}d`
  return `Next ${nextDays} ${nextDays === 1 ? 'day' : 'days'}`
}
