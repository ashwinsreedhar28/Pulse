// Resolve a company name (as it appears in a 10-K / news article) to a
// ticker symbol. Primary source is sec_cik_map — SEC's ticker→CIK dump which
// also carries the filer's legal name. We also index Pulse's own tickers
// table so colloquial names ("Nvidia") resolve when the 10-K says "NVIDIA
// Corporation". The resolver normalizes + fuzzy matches; exact hits score
// higher than substring hits, and we skip ambiguous matches (name maps to
// 2+ tickers) rather than guessing.

import { getDb } from '../database/connection'
import { listFormerNamesJoinedToSymbols } from '../database/secFilings'
import { listTickers } from '../database/tickers'

interface NameEntry {
  symbol: string
  // Original legal / display name.
  original: string
  // Normalized form used for matching.
  normalized: string
  // Where this mapping came from — affects tiebreaks when the same name
  // surfaces in multiple sources. Order of preference: tickers (curated) →
  // sec (current legal name) → sec_former (prior legal names from SEC's
  // submissions JSON). Former names are last-resort because a rebrand that
  // passed a name to a different issuer would otherwise mis-resolve.
  source: 'tickers' | 'sec' | 'sec_former'
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

// Hand-curated map for well-known renames. SEC's sec_cik_map only carries
// current registered names, so tickers that went through a rebrand (or
// whose current registered name shares no words with the informal name the
// model keeps emitting) can't be resolved from the index alone.
// Keys are normalized names — see normalizeCompanyName. When the model
// emits one of these, we return the mapped ticker at score 1.0 so the
// chain-generation resolver treats it as verified.
const NAME_ALIASES: Record<string, string> = {
  // Energy rebrands + acronym-only SEC names.
  schlumberger: 'SLB',
  'royal dutch shell': 'SHEL',
  'british petroleum': 'BP',
  // Tech rebrands + parent/brand aliases.
  facebook: 'META',
  google: 'GOOGL',
  alphabet: 'GOOGL',
  'international business machines': 'IBM',
  // Consumer / media rebrands.
  'dow chemical': 'DOW',
  fedex: 'FDX',
  // Names the chain generator keeps emitting that don't match SEC's
  // registered entity name (subsidiaries, brand names, or former names).
  'monster energy': 'MNST',
  'monster beverage': 'MNST',
  'discover financial services': 'DFS',
  discover: 'DFS',
  aetna: 'CVS',
  // Word-order-flipped SEC names that confuse the normalizer.
  'charles schwab': 'SCHW',
  'the charles schwab corporation': 'SCHW',
  // Ollama hallucinates "USB Corporation" for U.S. Bancorp (ticker USB).
  'u s bancorp': 'USB',
  'us bancorp': 'USB',
  'usb corporation': 'USB',
  // Other common financials with quirks.
  'pnc financial services': 'PNC',
  'pnc financial services group': 'PNC',
  // Foreign / informal names the chain generator emits repeatedly for
  // companies with established US listings.
  tsmc: 'TSM',
  'taiwan semiconductor manufacturing': 'TSM',
  'taiwan semiconductor': 'TSM',
  'juniper networks': 'JNPR',
  'ibm corporation': 'IBM',
  'international business machines corporation': 'IBM',
  'ase technology': 'ASX',
  'ase technology holding': 'ASX',
  'advanced semiconductor engineering': 'ASX',
  'alps alpine': 'ALPS',
  // Common post-merger / rebrand cases that keep showing up as unverified.
  'coherent corp': 'COHR',
  'ii-vi': 'COHR',
  'ii-vi incorporated': 'COHR',
  'kioxia': 'KXIAY',
  'kioxia holdings': 'KXIAY',
  // Foreign parent entities the model emits that have US-listed ADRs.
  experian: 'EXPGY',
  'experian plc': 'EXPGY',
  femsa: 'FMX',
  'coca cola femsa': 'KOF',
  'coca-cola femsa': 'KOF',
  'samsung electronics': 'SSNLF',
  samsung: 'SSNLF',
  'continental ag': 'CTTAY',
  'continental tires': 'CTTAY',
  bridgestone: 'BRDCY',
  'foxconn technology': 'FXCOF',
  foxconn: 'FXCOF',
  'coca cola european partners': 'CCEP',
  'coca-cola european partners': 'CCEP',
  'volkswagen group': 'VWAGY',
  volkswagen: 'VWAGY',
  'fiat chrysler': 'STLA',
  'fiat chrysler automobiles': 'STLA',
  stellantis: 'STLA',
  // Dual-class common stock where SEC returns both classes and the resolver
  // can't pick without a hint. The mapped symbol is the primary / more-
  // liquid class. Without these aliases, pickCommonStock now (correctly)
  // returns null for multi-class ambiguity — add an entry here whenever a
  // ticker regression surfaces in a chain.
  comcast: 'CMCSA',
  'comcast corporation': 'CMCSA',
  'fox corporation': 'FOXA',
  'news corporation': 'NWSA',
  paramount: 'PARA',
  'paramount global': 'PARA',
  'liberty media': 'LSXMA',
  'liberty sirius': 'LSXMA',
  // Private / state entities — keep the alias map explicit about these so
  // they don't slip through if Ollama claims them as tickers. These all
  // resolve to null by returning a known non-ticker sentinel? Actually we
  // only have string values. Best we can do is omit and let them stay
  // unverified; leaving a marker here for future work.
  // 'fidelity investments': 'FNF' — no, Fidelity (brokerage) is private
  // 'jpmorgan chase': 'JPM' — handled by pickCommonStock fix
  // 'bank of america': 'BAC' — handled by pickCommonStock fix
  // 'citigroup': 'C' — handled by pickCommonStock fix
  // 'wells fargo': 'WFC' — handled by pickCommonStock fix
}

export function normalizeCompanyName(raw: string): string {
  const lower = raw.toLowerCase().trim()
  // Collapse dot-separated abbreviations ("p.l.c." → "plc", "u.s.a." → "usa",
  // "i.b.m." → "ibm") BEFORE stripping dots individually.
  // Also strip apostrophes without introducing a split, so "McDonald's"
  // normalizes to "mcdonalds" (one token) rather than "mcdonald s" (two),
  // matching SEC's punctuation-stripped entity names.
  const collapsed = lower
    .replace(/\b(?:[a-z]\.){2,}[a-z]?\.?/g, (m) => m.replace(/\./g, ''))
    .replace(/[''`]/g, '')
    .replace(/\bthe\b/g, ' ')
  // Split on any non-alphanumeric run — covers spaces, commas, periods,
  // slashes ("LIMITED/NV"), ampersands, hyphens. Without this, SEC names
  // like "SLB LIMITED/NV" left "limited/nv" as one unrecognized token;
  // with it, the slash splits the token into two, both of which match
  // LEGAL_SUFFIXES and get stripped.
  const tokens = collapsed
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !LEGAL_SUFFIXES.includes(t))
  return tokens.join(' ').trim()
}

// First letter of each token. "British Petroleum" → "BP",
// "International Business Machines" → "IBM". Used by the acronym matcher
// to bridge short SEC names (BP, HP, IBM) to full informal names the
// model tends to emit.
function tokenAcronym(normalized: string): string {
  return normalized
    .split(' ')
    .filter((t) => t.length > 0)
    .map((t) => t.charAt(0))
    .join('')
    .toUpperCase()
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
  // SEC's per-issuer submissions JSON also includes formerNames — every
  // legal name the CIK has traded under. Indexing these lets rebrands
  // ("Facebook" → META, "Square" → SQ/XYZ) resolve without a hand-curated
  // alias. Populated lazily by secFilingsService on each filings refresh.
  for (const row of listFormerNamesJoinedToSymbols()) {
    if (!row.normalizedName) continue
    entries.push({
      symbol: row.symbol.toUpperCase(),
      original: row.originalName,
      normalized: row.normalizedName,
      source: 'sec_former'
    })
  }
  return entries
}

export interface ResolveResult {
  symbol: string
  matchedName: string
  score: number // 1.0 = exact normalized match, ~0.7 = substring match
}

// Prefix- or suffix-word-boundary match. Accepts either side being a
// superset of the other, so "Shell" matches "Royal Dutch Shell" and "Apple"
// matches "Apple Inc." all through the same check.
//
// Asymmetric guard: reject multi-token query matching single-token candidate
// (e.g. "Relativity Space" matching "Relativity" after legal suffixes get
// stripped from "Relativity Holdings"). In that direction the candidate is
// too generic — the qualifying token the query carries ("Space") is exactly
// what distinguishes the real company from the false match, and throwing it
// away produces wrong resolutions. Single-token query matching multi-token
// candidate ("Shell" → "Royal Dutch Shell") stays valid since a short
// colloquial name matching its long legal form is the intended use case.
function isWordBoundaryMatch(a: string, b: string): boolean {
  if (a === b) return true
  const aTokens = a.split(' ').filter(Boolean)
  const bTokens = b.split(' ').filter(Boolean)
  if (aTokens.length > 1 && bTokens.length === 1) return false
  return (
    a.startsWith(b + ' ') ||
    b.startsWith(a + ' ') ||
    a.endsWith(' ' + b) ||
    b.endsWith(' ' + a)
  )
}

// When SEC's sec_cik_map returns multiple entries for the same normalized
// name — typically one common-stock ticker + a handful of preferred-stock
// classes (BAC vs BAC-PB/PK/PL/PE, JPM vs JPM-PC/PD/PJ/PK, etc.) — pick
// the common stock. Preferred tickers always carry a hyphen; common stock
// doesn't.
//
// When MULTIPLE non-hyphenated symbols share a normalized name, the company
// has two (or more) publicly-traded classes of common stock (Comcast CCZ vs
// CMCSA, Alphabet GOOG vs GOOGL, Fox FOX vs FOXA). We can't pick between
// them on length alone — CCZ is 3 chars and would win the shortest-symbol
// tiebreak even though CMCSA is the more-traded primary. Return null in
// that case so the caller falls through to NAME_ALIASES (which curates the
// primary class for known dual-class names) rather than silently choosing
// the less-traded variant.
function pickCommonStock<T extends { symbol: string }>(candidates: T[]): T | null {
  const commonStock = candidates.filter((c) => !c.symbol.includes('-'))
  if (commonStock.length === 0) return null
  if (commonStock.length === 1) return commonStock[0]
  // Dual-class ambiguity. Let the caller fall through to the alias table.
  return null
}

// Resolve a single name against the index. Strategy:
//   1. Curated rename alias (Schlumberger → SLB, etc.): accept (score 1.0).
//   2. Exact normalized match → single hit: accept (score 1.0).
//   3. Exact normalized match → multiple hits: prefer tickers source; if
//      still ambiguous (e.g., same company listed twice in SEC map), skip.
//   4. Word-boundary substring match (prefix or suffix): only accept when
//      exactly one candidate, to avoid "Amazon" matching "Amazon Fresh".
//   5. Token-subset match for short queries: reject (too noisy).
export function resolveCompanyName(rawName: string): ResolveResult | null {
  const normalized = normalizeCompanyName(rawName)
  if (normalized.length < 2) return null

  const aliasSymbol = NAME_ALIASES[normalized]
  if (aliasSymbol) {
    return { symbol: aliasSymbol, matchedName: rawName, score: 1.0 }
  }

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
    // Multiple SEC rows with same name. Prefer current legal names over
    // former-name history — a rebrand could otherwise resolve to two
    // different symbols when the old name is still registered elsewhere.
    // Fall back to the full set (including former) only when no current
    // entry matched.
    const preferred = exact.filter((e) => e.source !== 'sec_former')
    const pool = preferred.length > 0 ? preferred : exact
    // Multiple SEC rows with same name — usually one common-stock ticker
    // plus several preferred-stock classes (JPM + JPM-PC/PD/PJ/PK, etc.).
    // Pick the common-stock entry.
    const common = pickCommonStock(pool)
    if (common) {
      return { symbol: common.symbol, matchedName: common.original, score: 0.95 }
    }
    return null
  }

  // Word-boundary substring match — the 10-K might say "Apple" while SEC
  // has "Apple Inc.", or the model says "Royal Dutch Shell" while SEC has
  // just "Shell". Require a whole-word boundary in either direction, to
  // avoid false positives like "Tesla" matching "Teslas".
  const starts = index.filter((e) => isWordBoundaryMatch(e.normalized, normalized))
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
    const common = pickCommonStock(starts)
    if (common) {
      return { symbol: common.symbol, matchedName: common.original, score: 0.75 }
    }
    return null
  }

  // Acronym fallback — when the SEC entry is a short acronym ("BP", "HP",
  // "IBM") and the query is a multi-token expansion whose first letters
  // spell the entry. Scoped tight (entry normalized ≤ 4 chars, query has
  // ≥ 2 tokens) so natural English phrases can't accidentally match short
  // unrelated tickers.
  const queryTokens = normalized.split(' ').filter((t) => t.length > 0)
  if (queryTokens.length >= 2) {
    const acronym = tokenAcronym(normalized)
    const acronymHits = index.filter(
      (e) =>
        e.normalized.length <= 4 &&
        !e.normalized.includes(' ') &&
        e.normalized.toUpperCase() === acronym
    )
    if (acronymHits.length === 1) {
      return {
        symbol: acronymHits[0].symbol,
        matchedName: acronymHits[0].original,
        score: 0.85
      }
    }
    if (acronymHits.length > 1) {
      const tickersHits = acronymHits.filter((e) => e.source === 'tickers')
      if (tickersHits.length === 1) {
        return {
          symbol: tickersHits[0].symbol,
          matchedName: tickersHits[0].original,
          score: 0.8
        }
      }
      const common = pickCommonStock(acronymHits)
      if (common) {
        return { symbol: common.symbol, matchedName: common.original, score: 0.8 }
      }
    }
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
    const aliasSymbol = NAME_ALIASES[normalized]
    if (aliasSymbol) {
      out.set(raw, { symbol: aliasSymbol, matchedName: raw, score: 1.0 })
      continue
    }
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
        continue
      }
      const preferred = exact.filter((e) => e.source !== 'sec_former')
      const pool = preferred.length > 0 ? preferred : exact
      const common = pickCommonStock(pool)
      if (common) {
        out.set(raw, { symbol: common.symbol, matchedName: common.original, score: 0.95 })
      }
      continue
    }
    const starts = index.filter((e) => isWordBoundaryMatch(e.normalized, normalized))
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
        continue
      }
      const common = pickCommonStock(starts)
      if (common) {
        out.set(raw, { symbol: common.symbol, matchedName: common.original, score: 0.75 })
      }
    }
  }
  return out
}
