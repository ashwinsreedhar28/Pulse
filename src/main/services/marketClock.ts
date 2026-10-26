// US equity session calendar in America/New_York, for deciding which daily bar
// is complete and whether a forecast was made before its target session opened.
// Holidays: NYSE full-day closes 2026-2027 (weekends are derived).
const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03',
  '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05',
  '2027-09-06', '2027-11-25', '2027-12-24'
])
// A daily bar is treated as final from 17:00 ET (Nasdaq posts it after the close).
export const BAR_FINAL_MINUTES = 17 * 60
const OPEN_MINUTES = 9 * 60 + 30

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

export function etParts(ms: number): { day: string; minutes: number } {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function isTradingDay(day: string): boolean {
  const g = new Date(`${day}T00:00:00Z`).getUTCDay()
  return g !== 0 && g !== 6 && !HOLIDAYS.has(day)
}

export function nextTradingDay(after: string): string {
  let d = addDays(after, 1)
  while (!isTradingDay(d)) d = addDays(d, 1)
  return d
}

export function prevTradingDay(before: string): string {
  let d = addDays(before, -1)
  while (!isTradingDay(d)) d = addDays(d, -1)
  return d
}

// The most recent session whose daily bar should be final now.
export function lastCompletedSession(now = Date.now()): string {
  const { day, minutes } = etParts(now)
  return isTradingDay(day) && minutes >= BAR_FINAL_MINUTES ? day : prevTradingDay(day)
}

// True between 09:30 and 17:00 ET on a trading day: a forecast made now for
// "the next session" would be made after that session opened.
export function inSession(now = Date.now()): boolean {
  const { day, minutes } = etParts(now)
  return isTradingDay(day) && minutes >= OPEN_MINUTES && minutes < BAR_FINAL_MINUTES
}

// UTC ms of a wall-clock time in New York on `day`.
export function etWallToUtc(day: string, h: number, m: number): number {
  const [y, mo, d] = day.split('-').map(Number)
  const naive = Date.UTC(y, mo - 1, d, h, m)
  for (const offsetH of [4, 5]) {
    const cand = naive + offsetH * 3600_000
    const p = etParts(cand)
    if (p.day === day && p.minutes === h * 60 + m) return cand
  }
  return naive + 5 * 3600_000
}

export function sessionOpenMs(day: string): number {
  return etWallToUtc(day, 9, 30)
}
