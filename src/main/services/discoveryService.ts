import { getDb } from '../database/connection'
import { listTickers } from '../database/tickers'
import { createSuggestion, listSuggestions } from '../database/discovery'
import type { Domain } from '../database/categories'
import tickerReference from '../../data/tickerReference.json'
import { checkOllamaHealth } from './ollamaService'

interface TickerRef {
  symbol: string
  name: string
  aliases?: string[]
  sector?: string | null
  industry?: string | null
}

const REFERENCE = tickerReference as TickerRef[]

interface RecentArticle {
  id: number
  title: string
  summary: string | null
  domain: Domain
  publishedAt: number | null
}

function recentArticles(hours: number, limit: number): RecentArticle[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000
  return getDb()
    .prepare<[number, number], RecentArticle>(
      `SELECT id, title, summary, domain, publishedAt
       FROM articles
       WHERE publishedAt > ?
       ORDER BY publishedAt DESC
       LIMIT ?`
    )
    .all(cutoff, limit)
}

// ---- Daily Drip: keyword-frequency, no Ollama needed ----

export async function runDailyDrip(): Promise<number> {
  const held = new Set(listTickers().filter((t) => t.isActive).map((t) => t.symbol.toUpperCase()))
  const articles = recentArticles(48, 300)
  if (articles.length === 0) return 0

  const mentions = new Map<string, { ref: TickerRef; count: number; articleIds: number[] }>()

  for (const article of articles) {
    const text = `${article.title} ${article.summary ?? ''}`
    const upper = text.toUpperCase()
    const lower = text.toLowerCase()
    for (const ref of REFERENCE) {
      if (held.has(ref.symbol)) continue
      const key = ref.symbol
      let matched = false
      if (hasWordBoundary(upper, ref.symbol)) matched = true
      if (!matched && lower.includes(ref.name.toLowerCase())) matched = true
      if (!matched && ref.aliases) {
        for (const a of ref.aliases) {
          if (lower.includes(a.toLowerCase())) {
            matched = true
            break
          }
        }
      }
      if (matched) {
        const existing = mentions.get(key)
        if (existing) {
          existing.count++
          if (existing.articleIds.length < 5) existing.articleIds.push(article.id)
        } else {
          mentions.set(key, { ref, count: 1, articleIds: [article.id] })
        }
      }
    }
  }

  const ranked = [...mentions.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 2)

  let created = 0
  for (const [, { ref, count, articleIds }] of ranked) {
    const existing = listSuggestions(50)
    const isDupe = existing.some(
      (s) => s.ticker === ref.symbol && Date.now() - s.createdAt < 7 * 24 * 60 * 60 * 1000
    )
    if (isDupe) continue
    createSuggestion({
      ticker: ref.symbol,
      companyName: ref.name,
      reason: `Mentioned ${count} times in the last 48h across your feeds.`,
      sourceArticleIds: articleIds,
      mode: 'daily'
    })
    created++
  }
  console.log(`[discovery] daily drip: ${created} suggestions`)
  return created
}

// ---- Weekly Curated: Ollama analyzes recent articles ----

export async function runWeeklyCurated(): Promise<number> {
  if (!(await checkOllamaHealth(true))) {
    console.log('[discovery] weekly curated skipped — Ollama offline')
    return 0
  }

  const held = listTickers().filter((t) => t.isActive)
  const heldSymbols = new Set(held.map((t) => t.symbol.toUpperCase()))
  const holdingsList = held.map((t) => `${t.symbol} (${t.companyName})`).join(', ')
  const articles = recentArticles(7 * 24, 50)
  if (articles.length === 0) return 0

  const summaries = articles
    .map((a) => `- ${a.title}`)
    .join('\n')

  const system =
    `You are an investment research assistant. The user holds these stocks: ${holdingsList}. ` +
    `Analyze the recent news headlines below and identify up to 5 companies the user does NOT hold ` +
    `that are frequently mentioned, trending, or emerging in sectors adjacent to their portfolio. ` +
    `For each, provide ticker symbol, company name, and a one-sentence reason. ` +
    `Respond in JSON only: {"suggestions": [{"ticker": "SYM", "company": "Name", "reason": "..."}]}`

  try {
    const results = await ollamaSuggest(system, `Recent headlines:\n${summaries}`)
    if (results.length === 0) return 0

    let created = 0
    const existing = listSuggestions(100)
    for (const s of results) {
      if (!s.ticker || !s.company) continue
      const sym = s.ticker.toUpperCase()
      if (heldSymbols.has(sym)) continue
      const isDupe = existing.some(
        (e) => e.ticker === sym && Date.now() - e.createdAt < 14 * 24 * 60 * 60 * 1000
      )
      if (isDupe) continue
      createSuggestion({
        ticker: sym,
        companyName: s.company,
        reason: s.reason ?? 'Trending in adjacent sectors.',
        sourceArticleIds: [],
        mode: 'weekly'
      })
      created++
    }
    console.log(`[discovery] weekly curated: ${created} suggestions`)
    return created
  } catch (err) {
    console.warn('[discovery] weekly curated failed:', err instanceof Error ? err.message : err)
    return 0
  }
}

// ---- Portfolio Gaps: on-demand Ollama analysis ----

export async function runPortfolioGaps(): Promise<number> {
  if (!(await checkOllamaHealth(true))) {
    console.log('[discovery] portfolio gaps skipped — Ollama offline')
    return 0
  }

  const held = listTickers().filter((t) => t.isActive)
  const heldSymbols = new Set(held.map((t) => t.symbol.toUpperCase()))
  const holdingsDetail = held
    .map(
      (t) =>
        `${t.symbol} (${t.companyName})${t.sector ? ' — ' + t.sector : ''}${t.industry ? ', ' + t.industry : ''}`
    )
    .join('\n')

  const system =
    `You are an investment research assistant specializing in semiconductor value chain and adjacent sectors. ` +
    `The user holds:\n${holdingsDetail}\n\n` +
    `Identify up to 5 companies the user does NOT hold that would fill gaps or strengthen coverage ` +
    `of their value chain. Consider: photomask suppliers, specialty chemicals, substrate materials, ` +
    `testing/packaging, defense subcontractors, and rare earth processors. ` +
    `For each, provide ticker symbol (or "PRIVATE" if not public), company name, and a one-sentence ` +
    `reason explaining the gap it fills. ` +
    `Respond in JSON only: {"suggestions": [{"ticker": "SYM", "company": "Name", "reason": "..."}]}`

  try {
    const results = await ollamaSuggest(
      system,
      'Analyze my portfolio for value-chain gaps and recommend companies.'
    )
    if (results.length === 0) return 0

    let created = 0
    const existing = listSuggestions(100)
    for (const s of results) {
      if (!s.ticker || !s.company) continue
      const sym = s.ticker.toUpperCase()
      if (heldSymbols.has(sym)) continue
      const isDupe = existing.some(
        (e) => e.ticker === sym && e.mode === 'portfolio-gaps' && Date.now() - e.createdAt < 14 * 24 * 60 * 60 * 1000
      )
      if (isDupe) continue
      createSuggestion({
        ticker: sym,
        companyName: s.company,
        reason: s.reason ?? 'Fills a gap in your value chain coverage.',
        sourceArticleIds: [],
        mode: 'portfolio-gaps'
      })
      created++
    }
    console.log(`[discovery] portfolio gaps: ${created} suggestions`)
    return created
  } catch (err) {
    console.warn('[discovery] portfolio gaps failed:', err instanceof Error ? err.message : err)
    return 0
  }
}

// ---- Scheduling ----

let dailyTimer: NodeJS.Timeout | null = null
let weeklyTimer: NodeJS.Timeout | null = null

function lastSuggestionAge(mode: string): number {
  const row = getDb()
    .prepare<[string], { createdAt: number }>(
      `SELECT createdAt FROM discovery_suggestions WHERE mode = ? ORDER BY createdAt DESC LIMIT 1`
    )
    .get(mode)
  return row ? Date.now() - row.createdAt : Infinity
}

export function startDiscoverySchedule(): void {
  const DAILY_MS = 24 * 60 * 60 * 1000
  const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000

  if (lastSuggestionAge('daily') > DAILY_MS) {
    setTimeout(() => void runDailyDrip(), 30_000)
  }
  if (lastSuggestionAge('weekly') > WEEKLY_MS) {
    setTimeout(() => void runWeeklyCurated(), 60_000)
  }

  dailyTimer = setInterval(() => void runDailyDrip(), DAILY_MS)
  weeklyTimer = setInterval(() => void runWeeklyCurated(), WEEKLY_MS)
}

export function stopDiscoverySchedule(): void {
  if (dailyTimer) {
    clearInterval(dailyTimer)
    dailyTimer = null
  }
  if (weeklyTimer) {
    clearInterval(weeklyTimer)
    weeklyTimer = null
  }
}

// ---- Ollama helpers ----

// Single source of truth lives in ollamaService — re-import instead of
// redeclaring so PULSE_OLLAMA_URL / PULSE_OLLAMA_MODEL overrides apply
// uniformly across every service that calls Ollama.
import { OLLAMA_BASE, getOllamaModel } from './ollamaService'
const OLLAMA_MODEL = getOllamaModel()

interface SuggestionJSON {
  ticker?: string
  company?: string
  reason?: string
}

async function ollamaSuggest(
  system: string,
  user: string
): Promise<SuggestionJSON[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  let res: Response
  try {
    res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        stream: false,
        format: 'json',
        options: { num_predict: 1024 }
      }),
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) return []
  const body = (await res.json()) as { message?: { content?: string } }
  const content = body.message?.content
  if (!content) return []
  return parseSuggestions(content)
}

function parseSuggestions(raw: string): SuggestionJSON[] {
  try {
    const parsed = JSON.parse(raw) as { suggestions?: SuggestionJSON[] }
    if (Array.isArray(parsed.suggestions)) return parsed.suggestions
  } catch {
    // Try to salvage partial JSON — find complete objects in the suggestions array
    const match = raw.match(/\[\s*(\{[\s\S]*)/)?.[1]
    if (match) {
      const objects: SuggestionJSON[] = []
      const re = /\{[^{}]*\}/g
      let m: RegExpExecArray | null
      while ((m = re.exec(match)) !== null) {
        try {
          objects.push(JSON.parse(m[0]) as SuggestionJSON)
        } catch { /* skip malformed object */ }
      }
      if (objects.length > 0) return objects
    }
  }
  return []
}

// ---- Helpers ----

function hasWordBoundary(text: string, token: string): boolean {
  let from = 0
  while (from <= text.length - token.length) {
    const idx = text.indexOf(token, from)
    if (idx < 0) return false
    const before = idx > 0 ? text.charCodeAt(idx - 1) : 0
    const after = idx + token.length < text.length ? text.charCodeAt(idx + token.length) : 0
    if (!isAlnum(before) && !isAlnum(after)) return true
    from = idx + 1
  }
  return false
}

function isAlnum(code: number): boolean {
  if (code === 0) return false
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  )
}
