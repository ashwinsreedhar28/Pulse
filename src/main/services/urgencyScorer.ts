import type { Domain } from '../database/categories'
import { listTickers } from '../database/tickers'
import { listGeoInterests } from '../database/geoInterests'
import tickerReference from '../../data/tickerReference.json'
import {
  FINANCE_URGENCY_KEYWORDS,
  GENERAL_URGENCY_KEYWORDS
} from '../data/keywordDictionaries'

interface TickerRef {
  symbol: string
  name: string
  aliases?: string[]
}

const REFERENCE_TICKERS = tickerReference as TickerRef[]
const ALIASES_BY_SYMBOL = new Map<string, string[]>(
  REFERENCE_TICKERS.map((t) => [t.symbol, t.aliases ?? []])
)

export interface SubjectMatcher {
  // Exact uppercase tokens (tickers): must be bounded by non-alphanumeric chars.
  symbols: string[]
  // Free-form lowercase substrings (company names, aliases, geo keywords).
  phrases: string[]
}

export interface UrgencyContext {
  finance: SubjectMatcher
  general: SubjectMatcher
  financeUrgency: string[]
  generalUrgency: string[]
}

export interface ScoreResult {
  score: number
  reason: string
}

export function buildUrgencyContext(): UrgencyContext {
  const tickers = listTickers()
  const symbols: string[] = []
  const financePhrases: string[] = []
  for (const t of tickers) {
    if (!t.isActive) continue
    symbols.push(t.symbol.toUpperCase())
    financePhrases.push(t.companyName.toLowerCase())
    const aliases = ALIASES_BY_SYMBOL.get(t.symbol.toUpperCase()) ?? []
    for (const a of aliases) financePhrases.push(a.toLowerCase())
  }

  const geo = listGeoInterests()
  const generalPhrases: string[] = []
  for (const g of geo) {
    if (!g.isActive) continue
    for (const k of g.keywords) generalPhrases.push(k.toLowerCase())
    // Always include the display name itself.
    generalPhrases.push(g.displayName.toLowerCase())
  }

  return {
    finance: { symbols, phrases: dedupe(financePhrases) },
    general: { symbols: [], phrases: dedupe(generalPhrases) },
    financeUrgency: FINANCE_URGENCY_KEYWORDS.map((k) => k.toLowerCase()),
    generalUrgency: GENERAL_URGENCY_KEYWORDS.map((k) => k.toLowerCase())
  }
}

export function scoreArticle(
  input: { title: string; summary: string | null; domain: Domain },
  ctx: UrgencyContext
): ScoreResult {
  const text = `${input.title ?? ''} ${input.summary ?? ''}`
  const lower = text.toLowerCase()

  const matcher = input.domain === 'finance' ? ctx.finance : ctx.general
  const urgencyTerms =
    input.domain === 'finance' ? ctx.financeUrgency : ctx.generalUrgency

  const subjectHit = findSubjectHit(text, lower, matcher)
  const urgencyHit = firstPhraseHit(lower, urgencyTerms)

  if (subjectHit && urgencyHit) {
    return {
      score: 5,
      reason: `URGENT: ${subjectHit} + "${urgencyHit}"`
    }
  }
  if (subjectHit) {
    return {
      score: 3,
      reason: `AMBIGUOUS: ${subjectHit}`
    }
  }
  if (urgencyHit) {
    return {
      score: 3,
      reason: `AMBIGUOUS: urgency keyword "${urgencyHit}"`
    }
  }
  return { score: 1, reason: 'LOW: no subject or urgency match' }
}

function findSubjectHit(
  rawText: string,
  lowerText: string,
  matcher: SubjectMatcher
): string | null {
  for (const sym of matcher.symbols) {
    if (hasWordBoundaryMatch(rawText, sym)) return sym
  }
  const phrase = firstPhraseHit(lowerText, matcher.phrases)
  return phrase
}

function firstPhraseHit(lowerText: string, phrases: string[]): string | null {
  for (const p of phrases) {
    if (p.length < 2) continue
    if (lowerText.includes(p)) return p
  }
  return null
}

function hasWordBoundaryMatch(text: string, token: string): boolean {
  if (!token) return false
  // Case-sensitive to avoid matching "amd" inside "commander".
  let from = 0
  while (from <= text.length - token.length) {
    const idx = text.indexOf(token, from)
    if (idx < 0) return false
    const before = idx > 0 ? text.charCodeAt(idx - 1) : 0
    const afterIdx = idx + token.length
    const after = afterIdx < text.length ? text.charCodeAt(afterIdx) : 0
    if (!isAlnum(before) && !isAlnum(after)) return true
    from = idx + 1
  }
  return false
}

function isAlnum(code: number): boolean {
  if (code === 0) return false
  // 0-9, A-Z, a-z
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  )
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items))
}
