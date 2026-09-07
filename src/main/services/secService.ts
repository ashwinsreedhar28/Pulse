// SEC EDGAR client. Two endpoints, both free and anonymous:
//
//   1. www.sec.gov/files/company_tickers.json
//        Bulk ticker → CIK mapping for every public filer. Snapshot refreshed
//        monthly — mappings basically never change.
//
//   2. data.sec.gov/submissions/CIK{10d}.json
//        Per-issuer filings history. Returns the last 1000 filings plus
//        pointers to paginated pages for older history. We only care about
//        the recent page.
//
// SEC enforces two rules aggressively: the User-Agent header must identify a
// contact (their fair-access policy), and requests are rate-limited to 10/sec.
// We set a descriptive UA and space requests with a small intra-call delay.

const UA = 'Pulse Desktop (ashwin.sreedhar2003@gmail.com)'
const TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json'
const SUBMISSIONS_BASE = 'https://data.sec.gov/submissions/'
const FETCH_TIMEOUT_MS = 15_000

// Form types we surface. Everything else (SEC-assigned oddities, exhibits-only
// filings, insider Forms 3/5 outside of txn history) is stored too but we
// don't highlight it in the default view — see secFilings.getRecentFilings
// which filters by form at read time.
// Forms worth interrupting the user for. Strict subset of INTERESTING_FORMS
// below, which governs what we *store* and display.
//
// The distinction matters because the notify query is a LIMIT-8,
// filedAt-DESC scan. Filtering it by INTERESTING_FORMS meant that for any
// active filer the eight most recent rows were all Form 4 and 424B2 —
// JPM alone has ~28k filings, overwhelmingly those — so a same-day 8-K
// never entered the 24h window and no filing notification ever fired
// (notification_log had zero). Form 4/424B2/SC 13G are routine and, against
// a shared 5/day notification cap, would crowd out everything else anyway.
export const MATERIAL_FORMS = new Set([
  '8-K',
  '8-K/A',
  '10-Q',
  '10-Q/A',
  '10-K',
  '10-K/A',
  'DEF 14A',
  'SC 13D',
  'SC 13D/A',
  'S-1',
  'S-1/A'
])

export const INTERESTING_FORMS = new Set([
  '8-K',
  '8-K/A',
  '10-Q',
  '10-Q/A',
  '10-K',
  '10-K/A',
  'DEF 14A',
  'DEFA14A',
  '4',
  'SC 13D',
  'SC 13D/A',
  'SC 13G',
  'SC 13G/A',
  'S-1',
  'S-1/A',
  '424B5',
  '424B2',
  'F-1'
])

export interface CikEntry {
  symbol: string
  cik: string // 10-digit zero-padded
  companyName: string
}

export interface SecFilingRaw {
  accessionNumber: string
  cik: string
  formType: string
  filedAt: number // unix ms
  reportDate: number | null // period-of-report if present
  primaryDocument: string | null
  primaryDocDescription: string | null
  // 8-K "Items" code list ("2.02,9.01") — lets us distinguish a press-release
  // 8-K from a leadership-change 8-K without fetching the doc.
  items: string | null
}

// Former legal name a CIK has previously filed under. Populated from the
// submissions JSON's `formerNames` array. Feeds the company-name resolver
// so rebrands ("Facebook" → META, "Square" → Block) resolve without
// hand-curated aliases.
export interface SecFormerNameRaw {
  name: string
  fromDate: string | null
  toDate: string | null
}

// Submissions endpoint returns filings + issuer metadata in one response.
// Keeping both returns from a single fetch avoids double-taxing SEC's
// rate limit when we want former names alongside the usual filings pull.
export interface SubmissionsData {
  filings: SecFilingRaw[]
  formerNames: SecFormerNameRaw[]
}

interface TickerMapResponse {
  [key: string]: {
    cik_str: number
    ticker: string
    title: string
  }
}

function padCik(cik: number | string): string {
  const s = String(cik)
  return s.padStart(10, '0')
}

// Pull the bulk ticker→CIK map. Each entry arrives keyed by an index string
// (e.g. "0", "1", ...) with the actual ticker + CIK inside. We flatten into
// an array for easy upsert.
export async function fetchTickerMap(): Promise<CikEntry[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(TICKER_MAP_URL, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as TickerMapResponse
    const out: CikEntry[] = []
    for (const key of Object.keys(json)) {
      const row = json[key]
      if (!row?.ticker || typeof row.cik_str !== 'number') continue
      out.push({
        symbol: row.ticker.toUpperCase(),
        cik: padCik(row.cik_str),
        companyName: row.title ?? ''
      })
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

interface SubmissionsResponse {
  cik?: string
  formerNames?: Array<{
    name?: string
    from?: string
    to?: string
  }>
  filings?: {
    recent?: {
      accessionNumber?: string[]
      filingDate?: string[]
      reportDate?: string[]
      form?: string[]
      primaryDocument?: string[]
      primaryDocDescription?: string[]
      items?: string[]
    }
  }
}

// Fetch the recent filings page for one issuer. SEC returns 12-15 fields as
// parallel arrays — an unusual shape, but their own convention. We zip them
// into row objects. Also returns the issuer's `formerNames` list so the
// resolver can index prior legal names — same fetch, no extra rate-limit
// budget.
export async function fetchSubmissions(cik: string): Promise<SubmissionsData> {
  const empty: SubmissionsData = { filings: [], formerNames: [] }
  const padded = padCik(cik)
  const url = `${SUBMISSIONS_BASE}CIK${padded}.json`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) {
      if (res.status === 404) return empty
      throw new Error(`HTTP ${res.status}`)
    }
    const json = (await res.json()) as SubmissionsResponse

    const filings: SecFilingRaw[] = []
    const recent = json.filings?.recent
    if (recent?.accessionNumber) {
      const len = recent.accessionNumber.length
      for (let i = 0; i < len; i++) {
        const acc = recent.accessionNumber[i]
        const form = recent.form?.[i]
        const filed = recent.filingDate?.[i]
        if (!acc || !form || !filed) continue
        const filedAt = parseSecDate(filed)
        if (filedAt === null) continue
        filings.push({
          accessionNumber: acc,
          cik: padded,
          formType: form,
          filedAt,
          reportDate: parseSecDate(recent.reportDate?.[i]),
          primaryDocument: recent.primaryDocument?.[i] ?? null,
          primaryDocDescription: recent.primaryDocDescription?.[i] ?? null,
          items: recent.items?.[i] ?? null
        })
      }
    }

    const formerNames: SecFormerNameRaw[] = []
    if (Array.isArray(json.formerNames)) {
      for (const entry of json.formerNames) {
        const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
        if (!name) continue
        formerNames.push({
          name,
          fromDate: typeof entry.from === 'string' && entry.from ? entry.from : null,
          toDate: typeof entry.to === 'string' && entry.to ? entry.to : null
        })
      }
    }

    return { filings, formerNames }
  } finally {
    clearTimeout(timer)
  }
}

// Backwards-compat wrapper: callers that only wanted filings can keep using
// this. New callers should prefer fetchSubmissions so the former-names
// field doesn't go to waste.
export async function fetchFilings(cik: string): Promise<SecFilingRaw[]> {
  return (await fetchSubmissions(cik)).filings
}

// SEC dates come as "YYYY-MM-DD" strings. Treat them as UTC midnight — close
// enough for a "filed on" display; the full timestamp isn't in the submissions
// index anyway.
function parseSecDate(raw: string | undefined): number | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const ms = Date.UTC(y, mo, d)
  if (!Number.isFinite(ms)) return null
  return ms
}

// URL pattern for the human-readable filing page. The index.json for an
// accession lives at:
//   https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type={form}&dateb=&owner=include&count=40
// but the direct archive index is more useful:
//   https://www.sec.gov/Archives/edgar/data/{cik-no-zeros}/{accession-no-dashes}/
export function buildFilingUrl(cik: string, accessionNumber: string): string {
  const cikPlain = String(Number(cik)) // strip leading zeros for URL
  const accPlain = accessionNumber.replace(/-/g, '')
  return `https://www.sec.gov/Archives/edgar/data/${cikPlain}/${accPlain}/`
}

// Direct link to the primary document inside a filing. Falls back to the
// accession index when the document name is unknown.
export function buildPrimaryDocUrl(
  cik: string,
  accessionNumber: string,
  primaryDocument: string | null
): string {
  const base = buildFilingUrl(cik, accessionNumber)
  if (!primaryDocument) return base
  return `${base}${primaryDocument}`
}
