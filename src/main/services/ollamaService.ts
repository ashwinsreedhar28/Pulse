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

export interface PersonalBriefInput {
  title: string
  body: string
  // Matched entities from the user's Pulse (watchlist tickers, teams, geos,
  // supply-chain neighbors). Caller provides both the label we want the model
  // to reference and a short qualifier so the line sounds personal rather
  // than generic.
  matches: Array<{ label: string; detail: string }>
}

// One-sentence "why this matters to you" for the reader block. Grounded in
// the article body + the caller-supplied match list; the model is explicitly
// told not to invent entities outside that list. Returns null when the
// article has no personal angle worth prose-ifying (the chips UI still shows
// the match list — prose is the progressive enhancement, not the load-bearing
// surface).
export async function generatePersonalBrief(
  input: PersonalBriefInput
): Promise<string | null> {
  if (!(await checkOllamaHealth())) return null
  if (input.matches.length === 0) return null

  const entityList = input.matches
    .map((m, i) => `${i + 1}. ${m.label} — ${m.detail}`)
    .join('\n')

  const system =
    `You write a one-sentence "why this matters to you" briefing for a news reader.\n\n` +
    `The reader personally tracks a set of entities (stocks in a watchlist, ` +
    `their supply-chain neighbors, favorite sports teams/athletes, tracked ` +
    `locations). Your job is to explain in ONE short sentence, grounded in the ` +
    `article, why this article is relevant to THIS reader.\n\n` +
    `Rules (strict):\n` +
    `- Exactly ONE sentence, maximum 28 words.\n` +
    `- Ground every claim in the article's content. Do not invent facts, numbers, or causal chains.\n` +
    `- Reference 1 or at most 2 of the supplied matched entities by the exact label provided. Do not introduce entities that are not in the list.\n` +
    `- Frame it as personal: use "your watchlist X" or "your tracked Y" phrasing when natural. Do not address the reader directly with "you should".\n` +
    `- No preamble ("This article..."), no meta-commentary, no hedging ("may", "might", "could").\n` +
    `- If none of the matched entities is materially connected to the article's actual content, return an empty string.\n\n` +
    `Respond JSON only: {"line":"..."}`

  const user =
    `Article title: ${input.title}\n` +
    `Article excerpt: ${input.body.slice(0, 2200)}\n\n` +
    `Matched entities the reader tracks:\n${entityList}`

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
          // Tight cap — the payload is a single sentence. Low temperature
          // because we want the model to stay literal to the article, not
          // get creative.
          options: { num_predict: 160, temperature: 0.2 }
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
    const parsed = JSON.parse(content) as { line?: unknown }
    const line = typeof parsed.line === 'string' ? parsed.line.trim() : ''
    emitHealth(true)
    if (line.length === 0) return null
    // Strip quotes the model occasionally wraps around the sentence.
    return line.replace(/^["“]+|["”]+$/g, '').trim() || null
  } catch (err) {
    console.warn(
      '[ollama] generatePersonalBrief failed:',
      err instanceof Error ? err.message : err
    )
    emitHealth(false)
    return null
  }
}

// Classify a candidate edge between two tickers by reading a few supporting
// article snippets. Returns the model's view of the relationship along with
// a calibrated confidence score that the graph-candidates auto-judge uses to
// gate commits. Unlike the looser generate/summarize prompts, the model here
// is explicitly told to return "unclear" when the evidence is thin — a low-
// confidence answer is more useful than a hallucinated one.
export type GraphEdgeRelationship =
  | 'supplier'
  | 'customer'
  | 'competitor'
  | 'partner'
  | 'unclear'

export interface GraphEdgeClassification {
  relationship: GraphEdgeRelationship
  // Which symbol supplies/buys/competes: always expressed as `fromSymbol -> toSymbol`.
  // For 'supplier', from supplies to. For 'customer', from buys from to. For
  // 'competitor' and 'partner', direction is symmetric (model returns either
  // valid orientation and the service stores it as-is).
  direction: 'a_to_b' | 'b_to_a' | 'symmetric'
  // Short (<90 char) human-readable note describing the relationship, grounded
  // in the evidence. Empty string when relationship is 'unclear'.
  note: string
  // 0..1 self-reported confidence. Calibrated to the threshold gate:
  //   < 0.6 → reject
  //   0.6-0.8 → accept if source signal is strong (e.g. ≥5 co-mentions)
  //   > 0.8 → accept
  confidence: number
  // One-line rationale that the audit log surfaces back to the user.
  rationale: string
}

export async function classifyGraphEdge(input: {
  symbolA: string
  symbolB: string
  // Usually tickers' company names; used so the model can reason about
  // "Apple" rather than just "AAPL".
  nameA: string
  nameB: string
  snippets: Array<{ title: string; summary: string | null }>
}): Promise<GraphEdgeClassification | null> {
  if (input.snippets.length === 0) return null
  if (!(await checkOllamaHealth())) return null

  const bullets = input.snippets
    .slice(0, 6)
    .map((s, i) => {
      const sum = s.summary?.slice(0, 280) ?? ''
      return `${i + 1}. "${s.title}"${sum ? ` — ${sum}` : ''}`
    })
    .join('\n')

  const system =
    `You judge supply-chain relationships between pairs of public companies ` +
    `based ONLY on the article snippets provided. You are the quality gate for ` +
    `an automated graph-growth pipeline; precision matters more than recall. ` +
    `When in doubt, return "unclear" with low confidence — a false positive ` +
    `poisons the graph.\n\n` +
    `Return strict JSON:\n` +
    `{\n` +
    `  "relationship": "supplier" | "customer" | "competitor" | "partner" | "unclear",\n` +
    `  "direction": "a_to_b" | "b_to_a" | "symmetric",\n` +
    `  "note": "...under 90 chars, grounded in the evidence...",\n` +
    `  "confidence": 0.0-1.0,\n` +
    `  "rationale": "one-line reason for this classification"\n` +
    `}\n\n` +
    `Definitions:\n` +
    `- supplier: A sells physical products / services / IP to B that B uses ` +
    `as inputs (e.g. chips, equipment, software licenses, cloud compute).\n` +
    `- customer: A buys from B (inverse of supplier).\n` +
    `- competitor: A and B sell substitutable products to overlapping buyers.\n` +
    `- partner: joint venture, co-development, distribution, licensing deal, ` +
    `or other strategic alignment that isn't a straight buy/sell.\n` +
    `- unclear: articles don't concretely support any of the above. Default to ` +
    `this whenever there's genuine ambiguity; return confidence ≤ 0.4.\n\n` +
    `Direction conventions:\n` +
    `- "a_to_b" = symbol A is the FROM end of the edge (supplier when ` +
    `relationship=supplier; buyer when customer).\n` +
    `- "b_to_a" = symbol B is the FROM end.\n` +
    `- "symmetric" for competitor/partner (direction doesn't apply).\n\n` +
    `Rules:\n` +
    `- Only claim a relationship the articles actually describe. If the pair ` +
    `is only mentioned in a shared sector context, return "unclear".\n` +
    `- Don't infer from a single ambiguous mention. Require either an explicit ` +
    `statement ("Nvidia supplies AI chips to AWS") or two independent ` +
    `corroborating mentions.\n` +
    `- Note should name the what: product line, deal type, context. No ` +
    `marketing language. Example: "Supplies H100 GPUs used in AWS Trainium ` +
    `and Bedrock workloads."\n` +
    `- confidence calibration: >0.8 means "an analyst would write this edge ` +
    `into a research note." 0.6-0.8 means "likely but worth verifying." ` +
    `Below 0.6 means "don't commit."`

  const user =
    `Symbol A: ${input.symbolA} (${input.nameA})\n` +
    `Symbol B: ${input.symbolB} (${input.nameB})\n\n` +
    `Article snippets mentioning both:\n${bullets}`

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
          options: { num_predict: 260, temperature: 0.1 }
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
    const parsed = JSON.parse(content) as {
      relationship?: unknown
      direction?: unknown
      note?: unknown
      confidence?: unknown
      rationale?: unknown
    }
    emitHealth(true)
    const validRels: GraphEdgeRelationship[] = [
      'supplier',
      'customer',
      'competitor',
      'partner',
      'unclear'
    ]
    const rel =
      typeof parsed.relationship === 'string' &&
      (validRels as string[]).includes(parsed.relationship)
        ? (parsed.relationship as GraphEdgeRelationship)
        : 'unclear'
    const dir =
      parsed.direction === 'a_to_b' || parsed.direction === 'b_to_a'
        ? (parsed.direction as 'a_to_b' | 'b_to_a')
        : 'symmetric'
    const note =
      typeof parsed.note === 'string' ? parsed.note.trim().slice(0, 120) : ''
    const confRaw = typeof parsed.confidence === 'number' ? parsed.confidence : 0
    const confidence = Math.max(0, Math.min(1, confRaw))
    const rationale =
      typeof parsed.rationale === 'string' ? parsed.rationale.trim().slice(0, 180) : ''
    return {
      relationship: rel,
      direction: dir,
      note,
      confidence,
      rationale
    }
  } catch (err) {
    console.warn(
      '[ollama] classifyGraphEdge failed:',
      err instanceof Error ? err.message : err
    )
    emitHealth(false)
    return null
  }
}

// Extract customer-concentration disclosures from a 10-K's Item 1 (Business)
// or Item 7 (MD&A) prose. Public filers routinely disclose "Customer X
// accounted for 22% of revenue" when a single buyer passes 10% — this is
// the authoritative source for supplier→customer edges. Unlike news co-
// occurrence where the judge is inferring, here we're extracting stated
// facts from the filer's own legal disclosure.
export interface CustomerConcentrationEntry {
  // Named customer as the 10-K refers to them ("Apple Inc.", "Amazon.com",
  // sometimes unbranded like "Customer A" — we drop the unnamed ones later).
  name: string
  // Revenue share if explicitly stated (0.22 = 22%). Null when the filing
  // says "largest customer" or "significant portion" without a number.
  revenueSharePct: number | null
  // Verbatim clause supporting the claim (<200 chars). Lets the audit log
  // show why we think this edge exists, grounded in the filer's language.
  quote: string
}

export interface CustomerConcentrationResult {
  customers: CustomerConcentrationEntry[]
  // Model's self-assessment: "no concentration disclosed" is a valid answer
  // when the filer operates in a diversified customer base. We use this to
  // distinguish "nothing to extract" from "extraction failed".
  disclosureType: 'named_concentration' | 'anonymous_concentration' | 'diversified' | 'unclear'
}

export async function extractCustomerConcentration(input: {
  symbol: string
  companyName: string
  bodyText: string
}): Promise<CustomerConcentrationResult | null> {
  if (!input.bodyText.trim()) return null
  if (!(await checkOllamaHealth())) return null

  const system =
    `You extract customer-concentration disclosures from SEC 10-K filings. ` +
    `Your output feeds a supply-chain graph, so precision matters: only ` +
    `return customers the filing explicitly names. Do not infer from press ` +
    `releases, product descriptions, or partner lists.\n\n` +
    `Return strict JSON:\n` +
    `{\n` +
    `  "disclosureType": "named_concentration" | "anonymous_concentration" | "diversified" | "unclear",\n` +
    `  "customers": [\n` +
    `    {\n` +
    `      "name": "...customer's name as stated in the filing...",\n` +
    `      "revenueSharePct": 0.0-1.0 or null,\n` +
    `      "quote": "...verbatim clause supporting this...max 200 chars..."\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `disclosureType guide:\n` +
    `- named_concentration: filing names one or more customers with or without percentages.\n` +
    `- anonymous_concentration: filing says "one customer accounted for X%" without naming them. Return empty customers array.\n` +
    `- diversified: filing states no single customer is material (often "no customer accounts for more than 10%"). Return empty customers array.\n` +
    `- unclear: not enough info to determine. Return empty customers array.\n\n` +
    `Rules (strict):\n` +
    `- Only include customers the filing NAMES. "Customer A", "a major customer", ` +
    `"our largest customer" without a name → do not include.\n` +
    `- revenueSharePct must be a decimal (0.22 for 22%). Null if the filing ` +
    `says "significant" / "major" without a percentage.\n` +
    `- The customer must be the subject of a concentration disclosure, not ` +
    `a partner listed in a marketing paragraph. Clues: "accounted for", ` +
    `"represented X% of revenue", "largest customer", "net revenues from".\n` +
    `- Do not invent customers. If the text doesn't actually contain a ` +
    `concentration disclosure, return disclosureType "diversified" or ` +
    `"unclear" with an empty customers array.\n` +
    `- Max 6 customers. Keep quote under 200 chars.`

  const user =
    `Filer: ${input.companyName} (${input.symbol})\n\n` +
    `10-K excerpt (Item 1 / Item 1A / Item 7):\n${input.bodyText.slice(0, 12000)}`

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
          options: { num_predict: 800, temperature: 0.1 }
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
    const parsed = JSON.parse(content) as {
      disclosureType?: unknown
      customers?: unknown
    }
    emitHealth(true)
    const validDisclosure = [
      'named_concentration',
      'anonymous_concentration',
      'diversified',
      'unclear'
    ]
    const disclosureType = (
      typeof parsed.disclosureType === 'string' &&
      validDisclosure.includes(parsed.disclosureType)
        ? parsed.disclosureType
        : 'unclear'
    ) as CustomerConcentrationResult['disclosureType']

    const customers = Array.isArray(parsed.customers)
      ? parsed.customers
          .map((x: unknown) => x as { name?: unknown; revenueSharePct?: unknown; quote?: unknown })
          .filter((x) => typeof x.name === 'string' && (x.name as string).trim().length > 1)
          .map((x) => {
            const rawPct = x.revenueSharePct
            let pct: number | null = null
            if (typeof rawPct === 'number' && Number.isFinite(rawPct)) {
              // Guard against the model returning 22 instead of 0.22; any
              // value > 1 gets divided by 100.
              pct = rawPct > 1 ? rawPct / 100 : rawPct
              if (pct < 0 || pct > 1) pct = null
            }
            return {
              name: (x.name as string).trim(),
              revenueSharePct: pct,
              quote:
                typeof x.quote === 'string' ? (x.quote as string).trim().slice(0, 240) : ''
            }
          })
          // Drop anonymous placeholders that slipped past the prompt rules.
          .filter((c) => !/^customer\s+[a-z0-9]$/i.test(c.name))
          .filter((c) => !/^(a |the )?(major|largest|significant)\s+customer$/i.test(c.name))
          .slice(0, 6)
      : []

    return { disclosureType, customers }
  } catch (err) {
    console.warn(
      '[ollama] extractCustomerConcentration failed:',
      err instanceof Error ? err.message : err
    )
    emitHealth(false)
    return null
  }
}

// Classify a newly-discovered ticker so it can be placed in the value-chain
// graph alongside hand-curated nodes. Picks a stage from the supplied
// catalog (hard-coded to match supplyChainGraph.json's stage ids at call
// time so the model can only return known options) plus a sector bucket and
// a one-sentence blurb. "unclear" stage is a valid answer when the context
// is too thin — we reject the node candidate rather than guess.
export interface NewNodeClassification {
  stage: string // matches one of the supplied stage ids, or "unclear"
  sector: string // "semi" | "hardware" | "cloud" | "energy" | "auto" | "other"
  blurb: string // 1 sentence, under 140 chars
  confidence: number // 0..1
}

export async function classifyNewNode(input: {
  symbol: string
  companyName: string
  // Optional context: if the node was discovered via a 10-K that called it
  // out as a customer, pass the supporting quote. Empty string is fine for
  // sources without rich context.
  context: string
  // Valid stage ids from supplyChainGraph.json. The model is told to pick
  // from this list or return "unclear".
  stages: Array<{ id: string; label: string }>
}): Promise<NewNodeClassification | null> {
  if (!(await checkOllamaHealth())) return null
  if (!input.companyName.trim()) return null

  const stageList = input.stages.map((s) => `- ${s.id}: ${s.label}`).join('\n')

  const system =
    `You classify a public company into a supply-chain-graph stage so it ` +
    `can be placed alongside hand-curated nodes. Strict JSON output:\n` +
    `{\n` +
    `  "stage": "one of the stage ids below or 'unclear'",\n` +
    `  "sector": "semi" | "hardware" | "cloud" | "energy" | "auto" | "other",\n` +
    `  "blurb": "one sentence, <140 chars, no marketing language",\n` +
    `  "confidence": 0.0-1.0\n` +
    `}\n\n` +
    `Stage catalog:\n${stageList}\n\n` +
    `Rules:\n` +
    `- stage must be one of the listed ids (exact match) or the literal string "unclear".\n` +
    `- Return "unclear" with confidence < 0.5 when the company's business ` +
    `model doesn't cleanly fit any listed stage.\n` +
    `- blurb: lead with what the company makes or does. No "leading", ` +
    `"innovative", "premier" fluff. Example: "Designs memory controllers ` +
    `and PCIe switches used in data-center SSDs and servers."\n` +
    `- sector buckets: semi = chip designers/fabs/equipment; hardware = ` +
    `OEMs/networking/system builders; cloud = hyperscalers + SaaS; energy = ` +
    `power gen + grid + data-center infrastructure; auto = automakers and ` +
    `automotive suppliers; other = anything that doesn't fit.`

  const user =
    `Symbol: ${input.symbol}\n` +
    `Company: ${input.companyName}\n` +
    (input.context ? `Context: ${input.context.slice(0, 800)}` : '')

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
          options: { num_predict: 220, temperature: 0.1 }
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
    const parsed = JSON.parse(content) as {
      stage?: unknown
      sector?: unknown
      blurb?: unknown
      confidence?: unknown
    }
    emitHealth(true)
    const validStages = new Set<string>([...input.stages.map((s) => s.id), 'unclear'])
    const stage =
      typeof parsed.stage === 'string' && validStages.has(parsed.stage)
        ? (parsed.stage as string)
        : 'unclear'
    const validSectors = ['semi', 'hardware', 'cloud', 'energy', 'auto', 'other']
    const sector =
      typeof parsed.sector === 'string' && validSectors.includes(parsed.sector)
        ? (parsed.sector as string)
        : 'other'
    const blurb =
      typeof parsed.blurb === 'string' ? parsed.blurb.trim().slice(0, 200) : ''
    const rawConf = typeof parsed.confidence === 'number' ? parsed.confidence : 0
    const confidence = Math.max(0, Math.min(1, rawConf))
    return { stage, sector, blurb, confidence }
  } catch (err) {
    console.warn(
      '[ollama] classifyNewNode failed:',
      err instanceof Error ? err.message : err
    )
    emitHealth(false)
    return null
  }
}

// Heuristic: a "concrete figure" contains at least one digit and isn't
// phrased as prose. Rejects "Not provided", "Highlighted as growth driver",
// "N/A" — values that aren't useful in a numbers-grid but the model sometimes
// returns anyway. Keeps cases like "$96.4B", "+8% YoY", "$1.54", "72.3%".
function isConcreteFigure(value: string): boolean {
  if (!value) return false
  if (value.length > 28) return false
  if (!/\d/.test(value)) return false
  const lowered = value.toLowerCase()
  const prosePhrases = [
    'not provided',
    'not disclosed',
    'not specified',
    'not reported',
    'not given',
    'highlighted as',
    'growth driver',
    'see release',
    'see above',
    'n/a'
  ]
  for (const p of prosePhrases) {
    if (lowered.includes(p)) return false
  }
  return true
}

export interface EarningsReleaseSummary {
  // 3-5 sentence overview of the quarter. No JSON scaffolding, just prose.
  overview: string
  // Key reported figures as "label: value" pairs. Model extracts what the
  // release actually cites — revenue, EPS, growth rates, segment results,
  // whatever the company emphasized. Limited to 6 so the UI can render as a
  // tight grid.
  keyNumbers: Array<{ label: string; value: string }>
  // Forward guidance pulled from the release (next quarter / full year).
  // Empty array when the company didn't reaffirm or update guidance.
  guidance: string[]
  // 0-2 short management quotes that capture the tone of the call.
  quotes: string[]
}

// Summarize the text of a company's own earnings press release (Item 2.02 of
// an 8-K, usually surfaced as Exhibit 99.1). This is the most reliable free
// source for "what the company said about the quarter" — it's their words,
// not a third-party writer's. We extract structured fields so the UI can
// render as a dashboard rather than a prose blob.
export async function summarizeEarningsRelease(input: {
  symbol: string
  companyName: string
  filedAt: number
  bodyText: string
}): Promise<EarningsReleaseSummary | null> {
  if (!input.bodyText.trim()) return null
  if (!(await checkOllamaHealth())) return null

  const filedDate = new Date(input.filedAt).toISOString().slice(0, 10)

  const system =
    `You summarize corporate earnings press releases (SEC Item 2.02 / Exhibit 99.1) ` +
    `for an investor-facing dashboard. Extract what the company reported, grounded ` +
    `strictly in the provided text. Do not invent numbers, quotes, or guidance.\n\n` +
    `Output strict JSON with this shape:\n` +
    `{\n` +
    `  "overview": "3-5 concise sentences summarizing the quarter — revenue direction, ` +
    `margin/profit tone, segment callouts, any notable events.",\n` +
    `  "keyNumbers": [{"label": "...", "value": "..."}, ...],  // up to 6 items\n` +
    `  "guidance": ["...forward guidance statement...", ...],  // up to 3 items, empty array if no guidance\n` +
    `  "quotes": ["...short management quote...", ...]         // up to 2 items, empty array if none worth citing\n` +
    `}\n\n` +
    `Rules:\n` +
    `- keyNumbers: labels like "Revenue", "EPS (GAAP)", "Operating margin", "Data Center revenue", ` +
    `"FCF", "Customer count". Values must be a concrete figure as stated in the release — ` +
    `"$96.4B", "+8% YoY", "$1.54", "72.3%". Maximum ~20 characters per value.\n` +
    `- keyNumbers must be CONCRETE NUMBERS ONLY. If a line item wasn't explicitly reported as a ` +
    `number, OMIT the entry entirely. Do not write values like "Not provided", "N/A", ` +
    `"Highlighted as growth driver", or any prose — only labeled figures.\n` +
    `- guidance: only include if the release explicitly cites next-period outlook. Otherwise empty.\n` +
    `- quotes: attribute with role if present ("CEO: ..."). Keep each under 160 chars.\n` +
    `- overview: no marketing language, no "solid quarter" fluff. Lead with the numbers that moved.\n` +
    `- If the text isn't actually an earnings release (e.g., the 8-K was a different event), return ` +
    `{"overview": "", "keyNumbers": [], "guidance": [], "quotes": []}.`

  // mistral:7b handles ~8k-token context; we budget 6000 chars for the body
  // which is roughly 1500 tokens — leaves ample headroom for system + output.
  const user =
    `Company: ${input.companyName} (${input.symbol})\n` +
    `Filed: ${filedDate}\n\n` +
    `Earnings release text:\n${input.bodyText.slice(0, 6000)}`

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
          options: { num_predict: 900, temperature: 0.2 }
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
    const parsed = JSON.parse(content) as {
      overview?: unknown
      keyNumbers?: unknown
      guidance?: unknown
      quotes?: unknown
    }
    emitHealth(true)
    const overview = typeof parsed.overview === 'string' ? parsed.overview.trim() : ''
    if (!overview) return null
    // Drop any keyNumbers entry whose value is prose rather than a concrete
    // figure. The prompt instructs the model to omit these, but defensive
    // filtering keeps the UI clean even when the model drifts — and also
    // sanitizes older cached rows surfaced through the same pipeline.
    const keyNumbers = Array.isArray(parsed.keyNumbers)
      ? parsed.keyNumbers
          .map((x: unknown) => x as { label?: unknown; value?: unknown })
          .filter((x) => typeof x.label === 'string' && typeof x.value === 'string')
          .map((x) => ({ label: (x.label as string).trim(), value: (x.value as string).trim() }))
          .filter((x) => x.label.length > 0 && isConcreteFigure(x.value))
          .slice(0, 6)
      : []
    const guidance = Array.isArray(parsed.guidance)
      ? parsed.guidance
          .filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
          .slice(0, 3)
          .map((g) => g.trim())
      : []
    const quotes = Array.isArray(parsed.quotes)
      ? parsed.quotes
          .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
          .slice(0, 2)
          .map((q) => q.trim())
      : []
    return { overview, keyNumbers, guidance, quotes }
  } catch (err) {
    console.warn(
      '[ollama] summarizeEarningsRelease failed:',
      err instanceof Error ? err.message : err
    )
    emitHealth(false)
    return null
  }
}

export interface TickerSummaryInput {
  symbol: string
  companyName: string
  companyDescription?: string | null
  headlines: { title: string; summary: string | null; source: string }[]
}

export interface TickerSummaryResult {
  summary: string | null
  relevantCount: number
}

// Returns both the written summary and the model's count of how many headlines
// were materially about the company. A `relevantCount` of 0 is a signal from
// the model that nothing in the list actually concerned the ticker's business
// — the service layer uses that to show "No material news today" instead of a
// manufactured 3-sentence brief.
export async function summarizeTickerNews(
  input: TickerSummaryInput
): Promise<TickerSummaryResult | null> {
  if (input.headlines.length === 0) return { summary: null, relevantCount: 0 }
  if (!(await checkOllamaHealth())) return null

  const bullets = input.headlines
    .slice(0, 10)
    .map((h, i) => {
      const snippet = (h.summary ?? '').replace(/\s+/g, ' ').slice(0, 260)
      return `${i + 1}. [${h.source}] ${h.title}${snippet ? ` — ${snippet}` : ''}`
    })
    .join('\n')

  const profileLine = input.companyDescription
    ? `\nCompany context (what ${input.symbol} actually does): ${input.companyDescription}`
    : ''

  // The prompt is intentionally strict: the old version ("what an investor
  // should know right now") invited the model to invent causal chains from
  // weakly-related articles (e.g., surfacing Navy missile contracts under
  // Arm Holdings because "ARM" appeared in the Aegis computing discussion).
  // We now require the model to (a) count the headlines materially about
  // THIS company, (b) refuse to speculate, and (c) return an empty summary
  // when no headline actually concerns the company's business.
  const system =
    `You write an investor brief for a single stock, grounded only in the supplied headlines.${profileLine}\n\n` +
    `Rules (strict):\n` +
    `- Only mention facts explicitly stated in the headlines/snippets. Never speculate about what the company "may", "might", "could", or "potentially" do or benefit from.\n` +
    `- A headline is "relevant" only if it directly concerns ${input.companyName}'s business — its products, customers, suppliers, earnings, regulators, or executives. Generic industry news or articles that merely namecheck "${input.symbol}" are NOT relevant.\n` +
    `- If relevantCount is 0, return summary as an empty string. Do not write a summary from irrelevant headlines.\n` +
    `- If relevantCount >= 1, write 2-3 tight sentences (max 70 words) covering the most material news. No preamble, no "here is a summary", no hedging words.\n` +
    `- Do NOT name specific unrelated companies, products, or events from the headlines that don't concern ${input.symbol}.\n\n` +
    `Respond in JSON only: {"relevantCount": <integer>, "summary": "<string>"}`

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
            {
              role: 'user',
              content: `Headlines for ${input.symbol} (${input.companyName}):\n${bullets}`
            }
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
    const parsed = JSON.parse(content) as { summary?: unknown; relevantCount?: unknown }
    const summaryStr = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    const relevantCountRaw =
      typeof parsed.relevantCount === 'number' ? parsed.relevantCount : 0
    const relevantCount = Math.max(0, Math.min(relevantCountRaw, input.headlines.length))
    emitHealth(true)
    // Belt-and-braces: if the model says 0 relevant but still produced prose,
    // trust the count and drop the prose. This is the layer that catches the
    // hallucination mode even when the model disobeys the no-summary rule.
    if (relevantCount === 0) return { summary: null, relevantCount: 0 }
    return { summary: summaryStr.length > 0 ? summaryStr : null, relevantCount }
  } catch (err) {
    console.warn('[ollama] summary failed:', err instanceof Error ? err.message : err)
    emitHealth(false)
    return null
  }
}
