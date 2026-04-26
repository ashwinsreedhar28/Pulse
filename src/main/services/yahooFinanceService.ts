// Historical price series via Yahoo Finance's free chart JSON endpoint.
// Doc (unofficial): GET /v8/finance/chart/{SYMBOL}?interval=...&range=...
// Returns timestamp[] + indicators.quote[0].close[] — we map those to {t, v} points.

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/'
const YAHOO_QUOTE_SUMMARY = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/'
const YAHOO_OPTIONS_BASE = 'https://query1.finance.yahoo.com/v7/finance/options/'
const YAHOO_SEARCH_BASE = 'https://query1.finance.yahoo.com/v1/finance/search'
const YAHOO_CRUMB_URL = 'https://query2.finance.yahoo.com/v1/test/getcrumb'
const YAHOO_CONSENT_URL = 'https://fc.yahoo.com/'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const FETCH_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 5 * 60_000
const FUNDAMENTALS_TTL_MS = 30 * 60_000
const EARNINGS_TTL_MS = 24 * 60 * 60_000
const OPTIONS_TTL_MS = 15 * 60_000 // intraday — refresh frequently enough to follow the day

// Yahoo's v10 quoteSummary endpoint has required a crumb + cookie auth dance
// since 2023. Without it, every request returns HTTP 401. We do a one-time
// handshake against fc.yahoo.com (issues the A1/A3 cookies) then GET
// /v1/test/getcrumb to pair with them, and reuse both until a 401 forces a
// refresh.
let yahooCookie: string | null = null
let yahooCrumb: string | null = null
let credsPromise: Promise<boolean> | null = null

async function ensureYahooCreds(force = false): Promise<boolean> {
  if (!force && yahooCookie && yahooCrumb) return true
  if (credsPromise) return credsPromise
  credsPromise = (async () => {
    try {
      const consentRes = await fetch(YAHOO_CONSENT_URL, {
        headers: { 'User-Agent': UA, Accept: 'text/html' }
      })
      const rawSetCookie =
        // Node 20+ fetch exposes getSetCookie via the Undici headers
        (consentRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
        [consentRes.headers.get('set-cookie')].filter(Boolean) as string[]
      const cookie = rawSetCookie
        .map((c) => c.split(';')[0]!)
        .filter(Boolean)
        .join('; ')
      if (!cookie) return false
      const crumbRes = await fetch(YAHOO_CRUMB_URL, {
        headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'text/plain' }
      })
      if (!crumbRes.ok) return false
      const crumb = (await crumbRes.text()).trim()
      if (!crumb) return false
      yahooCookie = cookie
      yahooCrumb = crumb
      return true
    } catch {
      return false
    } finally {
      credsPromise = null
    }
  })()
  return credsPromise
}

export type HistoryRange = '1D' | '5D' | '1W' | '1M' | '3M' | '1Y' | '5Y' | 'MAX'

export interface HistoryPoint {
  t: number // unix ms
  v: number // close price (or regularMarketPrice)
}

const RANGE_PARAMS: Record<HistoryRange, { interval: string; range: string }> = {
  '1D': { interval: '5m', range: '1d' },
  '5D': { interval: '30m', range: '5d' },
  '1W': { interval: '30m', range: '5d' },
  '1M': { interval: '1d', range: '1mo' },
  '3M': { interval: '1d', range: '3mo' },
  '1Y': { interval: '1d', range: '1y' },
  '5Y': { interval: '1wk', range: '5y' },
  MAX: { interval: '1mo', range: 'max' }
}

interface CacheEntry {
  points: HistoryPoint[]
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

interface YahooChartResponse {
  chart: {
    result:
      | Array<{
          timestamp?: number[]
          indicators?: { quote?: Array<{ close?: Array<number | null> }> }
        }>
      | null
    error: { code?: string; description?: string } | null
  }
}

export async function getHistory(symbol: string, range: HistoryRange): Promise<HistoryPoint[]> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return []
  const cacheKey = `${sym}:${range}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.points
  }

  const params = RANGE_PARAMS[range]
  const url = `${YAHOO_BASE}${encodeURIComponent(sym)}?interval=${params.interval}&range=${params.range}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let json: YahooChartResponse
  try {
    const res = await fetch(url, {
      headers: {
        // Yahoo blocks obvious bot UAs; a common browser UA works fine and
        // they expect a standard Accept.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        Accept: 'application/json'
      },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    json = (await res.json()) as YahooChartResponse
  } catch (err) {
    console.warn('[yahoo] history fetch failed:', err instanceof Error ? err.message : err)
    return cached?.points ?? []
  } finally {
    clearTimeout(timer)
  }

  const result = json.chart.result?.[0]
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
    return cached?.points ?? []
  }

  const ts = result.timestamp
  const closes = result.indicators.quote[0].close!
  const points: HistoryPoint[] = []
  for (let i = 0; i < ts.length; i++) {
    const v = closes[i]
    if (v === null || v === undefined || !Number.isFinite(v)) continue
    points.push({ t: ts[i] * 1000, v })
  }
  cache.set(cacheKey, { points, fetchedAt: Date.now() })
  return points
}

export interface Fundamentals {
  peRatio: number | null
  forwardPE: number | null
  eps: number | null
  marketCap: number | null
  dividendYield: number | null
  weekHigh52: number | null
  weekLow52: number | null
  currency: string | null
  fetchedAt: number
}

interface FundamentalsCacheEntry {
  value: Fundamentals
}

const fundamentalsCache = new Map<string, FundamentalsCacheEntry>()

interface RawField {
  raw?: number
  fmt?: string
}

interface QuoteSummaryResponse {
  quoteSummary: {
    result:
      | Array<{
          summaryDetail?: {
            trailingPE?: RawField
            forwardPE?: RawField
            dividendYield?: RawField
            marketCap?: RawField
            fiftyTwoWeekHigh?: RawField
            fiftyTwoWeekLow?: RawField
            currency?: string
          }
          defaultKeyStatistics?: {
            trailingEps?: RawField
            forwardEps?: RawField
          }
          price?: {
            marketCap?: RawField
            currency?: string
          }
        }>
      | null
    error: { code?: string; description?: string } | null
  }
}

function raw(field: RawField | undefined): number | null {
  if (!field || typeof field.raw !== 'number' || !Number.isFinite(field.raw)) return null
  return field.raw
}

// Cache-only accessor — never fetches, never blocks. Returns whatever's
// already in the in-memory fundamentals cache for this symbol, even if
// expired (consumer can decide whether stale-data is acceptable).
// Used by alert evaluators that run on every stocksScheduler tick — a
// real fetch in that hot path would burn the Yahoo crumb budget against
// 52w-touch checks for the entire watchlist every 30 minutes.
export function peekFundamentals(symbol: string): Fundamentals | null {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return null
  return fundamentalsCache.get(sym)?.value ?? null
}

export async function getFundamentals(symbol: string): Promise<Fundamentals | null> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return null
  const cached = fundamentalsCache.get(sym)
  if (cached && Date.now() - cached.value.fetchedAt < FUNDAMENTALS_TTL_MS) {
    return cached.value
  }

  const modules = 'summaryDetail,defaultKeyStatistics,price'
  const fetchOnce = async (): Promise<QuoteSummaryResponse> => {
    const ok = await ensureYahooCreds()
    if (!ok || !yahooCrumb || !yahooCookie) throw new Error('no-creds')
    const url = `${YAHOO_QUOTE_SUMMARY}${encodeURIComponent(sym)}?modules=${modules}&crumb=${encodeURIComponent(yahooCrumb)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Cookie: yahooCookie,
          Accept: 'application/json'
        },
        signal: controller.signal
      })
      if (res.status === 401) {
        // Crumb expired — wipe and let caller retry.
        yahooCookie = null
        yahooCrumb = null
        throw new Error('HTTP 401')
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as QuoteSummaryResponse
    } finally {
      clearTimeout(timer)
    }
  }

  let json: QuoteSummaryResponse
  try {
    json = await fetchOnce()
  } catch (err) {
    // One retry after a credential refresh — the crumb/cookie pair rotates.
    if (err instanceof Error && err.message === 'HTTP 401') {
      try {
        await ensureYahooCreds(true)
        json = await fetchOnce()
      } catch (err2) {
        console.warn(
          '[yahoo] fundamentals fetch failed:',
          err2 instanceof Error ? err2.message : err2
        )
        return cached?.value ?? null
      }
    } else {
      console.warn('[yahoo] fundamentals fetch failed:', err instanceof Error ? err.message : err)
      return cached?.value ?? null
    }
  }

  const result = json.quoteSummary.result?.[0]
  if (!result) return cached?.value ?? null

  const sd = result.summaryDetail
  const ks = result.defaultKeyStatistics
  const price = result.price
  const value: Fundamentals = {
    peRatio: raw(sd?.trailingPE),
    forwardPE: raw(sd?.forwardPE),
    eps: raw(ks?.trailingEps) ?? raw(ks?.forwardEps),
    marketCap: raw(sd?.marketCap) ?? raw(price?.marketCap),
    dividendYield: raw(sd?.dividendYield),
    weekHigh52: raw(sd?.fiftyTwoWeekHigh),
    weekLow52: raw(sd?.fiftyTwoWeekLow),
    currency: price?.currency ?? sd?.currency ?? null,
    fetchedAt: Date.now()
  }
  fundamentalsCache.set(sym, { value })
  return value
}

// Quarterly cashflow + income statements. Pulled from the same quoteSummary
// endpoint as fundamentals, using the cashflowStatementHistoryQuarterly and
// incomeStatementHistoryQuarterly modules. Yahoo returns up to 4 quarters
// per module; we align them on endDate and hand back whatever overlaps.
//
// Source of truth for the value-chain "cash flow" overlay — a separate
// refresh cadence (daily-ish) lives in financialsService since these numbers
// only change on earnings.
export interface QuarterlyFinancialPoint {
  endDate: number // unix ms
  // 'Q' for quarterly statements, 'A' when Yahoo only has annual data for
  // this ticker (typical for many non-US ADRs). Caller persists this on
  // the row so computeSnapshot in financialsService knows which cadence
  // it's reading.
  periodType: 'Q' | 'A'
  revenue: number | null
  netIncome: number | null
  grossProfit: number | null
  operatingCashFlow: number | null
  capex: number | null // raw (negative in Yahoo's convention)
  freeCashFlow: number | null // direct from Yahoo when provided
  currency: string | null
}

// Yahoo's fundamentals-timeseries endpoint returns each statement field as
// its own series (one "quarterlyFreeCashFlow" series, one "quarterlyTotal-
// Revenue" series, etc.) keyed by the series `type`. Each row carries an
// asOfDate (YYYY-MM-DD) + reportedValue.raw. No crumb required — it's
// served anonymously at query2. We moved to this from the quoteSummary
// module dance because (a) timeseries delivers 8+ quarters of history
// instead of the 4 quoteSummary caps at, and (b) the cashflow module was
// intermittently returning empty rows for perfectly normal tickers (KLAC,
// AMAT, ONTO), leaving every FCF metric blank on the peer-compare view.
const YAHOO_TIMESERIES_BASE =
  'https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/'

interface TimeseriesCell {
  asOfDate?: string
  reportedValue?: { raw?: number }
  currencyCode?: string
}

interface TimeseriesResponse {
  timeseries: {
    result:
      | Array<
          {
            meta?: { type?: string[]; symbol?: string[] }
            timestamp?: number[]
          } & Record<string, unknown>
        >
      | null
    error: { code?: string; description?: string } | null
  }
}

// Parse "YYYY-MM-DD" into unix ms at UTC midnight. Yahoo's asOfDate is a
// plain ISO date — safe to Date.UTC across all timezones.
function parseIsoDate(raw: string | undefined): number | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isFinite(ms) ? ms : null
}

// Shared timeseries fetch + parse for either quarterly or annual cadence.
// Yahoo encodes both with the same response shape — the only difference
// is the field-name prefix ("quarterly*" vs "annual*"). Returns the
// parsed points + a flag for whether the response had any data.
async function fetchTimeseriesPoints(
  symbol: string,
  cadence: 'Q' | 'A'
): Promise<QuarterlyFinancialPoint[]> {
  const prefix = cadence === 'Q' ? 'quarterly' : 'annual'
  const types = [
    `${prefix}TotalRevenue`,
    `${prefix}OperatingCashFlow`,
    `${prefix}CapitalExpenditure`,
    `${prefix}FreeCashFlow`,
    `${prefix}NetIncome`,
    `${prefix}GrossProfit`
  ].join(',')
  const nowSec = Math.floor(Date.now() / 1000)
  const url =
    `${YAHOO_TIMESERIES_BASE}${encodeURIComponent(symbol)}?type=${types}` +
    `&period1=0&period2=${nowSec}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let json: TimeseriesResponse
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) {
      if (res.status === 404) return []
      throw new Error(`HTTP ${res.status}`)
    }
    json = (await res.json()) as TimeseriesResponse
  } catch (err) {
    console.warn(
      `[yahoo] ${prefix} timeseries fetch failed:`,
      err instanceof Error ? err.message : err
    )
    return []
  } finally {
    clearTimeout(timer)
  }

  const series = json.timeseries.result ?? []
  if (series.length === 0) return []

  // One bucket per period-end date. As each series streams in we patch its
  // field onto the bucket keyed by endDate — Yahoo aligns them perfectly so
  // a union join is enough without any fuzzy date matching.
  const byEnd = new Map<number, QuarterlyFinancialPoint>()
  let currency: string | null = null

  const fieldMap: Record<string, keyof QuarterlyFinancialPoint> = {
    [`${prefix}TotalRevenue`]: 'revenue',
    [`${prefix}OperatingCashFlow`]: 'operatingCashFlow',
    [`${prefix}CapitalExpenditure`]: 'capex',
    [`${prefix}FreeCashFlow`]: 'freeCashFlow',
    [`${prefix}NetIncome`]: 'netIncome',
    [`${prefix}GrossProfit`]: 'grossProfit'
  }

  for (const s of series) {
    const type = s.meta?.type?.[0]
    if (!type) continue
    const field = fieldMap[type]
    if (!field) continue
    const cells = (s as unknown as Record<string, TimeseriesCell[] | undefined>)[type]
    if (!Array.isArray(cells)) continue
    for (const cell of cells) {
      if (!cell) continue
      const endDate = parseIsoDate(cell.asOfDate)
      if (endDate === null) continue
      const value =
        typeof cell.reportedValue?.raw === 'number' && Number.isFinite(cell.reportedValue.raw)
          ? cell.reportedValue.raw
          : null
      if (cell.currencyCode && !currency) currency = cell.currencyCode
      let point = byEnd.get(endDate)
      if (!point) {
        point = {
          endDate,
          periodType: cadence,
          revenue: null,
          netIncome: null,
          grossProfit: null,
          operatingCashFlow: null,
          capex: null,
          freeCashFlow: null,
          currency: null
        }
        byEnd.set(endDate, point)
      }
      ;(point as unknown as Record<string, number | null>)[field] = value
    }
  }

  // Derive FCF = OCF + capex when Yahoo ships one but not the other. Yahoo's
  // convention has capex as a negative number, so adding it already subtracts
  // the outflow from OCF — no sign flip needed.
  for (const point of byEnd.values()) {
    if (point.freeCashFlow === null && point.operatingCashFlow !== null && point.capex !== null) {
      point.freeCashFlow = point.operatingCashFlow + point.capex
    }
    point.currency = currency
  }

  return [...byEnd.values()].sort((a, b) => b.endDate - a.endDate)
}

export async function getQuarterlyFinancials(
  symbol: string
): Promise<QuarterlyFinancialPoint[]> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return []

  const quarterly = await fetchTimeseriesPoints(sym, 'Q')
  if (quarterly.length > 0) return quarterly

  // Quarterly empty — Yahoo doesn't carry sub-annual statements for this
  // ticker (common for non-US ADRs like Japanese 6857/ATEYY where only
  // full-year data is filed). Fall back to annual so the FCF/revenue
  // tiles still light up. Caller will see periodType='A' on the rows
  // and relabel "Last 8 quarters" → "Last 4 years" in the UI.
  const annual = await fetchTimeseriesPoints(sym, 'A')
  if (annual.length > 0) {
    console.log(
      `[yahoo] ${sym}: no quarterly statements available, using annual fallback (${annual.length} years)`
    )
  }
  return annual
}

export interface EarningsCalendar {
  symbol: string
  // Unix ms of the earliest upcoming earnings date Yahoo lists for this symbol,
  // or null if none is scheduled. Yahoo returns estimate windows as arrays of
  // two timestamps (start/end) — when `isEstimate` is true, `nextDate` is the
  // start of that window and the actual date is still unconfirmed.
  nextDate: number | null
  isEstimate: boolean
  // Ex-dividend date — day before which the stock must be held to receive the
  // next dividend. Pulled from the same Yahoo calendarEvents module as
  // earnings, so we return it alongside for "one call, both dates".
  exDividendDate: number | null
  fetchedAt: number
}

interface EarningsCacheEntry {
  value: EarningsCalendar
}

const earningsCache = new Map<string, EarningsCacheEntry>()

// A 404 from quoteSummary means the symbol isn't (or is no longer) a public
// ticker — delisting, acquisition, placeholder for a private competitor in
// the graph, etc. We cache a null-shaped EarningsCalendar under the standard
// TTL so the ValueChain overlay doesn't re-hit Yahoo for every mount.
function tombstoneEarnings(symbol: string): EarningsCalendar {
  const value: EarningsCalendar = {
    symbol,
    nextDate: null,
    isEstimate: false,
    exDividendDate: null,
    fetchedAt: Date.now()
  }
  earningsCache.set(symbol, { value })
  return value
}

interface CalendarEventsResponse {
  quoteSummary: {
    result:
      | Array<{
          calendarEvents?: {
            earnings?: {
              earningsDate?: Array<RawField | { raw?: number; fmt?: string }>
            }
            exDividendDate?: RawField
            dividendDate?: RawField
          }
        }>
      | null
    error: { code?: string; description?: string } | null
  }
}

export async function getEarnings(symbol: string): Promise<EarningsCalendar | null> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return null
  const cached = earningsCache.get(sym)
  if (cached && Date.now() - cached.value.fetchedAt < EARNINGS_TTL_MS) {
    return cached.value
  }

  const modules = 'calendarEvents'
  const fetchOnce = async (): Promise<CalendarEventsResponse> => {
    const ok = await ensureYahooCreds()
    if (!ok || !yahooCrumb || !yahooCookie) throw new Error('no-creds')
    const url = `${YAHOO_QUOTE_SUMMARY}${encodeURIComponent(sym)}?modules=${modules}&crumb=${encodeURIComponent(yahooCrumb)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Cookie: yahooCookie, Accept: 'application/json' },
        signal: controller.signal
      })
      if (res.status === 401) {
        yahooCookie = null
        yahooCrumb = null
        throw new Error('HTTP 401')
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as CalendarEventsResponse
    } finally {
      clearTimeout(timer)
    }
  }

  let json: CalendarEventsResponse
  try {
    json = await fetchOnce()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'HTTP 401') {
      try {
        await ensureYahooCreds(true)
        json = await fetchOnce()
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2)
        if (msg2 === 'HTTP 404') {
          return tombstoneEarnings(sym)
        }
        console.warn('[yahoo] earnings fetch failed:', msg2)
        return cached?.value ?? null
      }
    } else if (msg === 'HTTP 404') {
      // Delisted / merged / private — Yahoo has no row for this symbol.
      // Tombstone it so ValueChain doesn't re-hammer quoteSummary on every
      // mount; JNPR post-HPE acquisition is the canonical example here.
      return tombstoneEarnings(sym)
    } else {
      console.warn('[yahoo] earnings fetch failed:', msg)
      return cached?.value ?? null
    }
  }

  const calendarEvents = json.quoteSummary.result?.[0]?.calendarEvents
  const dates = calendarEvents?.earnings?.earningsDate ?? []
  const now = Date.now()
  let nextUnixMs: number | null = null
  for (const entry of dates) {
    const r = (entry as RawField).raw
    if (typeof r !== 'number' || !Number.isFinite(r)) continue
    const ms = r * 1000
    if (ms < now) continue
    if (nextUnixMs === null || ms < nextUnixMs) nextUnixMs = ms
  }
  // Yahoo returns a 2-element array when the date is still an estimate window.
  const isEstimate = dates.length > 1

  const exDivRaw = calendarEvents?.exDividendDate?.raw
  const exDividendMs =
    typeof exDivRaw === 'number' && Number.isFinite(exDivRaw) && exDivRaw * 1000 >= now
      ? exDivRaw * 1000
      : null

  const value: EarningsCalendar = {
    symbol: sym,
    nextDate: nextUnixMs,
    isEstimate,
    exDividendDate: exDividendMs,
    fetchedAt: Date.now()
  }
  earningsCache.set(sym, { value })
  return value
}

// Quarterly earnings beat/miss history — Yahoo's earningsHistory module
// returns the last ~4 reported quarters with actual vs estimate EPS and a
// precomputed surprise percentage. We keep raw actual/estimate too so the
// renderer can re-derive the delta or surface the absolute EPS if it wants
// to, and expose `quarter` (unix ms of the period end) for ordering +
// join-by-date with the local financials table.
export interface EarningsQuarterResult {
  quarter: number // unix ms of quarter-end
  period: string // Yahoo's "-1q", "-2q", ... tag — preserved for debugging
  epsActual: number | null
  epsEstimate: number | null
  // Yahoo's surprise % comes as a decimal ratio (0.05 = +5%), which matches
  // our other ratio fields (fcfMargin, qoq, yoy). Null when Yahoo didn't
  // include a surprise for the quarter (often the oldest entry).
  surprisePct: number | null
}

export interface EarningsHistory {
  symbol: string
  quarters: EarningsQuarterResult[] // most-recent first
  fetchedAt: number
}

interface EarningsHistoryCacheEntry {
  value: EarningsHistory
}

const earningsHistoryCache = new Map<string, EarningsHistoryCacheEntry>()

interface EarningsHistoryResponse {
  quoteSummary: {
    result:
      | Array<{
          earningsHistory?: {
            history?: Array<{
              epsActual?: RawField
              epsEstimate?: RawField
              epsDifference?: RawField
              surprisePercent?: RawField
              quarter?: RawField
              period?: string
            }>
          }
        }>
      | null
    error: { code?: string; description?: string } | null
  }
}

function tombstoneEarningsHistory(symbol: string): EarningsHistory {
  const value: EarningsHistory = {
    symbol,
    quarters: [],
    fetchedAt: Date.now()
  }
  earningsHistoryCache.set(symbol, { value })
  return value
}

export async function getEarningsHistory(symbol: string): Promise<EarningsHistory | null> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return null
  const cached = earningsHistoryCache.get(sym)
  if (cached && Date.now() - cached.value.fetchedAt < EARNINGS_TTL_MS) {
    return cached.value
  }

  const modules = 'earningsHistory'
  const fetchOnce = async (): Promise<EarningsHistoryResponse> => {
    const ok = await ensureYahooCreds()
    if (!ok || !yahooCrumb || !yahooCookie) throw new Error('no-creds')
    const url = `${YAHOO_QUOTE_SUMMARY}${encodeURIComponent(sym)}?modules=${modules}&crumb=${encodeURIComponent(yahooCrumb)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Cookie: yahooCookie, Accept: 'application/json' },
        signal: controller.signal
      })
      if (res.status === 401) {
        yahooCookie = null
        yahooCrumb = null
        throw new Error('HTTP 401')
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as EarningsHistoryResponse
    } finally {
      clearTimeout(timer)
    }
  }

  let json: EarningsHistoryResponse
  try {
    json = await fetchOnce()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'HTTP 401') {
      try {
        await ensureYahooCreds(true)
        json = await fetchOnce()
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2)
        if (msg2 === 'HTTP 404') return tombstoneEarningsHistory(sym)
        console.warn('[yahoo] earnings history fetch failed:', msg2)
        return cached?.value ?? null
      }
    } else if (msg === 'HTTP 404') {
      return tombstoneEarningsHistory(sym)
    } else {
      console.warn('[yahoo] earnings history fetch failed:', msg)
      return cached?.value ?? null
    }
  }

  const rows = json.quoteSummary.result?.[0]?.earningsHistory?.history ?? []
  const quarters: EarningsQuarterResult[] = []
  for (const row of rows) {
    const qRaw = row.quarter?.raw
    if (typeof qRaw !== 'number' || !Number.isFinite(qRaw)) continue
    quarters.push({
      quarter: qRaw * 1000,
      period: row.period ?? '',
      epsActual: raw(row.epsActual),
      epsEstimate: raw(row.epsEstimate),
      surprisePct: raw(row.surprisePercent)
    })
  }
  quarters.sort((a, b) => b.quarter - a.quarter)

  const value: EarningsHistory = {
    symbol: sym,
    quarters,
    fetchedAt: Date.now()
  }
  earningsHistoryCache.set(sym, { value })
  return value
}

// Forward-looking analyst consensus: price targets, forward EPS estimates
// per period, broker recommendation split, and a 30-day upgrade/downgrade
// tally. Bundles four quoteSummary modules into one call so the UI can show
// "Next Q est: $X · PT $Y (N analysts)" on a single row. Caching through
// the shared 24h TTL since analyst activity isn't high-frequency.
export interface EstimatePeriod {
  avg: number | null
  high: number | null
  low: number | null
  count: number | null
}

export interface RecommendationSplit {
  strongBuy: number
  buy: number
  hold: number
  sell: number
  strongSell: number
}

export interface AnalystEstimates {
  symbol: string
  // Forward EPS estimates, keyed by the period Yahoo reports. We surface the
  // next-quarter and full-year slots directly (the rest are ignored for now).
  nextQuarter: EstimatePeriod | null
  currentYear: EstimatePeriod | null
  nextYear: EstimatePeriod | null
  // Price targets.
  targetMean: number | null
  targetHigh: number | null
  targetLow: number | null
  targetMedian: number | null
  analystCount: number | null
  // 1.0 = strong buy, 5.0 = strong sell (Yahoo's scale).
  recommendationMean: number | null
  recommendationKey: string | null // 'buy' | 'hold' | 'strong_buy' | 'sell' | 'underperform' | 'none'
  // Most-recent broker split snapshot. Null when Yahoo returns no trend data.
  consensus: RecommendationSplit | null
  // 30d action tally across all firms Yahoo tracks. Great for the
  // "net upgrades this month" micro-signal on the focus panel.
  upgradesLast30d: number
  downgradesLast30d: number
  fetchedAt: number
}

interface EstimatesCacheEntry {
  value: AnalystEstimates
  // Raw upgrade/downgrade history rows from this fetch (most-recent first
  // when Yahoo orders them that way; we don't sort here). Used by the
  // analyst-alerts dispatcher to detect new entries since the last
  // refresh and fire OS notifications. Kept transient (not persisted) —
  // dedup of "have we already alerted on this entry?" lives in the
  // notification_log keyed by (symbol, date, firm, action).
  upgradeHistory: AnalystGradeChange[]
}

// Single grade-change event from Yahoo's upgradeDowngradeHistory module.
// All fields nullable because Yahoo occasionally omits one or two on a
// row (typically fromGrade for an "init" action).
export interface AnalystGradeChange {
  firm: string | null
  toGrade: string | null
  fromGrade: string | null
  // 'up' | 'down' | 'main' | 'init' | 'reit' (re-iterate). Used to color
  // the alert and decide importance — only 'up' / 'down' notify by default.
  action: string | null
  // Unix seconds; the timestamp Yahoo records for the call. Often 9–10am
  // ET on the morning the analyst note dropped.
  epochGradeDate: number | null
}

const estimatesCache = new Map<string, EstimatesCacheEntry>()

// Public helper for the analyst-alerts dispatcher. Returns whatever
// upgradeHistory was attached to the most recent estimates fetch for the
// symbol. Empty array when never fetched. Caller filters by recency and
// action — we don't filter here so the cache stays neutral.
export function getRecentAnalystChanges(symbol: string): AnalystGradeChange[] {
  const cached = estimatesCache.get(symbol.trim().toUpperCase())
  return cached?.upgradeHistory ?? []
}

function tombstoneEstimates(symbol: string): AnalystEstimates {
  const value: AnalystEstimates = {
    symbol,
    nextQuarter: null,
    currentYear: null,
    nextYear: null,
    targetMean: null,
    targetHigh: null,
    targetLow: null,
    targetMedian: null,
    analystCount: null,
    recommendationMean: null,
    recommendationKey: null,
    consensus: null,
    upgradesLast30d: 0,
    downgradesLast30d: 0,
    fetchedAt: Date.now()
  }
  estimatesCache.set(symbol, { value, upgradeHistory: [] })
  return value
}

interface AnalystEstimatesResponse {
  quoteSummary: {
    result:
      | Array<{
          financialData?: {
            targetMeanPrice?: RawField
            targetHighPrice?: RawField
            targetLowPrice?: RawField
            targetMedianPrice?: RawField
            numberOfAnalystOpinions?: RawField
            recommendationMean?: RawField
            recommendationKey?: string
          }
          earningsTrend?: {
            trend?: Array<{
              period?: string // '0q' '+1q' '0y' '+1y' '+5y'
              earningsEstimate?: {
                avg?: RawField
                high?: RawField
                low?: RawField
                numberOfAnalysts?: RawField
              }
            }>
          }
          recommendationTrend?: {
            trend?: Array<{
              period?: string // '0m' '-1m' '-2m' '-3m'
              strongBuy?: number
              buy?: number
              hold?: number
              sell?: number
              strongSell?: number
            }>
          }
          upgradeDowngradeHistory?: {
            history?: Array<{
              firm?: string
              toGrade?: string
              fromGrade?: string
              action?: string // 'up' 'down' 'main' 'init' 'reit'
              epochGradeDate?: number // unix seconds
            }>
          }
        }>
      | null
    error: { code?: string; description?: string } | null
  }
}

interface EarningsTrendEntry {
  period?: string
  earningsEstimate?: {
    avg?: RawField
    high?: RawField
    low?: RawField
    numberOfAnalysts?: RawField
  }
}

function pickPeriod(
  trend: EarningsTrendEntry[] | undefined,
  period: string
): EstimatePeriod | null {
  const entry = trend?.find((t) => t.period === period)
  if (!entry?.earningsEstimate) return null
  const est = entry.earningsEstimate
  return {
    avg: raw(est.avg),
    high: raw(est.high),
    low: raw(est.low),
    count: raw(est.numberOfAnalysts)
  }
}

export async function getAnalystEstimates(symbol: string): Promise<AnalystEstimates | null> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return null
  const cached = estimatesCache.get(sym)
  if (cached && Date.now() - cached.value.fetchedAt < EARNINGS_TTL_MS) {
    return cached.value
  }

  const modules = 'financialData,earningsTrend,recommendationTrend,upgradeDowngradeHistory'
  const fetchOnce = async (): Promise<AnalystEstimatesResponse> => {
    const ok = await ensureYahooCreds()
    if (!ok || !yahooCrumb || !yahooCookie) throw new Error('no-creds')
    const url = `${YAHOO_QUOTE_SUMMARY}${encodeURIComponent(sym)}?modules=${modules}&crumb=${encodeURIComponent(yahooCrumb)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Cookie: yahooCookie, Accept: 'application/json' },
        signal: controller.signal
      })
      if (res.status === 401) {
        yahooCookie = null
        yahooCrumb = null
        throw new Error('HTTP 401')
      }
      if (res.status === 404) throw new Error('HTTP 404')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as AnalystEstimatesResponse
    } finally {
      clearTimeout(timer)
    }
  }

  let json: AnalystEstimatesResponse
  try {
    json = await fetchOnce()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'HTTP 401') {
      try {
        await ensureYahooCreds(true)
        json = await fetchOnce()
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2)
        if (msg2 === 'HTTP 404') return tombstoneEstimates(sym)
        console.warn('[yahoo] analyst estimates fetch failed:', msg2)
        return cached?.value ?? null
      }
    } else if (msg === 'HTTP 404') {
      return tombstoneEstimates(sym)
    } else {
      console.warn('[yahoo] analyst estimates fetch failed:', msg)
      return cached?.value ?? null
    }
  }

  const result = json.quoteSummary.result?.[0]
  if (!result) return cached?.value ?? null

  const fd = result.financialData
  const trend = result.earningsTrend?.trend
  const recentRecTrend = result.recommendationTrend?.trend?.[0]
  const history = result.upgradeDowngradeHistory?.history ?? []

  const cutoffSec = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
  let up = 0
  let down = 0
  // Capture the raw history rows for the analyst-alerts dispatcher.
  // Same array shape we expose via getRecentAnalystChanges; the
  // dispatcher applies its own recency filter so we keep whatever Yahoo
  // returned (typically last ~20 entries spanning a year or two).
  const recentHistory: AnalystGradeChange[] = []
  for (const row of history) {
    const t = row.epochGradeDate
    if (typeof t === 'number' && t >= cutoffSec) {
      if (row.action === 'up') up++
      else if (row.action === 'down') down++
    }
    recentHistory.push({
      firm: row.firm ?? null,
      toGrade: row.toGrade ?? null,
      fromGrade: row.fromGrade ?? null,
      action: row.action ?? null,
      epochGradeDate: typeof row.epochGradeDate === 'number' ? row.epochGradeDate : null
    })
  }

  const value: AnalystEstimates = {
    symbol: sym,
    nextQuarter: pickPeriod(trend, '+1q'),
    currentYear: pickPeriod(trend, '0y'),
    nextYear: pickPeriod(trend, '+1y'),
    targetMean: raw(fd?.targetMeanPrice),
    targetHigh: raw(fd?.targetHighPrice),
    targetLow: raw(fd?.targetLowPrice),
    targetMedian: raw(fd?.targetMedianPrice),
    analystCount: raw(fd?.numberOfAnalystOpinions),
    recommendationMean: raw(fd?.recommendationMean),
    recommendationKey: fd?.recommendationKey ?? null,
    consensus: recentRecTrend
      ? {
          strongBuy: recentRecTrend.strongBuy ?? 0,
          buy: recentRecTrend.buy ?? 0,
          hold: recentRecTrend.hold ?? 0,
          sell: recentRecTrend.sell ?? 0,
          strongSell: recentRecTrend.strongSell ?? 0
        }
      : null,
    upgradesLast30d: up,
    downgradesLast30d: down,
    fetchedAt: Date.now()
  }
  estimatesCache.set(sym, { value, upgradeHistory: recentHistory })
  return value
}

// ---- Options snapshot ------------------------------------------------------
// Nearest-expiry options summary: IV at the ATM strike, full-chain put/call
// OI ratio, and the ATM straddle cost (= the market's expected absolute
// move through expiry). Yahoo's v7/finance/options endpoint bundles the
// underlying quote + chain for the nearest expiry in a single unauthenticated
// call — no crumb, no rate-limit friction.

export interface OptionsSnapshot {
  symbol: string
  underlyingPrice: number | null
  expiryDate: number // unix ms of the nearest listed expiry used
  daysToExpiry: number
  atmStrike: number | null
  // Mean of ATM call + put IV. Yahoo returns IV as a decimal (0.42 = 42%).
  impliedVol: number | null
  // ATM straddle mid-price — the cost of buying both sides. In options pricing
  // tradition this approximates the expected absolute move in the underlying
  // through expiry. Callers divide by underlyingPrice for a percent.
  expectedMoveUsd: number | null
  expectedMovePct: number | null
  // Full-chain put-OI / call-OI across the nearest expiry. >1 = more puts
  // outstanding than calls (defensive/bearish tilt); <1 = call-heavy.
  putCallOiRatio: number | null
  totalCallOi: number | null
  totalPutOi: number | null
  // Present when the nearest expiry coincides with an earnings release
  // (set by callers that know the earnings date; we don't compute it here
  // to keep this service single-purpose).
  fetchedAt: number
}

interface OptionContract {
  strike?: number
  lastPrice?: number
  bid?: number
  ask?: number
  impliedVolatility?: number
  openInterest?: number
  volume?: number
  inTheMoney?: boolean
}

interface OptionChainResponse {
  optionChain: {
    result:
      | Array<{
          underlyingSymbol?: string
          expirationDates?: number[]
          quote?: {
            regularMarketPrice?: number
          }
          options?: Array<{
            expirationDate?: number
            calls?: OptionContract[]
            puts?: OptionContract[]
          }>
        }>
      | null
    error: { code?: string; description?: string } | null
  }
}

interface OptionsCacheEntry {
  value: OptionsSnapshot
}

const optionsCache = new Map<string, OptionsCacheEntry>()

function mid(contract: OptionContract | undefined): number | null {
  if (!contract) return null
  const bid = contract.bid ?? null
  const ask = contract.ask ?? null
  if (bid !== null && ask !== null && Number.isFinite(bid) && Number.isFinite(ask) && ask > 0) {
    return (bid + ask) / 2
  }
  // Fall back to lastPrice when bid/ask is stale (common for wide-spread
  // strikes right after an open or on thin names).
  if (typeof contract.lastPrice === 'number' && Number.isFinite(contract.lastPrice)) {
    return contract.lastPrice
  }
  return null
}

function pickAtm(contracts: OptionContract[], underlying: number): OptionContract | undefined {
  if (!contracts.length) return undefined
  let best: OptionContract | undefined
  let bestDelta = Infinity
  for (const c of contracts) {
    if (typeof c.strike !== 'number' || !Number.isFinite(c.strike)) continue
    const d = Math.abs(c.strike - underlying)
    if (d < bestDelta) {
      bestDelta = d
      best = c
    }
  }
  return best
}

function sumOi(contracts: OptionContract[]): number {
  let total = 0
  for (const c of contracts) {
    if (typeof c.openInterest === 'number' && Number.isFinite(c.openInterest)) {
      total += c.openInterest
    }
  }
  return total
}

export async function getOptionsSnapshot(symbol: string): Promise<OptionsSnapshot | null> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return null
  const cached = optionsCache.get(sym)
  if (cached && Date.now() - cached.value.fetchedAt < OPTIONS_TTL_MS) {
    return cached.value
  }

  const url = `${YAHOO_OPTIONS_BASE}${encodeURIComponent(sym)}`

  // Options endpoint has been oscillating between "public" and "crumb-gated"
  // throughout 2024-2026. Try an anonymous hit first (faster, works for most
  // symbols); on 401, fall back to the cookie-authenticated path we already
  // use for quoteSummary. Silence the eventual failure since no-options-data
  // is a common outcome for thinly-traded names and doesn't warrant log spam.
  const fetchOnce = async (withAuth: boolean): Promise<Response> => {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Accept: 'application/json'
    }
    if (withAuth) {
      await ensureYahooCreds()
      if (yahooCookie) headers['Cookie'] = yahooCookie
    }
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      return await fetch(url, { headers, signal: controller.signal })
    } finally {
      clearTimeout(t)
    }
  }

  let json: OptionChainResponse
  try {
    let res = await fetchOnce(false)
    if (res.status === 401) {
      // Yahoo is requesting auth for this symbol. Retry with cookie.
      res = await fetchOnce(true)
    }
    if (res.status === 404 || res.status === 401) {
      // 404 = no listed options. 401-after-retry = rotating auth denied
      // access this round. Either way, nothing to surface — return null
      // quietly and fall through to the cached value when we have one.
      return cached?.value ?? null
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    json = (await res.json()) as OptionChainResponse
  } catch (err) {
    // Don't log — options unavailability is expected intermittent noise.
    void err
    return cached?.value ?? null
  }

  const result = json.optionChain.result?.[0]
  if (!result?.options?.length) return null
  const nearest = result.options[0]
  const expirySec = nearest.expirationDate
  if (typeof expirySec !== 'number' || !Number.isFinite(expirySec)) return null
  const underlyingPrice = result.quote?.regularMarketPrice ?? null
  const calls = nearest.calls ?? []
  const puts = nearest.puts ?? []

  const atmCall = underlyingPrice !== null ? pickAtm(calls, underlyingPrice) : undefined
  const atmPut = underlyingPrice !== null ? pickAtm(puts, underlyingPrice) : undefined
  const atmStrike = atmCall?.strike ?? atmPut?.strike ?? null

  const ivCall = atmCall?.impliedVolatility ?? null
  const ivPut = atmPut?.impliedVolatility ?? null
  let impliedVol: number | null = null
  if (ivCall !== null && ivPut !== null && Number.isFinite(ivCall) && Number.isFinite(ivPut)) {
    impliedVol = (ivCall + ivPut) / 2
  } else if (ivCall !== null && Number.isFinite(ivCall)) impliedVol = ivCall
  else if (ivPut !== null && Number.isFinite(ivPut)) impliedVol = ivPut

  const callMid = mid(atmCall)
  const putMid = mid(atmPut)
  const expectedMoveUsd =
    callMid !== null && putMid !== null ? callMid + putMid : callMid ?? putMid ?? null
  const expectedMovePct =
    expectedMoveUsd !== null && underlyingPrice !== null && underlyingPrice > 0
      ? expectedMoveUsd / underlyingPrice
      : null

  const totalCallOi = sumOi(calls)
  const totalPutOi = sumOi(puts)
  const putCallOiRatio = totalCallOi > 0 ? totalPutOi / totalCallOi : null

  const expiryMs = expirySec * 1000
  const daysToExpiry = Math.max(0, Math.round((expiryMs - Date.now()) / (24 * 60 * 60 * 1000)))

  const value: OptionsSnapshot = {
    symbol: sym,
    underlyingPrice,
    expiryDate: expiryMs,
    daysToExpiry,
    atmStrike,
    impliedVol,
    expectedMoveUsd,
    expectedMovePct,
    putCallOiRatio,
    totalCallOi: totalCallOi || null,
    totalPutOi: totalPutOi || null,
    fetchedAt: Date.now()
  }
  optionsCache.set(sym, { value })
  return value
}

// ---- Extended-hours quotes ------------------------------------------------
// Stooq's CSV endpoint locks at the 4pm ET close and doesn't publish pre- or
// post-market prints, so the Stocks marquee looks frozen from 4pm–9:30am
// next day. Yahoo's v8 chart endpoint with `includePrePost=true` returns the
// extended-session ticks alongside the regular session — same path we use
// for history, so no crumb/auth friction.
//
// We expose a small batched helper that fans out parallel chart fetches and
// extracts just what the live ticker UI needs: regular session close,
// post/pre price + time, and the current market state.

export type MarketState = 'pre' | 'regular' | 'post' | 'closed'

export interface ExtendedQuote {
  symbol: string
  regularPrice: number | null
  regularTime: number | null // unix ms of the last regular-session close
  postPrice: number | null
  postTime: number | null
  prePrice: number | null
  preTime: number | null
  marketState: MarketState | null
  fetchedAt: number
}

interface ExtendedChartResponse {
  chart: {
    result:
      | Array<{
          meta?: {
            regularMarketPrice?: number
            regularMarketTime?: number
            chartPreviousClose?: number
            currentTradingPeriod?: {
              pre?: { start?: number; end?: number }
              regular?: { start?: number; end?: number }
              post?: { start?: number; end?: number }
            }
          }
          timestamp?: number[]
          indicators?: { quote?: Array<{ close?: Array<number | null> }> }
        }>
      | null
    error: { code?: string; description?: string } | null
  }
}

interface TradingPeriods {
  pre?: { start?: number; end?: number }
  regular?: { start?: number; end?: number }
  post?: { start?: number; end?: number }
}

// Classify where `nowSec` sits against Yahoo's trading-period windows.
// Defaults to 'closed' if the periods aren't present or if we're outside all
// three windows (overnight lull or weekend).
function classifyMarketState(nowSec: number, periods: TradingPeriods | undefined): MarketState {
  if (!periods) return 'closed'
  const { pre, regular, post } = periods
  if (regular?.start && regular?.end && nowSec >= regular.start && nowSec < regular.end)
    return 'regular'
  if (pre?.start && pre?.end && nowSec >= pre.start && nowSec < pre.end) return 'pre'
  if (post?.start && post?.end && nowSec >= post.start && nowSec < post.end) return 'post'
  return 'closed'
}

async function fetchExtendedOne(symbol: string): Promise<ExtendedQuote | null> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return null
  const url = `${YAHOO_BASE}${encodeURIComponent(sym)}?interval=1m&range=1d&includePrePost=true`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) return null
    const json = (await res.json()) as ExtendedChartResponse
    const result = json.chart.result?.[0]
    if (!result?.meta) return null
    const meta = result.meta
    const nowSec = Math.floor(Date.now() / 1000)
    const marketState = classifyMarketState(nowSec, meta.currentTradingPeriod ?? undefined)

    const regularPrice = meta.regularMarketPrice ?? null
    const regularTime =
      typeof meta.regularMarketTime === 'number' ? meta.regularMarketTime * 1000 : null

    // Walk the minute-bar closes to find the newest extended-session price
    // on either side of the regular window. Yahoo sometimes pads post-market
    // bars with nulls; pick the latest non-null entry outside regular hours.
    let postPrice: number | null = null
    let postTime: number | null = null
    let prePrice: number | null = null
    let preTime: number | null = null
    const ts = result.timestamp ?? []
    const closes = result.indicators?.quote?.[0]?.close ?? []
    const periods = meta.currentTradingPeriod
    const regularStart = periods?.regular?.start
    const regularEnd = periods?.regular?.end
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i]
      const c = closes[i]
      if (c === null || c === undefined || !Number.isFinite(c)) continue
      if (regularStart && t < regularStart) {
        if (prePrice === null || t > (preTime ?? 0) / 1000) {
          prePrice = c
          preTime = t * 1000
        }
      } else if (regularEnd && t >= regularEnd) {
        // Later minute bar wins — walking forward gives us the latest.
        postPrice = c
        postTime = t * 1000
      }
    }

    return {
      symbol: sym,
      regularPrice,
      regularTime,
      postPrice,
      postTime,
      prePrice,
      preTime,
      marketState,
      fetchedAt: Date.now()
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function getExtendedQuotes(symbols: string[]): Promise<ExtendedQuote[]> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))]
  if (unique.length === 0) return []
  // Parallel fan-out. Yahoo's chart endpoint tolerates burstiness well; the
  // concurrent call pattern is the same one getHistory uses for ranges.
  const settled = await Promise.all(unique.map((s) => fetchExtendedOne(s)))
  return settled.filter((q): q is ExtendedQuote => q !== null)
}

// ---- Primary regular-hours + extended quotes -------------------------------
// Returns the full StockQuote shape (same fields the Stooq path produces) so
// stocksScheduler can consume it without a second overlay call. One chart
// request per symbol — same shape fetchExtendedOne already uses — parsed
// for every field the rolling bar + detail pages need.
//
// Yahoo batches well with parallelism rather than CSV joining, but piling on
// 300+ concurrent requests is asking for 429s. We cap at 12 in flight at
// once, which gets a 300-ticker sweep done in 5–8 s and stays well within
// Yahoo's informal tolerance.

const YAHOO_QUOTES_CONCURRENCY = 12

// Widened chart-response type covering the meta fields we need for a full
// regular-hours snapshot. `fetchExtendedOne` already uses a narrower view
// of the same payload; this one adds the OHLCV + previousClose slice.
// Yahoo's meta omits regularMarketOpen entirely — the first regular-session
// minute bar's `open` is where today's open actually lives.
interface QuoteChartResponse {
  chart: {
    result:
      | Array<{
          meta?: {
            symbol?: string
            regularMarketPrice?: number
            regularMarketTime?: number
            chartPreviousClose?: number
            previousClose?: number
            regularMarketDayHigh?: number
            regularMarketDayLow?: number
            regularMarketVolume?: number
            currentTradingPeriod?: {
              pre?: { start?: number; end?: number }
              regular?: { start?: number; end?: number }
              post?: { start?: number; end?: number }
            }
          }
          timestamp?: number[]
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>
              high?: Array<number | null>
              low?: Array<number | null>
              close?: Array<number | null>
              volume?: Array<number | null>
            }>
          }
        }>
      | null
    error: { code?: string; description?: string } | null
  }
}

// The StockQuote shape is defined in stooqService so the scheduler can pass
// either provider's output through the same broadcast. We inline the shape
// here (rather than importing) because importing from stooqService across
// the codebase would create a doubtful dependency direction.
export interface StockQuote {
  symbol: string
  price: number | null
  open: number | null
  high: number | null
  low: number | null
  change: number | null
  changePct: number | null
  volume: number | null
  time: string | null
  postMarketPrice: number | null
  postMarketChange: number | null
  postMarketChangePct: number | null
  preMarketPrice: number | null
  preMarketChange: number | null
  preMarketChangePct: number | null
  marketState: MarketState | null
}

function emptyQuote(symbol: string): StockQuote {
  return {
    symbol,
    price: null,
    open: null,
    high: null,
    low: null,
    change: null,
    changePct: null,
    volume: null,
    time: null,
    postMarketPrice: null,
    postMarketChange: null,
    postMarketChangePct: null,
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePct: null,
    marketState: null
  }
}

// Format a unix-seconds timestamp to the same "YYYY-MM-DD HH:MM:SS" shape
// Stooq gives us, so the renderer's time-pill formatting doesn't need to
// branch on the source. Uses local time to match Stooq's convention — the
// UI treats `time` as an opaque display string anyway.
function formatSecsToStooqTime(sec: number): string {
  const d = new Date(sec * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

async function fetchQuoteOne(symbol: string): Promise<StockQuote> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return emptyQuote(symbol)
  const url = `${YAHOO_BASE}${encodeURIComponent(sym)}?interval=1m&range=1d&includePrePost=true`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) return emptyQuote(sym)
    const json = (await res.json()) as QuoteChartResponse
    const result = json.chart.result?.[0]
    if (!result?.meta) return emptyQuote(sym)
    const meta = result.meta

    const nowSec = Math.floor(Date.now() / 1000)
    const marketState = classifyMarketState(nowSec, meta.currentTradingPeriod ?? undefined)

    const price = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : null
    const high = typeof meta.regularMarketDayHigh === 'number' ? meta.regularMarketDayHigh : null
    const low = typeof meta.regularMarketDayLow === 'number' ? meta.regularMarketDayLow : null
    const metaVolume =
      typeof meta.regularMarketVolume === 'number' ? meta.regularMarketVolume : null
    const previousClose =
      typeof meta.chartPreviousClose === 'number'
        ? meta.chartPreviousClose
        : typeof meta.previousClose === 'number'
          ? meta.previousClose
          : null
    const time =
      typeof meta.regularMarketTime === 'number'
        ? formatSecsToStooqTime(meta.regularMarketTime)
        : null

    // Walk minute bars in a single pass for today's open (first regular-
    // session bar's open price, since Yahoo's meta omits regularMarketOpen
    // entirely), plus pre/post extended-session prints. Same traversal the
    // old fetchExtendedOne did, just broadened to pick up the open too.
    let open: number | null = null
    let postMarketPrice: number | null = null
    let postTimeSec: number | null = null
    let preMarketPrice: number | null = null
    const ts = result.timestamp ?? []
    const quote = result.indicators?.quote?.[0]
    const opens = quote?.open ?? []
    const closes = quote?.close ?? []
    const periods = meta.currentTradingPeriod
    const regularStart = periods?.regular?.start
    const regularEnd = periods?.regular?.end
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i]
      const c = closes[i]
      if (c === null || c === undefined || !Number.isFinite(c)) continue
      if (regularStart && t < regularStart) {
        preMarketPrice = c // last pre-session print wins
      } else if (regularEnd && t >= regularEnd) {
        postMarketPrice = c
        postTimeSec = t
      } else if (regularStart && t >= regularStart && (!regularEnd || t < regularEnd)) {
        // Regular session bar. First one with a real open price is today's
        // open — don't overwrite on later bars.
        if (open === null) {
          const o = opens[i]
          if (typeof o === 'number' && Number.isFinite(o)) open = o
        }
      }
    }
    void postTimeSec // kept for symmetry with fetchExtendedOne; not surfaced.

    // Fall back to previousClose for `open` before the regular session has
    // started (so pre-market deltas measure vs yesterday's close, matching
    // the UI's "+$X since close" convention). Saves us from showing a
    // blank open column on tickers polled during overnight hours.
    if (open === null && previousClose !== null) open = previousClose

    // Stooq computes change as `close - open` (intraday move since today's
    // open). We keep that semantic — the renderer has been consuming it for
    // months and switching to close-vs-previous-close would visibly change
    // every number. Uses our derived open, not a nonexistent meta field.
    const change = price !== null && open !== null ? price - open : null
    const changePct = change !== null && open !== null && open > 0 ? (change / open) * 100 : null

    // Volume fallback: sum regular-session minute bar volumes if meta
    // didn't carry a pre-aggregated figure. Most tickers have meta volume;
    // the sum path catches the occasional illiquid symbol that doesn't.
    let volume: number | null = metaVolume
    if (volume === null) {
      const vols = quote?.volume ?? []
      let acc = 0
      let any = false
      for (let i = 0; i < ts.length; i++) {
        const t = ts[i]
        const v = vols[i]
        if (regularStart && t < regularStart) continue
        if (regularEnd && t >= regularEnd) continue
        if (typeof v === 'number' && Number.isFinite(v)) {
          acc += v
          any = true
        }
      }
      volume = any ? acc : null
    }

    // Delta baseline for extended-session is the regular-session close —
    // matches the Stooq-overlay convention. If we don't have a baseline we
    // leave deltas null rather than compute bogus percentages.
    const baseline = price
    const postMarketChange =
      postMarketPrice !== null && baseline !== null ? postMarketPrice - baseline : null
    const postMarketChangePct =
      postMarketChange !== null && baseline !== null && baseline > 0
        ? (postMarketChange / baseline) * 100
        : null
    const preMarketChange =
      preMarketPrice !== null && baseline !== null ? preMarketPrice - baseline : null
    const preMarketChangePct =
      preMarketChange !== null && baseline !== null && baseline > 0
        ? (preMarketChange / baseline) * 100
        : null

    return {
      symbol: sym,
      price,
      open,
      high,
      low,
      change,
      changePct,
      volume,
      time,
      postMarketPrice,
      postMarketChange,
      postMarketChangePct,
      preMarketPrice,
      preMarketChange,
      preMarketChangePct,
      marketState
    }
  } catch {
    return emptyQuote(sym)
  } finally {
    clearTimeout(timer)
  }
}

// Simple bounded-parallelism runner. Walks the symbol list in waves of
// `concurrency` promises so we never have more than that many requests
// outstanding at once. Exported so other Yahoo-touching services
// (earningsService, calendarService) can share the same throttling
// shape — unbounded Promise.all on quoteSummary endpoints triggers a
// thundering-herd cookie-rotation on the first 401 and self-DoSes.
export async function runBounded<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function pump(): Promise<void> {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await worker(items[i])
    }
  }
  const runners: Promise<void>[] = []
  const n = Math.min(concurrency, items.length)
  for (let i = 0; i < n; i++) runners.push(pump())
  await Promise.all(runners)
  return out
}

// Primary quote fan-out. One chart call per symbol (batched v7/quote has
// been crumb-gated since 2024 and the chart endpoint is the only reliably
// anonymous batched-adjacent path). Returns one StockQuote per input symbol
// in the same order, with `price === null` for anything Yahoo couldn't
// serve — callers inspect the null-rate to decide whether to fall back.
export async function getYahooQuotes(symbols: string[]): Promise<StockQuote[]> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))]
  if (unique.length === 0) return []
  return runBounded(unique, fetchQuoteOne, YAHOO_QUOTES_CONCURRENCY)
}

// ---- Ticker search --------------------------------------------------------
// Yahoo's public /v1/finance/search endpoint doubles as a ticker autocomplete.
// Results include symbol, display name, exchange, and sector/industry when
// Yahoo has them — all we need for a "Bloomberg-style" dropdown that covers
// any US-listed name, not just the 65 tickers in supplyChainGraph.json.

export interface TickerSearchResult {
  symbol: string
  name: string
  exchange: string | null
  exchangeDisplay: string | null
  quoteType: string | null // 'EQUITY' | 'ETF' | 'INDEX' | 'MUTUALFUND' | 'FUTURE' | 'CRYPTOCURRENCY'
  sector: string | null
  industry: string | null
}

interface YahooSearchResponse {
  quotes?: Array<{
    symbol?: string
    shortname?: string
    longname?: string
    exchange?: string
    exchDisp?: string
    quoteType?: string
    sector?: string
    industry?: string
  }>
}

// Tiny LRU-ish cache keyed by normalized query so the UI's debounced input
// doesn't re-hit Yahoo on every keystroke.
const SEARCH_TTL_MS = 60_000
const searchCache = new Map<string, { value: TickerSearchResult[]; fetchedAt: number }>()

export async function searchTickers(
  query: string,
  limit = 8
): Promise<TickerSearchResult[]> {
  const q = query.trim()
  if (q.length < 1) return []
  const key = `${q.toLowerCase()}|${limit}`
  const cached = searchCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < SEARCH_TTL_MS) return cached.value

  const url = `${YAHOO_SEARCH_BASE}?q=${encodeURIComponent(q)}&quotesCount=${limit}&newsCount=0`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as YahooSearchResponse
    const out: TickerSearchResult[] = []
    for (const q of json.quotes ?? []) {
      if (!q.symbol) continue
      // Filter to things that make sense in Pulse — drop futures / crypto /
      // money-market tickers that would clog the dropdown.
      const type = q.quoteType ?? ''
      if (type && !['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND'].includes(type)) continue
      out.push({
        symbol: q.symbol.toUpperCase(),
        name: q.longname ?? q.shortname ?? q.symbol,
        exchange: q.exchange ?? null,
        exchangeDisplay: q.exchDisp ?? null,
        quoteType: q.quoteType ?? null,
        sector: q.sector ?? null,
        industry: q.industry ?? null
      })
    }
    searchCache.set(key, { value: out, fetchedAt: Date.now() })
    return out
  } catch (err) {
    console.warn(
      '[yahoo] ticker search failed:',
      err instanceof Error ? err.message : err
    )
    return cached?.value ?? []
  } finally {
    clearTimeout(timer)
  }
}
