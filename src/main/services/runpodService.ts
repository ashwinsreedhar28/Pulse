// Runpod Serverless backend for the urgency-scoring call. Same input/output
// contract as ollamaService.scoreWithOllama so aiClient can swap providers
// per call. Talks to the endpoint's OpenAI-compatible route (worker-vllm):
//   POST https://api.runpod.ai/v2/<ENDPOINT_ID>/openai/v1/chat/completions
// its queue routes, used only to warm a cold endpoint and watch that job:
//   POST https://api.runpod.ai/v2/<ENDPOINT_ID>/run
//   GET  https://api.runpod.ai/v2/<ENDPOINT_ID>/status/<jobId>
// and its health route:
//   GET  https://api.runpod.ai/v2/<ENDPOINT_ID>/health
// Docs: https://docs.runpod.io/serverless/endpoints/operations
//       https://docs.runpod.io/serverless/vllm/openai-compatibility
//
// Cold starts: a scale-to-zero endpoint takes 170-310 s (measured) to serve
// its first request. We never wait for that inside a scoring call.
//
// Warmth is inferred from our own traffic, not from /health. Its worker
// counts include parked workers (idle/ready with no container behind them):
// measured on 2026-09-23, /health said idle 1 / ready 1 and the next request
// took 168 s. So:
// 1. If the last successful Runpod response is older than WARM_WINDOW_MS (or
//    there has been none), the endpoint is treated as cold: the same request
//    is POSTed to /run (async, result discarded), the call returns null so
//    Ollama scores the article, and a skip window opens. One warmup at a
//    time; it polls /status until the job completes, which is the proof the
//    worker is up, then marks the endpoint warm and clears the skip window.
// 2. If warm, the call goes to the OpenAI route with a 20 s timeout. A
//    timeout means the worker went away under us: reset warmth (the next
//    call posts a warmup instead of waiting another 20 s) and skip for 60 s.

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
// A success older than this no longer proves a warm worker. Idle timeout is
// 5 s but workers park unbilled for minutes; 240 s is a heuristic, and the
// cost of guessing wrong is one 2 s warmup job, not a 20 s stall.
const WARM_WINDOW_MS = 240_000
const WARMUP_POST_TIMEOUT_MS = 10_000
const WARMUP_POLL_MS = 5_000
const WARMUP_POLL_TIMEOUT_MS = 10_000
// Longest cold start seen was 311 s; placement retries can add minutes.
const WARMUP_TRACK_MAX_MS = 10 * 60_000
const MAX_TOKENS = 128
// vLLM batches concurrent sequences on one GPU, so a warm worker takes eight
// in flight without serializing them the way Ollama's 2-wide queue must.
// Measured 2026-09-23 on an A40: 50 articles in 19.8 s at 8 in flight.
const MAX_CONCURRENT = 8

const AUTH_HEADERS = { Authorization: `Bearer ${RUNPOD_API_KEY}` }
const JSON_HEADERS = { ...AUTH_HEADERS, 'Content-Type': 'application/json' }

async function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function isRunpodConfigured(): boolean {
  return RUNPOD_API_KEY.length > 0 && RUNPOD_ENDPOINT_ID.length > 0
}

// ---- health (reachability + auth only) --------------------------------------

// Worker counts from GET /health, kept for logging and a future status
// surface. NOT used for routing: parked workers report as idle/ready. Field
// names as observed in bench runs (bench/coldstart.py records the same object
// as workers_before); verify the full list against
// docs.runpod.io/serverless/endpoints/operations. Missing fields read as 0.
export interface RunpodWorkers {
  idle: number
  ready: number
  running: number
  initializing: number
  throttled: number
  unhealthy: number
}

interface RunpodHealth {
  // The endpoint answered 2xx with this key. Says nothing about warmth.
  reachable: boolean
  workers: RunpodWorkers | null
}

let lastHealth: RunpodHealth = { reachable: false, workers: null }
let lastHealthCheckAt = 0
// Shared in-flight ping so eight concurrent scoring tasks hitting an expired
// cache produce one GET, not eight.
let healthInFlight: Promise<RunpodHealth> | null = null

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
  try {
    const res = await fetchTimeout(
      `${RUNPOD_API_BASE}/${RUNPOD_ENDPOINT_ID}/health`,
      { headers: AUTH_HEADERS },
      HEALTH_CHECK_TIMEOUT_MS
    )
    if (!res.ok) return { reachable: false, workers: null }
    const body = (await res.json().catch(() => null)) as unknown
    return { reachable: true, workers: parseWorkers(body) }
  } catch {
    return { reachable: false, workers: null }
  }
}

export async function checkRunpodHealth(force = false): Promise<RunpodHealth> {
  if (!isRunpodConfigured()) return { reachable: false, workers: null }
  if (!force && Date.now() - lastHealthCheckAt < HEALTH_CACHE_MS) return lastHealth
  if (!healthInFlight) {
    healthInFlight = pingRunpod()
      .then((h) => {
        lastHealth = h
        lastHealthCheckAt = Date.now()
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

export function getRunpodWorkers(): RunpodWorkers | null {
  return lastHealth.workers
}

// ---- warmth ------------------------------------------------------------------

// Skip window: after a cold verdict or a timeout, scoring calls return null
// without touching the network until this passes. Cleared early when a
// warmup job completes, so a worker that was merely parked (answers in
// seconds) is back in rotation without waiting the full minute.
let skipUntil = 0
let lastRunpodSuccessAt = 0
let warmupInFlight = false

function markSkip(): void {
  skipUntil = Date.now() + HEALTH_CACHE_MS
}

function isWarm(): boolean {
  return lastRunpodSuccessAt > 0 && Date.now() - lastRunpodSuccessAt < WARM_WINDOW_MS
}

function markWarm(): void {
  lastRunpodSuccessAt = Date.now()
  skipUntil = 0
}

// Exposed for diagnostics: ms since the last successful Runpod response, or
// null if there has been none this process lifetime.
export function getRunpodWarmAgeMs(): number | null {
  return lastRunpodSuccessAt > 0 ? Date.now() - lastRunpodSuccessAt : null
}

// ---- usage tally (in-memory, no gate) ---------------------------------------
//
// Same pattern as aiClient's Claude tally: counts and token sums only, no
// dollar figures (price depends on the GPU actually placed and changes; the
// bench harness applies the rate). Health pings and status polls are not
// counted.

export interface RunpodUsage {
  calls: number // scoring requests sent to the OpenAI route
  ok: number // returned a valid 1-5 score
  timeouts: number // aborted at SCORE_TIMEOUT_MS (queue wait or vanished worker)
  errors: number // non-2xx, network error, or unparseable response
  cold: number // returned null because no recent success; warmup posted or in flight
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Queue the same request at /run and watch it to completion in the
// background. The job's side effect is what matters: it makes Runpod start a
// worker (or wake a parked one). Its result is discarded; Ollama has already
// scored the article. Body is worker-vllm's generic proxy form, the shape
// bench/coldstart.py sends, so chat_template_kwargs reaches vLLM here too.
// /status statuses: IN_QUEUE and IN_PROGRESS keep polling, COMPLETED proves
// warmth, anything else is terminal (FAILED observed; verify the full set
// against the docs).
function triggerWarmup(chatBody: Record<string, unknown>): void {
  warmupInFlight = true
  usage.warmups += 1
  const startedAt = Date.now()
  void (async () => {
    try {
      const res = await fetchTimeout(
        `${RUNPOD_API_BASE}/${RUNPOD_ENDPOINT_ID}/run`,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            input: { route: '/v1/chat/completions', method: 'POST', body: chatBody }
          })
        },
        WARMUP_POST_TIMEOUT_MS
      )
      if (!res.ok) {
        console.warn(`[runpod] warmup /run HTTP ${res.status}`)
        return
      }
      const body = (await res.json().catch(() => null)) as { id?: unknown; status?: unknown } | null
      const jobId = typeof body?.id === 'string' ? body.id : null
      console.log(
        `[runpod] endpoint cold; queued warmup job ${jobId ?? '?'} (${String(body?.status ?? '?')})`
      )
      if (!jobId) return
      while (Date.now() - startedAt < WARMUP_TRACK_MAX_MS) {
        await sleep(WARMUP_POLL_MS)
        let st: Response
        try {
          st = await fetchTimeout(
            `${RUNPOD_API_BASE}/${RUNPOD_ENDPOINT_ID}/status/${jobId}`,
            { headers: AUTH_HEADERS },
            WARMUP_POLL_TIMEOUT_MS
          )
        } catch {
          continue // transient; keep polling until the deadline
        }
        if (!st.ok) continue
        const j = (await st.json().catch(() => null)) as {
          status?: unknown
          delayTime?: unknown
          executionTime?: unknown
        } | null
        const status = typeof j?.status === 'string' ? j.status : ''
        if (status === 'IN_QUEUE' || status === 'IN_PROGRESS') continue
        if (status === 'COMPLETED') {
          markWarm()
          console.log(
            `[runpod] warmup ${jobId} completed after ${Math.round((Date.now() - startedAt) / 1000)}s ` +
              `(delayTime=${String(j?.delayTime ?? '?')} ms, executionTime=${String(j?.executionTime ?? '?')} ms); ` +
              `Runpod back in rotation`
          )
          return
        }
        console.warn(`[runpod] warmup ${jobId} ended with status ${status || '?'}`)
        return
      }
      console.warn(
        `[runpod] warmup ${jobId} still not complete after ${WARMUP_TRACK_MAX_MS / 1000}s; giving up`
      )
    } catch (err) {
      console.warn('[runpod] warmup failed:', err instanceof Error ? err.message : err)
    } finally {
      warmupInFlight = false
    }
  })()
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

  if (!isWarm()) {
    if (!warmupInFlight) triggerWarmup(chatBody)
    usage.cold += 1
    markSkip()
    return null
  }

  usage.calls += 1
  let res: Response
  try {
    res = await fetchTimeout(
      `${RUNPOD_API_BASE}/${RUNPOD_ENDPOINT_ID}/openai/v1/chat/completions`,
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(chatBody) },
      SCORE_TIMEOUT_MS
    )
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      usage.timeouts += 1
      // The worker we thought was warm is not answering: forget the warmth so
      // the next attempt posts a warmup instead of waiting another 20 s.
      lastRunpodSuccessAt = 0
      console.log(
        `[runpod] scoring timed out after ${SCORE_TIMEOUT_MS} ms; treating endpoint as cold, ` +
          `skipping Runpod for ${HEALTH_CACHE_MS / 1000}s`
      )
    } else {
      usage.errors += 1
      console.warn('[runpod] scoring failed:', err instanceof Error ? err.message : err)
    }
    markSkip()
    return null
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.warn(`[runpod] HTTP ${res.status}: ${body.slice(0, 200)}`)
    usage.errors += 1
    markSkip()
    return null
  }

  // The endpoint answered, so it is warm regardless of what the model said;
  // a bad model output is an error for the tally but not a cold signal.
  markWarm()
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
