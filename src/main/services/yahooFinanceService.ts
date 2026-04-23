// Historical price series via Yahoo Finance's free chart JSON endpoint.
// Doc (unofficial): GET /v8/finance/chart/{SYMBOL}?interval=...&range=...
// Returns timestamp[] + indicators.quote[0].close[] — we map those to {t, v} points.

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/'
const YAHOO_QUOTE_SUMMARY = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/'
const YAHOO_CRUMB_URL = 'https://query2.finance.yahoo.com/v1/test/getcrumb'
const YAHOO_CONSENT_URL = 'https://fc.yahoo.com/'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const FETCH_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 5 * 60_000
const FUNDAMENTALS_TTL_MS = 30 * 60_000
const EARNINGS_TTL_MS = 24 * 60 * 60_000

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
  revenue: number | null
  netIncome: number | null
  grossProfit: number | null
  operatingCashFlow: number | null
  capex: number | null // raw (negative in Yahoo's convention)
  freeCashFlow: number | null // direct from Yahoo when provided
  currency: string | null
}

// Yahoo's cashflow row has accreted field names over the years: the legacy
// v10 names (totalCashFromOperatingActivities, capitalExpenditures) still
// appear for some tickers, but many modern responses return only
// operatingCashFlow / capitalExpenditure (singular), often alongside a
// pre-computed freeCashFlow. We read all three and fall back in that order.
interface QuarterlyStatementsResponse {
  quoteSummary: {
    result:
      | Array<{
          cashflowStatementHistoryQuarterly?: {
            cashflowStatements?: Array<{
              endDate?: RawField
              netIncome?: RawField
              totalCashFromOperatingActivities?: RawField
              operatingCashFlow?: RawField
              capitalExpenditures?: RawField
              capitalExpenditure?: RawField
              freeCashFlow?: RawField
            }>
          }
          incomeStatementHistoryQuarterly?: {
            incomeStatementHistory?: Array<{
              endDate?: RawField
              totalRevenue?: RawField
              grossProfit?: RawField
              netIncome?: RawField
            }>
          }
          price?: { currency?: string }
        }>
      | null
    error: { code?: string; description?: string } | null
  }
}

export async function getQuarterlyFinancials(
  symbol: string
): Promise<QuarterlyFinancialPoint[]> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return []
  const modules = 'cashflowStatementHistoryQuarterly,incomeStatementHistoryQuarterly,price'

  const fetchOnce = async (): Promise<QuarterlyStatementsResponse> => {
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
      return (await res.json()) as QuarterlyStatementsResponse
    } finally {
      clearTimeout(timer)
    }
  }

  let json: QuarterlyStatementsResponse
  try {
    json = await fetchOnce()
  } catch (err) {
    if (err instanceof Error && err.message === 'HTTP 401') {
      try {
        await ensureYahooCreds(true)
        json = await fetchOnce()
      } catch (err2) {
        console.warn(
          '[yahoo] quarterly financials fetch failed:',
          err2 instanceof Error ? err2.message : err2
        )
        return []
      }
    } else {
      console.warn(
        '[yahoo] quarterly financials fetch failed:',
        err instanceof Error ? err.message : err
      )
      return []
    }
  }

  const result = json.quoteSummary.result?.[0]
  if (!result) return []
  const cfEntries = result.cashflowStatementHistoryQuarterly?.cashflowStatements ?? []
  const isEntries = result.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? []
  const currency = result.price?.currency ?? null

  // Index income statements by endDate so we can join to cashflow rows on
  // the same quarter boundary. Yahoo sometimes returns an extra cashflow
  // quarter that has no matching income row (or vice versa) — we keep the
  // union and leave the missing side null.
  const incomeByDate = new Map<number, (typeof isEntries)[number]>()
  for (const e of isEntries) {
    const d = e.endDate?.raw
    if (typeof d === 'number' && Number.isFinite(d)) incomeByDate.set(d, e)
  }
  const cashByDate = new Map<number, (typeof cfEntries)[number]>()
  for (const e of cfEntries) {
    const d = e.endDate?.raw
    if (typeof d === 'number' && Number.isFinite(d)) cashByDate.set(d, e)
  }

  const allDates = new Set<number>([...cashByDate.keys(), ...incomeByDate.keys()])
  const out: QuarterlyFinancialPoint[] = []
  for (const dRaw of allDates) {
    const income = incomeByDate.get(dRaw)
    const cash = cashByDate.get(dRaw)
    out.push({
      endDate: dRaw * 1000,
      revenue: raw(income?.totalRevenue),
      netIncome: raw(income?.netIncome) ?? raw(cash?.netIncome),
      grossProfit: raw(income?.grossProfit),
      // Yahoo returns either the legacy totalCashFromOperatingActivities or
      // the newer operatingCashFlow depending on the ticker/response — accept
      // whichever shows up.
      operatingCashFlow:
        raw(cash?.operatingCashFlow) ?? raw(cash?.totalCashFromOperatingActivities),
      capex: raw(cash?.capitalExpenditures) ?? raw(cash?.capitalExpenditure),
      freeCashFlow: raw(cash?.freeCashFlow),
      currency
    })
  }
  out.sort((a, b) => b.endDate - a.endDate)
  return out
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
