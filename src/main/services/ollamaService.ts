import type { Domain } from '../database/categories'

const OLLAMA_BASE = process.env['PULSE_OLLAMA_URL'] ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env['PULSE_OLLAMA_MODEL'] ?? 'mistral:7b'
const REQUEST_TIMEOUT_MS = 60_000
const HEALTH_CHECK_TIMEOUT_MS = 3_000
const HEALTH_CACHE_MS = 60_000
const MAX_CONCURRENT = 2

let lastHealthCheckAt = 0
let healthy = false
const healthListeners = new Set<(online: boolean) => void>()

function emitHealth(online: boolean): void {
  const changed = online !== healthy
  healthy = online
  lastHealthCheckAt = Date.now()
  if (changed) {
    for (const cb of healthListeners) cb(online)
  }
}

async function pingOllama(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal })
      return res.ok
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return false
  }
}

export async function checkOllamaHealth(force = false): Promise<boolean> {
  if (!force && Date.now() - lastHealthCheckAt < HEALTH_CACHE_MS) return healthy
  const online = await pingOllama()
  emitHealth(online)
  return online
}

export function getOllamaStatus(): 'online' | 'offline' {
  return healthy ? 'online' : 'offline'
}

export function onOllamaStatusChange(cb: (online: boolean) => void): () => void {
  healthListeners.add(cb)
  return () => {
    healthListeners.delete(cb)
  }
}

export interface OllamaScoreInput {
  title: string
  summary: string | null
  domain: Domain
  tickers: string[]
  interests: string[]
}

export interface OllamaScoreResult {
  score: number
  reason: string
}

function buildSystemPrompt(input: OllamaScoreInput): string {
  if (input.domain === 'finance') {
    const list = input.tickers.length > 0 ? input.tickers.join(', ') : 'none listed'
    return (
      `You are a financial news urgency scorer. Given a news headline and summary, ` +
      `score its urgency from 1 to 5 for an investor holding the following stocks: ${list}. ` +
      `Consider: Does this news directly impact any of these holdings? Could it affect their ` +
      `supply chain, customers, or competitors? Is this breaking news or routine coverage? ` +
      `Respond in JSON only: {"score": N, "reason": "brief explanation"}`
    )
  }
  const list = input.interests.length > 0 ? input.interests.join(', ') : 'none listed'
  return (
    `You are a news urgency scorer. Given a news headline and summary, score its urgency ` +
    `from 1 to 5 for a person interested in the following topics and locations: ${list}. ` +
    `Consider: Is this breaking or developing news? Does it directly affect one of these areas? ` +
    `Is this a significant event or routine coverage? Would someone want to know about this ` +
    `immediately? Respond in JSON only: {"score": N, "reason": "brief explanation"}`
  )
}

export async function scoreWithOllama(
  input: OllamaScoreInput
): Promise<OllamaScoreResult | null> {
  if (!(await checkOllamaHealth())) return null

  const system = buildSystemPrompt(input)
  const user = `Headline: ${input.title}\nSummary: ${input.summary ?? ''}`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
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
          format: 'json'
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (res.status === 404 && body.includes('not found')) {
        console.warn(
          `[ollama] model '${OLLAMA_MODEL}' not installed. ` +
            `Run \`ollama pull ${OLLAMA_MODEL}\` to enable AI scoring + reel scripts. ` +
            `Falling back to keyword-only scoring.`
        )
      } else {
        console.warn(`[ollama] HTTP ${res.status}: ${body.slice(0, 200)}`)
      }
      emitHealth(false)
      return null
    }
    const body = (await res.json()) as { message?: { content?: string } }
    const content = body.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { score?: unknown; reason?: unknown }
    const score =
      typeof parsed.score === 'number' ? Math.round(parsed.score) : Number.NaN
    if (!Number.isFinite(score) || score < 1 || score > 5) return null
    emitHealth(true)
    return {
      score,
      reason: typeof parsed.reason === 'string' ? parsed.reason : ''
    }
  } catch (err) {
    console.warn('[ollama] scoring failed:', err instanceof Error ? err.message : err)
    emitHealth(false)
    return null
  }
}

// ---- bounded-concurrency queue ----

type Task = () => Promise<void>
const queue: Task[] = []
const inflight = new Set<Promise<void>>()

function pumpQueue(): void {
  while (inflight.size < MAX_CONCURRENT && queue.length > 0) {
    const task = queue.shift()!
    const p = task().finally(() => {
      inflight.delete(p)
      pumpQueue()
    })
    inflight.add(p)
  }
}

export function enqueueOllamaTask(task: Task): void {
  queue.push(task)
  pumpQueue()
}

export function getOllamaModel(): string {
  return OLLAMA_MODEL
}

export async function describeCompany(
  symbol: string,
  companyName: string
): Promise<string | null> {
  if (!(await checkOllamaHealth())) return null

  const system =
    `You write concise investor-facing company descriptions. Given a ticker and company name, ` +
    `describe in ONE sentence (max 35 words) what the company does: its core business model, ` +
    `primary products or services, and where it sits in its value chain. No filler, no hype, ` +
    `no "is a company that". Respond in JSON only: {"description": "..."}`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Ticker: ${symbol}\nCompany: ${companyName}` }
          ],
          stream: false,
          format: 'json'
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      emitHealth(false)
      return null
    }
    const body = (await res.json()) as { message?: { content?: string } }
    const content = body.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { description?: unknown }
    const desc = typeof parsed.description === 'string' ? parsed.description.trim() : ''
    emitHealth(true)
    return desc.length > 0 ? desc : null
  } catch (err) {
    console.warn('[ollama] describeCompany failed:', err instanceof Error ? err.message : err)
    emitHealth(false)
    return null
  }
}

export async function resolveCanonicalTitle(
  term: string,
  context: string
): Promise<string | null> {
  if (!(await checkOllamaHealth())) return null
  if (context.trim().length < 20) return null

  const system =
    `You disambiguate terms appearing in news articles by mapping them to a single English ` +
    `Wikipedia article title. Given a highlighted term and the paragraph it appears in, return ` +
    `the canonical Wikipedia article title a reader would actually want. Use the context to ` +
    `pick among homonyms (e.g., "Jordan" in a basketball piece → "Michael Jordan"; in a Middle ` +
    `East piece → "Jordan"). If the term is already unambiguous, return the term itself. If no ` +
    `confident disambiguation is possible, return null. Respond in JSON only: ` +
    `{"title": "..."} or {"title": null}`

  const userMsg = `Term: ${term}\nContext: ${context.slice(0, 500)}`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMsg }
          ],
          stream: false,
          format: 'json'
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      emitHealth(false)
      return null
    }
    const body = (await res.json()) as { message?: { content?: string } }
    const content = body.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { title?: unknown }
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
    emitHealth(true)
    if (title.length === 0 || title.toLowerCase() === 'null') return null
    if (title.length > 120) return null
    return title
  } catch (err) {
    console.warn(
      '[ollama] resolveCanonicalTitle failed:',
      err instanceof Error ? err.message : err
    )
    emitHealth(false)
    return null
  }
}

export async function defineTerm(term: string, context?: string): Promise<string | null> {
  if (!(await checkOllamaHealth())) return null

  const system =
    `You explain terms, people, places, or concepts that appear in news articles. ` +
    `Given a highlighted term (and optionally the sentence it appeared in), respond with ONE ` +
    `concise, factual sentence (max 40 words) suitable for an inline reader tooltip. ` +
    `No filler, no hedging, no "this term refers to". Respond in JSON only: {"summary": "..."}`

  const userMsg = context && context.trim().length > 0
    ? `Term: ${term}\nContext: ${context.slice(0, 500)}`
    : `Term: ${term}`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMsg }
          ],
          stream: false,
          format: 'json'
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      emitHealth(false)
      return null
    }
    const body = (await res.json()) as { message?: { content?: string } }
    const content = body.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { summary?: unknown }
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    emitHealth(true)
    return summary.length > 0 ? summary : null
  } catch (err) {
    console.warn('[ollama] defineTerm failed:', err instanceof Error ? err.message : err)
    emitHealth(false)
    return null
  }
}

// Intent classifier for Hyperintelligence. The panel now dispatches to one of
// four handlers (feed finder, article search, general Q&A, settings) and this
// picks which one. Returning 'auto' means the classifier was offline or
// ambiguous — callers fall back to the original feed-finder behavior, which
// preserves the pre-router UX if Ollama is down.
export type HyperIntent =
  | 'find_feeds'
  | 'search_articles'
  | 'general_qa'
  | 'adjust_settings'

export async function classifyHyperIntent(
  userMessage: string
): Promise<HyperIntent | null> {
  if (!(await checkOllamaHealth())) return null

  const system =
    `Classify the user's message into one of these intents for a news-reader app:\n` +
    `- find_feeds: they want more coverage / new RSS feeds / suggestions of publishers\n` +
    `- search_articles: they want to find articles already in their personal feed ("show me articles about X", "what did I read about Y")\n` +
    `- general_qa: they're asking a general-knowledge question ("what is X?", "how does Y work?", "explain Z")\n` +
    `- adjust_settings: they want to change or check a preference ("how do I change theme?", "what's my poll interval?", "turn on quiet hours")\n\n` +
    `Respond JSON only: {"intent":"find_feeds"} — pick exactly one.`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMessage }
          ],
          stream: false,
          format: 'json',
          // Intent JSON is ~20 tokens; capping keeps latency low.
          options: { num_predict: 40, temperature: 0.1 }
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      emitHealth(false)
      return null
    }
    const body = (await res.json()) as { message?: { content?: string } }
    const content = body.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { intent?: unknown }
    const intent = typeof parsed.intent === 'string' ? parsed.intent : ''
    emitHealth(true)
    if (
      intent === 'find_feeds' ||
      intent === 'search_articles' ||
      intent === 'general_qa' ||
      intent === 'adjust_settings'
    ) {
      return intent
    }
    return null
  } catch (err) {
    console.warn('[ollama] classifyHyperIntent failed:', err instanceof Error ? err.message : err)
    emitHealth(false)
    return null
  }
}

// General Q&A — multi-sentence answer for Hyperintelligence's general mode.
// defineTerm caps at 40 words which is too terse for questions like
// "how does the CHIPS act work?". We still bound length to keep the chat
// UI compact and we instruct the model to bail rather than confabulate.
export async function answerQuestion(
  question: string,
  context?: string
): Promise<{ answer: string; confident: boolean } | null> {
  if (!(await checkOllamaHealth())) return null

  const system =
    `You are a concise explainer for a private news-reader app. Answer the user's ` +
    `question in 2-4 sentences of plain text. If you are not confident — e.g. ` +
    `the question needs current data you don't have, or you're guessing — set ` +
    `"confident" to false and say so briefly. No hedging or filler. ` +
    `Respond JSON only: {"answer":"...","confident":true}`
  const userMsg = context && context.trim().length > 0
    ? `Question: ${question}\nContext: ${context.slice(0, 600)}`
    : `Question: ${question}`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMsg }
          ],
          stream: false,
          format: 'json',
          options: { num_predict: 240, temperature: 0.2 }
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      emitHealth(false)
      return null
    }
    const body = (await res.json()) as { message?: { content?: string } }
    const content = body.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { answer?: unknown; confident?: unknown }
    const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
    const confident = parsed.confident !== false
    emitHealth(true)
    return answer.length > 0 ? { answer, confident } : null
  } catch (err) {
    console.warn('[ollama] answerQuestion failed:', err instanceof Error ? err.message : err)
    emitHealth(false)
    return null
  }
}

export interface SuggestedFeed {
  title: string
  // Publisher homepage URL. The app autodiscovers the actual feed URL from
  // this page's HTML (`<link rel="alternate" type="application/rss+xml">`).
  homepage: string
  category: string
  reason: string
}

export interface FeedSuggestionPayload {
  reply: string
  suggestions: SuggestedFeed[]
}

export async function suggestFeeds(
  userMessage: string,
  existingCategories: string[],
  existingFeedURLs: string[]
): Promise<FeedSuggestionPayload | null> {
  if (!(await checkOllamaHealth())) return null

  const cats = existingCategories.length > 0 ? existingCategories.join(', ') : 'none yet'
  // Shorten the context — just the hostnames of 15 already-held feeds is
  // enough signal for de-dup without dumping ~2KB of URL tokens into the
  // prompt (which was materially slowing down mistral's first-token latency).
  const heldHosts = Array.from(
    new Set(
      existingFeedURLs
        .map((u) => {
          try {
            return new URL(u).hostname.replace(/^www\./, '')
          } catch {
            return ''
          }
        })
        .filter((h) => h.length > 0)
    )
  ).slice(0, 15)
  const held = heldHosts.length > 0 ? heldHosts.join(', ') : 'none yet'

  // Ask for publisher HOMEPAGES, not feed URLs. LLMs hallucinate feed paths
  // (most suggestions used to 404); homepage URLs are reliable knowledge and
  // we can autodiscover the real feed URL from the page HTML.
  //
  // Also: guard against meta/off-topic messages. This chat surface is a
  // feed-finder, but users treat it like a general assistant and ask things
  // like "can we change preferences from here?". Without this guard the LLM
  // happily hallucinates publishers matching the literal text of the query.
  const system =
    `You are a feed-finder. Your only job is to suggest RSS publishers when the user asks for more coverage on a topic, publisher, or angle.\n\n` +
    `If the user's message is NOT a request for coverage — e.g. it's a meta question about this app ("can I adjust preferences?", "how does this work?"), a greeting, a thank-you, or otherwise off-topic — respond with an EMPTY suggestions array and put one short sentence in "reply" that politely redirects them. Example redirects: "This chat only suggests feeds — try Settings for preferences." / "Ask me about a topic or publisher you want more coverage on."\n\n` +
    `Otherwise, suggest 3 reputable publishers whose coverage matches the user's interest. Return each publisher's homepage URL (e.g. "https://www.reuters.com", NOT a feed path). Map each to one of the user's existing categories when possible, or propose a short new category name. Keep reasons to one short phrase. Do NOT suggest any publisher whose hostname appears in the user's already-subscribed list — pick different publishers instead.\n\n` +
    `Respond JSON only:\n` +
    `{"reply":"1 short sentence","suggestions":[{"title":"Publisher name","homepage":"https://...","category":"","reason":""}]}`

  const user =
    `User request: ${userMessage}\n` +
    `Existing categories: ${cats}\n` +
    `Already-subscribed feed URLs: ${held}`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
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
          // Cap generation — the payload is a tiny JSON object with 3 entries,
          // so allowing mistral to ramble past ~300 tokens only costs latency.
          options: { num_predict: 320, temperature: 0.3 }
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      emitHealth(false)
      return null
    }
    const body = (await res.json()) as { message?: { content?: string } }
    const content = body.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { reply?: unknown; suggestions?: unknown }
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : ''
    const suggestions: SuggestedFeed[] = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .map((raw) => {
            const s = raw as Record<string, unknown>
            const title = typeof s['title'] === 'string' ? s['title'].trim() : ''
            // Accept `homepage` (new schema) or `url` (older models may still
            // emit the old key). Either way we treat it as the homepage.
            const homepageRaw =
              typeof s['homepage'] === 'string'
                ? s['homepage'].trim()
                : typeof s['url'] === 'string'
                  ? s['url'].trim()
                  : ''
            const category = typeof s['category'] === 'string' ? s['category'].trim() : ''
            const reason = typeof s['reason'] === 'string' ? s['reason'].trim() : ''
            return { title, homepage: homepageRaw, category, reason }
          })
          .filter((s) => /^https?:\/\//i.test(s.homepage))
      : []
    emitHealth(true)
    return { reply, suggestions }
  } catch (err) {
    console.warn('[ollama] suggestFeeds failed:', err instanceof Error ? err.message : err)
    emitHealth(false)
    return null
  }
}

export interface TickerSummaryInput {
  symbol: string
  companyName: string
  headlines: { title: string; summary: string | null; source: string }[]
}

export async function summarizeTickerNews(input: TickerSummaryInput): Promise<string | null> {
  if (input.headlines.length === 0) return null
  if (!(await checkOllamaHealth())) return null

  const bullets = input.headlines
    .slice(0, 10)
    .map((h, i) => {
      const snippet = (h.summary ?? '').replace(/\s+/g, ' ').slice(0, 220)
      return `${i + 1}. [${h.source}] ${h.title}${snippet ? ` — ${snippet}` : ''}`
    })
    .join('\n')

  const system =
    `You brief an investor on today's news for a single stock. Given headlines, ` +
    `write a tight 2-3 sentence summary of what an investor in ${input.symbol} (${input.companyName}) ` +
    `should know right now. Focus on material impact: earnings, products, regulation, supply chain, ` +
    `competitors, management. No filler, no "here is a summary" preamble. ` +
    `Respond in JSON only: {"summary": "..."}`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Today's headlines:\n${bullets}` }
          ],
          stream: false,
          format: 'json'
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      emitHealth(false)
      return null
    }
    const body = (await res.json()) as { message?: { content?: string } }
    const content = body.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { summary?: unknown }
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    emitHealth(true)
    return summary.length > 0 ? summary : null
  } catch (err) {
    console.warn('[ollama] summary failed:', err instanceof Error ? err.message : err)
    emitHealth(false)
    return null
  }
}
