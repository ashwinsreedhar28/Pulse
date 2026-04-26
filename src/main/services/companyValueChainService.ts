// Orchestrator for the "Generate value chain" button on the stock detail
// page. Pulls every grounding source we have for a ticker — company
// profile, latest 10-K Item 1, recent news — and hands them to the
// generateCompanyValueChain Ollama prompt, then resolves the returned
// node symbols to real tickers via companyNameResolver so links back to
// ticker detail pages work for the ones we can verify.

import { BrowserWindow, powerMonitor } from 'electron'

import { getDb } from '../database/connection'
import {
  getCompanyValueChain,
  getEdgesMentioningSymbol,
  listCompanyValueChainSymbols,
  setCompanyValueChain,
  type CompanyValueChain,
  type CompanyValueChainNode
} from '../database/companyValueChains'
import { getTickerBySymbol, listTickers } from '../database/tickers'
import { getFilingsForSymbol, lookupCik, type SecFiling } from '../database/secFilings'
import { resolveCompanyName } from './companyNameResolver'
import { ensureCompanyProfile, getCompanyProfile } from './companyProfileService'
import { generateCompanyValueChain as routedGenerate } from './aiClient'
import type { GeneratedValueChain } from './ollamaService'
import { callClaudeWithWebSearch, CLAUDE_MODELS } from './claudeService'
import { buildPrimaryDocUrl } from './secService'
import { forceRefreshFilings } from './secFilingsService'
import {
  ensureTickerSectorsClassified,
  getPrimarySectorForSymbol,
  getSector
} from './sectorService'
import { absorbGeneratedChain } from './chainAbsorberService'
import {
  applyCorrectionsToChain,
  formatCorrectionsForPrompt
} from './chainCorrectionsService'
import { markCorrectionsApplied } from '../database/chainCorrections'

const UA = 'Pulse Desktop (ashwin.sreedhar2003@gmail.com)'
const FETCH_TIMEOUT_MS = 30_000

function isAnnualReport(filing: SecFiling): boolean {
  return filing.formType === '10-K' || filing.formType === '10-K/A'
}

// Minimal HTML→text extractor tailored to SEC EDGAR documents. Building
// a full JSDOM (CSS parsing, layout box construction, scripting hooks)
// per fetch was the heaviest sustained CPU/GC load during regenerateAll
// runs — a 10-K easily blows past 1MB of HTML, and JSDOM allocates
// thousands of nodes per parse. SEC filings are well-formed enough that
// a regex-based strip is reliable AND ~10-50x faster.
//
// Strips, in order:
//   1. <script>, <style>, <noscript> blocks INCLUDING their text content
//   2. Inline XBRL nodes (<ix:*>) — these carry no human-readable text
//   3. All remaining tags
//   4. Common HTML entities (named + numeric)
//   5. Whitespace collapse + trim
function stripHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code)
      return Number.isFinite(n) && n > 0 && n < 65536 ? String.fromCharCode(n) : ' '
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = parseInt(hex, 16)
      return Number.isFinite(n) && n > 0 && n < 65536 ? String.fromCharCode(n) : ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
}

// Bundled return: the excerpt text plus the metadata about WHICH filing
// it came from. The chain generator threads this into its grounding-with-
// refs payload so edges grounded in the filing can carry a clickable
// citation back to the SEC archive URL.
interface FilingExcerptResult {
  excerpt: string
  filing: SecFiling
  url: string
  // Excerpt-extraction strategy used. Helps the prompt label what slice
  // of the document the model is reading ("Item 1 / Business" vs the
  // raw beginning of the filing).
  excerptHint: string
}

// Generic SEC filing body fetch + excerpt slice. Hits the same EDGAR
// archive URL pattern as fetchTenKExcerpt previously did, but takes a
// region-of-interest regex so each form type can target its most
// relevant section:
//   - 10-K:  Item 1 Business (value-chain disclosures + customer concentration)
//   - 10-Q:  Item 2 MD&A (recent quarter's business commentary)
//   - 8-K:   Item 7.01 / 8.01 / Item 2.02 / first exhibit
async function fetchFilingExcerpt(
  filing: SecFiling,
  excerptStrategy: { regex: RegExp; hint: string; preBuffer: number; window: number },
  fallbackHint: string
): Promise<FilingExcerptResult | null> {
  const url = buildPrimaryDocUrl(filing.cik, filing.accessionNumber, filing.primaryDocument)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html, application/xhtml+xml, text/plain'
      },
      signal: controller.signal
    })
    if (!res.ok) return null
    const html = await res.text()
    const text = stripHtmlToText(html)
    if (text.length < 300) return null
    const m = excerptStrategy.regex.exec(text)
    if (m) {
      const start = Math.max(0, m.index - excerptStrategy.preBuffer)
      const excerpt = text.slice(start, Math.min(text.length, start + excerptStrategy.window))
      return { excerpt, filing, url, excerptHint: excerptStrategy.hint }
    }
    return {
      excerpt: text.slice(0, excerptStrategy.window),
      filing,
      url,
      excerptHint: fallbackHint
    }
  } catch (err) {
    console.warn(
      `[companyChain] ${filing.formType} fetch failed for ${filing.symbol}:`,
      err instanceof Error ? err.message : err
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchTenKExcerpt(symbol: string): Promise<FilingExcerptResult | null> {
  // Form-filter pushed into SQL so we always find the most recent 10-K
  // even when it's behind dozens of Form 4 insider-trade filings.
  const filings = getFilingsForSymbol(symbol, 5, new Set(['10-K', '10-K/A']))
  const latest = filings[0]
  if (!latest) return null
  return fetchFilingExcerpt(
    latest,
    {
      regex: /item\s+1\.\s*business/i,
      hint: 'Item 1 / Business',
      preBuffer: 200,
      window: 6000
    },
    '10-K opening section'
  )
}

async function fetchTenQExcerpt(symbol: string): Promise<FilingExcerptResult | null> {
  const filings = getFilingsForSymbol(symbol, 5, new Set(['10-Q', '10-Q/A']))
  const latest = filings[0]
  if (!latest) return null
  return fetchFilingExcerpt(
    latest,
    {
      regex: /management['’]s\s+discussion\s+and\s+analysis|item\s+2\b/i,
      hint: 'Item 2 / MD&A',
      preBuffer: 200,
      window: 5000
    },
    '10-Q opening section'
  )
}

async function fetchEightKExcerpt(symbol: string): Promise<FilingExcerptResult | null> {
  // 8-K filings vary wildly — earnings releases, investor presentations,
  // material agreements, etc. Each Item code targets a different signal:
  //   2.02 = earnings release / financial results
  //   7.01 = Reg FD disclosure (investor day decks land here as Ex 99.1)
  //   1.01 = entry into material agreement (supply contracts, etc.)
  //   8.01 = "other events" (catch-all for press releases)
  // We slice broadly — most 8-Ks are short enough that a 5k-char window
  // captures the substance.
  const filings = getFilingsForSymbol(symbol, 5, new Set(['8-K', '8-K/A']))
  const latest = filings[0]
  if (!latest) return null
  return fetchFilingExcerpt(
    latest,
    {
      regex: /item\s+(2\.02|7\.01|1\.01|8\.01)/i,
      hint: '8-K disclosure',
      preBuffer: 100,
      window: 5000
    },
    '8-K opening section'
  )
}

// Per-process cache for raw SEC filing text + URL keyed by accession.
// Bilateral fetching (counterparty filings) and customer-concentration
// extraction both want to scan filing bodies, and a chain regen for one
// focus can hit the same counterparty's 10-K from multiple edges. Cache
// by accession so we never re-fetch the same document inside a single
// process lifetime. Cleared at process start; never invalidated since
// SEC accessions are immutable.
interface CachedFilingBody {
  text: string
  url: string
  filing: SecFiling
}
const filingBodyCache = new Map<string, CachedFilingBody>()

// Fetch the full text of a filing's primary document (no excerpt slicing).
// Used by bilateral counterparty scans + the customer-concentration parser
// where we need the WHOLE document, not just Item 1. Cached per accession.
async function fetchFilingBody(filing: SecFiling): Promise<CachedFilingBody | null> {
  const key = filing.accessionNumber
  const cached = filingBodyCache.get(key)
  if (cached) return cached
  const url = buildPrimaryDocUrl(filing.cik, filing.accessionNumber, filing.primaryDocument)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html, application/xhtml+xml, text/plain'
      },
      signal: controller.signal
    })
    if (!res.ok) return null
    const html = await res.text()
    const text = stripHtmlToText(html)
    if (text.length < 300) return null
    const body: CachedFilingBody = { text, url, filing }
    filingBodyCache.set(key, body)
    return body
  } catch (err) {
    console.warn(
      `[companyChain] filing body fetch failed for ${filing.symbol} ${filing.formType}:`,
      err instanceof Error ? err.message : err
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Customer-concentration parser. Extracts named customers from a 10-K's
// Item 7 / Item 1A disclosures — the "customers representing X% of net
// revenues" sentences companies are required to file when they have
// concentration risk. These are the highest-confidence customer edges
// we can produce because they're a regulatory-required disclosure, not
// the model's interpretation. Returns a list of {customerName, sentence}
// pairs the orchestrator can match against generated edges and attach
// the 10-K as a primary citation.
interface ConcentrationDisclosure {
  customerNames: string[]
  sentence: string
}
function parseCustomerConcentration(text: string): ConcentrationDisclosure[] {
  const out: ConcentrationDisclosure[] = []
  // Common patterns we look for:
  //   - "Customer A represented approximately 14% of net revenues"
  //   - "Two customers, X and Y, accounted for 22% and 11% of revenues"
  //   - "We have one customer, X, that represented more than 10%"
  //   - "Sales to X were approximately $... or 12% of total"
  // Slice text into sentences and scan each for percentage mentions
  // alongside customer/revenue keywords. Customer names get extracted
  // via simple heuristics (capitalized word sequences after "to" / "by"
  // / "with" / commas in the matched sentence). Tolerates noise — the
  // matched edges still have to align with the model's emitted edges,
  // which provides a second filter.
  const sentences = text.split(/(?<=[.!?])\s+/).slice(0, 1500)
  const concentrationRe =
    /\b(\d{1,2}(?:\.\d)?)\s*%[^.]*?(net revenues?|total revenues?|net sales|consolidated revenues?|of (?:our|the company['’]s|total) (?:revenues?|sales))/i
  const customerCueRe = /\bcustomer|client|account|sales\s+to\b/i
  for (const sentence of sentences) {
    if (sentence.length < 40 || sentence.length > 400) continue
    const concMatch = concentrationRe.exec(sentence)
    if (!concMatch) continue
    if (!customerCueRe.test(sentence)) continue
    const pct = Number(concMatch[1])
    if (!Number.isFinite(pct) || pct < 5 || pct > 90) continue
    // Pull capitalized name candidates out of the sentence — sequences
    // of 2+ TitleCase tokens or all-caps tokens. Filter against a tiny
    // stoplist of business-noise tokens that are TitleCase but not names.
    const stop = new Set([
      'United', 'States', 'America', 'Company', 'Corporation', 'Inc',
      'Limited', 'Ltd', 'Group', 'Net', 'Total', 'Revenue', 'Revenues',
      'Sales', 'Customers', 'Customer', 'Client', 'Clients', 'Item',
      'Note', 'Notes', 'Year', 'Years', 'Fiscal', 'Quarter', 'Annual',
      'Approximately', 'Reseller', 'Distributor'
    ])
    const tokens = sentence.match(/\b[A-Z][A-Za-z&.]+(?:\s+[A-Z][A-Za-z&.]+){1,5}\b/g) ?? []
    const names = new Set<string>()
    for (const t of tokens) {
      const trimmed = t.trim()
      const head = trimmed.split(/\s+/)[0]
      if (stop.has(head)) continue
      if (trimmed.length < 4) continue
      names.add(trimmed)
    }
    if (names.size === 0) continue
    out.push({ customerNames: [...names].slice(0, 4), sentence: sentence.trim().slice(0, 240) })
    if (out.length >= 6) break
  }
  return out
}

// Find the body section for a specific item heading in an SEC filing.
// Works for both 8-K item numbers ("1.01", "7.01", "2.03") and 10-K
// items ("1A", "7"). Critical TOC handling: 8-K and 10-K filings often
// list every item in a table of contents BEFORE the body, so a naive
// regex match would slice the TOC entry instead of the body. We use
// the LAST occurrence of the heading because the body always sits
// after the TOC. Caps the slice at 12K chars and trims at the next
// item heading or the signature/exhibit-index sentinel.
function findItemBodySection(text: string, itemNumber: string): string | null {
  const escaped = itemNumber.replace(/\./g, '\\.')
  const headerRe = new RegExp(`\\bitem\\s+${escaped}\\b`, 'gi')
  const matches: number[] = []
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(text)) !== null) {
    matches.push(m.index)
    // Defensive cap so a pathological filing doesn't blow up the loop.
    if (matches.length > 50) break
  }
  if (matches.length === 0) return null
  const startIdx = matches[matches.length - 1]
  const slice = text.slice(startIdx, startIdx + 12000)
  // Trim at the next item, signature block, or exhibit index. Skip the
  // first 30 chars of the slice when looking for these sentinels so we
  // don't accidentally trim at the heading itself (e.g. "Item 1.01 ...
  // Item 1.01 Entry into a Material Definitive Agreement").
  const tail = slice.slice(30).search(
    /\bitem\s+\d+[A-Z]?(\.\d+)?\b|\bsignatures?\b|\bexhibit\s+index\b|\bsignature\s+page\b/i
  )
  if (tail >= 0) {
    return slice.slice(0, 30 + tail)
  }
  return slice
}

// Bilateral counterparty filing fetcher. For each counterparty symbol
// in `counterpartySymbols`, look up its most recent 10-K and 10-Q (if
// resolvable to a CIK), fetch the body, and scan for mentions of the
// focus symbol or focus company name. Returns a list of {counterparty,
// filing, mentions} the orchestrator can fold into the citation pool.
//
// This is the structural fix for "10-Ks rarely name competitors": KLAC's
// 10-K doesn't name AMD as a customer, but AMD's 10-K mentions KLA-Tencor
// as a process-control vendor. Mining the counterparty side roughly
// doubles the citation hit rate for relationships where the focus has a
// non-zero counterparty.
interface BilateralFilingHit {
  counterpartySymbol: string
  filing: SecFiling
  url: string
  // The matched sentence (or short surrounding window) that the focus
  // mention appeared in — kept short for prompt-context use.
  excerpt: string
}
async function fetchBilateralFilings(input: {
  focusSymbol: string
  focusCompanyName: string
  counterpartySymbols: string[]
  // Cap the number of counterparty fetches per chain to keep regen-all
  // bounded. Defaults to 15 — typical chain has 8-15 ticker counterparties,
  // and now that we pre-warm the counterparty cache before this runs we
  // want to actually hit all of them rather than truncate at 8.
  maxCounterparties?: number
}): Promise<BilateralFilingHit[]> {
  const cap = input.maxCounterparties ?? 15
  const symbols = input.counterpartySymbols.slice(0, cap)
  const focusUpper = input.focusSymbol.toUpperCase()
  // Build a set of focus-mention search terms: the ticker + the company
  // name's distinctive tokens (corp-suffixes stripped). Threshold is 3
  // chars — "KLA" / "AMD" / "AMC" are real company-name tokens that
  // counterparty filings reference and that 4-char gating used to
  // silently drop. Word boundaries (\b) protect against false positives
  // from common prefixes like "ADM" hitting "admit".
  const stopSuffix = /\b(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLC|Company|Co\.?|Holdings|Group|PLC|N\.V\.|S\.A\.|AG)\b/gi
  const cleanedName = input.focusCompanyName.replace(stopSuffix, '').trim()
  const nameTokens = cleanedName
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
  const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const alternates = [focusUpper, ...nameTokens.map(escapeRe)]
  // Dedupe: focusUpper might already be one of the name tokens (rare).
  const uniqAlternates = [...new Set(alternates)]
  const mentionRe = new RegExp(`\\b(${uniqAlternates.join('|')})\\b`, 'i')
  const results: BilateralFilingHit[] = []
  // Sequential fetches to be polite to SEC. Per-counterparty timeout
  // already lives in fetchFilingBody so a single hung filing doesn't
  // tank the whole pass.
  // Per-counterparty diagnostic counters so the orchestrator log shows
  // exactly where bilateral fell off — was it CIK miss, body fetch fail,
  // no mention, or genuine clean scan?
  let noFiling = 0
  let bodyFetchFailed = 0
  let noMention = 0
  for (const sym of symbols) {
    if (sym === focusUpper) continue
    // Look for 10-K/10-Q specifically. The earlier "8 most-recent of any
    // form" approach often returned only Form 4s for active filers,
    // making this whole pass a no-op.
    const annualOrQuarterly = getFilingsForSymbol(
      sym,
      3,
      new Set(['10-K', '10-K/A', '10-Q', '10-Q/A'])
    )
    if (annualOrQuarterly.length === 0) {
      noFiling += 1
      continue
    }
    // Prefer the most recent 10-K — much richer narrative than 10-Q.
    const candidate =
      annualOrQuarterly.find(isAnnualReport) ?? annualOrQuarterly[0]
    const body = await fetchFilingBody(candidate)
    if (!body) {
      bodyFetchFailed += 1
      continue
    }
    const m = mentionRe.exec(body.text)
    if (!m) {
      noMention += 1
      continue
    }
    const start = Math.max(0, m.index - 200)
    const excerpt = body.text.slice(start, Math.min(body.text.length, start + 600)).trim()
    results.push({
      counterpartySymbol: sym,
      filing: candidate,
      url: body.url,
      excerpt
    })
  }
  console.log(
    `[companyChain] fetchBilateralFilings ${input.focusSymbol}: ` +
      `${results.length} hit(s), ${noFiling} no-10K/Q, ${bodyFetchFailed} body-fetch-failed, ` +
      `${noMention} no-mention (search terms: ${uniqAlternates.join('|')})`
  )
  return results
}

// Quick pull of the 6 most recent articles tagged to this symbol. Returns
// the full row metadata (id, url, publishedAt, feed title) so the chain
// generator can build [ref N1] / [ref N2] / ... entries the model can
// cite — and the renderer can later resolve those refs to clickable
// chips that open the in-app reader.
interface RecentNewsRow {
  articleId: number
  title: string
  summary: string | null
  url: string | null
  publishedAt: number | null
  feedTitle: string | null
}
// Relationship-keyword pre-filter for news article context. We fetch
// up to 30 most-recent articles tagged to the symbol, score each by
// whether its title/summary mentions a supplier/customer/competitor/
// partner term, then keep the top 15 ordered by recency. Catches
// Reuters/Bloomberg/FT pieces that actually discuss relationship
// dynamics rather than macro coverage that just happens to mention
// the ticker. Competitor terms were added in 2026-04 because pure
// supply-chain terms missed competitor-relationship coverage entirely.
const RELATIONSHIP_KEYWORDS = [
  // supply-chain
  'supplier',
  'supply',
  'customer',
  'partner',
  'partnership',
  'agreement',
  'contract',
  'deal',
  'acquire',
  'acquisition',
  'merger',
  'award',
  'selected',
  'won',
  'order',
  'shipment',
  'foundry',
  'fabricate',
  'license',
  'royalty',
  'distribut',
  'reseller',
  'OEM',
  'integrator',
  'tier',
  // competitor signals — Reuters / Bloomberg routinely write "X competes
  // with Y" / "rival Y said". Without these, the news pool is heavily
  // biased toward supplier coverage and competitor edges have nothing
  // to cite.
  'compete',
  'competitor',
  'rival',
  'rivalry',
  'market share',
  'lose share',
  'gain share',
  'head-to-head',
  'against',
  'beat',
  'outperform',
  'underperform'
]

// Aggregator publishers that re-host content and should never be
// preferred over the primary source. Yahoo dominates Pulse's news pool
// because Yahoo Finance / Yahoo News are high-volume aggregator feeds;
// without a penalty, edges that should cite Reuters or Bloomberg end up
// citing Yahoo's reprint of the same story (same content, less specific
// attribution). We don't FILTER aggregators — they often carry the only
// available copy of a story Pulse has indexed — but we deprioritize.
const AGGREGATOR_PENALTY_FEEDS = [
  'yahoo',
  'msn money',
  'seeking alpha'
]

function isAggregatorFeed(feedTitle: string | null): boolean {
  if (!feedTitle) return false
  const lower = feedTitle.toLowerCase()
  return AGGREGATOR_PENALTY_FEEDS.some((agg) => lower.includes(agg))
}

function fetchRecentNews(symbol: string, companyName?: string): RecentNewsRow[] {
  const upper = symbol.toUpperCase()
  const matchedCount = { matched: 0, fallback: 0, final: 0 }
  const matched = getDb()
    .prepare<[string, number], RecentNewsRow>(
      `SELECT a.id        AS articleId,
              a.title     AS title,
              a.summary   AS summary,
              a.url       AS url,
              a.publishedAt AS publishedAt,
              f.title     AS feedTitle
         FROM articles a
         JOIN article_ticker_matches m ON m.articleId = a.id
         LEFT JOIN feeds f ON f.id = a.feedId
        WHERE m.symbol = ?
        ORDER BY a.publishedAt DESC
        LIMIT ?`
    )
    .all(upper, 30)
  // Fallback: when the strict ticker-matcher returns few or no articles,
  // fall back to a substring scan on company name + ticker. The matcher
  // builds article_ticker_matches from the tickerReference alias list,
  // which has gaps for less-common tickers (e.g. "KLA" never appearing
  // in headlines as "KLAC"). Without this, focuses with thin matched-
  // article counts get ZERO news refs in the prompt and edges that
  // should cite Reuters fall back to model-knowledge cites that the
  // strict-cite gate then drops.
  matchedCount.matched = matched.length
  let candidates: RecentNewsRow[] = matched
  if (candidates.length < 8) {
    const seenIds = new Set(candidates.map((c) => c.articleId))
    // Build search keys: ticker (always) plus the company name's first
    // meaningful word once corp-suffix words are stripped. "KLA Corporation"
    // → "KLA"; "Apple Inc." → "Apple"; "JPMorgan Chase & Co." → "JPMorgan".
    const stopSuffix = /\b(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLC|Company|Co\.?|Holdings|Group|PLC|N\.V\.|S\.A\.|AG)\b/gi
    const cleaned = (companyName ?? '').replace(stopSuffix, '').trim()
    const head = cleaned.split(/\s+/)[0]?.trim() ?? ''
    const keys: string[] = []
    // Ticker only safe when ≥3 chars. Single- or two-letter tickers
    // (F, T, V, C, ON, GM, KO) substring-match basically every article
    // — Ford's news pool would otherwise fill with sports articles
    // containing the letter F. For short tickers we rely on the company
    // name only.
    if (upper.length >= 3) keys.push(upper)
    if (head.length >= 3) keys.push(head)
    if (keys.length === 0) {
      // No reliable search key available; skip fallback rather than
      // pull in junk via a 1-char wildcard.
      return matched
    }
    const placeholders = keys
      .map(() => `(LOWER(a.title) LIKE ? OR LOWER(a.summary) LIKE ?)`)
      .join(' OR ')
    const params: string[] = []
    for (const k of keys) {
      const pat = `%${k.toLowerCase()}%`
      params.push(pat, pat)
    }
    const fallback = getDb()
      .prepare<unknown[], RecentNewsRow>(
        `SELECT a.id        AS articleId,
                a.title     AS title,
                a.summary   AS summary,
                a.url       AS url,
                a.publishedAt AS publishedAt,
                f.title     AS feedTitle
           FROM articles a
           LEFT JOIN feeds f ON f.id = a.feedId
          WHERE ${placeholders}
          ORDER BY a.publishedAt DESC
          LIMIT 50`
      )
      .all(...params) as RecentNewsRow[]
    let added = 0
    for (const row of fallback) {
      if (seenIds.has(row.articleId)) continue
      seenIds.add(row.articleId)
      candidates.push(row)
      added += 1
      if (candidates.length >= 60) break
    }
    matchedCount.fallback = added
  }
  if (candidates.length === 0) {
    console.log(
      `[companyChain] fetchRecentNews ${upper}: matched=0, fallback=0, final=0 (no articles in DB mention ticker or company-name)`
    )
    return candidates
  }
  // Score: relationship-keyword hits earn points, aggregator-feed hits
  // lose points, recency tiebreaks. Goal is to surface trade-press
  // primary sources (Reuters direct, FT, Bloomberg, FreightWaves) above
  // aggregator reprints when both are present.
  const matches = (text: string | null): boolean => {
    if (!text) return false
    const lower = text.toLowerCase()
    return RELATIONSHIP_KEYWORDS.some((kw) => lower.includes(kw))
  }
  const scored = candidates.map((c) => {
    let score = 0
    if (matches(c.title)) score += 2
    if (matches(c.summary)) score += 1
    if (isAggregatorFeed(c.feedTitle)) score -= 3
    return { row: c, score, ts: c.publishedAt ?? 0 }
  })
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    return b.ts - a.ts
  })
  const final = scored.slice(0, 15).map((s) => s.row)
  matchedCount.final = final.length
  console.log(
    `[companyChain] fetchRecentNews ${upper}: matched=${matchedCount.matched}, fallback=${matchedCount.fallback}, final=${matchedCount.final}`
  )
  return final
}

function broadcastUpdated(symbol: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('companyChain:updated', symbol.toUpperCase())
    }
  }
}

// Resolve Ollama-named companies to real tickers so the detail-page links
// work. Model-emitted symbols come in two flavors:
//   - Ticker-shaped ("KO", "CCEP"): try to verify via the resolver.
//   - Underscore labels ("SUEZ_WATER"): derive a search key from the name
//     field instead and see if the resolver matches it.
// Unresolvable nodes still render — they just carry kind='unverified' so
// the UI can flag them as inferred rather than grounded.
function resolveNodes(
  rawNodes: GeneratedValueChain['nodes'],
  focusSymbol: string
): CompanyValueChainNode[] {
  const out: CompanyValueChainNode[] = []
  for (const n of rawNodes) {
    // Focus node is always treated as a verified ticker.
    if (n.symbol === focusSymbol) {
      out.push({
        symbol: n.symbol,
        stage: n.stage,
        name: n.name,
        blurb: n.blurb,
        kind: 'ticker'
      })
      continue
    }
    const tickerLike = /^[A-Z]{1,5}(\.[A-Z]{1,3})?$/.test(n.symbol)
    // "Both agree" path: when the model emits a ticker-shaped symbol and
    // the resolver independently arrives at the same symbol from the
    // company name, that's a two-source convergence — strongest form of
    // verification. Accept at any resolver score because the convergence
    // itself is the signal. The isTicker flag from Ollama is ignored here
    // because the model often hedges and sets it to false even when both
    // sides clearly agree (observed for BAC, WFC, C etc.).
    if (tickerLike) {
      const resolved = resolveCompanyName(n.name)
      if (resolved && resolved.symbol === n.symbol) {
        out.push({
          symbol: n.symbol,
          stage: n.stage,
          name: n.name,
          blurb: n.blurb,
          kind: 'ticker'
        })
        continue
      }
      // Second chance: when the model's name IS just the ticker symbol
      // (e.g., {symbol: "UPS", name: "UPS"}), the resolver has nothing to
      // go on — "ups" normalized doesn't match "united parcel service".
      // Verify directly against the SEC ticker map: if a real filer with
      // that symbol exists, trust the model's claim. The tickerLike shape
      // guard keeps placeholder labels (PRIVATE_LABEL_MFG, BBBY_DC) out.
      if (n.name.trim().toUpperCase() === n.symbol && lookupCik(n.symbol)) {
        out.push({
          symbol: n.symbol,
          stage: n.stage,
          name: n.name,
          blurb: n.blurb,
          kind: 'ticker'
        })
        continue
      }
      // Third chance: resolver found NOTHING (not a different ticker, just
      // null) AND the model's claimed symbol exists in sec_cik_map. The
      // typical case is {symbol: TSM, name: "TSMC"} — "tsmc" doesn't
      // normalize to anything SEC carries, so resolver returns null. But
      // TSM IS a real filer, so trusting the claim is safe. We explicitly
      // guard on resolved===null so that when the resolver DOES find a
      // different canonical (e.g., SCHL + "Schlumberger Limited" → SLB),
      // we fall through to the name-only path below and adopt the
      // resolver's correction rather than the model's (wrong) ticker.
      if (!resolved && lookupCik(n.symbol)) {
        out.push({
          symbol: n.symbol,
          stage: n.stage,
          name: n.name,
          blurb: n.blurb,
          kind: 'ticker'
        })
        continue
      }
    }
    // Name-only path: the model's ticker disagrees with the resolver (or
    // isn't ticker-shaped), but the name alone resolves. Accept the
    // resolver's symbol in place of the model's.
    const resolved = resolveCompanyName(n.name)
    // 0.75 = word-boundary match with multi-candidate disambiguation
    // ("Siemens AG" → SMERY, "Coherent" → COHR, "Kioxia" → KXIAY,
    // "CATL" → CYATY, "Alps Alpine" → ALPS). 0.8+ = exact normalize hit
    // or acronym match. Originally we gated at 0.8 which left the 0.75
    // word-boundary hits stranded — regen logs showed a dozen of them.
    // 0.75 stays safe because word-boundary requires a whole-word match,
    // not fuzzy overlap.
    if (resolved && resolved.score >= 0.75) {
      out.push({
        symbol: resolved.symbol,
        stage: n.stage,
        name: n.name,
        blurb: n.blurb,
        kind: 'ticker'
      })
      continue
    }
    // Fall through: keep as unverified node. Log what fell through so the
    // user can spot systematic classifier gaps (e.g. a legacy-name the
    // model keeps emitting that deserves a NAME_ALIASES entry).
    console.log(
      `[companyChain] unverified node: claimed=${n.symbol} name="${n.name}"` +
        (resolved ? ` (resolver: ${resolved.symbol}@${resolved.score.toFixed(2)})` : ' (resolver: miss)')
    )
    out.push({
      symbol: n.symbol,
      stage: n.stage,
      name: n.name,
      blurb: n.blurb,
      kind: 'unverified'
    })
  }
  return out
}

// Claude (and Ollama) frequently emit edges that reference companies using
// slightly different symbol strings than the nodes array uses — "MACOM" in
// edges vs "MTSI" in nodes, "AMKOR" vs "AMKR", "ASE" vs "ASX", "SMSN" vs
// "SSNLF", "INFINEON" vs "IFNNY". The downstream absorber requires BOTH
// endpoints to exist in the chain's node list, so these mismatches cause
// every edge touching the renamed entity to silently drop — leaving the
// node stranded with zero connections in the unified Value Chain + Diagram
// views. We canonicalize here: build an alias index from node names, then
// rewrite edges. Drops edges whose endpoints we still can't resolve.
type ChainEdge = {
  from: string
  to: string
  relationship: 'supplier' | 'customer' | 'competitor' | 'partner'
  note: string | null
  source: 'filings' | 'news' | 'model' | null
  // Array of refs the model cited as supporting this edge. attachCitations
  // resolves each to a CompanyValueChainEdgeCitation; the renderer stacks
  // them as multiple clickable pills under the edge note. Null / empty
  // means the model didn't cite anything (typically source='model').
  // Accepts null too so GeneratedValueChainEdge (which carries the same
  // optional-or-null shape from the parser) flows through without a
  // narrowing copy.
  sourceRefs?: string[] | null
  // Free-text training-source attribution emitted when source='model'.
  // Used by attachCitations to pattern-resolve into a real citation;
  // strict mode drops edges where this can't be resolved.
  modelSource?: string | null
}

// Resolve the model-emitted sourceRef ("F" / "F2" / "F3" / "F4..Fn" /
// "N1" / ...) on each edge into a structured CompanyValueChainEdgeCitation
// that the renderer can turn into a clickable chip. STRICT-CITATION MODE:
// edges that can't be resolved to a primary-document citation (SEC filing
// or in-app article) are DROPPED here so the rendered graph only contains
// edges with real provenance the user can click through.
//
// Profile blurbs and analyst rating actions used to be resolvable refs
// (P, A1..A5) but were dropped — they don't evidence relationships.
//
// Resolution order per edge:
//   1. Direct ref lookup (F* → filings, N* → articles)
//   2. Pattern match on modelSource (10-K / 8-K / 10-Q strings, publisher
//      names) → resolved filing or article citation
//   3. Drop the edge.
interface FilingCitationData {
  accession: string
  cik: string
  formType: string
  filedAt: number
  url: string
}
interface ArticleCitationData {
  articleId: number
  title: string
  // Summary kept around so the auto-augment cue check can scan body
  // text (some publishers put the relationship verb in the summary
  // while the title is just "Ford, Tesla").
  summary: string | null
  url: string | null
  publishedAt: number | null
  feedTitle: string | null
}
// Resolve common patterns in the model's free-text modelSource attribution
// to a primary-document citation. Catches strings like "AAPL FY2023 10-K"
// / "TSM 8-K Mar 2024" / "Bloomberg AAPL supply chain 2024" and upgrades
// the citation from kind:'model' to kind:'filing' or kind:'article' with
// a clickable URL. Returns null when nothing matched (caller drops the
// edge in strict mode). Analyst-firm and profile patterns used to resolve
// here too but were dropped — those aren't primary-document sources.
function patternResolveModelSource(
  attribution: string,
  focusSymbol: string
): import('../database/companyValueChains').CompanyValueChainEdgeCitation | null {
  const text = attribution.trim()
  if (!text) return null
  const upper = text.toUpperCase()

  // SEC filing patterns: 10-K / 10-Q / 8-K / DEF 14A. We optimistically
  // match against the focus symbol's local SEC cache. Year extraction is
  // best-effort: we look for either "FY" + 4-digit year, or a bare 20xx
  // year token. Filing matched by form type + filedAt year (allowing for
  // the typical filing-after-period-end gap).
  const formMatch = upper.match(/\b(10-?K|10-?Q|8-?K|DEF\s*14A)\b/)
  if (formMatch) {
    const formType = formMatch[1].replace(/(\d)([KQ])/, '$1-$2') // "10K" -> "10-K"
    const yearMatch = upper.match(/(?:FY)?\s*(20\d{2})/)
    const year = yearMatch ? Number(yearMatch[1]) : null
    const filings = getFilingsForSymbol(focusSymbol, 30)
    let candidate = filings.find((f) => {
      if (f.formType !== formType && f.formType !== `${formType}/A`) return false
      if (!year) return true
      const filedYear = new Date(f.filedAt).getFullYear()
      // 10-K for FY2023 typically files in 2024 (3-month gap). Accept
      // either the year matches OR year+1 matches.
      return filedYear === year || filedYear === year + 1
    })
    if (!candidate && year) {
      // Fallback: nearest filing of that form type — better some link
      // than none if year mismatch.
      candidate = filings.find((f) => f.formType === formType || f.formType === `${formType}/A`)
    }
    if (candidate) {
      return {
        kind: 'filing',
        accession: candidate.accessionNumber,
        cik: candidate.cik,
        formType: candidate.formType,
        filedAt: candidate.filedAt,
        url: buildPrimaryDocUrl(candidate.cik, candidate.accessionNumber, candidate.primaryDocument)
      }
    }
  }

  // Investor day / earnings call → most recent 8-K.
  if (/INVESTOR\s+DAY|EARNINGS\s+CALL|EARNINGS\s+RELEASE|REGULATION\s+FD/.test(upper)) {
    const filings = getFilingsForSymbol(focusSymbol, 20)
    const eightK = filings.find((f) => f.formType === '8-K' || f.formType === '8-K/A')
    if (eightK) {
      return {
        kind: 'filing',
        accession: eightK.accessionNumber,
        cik: eightK.cik,
        formType: eightK.formType,
        filedAt: eightK.filedAt,
        url: buildPrimaryDocUrl(eightK.cik, eightK.accessionNumber, eightK.primaryDocument)
      }
    }
  }

  // Analyst note patterns used to resolve to a Yahoo Finance analyst page
  // here — dropped because rating actions don't evidence relationships and
  // the Yahoo page doesn't actually contain the cited claim.

  // Bloomberg / Reuters / FT / WSJ / etc. — search local article DB for
  // a matching article. If we have one tagged to the focus that mentions
  // the publisher in title or summary, link to it. Otherwise null.
  const publisherMatch = upper.match(
    /\b(BLOOMBERG|REUTERS|WSJ|FT|FINANCIAL TIMES|CNBC|BARRON|FORBES|FORTUNE|ECONOMIST|NIKKEI)\b/
  )
  if (publisherMatch) {
    const pubKw = publisherMatch[1].toLowerCase()
    const article = getDb()
      .prepare<
        [string, string, string, string],
        { id: number; title: string; url: string | null; publishedAt: number | null; feedTitle: string | null }
      >(
        `SELECT a.id, a.title, a.url, a.publishedAt, f.title AS feedTitle
           FROM articles a
           JOIN article_ticker_matches m ON m.articleId = a.id
           LEFT JOIN feeds f ON f.id = a.feedId
          WHERE m.symbol = ?
            AND (LOWER(f.title) LIKE '%' || ? || '%'
                 OR LOWER(a.title) LIKE '%' || ? || '%'
                 OR LOWER(a.url) LIKE '%' || ? || '%')
          ORDER BY a.publishedAt DESC
          LIMIT 1`
      )
      .get(focusSymbol.toUpperCase(), pubKw, pubKw, pubKw) as
      | { id: number; title: string; url: string | null; publishedAt: number | null; feedTitle: string | null }
      | undefined
    if (article) {
      return {
        kind: 'article',
        articleId: article.id,
        title: article.title,
        url: article.url,
        publishedAt: article.publishedAt,
        feedTitle: article.feedTitle
      }
    }
  }

  return null
}

// Resolve a single ref string into a citation. Returns null when the ref
// doesn't match anything we supplied (caller decides whether to drop or
// fall through to pattern-resolution). Only filing-refs (F*) and
// article-refs (N*) are accepted — profile (P) and analyst (A*) refs
// were dropped along with their kinds.
function resolveRef(
  ref: string,
  filingsByRef: Map<string, FilingCitationData>,
  articlesByRef: Map<string, ArticleCitationData>
): import('../database/companyValueChains').CompanyValueChainEdgeCitation | null {
  const upper = ref.toUpperCase()
  if (upper.startsWith('F') && filingsByRef.has(upper)) {
    const f = filingsByRef.get(upper)!
    return {
      kind: 'filing',
      accession: f.accession,
      cik: f.cik,
      formType: f.formType,
      filedAt: f.filedAt,
      url: f.url
    }
  }
  if (upper.startsWith('N') && articlesByRef.has(upper)) {
    const a = articlesByRef.get(upper)!
    return {
      kind: 'article',
      articleId: a.articleId,
      title: a.title,
      url: a.url,
      publishedAt: a.publishedAt,
      feedTitle: a.feedTitle
    }
  }
  return null
}

// Build a word-boundary haystack matcher for an edge endpoint that
// avoids the short-ticker substring trap. Single-letter or two-letter
// tickers (F, T, V, C, ON, GM, KO) substring-match basically every
// article — Ford's news pool would pull every headline containing the
// letter F. Word boundaries fix the obvious case ("FOOTBALL" doesn't
// match "\bF\b"), but we still tighten further: tickers <3 chars are
// only used in combination with a company-name needle, since "F" or
// "ON" still appear as standalone words in plenty of headlines.
function buildEndpointMatcher(
  symbol: string,
  name: string | undefined
): ((haystack: string) => boolean) | null {
  const upper = symbol.toUpperCase()
  const stopSuffix = /\b(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLC|Company|Co\.?|Holdings|Group|PLC|N\.V\.|S\.A\.|AG)\b/gi
  const cleaned = (name ?? '').replace(stopSuffix, '').trim()
  const head = cleaned.split(/\s+/)[0]?.trim().toUpperCase() ?? ''
  const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const needles: string[] = []
  if (upper.length >= 3) needles.push(upper)
  if (head.length >= 4 && head !== upper) needles.push(head)
  if (cleaned.length >= 5) {
    const cleanedUpper = cleaned.toUpperCase()
    if (cleanedUpper !== head && cleanedUpper !== upper) {
      needles.push(cleanedUpper)
    }
  }
  if (needles.length === 0) {
    // No reliable needle (e.g. ticker is "F" and company name unknown).
    // Caller should treat this endpoint as un-matchable.
    return null
  }
  const regexes = needles.map((n) => new RegExp(`\\b${escape(n)}\\b`))
  return (haystack: string): boolean => regexes.some((re) => re.test(haystack))
}

// Auto-augmentation: scan the supplied article context for any pieces
// that mention BOTH endpoints of the edge. Add those as additional
// supporting citations beyond what the model picked. Catches the
// common case where the model grounded an edge in the 10-K and forgot
// that Bloomberg also covered it. Capped at 2 extras per edge.
function autoAugmentArticleCitations(
  edge: ChainEdge,
  articlesByRef: Map<string, ArticleCitationData>,
  alreadyCited: Set<string>,
  nameBySymbol: Map<string, string>
): import('../database/companyValueChains').CompanyValueChainEdgeCitation[] {
  const fromMatcher = buildEndpointMatcher(
    edge.from,
    nameBySymbol.get(edge.from.toUpperCase())
  )
  const toMatcher = buildEndpointMatcher(
    edge.to,
    nameBySymbol.get(edge.to.toUpperCase())
  )
  // If we can't reliably build a matcher for either endpoint (no usable
  // ticker, no usable company name), skip auto-augment. Better no
  // article cite than a sports article attached because of a one-letter
  // ticker substring collision.
  if (!fromMatcher || !toMatcher) return []
  // Relationship-cue requirement: an article that mentions both
  // endpoints as standalone words STILL needs to be ABOUT the
  // relationship to count as evidence. Without this, a Bleacher Report
  // sports article mentioning "Ford executive" + "Tesla event" gets
  // attached to a Ford↔Tesla competitor edge even though it's not
  // documenting their rivalry. The cue regex captures the vocabulary
  // companies + trade press actually use to describe relationships.
  const relCueRe =
    /\b(supplier|customer|partner(ship)?|compet|rival|deal|contract|agreement|acquir|merger|order|shipment|licens|royalty|suppl(y|ies|ied)|invest(ed|ment)?|launch(es)?|announc|provid|select(ed)?|award|expand|collaborat|join(t|s)?\s+venture|jv\b|MOU\b)\b/i
  const extras: import('../database/companyValueChains').CompanyValueChainEdgeCitation[] = []
  for (const [refId, a] of articlesByRef) {
    if (extras.length >= 2) break
    if (alreadyCited.has(refId)) continue // model already cited this
    const articleIdKey = `__articleId:${a.articleId}`
    if (alreadyCited.has(articleIdKey)) continue
    const haystack = `${a.title} ${a.feedTitle ?? ''}`.toUpperCase()
    if (!fromMatcher(haystack) || !toMatcher(haystack)) continue
    // Both endpoints land — now require relationship language. Title
    // and summary both checked since some publishers put the verb in
    // the summary while keeping the title terse ("Ford, Tesla" vs
    // "Ford signs supply deal with Tesla").
    const cueText = `${a.title} ${a.summary ?? ''}`
    if (!relCueRe.test(cueText)) continue
    extras.push({
      kind: 'article',
      articleId: a.articleId,
      title: a.title,
      url: a.url,
      publishedAt: a.publishedAt,
      feedTitle: a.feedTitle
    })
    alreadyCited.add(refId)
    alreadyCited.add(articleIdKey)
  }
  return extras
}

// Resolve refs + pattern-match the model's modelSource + auto-augment
// from the article pool. Does NOT drop empty-citation edges — that's the
// caller's job after any further augmentation passes (bilateral SEC,
// customer-concentration parser, web search). Returns one entry per
// input edge, with .citations possibly empty.
function attachCitations(
  edges: ChainEdge[],
  filingsByRef: Map<string, FilingCitationData>,
  articlesByRef: Map<string, ArticleCitationData>,
  focusSymbol: string,
  nameBySymbol: Map<string, string>
): import('../database/companyValueChains').CompanyValueChainEdge[] {
  const out: import('../database/companyValueChains').CompanyValueChainEdge[] = []
  let augmented = 0
  for (const edge of edges) {
    const citations: import('../database/companyValueChains').CompanyValueChainEdgeCitation[] = []
    const seenRefs = new Set<string>()
    // Resolve every ref the model emitted into a citation. Skip refs
    // that don't match anything we supplied (NEVER fabricate).
    for (const rawRef of edge.sourceRefs ?? []) {
      const upper = rawRef.toUpperCase()
      if (seenRefs.has(upper)) continue
      const cite = resolveRef(upper, filingsByRef, articlesByRef)
      if (cite) {
        citations.push(cite)
        seenRefs.add(upper)
        // Track article-id dedup separately since auto-augment uses it.
        if (cite.kind === 'article') {
          seenRefs.add(`__articleId:${cite.articleId}`)
        }
      }
    }
    // If nothing resolved AND source='model' with a free-text attribution,
    // try pattern-matching as a last resort (10-K / 8-K / 10-Q patterns,
    // publisher names → local article DB).
    if (citations.length === 0 && edge.source === 'model' && edge.modelSource) {
      const patternCite = patternResolveModelSource(edge.modelSource, focusSymbol)
      if (patternCite) citations.push(patternCite)
    }
    // Auto-augment: scan supplied articles for ones mentioning BOTH
    // endpoints. Adds up to 2 extra citations beyond what the model
    // chose — catches "the 10-K AND Bloomberg covered this" for free.
    const extras = autoAugmentArticleCitations(edge, articlesByRef, seenRefs, nameBySymbol)
    if (extras.length > 0) {
      citations.push(...extras)
      augmented += extras.length
    }
    out.push({
      from: edge.from,
      to: edge.to,
      relationship: edge.relationship,
      note: edge.note,
      source: edge.source,
      citations
    })
  }
  if (augmented > 0) {
    console.log(
      `[companyChain] attachCitations: +${augmented} auto-augmented from article cross-references`
    )
  }
  return out
}

// Bilateral citation augment: for any edge still missing a citation after
// the initial pass, look up the counterparty's most recent 10-K / 10-Q
// and scan for mentions of the focus. If we find one, attach it as a
// kind:'filing' citation. This is the structural fix for "10-Ks rarely
// name competitors" — the focus's own filings often miss relationships
// that the COUNTERPARTY's filing names explicitly. Bounded by the
// counterparty cap inside fetchBilateralFilings.
async function bilateralAugmentCitations(
  edges: import('../database/companyValueChains').CompanyValueChainEdge[],
  focusSymbol: string,
  focusCompanyName: string
): Promise<import('../database/companyValueChains').CompanyValueChainEdge[]> {
  const focus = focusSymbol.toUpperCase()
  // Collect counterparty symbols from edges that lack ANY primary-source
  // citation. We don't bother bilateral-fetching for edges that already
  // have a 10-K or article cite.
  const counterpartySet = new Set<string>()
  for (const e of edges) {
    const hasPrimary = e.citations?.some(
      (c) => c.kind === 'filing' || c.kind === 'article'
    )
    if (hasPrimary) continue
    const from = e.from.toUpperCase()
    const to = e.to.toUpperCase()
    // Pick whichever side isn't the focus.
    const counterparty = from !== focus ? from : to
    if (counterparty && counterparty !== focus) counterpartySet.add(counterparty)
  }
  if (counterpartySet.size === 0) {
    console.log(
      `[companyChain] bilateralAugmentCitations: 0 cite-less edges to scan for ${focus}`
    )
    return edges
  }

  const hits = await fetchBilateralFilings({
    focusSymbol: focus,
    focusCompanyName,
    counterpartySymbols: [...counterpartySet]
  })
  if (hits.length === 0) {
    console.log(
      `[companyChain] bilateralAugmentCitations: scanned ${counterpartySet.size} counterparty filing(s), 0 mentions found`
    )
    return edges
  }
  // Index hits by counterparty for O(1) lookup when re-walking edges.
  const hitsByCounterparty = new Map<string, BilateralFilingHit>()
  for (const h of hits) hitsByCounterparty.set(h.counterpartySymbol.toUpperCase(), h)

  let attached = 0
  const out = edges.map((e) => {
    const from = e.from.toUpperCase()
    const to = e.to.toUpperCase()
    const counterparty = from !== focus ? from : to
    if (!counterparty || counterparty === focus) return e
    const hit = hitsByCounterparty.get(counterparty)
    if (!hit) return e
    const cite: import('../database/companyValueChains').CompanyValueChainEdgeCitation = {
      kind: 'filing',
      accession: hit.filing.accessionNumber,
      cik: hit.filing.cik,
      formType: hit.filing.formType,
      filedAt: hit.filing.filedAt,
      url: hit.url
    }
    // Skip if we somehow already have this exact accession on the edge
    // (shouldn't happen since the bilateral path only fires when there
    // were no primary cites, but defensive).
    const existing = e.citations ?? []
    if (existing.some((c) => c.kind === 'filing' && c.accession === hit.filing.accessionNumber)) {
      return e
    }
    attached += 1
    return {
      ...e,
      // Bump source to 'filings' since the bilateral cite is a primary
      // SEC document. Keep null/'model' on edges where the bilateral
      // fetch didn't find anything.
      source: 'filings' as const,
      citations: [...existing, cite]
    }
  })
  console.log(
    `[companyChain] bilateralAugmentCitations: scanned ${counterpartySet.size} counterparties, found ${hits.length} hit(s), +${attached} cites attached`
  )
  return out
}

// Customer-concentration augment: pull the focus's 10-K body, parse for
// "customer X represented Y% of revenues" disclosures, and attach the
// 10-K as a citation on every edge whose counterparty matches one of
// the named customers. This is the highest-confidence customer-edge
// signal we can produce — concentration thresholds are a regulatory
// disclosure, not a model interpretation.
async function concentrationAugmentCitations(
  edges: import('../database/companyValueChains').CompanyValueChainEdge[],
  focusSymbol: string
): Promise<import('../database/companyValueChains').CompanyValueChainEdge[]> {
  const focus = focusSymbol.toUpperCase()
  const tenKs = getFilingsForSymbol(focus, 3, new Set(['10-K', '10-K/A']))
  const latest = tenKs[0]
  if (!latest) {
    console.log(
      `[companyChain] concentrationAugmentCitations: no 10-K available for ${focus}`
    )
    return edges
  }
  const body = await fetchFilingBody(latest)
  if (!body) {
    console.log(
      `[companyChain] concentrationAugmentCitations: failed to fetch 10-K body for ${focus}`
    )
    return edges
  }
  const concentrations = parseCustomerConcentration(body.text)
  if (concentrations.length === 0) {
    console.log(
      `[companyChain] concentrationAugmentCitations: no >10% customer-concentration disclosures found in ${focus}'s 10-K`
    )
    return edges
  }
  // Build a name→ConcentrationDisclosure index. We match by "first word
  // contains" so "Apple" matches "Apple Inc." cleanly without dragging
  // in companies that happen to share later tokens.
  const allNames: Array<{ name: string; head: string; cite: import('../database/companyValueChains').CompanyValueChainEdgeCitation }> = []
  const cite: import('../database/companyValueChains').CompanyValueChainEdgeCitation = {
    kind: 'filing',
    accession: latest.accessionNumber,
    cik: latest.cik,
    formType: latest.formType,
    filedAt: latest.filedAt,
    url: body.url
  }
  for (const c of concentrations) {
    for (const name of c.customerNames) {
      const head = name.split(/\s+/)[0]?.toUpperCase()
      if (!head || head.length < 4) continue
      allNames.push({ name, head, cite })
    }
  }
  if (allNames.length === 0) return edges
  let attached = 0
  const out = edges.map((e) => {
    // Only customer-flowing edges: focus is supplier (focus → counterparty).
    // Concentration disclosures are about customers, not suppliers.
    const from = e.from.toUpperCase()
    const to = e.to.toUpperCase()
    if (e.relationship !== 'supplier') return e
    if (from !== focus) return e
    // Counterparty is the `to` side here. Match by company name head if
    // the renderer carries one — fall back to symbol comparison since
    // concentration filings name companies, not tickers.
    // We don't have the resolved name on the edge object; the caller
    // already stamped name into resolvedNodes. So matching by symbol
    // alone — concentration disclosures often use the company's full
    // name (e.g. "Apple Inc.") which our heuristic head-matcher reduces
    // to "APPLE", which won't equal symbol "AAPL". For a robust match
    // we'd need access to nodeBySymbol; for now this catches the
    // common case where the model's symbol == the disclosure's first
    // word (e.g. ticker happens to match). A future pass can wire
    // nodeBySymbol in.
    const matchesAny = allNames.some(({ head }) => head === to)
    if (!matchesAny) return e
    const existing = e.citations ?? []
    if (existing.some((c) => c.kind === 'filing' && c.accession === cite.accession)) {
      return e
    }
    attached += 1
    return {
      ...e,
      source: 'filings' as const,
      citations: [...existing, cite]
    }
  })
  console.log(
    `[companyChain] concentrationAugmentCitations: parsed ${concentrations.length} disclosure(s) from ${focus}'s 10-K, +${attached} cites attached`
  )
  return out
}

// Material-agreement augment: scan focus's recent 8-K filings for
// "Item 1.01 Entry into a Material Definitive Agreement" disclosures.
// 8-K Item 1.01 is filed within 4 business days of signing a material
// contract (supply agreement, manufacturing agreement, license deal,
// JV, etc.) — by SEC rule it must name the counterparty. Highest-
// confidence relationship signal we can extract from filings: the
// company explicitly says "we entered into a [Type] Agreement with X."
//
// For each match we attach the 8-K as a kind:'filing' citation on the
// edge whose counterparty matches the named party. Counterparty match
// is by company name (8-Ks rarely use ticker symbols in body text).
async function materialAgreementAugmentCitations(
  edges: import('../database/companyValueChains').CompanyValueChainEdge[],
  focusSymbol: string,
  resolvedNodes: CompanyValueChainNode[]
): Promise<import('../database/companyValueChains').CompanyValueChainEdge[]> {
  const focus = focusSymbol.toUpperCase()
  // Pull the most recent 8 8-Ks (covers ~6-12 months of filings for an
  // active filer). 8-K Item 1.01 announcements sit at the top of the
  // body so per-filing scan is cheap.
  const eightKs = getFilingsForSymbol(focus, 8, new Set(['8-K', '8-K/A']))
  if (eightKs.length === 0) {
    console.log(
      `[companyChain] materialAgreementAugmentCitations: no 8-K available for ${focus}`
    )
    return edges
  }

  // Build counterparty lookup: name (cleaned + uppercased) + symbol →
  // resolved symbol. Skip the focus and unverified nodes (they don't
  // round-trip back to a real ticker the renderer can link to).
  const stopSuffix = /\b(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLC|Company|Co\.?|Holdings|Group|PLC|N\.V\.|S\.A\.|AG)\b/gi
  type CounterpartyKey = { symbol: string; needles: string[] }
  const counterparties: CounterpartyKey[] = []
  for (const n of resolvedNodes) {
    if (n.kind !== 'ticker') continue
    const sym = n.symbol.toUpperCase()
    if (sym === focus) continue
    const cleaned = n.name.replace(stopSuffix, '').trim()
    const fullName = n.name.trim().toUpperCase()
    const cleanedUpper = cleaned.toUpperCase()
    const head = cleaned.split(/\s+/)[0]?.trim().toUpperCase() ?? ''
    const needles: string[] = []
    if (fullName.length >= 5) needles.push(fullName)
    if (cleanedUpper.length >= 5 && cleanedUpper !== fullName) needles.push(cleanedUpper)
    // Head needs to be ≥4 to avoid false positives like "AMD" matching
    // "Adam" via word-boundary slip. We include it because 8-Ks often
    // shorten "KLA Corporation" → "KLA" within a paragraph.
    if (head.length >= 4) needles.push(head)
    if (needles.length === 0) continue
    counterparties.push({ symbol: sym, needles })
  }
  if (counterparties.length === 0) return edges

  // Items we look for in 8-Ks. All four name counterparties when a
  // material event involves a third party:
  //   1.01 — Entry into a Material Definitive Agreement (supply
  //          contracts, license deals, JVs, partnerships)
  //   1.02 — Termination of a Material Definitive Agreement (when a
  //          relationship ends — also a real signal)
  //   2.03 — Creation of a Material Direct Financial Obligation
  //          (debt agreements with banks, credit facilities)
  //   7.01 — Regulation FD Disclosure (catch-all for material
  //          announcements that don't fit a specific item — Apple
  //          files Foxconn / TSMC partnership news here, not in 1.01)
  const ITEMS_TO_SCAN = ['1.01', '1.02', '2.03', '7.01'] as const
  let scanned = 0
  let totalSectionsFound = 0
  // First match per counterparty wins so we attach the MOST RECENT 8-K
  // mentioning each. Ordering by filedAt DESC is already guaranteed by
  // getFilingsForSymbol.
  const matchByCounterparty = new Map<string, { filing: SecFiling; url: string }>()

  for (const filing of eightKs) {
    const body = await fetchFilingBody(filing)
    if (!body) continue
    scanned += 1
    // Iterate through each item type. Each 8-K can have multiple
    // items; we scan all four and merge counterparty hits.
    for (const itemNumber of ITEMS_TO_SCAN) {
      const section = findItemBodySection(body.text, itemNumber)
      if (!section) continue
      totalSectionsFound += 1
      const sectionUpper = section.toUpperCase()
      for (const cp of counterparties) {
        if (matchByCounterparty.has(cp.symbol)) continue
        const hit = cp.needles.some((needle) => {
          const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          return new RegExp(`\\b${escaped}\\b`).test(sectionUpper)
        })
        if (hit) {
          matchByCounterparty.set(cp.symbol, { filing, url: body.url })
        }
      }
    }
  }

  if (matchByCounterparty.size === 0) {
    console.log(
      `[companyChain] materialAgreementAugmentCitations: scanned ${scanned} 8-K(s), ${totalSectionsFound} item-section(s) found across [${ITEMS_TO_SCAN.join(', ')}], 0 counterparty mention(s)`
    )
    return edges
  }

  let attached = 0
  const out = edges.map((e) => {
    const from = e.from.toUpperCase()
    const to = e.to.toUpperCase()
    const counterparty = from !== focus ? from : to
    if (!counterparty || counterparty === focus) return e
    const hit = matchByCounterparty.get(counterparty)
    if (!hit) return e
    const cite: import('../database/companyValueChains').CompanyValueChainEdgeCitation = {
      kind: 'filing',
      accession: hit.filing.accessionNumber,
      cik: hit.filing.cik,
      formType: hit.filing.formType,
      filedAt: hit.filing.filedAt,
      url: hit.url
    }
    const existing = e.citations ?? []
    if (existing.some((c) => c.kind === 'filing' && c.accession === hit.filing.accessionNumber)) {
      return e
    }
    attached += 1
    return {
      ...e,
      source: 'filings' as const,
      citations: [...existing, cite]
    }
  })
  console.log(
    `[companyChain] materialAgreementAugmentCitations: scanned ${scanned} 8-K(s), ${totalSectionsFound} item-section(s) across [${ITEMS_TO_SCAN.join(', ')}], found ${matchByCounterparty.size} counterparty match(es), +${attached} cites attached`
  )
  return out
}

// Risk-factors augment: scan focus's 10-K Item 1A "Risk Factors" for
// counterparty concentration narrative — language like "we depend on
// a small number of customers" / "our largest customers include X" /
// "we rely on N suppliers including X for critical components." This
// catches concentration disclosures that fall under the 10% threshold
// (so concentrationAugmentCitations doesn't catch them) but are
// specific enough to name counterparties.
async function riskFactorsAugmentCitations(
  edges: import('../database/companyValueChains').CompanyValueChainEdge[],
  focusSymbol: string,
  resolvedNodes: CompanyValueChainNode[]
): Promise<import('../database/companyValueChains').CompanyValueChainEdge[]> {
  const focus = focusSymbol.toUpperCase()
  const tenKs = getFilingsForSymbol(focus, 3, new Set(['10-K', '10-K/A']))
  const latest = tenKs[0]
  if (!latest) {
    console.log(
      `[companyChain] riskFactorsAugmentCitations: no 10-K available for ${focus}`
    )
    return edges
  }
  const body = await fetchFilingBody(latest)
  if (!body) {
    console.log(
      `[companyChain] riskFactorsAugmentCitations: failed to fetch 10-K body for ${focus}`
    )
    return edges
  }
  const section = findItemBodySection(body.text, '1A')
  if (!section) {
    console.log(
      `[companyChain] riskFactorsAugmentCitations: no Item 1A section located in ${focus}'s 10-K`
    )
    return edges
  }
  // Build counterparty needle index (same shape as materialAgreement).
  const stopSuffix = /\b(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLC|Company|Co\.?|Holdings|Group|PLC|N\.V\.|S\.A\.|AG)\b/gi
  type CounterpartyKey = { symbol: string; needles: string[] }
  const counterparties: CounterpartyKey[] = []
  for (const n of resolvedNodes) {
    if (n.kind !== 'ticker') continue
    const sym = n.symbol.toUpperCase()
    if (sym === focus) continue
    const cleaned = n.name.replace(stopSuffix, '').trim()
    const fullName = n.name.trim().toUpperCase()
    const cleanedUpper = cleaned.toUpperCase()
    const head = cleaned.split(/\s+/)[0]?.trim().toUpperCase() ?? ''
    const needles: string[] = []
    if (fullName.length >= 5) needles.push(fullName)
    if (cleanedUpper.length >= 5 && cleanedUpper !== fullName) needles.push(cleanedUpper)
    if (head.length >= 4) needles.push(head)
    if (needles.length === 0) continue
    counterparties.push({ symbol: sym, needles })
  }
  if (counterparties.length === 0) return edges

  // Risk Factors is long; we don't want to attach the 10-K to every
  // edge whose counterparty is mentioned anywhere in 80 pages of risk
  // disclosures (most of those mentions are macro / industry context,
  // not relationship-specific). Restrict to sentences that contain
  // BOTH a counterparty mention AND a relationship-cue word so we
  // only fire when the disclosure is plausibly about THIS edge.
  const sectionUpper = section.toUpperCase()
  const sentences = section.split(/(?<=[.!?])\s+/).slice(0, 1500)
  const cueRe =
    /\b(supplier|supplied|supply|customer|client|partner|partnership|rely|depend|substantial(ly)?|significant(ly)?|portion|percent|including|such as|principal|key)\b/i

  const matches = new Set<string>()
  for (const sentence of sentences) {
    if (!cueRe.test(sentence)) continue
    const sUpper = sentence.toUpperCase()
    for (const cp of counterparties) {
      if (matches.has(cp.symbol)) continue
      const hit = cp.needles.some((needle) => {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(`\\b${escaped}\\b`).test(sUpper)
      })
      if (hit) matches.add(cp.symbol)
    }
  }
  void sectionUpper

  if (matches.size === 0) {
    console.log(
      `[companyChain] riskFactorsAugmentCitations: parsed Item 1A in ${focus}'s 10-K, 0 counterparty mention(s) in relationship-cue sentences`
    )
    return edges
  }

  const cite: import('../database/companyValueChains').CompanyValueChainEdgeCitation = {
    kind: 'filing',
    accession: latest.accessionNumber,
    cik: latest.cik,
    formType: latest.formType,
    filedAt: latest.filedAt,
    url: body.url
  }
  let attached = 0
  const out = edges.map((e) => {
    const from = e.from.toUpperCase()
    const to = e.to.toUpperCase()
    const counterparty = from !== focus ? from : to
    if (!counterparty || counterparty === focus) return e
    if (!matches.has(counterparty)) return e
    const existing = e.citations ?? []
    if (existing.some((c) => c.kind === 'filing' && c.accession === latest.accessionNumber)) {
      return e
    }
    attached += 1
    return {
      ...e,
      source: 'filings' as const,
      citations: [...existing, cite]
    }
  })
  console.log(
    `[companyChain] riskFactorsAugmentCitations: parsed Item 1A in ${focus}'s 10-K, found ${matches.size} counterparty mention(s), +${attached} cites attached`
  )
  return out
}

// EDGAR full-text search augment: for any cite-less edge, query SEC's
// official full-text search API (efts.sec.gov) for filings mentioning
// BOTH the focus company name and the counterparty. Way more reliable
// than asking Claude's web tool to land on Archives URLs — EDGAR FTS
// IS Archives URLs by definition, and it's free (no LLM cost). Sits
// between the local 8-K/10-K augmenters and the web-search augmenter
// in the pipeline so SEC sources are exhausted via the cheap path
// before we burn tokens on web search.
async function edgarFullTextSearchAugmentCitations(
  edges: import('../database/companyValueChains').CompanyValueChainEdge[],
  focusSymbol: string,
  focusCompanyName: string,
  resolvedNodes: CompanyValueChainNode[],
  maxQueries = 15
): Promise<import('../database/companyValueChains').CompanyValueChainEdge[]> {
  const focus = focusSymbol.toUpperCase()
  // Build a node lookup for counterparty company names.
  const nameBySymbol = new Map<string, string>()
  for (const n of resolvedNodes) {
    if (n.kind !== 'ticker') continue
    nameBySymbol.set(n.symbol.toUpperCase(), n.name)
  }
  // Find cite-less edges with ticker counterparties.
  const targets: Array<{ index: number; counterparty: string; counterpartyName: string }> = []
  edges.forEach((e, i) => {
    const hasPrimary = e.citations?.some(
      (c) => c.kind === 'filing' || c.kind === 'article'
    )
    if (hasPrimary) return
    const from = e.from.toUpperCase()
    const to = e.to.toUpperCase()
    const counterparty = from !== focus ? from : to
    if (!counterparty || counterparty === focus) return
    const name = nameBySymbol.get(counterparty)
    if (!name) return
    targets.push({ index: i, counterparty, counterpartyName: name })
  })
  if (targets.length === 0) {
    console.log(
      `[companyChain] edgarFullTextSearchAugmentCitations: 0 cite-less edges with ticker counterparties for ${focus}`
    )
    return edges
  }
  const cap = Math.min(maxQueries, targets.length)
  const next = [...edges]
  let attached = 0
  let zeroHits = 0
  // Strip corp suffixes off names so query is more concise. EDGAR FTS
  // requires phrase matches in quotes for multi-word strings.
  const stopSuffix = /\b(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLC|Company|Co\.?|Holdings|Group|PLC|N\.V\.|S\.A\.|AG)\b/gi
  const focusName = focusCompanyName.replace(stopSuffix, '').trim()
  // Compute a 5-year date window. EDGAR FTS sorts by relevance by
  // default — without explicit start AND end dates, an old filing
  // (sometimes 20 years back) that strongly matches the query string
  // can come back as the top hit. dateRange=custom requires BOTH
  // startdt + enddt to be respected; missing enddt silently disabled
  // the filter in the prior version.
  const today = new Date()
  const enddt = today.toISOString().slice(0, 10)
  const startYear = today.getUTCFullYear() - 5
  const startdt = `${startYear}-01-01`
  // Sequential to be polite; SEC's published rate limit is 10 req/s.
  // Per-call timeout of 8s is plenty for the EDGAR FTS endpoint.
  for (let i = 0; i < cap; i++) {
    const t = targets[i]
    const counterpartyClean = t.counterpartyName.replace(stopSuffix, '').trim()
    const query = `"${focusName}" "${counterpartyClean}"`
    const url =
      `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}` +
      `&forms=10-K,10-Q,8-K&dateRange=custom&startdt=${startdt}&enddt=${enddt}`
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)
      let res: Response
      try {
        res = await fetch(url, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          signal: controller.signal
        })
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) continue
      const data = (await res.json()) as {
        hits?: {
          hits?: Array<{
            _id?: string
            _source?: {
              ciks?: string[]
              adsh?: string
              form?: string
              file_date?: string
              display_names?: string[]
            }
          }>
        }
      }
      const hits = data.hits?.hits ?? []
      if (hits.length === 0) {
        zeroHits += 1
        continue
      }
      // Sort by file_date DESC so we prefer the most recent filing
      // when relevance is comparable. EDGAR FTS's default relevance
      // sort can surface an old highly-matching filing ahead of a
      // newer-but-equally-relevant one — for a chain that's meant to
      // reflect CURRENT business relationships we want recency to win.
      const sorted = [...hits].sort((a, b) => {
        const da = a._source?.file_date ? Date.parse(a._source.file_date) : 0
        const db = b._source?.file_date ? Date.parse(b._source.file_date) : 0
        return db - da
      })
      // Prefer a hit FILED BY the focus or counterparty themselves —
      // those are first-party documentation. After sorting by date,
      // the first-party finder gets the most recent first-party hit.
      const focusHit = sorted.find((h) => {
        const display = (h._source?.display_names ?? []).join(' ').toLowerCase()
        return (
          display.includes(focusCompanyName.toLowerCase()) ||
          display.includes(t.counterpartyName.toLowerCase())
        )
      })
      const top = focusHit ?? sorted[0]
      const source = top._source
      if (!source) continue
      const accession = source.adsh
      const cik = source.ciks?.[0]
      const formType = source.form ?? '10-K'
      if (!accession || !cik) continue
      // Build canonical Archives URL. EDGAR primary doc URL pattern:
      //   https://www.sec.gov/Archives/edgar/data/<CIK>/<ACC-NO-DASHES>/<ACC-NO>-index.htm
      // We default to the index page since we don't have the primary
      // document filename from FTS. The index resolves to the filing
      // index where the user can click into the actual doc.
      const cikNum = String(parseInt(cik, 10))
      const accNoDashes = accession.replace(/-/g, '')
      const archivesUrl =
        `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDashes}/${accession}-index.htm`
      const fileDate = source.file_date
      const filedAt = fileDate ? Date.parse(fileDate) : Date.now()
      const cite: import('../database/companyValueChains').CompanyValueChainEdgeCitation = {
        kind: 'filing',
        accession,
        cik,
        formType: formType.toUpperCase(),
        filedAt: Number.isFinite(filedAt) ? filedAt : Date.now(),
        url: archivesUrl
      }
      const e = next[t.index]
      const existing = e.citations ?? []
      if (existing.some((c) => c.kind === 'filing' && c.accession === accession)) continue
      next[t.index] = {
        ...e,
        source: 'filings' as const,
        citations: [...existing, cite]
      }
      attached += 1
    } catch (err) {
      console.warn(
        `[companyChain] EDGAR FTS failed for ${focus}↔${t.counterparty}:`,
        err instanceof Error ? err.message : err
      )
    }
  }
  console.log(
    `[companyChain] edgarFullTextSearchAugmentCitations: queried ${cap}/${targets.length} cite-less edges, ${zeroHits} zero-hit, +${attached} cites attached`
  )
  return next
}

// Whitelisted primary-source domains that the web-search augment will
// accept as kind:'article' citations when no sec.gov filing is findable.
// Buckets:
//   - First-party trade press / wire services (Reuters, Bloomberg, FT, ...)
//   - Press-wire services (PR Newswire, Business Wire, GlobeNewswire,
//     AccessWire) — companies issue formal announcements through these
//     services, often the canonical citable form for a deal/award
//   - IR / investor-relations subdomains — `ir.kla.com` is a first-party
//     source by definition, no different from the company's 10-K text.
//     Detected separately via subdomain prefix regex.
// Aggregator reposts (Yahoo, MSN Money, Seeking Alpha) are NOT in this
// list — we want the primary source, not a Yahoo Finance reprint.
const PRIMARY_PRESS_DOMAINS = [
  // News wires + trade press
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'nikkei.com',
  'asia.nikkei.com',
  'forbes.com',
  'cnbc.com',
  'marketwatch.com',
  'apnews.com',
  'npr.org',          // NPR Business — first-party reporting
  'theinformation.com',
  'semianalysis.com',
  'semiwiki.com',
  'eetimes.com',
  'electronicdesign.com',
  'freightwaves.com',
  'foxbusiness.com',
  'businessinsider.com',
  'fortune.com',
  'theverge.com',
  'arstechnica.com',
  'tomshardware.com',
  'anandtech.com',
  'techcrunch.com',
  'theregister.com',
  'eenewseurope.com',
  // Press-wire services — first-party announcements distributed via
  // a regulated wire. KLA's "Intel preferred-quality-supplier award"
  // press release is a textbook example of why we accept these.
  'prnewswire.com',
  'businesswire.com',
  'globenewswire.com',
  'accesswire.com',
  'newswire.ca',
  // IR-vendor hosts. These domains host investor-relations + press-
  // release pages on behalf of public companies (e.g. femsa.gcs-web.com
  // is FEMSA's IR site hosted by GCS-Web). Content is first-party even
  // though the parent domain isn't the company itself.
  'gcs-web.com',
  'q4inc.com',
  'q4cdn.com'
]

// Subdomain prefixes that identify a first-party corporate-comms site.
// When the URL's host starts with one of these, treat it as a primary
// source regardless of the parent domain — companies routinely host
// material announcements at ir.<company>.com / pr.<company>.com /
// news.<company>.com that are functionally identical to 8-K Item 7.01
// disclosures.
const IR_SUBDOMAIN_PREFIXES = [
  'ir.',
  'investors.',
  'investor.',
  'pr.',          // pr.tsmc.com — press release pages
  'press.',
  'newsroom.',
  'news.',        // news.intel.com etc.
  'media.',       // media.gm.com / media.ford.com
  'corporate.'    // corporate.exxonmobil.com
]

// Path patterns that identify a first-party press-release URL when the
// host is a company root domain (e.g. asml.com/en/news/press-releases/
// or intel.com/content/www/us/en/newsroom/...). Many companies host
// their press releases on the root domain instead of a dedicated
// subdomain, so subdomain-prefix matching alone misses them.
const PRESS_RELEASE_PATH_PATTERNS: RegExp[] = [
  /\/press-?releases?\//i,
  /\/news\/press-?releases?\//i,
  /\/newsroom\//i,
  /\/press\/release/i,
  /\/investor[s]?\/news/i,
  /\/news-events\//i,
  /\/about\/news\//i,
  /\/media\/press/i,
  // /news/<slug> form — e.g. ionq.com/news/ionq-announces-...
  // Many smaller companies host announcements at /news/ without a
  // /press-releases subfolder. The trailing slug requirement (`/.+`)
  // distinguishes from the bare /news/ landing page that wouldn't
  // contain a specific announcement.
  /\/news\/[^/]+/i,
  // /blog/ form — Google, NVIDIA, AWS all host technical announcements
  // about partnerships in their corporate blogs.
  /\/blog\/[^/]+/i,
  // /press/<slug> — variant without "release" subdir
  /\/press\/[^/]+/i,
  // /announcements/<slug>
  /\/announcements?\/[^/]+/i
]

// Known aggregator / second-tier-research hosts that we explicitly do
// NOT accept even when they have press-release-ish paths. These re-host
// content from primary sources and shouldn't crowd out the original.
const AGGREGATOR_BLACKLIST = new Set([
  'finance.yahoo.com',
  'yahoo.com',
  'news.yahoo.com',
  'msn.com',
  'money.msn.com',
  'seekingalpha.com',
  'fool.com',
  'simplywall.st',
  'trefis.com',
  'tipranks.com',
  'zacks.com',
  'investorplace.com',
  'benzinga.com',
  'finbox.com',
  'macrotrends.net',
  'stockanalysis.com',
  'wallstreetzen.com',
  'gurufocus.com'
])

function isAggregatorHost(host: string): boolean {
  if (AGGREGATOR_BLACKLIST.has(host)) return true
  for (const agg of AGGREGATOR_BLACKLIST) {
    if (host.endsWith('.' + agg)) return true
  }
  return false
}

function matchesPrimaryPress(url: string): { ok: true; host: string } | { ok: false } {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const path = u.pathname.toLowerCase()
    // Aggregator blacklist short-circuit — no path-based reprieve.
    if (isAggregatorHost(host)) return { ok: false }
    // IR subdomain match: ir.kla.com, investors.intel.com, etc.
    for (const prefix of IR_SUBDOMAIN_PREFIXES) {
      if (host.startsWith(prefix)) return { ok: true, host }
    }
    // Domain whitelist match.
    for (const domain of PRIMARY_PRESS_DOMAINS) {
      if (host === domain || host.endsWith('.' + domain) || host === 'www.' + domain) {
        return { ok: true, host }
      }
    }
    // First-party press-release path on a company root domain.
    // asml.com/en/news/press-releases/... is functionally a press
    // release on ASML's own corporate site — accept when the path
    // matches one of the canonical press-release patterns AND the
    // host isn't a known aggregator (already filtered above).
    for (const pattern of PRESS_RELEASE_PATH_PATTERNS) {
      if (pattern.test(path)) return { ok: true, host }
    }
    return { ok: false }
  } catch {
    return { ok: false }
  }
}

// Web-search augment: for any edge STILL missing a citation after the
// ref-resolver, bilateral, and concentration passes, ask Claude (with
// the web_search tool enabled) to find a primary-source URL — either
// an SEC filing on sec.gov/Archives OR a trade-press article from a
// whitelisted publisher (Reuters, Bloomberg, FT, WSJ, etc.). Web search
// rarely lands on canonical Archives URLs reliably, so accepting trade
// press as a backup unlocks the path for the bulk of cite-less edges.
//
// Bounded by `maxSearches` to keep cost predictable: each search is one
// Haiku call (~$0.01) plus the per-search cost from Anthropic's web tool.
async function webSearchAugmentCitations(
  edges: import('../database/companyValueChains').CompanyValueChainEdge[],
  focusSymbol: string,
  focusCompanyName: string,
  // Bounded to 4 cite-less edges per regen to fit the app's
  // $15/month spend budget. Anthropic web search bills per call;
  // 8 was the citation-quality sweet spot but doubled the per-
  // regen cost. The first 4 cite-less edges are the model's
  // highest-priority claims (they emit edges in priority order),
  // so capping here doesn't drop the most material relationships.
  maxSearches = 4
): Promise<import('../database/companyValueChains').CompanyValueChainEdge[]> {
  const focus = focusSymbol.toUpperCase()
  // Find edges still missing a primary cite. Order by edge index so the
  // budget falls naturally on the first N cite-less edges (which the
  // model emitted in priority order to begin with).
  const targets: Array<{ index: number; counterparty: string; relationship: string }> = []
  edges.forEach((e, i) => {
    const hasPrimary = e.citations?.some(
      (c) => c.kind === 'filing' || c.kind === 'article'
    )
    if (hasPrimary) return
    const from = e.from.toUpperCase()
    const to = e.to.toUpperCase()
    const counterparty = from !== focus ? from : to
    if (!counterparty || counterparty === focus) return
    targets.push({ index: i, counterparty, relationship: e.relationship })
  })
  if (targets.length === 0) return edges

  const cap = Math.min(maxSearches, targets.length)
  const next = [...edges]
  let attached = 0
  let consumed = 0
  let bailedOnRateLimit = false
  // Pace sequential calls to stay under Anthropic's 50K-input-tokens-per-
  // minute Haiku tier-1 limit. Each web-search call burns more tokens
  // than the system prompt suggests because the tool_result block from
  // the web search itself counts as input on the model's follow-up turn
  // (often 5-15K tokens). 10s pacing was still hitting 429 retries at
  // 4-29s sleeps. 14s gives ~4 calls/min × ~12K tokens = ~48K/min —
  // safely below the soft limit on average and the per-call retry
  // handles tool-result spikes when they fire.
  const PACING_MS = 14_000
  let lastCallAt = 0
  for (let i = 0; i < cap; i++) {
    const t = targets[i]
    consumed += 1
    if (lastCallAt > 0) {
      const since = Date.now() - lastCallAt
      const wait = PACING_MS - since
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
    }
    lastCallAt = Date.now()
    const system =
      `You are a citation finder. For the relationship described below, ` +
      `search the web ONCE for a PRIMARY-SOURCE article URL that ` +
      `documents it. SEC filings have already been searched separately ` +
      `via EDGAR — focus your search on TRADE-PRESS articles and ` +
      `corporate-comms pages.\n` +
      `\n` +
      `Acceptable source types:\n` +
      `1. Trade-press / wire-service article (Reuters, Bloomberg, FT, ` +
      `WSJ, Nikkei, CNBC, MarketWatch, AP, Forbes, The Information, ` +
      `SemiWiki, EE Times, FreightWaves, Tom's Hardware, AnandTech, ` +
      `TechCrunch, The Register, Ars Technica, The Verge, ` +
      `BusinessInsider, Fortune)\n` +
      `2. Press-wire announcement (PR Newswire, Business Wire, ` +
      `GlobeNewswire, AccessWire) — these are first-party press releases\n` +
      `3. Company's own investor-relations / press / media page. Two ` +
      `valid forms: (a) URL on a corporate-comms subdomain like ` +
      `ir.<company>.com, investors.<company>.com, pr.<company>.com, ` +
      `press.<company>.com, newsroom.<company>.com, news.<company>.com, ` +
      `media.<company>.com, or corporate.<company>.com; (b) URL on the ` +
      `company root domain whose PATH is a press-release page (e.g. ` +
      `asml.com/en/news/press-releases/..., intel.com/.../newsroom/...,` +
      ` samsung.com/.../press-releases/...).\n` +
      `\n` +
      `Return STRICT JSON only:\n` +
      `- Article: {"kind":"article","url":"https://www.reuters.com/...","title":"...","publisher":"Reuters","date":"2024-03-15"}\n` +
      `- None: {"kind":"none"}\n` +
      `\n` +
      `Hard rules:\n` +
      `- The URL MUST be on one of the source types listed above. ` +
      `Aggregator reposts (Yahoo Finance, MSN Money, Seeking Alpha) ` +
      `are NEVER acceptable — find the primary source.\n` +
      `- The source MUST specifically NAME ${t.counterparty} (the ` +
      `counterparty) AT LEAST ONCE — even in passing, even in a ` +
      `customer/supplier list, even just as part of a partnership ` +
      `announcement. ${focus} (or ${focusCompanyName}) doesn't have ` +
      `to appear if the URL is on ${focus}'s own corporate site.\n` +
      `- The relationship being described or implied should match the ` +
      `${t.relationship} type (supplier/customer/competitor/partner). ` +
      `Don't return a press release about an unrelated event that ` +
      `merely mentions the counterparty.\n` +
      `- Skip SEC filings (.sec.gov URLs) — those are searched ` +
      `elsewhere; we want a complementary article source here.\n` +
      `- If you genuinely can't find a primary source naming ` +
      `${t.counterparty}, return {"kind":"none"}.`
    const user =
      `Find a primary-source URL (SEC filing OR trade-press article) ` +
      `documenting the ${t.relationship} relationship between ` +
      `${focusCompanyName} (${focus}) and ${t.counterparty}.`
    const result = await callClaudeWithWebSearch({
      model: CLAUDE_MODELS.classifier,
      system,
      user,
      maxTokens: 1000,
      maxSearches: 1
    })
    if (result.kind === 'rate_limited') {
      console.warn(
        `[companyChain] web-search rate-limited on ${focus}↔${t.counterparty} after retry — bailing out of remaining ${cap - i - 1} edges`
      )
      bailedOnRateLimit = true
      break
    }
    if (result.kind !== 'ok') {
      console.log(
        `[companyChain] web-search ${focus}↔${t.counterparty}: ${result.kind}`
      )
      continue
    }
    // Parse JSON, tolerate prose / fences.
    const m = result.text.match(/\{[\s\S]*?\}/)
    if (!m) {
      console.log(
        `[companyChain] web-search ${focus}↔${t.counterparty}: no JSON in response — "${result.text.slice(0, 120)}"`
      )
      continue
    }
    let parsed: {
      kind?: 'filing' | 'article' | 'none'
      url?: string | null
      formType?: string
      year?: number
      title?: string
      publisher?: string
      date?: string
    }
    try {
      parsed = JSON.parse(m[0]) as typeof parsed
    } catch {
      console.log(
        `[companyChain] web-search ${focus}↔${t.counterparty}: JSON parse failed — "${m[0].slice(0, 120)}"`
      )
      continue
    }
    if (parsed.kind === 'none' || !parsed.url) {
      console.log(
        `[companyChain] web-search ${focus}↔${t.counterparty}: no primary source found`
      )
      continue
    }
    const url = typeof parsed.url === 'string' ? parsed.url.trim() : ''
    if (!url) {
      console.log(
        `[companyChain] web-search ${focus}↔${t.counterparty}: empty URL`
      )
      continue
    }

    // Build the citation. Two acceptable shapes:
    //  1. SEC filing on sec.gov/Archives → kind:'filing'
    //  2. Trade-press article on a whitelisted domain → kind:'article'
    let cite: import('../database/companyValueChains').CompanyValueChainEdgeCitation | null = null

    if (/^https:\/\/(www\.)?sec\.gov\//i.test(url)) {
      // Try the canonical Archives/edgar/data/{CIK}/{accession} pattern
      // first so we get a real accession + CIK on the citation. If that
      // doesn't match, fall back to a synthetic filing record where
      // accession/CIK are placeholders — the user still gets a clickable
      // link to an SEC page (filing index, EDGAR full-text-search hit,
      // etc.). Better an imprecise filing cite than no cite at all.
      const urlMatch = url.match(/\/Archives\/edgar\/data\/(\d+)\/([0-9]{18}|[0-9-]{20})/i)
      let accession: string
      let cik: string
      if (urlMatch) {
        cik = urlMatch[1]
        const accessionRaw = urlMatch[2]
        accession =
          accessionRaw.includes('-')
            ? accessionRaw
            : `${accessionRaw.slice(0, 10)}-${accessionRaw.slice(10, 12)}-${accessionRaw.slice(12)}`
      } else {
        // Synthetic placeholders. The renderer falls back to opening
        // the URL externally; a comment-grade accession just means the
        // SEC pill doesn't claim a specific doc but the URL still works.
        cik = '0000000000'
        accession = 'web-search'
      }
      const formType =
        typeof parsed.formType === 'string' && parsed.formType.trim()
          ? parsed.formType.trim().toUpperCase()
          : 'SEC.gov'
      const year = typeof parsed.year === 'number' ? parsed.year : null
      const filedAt = year ? Date.UTC(year, 0, 1) : Date.now()
      cite = { kind: 'filing', accession, cik, formType, filedAt, url }
    } else {
      const press = matchesPrimaryPress(url)
      if (!press.ok) {
        console.log(
          `[companyChain] web-search ${focus}↔${t.counterparty}: rejected non-Archives, non-whitelisted URL "${url}"`
        )
        continue
      }
      const title =
        typeof parsed.title === 'string' && parsed.title.trim()
          ? parsed.title.trim().slice(0, 200)
          : `${focusCompanyName} ↔ ${t.counterparty}`
      const publisher =
        typeof parsed.publisher === 'string' && parsed.publisher.trim()
          ? parsed.publisher.trim().slice(0, 80)
          : press.host
      const dateStr = typeof parsed.date === 'string' ? parsed.date.trim() : ''
      const publishedAt = dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr)
        ? Date.parse(dateStr)
        : null
      cite = {
        kind: 'article',
        // null articleId signals "external" — renderer opens via system
        // browser since Pulse doesn't have a local article row for this URL.
        articleId: null,
        title,
        url,
        publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
        feedTitle: publisher
      }
    }

    if (!cite) continue
    const e = next[t.index]
    const existing = e.citations ?? []
    // Dedupe by URL across kinds — same web-page surfaced twice should
    // never appear twice on one edge.
    if (existing.some((c) => 'url' in c && c.url === url)) continue
    const newSource: 'filings' | 'news' = cite.kind === 'filing' ? 'filings' : 'news'
    next[t.index] = {
      ...e,
      source: newSource,
      citations: [...existing, cite]
    }
    attached += 1
  }
  // Always log so we know the augmenter ran even when 0 cites attached —
  // the prior silent-on-zero behavior made it impossible to tell whether
  // rate limiting or genuine "no SEC source exists" was the cause.
  console.log(
    `[companyChain] webSearchAugmentCitations: ran ${consumed}/${targets.length} cite-less edges, ` +
      `+${attached} cites attached` +
      (bailedOnRateLimit ? ' (bailed early on rate limit)' : '')
  )
  return next
}

// Strict-mode drop: removes edges that still have zero citations after
// every augmentation pass. Logged so regen-all telemetry shows how many
// edges the strict gate cost vs. how many made it through.
function dropUncitedEdges(
  edges: import('../database/companyValueChains').CompanyValueChainEdge[]
): import('../database/companyValueChains').CompanyValueChainEdge[] {
  const kept = edges.filter((e) => (e.citations?.length ?? 0) > 0)
  const dropped = edges.length - kept.length
  if (dropped > 0) {
    console.log(
      `[companyChain] dropUncitedEdges: ${kept.length} kept, ${dropped} dropped (no resolvable cite after all augment passes)`
    )
  }
  return kept
}

// Re-frame a foreign edge relative to a specific focus. The source chain
// stored the edge as "from does X to to"; the generator prompt wants
// "counterparty does X to/from focus" so it doesn't have to back-compute.
// supplier/customer flip when the focus is on the `to` side of the source
// edge; competitor/partner are symmetric and pass through unchanged.
function relToFocus(
  focusIsFromSide: boolean,
  rel: 'supplier' | 'customer' | 'competitor' | 'partner'
): 'supplies-focus' | 'buys-from-focus' | 'competes-with-focus' | 'partners-with-focus' {
  if (rel === 'competitor') return 'competes-with-focus'
  if (rel === 'partner') return 'partners-with-focus'
  // supplier: source-chain says "from supplies to". If focus is `to`, then
  // the counterparty (`from`) supplies focus. If focus is `from`, then
  // counterparty (`to`) BUYS FROM focus.
  if (rel === 'supplier') {
    return focusIsFromSide ? 'buys-from-focus' : 'supplies-focus'
  }
  // customer: source-chain says "from is customer of to". If focus is
  // `from`, counterparty (`to`) supplies focus. If focus is `to`,
  // counterparty (`from`) buys from focus.
  return focusIsFromSide ? 'supplies-focus' : 'buys-from-focus'
}

function canonicalizeEdges(
  rawEdges: ChainEdge[],
  resolvedNodes: CompanyValueChainNode[],
  // Pre-resolver Claude/Ollama output, aligned by index with resolvedNodes.
  // When the resolver rewrites a symbol (e.g. MMC → MRSH because SEC's
  // current ticker for Marsh McLennan is MRSH), Claude's edges typically
  // keep referencing the pre-rename symbol it learned from. We register
  // those originals as aliases so the edge still lands on the resolved node.
  originalNodes: Array<{ symbol: string; name: string }>
): ChainEdge[] {
  const symbolByAlias = new Map<string, string>()
  // Identity mapping for every node symbol. Even unverified nodes
  // participate so edges pointing at placeholder labels still render in
  // the per-ticker view (absorber will filter them later if needed).
  for (const n of resolvedNodes) {
    const sym = n.symbol.toUpperCase()
    symbolByAlias.set(sym, sym)
  }
  // Claimed-symbol aliases: when the resolver picked a different ticker
  // than Claude emitted, map Claude's original symbol onto the resolved
  // one. Covers the "Claude knows a company by its retired/uncommon
  // ticker" pattern — most visible with Marsh McLennan (Claude says MMC,
  // SEC current is MRSH), but also showed up during earlier debugging for
  // dozens of pre-rebrand references.
  for (let i = 0; i < resolvedNodes.length && i < originalNodes.length; i++) {
    const resolved = resolvedNodes[i].symbol.toUpperCase()
    const claimed = originalNodes[i].symbol.trim().toUpperCase()
    if (claimed && claimed !== resolved && !symbolByAlias.has(claimed)) {
      symbolByAlias.set(claimed, resolved)
    }
  }
  // Name-derived aliases. Only for ticker-kind nodes — unverified labels
  // have non-commercial names like "End Consumers" that would create
  // spurious matches on common words.
  for (const n of resolvedNodes) {
    if (n.kind !== 'ticker') continue
    const sym = n.symbol.toUpperCase()
    const nameUpper = n.name.trim().toUpperCase()
    const firstWord = nameUpper.split(/[\s,.&/]+/).filter(Boolean)[0] ?? ''
    // First-word alias: "MACOM Technology Solutions" → MACOM → MTSI.
    // Skip words shorter than 3 chars (IBM, SAP would cause confusion
    // with identity lookup; they already resolve via node.symbol).
    if (firstWord.length >= 3 && !symbolByAlias.has(firstWord)) {
      symbolByAlias.set(firstWord, sym)
    }
    // Full-name-without-punctuation alias: "AMKOR TECHNOLOGY" →
    // "AMKORTECHNOLOGY" → AMKR. Catches cases like edges using the full
    // company name instead of the ticker.
    const fullKey = nameUpper.replace(/[^A-Z0-9]/g, '')
    if (fullKey.length >= 3 && !symbolByAlias.has(fullKey)) {
      symbolByAlias.set(fullKey, sym)
    }
  }

  const out: ChainEdge[] = []
  let dropped = 0
  for (const edge of rawEdges) {
    const from = edge.from.toUpperCase()
    const to = edge.to.toUpperCase()
    const canonicalFrom =
      symbolByAlias.get(from) ?? symbolByAlias.get(from.replace(/[^A-Z0-9]/g, ''))
    const canonicalTo =
      symbolByAlias.get(to) ?? symbolByAlias.get(to.replace(/[^A-Z0-9]/g, ''))
    if (!canonicalFrom || !canonicalTo || canonicalFrom === canonicalTo) {
      dropped += 1
      continue
    }
    out.push({
      from: canonicalFrom,
      to: canonicalTo,
      relationship: edge.relationship,
      note: edge.note,
      source: edge.source,
      sourceRefs: edge.sourceRefs ?? [],
      modelSource: edge.modelSource ?? null
    })
  }
  if (dropped > 0) {
    console.log(
      `[companyChain] canonicalize: dropped ${dropped} edge(s) whose endpoints ` +
        `couldn't be matched to any node (placeholder labels or out-of-list refs)`
    )
  }
  return out
}

// Main entrypoint. Idempotent per-symbol: if a ready chain already exists,
// callers can force=true to regenerate; otherwise return the cached row.
export async function generateCompanyChain(input: {
  symbol: string
  companyName: string
  force?: boolean
  // Force a specific AI provider for this generation. 'claude' bypasses
  // the local cap counter and skips Ollama fallback — used by the one-shot
  // "regenerate all with Claude" flow when the user wants maximum citation
  // quality. Undefined uses the normal preference-based picker.
  forceProvider?: 'claude' | 'ollama'
}): Promise<CompanyValueChain | null> {
  const sym = input.symbol.trim().toUpperCase()
  if (!sym) return null
  const existing = getCompanyValueChain(sym)
  if (!input.force && existing?.status === 'ready' && existing.graph) {
    return existing.graph
  }

  // Mark pending so concurrent generate clicks coalesce.
  setCompanyValueChain({
    symbol: sym,
    status: 'pending',
    graph: existing?.graph ?? null,
    sourceContext: 'Gathering context…'
  })
  broadcastUpdated(sym)

  // Fresh-searched tickers may not have any cached grounding yet: no profile
  // generated (ensureCompanyProfile is fire-and-forget on passive creation),
  // no SEC filings pulled (SEC scheduler hasn't fired for this symbol). We
  // proactively bootstrap both in parallel so the prompt has real material
  // to ground on instead of relying on mistral's priors alone.
  console.log(`[companyChain] preparing grounding context for ${sym}`)
  await Promise.all([
    ensureCompanyProfile(sym, input.companyName).catch((err) => {
      console.warn(
        `[companyChain] ensureCompanyProfile failed for ${sym}:`,
        err instanceof Error ? err.message : err
      )
      return null
    }),
    // Wait for SEC filings — without the 10-K we lose the focus's most
    // important grounding source. The earlier 12s race kept timing out
    // on slower EDGAR responses, leaving fetchTenKExcerpt with nothing
    // to read and concentrationAugmentCitations with no body to parse.
    // 60s ceiling so a wedged EDGAR doesn't stall the click forever.
    Promise.race([
      forceRefreshFilings(sym).catch((err) => {
        console.warn(
          `[companyChain] forceRefreshFilings failed for ${sym}:`,
          err instanceof Error ? err.message : err
        )
        return null
      }),
      new Promise((resolve) => setTimeout(resolve, 60_000))
    ])
  ])
  // Diagnostic: confirm the focus's 10-K / 10-Q / 8-K are individually
  // findable via form-filtered queries. Earlier we did `limit 20` then
  // post-filter by form, which returned 0 10-Ks for active filers like
  // KLAC because Form 4 insider trades dominated the recency window.
  const has10K = getFilingsForSymbol(sym, 1, new Set(['10-K', '10-K/A'])).length > 0
  const has10Q = getFilingsForSymbol(sym, 1, new Set(['10-Q', '10-Q/A'])).length > 0
  const has8K = getFilingsForSymbol(sym, 1, new Set(['8-K', '8-K/A'])).length > 0
  const totalFilings = getFilingsForSymbol(sym, 1).length > 0
    ? getFilingsForSymbol(sym, 200).length
    : 0
  console.log(
    `[companyChain] post-warmup SEC cache for ${sym}: ${totalFilings} filing(s) ` +
      `(10-K=${has10K}, 10-Q=${has10Q}, 8-K=${has8K})`
  )

  // Now gather what landed during the warm-up (plus whatever was already in
  // cache from prior sessions). We fetch THREE SEC filings (10-K + 8-K +
  // 10-Q) in parallel — investor presentations + earnings releases land
  // in the 8-K, MD&A in the 10-Q. Articles up to 15 (was 6) so broader
  // news coverage gets citable refs. Analyst events from cache.
  const profile = getCompanyProfile(sym)
  const [tenKExcerpt, eightKExcerpt, tenQExcerpt, news] = await Promise.all([
    fetchTenKExcerpt(sym),
    fetchEightKExcerpt(sym),
    fetchTenQExcerpt(sym),
    Promise.resolve(fetchRecentNews(sym, input.companyName))
  ])

  // Record what sources we fed so the UI can show provenance.
  const sources: string[] = []
  if (profile) sources.push('company profile')
  if (tenKExcerpt) sources.push('10-K')
  if (eightKExcerpt) sources.push('8-K')
  if (tenQExcerpt) sources.push('10-Q')
  if (news.length > 0) sources.push(`${news.length} article${news.length === 1 ? '' : 's'}`)
  const contextLabel = sources.length > 0 ? sources.join(' + ') : 'model priors only'

  // Classify the ticker into the unified sector catalog so the generated
  // chain can eventually be absorbed into the right bucket. Best-effort —
  // we don't fail generation if the classifier misfires. Force-regenerate
  // of the chain also forces re-classification; otherwise idempotent.
  try {
    const cls = await ensureTickerSectorsClassified({
      symbol: sym,
      companyName: input.companyName,
      profileDescription: profile?.description ?? null,
      // Sector classifier still wants raw text — pass just the excerpt
      // string, not the full TenKExcerptResult bundle.
      tenKExcerpt: tenKExcerpt?.excerpt ?? null,
      force: input.force ?? false
    })
    if (cls) {
      console.log(
        `[companyChain] classified ${sym} as ${cls.primary.sectorId}` +
          (cls.secondary.length > 0
            ? ` + ${cls.secondary.length} secondary (${cls.secondary.map((s) => s.sectorId).join(', ')})`
            : '')
      )
    }
  } catch (err) {
    console.warn(
      `[companyChain] sector classification failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
  }

  // Look up the focus's classified sector so we can feed the generator the
  // canonical stage list for that sector. Prevents stage-name drift across
  // chains (two banks with two different stage-ordering conventions).
  // Falls back to undefined → generator uses free-form stage naming.
  const focusSectorAssignment = getPrimarySectorForSymbol(sym)
  const sectorCatalogEntry = focusSectorAssignment
    ? getSector(focusSectorAssignment.sectorId)
    : null
  const canonicalStages =
    sectorCatalogEntry?.stages && sectorCatalogEntry.stages.length > 0
      ? sectorCatalogEntry.stages
      : undefined

  // Cross-chain corroboration: every edge in OTHER stored chains that
  // mentions this symbol on either side. Feeds the generator a "here's
  // what neighboring chains already claim about you" context block so
  // regens converge toward graph-wide consistency instead of re-deriving
  // edges in isolation. We DON'T pass the focus's own prior chain — that
  // would anchor Claude on any mistakes in the previous output (e.g. the
  // IP-licensing inversions we just fixed would have been self-reinforced).
  const crossChain = getEdgesMentioningSymbol(sym, 30).map((m) => ({
    sourceFocus: m.sourceFocus,
    counterparty: m.from === sym ? m.to : m.from,
    // Normalize direction relative to the focus so the prompt can describe
    // it as "Y supplies/buys-from [focus]" without the model having to
    // back-compute the perspective. Supplier/customer flip depending on
    // whether the focus is the from or to side of the source edge.
    relationshipTowardFocus: relToFocus(m.from === sym, m.relationship),
    note: m.note
  }))

  // User-flagged corrections for this focus's chain. Pre-formatted as a
  // ground-truth block; null when the user has no active corrections.
  // Injected into the generator prompt so the model honors the verdicts
  // instead of repeating the original mistake. Read-time application via
  // applyCorrectionsToChain in readCompanyChain still handles any model
  // regression — we deliberately persist the raw model output (see the
  // setCompanyValueChain call below) so removing a correction restores
  // the original chip without forcing a regen.
  const userCorrectionsBlock = formatCorrectionsForPrompt(sym)

  // Build the structured grounding payload with stable ref ids:
  //   F   → 10-K (Item 1 / Business)
  //   F2  → 8-K (most recent — investor presentations + earnings releases)
  //   F3  → 10-Q (Item 2 / MD&A)
  //   P   → company profile
  //   N1..N15 → news articles (supply-chain-keyword-prefiltered)
  //   A1..A5  → recent analyst rating actions
  // After generation we resolve the model's emitted sourceRef back into a
  // clickable citation object stored on each edge — see attachCitations.
  const filingsPayload: Array<{
    refId: string
    accession: string
    cik: string
    formType: string
    filedAt: number
    url: string
    excerpt: string
    excerptHint: string
  }> = []
  if (tenKExcerpt) {
    filingsPayload.push({
      refId: 'F',
      accession: tenKExcerpt.filing.accessionNumber,
      cik: tenKExcerpt.filing.cik,
      formType: tenKExcerpt.filing.formType,
      filedAt: tenKExcerpt.filing.filedAt,
      url: tenKExcerpt.url,
      excerpt: tenKExcerpt.excerpt,
      excerptHint: tenKExcerpt.excerptHint
    })
  }
  if (eightKExcerpt) {
    filingsPayload.push({
      refId: 'F2',
      accession: eightKExcerpt.filing.accessionNumber,
      cik: eightKExcerpt.filing.cik,
      formType: eightKExcerpt.filing.formType,
      filedAt: eightKExcerpt.filing.filedAt,
      url: eightKExcerpt.url,
      excerpt: eightKExcerpt.excerpt,
      excerptHint: eightKExcerpt.excerptHint
    })
  }
  if (tenQExcerpt) {
    filingsPayload.push({
      refId: 'F3',
      accession: tenQExcerpt.filing.accessionNumber,
      cik: tenQExcerpt.filing.cik,
      formType: tenQExcerpt.filing.formType,
      filedAt: tenQExcerpt.filing.filedAt,
      url: tenQExcerpt.url,
      excerpt: tenQExcerpt.excerpt,
      excerptHint: tenQExcerpt.excerptHint
    })
  }
  const articlesPayload = news.map((n, i) => ({
    refId: `N${i + 1}`,
    articleId: n.articleId,
    title: n.title,
    summary: n.summary,
    url: n.url,
    publishedAt: n.publishedAt,
    feedTitle: n.feedTitle
  }))
  // Analyst events used to be passed in as A1..A5 grounding refs but were
  // removed — rating actions don't evidence supplier/customer/competitor
  // relationships, only price-target sentiment. They still flow through
  // the notification system; just not edge-citation grounding.

  const { result: generated, provider } = await routedGenerate(
    {
      symbol: sym,
      companyName: input.companyName,
      profileDescription: profile?.description ?? null,
      filings: filingsPayload,
      articles: articlesPayload,
      canonicalStages,
      sectorName: sectorCatalogEntry?.name,
      crossChainMentions: crossChain,
      userCorrectionsBlock
    },
    input.forceProvider ? { forceProvider: input.forceProvider } : undefined
  )

  // Stamp the generated-by provider into the provenance string so the
  // detail-page card can show "Claude · profile + 10-K" vs "Ollama · profile",
  // and we can spot regressions by reading the saved chain later.
  const providerLabel = provider === 'claude' ? 'Claude' : 'local Ollama'
  const sourceContext = `${providerLabel} · ${contextLabel}`

  if (!generated || generated.nodes.length === 0 || generated.stages.length === 0) {
    setCompanyValueChain({
      symbol: sym,
      status: generated === null ? 'offline' : 'error',
      graph: existing?.graph ?? null,
      sourceContext
    })
    broadcastUpdated(sym)
    return existing?.graph ?? null
  }

  const resolvedNodes = resolveNodes(generated.nodes, sym)
  const canonicalEdges = canonicalizeEdges(generated.edges, resolvedNodes, generated.nodes)
  // Citation pipeline. Each step takes edges-with-citations-so-far and
  // tries to attach more before the strict-mode drop runs. Steps 1-3
  // give Phase B (pattern resolver), Phase C (bilateral counterparty
  // 10-K scan), and Phase D (focus 10-K customer-concentration parser)
  // each a chance to resolve cite-less edges before they fall off.
  const filingsByRef = new Map(filingsPayload.map((f) => [f.refId, f]))
  const articlesByRef = new Map(articlesPayload.map((a) => [a.refId, a]))
  // Build a {symbol → company name} map for the article-cross-reference
  // auto-augment so it can use word-boundary name matching for short
  // tickers (F, T, V, ON, GM, KO) instead of substring matching that
  // would otherwise pull in any article containing the letter.
  const nameBySymbol = new Map<string, string>()
  nameBySymbol.set(sym, input.companyName)
  for (const n of resolvedNodes) {
    nameBySymbol.set(n.symbol.toUpperCase(), n.name)
  }
  // Step 1: refs + pattern + article-cross-reference auto-augment.
  let citedEdges = attachCitations(canonicalEdges, filingsByRef, articlesByRef, sym, nameBySymbol)
  // Step 1.5: pre-warm counterparty SEC cache. Without this, bilateral
  // fetching is a no-op for any focus whose counterparties haven't been
  // independently regenerated — getFilingsForSymbol returns empty, so
  // the bilateral scanner has nothing to read. We collect ticker-kind
  // counterparties from the resolved nodes and force-refresh their
  // filings in parallel before bilateral runs. Capped at 12 to keep
  // SEC-call concurrency reasonable; per-call timeout bounds the worst
  // case to ~12s of pre-warm latency.
  const counterpartyTickers = resolvedNodes
    .filter((n) => n.kind === 'ticker' && n.symbol.toUpperCase() !== sym)
    .map((n) => n.symbol.toUpperCase())
    .slice(0, 12)
  if (counterpartyTickers.length > 0) {
    console.log(
      `[companyChain] pre-warming SEC cache for ${counterpartyTickers.length} counterparties of ${sym}`
    )
    await Promise.all(
      counterpartyTickers.map((cp) =>
        Promise.race([
          forceRefreshFilings(cp).catch(() => null),
          new Promise((resolve) => setTimeout(resolve, 8_000))
        ])
      )
    )
  }
  // Step 2: bilateral counterparty filing scan. Fixes the "10-Ks rarely
  // name competitors" problem by mining the OTHER side's 10-K for focus
  // mentions. Bounded by the maxCounterparties cap inside the fetcher.
  try {
    citedEdges = await bilateralAugmentCitations(citedEdges, sym, input.companyName)
  } catch (err) {
    console.warn(
      `[companyChain] bilateralAugmentCitations failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
  }
  // Step 3: focus 10-K customer-concentration parser. Highest-confidence
  // customer-edge signal — concentration disclosures are required by SEC
  // when a single customer exceeds 10% of revenues, so this gives us a
  // primary-document cite for the most material customer relationships.
  try {
    citedEdges = await concentrationAugmentCitations(citedEdges, sym)
  } catch (err) {
    console.warn(
      `[companyChain] concentrationAugmentCitations failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
  }
  // Step 3.5: 8-K material-disclosure parser. Scans Items 1.01, 1.02,
  // 2.03, and 7.01 — all four classes of 8-K disclosure that name
  // counterparties (material agreement entry / termination, debt
  // obligations, Reg FD partnership announcements). Apple files
  // Foxconn / TSMC partnership news under 7.01 (not 1.01), so
  // covering all four is what makes this work for AAPL-like filers.
  try {
    citedEdges = await materialAgreementAugmentCitations(citedEdges, sym, resolvedNodes)
  } catch (err) {
    console.warn(
      `[companyChain] materialAgreementAugmentCitations failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
  }
  // Step 3.7: 10-K Item 1A (Risk Factors) parser. Catches counterparty
  // concentration narratives that fall under the formal 10% disclosure
  // threshold ("we depend on a small number of suppliers, including
  // X..."). Only fires when a sentence pairs a relationship cue word
  // with a counterparty mention so we don't false-positive on macro
  // boilerplate.
  try {
    citedEdges = await riskFactorsAugmentCitations(citedEdges, sym, resolvedNodes)
  } catch (err) {
    console.warn(
      `[companyChain] riskFactorsAugmentCitations failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
  }
  // Step 3.9: EDGAR full-text search direct API. Queries efts.sec.gov
  // for filings that mention BOTH the focus and counterparty company
  // names. Free (no LLM cost), reliable (returns canonical Archives
  // URLs by definition), and replaces what Claude's web-search tool
  // was unreliably trying to do for SEC sources. Web-search now
  // handles trade-press articles only.
  try {
    citedEdges = await edgarFullTextSearchAugmentCitations(
      citedEdges,
      sym,
      input.companyName,
      resolvedNodes
    )
  } catch (err) {
    console.warn(
      `[companyChain] edgarFullTextSearchAugmentCitations failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
  }
  // Step 4: Claude web-search fallback. Now article-only — SEC sources
  // are exhausted via the cheap EDGAR FTS path above.
  try {
    citedEdges = await webSearchAugmentCitations(citedEdges, sym, input.companyName)
  } catch (err) {
    console.warn(
      `[companyChain] webSearchAugmentCitations failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
  }
  // Strict-mode drop: any edge that survived every augmentation pass
  // without getting a cite is unlinkable and gets removed.
  citedEdges = dropUncitedEdges(citedEdges)
  const graph: CompanyValueChain = {
    focus: sym,
    stages: generated.stages,
    nodes: resolvedNodes,
    edges: citedEdges
  }

  // Persist the RAW model output. Corrections are applied at read time via
  // readCompanyChain → applyCorrectionsToChain so the saved chain stays
  // pristine. Baking corrections into the DB would be destructive: a user
  // who marks AAPL "not relevant" → regenerates → deletes the correction
  // would lose AAPL from the chain until another regen, contradicting the
  // "Hidden by you / Restore" UX. Defense against model regression is the
  // userCorrectionsBlock injected into the generator prompt above.
  setCompanyValueChain({
    symbol: sym,
    status: 'ready',
    graph,
    sourceContext
  })

  // Stamp appliedAt on every correction tied to this focus — lets the UI
  // distinguish "fix is pending the next regen" from "fix is now baked
  // into the saved chain". Best-effort; failure here doesn't unwind the save.
  try {
    markCorrectionsApplied(sym)
  } catch (err) {
    console.warn(
      `[companyChain] markCorrectionsApplied failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
  }

  // Absorb the chain into the unified overlay tables so the sector-wide
  // renderer (Phase 4) can see it. Non-fatal: absorption failure doesn't
  // invalidate the per-ticker chain that just got saved.
  try {
    const absorbed = absorbGeneratedChain(sym, graph)
    if (absorbed.skipped) {
      console.log(`[companyChain] skipped absorption for ${sym}: ${absorbed.skipped}`)
    } else if (absorbed.nodesAdded > 0 || absorbed.edgesAdded > 0) {
      console.log(
        `[companyChain] absorbed into ${absorbed.sectorId}: ` +
          `+${absorbed.nodesAdded} node(s), +${absorbed.edgesAdded} edge(s)`
      )
    }
  } catch (err) {
    console.warn(
      `[companyChain] absorption failed for ${sym}:`,
      err instanceof Error ? err.message : err
    )
  }

  broadcastUpdated(sym)
  return graph
}

export function readCompanyChain(symbol: string): ReturnType<typeof getCompanyValueChain> {
  const row = getCompanyValueChain(symbol)
  if (!row || !row.graph) return row
  // Apply user-flagged corrections so the focus panel reflects the fix
  // immediately, before the next regen. The unmodified chain stays in the
  // DB — corrections are layered on top at read time so removing a
  // correction reveals the original chain without re-running generation.
  return { ...row, graph: applyCorrectionsToChain(row.graph) }
}

export interface RegenerateAllProgress {
  total: number
  completed: number
  currentSymbol: string | null
  succeeded: number
  failed: number
  running: boolean
}

// Bulk regenerate state. Only one run can be in flight at a time — the
// classifier + generator are heavy enough (30-60s per ticker) that parallel
// runs would drown Ollama's two-concurrent limit and pile up other
// requests behind them. A second Start click while running is a no-op.
let regenRunning = false
let regenProgress: RegenerateAllProgress = {
  total: 0,
  completed: 0,
  currentSymbol: null,
  succeeded: 0,
  failed: 0,
  running: false
}

function broadcastRegenProgress(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('chainRegen:progress', regenProgress)
    }
  }
}

// Maximum time waitForIdle will block before giving up and processing
// anyway. 5 minutes is long enough that the user is probably actually
// busy (not just typing a sentence), but short enough that a regen run
// still makes meaningful progress per session.
const IDLE_WAIT_MAX_MS = 5 * 60 * 1000
// Polling cadence for the idle check. powerMonitor.getSystemIdleTime
// is cheap; 5s strikes a balance between responsiveness and wakeups.
const IDLE_POLL_INTERVAL_MS = 5_000

async function waitForIdle(thresholdSeconds: number): Promise<void> {
  const start = Date.now()
  while (true) {
    const idle = powerMonitor.getSystemIdleTime()
    if (idle >= thresholdSeconds) return
    if (Date.now() - start >= IDLE_WAIT_MAX_MS) return
    await new Promise<void>((resolve) => setTimeout(resolve, IDLE_POLL_INTERVAL_MS))
  }
}

export function getRegenerateAllProgress(): RegenerateAllProgress {
  return regenProgress
}

// Regenerate every ticker that already has a company_value_chains row.
// This is the "I added pipeline improvements, refresh all existing chains
// so they pick them up" button. Runs sequentially — Ollama's 2-concurrent
// cap makes parallel runs counterproductive, and keeping order stable
// makes the progress UI easier to read.
//
// Options:
//   skipIfGeneratedWithinMs — drop any chain regenerated within this window.
//     Manual button passes 0 (regen everything). Auto-on-boot passes a
//     real window (e.g. 20h) so a partial run that hit the Claude cap
//     yesterday only retries stragglers today.
//   idleGateSeconds — between symbols, wait until the user has been idle
//     for at least this many seconds. Auto-boot uses this so a long
//     regen doesn't compete with active interaction. Manual passes 0.
//     Has a max-wait cap (5 min) so the run still makes progress when
//     the user is actively working.
//   maxSymbols — process at most this many symbols this run; remainder
//     waits for the next invocation. Auto-boot caps at ~20 stalest so
//     a single boot can't burn through an entire 100-symbol watchlist.
//     Manual passes Infinity.
//   stalestFirst — when true, sort symbols by generatedAt ASC (NULL/never-
//     generated first). Combined with maxSymbols this guarantees the
//     oldest data gets refreshed first across multiple boot cycles.
export async function regenerateAllChains(
  opts: {
    skipIfGeneratedWithinMs?: number
    idleGateSeconds?: number
    maxSymbols?: number
    stalestFirst?: boolean
    // Force a specific AI provider for every ticker in the run.
    // 'claude' bypasses the local cap counter and skips Ollama fallback —
    // used by the one-shot "regenerate all with Claude" flow. The user
    // accepts the marginal API cost in exchange for consistent citation
    // quality. On per-call Claude failure (real Anthropic 429 or auth
    // error), the ticker is recorded as failed and the loop continues.
    forceProvider?: 'claude' | 'ollama'
  } = {}
): Promise<RegenerateAllProgress> {
  if (regenRunning) return regenProgress
  regenRunning = true
  // Expanded scope: "regenerate all" now means every ticker the user has
  // expressed interest in — union of (a) tickers that already have a chain
  // (refresh them with the latest classifier / prompt / model) and
  // (b) active watchlist tickers that have never been generated (give them
  // a chain so they participate in the unified graph). Passive tickers
  // (chain-absorbed counterparties in someone else's chain) are NOT in
  // scope — they already appear via inheritance and would multiply cost.
  const existingChainSymbols = new Set(listCompanyValueChainSymbols())
  const watchlist = listTickers().filter((t) => t.isActive)
  const symbolSet = new Set<string>([
    ...existingChainSymbols,
    ...watchlist.map((t) => t.symbol.toUpperCase())
  ])
  let symbols = [...symbolSet].sort()

  // Skip-fresh filter: when a window is provided, drop any symbol whose
  // stored chain was generated more recently than the window. Never-
  // generated symbols always pass (null generatedAt), so new watchlist
  // additions still get their first chain even under an aggressive skip.
  if (opts.skipIfGeneratedWithinMs && opts.skipIfGeneratedWithinMs > 0) {
    const cutoff = Date.now() - opts.skipIfGeneratedWithinMs
    const beforeCount = symbols.length
    symbols = symbols.filter((sym) => {
      const row = getCompanyValueChain(sym)
      if (!row || row.generatedAt === null) return true
      return row.generatedAt < cutoff
    })
    const skipped = beforeCount - symbols.length
    if (skipped > 0) {
      console.log(
        `[companyChain] regenerate-all: skipped ${skipped} chain(s) regenerated within ${Math.round(opts.skipIfGeneratedWithinMs / 3600_000)}h — ${symbols.length} to process`
      )
    }
  }

  // Stalest-first: sort by generatedAt ascending (NULL → -Infinity so
  // never-generated symbols lead). Critical when maxSymbols caps the run:
  // we want the oldest data to refresh first across multiple boots.
  if (opts.stalestFirst) {
    const ageBySymbol = new Map<string, number>()
    for (const sym of symbols) {
      const row = getCompanyValueChain(sym)
      ageBySymbol.set(sym, row?.generatedAt ?? -Infinity)
    }
    symbols = [...symbols].sort(
      (a, b) => (ageBySymbol.get(a) ?? 0) - (ageBySymbol.get(b) ?? 0)
    )
  }

  // Cap the run length when requested. Auto-boot uses this so a single
  // launch can't burn through 100+ symbols of Claude calls. Stragglers
  // wait for the next invocation (next boot or manual button).
  if (opts.maxSymbols !== undefined && opts.maxSymbols > 0) {
    if (symbols.length > opts.maxSymbols) {
      console.log(
        `[companyChain] regenerate-all: capping at ${opts.maxSymbols} stalest of ${symbols.length} symbols`
      )
      symbols = symbols.slice(0, opts.maxSymbols)
    }
  }
  // Build a companyName lookup so every symbol in the run has a usable
  // prompt input even if it was only in the existingChainSymbols set
  // (covers the rare case where a chain exists but the tickers row was
  // wiped or the name is empty — fall back to the symbol itself).
  const nameBySymbol = new Map<string, string>()
  for (const t of listTickers()) {
    nameBySymbol.set(t.symbol.toUpperCase(), t.companyName || t.symbol)
  }

  regenProgress = {
    total: symbols.length,
    completed: 0,
    currentSymbol: null,
    succeeded: 0,
    failed: 0,
    running: true
  }
  broadcastRegenProgress()

  let firstSymbol = true
  for (const sym of symbols) {
    // Idle gate: between symbols (not before the first), wait for the user
    // to be idle for at least idleGateSeconds before starting the next
    // regen. Caps the wait at IDLE_WAIT_MAX_MS so the run still makes
    // progress when the user is actively working — better to slightly
    // contend than to never finish.
    if (!firstSymbol && opts.idleGateSeconds && opts.idleGateSeconds > 0) {
      await waitForIdle(opts.idleGateSeconds)
    }
    firstSymbol = false

    regenProgress = { ...regenProgress, currentSymbol: sym }
    broadcastRegenProgress()
    const companyName = nameBySymbol.get(sym) ?? getTickerBySymbol(sym)?.companyName ?? sym
    try {
      await generateCompanyChain({
        symbol: sym,
        companyName,
        force: true,
        forceProvider: opts.forceProvider
      })
      regenProgress = { ...regenProgress, succeeded: regenProgress.succeeded + 1 }
    } catch (err) {
      console.warn(
        `[companyChain] regenerate-all: ${sym} failed —`,
        err instanceof Error ? err.message : err
      )
      regenProgress = { ...regenProgress, failed: regenProgress.failed + 1 }
    }
    regenProgress = { ...regenProgress, completed: regenProgress.completed + 1 }
    broadcastRegenProgress()
  }

  regenProgress = { ...regenProgress, currentSymbol: null, running: false }
  regenRunning = false
  broadcastRegenProgress()
  return regenProgress
}

// ---- on-boot auto-regeneration ---------------------------------------------
//
// Fires once per launch (behind a timestamp throttle) so the user doesn't
// have to remember to click Regenerate All after every pipeline change.
// Two guards protect against cap burn:
//
//   1. A throttle window: don't fire if the last auto-run completed less
//      than AUTO_REGEN_THROTTLE_MS ago. Back-to-back restarts during
//      active development don't re-burn Claude calls.
//   2. A per-chain skip window inside regenerateAllChains: chains already
//      regenerated within AUTO_REGEN_SKIP_MS are skipped. A partial run
//      that hit yesterday's cap picks up only the stragglers today.
//
// The last-run timestamp lives in the preferences KV store so it survives
// restarts.

const AUTO_REGEN_THROTTLE_MS = 20 * 60 * 60 * 1000 // 20 hours
const AUTO_REGEN_SKIP_MS = 20 * 60 * 60 * 1000 // 20 hours — matches so
// chains from the previous auto-run age out of the skip window right as
// the next auto-run becomes eligible. Stragglers (failed yesterday due to
// cap) have null/stale generatedAt and always refresh.
const AUTO_REGEN_BOOT_DELAY_MS = 3 * 60 * 1000 // 3 minutes after startup
// — let feed polling, stocks scheduler, and financials backfill clear
// first so they don't compete for Claude bandwidth.
const AUTO_REGEN_IDLE_GATE_SECONDS = 30 // Between symbols, wait until the
// user has been idle for 30s. Prevents the regen pass from competing with
// active interaction (typing, scrolling) while still allowing it to make
// progress when the user steps away.
const AUTO_REGEN_MAX_PER_BOOT = 25 // Cap a single boot's regen run at the
// 25 stalest chains. With ~65-100 symbols in scope this means one boot
// won't burn the entire daily Claude budget; it takes 3-4 boots over the
// throttle window to fully refresh the graph.

export async function maybeAutoRegenerateOnBoot(): Promise<void> {
  // Late-imported to avoid circular-dependency headaches with preferences.
  const { getDb } = await import('../database/connection')
  const db = getDb()
  const row = db
    .prepare<[], { value: string }>(
      `SELECT value FROM preferences WHERE key = '_lastAutoRegenAt'`
    )
    .get()
  const lastRun = row ? Number(row.value) : 0
  const now = Date.now()

  // First-boot detection: zero existing chain rows means this is either
  // a brand-new install or a database that's been reset. Either way, the
  // user expects a populated value-chain view ASAP — burn through the
  // full watchlist with no idle gate or symbol cap. Exception: still
  // honor the throttle so a quick restart in the middle of a run doesn't
  // re-fire from scratch.
  const existingChainCount = listCompanyValueChainSymbols().length
  const isFirstBoot = existingChainCount === 0

  if (!isFirstBoot && Number.isFinite(lastRun) && now - lastRun < AUTO_REGEN_THROTTLE_MS) {
    const hoursAgo = Math.round((now - lastRun) / 3600_000)
    console.log(
      `[companyChain] auto-regen skipped — last run was ${hoursAgo}h ago ` +
        `(throttle: ${Math.round(AUTO_REGEN_THROTTLE_MS / 3600_000)}h)`
    )
    return
  }

  if (isFirstBoot) {
    console.log(
      `[companyChain] FIRST-BOOT auto-regen — generating chains for the entire ` +
        `watchlist (no cap, no idle gate). This is a one-time cost so the ` +
        `value-chain view is populated immediately.`
    )
  } else {
    console.log(
      `[companyChain] auto-regen starting — skip <${Math.round(AUTO_REGEN_SKIP_MS / 3600_000)}h old, ` +
        `cap ${AUTO_REGEN_MAX_PER_BOOT} stalest, ${AUTO_REGEN_IDLE_GATE_SECONDS}s idle gate between`
    )
  }
  try {
    await regenerateAllChains(
      isFirstBoot
        ? {
            // First-boot: no skip filter (all chains are missing anyway),
            // no max cap, no idle gate. Just run it.
            stalestFirst: false
          }
        : {
            skipIfGeneratedWithinMs: AUTO_REGEN_SKIP_MS,
            idleGateSeconds: AUTO_REGEN_IDLE_GATE_SECONDS,
            maxSymbols: AUTO_REGEN_MAX_PER_BOOT,
            stalestFirst: true
          }
    )
  } finally {
    // Record the stamp even if the run partially failed (Claude cap, etc.).
    // Prevents a failing run from re-firing every restart.
    db
      .prepare<[string, string]>(
        `INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)`
      )
      .run('_lastAutoRegenAt', String(Date.now()))
  }
}

// Called from main/index.ts after the boot-storm window. Fire-and-forget —
// the caller doesn't await; errors inside bubble to maybeAutoRegenerateOnBoot
// and are caught at the timer callback.
export function scheduleAutoRegenerateOnBoot(): void {
  setTimeout(() => {
    void maybeAutoRegenerateOnBoot().catch((err) => {
      console.warn(
        '[companyChain] auto-regen failed:',
        err instanceof Error ? err.message : err
      )
    })
  }, AUTO_REGEN_BOOT_DELAY_MS)
}
