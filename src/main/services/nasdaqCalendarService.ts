// Nasdaq's unofficial calendar JSON API.
// Endpoints (semi-public — no auth, returns JSON, but requires a browser-like
// User-Agent or we get a 403 / HTML error page):
//   IPOs (upcoming)       GET /api/ipo/calendar?date=YYYY-MM
//   Splits               GET /api/calendar/splits?date=YYYY-MM-DD
//   Economic events      GET /api/calendar/economicevents?date=YYYY-MM-DD
//
// Response shape is { data: { rows: [...] } } or similar — parsing is loose
// because Nasdaq occasionally changes field names between months. Every
// fetcher returns [] on any failure so the calendar composer can keep going.

const NASDAQ_BASE = 'https://api.nasdaq.com/api'
const FETCH_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 6 * 60 * 60_000
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

interface CacheEntry<T> {
  value: T
  fetchedAt: number
}

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS
}

async function fetchNasdaq<T>(url: string): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        // Nasdaq looks at origin; sending one that matches their own frontend
        // avoids intermittent 403s.
        Origin: 'https://www.nasdaq.com',
        Referer: 'https://www.nasdaq.com/'
      },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } catch (err) {
    console.warn('[nasdaq] fetch failed:', url, err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

function yearMonth(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function monthsCovered(fromMs: number, toMs: number): string[] {
  const months: string[] = []
  const start = new Date(fromMs)
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const end = new Date(toMs)
  while (cursor <= end) {
    months.push(yearMonth(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

function daysCovered(fromMs: number, toMs: number): string[] {
  const out: string[] = []
  const cursor = new Date(fromMs)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(toMs)
  while (cursor <= end) {
    out.push(ymd(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

// Nasdaq gives human-readable dates like "Jan 23, 2026" or "01/15/2026".
// Parse leniently — return null if unparseable so the caller can skip.
function parseDate(raw: string | undefined | null): number | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed === 'N/A') return null
  const t = Date.parse(trimmed)
  return Number.isFinite(t) ? t : null
}

// ---------- IPOs ----------

export interface UpcomingIpo {
  symbol: string
  companyName: string
  expectedDate: number
  priceRange: string | null
  sharesOffered: string | null
  dollarValue: string | null
}

interface NasdaqIpoResponse {
  data?: {
    upcoming?: {
      upcomingTable?: {
        rows?: Array<{
          dealID?: string
          proposedTickerSymbol?: string
          companyName?: string
          expectedPriceDate?: string
          proposedSharePrice?: string
          sharesOffered?: string
          dollarValueOfSharesOffered?: string
        }>
      }
    }
    priced?: {
      rows?: Array<{
        dealID?: string
        proposedTickerSymbol?: string
        companyName?: string
        pricedDate?: string
        proposedSharePrice?: string
        sharesOffered?: string
        dollarValueOfSharesOffered?: string
      }>
    }
  }
}

const ipoCache = new Map<string, CacheEntry<UpcomingIpo[]>>()

async function fetchIposForMonth(yearMonthKey: string): Promise<UpcomingIpo[]> {
  const cached = ipoCache.get(yearMonthKey)
  if (isFresh(cached)) return cached.value
  const json = await fetchNasdaq<NasdaqIpoResponse>(
    `${NASDAQ_BASE}/ipo/calendar?date=${yearMonthKey}`
  )
  const rows = json?.data?.upcoming?.upcomingTable?.rows ?? []
  const out: UpcomingIpo[] = []
  for (const row of rows) {
    const t = parseDate(row.expectedPriceDate)
    if (!t) continue
    out.push({
      symbol: (row.proposedTickerSymbol ?? '').trim().toUpperCase(),
      companyName: (row.companyName ?? '').trim(),
      expectedDate: t,
      priceRange: row.proposedSharePrice?.trim() || null,
      sharesOffered: row.sharesOffered?.trim() || null,
      dollarValue: row.dollarValueOfSharesOffered?.trim() || null
    })
  }
  ipoCache.set(yearMonthKey, { value: out, fetchedAt: Date.now() })
  return out
}

export async function getUpcomingIpos(fromMs: number, toMs: number): Promise<UpcomingIpo[]> {
  const months = monthsCovered(fromMs, toMs)
  const results = await Promise.all(months.map((m) => fetchIposForMonth(m)))
  const merged = results.flat()
  return merged.filter((i) => i.expectedDate >= fromMs && i.expectedDate <= toMs)
}

// ---------- Splits ----------

export interface UpcomingSplit {
  symbol: string
  companyName: string
  ratio: string
  executionDate: number
}

interface NasdaqSplitsResponse {
  data?: {
    rows?: Array<{
      symbol?: string
      name?: string
      ratio?: string
      payableDate?: string
      executionDate?: string
      announcedDate?: string
    }>
  }
}

const splitsCache = new Map<string, CacheEntry<UpcomingSplit[]>>()

async function fetchSplitsForDay(day: string): Promise<UpcomingSplit[]> {
  const cached = splitsCache.get(day)
  if (isFresh(cached)) return cached.value
  const json = await fetchNasdaq<NasdaqSplitsResponse>(
    `${NASDAQ_BASE}/calendar/splits?date=${day}`
  )
  const rows = json?.data?.rows ?? []
  const out: UpcomingSplit[] = []
  for (const row of rows) {
    const t = parseDate(row.executionDate ?? row.payableDate)
    if (!t) continue
    const sym = (row.symbol ?? '').trim().toUpperCase()
    if (!sym) continue
    out.push({
      symbol: sym,
      companyName: (row.name ?? '').trim(),
      ratio: (row.ratio ?? '').trim(),
      executionDate: t
    })
  }
  splitsCache.set(day, { value: out, fetchedAt: Date.now() })
  return out
}

export async function getUpcomingSplits(fromMs: number, toMs: number): Promise<UpcomingSplit[]> {
  const days = daysCovered(fromMs, toMs)
  const results = await Promise.all(days.map((d) => fetchSplitsForDay(d)))
  return results.flat().filter((s) => s.executionDate >= fromMs && s.executionDate <= toMs)
}

// ---------- Economic events (Fed + CPI/NFP/GDP etc.) ----------

export interface EconEvent {
  eventName: string
  date: number
  country: string | null
  consensus: string | null
  previous: string | null
  actual: string | null
}

interface NasdaqEconResponse {
  data?: {
    rows?: Array<{
      eventName?: string
      gmtTime?: string
      date?: string
      country?: string
      consensus?: string
      previous?: string
      actual?: string
    }>
  }
}

const econCache = new Map<string, CacheEntry<EconEvent[]>>()

async function fetchEconForDay(day: string): Promise<EconEvent[]> {
  const cached = econCache.get(day)
  if (isFresh(cached)) return cached.value
  const json = await fetchNasdaq<NasdaqEconResponse>(
    `${NASDAQ_BASE}/calendar/economicevents?date=${day}`
  )
  const rows = json?.data?.rows ?? []
  const out: EconEvent[] = []
  for (const row of rows) {
    const baseDate = parseDate(row.date)
    if (!baseDate) continue
    // Optionally fold gmtTime ("14:00") into the timestamp so the strip can
    // show a specific release time rather than midnight.
    let eventMs = baseDate
    if (row.gmtTime && /^\d{1,2}:\d{2}$/.test(row.gmtTime)) {
      const [h, m] = row.gmtTime.split(':').map((n) => Number(n))
      if (Number.isFinite(h) && Number.isFinite(m)) {
        const d = new Date(baseDate)
        d.setUTCHours(h, m, 0, 0)
        eventMs = d.getTime()
      }
    }
    out.push({
      eventName: (row.eventName ?? '').trim(),
      date: eventMs,
      country: (row.country ?? '').trim() || null,
      consensus: row.consensus?.trim() || null,
      previous: row.previous?.trim() || null,
      actual: row.actual?.trim() || null
    })
  }
  econCache.set(day, { value: out, fetchedAt: Date.now() })
  return out
}

export async function getEconEvents(fromMs: number, toMs: number): Promise<EconEvent[]> {
  const days = daysCovered(fromMs, toMs)
  const results = await Promise.all(days.map((d) => fetchEconForDay(d)))
  return results.flat().filter((e) => e.date >= fromMs && e.date <= toMs)
}

// Classifier — a rough split of the economic-events feed into "Fed" (FOMC
// rate decisions + related governor speeches) vs "macro releases" (CPI, NFP,
// GDP, retail sales, PCE, etc.). Intentionally conservative so fedMeetings
// stays low-noise even if Nasdaq includes chair speeches under the FOMC
// umbrella.
const FED_PATTERNS = [
  /FOMC/i,
  /Federal Open Market/i,
  /Fed (Chair|Chairman|Rate|Funds)/i,
  /Interest Rate Decision/i
]

const MACRO_PATTERNS = [
  /CPI/i,
  /Consumer Price/i,
  /PPI/i,
  /Producer Price/i,
  /Non[- ]?Farm Payrolls/i,
  /NFP/i,
  /Unemployment Rate/i,
  /Retail Sales/i,
  /GDP/i,
  /PCE/i,
  /Personal Consumption/i,
  /ISM/i,
  /Initial Jobless Claims/i,
  /Durable Goods/i
]

export function classifyEconEvent(name: string): 'fed' | 'macro' | 'other' {
  if (FED_PATTERNS.some((p) => p.test(name))) return 'fed'
  if (MACRO_PATTERNS.some((p) => p.test(name))) return 'macro'
  return 'other'
}
