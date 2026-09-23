// Runpod Serverless backend for the urgency-scoring call. Same input/output
// contract as ollamaService.scoreWithOllama so aiClient can swap providers
// per call. Talks to the endpoint's OpenAI-compatible route (worker-vllm):
//   POST https://api.runpod.ai/v2/<ENDPOINT_ID>/openai/v1/chat/completions
// its queue route, used only to trigger a cold start:
//   POST https://api.runpod.ai/v2/<ENDPOINT_ID>/run
// and its health route:
//   GET  https://api.runpod.ai/v2/<ENDPOINT_ID>/health
// Docs: https://docs.runpod.io/serverless/endpoints/operations
//       https://docs.runpod.io/serverless/vllm/openai-compatibility
//
// Cold starts: a scale-to-zero endpoint takes 230-310 s (measured) to serve
// its first request. We never wait for that inside a scoring call:
// 1. /health reports worker counts. When idle + ready + running are all zero
//    the endpoint is cold, so we POST the same request to /run (async, result
//    discarded), return null so Ollama scores the article, and open a skip
//    window of HEALTH_CACHE_MS. The queued job is what starts a worker; the
//    next poll finds it ready.
// 2. When /health says a worker exists but the request still stalls (queue
//    wait, first inference after a park, a worker /health is wrong about), a
//    20 s abort returns null and opens the same skip window, so the next
//    minute of score-3 articles goes straight to Ollama instead of each one
//    burning a slot.

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
const WARMUP_POST_TIMEOUT_MS = 10_000
const HEALTH_CHECK_TIMEOUT_MS = 5_000
const HEALTH_CACHE_MS = 60_000
const MAX_TOKENS = 128
// vLLM batches concurrent sequences on one GPU, so a warm worker takes eight
// in flight without serializing them the way Ollama's 2-wide queue must. A
// cold worker never sees eight: the health gate turns them away first.
const MAX_CONCURRENT = 8

// ---- health -----------------------------------------------------------------

// Worker counts from GET /health. Field names as observed in bench runs
// (bench/coldstart.py records the same object as workers_before); verify the
// full list against docs.runpod.io/serverless/endpoints/operations. Missing
// or non-numeric fields read as 0.
export interface RunpodWorkers {
  idle: number
  ready: number
  running: number
  initializing: number
  throttled: number
  unhealthy: number
}

interface RunpodHealth {
  // The endpoint answered 2xx with this key. Says nothing about warmth:
  // /health returns 200 with zero workers.
  reachable: boolean
  // null when the body had no parseable `workers` object.
  workers: RunpodWorkers | null
}

let lastHealth: RunpodHealth = { reachable: false, workers: null }
let lastHealthCheckAt = 0
// Shared in-flight ping so eight concurrent scoring tasks hitting an expired
// cache produce one GET, not eight.
let healthInFlight: Promise<RunpodHealth> | null = null
// Skip window: after a cold verdict or a timeout, scoring calls return null
// without touching the network until this passes. Same length as the health
// cache; separate from it because a cold endpoint is reachable, it just
// can't answer yet.
let skipUntil = 0
let lastWarmupAt = 0

function setHealth(next: RunpodHealth): void {
  lastHealth = next
  lastHealthCheckAt = Date.now()
}

function markSkip(): void {
  skipUntil = Date.now() + HEALTH_CACHE_MS
}

export function isRunpodConfigured(): boolean {
  return RUNPOD_API_KEY.length > 0 && RUNPOD_ENDPOINT_ID.length > 0
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function parseWorkers(body: unknown): RunpodWorkers | null {
  if (!body || typeof body !== 'object') return null
  const w = (body as { workers?: unknown }).workers
  if (!w || typeof w !== 'object') return null
  const r = w as Record<string, unknown>
  return {
    idle: num(r['idle']),
    ready: num(r['ready']),
    running: num(r['running']),
    initializing: num(r['initializing']),
    throttled: num(r['throttled']),
    unhealthy: num(r['unhealthy'])
  }
}

async function pingRunpod(): Promise<RunpodHealth> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
  try {
    const res = await fetch(`${RUNPOD_API_BASE}/${RUNPOD_ENDPOINT_ID}/health`, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
      signal: controller.signal
    })
    if (!res.ok) return { reachable: false, workers: null }
    const body = (await res.json().catch(() => null)) as unknown
    return { reachable: true, workers: parseWorkers(body) }
  } catch {
    return { reachable: false, workers: null }
  } finally {
    clearTimeout(timer)
  }
}

export async function checkRunpodHealth(force = false): Promise<RunpodHealth> {
  if (!isRunpodConfigured()) return { reachable: false, workers: null }
  if (!force && Date.now() - lastHealthCheckAt < HEALTH_CACHE_MS) return lastHealth
  if (!healthInFlight) {
    healthInFlight = pingRunpod()
      .then((h) => {
        setHealth(h)
        return h
      })
      .finally(() => {
        healthInFlight = null
      })
  }
  return healthInFlight
}

export function getRunpodStatus(): 'online' | 'offline' | 'unconfigured' {
  if (!isRunpodConfigured()) return 'unconfigured'
  return lastHealth.reachable ? 'online' : 'offline'
}

// Last parsed worker snapshot, for logging / a future status surface.
export function getRunpodWorkers(): RunpodWorkers | null {
  return lastHealth.workers
}

function isCold(w: RunpodWorkers): boolean {
  return w.idle + w.ready + w.running === 0
}

// ---- usage tally (in-memory, no gate) ---------------------------------------
//
// Same pattern as aiClient's Claude tally: counts and token sums only, no
// dollar figures (price depends on the GPU actually placed and changes; the
// bench harness applies the rate). Health pings are not counted.

export interface RunpodUsage {
  calls: number // scoring requests sent to the OpenAI route
  ok: number // returned a valid 1-5 score
  timeouts: number // aborted at SCORE_TIMEOUT_MS (queue wait or slow worker)
  errors: number // non-2xx, network error, or unparseable response
  cold: number // returned null because /health showed no worker; no request sent
  skipped: number // returned null inside a skip window; no network at all
  warmups: number // /run jobs queued to start a worker
  promptTokens: number
  completionTokens: number
}

const usage: RunpodUsage = {
  calls: 0,
  ok: 0,
  timeouts: 0,
  errors: 0,
  cold: 0,
  skipped: 0,
  warmups: 0,
  promptTokens: 0,
  completionTokens: 0
}

export function getRunpodUsage(): RunpodUsage {
  return { ...usage }
}

export function resetRunpodUsage(): RunpodUsage {
  for (const k of Object.keys(usage) as Array<keyof RunpodUsage>) usage[k] = 0
  return { ...usage }
}

// ---- bounded-concurrency queue ----------------------------------------------
//
// Same shape as ollamaService's queue, wider, and promise-returning so
// aiClient can await a slot's result and fall back to Ollama on null.

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

export function runRunpodTask<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(async () => {
      try {
        resolve(await fn())
      } catch (err) {
        reject(err)
      }
    })
    pumpQueue()
  })
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

function buildChatBody(system: string, user: string): Record<string, unknown> {
  return {
    model: RUNPOD_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0,
    max_tokens: MAX_TOKENS,
    // vLLM forwards this to the chat template. Qwen3 emits a <think> block by
    // default, which would spend the 128-token budget before the JSON. Not
    // part of the OpenAI schema; other models ignore it.
    chat_template_kwargs: { enable_thinking: false }
  }
}

// Queue the same request at /run and forget it. The point is the side
// effect: a queued job makes Runpod start a worker. The result is discarded;
// Ollama has already scored the article by the time it lands. Body is
// worker-vllm's generic proxy form, the shape bench/coldstart.py sends, so
// chat_template_kwargs reaches vLLM on this route too.
function triggerWarmup(chatBody: Record<string, unknown>): void {
  lastWarmupAt = Date.now()
  usage.warmups += 1
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WARMUP_POST_TIMEOUT_MS)
  void fetch(`${RUNPOD_API_BASE}/${RUNPOD_ENDPOINT_ID}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RUNPOD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: { route: '/v1/chat/completions', method: 'POST', body: chatBody }
    }),
    signal: controller.signal
  })
    .then(async (res) => {
      const body = (await res.json().catch(() => null)) as {
        id?: unknown
        status?: unknown
      } | null
      if (!res.ok) {
        console.warn(`[runpod] warmup /run HTTP ${res.status}`)
        return
      }
      console.log(
        `[runpod] endpoint cold; queued warmup job ${String(body?.id ?? '?')} ` +
          `(${String(body?.status ?? '?')})`
      )
    })
    .catch((err) => {
      console.warn('[runpod] warmup /run failed:', err instanceof Error ? err.message : err)
    })
    .finally(() => clearTimeout(timer))
}

export async function scoreWithRunpod(
  input: OllamaScoreInput
): Promise<OllamaScoreResult | null> {
  if (!isRunpodConfigured()) return null
  if (Date.now() < skipUntil) {
    usage.skipped += 1
    return null
  }
  const health = await checkRunpodHealth()
  if (!health.reachable) return null

  const system = buildScoringSystemPrompt(input) + RUNPOD_PROMPT_SUFFIX
  const user = `Headline: ${input.title}\nSummary: ${input.summary ?? ''}`
  const chatBody = buildChatBody(system, user)

  if (health.workers && isCold(health.workers)) {
    // One warmup per skip window. initializing > 0 means a job (ours or
    // someone else's) is already starting a worker; don't queue a second.
    if (health.workers.initializing === 0 && Date.now() - lastWarmupAt >= HEALTH_CACHE_MS) {
      triggerWarmup(chatBody)
    }
    usage.cold += 1
    markSkip()
    return null
  }
  // workers === null (unexpected /health shape) falls through: the 20 s
  // abort below is the safety net.

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
        body: JSON.stringify(chatBody),
        signal: controller.signal
      }
    )
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      usage.timeouts += 1
      console.log(
        `[runpod] scoring timed out after ${SCORE_TIMEOUT_MS} ms (queue wait or slow worker); ` +
          `skipping Runpod for ${HEALTH_CACHE_MS / 1000}s`
      )
    } else {
      usage.errors += 1
      console.warn('[runpod] scoring failed:', err instanceof Error ? err.message : err)
    }
    markSkip()
    return null
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.warn(`[runpod] HTTP ${res.status}: ${body.slice(0, 200)}`)
    usage.errors += 1
    markSkip()
    return null
  }

  // From here on the endpoint answered; a bad model output is an error for
  // the tally but does not open a skip window.
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
