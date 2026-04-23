// Resolve a company name (as it appears in a 10-K / news article) to a
// ticker symbol. Primary source is sec_cik_map — SEC's ticker→CIK dump which
// also carries the filer's legal name. We also index Pulse's own tickers
// table so colloquial names ("Nvidia") resolve when the 10-K says "NVIDIA
// Corporation". The resolver normalizes + fuzzy matches; exact hits score
// higher than substring hits, and we skip ambiguous matches (name maps to
// 2+ tickers) rather than guessing.

import { getDb } from '../database/connection'
import { listTickers } from '../database/tickers'

interface NameEntry {
  symbol: string
  // Original legal / display name.
  original: string
  // Normalized form used for matching.
  normalized: string
  // Where this mapping came from — affects tiebreaks when the same name
  // surfaces in multiple sources (tickers table wins, it's curated).
  source: 'tickers' | 'sec'
}

// Stop-words to strip from company names before matching. Legal suffixes
// ("Inc.", "Corporation", "Ltd.") are normalized away — "Apple Inc." and
// "Apple" must resolve identically. We also strip "The" prefix ("The
// Walt Disney Company") and common punctuation.
const LEGAL_SUFFIXES = [
  'incorporated',
  'inc',
  'corporation',
  'corp',
  'company',
  'co',
  'limited',
  'ltd',
  'plc',
  'ag',
  'sa',
  'nv',
  'holdings',
  'group',
  'lp',
  'llc'
]

export function normalizeCompanyName(raw: string): string {
  const lower = raw.toLowerCase().trim()
  // Strip period-terminated suffixes by splitting on word boundaries.
  const tokens = lower
    .replace(/[,&.]/g, ' ')
    .replace(/\bthe\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 0 && !LEGAL_SUFFIXES.includes(t.replace(/\./g, '')))
  return tokens.join(' ').trim()
}

// Build the in-memory index once per call. Cheap — tickers table is <100
// rows, sec_cik_map is ~10k but SELECT-all into memory is <50ms.
function loadIndex(): NameEntry[] {
  const entries: NameEntry[] = []
  // Pulse's own ticker list wins on ties — company names here are curated.
  for (const t of listTickers()) {
    const name = t.companyName?.trim()
    if (!name) continue
    entries.push({
      symbol: t.symbol.toUpperCase(),
      original: name,
      normalized: normalizeCompanyName(name),
      source: 'tickers'
    })
  }
  // SEC bulk map covers every US public filer — essential for resolving
  // names the 10-K references that aren't yet in the user's watchlist.
  const rows = getDb()
    .prepare<[], { symbol: string; companyName: string | null }>(
      `SELECT symbol, companyName FROM sec_cik_map WHERE companyName IS NOT NULL`
    )
    .all()
  for (const r of rows) {
    if (!r.companyName) continue
    entries.push({
      symbol: r.symbol.toUpperCase(),
      original: r.companyName,
      normalized: normalizeCompanyName(r.companyName),
      source: 'sec'
    })
  }
  return entries
}

export interface ResolveResult {
  symbol: string
  matchedName: string
  score: number // 1.0 = exact normalized match, ~0.7 = substring match
}

// Resolve a single name against the index. Strategy:
//   1. Exact normalized match → single hit: accept (score 1.0).
//   2. Exact normalized match → multiple hits: prefer tickers source; if
//      still ambiguous (e.g., same company listed twice in SEC map), skip.
//   3. Substring match on normalized forms → only accept when exactly one
//      candidate (avoid "Amazon" matching "Amazon" and "Amazon Fresh").
//   4. Token-subset match for short queries: reject (too noisy).
export function resolveCompanyName(rawName: string): ResolveResult | null {
  const normalized = normalizeCompanyName(rawName)
  if (normalized.length < 2) return null

  const index = loadIndex()

  // Exact normalized hits.
  const exact = index.filter((e) => e.normalized === normalized)
  if (exact.length === 1) {
    return { symbol: exact[0].symbol, matchedName: exact[0].original, score: 1.0 }
  }
  if (exact.length > 1) {
    const tickersHits = exact.filter((e) => e.source === 'tickers')
    if (tickersHits.length === 1) {
      return {
        symbol: tickersHits[0].symbol,
        matchedName: tickersHits[0].original,
        score: 0.95
      }
    }
    // Multiple SEC rows with same name — could be reorganizations, shell
    // companies, multiple share classes. Too ambiguous to auto-pick.
    return null
  }

  // Substring match — the 10-K might say "Apple" while SEC has "Apple Inc.".
  // Require the query to be a prefix or full-word substring of the candidate,
  // or vice versa, to avoid false positives like "Tesla" matching "Teslas".
  const starts = index.filter(
    (e) =>
      e.normalized.startsWith(normalized + ' ') ||
      normalized.startsWith(e.normalized + ' ')
  )
  if (starts.length === 1) {
    return {
      symbol: starts[0].symbol,
      matchedName: starts[0].original,
      score: 0.8
    }
  }
  if (starts.length > 1) {
    const tickersHits = starts.filter((e) => e.source === 'tickers')
    if (tickersHits.length === 1) {
      return {
        symbol: tickersHits[0].symbol,
        matchedName: tickersHits[0].original,
        score: 0.75
      }
    }
    return null
  }

  return null
}

// Batch resolver — same index loaded once for a list of names. Useful when
// one 10-K mentions a handful of customers and we want one index read.
export function resolveCompanyNames(names: string[]): Map<string, ResolveResult> {
  const index = loadIndex()
  const out = new Map<string, ResolveResult>()
  for (const raw of names) {
    const normalized = normalizeCompanyName(raw)
    if (normalized.length < 2) continue
    const exact = index.filter((e) => e.normalized === normalized)
    if (exact.length === 1) {
      out.set(raw, { symbol: exact[0].symbol, matchedName: exact[0].original, score: 1.0 })
      continue
    }
    if (exact.length > 1) {
      const tickersHits = exact.filter((e) => e.source === 'tickers')
      if (tickersHits.length === 1) {
        out.set(raw, {
          symbol: tickersHits[0].symbol,
          matchedName: tickersHits[0].original,
          score: 0.95
        })
      }
      continue
    }
    const starts = index.filter(
      (e) =>
        e.normalized.startsWith(normalized + ' ') ||
        normalized.startsWith(e.normalized + ' ')
    )
    if (starts.length === 1) {
      out.set(raw, { symbol: starts[0].symbol, matchedName: starts[0].original, score: 0.8 })
      continue
    }
    if (starts.length > 1) {
      const tickersHits = starts.filter((e) => e.source === 'tickers')
      if (tickersHits.length === 1) {
        out.set(raw, {
          symbol: tickersHits[0].symbol,
          matchedName: tickersHits[0].original,
          score: 0.75
        })
      }
    }
  }
  return out
}
