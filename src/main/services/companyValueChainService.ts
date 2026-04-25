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
import { getRecentAnalystChanges } from './yahooFinanceService'
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

function isQuarterlyReport(filing: SecFiling): boolean {
  return filing.formType === '10-Q' || filing.formType === '10-Q/A'
}

function isCurrentReport(filing: SecFiling): boolean {
  return filing.formType === '8-K' || filing.formType === '8-K/A'
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
  const filings = getFilingsForSymbol(symbol, 10).filter(isAnnualReport)
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
  const filings = getFilingsForSymbol(symbol, 10).filter(isQuarterlyReport)
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
  const filings = getFilingsForSymbol(symbol, 10).filter(isCurrentReport)
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
// Supply-chain keyword pre-filter for news article context. We fetch
// up to 30 most-recent articles tagged to the symbol, score each by
// whether its title/summary mentions a supply-chain term (supplier,
// customer, partner, contract, deal, acquisition, supply, etc.), then
// keep the top 15 ordered by recency. Catches Bloomberg/Reuters/etc.
// pieces that actually discuss supplier/customer dynamics rather than
// macro coverage that just happens to mention the ticker.
const SUPPLY_CHAIN_KEYWORDS = [
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
  'tier'
]

function fetchRecentNews(symbol: string): RecentNewsRow[] {
  const candidates = getDb()
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
    .all(symbol.toUpperCase(), 30)
  if (candidates.length <= 15) return candidates
  // Score by supply-chain keyword presence in title or summary. Keep
  // candidates with hits first, ordered by recency; then fill with
  // most-recent non-hit articles to reach 15.
  const matches = (text: string | null): boolean => {
    if (!text) return false
    const lower = text.toLowerCase()
    return SUPPLY_CHAIN_KEYWORDS.some((kw) => lower.includes(kw))
  }
  const hits: RecentNewsRow[] = []
  const misses: RecentNewsRow[] = []
  for (const c of candidates) {
    if (matches(c.title) || matches(c.summary)) hits.push(c)
    else misses.push(c)
  }
  return [...hits, ...misses].slice(0, 15)
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
  source: 'filings' | 'news' | 'profile' | 'model' | null
  // Stable id of the supplied context item the model cited as its source.
  // Resolved into a structured CompanyValueChainEdgeCitation by
  // attachCitations after canonicalizeEdges runs. Null when the model
  // didn't cite anything (typically when source='model').
  sourceRef?: string | null
  // Free-text training-source attribution emitted when source='model'.
  // Used by attachCitations to populate citation.attribution so the user
  // sees a real source name instead of the generic "Model" label.
  modelSource?: string | null
}

// Resolve the model-emitted sourceRef ("F" / "F2" / "F3" / "P" / "N1" /
// "A1" / ...) on each edge into a structured CompanyValueChainEdgeCitation
// that the renderer can turn into a clickable chip. STRICT-CITATION MODE:
// edges that can't be resolved to a clickable link (no matching ref AND
// no pattern-resolvable modelSource) are DROPPED here so the rendered
// graph only contains edges with real provenance.
//
// Resolution order per edge:
//   1. Direct ref lookup (F/F2/F3 → filings, N* → articles, A* → analyst,
//      P → profile)
//   2. Pattern match on modelSource (10-K/8-K/10-Q strings, named analyst
//      firms, publisher names) → resolved citation
//   3. Drop the edge.
//
// (1) and (2) cover the linkable cases. (3) keeps "industry consensus"
// and other vague claims out of the chain entirely.
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
  url: string | null
  publishedAt: number | null
  feedTitle: string | null
}
interface AnalystCitationData {
  firm: string
  url: string
  date: string
}

// Resolve common patterns in the model's free-text modelSource attribution
// to a real citation. Catches strings like "AAPL FY2023 10-K" / "TSM 8-K
// Mar 2024" / "Goldman Sachs upgrade AAPL 2024" and upgrades the citation
// from kind:'model' to kind:'filing' or kind:'analyst' with a clickable
// URL. Returns null when nothing matched (caller drops the edge in
// strict mode).
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

  // Analyst note patterns: "Goldman Sachs upgrade AAPL 2024",
  // "Morgan Stanley note", "JP Morgan rating". Recognize known analyst
  // firm names. Link to Yahoo's per-symbol analyst page (concrete, public).
  const analystFirms = [
    'Goldman Sachs',
    'Morgan Stanley',
    'JP Morgan',
    'Bank of America',
    'Citi',
    'Wells Fargo',
    'Barclays',
    'Bernstein',
    'Wedbush',
    'Piper Sandler',
    'Raymond James',
    'Jefferies',
    'Evercore',
    'Cowen',
    'Mizuho',
    'UBS',
    'Deutsche',
    'Rosenblatt',
    'Loop Capital',
    'Truist'
  ]
  const matchedFirm = analystFirms.find((f) => upper.includes(f.toUpperCase()))
  if (matchedFirm || /\b(ANALYST|UPGRADE|DOWNGRADE|RATING|CONSENSUS)\b/.test(upper)) {
    return {
      kind: 'analyst',
      firm: matchedFirm ?? 'Analyst note',
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(focusSymbol)}/analysis`,
      date: ''
    }
  }

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

function attachCitations(
  edges: ChainEdge[],
  filingsByRef: Map<string, FilingCitationData>,
  articlesByRef: Map<string, ArticleCitationData>,
  analystByRef: Map<string, AnalystCitationData>,
  focusSymbol: string
): import('../database/companyValueChains').CompanyValueChainEdge[] {
  const out: import('../database/companyValueChains').CompanyValueChainEdge[] = []
  let dropped = 0
  for (const edge of edges) {
    let citation: import('../database/companyValueChains').CompanyValueChainEdgeCitation | null = null
    const ref = (edge.sourceRef ?? '').toUpperCase()
    // Direct ref-supplied citations (the primary path — most edges land here).
    if (ref.startsWith('F') && filingsByRef.has(ref)) {
      const f = filingsByRef.get(ref)!
      citation = {
        kind: 'filing',
        accession: f.accession,
        cik: f.cik,
        formType: f.formType,
        filedAt: f.filedAt,
        url: f.url
      }
    } else if (ref === 'P') {
      citation = { kind: 'profile' }
    } else if (ref.startsWith('N') && articlesByRef.has(ref)) {
      const a = articlesByRef.get(ref)!
      citation = {
        kind: 'article',
        articleId: a.articleId,
        title: a.title,
        url: a.url,
        publishedAt: a.publishedAt,
        feedTitle: a.feedTitle
      }
    } else if (ref.startsWith('A') && analystByRef.has(ref)) {
      const a = analystByRef.get(ref)!
      citation = {
        kind: 'analyst',
        firm: a.firm,
        url: a.url,
        date: a.date
      }
    } else if (edge.source === 'model' && edge.modelSource) {
      // Phase B: try to resolve the modelSource string to a real
      // citation via pattern matching against the local SEC cache,
      // analyst firms, and news feeds. If resolution succeeds, the
      // edge is upgraded to a clickable citation; if it fails, citation
      // stays null and the edge is dropped below in strict mode.
      citation = patternResolveModelSource(edge.modelSource, focusSymbol)
    }

    // Strict-citation mode: edges with no resolvable link are dropped.
    // The model is instructed to omit such edges in the prompt; this
    // catches anything that slips through (vague modelSource, ref that
    // doesn't match anything we supplied, ref-less model attributions).
    if (!citation) {
      dropped += 1
      continue
    }
    out.push({
      from: edge.from,
      to: edge.to,
      relationship: edge.relationship,
      note: edge.note,
      source: edge.source,
      citation
    })
  }
  if (dropped > 0) {
    console.log(
      `[companyChain] attachCitations: dropped ${dropped} edge(s) without resolvable citation (strict mode)`
    )
  }
  return out
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
      sourceRef: edge.sourceRef ?? null,
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
    // Don't await filings hard — if SEC is rate-limited the profile is
    // usually enough. Race a 12-second ceiling so the generate click
    // doesn't stall on a slow EDGAR fetch.
    Promise.race([
      forceRefreshFilings(sym).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 12_000))
    ])
  ])

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
    Promise.resolve(fetchRecentNews(sym))
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
  // Analyst rating actions from yahooFinanceService's in-memory cache —
  // populated by the analyst-estimates scheduler. Last 5 entries with
  // up/down actions; the model can cite these for "consensus rated X"
  // claims. URL points to Yahoo's per-symbol analyst page (concrete and
  // public; per-report URLs would be paywalled).
  const analystEventsPayload = (() => {
    const recent = getRecentAnalystChanges(sym)
      .filter((c) => c.action === 'up' || c.action === 'down')
      .slice(0, 5)
    return recent.map((c, i) => ({
      refId: `A${i + 1}`,
      firm: c.firm ?? 'Unnamed analyst',
      action: c.action as 'up' | 'down',
      fromGrade: c.fromGrade,
      toGrade: c.toGrade,
      date: c.epochGradeDate
        ? new Date(c.epochGradeDate * 1000).toISOString().slice(0, 10)
        : '—',
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}/analysis`
    }))
  })()

  const { result: generated, provider } = await routedGenerate(
    {
      symbol: sym,
      companyName: input.companyName,
      profileDescription: profile?.description ?? null,
      filings: filingsPayload,
      articles: articlesPayload,
      analystEvents: analystEventsPayload,
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
  // Resolve each edge's sourceRef into a structured citation pointing at
  // the actual SEC URL / news article / analyst page. Strict mode: edges
  // with no resolvable citation are DROPPED (Phase B pattern resolver
  // gets a chance first via attachCitations).
  const filingsByRef = new Map(filingsPayload.map((f) => [f.refId, f]))
  const articlesByRef = new Map(articlesPayload.map((a) => [a.refId, a]))
  const analystByRef = new Map(analystEventsPayload.map((a) => [a.refId, a]))
  const citedEdges = attachCitations(
    canonicalEdges,
    filingsByRef,
    articlesByRef,
    analystByRef,
    sym
  )
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
  if (Number.isFinite(lastRun) && now - lastRun < AUTO_REGEN_THROTTLE_MS) {
    const hoursAgo = Math.round((now - lastRun) / 3600_000)
    console.log(
      `[companyChain] auto-regen skipped — last run was ${hoursAgo}h ago ` +
        `(throttle: ${Math.round(AUTO_REGEN_THROTTLE_MS / 3600_000)}h)`
    )
    return
  }
  console.log(
    `[companyChain] auto-regen starting — skip <${Math.round(AUTO_REGEN_SKIP_MS / 3600_000)}h old, ` +
      `cap ${AUTO_REGEN_MAX_PER_BOOT} stalest, ${AUTO_REGEN_IDLE_GATE_SECONDS}s idle gate between`
  )
  try {
    await regenerateAllChains({
      skipIfGeneratedWithinMs: AUTO_REGEN_SKIP_MS,
      idleGateSeconds: AUTO_REGEN_IDLE_GATE_SECONDS,
      maxSymbols: AUTO_REGEN_MAX_PER_BOOT,
      stalestFirst: true
    })
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
