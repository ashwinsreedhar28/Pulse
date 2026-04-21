import { useEffect, useMemo, useState } from 'react'
import type { CalendarEvent, CalendarStrip as CalendarStripData } from '../../preload'

export type CalendarFilter = 'all' | 'finance' | 'news'

interface Props {
  filter: CalendarFilter
  onOpenStock: (symbol: string) => void
  onOpenGame: (leagueId: string, gameId: string) => void
}

export function CalendarStrip({ filter, onOpenStock, onOpenGame }: Props): JSX.Element | null {
  const [data, setData] = useState<CalendarStripData | null>(null)
  const [loading, setLoading] = useState(true)

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
    if (filter === 'finance') return data.events.filter((e) => e.kind === 'earnings')
    if (filter === 'news') return data.events.filter((e) => e.kind === 'launch')
    return data.events
  }, [data, filter])

  const groups = useMemo(() => groupByDay(filteredEvents), [filteredEvents])

  if (loading) return null
  if (!data || filteredEvents.length === 0) return null

  const label =
    filter === 'finance'
      ? 'Earnings This Week'
      : filter === 'news'
        ? 'Upcoming Launches'
        : 'On the Radar'

  return (
    <div className="border-b border-edge/60 bg-surface-1/40 px-6 py-3">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          {label}
        </h3>
        <span className="h-px flex-1 bg-edge/60" />
        <span className="text-[10px] tabular-nums text-zinc-500">Next 7 days</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {groups.map((group) => (
          <div key={group.key} className="flex-shrink-0 flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2 px-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
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
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EventPill({
  event,
  onOpenStock,
  onOpenGame
}: {
  event: CalendarEvent
  onOpenStock: (symbol: string) => void
  onOpenGame: (leagueId: string, gameId: string) => void
}): JSX.Element {
  const time = formatTime(event.date)
  const clickable = event.kind !== 'launch'

  const handleClick = (): void => {
    if (event.kind === 'earnings' && event.meta.symbol) {
      onOpenStock(event.meta.symbol)
    } else if (event.kind === 'game' && event.meta.leagueId && event.meta.gameId) {
      onOpenGame(event.meta.leagueId, event.meta.gameId)
    }
  }

  const base =
    'flex items-center gap-2 min-w-[160px] max-w-[240px] rounded-md px-2.5 py-1.5 text-left transition-colors border'
  const klass =
    event.kind === 'earnings'
      ? `${base} border-emerald-400/20 bg-emerald-500/5 ${clickable ? 'hover:bg-emerald-500/10' : ''}`
      : event.kind === 'game'
        ? `${base} border-orange-400/20 bg-orange-500/5 ${clickable ? 'hover:bg-orange-500/10' : ''}`
        : `${base} border-sky-400/20 bg-sky-500/5`

  const content = (
    <>
      <KindIcon kind={event.kind} />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold text-zinc-100 truncate">
          {event.title}
          {event.kind === 'earnings' && event.meta.isEstimate && (
            <span className="ml-1 text-[9px] font-normal text-zinc-500 normal-case tracking-normal">
              est.
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          <span className="tabular-nums">{time}</span>
          {event.subtitle && (
            <>
              <span className="text-zinc-600">·</span>
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

function KindIcon({ kind }: { kind: CalendarEvent['kind'] }): JSX.Element {
  if (kind === 'earnings') {
    return (
      <svg
        className="w-3.5 h-3.5 flex-shrink-0 text-emerald-300"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 7h7v7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'game') {
    return (
      <svg
        className="w-3.5 h-3.5 flex-shrink-0 text-orange-300"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 12h17M12 3.5v17M5.5 5.5c4.5 3 9 3 13 0M5.5 18.5c4.5-3 9-3 13 0" />
      </svg>
    )
  }
  return (
    <svg
      className="w-3.5 h-3.5 flex-shrink-0 text-sky-300"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
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
  events: CalendarEvent[]
}

function groupByDay(events: CalendarEvent[]): DayGroup[] {
  const byKey = new Map<string, DayGroup>()
  for (const ev of events) {
    const d = new Date(ev.date)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
        monthDay: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        events: []
      })
    }
    byKey.get(key)!.events.push(ev)
  }
  return Array.from(byKey.values()).sort((a, b) => a.events[0].date - b.events[0].date)
}

function formatTime(unixMs: number): string {
  const d = new Date(unixMs)
  // If the time is midnight-ish, treat it as all-day.
  if (d.getHours() === 0 && d.getMinutes() === 0) return 'All day'
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
