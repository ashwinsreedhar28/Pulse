// Synthesizes an in-app "IPO brief" reader view for upcoming listings.
//
// Fans out to three sources (all unauthenticated, no API keys):
//   1. Nasdaq IPO calendar  → offering details (price range, shares, proceeds)
//   2. SEC EDGAR full-text   → S-1 / S-1/A filings (prospectus)
//   3. Google News RSS      → recent headlines tagged to the company
//
// Output is shaped as a ReaderResult so ExternalReader can render it directly
// without going through readerService. If every source fails, return an error
// result and the caller can offer a retry or fall back to a plain URL.

import Parser from 'rss-parser'
import type { ReaderResult } from './readerService'
import { getUpcomingIpos, type UpcomingIpo } from './nasdaqCalendarService'

const EDGAR_FETCH_TIMEOUT_MS = 5_000
const NEWS_FETCH_TIMEOUT_MS = 5_000
const BRIEF_TTL_MS = 6 * 60 * 60_000

// EDGAR explicitly requires a descriptive User-Agent with a contact string, or
// it returns 403. Generic browser UAs (like the one we use for Nasdaq) get
// blocked — this one matches EDGAR's documented expected format.
const EDGAR_UA = 'Pulse Reader (pulse-app@local)'

interface BriefCacheEntry {
  value: ReaderResult
  fetchedAt: number
}

const briefCache = new Map<string, BriefCacheEntry>()

export interface IpoBriefInput {
  symbol: string
  companyName: string
}

export async function getIpoBrief(input: IpoBriefInput): Promise<ReaderResult> {
  const key = cacheKey(input)
  const cached = briefCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < BRIEF_TTL_MS) return cached.value

  const [offering, filings, headlines] = await Promise.all([
    findOfferingDetails(input),
    fetchEdgarFilings(input.companyName),
    fetchNewsHeadlines(input)
  ])

  if (!offering && filings.length === 0 && headlines.length === 0) {
    return {
      status: 'error',
      error:
        'Could not find any pre-IPO data for this company. Try the system browser if you need live search.'
    }
  }

  const title = input.symbol
    ? `${input.symbol} — ${input.companyName || 'IPO brief'}`
    : `${input.companyName} IPO brief`
  const contentHTML = buildBriefHTML({
    input,
    offering,
    filings,
    headlines
  })
  const result: ReaderResult = {
    status: 'ok',
    title,
    byline: input.companyName ? `Upcoming IPO — ${input.companyName}` : 'Upcoming IPO',
    siteName: 'Pulse · IPO brief',
    contentHTML,
    textLength: contentHTML.length
  }
  briefCache.set(key, { value: result, fetchedAt: Date.now() })
  return result
}

function cacheKey(input: IpoBriefInput): string {
  return `${input.symbol.toUpperCase()}|${input.companyName.toLowerCase()}`
}

// ---------- Source 1: Nasdaq calendar offering details ----------

async function findOfferingDetails(input: IpoBriefInput): Promise<UpcomingIpo | null> {
  // Look 60 days back + 60 days forward so we catch already-priced listings too.
  const now = Date.now()
  const from = now - 60 * 86_400_000
  const to = now + 60 * 86_400_000
  try {
    const all = await getUpcomingIpos(from, to)
    const wantSym = input.symbol.toUpperCase()
    const wantName = input.companyName.toLowerCase()
    return (
      all.find((i) => i.symbol === wantSym) ??
      all.find((i) => i.companyName.toLowerCase() === wantName) ??
      null
    )
  } catch {
    return null
  }
}

// ---------- Source 2: SEC EDGAR full-text search ----------

export interface EdgarFiling {
  form: string
  filedOn: number
  accessionNumber: string
  cik: string
  url: string
}

interface EdgarHit {
  _source?: {
    ciks?: string[]
    form?: string
    root_form?: string
    file_date?: string
    adsh?: string
    display_names?: string[]
  }
  _id?: string
}

interface EdgarSearchResponse {
  hits?: {
    hits?: EdgarHit[]
  }
}

async function fetchEdgarFilings(companyName: string): Promise<EdgarFiling[]> {
  if (!companyName) return []
  // Quote-wrap the name so EDGAR does phrase matching, which dramatically cuts
  // false positives for short or generic company names.
  const q = encodeURIComponent(`"${companyName}"`)
  const url = `https://efts.sec.gov/LATEST/search-index?q=${q}&forms=S-1,S-1/A`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EDGAR_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': EDGAR_UA,
        Accept: 'application/json'
      },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as EdgarSearchResponse
    const hits = json.hits?.hits ?? []
    const out: EdgarFiling[] = []
    for (const hit of hits) {
      const src = hit._source
      if (!src?.adsh || !src.ciks?.[0]) continue
      const filedMs = src.file_date ? Date.parse(src.file_date) : NaN
      if (!Number.isFinite(filedMs)) continue
      const cik = src.ciks[0].replace(/^0+/, '') || src.ciks[0]
      const adshNoDash = src.adsh.replace(/-/g, '')
      out.push({
        form: src.form ?? src.root_form ?? 'S-1',
        filedOn: filedMs,
        accessionNumber: src.adsh,
        cik,
        url: `https://www.sec.gov/Archives/edgar/data/${cik}/${adshNoDash}/`
      })
      if (out.length >= 5) break
    }
    // EDGAR returns most-recent first, but sort defensively.
    out.sort((a, b) => b.filedOn - a.filedOn)
    return out
  } catch (err) {
    console.warn(
      '[ipoBrief] EDGAR fetch failed:',
      err instanceof Error ? err.message : err
    )
    return []
  } finally {
    clearTimeout(timer)
  }
}

// ---------- Source 3: Google News RSS ----------

export interface NewsHeadline {
  title: string
  url: string
  source: string | null
  publishedAt: number | null
}

const newsParser = new Parser({
  timeout: NEWS_FETCH_TIMEOUT_MS,
  customFields: {
    // Google News encodes the publisher under <source url="…">Name</source>.
    item: [['source', 'source']]
  }
})

async function fetchNewsHeadlines(input: IpoBriefInput): Promise<NewsHeadline[]> {
  const query = input.companyName
    ? `${input.companyName} IPO`
    : `${input.symbol} IPO`
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
  try {
    const feed = await newsParser.parseURL(url)
    const out: NewsHeadline[] = []
    for (const item of (feed.items ?? []).slice(0, 8)) {
      if (!item.title || !item.link) continue
      // rss-parser returns source as either a string or an object depending on
      // the shape of the <source> tag — normalize.
      const rawSource = (item as unknown as { source?: unknown }).source
      let source: string | null = null
      if (typeof rawSource === 'string') source = rawSource
      else if (
        rawSource &&
        typeof rawSource === 'object' &&
        '_' in (rawSource as Record<string, unknown>)
      ) {
        source = String((rawSource as Record<string, unknown>)._)
      }
      const publishedAt = item.pubDate ? Date.parse(item.pubDate) : NaN
      out.push({
        title: item.title.trim(),
        url: item.link,
        source: source?.trim() || null,
        publishedAt: Number.isFinite(publishedAt) ? publishedAt : null
      })
    }
    return out
  } catch (err) {
    console.warn(
      '[ipoBrief] news fetch failed:',
      err instanceof Error ? err.message : err
    )
    return []
  }
}

// ---------- HTML composition ----------

function buildBriefHTML(args: {
  input: IpoBriefInput
  offering: UpcomingIpo | null
  filings: EdgarFiling[]
  headlines: NewsHeadline[]
}): string {
  const { input, offering, filings, headlines } = args
  const parts: string[] = []

  parts.push(
    `<p><em>Synthesized from Nasdaq IPO calendar, SEC EDGAR, and recent news coverage. Data can lag real filings by a few hours.</em></p>`
  )

  if (offering) {
    parts.push('<h2>The offering</h2>')
    parts.push('<ul>')
    if (offering.expectedDate) {
      parts.push(
        `<li><strong>Expected pricing:</strong> ${esc(formatDate(offering.expectedDate))}</li>`
      )
    }
    if (offering.priceRange) {
      parts.push(`<li><strong>Price range:</strong> ${esc(offering.priceRange)}</li>`)
    }
    if (offering.sharesOffered) {
      parts.push(`<li><strong>Shares offered:</strong> ${esc(offering.sharesOffered)}</li>`)
    }
    if (offering.dollarValue) {
      parts.push(
        `<li><strong>Expected proceeds:</strong> ${esc(offering.dollarValue)}</li>`
      )
    }
    if (input.symbol) {
      parts.push(`<li><strong>Proposed ticker:</strong> ${esc(input.symbol)}</li>`)
    }
    parts.push('</ul>')
  } else {
    parts.push('<h2>The offering</h2>')
    parts.push(
      '<p>No offering terms found on Nasdaq yet. Check back closer to the expected pricing date — the calendar is updated as filings progress.</p>'
    )
  }

  if (filings.length > 0) {
    parts.push('<h2>SEC filings</h2>')
    parts.push(
      '<p>Prospectus and amendment filings. Open any to read the full S-1 on SEC.gov.</p>'
    )
    parts.push('<ul>')
    for (const f of filings) {
      parts.push(
        `<li><a href="${esc(f.url)}">${esc(f.form)}</a> — filed ${esc(formatDate(f.filedOn))} · accession ${esc(f.accessionNumber)}</li>`
      )
    }
    parts.push('</ul>')
  } else {
    parts.push('<h2>SEC filings</h2>')
    parts.push(
      '<p>No S-1 or S-1/A filings found for this name. This can happen if the company name on the Nasdaq calendar differs from the filing registrant — try searching EDGAR directly.</p>'
    )
  }

  if (headlines.length > 0) {
    parts.push('<h2>Recent coverage</h2>')
    parts.push('<ul>')
    for (const h of headlines) {
      const bits: string[] = [`<a href="${esc(h.url)}">${esc(h.title)}</a>`]
      const meta: string[] = []
      if (h.source) meta.push(esc(h.source))
      if (h.publishedAt) meta.push(esc(formatRelative(h.publishedAt)))
      if (meta.length > 0) {
        bits.push(` <span style="color:#888">· ${meta.join(' · ')}</span>`)
      }
      parts.push(`<li>${bits.join('')}</li>`)
    }
    parts.push('</ul>')
  }

  return parts.join('\n')
}

function esc(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms
  const hr = 3_600_000
  const day = 24 * hr
  if (diff < hr) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`
  if (diff < day) return `${Math.floor(diff / hr)}h ago`
  return `${Math.floor(diff / day)}d ago`
}
