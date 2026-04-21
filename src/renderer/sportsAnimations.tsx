import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Game } from '../preload'

export type ScoreSide = 'home' | 'away'

export interface ScoreEvent {
  key: string
  side: ScoreSide
  delta: number
  at: number
}

// Detects a positive score change between renders and returns a transient event
// that auto-clears after the animation window. First snapshot is discarded so we
// don't fire for scores that were already present when the view mounted.
const EVENT_LIFETIME_MS = 2500

export function useScoreEvent(game: Game): ScoreEvent | null {
  const [event, setEvent] = useState<ScoreEvent | null>(null)
  const prev = useRef<{ home: number | null; away: number | null } | null>(null)
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const home = game.home.score
    const away = game.away.score
    const prior = prev.current
    prev.current = { home, away }
    if (!prior) return
    if (game.status !== 'in_progress') return
    const homeDelta = (home ?? 0) - (prior.home ?? 0)
    const awayDelta = (away ?? 0) - (prior.away ?? 0)
    let fired: ScoreEvent | null = null
    if (homeDelta > 0) {
      fired = { key: `h-${Date.now()}`, side: 'home', delta: homeDelta, at: Date.now() }
    } else if (awayDelta > 0) {
      fired = { key: `a-${Date.now()}`, side: 'away', delta: awayDelta, at: Date.now() }
    }
    if (fired) {
      setEvent(fired)
      if (clearRef.current) clearTimeout(clearRef.current)
      clearRef.current = setTimeout(() => setEvent(null), EVENT_LIFETIME_MS)
    }
  }, [game.home.score, game.away.score, game.status])

  useEffect(() => {
    return () => {
      if (clearRef.current) clearTimeout(clearRef.current)
    }
  }, [])

  return event
}

// Polling cadence that speeds up during live play, slows down when idle, and
// fully pauses while the window is backgrounded. Returns the current interval
// in ms; pass the returned value into setInterval.
export function useAdaptiveInterval(options: {
  anyLive: boolean
  liveMs: number
  idleMs: number
  hiddenMs: number | null // null = pause entirely when hidden
}): number | null {
  const [visible, setVisible] = useState(() => {
    if (typeof document === 'undefined') return true
    return document.visibilityState !== 'hidden'
  })
  useEffect(() => {
    const onVis = (): void => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  if (!visible) return options.hiddenMs
  return options.anyLive ? options.liveMs : options.idleMs
}

// Fast static lookup so components that only know a leagueId can still render
// the right sport-specific animation without threading a league object.
const SPORT_BY_LEAGUE_ID: Record<string, string> = {
  nfl: 'American Football',
  nba: 'Basketball',
  mlb: 'Baseball',
  nhl: 'Hockey',
  ucl: 'Soccer',
  epl: 'Soccer',
  laliga: 'Soccer',
  seriea: 'Soccer',
  mls: 'Soccer'
}

export function sportForLeagueId(leagueId: string): string {
  return SPORT_BY_LEAGUE_ID[leagueId] ?? ''
}

// Sport-specific visual metadata. Keys are the `sport` field values from the
// league registry (see sportsService.ts). Any sport not in this map falls back
// to a neutral +N pill.
interface SportVisual {
  emoji: string
  accent: string // tailwind color classes for ring/bg
  label: (delta: number) => string
  hero?: boolean // soccer/hockey feel more celebratory, render a bigger banner
}

const SPORT_VISUALS: Record<string, SportVisual> = {
  Basketball: {
    emoji: '🏀',
    accent: 'bg-orange-500/25 ring-orange-400/50 text-orange-100',
    label: (d) => `+${d}`
  },
  'American Football': {
    emoji: '🏈',
    accent: 'bg-amber-500/25 ring-amber-400/50 text-amber-100',
    label: (d) => (d >= 6 ? 'TD' : d === 3 ? 'FG' : `+${d}`)
  },
  Baseball: {
    emoji: '⚾',
    accent: 'bg-red-500/25 ring-red-400/50 text-red-100',
    label: (d) => (d === 1 ? 'RUN' : `+${d}`),
    hero: true
  },
  Hockey: {
    emoji: '🚨',
    accent: 'bg-red-500/30 ring-red-400/60 text-red-50',
    label: () => 'GOAL',
    hero: true
  },
  Soccer: {
    emoji: '⚽',
    accent: 'bg-emerald-500/25 ring-emerald-400/50 text-emerald-50',
    label: () => 'GOAL',
    hero: true
  }
}

function visualFor(sport: string): SportVisual {
  return (
    SPORT_VISUALS[sport] ?? {
      emoji: '✨',
      accent: 'bg-accent/25 ring-accent/50 text-accent',
      label: (d) => `+${d}`
    }
  )
}

export type FlourishSize = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<FlourishSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-1',
  md: 'text-[12px] px-2 py-0.5 gap-1.5',
  lg: 'text-[16px] px-3 py-1 gap-2'
}

// Score flourish: a small pill that pops in, floats upward, and fades. The
// parent is responsible for positioning (usually `absolute` inside a relative
// container). Unmounting happens when the parent passes `event = null`.
// When `teamColor` is provided, the pill tints to that color instead of the
// sport's default accent (falls back to sport accent if color is null/invalid).
export function ScoreFlourish({
  event,
  sport,
  size = 'sm',
  teamColor
}: {
  event: ScoreEvent | null
  sport: string
  size?: FlourishSize
  teamColor?: string | null
}): JSX.Element | null {
  if (!event) return null
  const visual = visualFor(sport)
  const label = visual.label(event.delta)
  const heroBurst = visual.hero && size !== 'sm'
  const tint = teamColor ? teamTintStyle(teamColor) : null
  return (
    <span
      key={event.key}
      aria-hidden
      style={tint ?? undefined}
      className={`score-flourish pointer-events-none inline-flex items-center font-bold uppercase tracking-[0.18em] rounded-full ring-1 ring-inset ${tint ? '' : visual.accent} ${SIZE_CLASSES[size]} ${heroBurst ? 'score-flourish-hero' : ''}`}
    >
      <span className="score-flourish-emoji leading-none">{visual.emoji}</span>
      <span className="leading-none tabular-nums">{label}</span>
    </span>
  )
}

// Build an inline style that expresses the team color as a tinted background
// + ring + readable text. We pick white text for dark team colors and near-black
// for light ones so the label stays legible against any team palette.
function teamTintStyle(hex: string): CSSProperties | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const { r, g, b } = rgb
  // Perceived luminance (Rec. 709) — threshold picked empirically so that
  // e.g. Lakers purple/Celtics green read as "dark" and Dodgers blue edges in.
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const text = luminance < 0.55 ? '#ffffff' : '#0a0a0a'
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.7)`,
    boxShadow: `inset 0 0 0 1px rgba(${r}, ${g}, ${b}, 0.9)`,
    color: text
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const t = hex.replace(/^#/, '')
  if (t.length === 3) {
    const r = parseInt(t[0] + t[0], 16)
    const g = parseInt(t[1] + t[1], 16)
    const b = parseInt(t[2] + t[2], 16)
    return Number.isNaN(r + g + b) ? null : { r, g, b }
  }
  if (t.length === 6 || t.length === 8) {
    const r = parseInt(t.slice(0, 2), 16)
    const g = parseInt(t.slice(2, 4), 16)
    const b = parseInt(t.slice(4, 6), 16)
    return Number.isNaN(r + g + b) ? null : { r, g, b }
  }
  return null
}
