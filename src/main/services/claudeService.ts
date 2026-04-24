// Claude API wrapper. Mirrors the Ollama-backed calls that benefit most
// from a frontier model — chain generation and sector classification —
// so aiClient can hot-swap providers per call without the caller caring.
//
// Prompts reuse the same system/user text as ollamaService where possible
// because Claude handles them cleanly. We just strip the JSON prefill
// trick since Claude follows structured-output instructions directly via
// natural language.

import { getPreferences } from '../database/preferences'
import type {
  GeneratedValueChain,
  GeneratedValueChainEdge,
  GeneratedValueChainNode,
  TickerSectorCandidate,
  TickerSectorClassification
} from './ollamaService'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const REQUEST_TIMEOUT_MS = 90_000
const HEALTH_CHECK_TIMEOUT_MS = 5_000

// Model selection. Haiku 4.5 is cheap enough for classification (~$0.01/call);
// Sonnet 4.6 is worth the step up for chain generation where judgment and
// real-world knowledge about public companies actually matter.
const MODELS = {
  chainGen: 'claude-sonnet-4-6',
  classifier: 'claude-haiku-4-5-20251001',
  health: 'claude-haiku-4-5-20251001'
} as const

export function isClaudeConfigured(): boolean {
  const prefs = getPreferences()
  if (!prefs.anthropicApiKey) return false
  // Quick shape check — Anthropic keys start with "sk-ant-".
  return prefs.anthropicApiKey.startsWith('sk-ant-')
}

// ---- health check -----------------------------------------------------------

// 60-second cache so we don't ping Anthropic every renderer refresh. Only
// flips to false on a verified error; absence of a key returns false but
// doesn't hit the network.
let lastHealthAt = 0
let lastHealthResult = false
const HEALTH_CACHE_MS = 60_000

export async function checkClaudeHealth(force = false): Promise<boolean> {
  if (!isClaudeConfigured()) {
    lastHealthResult = false
    return false
  }
  if (!force && Date.now() - lastHealthAt < HEALTH_CACHE_MS) return lastHealthResult

  const apiKey = getPreferences().anthropicApiKey
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
  try {
    // One-token ping. Messages API rejects requests with max_tokens=0, so
    // we ask for a single token and discard the response. Cheaper than
    // any other reachability check Anthropic exposes.
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODELS.health,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      }),
      signal: controller.signal
    })
    lastHealthAt = Date.now()
    lastHealthResult = res.ok
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(
        `[claude] health check failed: HTTP ${res.status}`,
        body.slice(0, 300)
      )
    }
    return lastHealthResult
  } catch (err) {
    lastHealthAt = Date.now()
    lastHealthResult = false
    console.warn(
      '[claude] health check error:',
      err instanceof Error ? err.message : err
    )
    return false
  } finally {
    clearTimeout(timer)
  }
}

// ---- core request helper ----------------------------------------------------

interface ClaudeMessageOptions {
  model: string
  system: string
  user: string
  maxTokens: number
}

async function callClaude(options: ClaudeMessageOptions): Promise<string | null> {
  const apiKey = getPreferences().anthropicApiKey
  if (!apiKey) return null

  // No assistant-message prefill: Sonnet 4.6 and newer Claude models reject
  // conversations that don't end with a user message. extractJsonObject()
  // tolerates markdown fences / prose prefixes so we don't need the prefill
  // trick — Claude reliably emits raw JSON when the system prompt says so.
  const messages: Array<{ role: 'user'; content: string }> = [
    { role: 'user', content: options.user }
  ]

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens,
        system: options.system,
        messages
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(
        `[claude] ${options.model} call failed: HTTP ${res.status}`,
        body.slice(0, 400)
      )
      return null
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
      stop_reason?: string
    }
    const textBlock = data.content?.find((c) => c.type === 'text')
    const body = textBlock?.text ?? ''
    return body.trim() || null
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.log(
        `[claude] ${options.model} timed out after ${REQUEST_TIMEOUT_MS} ms — skipping`
      )
    } else {
      console.warn(
        `[claude] ${options.model} error:`,
        err instanceof Error ? err.message : err
      )
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Strip common JSON extras Claude occasionally wraps output in: markdown
// fences, leading commentary before the first brace.
function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim()
  // Already a bare object.
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed
  // Fenced ```json ... ``` block.
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(trimmed)
  if (fenced && fenced[1]) {
    const inner = fenced[1].trim()
    if (inner.startsWith('{')) return inner
  }
  // Prose followed by a JSON object.
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1)
  return null
}

// ---- generateCompanyValueChain ---------------------------------------------

export async function generateCompanyValueChain(input: {
  symbol: string
  companyName: string
  profileDescription?: string | null
  tenKExcerpt?: string | null
  newsSnippets?: Array<{ title: string; summary: string | null }>
  // Canonical stage list for the focus's classified sub-sector. When
  // provided, Claude is constrained to pick stage ids from this list —
  // prevents fragmentation where one chain invents "credit-card-issuance"
  // and another "retail-lending" for overlapping concepts.
  canonicalStages?: Array<{ id: string; name: string }>
  sectorName?: string
  // Edges from OTHER chains that mention the focus. Fed as corroborating
  // context so regens converge toward graph-wide consistency — "TSM's
  // chain already claims it supplies you at 3nm, factor that in." We
  // deliberately do NOT pass the focus's OWN prior chain, which would
  // anchor on any mistakes in the previous output.
  crossChainMentions?: Array<{
    sourceFocus: string
    counterparty: string
    relationshipTowardFocus:
      | 'supplies-focus'
      | 'buys-from-focus'
      | 'competes-with-focus'
      | 'partners-with-focus'
    note: string | null
  }>
}): Promise<GeneratedValueChain | null> {
  if (!input.companyName.trim()) return null
  if (!(await checkClaudeHealth())) return null

  const profileBlock = input.profileDescription
    ? `\n\nCompany profile:\n${input.profileDescription.trim().slice(0, 2000)}`
    : ''
  const tenKBlock = input.tenKExcerpt
    ? `\n\n10-K Item 1 excerpt:\n${input.tenKExcerpt.trim().slice(0, 6000)}`
    : ''
  const newsBlock =
    input.newsSnippets && input.newsSnippets.length > 0
      ? '\n\nRecent news:\n' +
        input.newsSnippets
          .slice(0, 6)
          .map(
            (n, i) =>
              `${i + 1}. ${n.title}${n.summary ? ` — ${n.summary.slice(0, 200)}` : ''}`
          )
          .join('\n')
      : ''
  // Cross-chain corroboration block. Translates each neighboring-chain
  // mention into a human-readable "[counterparty] [role] [focus]" line
  // with the origin chain cited so Claude can weight corroborating
  // mentions (multiple chains agreeing on the same edge) more heavily.
  const crossChainBlock =
    input.crossChainMentions && input.crossChainMentions.length > 0
      ? '\n\nCross-chain mentions — edges from other tickers\' generated ' +
        `chains that reference ${input.symbol}:\n` +
        input.crossChainMentions
          .slice(0, 20)
          .map((m, i) => {
            const verb =
              m.relationshipTowardFocus === 'supplies-focus'
                ? 'supplies'
                : m.relationshipTowardFocus === 'buys-from-focus'
                  ? 'buys from'
                  : m.relationshipTowardFocus === 'competes-with-focus'
                    ? 'competes with'
                    : 'partners with'
            const noteSuffix = m.note ? ` — "${m.note.slice(0, 140)}"` : ''
            return `${i + 1}. [${m.sourceFocus}'s chain] ${m.counterparty} ${verb} ${input.symbol}${noteSuffix}`
          })
          .join('\n')
      : ''
  const groundingContext = (profileBlock + tenKBlock + newsBlock + crossChainBlock).trim()

  const system =
    `You map a public company's value chain: the stages of its industry, ` +
    `the companies in its ecosystem, and the relationships between them. ` +
    `Output STRICT JSON only (no markdown, no commentary), matching:\n` +
    `{\n` +
    `  "focus": "${input.symbol}",\n` +
    `  "stages": [ { "id": "kebab-case", "label": "Display Name" } ],\n` +
    `  "nodes": [\n` +
    `    {\n` +
    `      "symbol": "TICKER_OR_LABEL",\n` +
    `      "stage": "matches a stage id above",\n` +
    `      "name": "Company Inc.",\n` +
    `      "blurb": "one sentence, <140 chars, factual, no marketing",\n` +
    `      "isTicker": true | false\n` +
    `    }\n` +
    `  ],\n` +
    `  "edges": [\n` +
    `    {\n` +
    `      "from": "node symbol",\n` +
    `      "to": "node symbol",\n` +
    `      "relationship": "supplier" | "customer" | "competitor" | "partner",\n` +
    `      "note": "one sentence, <120 chars, grounded in facts",\n` +
    `      "source": "filings" | "news" | "profile" | "model"\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Rules:\n` +
    (input.canonicalStages && input.canonicalStages.length > 0
      ? `- STAGES ARE FIXED. Use EXACTLY these stage ids (no others, no inventions):\n` +
        input.canonicalStages
          .map((s) => `    "${s.id}" (${s.name})`)
          .join('\n') +
        `\n  Every node's "stage" field and every entry in the "stages" array ` +
        `MUST use one of these ids verbatim. If a company doesn't fit any of ` +
        `these stages cleanly, omit it from the chain.\n` +
        `- Order the stages array from upstream to downstream using the canonical list above.\n`
      : `- 3 to 7 stages, ordered upstream (inputs/origination) to downstream ` +
        `(end markets/consumers). kebab-case ids.\n` +
        `- Use INDUSTRY-APPROPRIATE stage names. Do NOT recycle tech-pipeline names ` +
        `(raw-materials, fabless, foundry) for non-tech sectors.\n`) +
    `- 6 to 20 nodes including the focus.\n` +
    `- 6 to 30 edges. Every edge endpoint must reference a node symbol in ` +
    `the nodes array. No dangling edges.\n` +
    `- isTicker=true ONLY for companies you know trade publicly on a major ` +
    `exchange with the ticker you emit. Use REAL tickers — SLB (not SCHL) ` +
    `for Schlumberger, SHEL (not ROYD) for Shell, BP for BP, C for Citigroup, ` +
    `USB for U.S. Bancorp, SCHW for Charles Schwab. When uncertain, set ` +
    `isTicker=false and use a stable UPPERCASE_LABEL.\n` +
    `\n` +
    `Edge direction — READ CAREFULLY. The "relationship" value ALWAYS ` +
    `describes the role of the "from" side:\n` +
    `- "supplier" = "from" sells/supplies/delivers to "to". Example: ` +
    `ASML supplies TSMC → {"from":"ASML","to":"TSM","relationship":"supplier"}.\n` +
    `- "customer" = "from" buys/licenses-from "to". Example: Apple buys ` +
    `chips from TSMC → {"from":"AAPL","to":"TSM","relationship":"customer"}.\n` +
    `- IP / patent licensing follows the same rule: the LICENSOR is the ` +
    `supplier (they sell access to IP), the LICENSEE is the customer (they ` +
    `pay for access). Example: Adeia licenses patents to Apple → either ` +
    `{"from":"ADEA","to":"AAPL","relationship":"supplier"} or equivalently ` +
    `{"from":"AAPL","to":"ADEA","relationship":"customer"}. NEVER write ` +
    `{"from":"ADEA","to":"AAPL","relationship":"customer"} — that would ` +
    `mean "Adeia is a customer of Apple", which is backwards.\n` +
    `- Common sanity check: in "X provides/licenses/supplies/serves Y", X is ` +
    `the supplier side and Y is the customer side, regardless of whether X ` +
    `or Y is the focus company.\n` +
    `- competitor / partner are symmetric.\n` +
    `- Do NOT emit edges where an automaker "supplies" a bank, or a retailer ` +
    `"supplies" a payment processor. If the relationship is indirect (both ` +
    `parties serve the same end customer), use "partner" or omit the edge.\n` +
    `- Only include well-documented relationships. No speculation.\n` +
    `\n` +
    `- blurbs <140 chars, notes <120 chars, factual, no marketing language.\n` +
    `\n` +
    `Cross-chain corroboration — when a "Cross-chain mentions" block is ` +
    `provided, treat it as prior art from other tickers' chains:\n` +
    `- Prefer INCLUDING edges that appear in cross-chain mentions, especially ` +
    `when multiple source chains corroborate the same relationship. Consistency ` +
    `across the graph is a real quality signal for users.\n` +
    `- Reject a cross-chain mention only when you have stronger grounding ` +
    `(10-K excerpt, recent news snippet, or direct product knowledge) that ` +
    `contradicts it. Don't silently drop corroborated edges.\n` +
    `- The mentions already encode direction relative to ${input.symbol} ` +
    `("[X] supplies ${input.symbol}" means X is a supplier to the focus). ` +
    `Translate faithfully: "supplies-focus" → an edge into the focus as a ` +
    `supplier, "buys-from-focus" → focus supplies them, "competes-with-focus" ` +
    `→ competitor, "partners-with-focus" → partner.\n` +
    `\n` +
    `\n` +
    `Edge "source" field — cite where the claim comes from so users can ` +
    `judge how grounded it is:\n` +
    `- "filings" if the relationship is stated or clearly implied in the ` +
    `10-K excerpt above (customers named in Item 1, risk factors citing ` +
    `suppliers, etc.).\n` +
    `- "news" if the relationship is stated in one of the recent news ` +
    `snippets above.\n` +
    `- "profile" if it comes from the company profile text above but not the 10-K.\n` +
    `- "model" if you know the relationship from your general training but ` +
    `none of the supplied context mentions it. Use this honestly — over-` +
    `claiming grounding degrades user trust.\n` +
    `\n` +
    `- If the value chain is genuinely unclear from the context, return ` +
    `{"focus":"${input.symbol}","stages":[],"nodes":[],"edges":[]}.`

  const user =
    `Focus company: ${input.companyName} (${input.symbol})` +
    (groundingContext
      ? `\n\n${groundingContext}`
      : '\n\nNo additional context available — use your general knowledge of this company.')

  console.log(
    `[claude] generateCompanyValueChain: ${input.symbol} "${input.companyName}" ` +
      `(context: ${groundingContext.length} chars, profile=${!!input.profileDescription}, ` +
      `10K=${!!input.tenKExcerpt}, news=${input.newsSnippets?.length ?? 0})`
  )

  const raw = await callClaude({
    model: MODELS.chainGen,
    system,
    user,
    // Claude produces noticeably richer chains than Ollama — 15-20 nodes
    // and 20-30 edges routinely — which can easily exceed 3-4k output
    // tokens of JSON. Caps below 6k truncate the response mid-array and
    // JSON.parse fails, triggering a needless Ollama fallback. 8k leaves
    // headroom for the biggest chains we've seen.
    maxTokens: 8000
  })
  if (!raw) return null

  const jsonText = extractJsonObject(raw)
  if (!jsonText) {
    console.warn('[claude] generateCompanyValueChain: could not extract JSON from response')
    return null
  }

  let parsed: {
    focus?: unknown
    stages?: unknown
    nodes?: unknown
    edges?: unknown
  }
  try {
    parsed = JSON.parse(jsonText) as typeof parsed
  } catch (err) {
    console.warn(
      '[claude] generateCompanyValueChain: JSON parse failed:',
      err instanceof Error ? err.message : err
    )
    return null
  }

  // Salvage-oriented validation — same permissive shape as the Ollama
  // equivalent so partial output still renders rather than forcing a retry.
  const stagesOut: Array<{ id: string; label: string }> = []
  if (Array.isArray(parsed.stages)) {
    for (const s of parsed.stages) {
      if (!s || typeof s !== 'object') continue
      const row = s as { id?: unknown; label?: unknown }
      if (typeof row.id !== 'string' || !row.id.trim()) continue
      stagesOut.push({
        id: row.id.trim(),
        label:
          typeof row.label === 'string' && row.label.trim()
            ? row.label.trim()
            : row.id.trim()
      })
    }
  }

  const nodesOut: GeneratedValueChainNode[] = []
  if (Array.isArray(parsed.nodes)) {
    for (const n of parsed.nodes) {
      if (!n || typeof n !== 'object') continue
      const row = n as {
        symbol?: unknown
        stage?: unknown
        name?: unknown
        blurb?: unknown
        isTicker?: unknown
      }
      const symbol = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : ''
      const name = typeof row.name === 'string' ? row.name.trim() : ''
      if (!symbol || !name) continue
      nodesOut.push({
        symbol,
        stage: typeof row.stage === 'string' ? row.stage.trim() : '',
        name,
        blurb: typeof row.blurb === 'string' ? row.blurb.trim().slice(0, 200) : null,
        isTicker: row.isTicker === true
      })
    }
  }

  // Synthesize missing stages from the nodes (same recovery as the Ollama
  // side). When Claude returns nodes but omits stages (or the stages don't
  // match the node.stage ids), we can still render.
  if (stagesOut.length === 0 && nodesOut.length > 0) {
    const seen = new Set<string>()
    for (const n of nodesOut) {
      if (!n.stage || seen.has(n.stage)) continue
      seen.add(n.stage)
      stagesOut.push({ id: n.stage, label: n.stage.replace(/-/g, ' ') })
    }
  }

  const nodeSymbols = new Set(nodesOut.map((n) => n.symbol))
  const edgesOut: GeneratedValueChainEdge[] = []
  if (Array.isArray(parsed.edges)) {
    for (const e of parsed.edges) {
      if (!e || typeof e !== 'object') continue
      const row = e as {
        from?: unknown
        to?: unknown
        relationship?: unknown
        note?: unknown
        source?: unknown
      }
      const from = typeof row.from === 'string' ? row.from.trim().toUpperCase() : ''
      const to = typeof row.to === 'string' ? row.to.trim().toUpperCase() : ''
      if (!from || !to || from === to) continue
      // Dangling-endpoint tolerance: rather than discarding the edge, stub
      // the missing endpoint as an unverified node so the UI shows the
      // relationship instead of silently dropping it.
      if (!nodeSymbols.has(from)) {
        nodesOut.push({
          symbol: from,
          stage: nodesOut[0]?.stage ?? stagesOut[0]?.id ?? 'unknown',
          name: from,
          blurb: null,
          isTicker: false
        })
        nodeSymbols.add(from)
      }
      if (!nodeSymbols.has(to)) {
        nodesOut.push({
          symbol: to,
          stage: nodesOut[0]?.stage ?? stagesOut[0]?.id ?? 'unknown',
          name: to,
          blurb: null,
          isTicker: false
        })
        nodeSymbols.add(to)
      }
      const rel = row.relationship
      const validRel =
        rel === 'supplier' || rel === 'customer' || rel === 'competitor' || rel === 'partner'
      if (!validRel) continue
      const rawSource = typeof row.source === 'string' ? row.source.trim().toLowerCase() : ''
      const source =
        rawSource === 'filings' ||
        rawSource === 'news' ||
        rawSource === 'profile' ||
        rawSource === 'model'
          ? rawSource
          : null
      edgesOut.push({
        from,
        to,
        relationship: rel,
        note: typeof row.note === 'string' ? row.note.trim().slice(0, 200) : null,
        source
      })
    }
  }

  const focusSym =
    typeof parsed.focus === 'string' && parsed.focus.trim()
      ? parsed.focus.trim().toUpperCase()
      : input.symbol.toUpperCase()

  if (nodesOut.length === 0 && edgesOut.length === 0) return null

  console.log(
    `[claude] generateCompanyValueChain: ${input.symbol} → ${stagesOut.length} stages, ` +
      `${nodesOut.length} nodes, ${edgesOut.length} edges`
  )

  return {
    focus: focusSym,
    stages: stagesOut,
    nodes: nodesOut,
    edges: edgesOut
  }
}

// ---- classifyTickerSectors --------------------------------------------------

export async function classifyTickerSectors(input: {
  symbol: string
  companyName: string
  profileDescription?: string | null
  tenKExcerpt?: string | null
  sectorCatalogPrompt: string
  validSectorIds: string[]
}): Promise<TickerSectorClassification | null> {
  if (!input.companyName.trim()) return null
  if (!(await checkClaudeHealth())) return null

  const system =
    `You classify a public company into sectors from a fixed catalog. ` +
    `Output STRICT JSON only (no markdown, no commentary):\n` +
    `{\n` +
    `  "primary": { "sectorId": "<id>", "confidence": 0.0-1.0, "reason": "one short sentence" },\n` +
    `  "secondary": [\n` +
    `    { "sectorId": "<id>", "confidence": 0.0-1.0, "reason": "one short sentence" }\n` +
    `  ]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- sectorId MUST be an EXACT id from the catalog below.\n` +
    `- STRONGLY prefer the most specific leaf sub-sector. Only pick a top-` +
    `level id (financials, technology, …) when the company truly spans 3+ ` +
    `sub-sectors materially (e.g. Berkshire Hathaway).\n` +
    `- Watch for misleading terms. "Payments network" and "card network" are ` +
    `fin-payments, NOT communication-services. "Cloud infrastructure" is ` +
    `tech-cloud. "Investment bank" / "commercial bank" = fin-banks.\n` +
    `- Calibration: Mastercard → fin-payments. Visa → fin-payments. ` +
    `JPMorgan → fin-banks. Amazon → tech-cloud primary, consumer-discretionary ` +
    `secondary. Netflix → comms-media. Alphabet → comms-interactive. ` +
    `Tesla → autos primary. Walmart → retail-ecom primary, consumer-staples ` +
    `secondary.\n` +
    `- secondary: other sectors where this company has a real material ` +
    `business line. Empty array if focused on one sector. Do NOT include a ` +
    `sector just because the company is a vendor to it.\n` +
    `- confidence is how certain you are about the assignment, not the size ` +
    `of the business.\n\n` +
    `Sector catalog (use these ids exactly):\n${input.sectorCatalogPrompt}`

  const profileLine = input.profileDescription
    ? `\nProfile: ${input.profileDescription.trim().slice(0, 1500)}`
    : ''
  const tenKLine = input.tenKExcerpt
    ? `\n10-K Item 1 excerpt: ${input.tenKExcerpt.trim().slice(0, 3500)}`
    : ''

  const user =
    `Symbol: ${input.symbol}\nCompany: ${input.companyName}${profileLine}${tenKLine}`

  const raw = await callClaude({
    model: MODELS.classifier,
    system,
    user,
    maxTokens: 600,
  })
  if (!raw) return null

  const jsonText = extractJsonObject(raw)
  if (!jsonText) return null

  let parsed: { primary?: unknown; secondary?: unknown }
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }

  const validSet = new Set(input.validSectorIds)
  const parseCandidate = (rawC: unknown): TickerSectorCandidate | null => {
    if (!rawC || typeof rawC !== 'object') return null
    const r = rawC as { sectorId?: unknown; confidence?: unknown; reason?: unknown }
    const sectorId = typeof r.sectorId === 'string' ? r.sectorId.trim() : ''
    if (!sectorId || !validSet.has(sectorId)) return null
    const conf = typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0
    const reason =
      typeof r.reason === 'string' && r.reason.trim().length > 0
        ? r.reason.trim().slice(0, 200)
        : null
    return { sectorId, confidence: conf, reason }
  }

  const primary = parseCandidate(parsed.primary)
  if (!primary) return null

  const secondary: TickerSectorCandidate[] = []
  if (Array.isArray(parsed.secondary)) {
    const seen = new Set<string>([primary.sectorId])
    for (const rawC of parsed.secondary) {
      const cand = parseCandidate(rawC)
      if (!cand) continue
      if (seen.has(cand.sectorId)) continue
      seen.add(cand.sectorId)
      secondary.push(cand)
    }
  }

  return { primary, secondary }
}

// ---- answerQuestion (hyperintelligence Q&A) ---------------------------------

// Concise, grounded answer for the hyperintelligence chat. Mirrors the
// shape of ollamaService.answerQuestion so the aiClient router can swap
// providers transparently. Routed to Haiku 4.5 — fast and cheap, plenty
// strong for short factual answers from a 600-char context window.
export async function answerQuestion(
  question: string,
  context?: string
): Promise<{ answer: string; confident: boolean } | null> {
  if (!question.trim()) return null
  if (!(await checkClaudeHealth())) return null

  const system =
    `You are a concise explainer for a private news-reader app. Answer the ` +
    `user's question in 2-4 sentences of plain text. If you are not ` +
    `confident — e.g. the question needs current data you don't have, or ` +
    `you'd be guessing — set "confident" to false and say so briefly. No ` +
    `hedging, no filler, no "as an AI". Output STRICT JSON only:\n` +
    `{"answer":"<text>","confident":true|false}`

  const userMsg =
    context && context.trim().length > 0
      ? `Question: ${question}\nContext: ${context.slice(0, 1500)}`
      : `Question: ${question}`

  const raw = await callClaude({
    model: MODELS.classifier,
    system,
    user: userMsg,
    maxTokens: 400
  })
  if (!raw) return null

  const jsonText = extractJsonObject(raw)
  if (!jsonText) return null

  let parsed: { answer?: unknown; confident?: unknown }
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }

  const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
  const confident = parsed.confident !== false
  if (!answer) return null
  return { answer, confident }
}
