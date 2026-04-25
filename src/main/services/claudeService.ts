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

// Per-source context the generator can cite by reference id. Each kind
// gets a stable id ("F" for the filing, "P" for profile, "N1"/"N2"/...
// for news) that the model emits as `sourceRef` on edges it grounds in
// that source. The orchestrator in companyValueChainService builds these
// from the SEC filing row + Pulse article rows so the resolver can map
// the model's ref back to a clickable citation later.
export interface ChainGroundingFiling {
  accession: string
  cik: string
  formType: string
  filedAt: number
  url: string
  excerpt: string
}
export interface ChainGroundingArticle {
  refId: string // 'N1' | 'N2' | ...
  articleId: number
  title: string
  summary: string | null
  url: string | null
  publishedAt: number | null
  feedTitle: string | null
}

export async function generateCompanyValueChain(input: {
  symbol: string
  companyName: string
  profileDescription?: string | null
  // Structured 10-K context. When supplied, the prompt cites it as ref "F".
  filing?: ChainGroundingFiling | null
  // Backward-compat: callers that haven't been updated still pass tenKExcerpt
  // as a raw string. We treat it as an unciteable filing (no sourceRef).
  tenKExcerpt?: string | null
  // Structured news context. Each article has a stable refId ("N1", "N2"...)
  // the model uses on grounded edges. Backward-compat newsSnippets is also
  // accepted but doesn't get refIds, so the model can only cite by 'news'
  // category, not by article.
  articles?: ChainGroundingArticle[]
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
  // Pre-formatted block of user-flagged corrections for this focus's chain.
  // Built by chainCorrectionsService.formatCorrectionsForPrompt; null when
  // there are no active corrections. Injected into the system prompt as
  // ground-truth that overrides cross-chain mentions and model priors.
  userCorrectionsBlock?: string | null
}): Promise<GeneratedValueChain | null> {
  if (!input.companyName.trim()) return null
  if (!(await checkClaudeHealth())) return null

  // Profile is the only single-source category, so it gets a fixed ref
  // "P" — the model uses sourceRef="P" on edges grounded in profile text.
  const profileBlock = input.profileDescription
    ? `\n\nCompany profile [ref P]:\n${input.profileDescription.trim().slice(0, 2000)}`
    : ''
  // Filing block prefers the structured ChainGroundingFiling (gives the
  // model concrete metadata about WHICH 10-K it's looking at — form type
  // and filing date — and a stable ref "F" for citations). Falls back to
  // the legacy raw-string tenKExcerpt when callers haven't been updated.
  const tenKBlock = input.filing
    ? `\n\n${input.filing.formType} excerpt [ref F, filed ${new Date(input.filing.filedAt).toISOString().slice(0, 10)}, accession ${input.filing.accession}]:\n${input.filing.excerpt.trim().slice(0, 6000)}`
    : input.tenKExcerpt
      ? `\n\n10-K Item 1 excerpt [ref F]:\n${input.tenKExcerpt.trim().slice(0, 6000)}`
      : ''
  // Articles get N1, N2, ... refs. Each line carries the title, source
  // (feed name), and date so the model can pick the right one to cite
  // without having to read the full summary first.
  const newsBlock = input.articles && input.articles.length > 0
    ? '\n\nRecent news:\n' +
      input.articles
        .slice(0, 6)
        .map((a) => {
          const dateStr = a.publishedAt
            ? new Date(a.publishedAt).toISOString().slice(0, 10)
            : ''
          const meta = [a.feedTitle, dateStr].filter(Boolean).join(' · ')
          const metaSuffix = meta ? ` (${meta})` : ''
          const summarySuffix = a.summary ? ` — ${a.summary.slice(0, 200)}` : ''
          return `[ref ${a.refId}] ${a.title}${metaSuffix}${summarySuffix}`
        })
        .join('\n')
    : input.newsSnippets && input.newsSnippets.length > 0
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
    `      "source": "filings" | "news" | "profile" | "model",\n` +
    `      "sourceRef": "F" | "P" | "N1" | "N2" | ... (omit for source=model)\n` +
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
    `Edge "sourceRef" field — point to the SPECIFIC document the claim ` +
    `came from so the user can click through to read it themselves. The ` +
    `refs above (in [ref X] tags) are the only valid values:\n` +
    `- "F" when source="filings" and the claim came from the 10-K excerpt.\n` +
    `- "P" when source="profile" and the claim came from the profile text.\n` +
    `- "N1" / "N2" / ... when source="news" and the claim came from THAT ` +
    `specific article. Pick the one that actually mentions the relationship — ` +
    `if multiple do, pick the most recent. NEVER guess a refId that wasn't ` +
    `supplied above.\n` +
    `- OMIT sourceRef when source="model" (no document to cite).\n` +
    `- If you set source="filings"/"news"/"profile" but you don't have a ` +
    `matching ref above, downgrade source to "model" and omit sourceRef ` +
    `rather than fabricate a citation.\n` +
    `\n` +
    (input.userCorrectionsBlock
      ? `\n${input.userCorrectionsBlock}\n\n` +
        `These user corrections OVERRIDE everything else. If a cross-chain ` +
        `mention contradicts a user correction, the user wins.\n`
      : '') +
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
        sourceRef?: unknown
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
      const sourceRef =
        typeof row.sourceRef === 'string' && row.sourceRef.trim()
          ? row.sourceRef.trim()
          : null
      edgesOut.push({
        from,
        to,
        relationship: rel,
        note: typeof row.note === 'string' ? row.note.trim().slice(0, 200) : null,
        source,
        sourceRef
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

// ---- generateMorningBrief --------------------------------------------------
//
// Cross-ticker pre-market digest. Caller hands us pre-assembled inputs
// (overnight news, upcoming earnings, recent filings, IV movers); we write
// the prompt + parse Claude's structured output into BriefPayload.
//
// Sonnet 4.6 — the brief is the highest-judgment Claude call we make, and
// readability + cross-ticker insights matter more here than anywhere else.
// Haiku output reads like a list; Sonnet output reads like an analyst note.

export interface BriefPromptInput {
  watchlistSize: number
  // Pre-formatted lines per category, ranked-by-importance by the caller.
  // The service pre-truncates so this function doesn't have to know
  // about Claude's context window — it just stitches the prompt.
  newsLines: string[]
  earningsLines: string[]
  filingsLines: string[]
  ivLines: string[]
  // Local-time string ('Friday morning, April 25 2026') so Claude can
  // anchor copy in the user's frame ("yesterday", "this week", etc.).
  localDateLabel: string
}

import type { BriefPayload, BriefSection } from '../database/morningBriefs'

export async function generateMorningBrief(
  input: BriefPromptInput
): Promise<BriefPayload | null> {
  if (!(await checkClaudeHealth())) return null
  const totalLines =
    input.newsLines.length +
    input.earningsLines.length +
    input.filingsLines.length +
    input.ivLines.length
  if (totalLines === 0) return null

  const system =
    `You write a pre-market briefing for a self-directed investor with the ` +
    `following watchlist size (${input.watchlistSize} tickers). Output STRICT ` +
    `JSON only matching:\n` +
    `{\n` +
    `  "headline": "one-sentence summary, <120 chars, lead with the most ` +
    `material thing across all sections",\n` +
    `  "sections": [\n` +
    `    {\n` +
    `      "kind": "headlines" | "earnings" | "filings" | "iv",\n` +
    `      "title": "Section header (max ~32 chars)",\n` +
    `      "bullets": [\n` +
    `        {\n` +
    `          "text": "1-2 short sentences. NO em-dashes, NO bullet symbols, ` +
    `NO 'As of' framing, NO market commentary cliches.",\n` +
    `          "citations": [\n` +
    `            { "type": "article" | "filing" | "symbol", "ref": "<id-or-ticker>" }\n` +
    `          ]\n` +
    `        }\n` +
    `      ]\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- Include only sections where you have material to discuss. Skip empty ones.\n` +
    `- 3-5 bullets per section maximum. Quality over quantity.\n` +
    `- Citations are MANDATORY for any specific claim that came from one of ` +
    `the input lines. Use the bracketed id in each input line as ref:\n` +
    `  * News inputs are tagged [article:N] -> use {"type":"article","ref":"N"}\n` +
    `  * Filings are tagged [filing:ACCESSION] -> {"type":"filing","ref":"ACCESSION"}\n` +
    `  * Tickers in citations -> {"type":"symbol","ref":"AAPL"}\n` +
    `- Cross-ticker synthesis is the goal. Don't just list one bullet per news ` +
    `item — group related stories ("AAPL and MSFT both report Tuesday") or ` +
    `flag patterns ("three semiconductor names broke out of consolidation").\n` +
    `- Headline must be the single most actionable / newsworthy item the ` +
    `reader needs to see at a glance. Lead with severity, not chronology.\n` +
    `- Tone: confident analyst, no hedging language, no "may", "could", ` +
    `"appears to" unless genuinely uncertain. Plain English, no jargon ` +
    `unless the ticker context demands it.\n`

  const sectionParts: string[] = []
  if (input.newsLines.length > 0) {
    sectionParts.push(
      `News from the last 16 hours (${input.newsLines.length} stories):\n` +
        input.newsLines.slice(0, 40).join('\n')
    )
  }
  if (input.earningsLines.length > 0) {
    sectionParts.push(
      `Earnings calendar (next 7 days, ${input.earningsLines.length} reporters):\n` +
        input.earningsLines.slice(0, 25).join('\n')
    )
  }
  if (input.filingsLines.length > 0) {
    sectionParts.push(
      `SEC filings landed in the last 24 hours (${input.filingsLines.length}):\n` +
        input.filingsLines.slice(0, 25).join('\n')
    )
  }
  if (input.ivLines.length > 0) {
    sectionParts.push(
      `Implied-volatility movers (${input.ivLines.length}):\n` +
        input.ivLines.slice(0, 15).join('\n')
    )
  }

  const userMsg =
    `Today: ${input.localDateLabel}\n\n` + sectionParts.join('\n\n')

  console.log(
    `[claude] generateMorningBrief: ${totalLines} input lines (news=${input.newsLines.length}, earnings=${input.earningsLines.length}, filings=${input.filingsLines.length}, iv=${input.ivLines.length})`
  )

  const raw = await callClaude({
    model: MODELS.chainGen,
    system,
    user: userMsg,
    maxTokens: 3000
  })
  if (!raw) return null

  const jsonText = extractJsonObject(raw)
  if (!jsonText) {
    console.warn('[claude] generateMorningBrief: could not extract JSON from response')
    return null
  }

  let parsed: { headline?: unknown; sections?: unknown }
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    console.warn(
      '[claude] generateMorningBrief: JSON parse failed:',
      err instanceof Error ? err.message : err
    )
    return null
  }

  const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : ''
  if (!headline) return null

  const sections: BriefSection[] = []
  if (Array.isArray(parsed.sections)) {
    for (const s of parsed.sections) {
      if (!s || typeof s !== 'object') continue
      const sec = s as { kind?: unknown; title?: unknown; bullets?: unknown }
      const kind = typeof sec.kind === 'string' ? sec.kind.trim() : ''
      const title = typeof sec.title === 'string' ? sec.title.trim() : ''
      if (!kind || !title || !Array.isArray(sec.bullets)) continue
      const bullets: BriefSection['bullets'] = []
      for (const b of sec.bullets) {
        if (!b || typeof b !== 'object') continue
        const bullet = b as { text?: unknown; citations?: unknown }
        const text = typeof bullet.text === 'string' ? bullet.text.trim() : ''
        if (!text) continue
        const citations: BriefSection['bullets'][number]['citations'] = []
        if (Array.isArray(bullet.citations)) {
          for (const c of bullet.citations) {
            if (!c || typeof c !== 'object') continue
            const cite = c as { type?: unknown; ref?: unknown; label?: unknown }
            const type = typeof cite.type === 'string' ? cite.type : ''
            const ref = typeof cite.ref === 'string' ? cite.ref.trim() : ''
            if (!ref) continue
            if (type !== 'article' && type !== 'filing' && type !== 'symbol') continue
            const label =
              typeof cite.label === 'string' && cite.label.trim()
                ? cite.label.trim()
                : undefined
            citations.push({ type, ref, label })
          }
        }
        bullets.push({ text, citations: citations.length > 0 ? citations : undefined })
      }
      if (bullets.length === 0) continue
      sections.push({ kind, title, bullets })
    }
  }
  if (sections.length === 0) return null

  console.log(
    `[claude] generateMorningBrief: produced ${sections.length} section(s), ` +
      `${sections.reduce((acc, s) => acc + s.bullets.length, 0)} bullet(s)`
  )

  return {
    headline,
    generatedAtIso: new Date().toISOString(),
    sections,
    inputs: {
      watchlistSize: input.watchlistSize,
      articleCount: input.newsLines.length,
      earningsCount: input.earningsLines.length,
      filingsCount: input.filingsLines.length,
      ivMoverCount: input.ivLines.length
    }
  }
}
