// Runpod Serverless backend for the urgency-scoring call. Same input/output
// contract as ollamaService.scoreWithOllama so aiClient can swap providers
// per call. Talks to the endpoint's OpenAI-compatible route (worker-vllm):
//   POST https://api.runpod.ai/v2/<ENDPOINT_ID>/openai/v1/chat/completions
// and its health route:
//   GET  https://api.runpod.ai/v2/<ENDPOINT_ID>/health
// Docs: https://docs.runpod.io/serverless/endpoints/operations
//       https://docs.runpod.io/serverless/vllm/openai-compatibility
//
// Cold starts: a scale-to-zero endpoint takes 230-310 s (measured) to serve
// its first request. We do NOT wait for that. Scoring aborts at 20 s and
// returns null so aiClient falls back to Ollama; the job stays queued on
// Runpod and completes anyway, which is what warms the worker. A timeout
// also flips the cached health flag to false for HEALTH_CACHE_MS, so the
// next minute of score-3 articles goes straight to Ollama instead of each
// one burning a 20 s slot in the shared scoring queue.

import {
  buildScoringSystemPrompt,
  type OllamaScoreInput,
  type OllamaScoreResult
} from './ollamaService'

// TODO(prefs): RUNPOD_API_KEY / RUNPOD_ENDPOINT_ID belong next to
// anthropicApiKey in database/preferences.ts (+ Settings) so a packaged .app
// launched from Finder, which sees no shell env, can be configured. Env-only
// while the endpoint is being benchmarked; unconfigured = Ollama-only, which
// is today's behavior.
const RUNPOD_API_BASE = 'https://api.runpod.ai/v2'
const RUNPOD_API_KEY = (process.env['RUNPOD_API_KEY'] ?? '').trim()
const RUNPOD_ENDPOINT_ID = (process.env['RUNPOD_ENDPOINT_ID'] ?? '').trim()
// Served model name on the endpoint. vLLM matches this case-sensitively
// against the MODEL_NAME the worker was deployed with.
const RUNPOD_MODEL = process.env['PULSE_RUNPOD_MODEL'] ?? 'qwen/qwen3-8b'
const SCORE_TIMEOUT_MS = 20_000
const HEALTH_CHECK_TIMEOUT_MS = 5_000
const HEALTH_CACHE_MS = 60_000
const MAX_TOKENS = 128

// ---- health -----------------------------------------------------------------

let lastHealthCheckAt = 0
let healthy = false

function setHealth(online: boolean): void {
  healthy = online
  lastHealthCheckAt = Date.now()
}

export function isRunpodConfigured(): boolean {
  return RUNPOD_API_KEY.length > 0 && RUNPOD_ENDPOINT_ID.length > 0
}

async function pingRunpod(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
  try {
    const res = await fetch(`${RUNPOD_API_BASE}/${RUNPOD_ENDPOINT_ID}/health`, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
      signal: controller.signal
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// /health answers 200 whether or not a worker is warm: it reports queue and
// worker counts, it does not wait for one. So "healthy" here means reachable
// and authorized, not "will answer inside the scoring timeout". Cold-start
// detection happens in scoreWithRunpod via the abort path.
export async function checkRunpodHealth(force = false): Promise<boolean> {
  if (!isRunpodConfigured()) return false
  if (!force && Date.now() - lastHealthCheckAt < HEALTH_CACHE_MS) return healthy
  const online = await pingRunpod()
  setHealth(online)
  return online
}

export function getRunpodStatus(): 'online' | 'offline' | 'unconfigured' {
  if (!isRunpodConfigured()) return 'unconfigured'
  return healthy ? 'online' : 'offline'
}

// ---- usage tally (in-memory, no gate) ---------------------------------------
//
// Same pattern as aiClient's Claude tally: counts and token sums only, no
// dollar figures (price depends on GPU type and changes; the bench harness
// applies the rate). Health pings are not counted.

export interface RunpodUsage {
  calls: number // scoring requests sent
  ok: number // returned a valid 1-5 score
  timeouts: number // aborted at SCORE_TIMEOUT_MS (cold start or queue wait)
  errors: number // non-2xx, network error, or unparseable response
  promptTokens: number
  completionTokens: number
}

const usage: RunpodUsage = {
  calls: 0,
  ok: 0,
  timeouts: 0,
  errors: 0,
  promptTokens: 0,
  completionTokens: 0
}

export function getRunpodUsage(): RunpodUsage {
  return { ...usage }
}

export function resetRunpodUsage(): RunpodUsage {
  usage.calls = 0
  usage.ok = 0
  usage.timeouts = 0
  usage.errors = 0
  usage.promptTokens = 0
  usage.completionTokens = 0
  return { ...usage }
}

// ---- scoring ----------------------------------------------------------------

// System prompt is ollamaService.buildScoringSystemPrompt, imported so both
// backends see the identical text and the comparison isolates the host.
//
// Runpod-only suffix. Without it Qwen3 at temperature 0 pads "reason" out
// toward the token cap; one short sentence keeps completions cheap and the
// JSON closed before max_tokens.
const RUNPOD_PROMPT_SUFFIX = ' Keep reason to one sentence under 20 words.'

// The OpenAI route has no equivalent of Ollama's format:'json', so tolerate a
// fenced block or a sentence of preamble around the object.
function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  return trimmed.slice(start, end + 1)
}

export async function scoreWithRunpod(
  input: OllamaScoreInput
): Promise<OllamaScoreResult | null> {
  if (!isRunpodConfigured()) return null
  if (!(await checkRunpodHealth())) return null

  const system = buildScoringSystemPrompt(input) + RUNPOD_PROMPT_SUFFIX
  const user = `Headline: ${input.title}\nSummary: ${input.summary ?? ''}`

  usage.calls += 1
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SCORE_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(
      `${RUNPOD_API_BASE}/${RUNPOD_ENDPOINT_ID}/openai/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RUNPOD_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: RUNPOD_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0,
          max_tokens: MAX_TOKENS,
          // vLLM forwards this to the chat template. Qwen3 emits a <think>
          // block by default, which would spend the 128-token budget before
          // the JSON. Not part of the OpenAI schema; other models ignore it.
          chat_template_kwargs: { enable_thinking: false }
        }),
        signal: controller.signal
      }
    )
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      usage.timeouts += 1
      console.log(
        `[runpod] scoring timed out after ${SCORE_TIMEOUT_MS} ms (cold start or queue wait); ` +
          `skipping Runpod for ${HEALTH_CACHE_MS / 1000}s`
      )
    } else {
      usage.errors += 1
      console.warn('[runpod] scoring failed:', err instanceof Error ? err.message : err)
    }
    setHealth(false)
    return null
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.warn(`[runpod] HTTP ${res.status}: ${body.slice(0, 200)}`)
    usage.errors += 1
    setHealth(false)
    return null
  }

  // From here on the endpoint answered; a bad model output is an error for
  // the tally but does not mark the endpoint unhealthy.
  setHealth(true)
  try {
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    if (typeof data.usage?.prompt_tokens === 'number') {
      usage.promptTokens += data.usage.prompt_tokens
    }
    if (typeof data.usage?.completion_tokens === 'number') {
      usage.completionTokens += data.usage.completion_tokens
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      usage.errors += 1
      return null
    }
    const jsonText = extractJsonObject(content)
    if (!jsonText) {
      usage.errors += 1
      return null
    }
    const parsed = JSON.parse(jsonText) as { score?: unknown; reason?: unknown }
    const score = typeof parsed.score === 'number' ? Math.round(parsed.score) : Number.NaN
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      usage.errors += 1
      return null
    }
    usage.ok += 1
    return {
      score,
      reason: typeof parsed.reason === 'string' ? parsed.reason : ''
    }
  } catch (err) {
    usage.errors += 1
    console.warn('[runpod] bad response body:', err instanceof Error ? err.message : err)
    return null
  }
}
