// Classifies whether an article is materially about a given ticker. Powers
// both the "Today's brief" summarizer (drops weak matches before Ollama sees
// them) and the "Latest coverage" list (only shows strong matches).
//
// Two tiers:
//   - strong: the company name or a distinctive symbol+context appears in the
//     title/body. We treat these as genuinely about the company.
//   - weak:  only an ambiguous short symbol appears (e.g., "ARM" when the
//     article is about the Arm instruction set, not Arm Holdings). We surface
//     these nowhere today; the row is kept so future UIs can opt into an
//     "Also mentions" section without re-scanning text.
//
// The classifier is cheap pure-regex so we can run it across every active
// ticker × every new article at ingest time without noticeable overhead.

import tickerReference from '../../data/tickerReference.json'
import type { Ticker } from '../database/tickers'

export type MatchStrength = 'strong' | 'weak' | 'none'

interface TickerRef {
  symbol: string
  name: string
  aliases?: string[]
}
const refBySymbol = new Map<string, TickerRef>(
  (tickerReference as TickerRef[]).map((t) => [t.symbol.toUpperCase(), t])
)

// Symbols that also read as common English words or generic tech acronyms.
// Articles matching ONLY the bare symbol (no company name, no distinctive
// alias) get classified `weak` for these — "arm" appears everywhere in tech
// prose. Intentionally conservative: better to miss an obscure mention than
// to surface hallucination-worthy noise.
const AMBIGUOUS_SYMBOLS = new Set<string>([
  // Literal English words
  'A', 'ALL', 'AM', 'ARM', 'BEST', 'BY', 'CAT', 'COLD', 'COOL', 'D', 'DIS', 'F',
  'FREE', 'FUN', 'GOOD', 'HOT', 'IT', 'JOB', 'KEY', 'LIT', 'LOW', 'LUV', 'M',
  'NEW', 'NOW', 'O', 'OLD', 'ON', 'ONE', 'PM', 'PRO', 'SHOP', 'SO', 'T', 'TWO',
  'V', 'W', 'WATT', 'X', 'Y',
  // Generic tech/biz acronyms that collide with prose
  'AI', 'API', 'CRM', 'CLS', 'CPU', 'DIS', 'GPS', 'GPU', 'HP', 'IBM', 'IP',
  'LIN', 'MU', 'NOC', 'PC', 'TV', 'UPS'
])

interface Matchers {
  symbolRe: RegExp
  symbolInTitleDistinctiveRe: RegExp | null
  fullNameRe: RegExp | null
  strippedNameRe: RegExp | null
  aliasRes: RegExp[]
  ambiguousSymbol: boolean
}

const matcherCache = new Map<string, Matchers>()

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Strips corporate suffixes so "Applied Materials Inc." → "Applied Materials"
// (which is what actually appears in headlines). Matches up to the FIRST
// suffix so names like "Rocket Lab Corporation" become "Rocket Lab", not the
// lossy "Rocket".
function stripCorporateSuffix(name: string): string {
  return name
    .replace(
      /\s+(Inc\.?|Corp\.?|Corporation|Holdings?|Ltd\.?|Technologies|Technology|Company|Co\.?|PLC|N\.?V\.?|S\.?A\.?|Group|Holding)\b.*$/i,
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// "NVIDIA" is distinctive as a plain word; "AMD" is case-sensitive-plus-
// bounded so "AMD" in a headline matches but "amd" in a URL slug does not.
// For short or ambiguous symbols we require an extra context marker in the
// title (colon, parentheses, dollar sign, or inline price) to count as strong.
function buildSymbolMatchers(symbol: string, ambiguous: boolean): {
  any: RegExp
  distinctiveInTitle: RegExp | null
} {
  const sym = escapeRegex(symbol)
  // Case-sensitive boundary for short all-caps, case-insensitive otherwise.
  const isShort = symbol.length <= 4 && symbol === symbol.toUpperCase()
  const flags = isShort ? '' : 'i'
  const any = new RegExp(`(?:^|[^A-Za-z0-9])${sym}(?:[^A-Za-z0-9]|$)`, flags)

  if (ambiguous) {
    // An ambiguous symbol ("ARM", "ON") in a title only counts as strong when
    // clearly ticker-formatted: $ARM, (ARM), ARM:, or NASDAQ:ARM / NYSE:ARM.
    const distinctive = new RegExp(
      `(?:\\$${sym}\\b|\\(${sym}\\)|\\b${sym}:\\s|(?:NASDAQ|NYSE|LSE|TSX):\\s?${sym}\\b)`,
      ''
    )
    return { any, distinctiveInTitle: distinctive }
  }
  return { any, distinctiveInTitle: any }
}

function buildMatchers(ticker: Ticker): Matchers {
  const sym = ticker.symbol.toUpperCase()
  const ambiguous = AMBIGUOUS_SYMBOLS.has(sym)
  const { any, distinctiveInTitle } = buildSymbolMatchers(sym, ambiguous)

  const fullName = ticker.companyName?.trim() ?? ''
  const stripped = stripCorporateSuffix(fullName)
  const ref = refBySymbol.get(sym)

  const fullNameRe =
    fullName.length >= 4
      ? new RegExp(`(?:^|[^A-Za-z])${escapeRegex(fullName)}(?:[^A-Za-z]|$)`, 'i')
      : null
  const strippedNameRe =
    stripped.length >= 4 && stripped.toLowerCase() !== fullName.toLowerCase()
      ? new RegExp(`(?:^|[^A-Za-z])${escapeRegex(stripped)}(?:[^A-Za-z]|$)`, 'i')
      : null

  // Aliases from tickerReference.json (e.g., "ARM Cortex", "Arm Neoverse")
  // are almost always distinctive product names — treat as strong signals.
  const aliasRes: RegExp[] = []
  for (const alias of ref?.aliases ?? []) {
    if (alias.length < 3) continue
    aliasRes.push(new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegex(alias)}(?:[^A-Za-z0-9]|$)`, 'i'))
  }

  return {
    symbolRe: any,
    symbolInTitleDistinctiveRe: distinctiveInTitle,
    fullNameRe,
    strippedNameRe,
    aliasRes,
    ambiguousSymbol: ambiguous
  }
}

function getMatchers(ticker: Ticker): Matchers {
  const cached = matcherCache.get(ticker.symbol.toUpperCase())
  if (cached) return cached
  const m = buildMatchers(ticker)
  matcherCache.set(ticker.symbol.toUpperCase(), m)
  return m
}

export function invalidateMatcherCache(): void {
  matcherCache.clear()
}

export interface ClassifyInput {
  title: string
  summary: string | null
  body?: string | null
}

// Returns the strongest relationship tier between the article and the ticker.
// Both fields (title/summary) are scanned; body is optional and used when the
// reader cache has already extracted full text.
export function classifyArticleForTicker(
  article: ClassifyInput,
  ticker: Ticker
): MatchStrength {
  const m = getMatchers(ticker)
  const title = article.title ?? ''
  const summary = article.summary ?? ''
  const body = article.body ?? ''
  const haystack = `${title}\n${summary}\n${body}`

  // Strong: full company name or a distinctive alias anywhere.
  if (m.fullNameRe && m.fullNameRe.test(haystack)) return 'strong'
  if (m.strippedNameRe && m.strippedNameRe.test(haystack)) return 'strong'
  for (const re of m.aliasRes) {
    if (re.test(haystack)) return 'strong'
  }

  // Strong: symbol matched in title with a distinctive context marker (this
  // path triggers for ambiguous symbols that need ticker-formatting to count,
  // and unambiguously for distinctive symbols).
  if (m.symbolInTitleDistinctiveRe && m.symbolInTitleDistinctiveRe.test(title)) return 'strong'

  // Weak: symbol present but no company-name corroboration. For ambiguous
  // symbols ("ARM") this is almost always a false positive; we keep the row
  // so the "Also mentions" UI (future) can opt in, but drop from briefs.
  if (m.symbolRe.test(haystack)) return 'weak'

  return 'none'
}

// Bulk variant: given one article and many tickers, return per-ticker match
// strengths. Used at ingest time — called once per inserted article with the
// full active watchlist.
export function classifyArticleAgainstTickers(
  article: ClassifyInput,
  tickers: Ticker[]
): Map<string, MatchStrength> {
  const out = new Map<string, MatchStrength>()
  for (const t of tickers) {
    const s = classifyArticleForTicker(article, t)
    if (s !== 'none') out.set(t.symbol.toUpperCase(), s)
  }
  return out
}
