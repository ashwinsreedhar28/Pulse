// Thin router between Ollama (local) and Claude (cloud) for the two AI
// calls that benefit most from model quality: value-chain generation and
// sector classification. The rest of the Ollama calls (summaries, edge
// classification, hyper-intelligence, etc.) stay Ollama-only for now —
// they're cheaper to get wrong and the quality gap is smaller.
//
// Provider selection per Pulse preferences:
// - 'auto'  : use Claude when configured, else Ollama. Default.
// - 'claude': force Claude. Falls back to Ollama if the key is missing or
//             Claude errors out — we'd rather generate with lower quality
//             than fail the user's click.
// - 'ollama': force local. Useful for privacy-conscious users or offline.

import {
  getPreferences,
  getClaudeUsageState,
  setClaudeUsageState
} from '../database/preferences'
import {
  generateCompanyValueChain as claudeChain,
  classifyTickerSectors as claudeClassify,
  answerQuestion as claudeAnswer,
  isClaudeConfigured
} from './claudeService'
import {
  generateCompanyValueChain as ollamaChain,
  classifyTickerSectors as ollamaClassify,
  answerQuestion as ollamaAnswer,
  type GeneratedValueChain,
  type TickerSectorClassification
} from './ollamaService'

export type AiProviderResolved = 'claude' | 'ollama'

// ---- daily call cap (safety net) -------------------------------------------
//
// Hard cap on Claude calls per UTC day. Protects against runaway loops
// (e.g., a chat that retries on every error, a regenerate-all that fires
// twice). Counts EVERY routed Claude call across all paths — chain
// generation, classifier, answerQuestion — into one bucket. When
// exceeded, routed calls fall back to Ollama with a warning.
//
// Persisted to the preferences KV store so the cap survives restarts — a
// crash loop that restarts the app cannot bypass the ceiling by zeroing
// the counter. Rolls over at UTC midnight.
//
// CURRENT STATE: CAP_GATE_DISABLED=true. The user is collecting usage
// data to set the right monthly budget. The DAILY_CLAUDE_CAP value
// below is preserved for when the gate goes back on. While disabled,
// recordClaudeCall does NOT persist increments (so flipping the gate
// back on later doesn't immediately trip on a poisoned counter), and
// the per-100-call telemetry log line stays on for visibility.
//
// Reference budget math (when re-enabling): at the typical mix of
// Sonnet (~$0.04/call) and Haiku (~$0.006/call), 50 calls/day averages
// $0.30-0.45/day = $9-13/month. Leaves room for the daily Morning
// Brief (1 Sonnet) + 3-4 chain regens (each = 1 Sonnet chain-gen +
// ~4 Haiku web searches) + 3-4 research searches.
const DAILY_CLAUDE_CAP = 50
const CAP_GATE_DISABLED = true

// Lazy-loaded from DB on first access. Module-level `getDb()` cannot run at
// import time because the database connection isn't open yet when services
// are imported during main-process boot.
let claudeCounter: { date: string; count: number } | null = null

function utcDateKey(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function ensureCounterLoaded(): { date: string; count: number } {
  if (claudeCounter !== null) return claudeCounter
  const today = utcDateKey()
  try {
    const persisted = getClaudeUsageState()
    if (persisted && persisted.date === today) {
      claudeCounter = { date: persisted.date, count: persisted.count }
    } else {
      // Either no persisted state yet, or the persisted date is stale —
      // start a fresh bucket for today. We don't bother to persist the
      // zero; `recordClaudeCall()` will write on the first real increment.
      claudeCounter = { date: today, count: 0 }
    }
  } catch (err) {
    console.warn('[aiClient] Failed to load Claude usage counter from DB:', err)
    claudeCounter = { date: today, count: 0 }
  }
  return claudeCounter
}

function rollCounterIfNewDay(): void {
  const counter = ensureCounterLoaded()
  const today = utcDateKey()
  if (counter.date !== today) {
    claudeCounter = { date: today, count: 0 }
    try {
      setClaudeUsageState(claudeCounter)
    } catch (err) {
      console.warn('[aiClient] Failed to persist Claude usage rollover:', err)
    }
  }
}

export function canCallClaude(): boolean {
  rollCounterIfNewDay()
  if (CAP_GATE_DISABLED) return true
  return ensureCounterLoaded().count < DAILY_CLAUDE_CAP
}

export function recordClaudeCall(): void {
  rollCounterIfNewDay()
  const counter = ensureCounterLoaded()
  counter.count += 1
  // Only persist when the cap gate is actually enforced. Otherwise a
  // one-shot bypass run (regenerate-all, ~250 calls) poisons the
  // persisted counter and blocks every Claude call for the rest of the
  // day — exactly the failure mode the cap is supposed to *prevent*.
  // In-memory increment still happens so the per-100-call telemetry
  // log line works for visibility during heavy runs.
  if (!CAP_GATE_DISABLED) {
    try {
      setClaudeUsageState(counter)
    } catch (err) {
      console.warn('[aiClient] Failed to persist Claude usage increment:', err)
    }
  }
  // Soft warnings only fire when the cap is actually enforced. With
  // CAP_GATE_DISABLED=true the messages would be misleading ("falling
  // back to Ollama" while in reality calls keep going to Claude), so
  // we suppress them entirely in that mode and let the per-100-call
  // telemetry below do the talking.
  if (!CAP_GATE_DISABLED) {
    // Soft warning at 50% of cap so the user has a chance to throttle
    // their own usage before the hard ceiling kicks in.
    if (
      Number.isFinite(DAILY_CLAUDE_CAP) &&
      counter.count === Math.floor(DAILY_CLAUDE_CAP / 2)
    ) {
      console.warn(
        `[aiClient] Claude usage at ${counter.count}/${DAILY_CLAUDE_CAP} for ${counter.date} — about halfway to today's safety cap.`
      )
    }
    if (
      Number.isFinite(DAILY_CLAUDE_CAP) &&
      counter.count === DAILY_CLAUDE_CAP
    ) {
      console.warn(
        `[aiClient] Claude daily cap (${DAILY_CLAUDE_CAP}) reached for ${counter.date}. Subsequent routed calls fall back to Ollama until UTC midnight.`
      )
    }
  }
  // Periodic telemetry every 100 calls (only fires when the cap is
  // disabled for testing). Helps spot runaway spend during heavy
  // sessions like regenerate-all.
  if (CAP_GATE_DISABLED && counter.count % 100 === 0) {
    console.log(
      `[aiClient] Claude usage at ${counter.count} call(s) today (${counter.date}) — cap gate DISABLED for testing.`
    )
  }
}

// Manually clear today's counter. Use after a one-shot bypass run that
// inflated the count (e.g. regenerate-all on the watchlist) — without
// this, every subsequent Claude call within the same UTC day gets
// blocked by the cap because count > cap. Exposed via IPC so the user
// can call it from DevTools when needed.
export function resetClaudeUsage(): { date: string; count: number; cap: number } {
  const today = utcDateKey()
  claudeCounter = { date: today, count: 0 }
  try {
    setClaudeUsageState(claudeCounter)
  } catch (err) {
    console.warn('[aiClient] Failed to persist Claude usage reset:', err)
  }
  console.log(`[aiClient] Claude usage counter manually reset for ${today}.`)
  return { date: today, count: 0, cap: DAILY_CLAUDE_CAP }
}

export function getClaudeUsage(): { date: string; count: number; cap: number } {
  rollCounterIfNewDay()
  const counter = ensureCounterLoaded()
  return { date: counter.date, count: counter.count, cap: DAILY_CLAUDE_CAP }
}

export function resolveProvider(): AiProviderResolved {
  const prefs = getPreferences()
  if (prefs.aiProvider === 'ollama') return 'ollama'
  if (prefs.aiProvider === 'claude') {
    return isClaudeConfigured() ? 'claude' : 'ollama'
  }
  // 'auto': Claude when configured, else local.
  return isClaudeConfigured() ? 'claude' : 'ollama'
}

// Single chokepoint for "should this call go to Claude". Combines the
// provider preference with the daily safety cap. Routed callers consult
// this instead of resolveProvider() directly so cap exhaustion silently
// degrades to Ollama rather than producing weird "no Claude available"
// states downstream.
function pickProviderForCall(): AiProviderResolved {
  const provider = resolveProvider()
  if (provider !== 'claude') return 'ollama'
  if (!canCallClaude()) return 'ollama'
  return 'claude'
}

export async function generateCompanyValueChain(
  input: Parameters<typeof ollamaChain>[0],
  opts: {
    // Force a specific provider for this call. 'claude' bypasses the
    // local daily-cap counter AND skips the Ollama fallback when Claude
    // returns null — the ticker is recorded as failed instead of falling
    // through to a mixed-quality result. Used by the one-shot
    // "regenerate all with Claude" flow when the user wants maximum
    // citation quality and is willing to consume their Anthropic quota.
    // 'ollama' forces Ollama regardless of preference. Undefined uses
    // the normal preference-based picker.
    forceProvider?: 'claude' | 'ollama'
  } = {}
): Promise<{ result: GeneratedValueChain | null; provider: AiProviderResolved }> {
  if (opts.forceProvider === 'claude') {
    // Bypass recordClaudeCall so the local cap counter doesn't bottleneck
    // the run — Anthropic's API will enforce real per-account rate limits.
    const viaClaude = await claudeChain(input)
    if (viaClaude) return { result: viaClaude, provider: 'claude' }
    console.warn(
      `[aiClient] forceProvider=claude returned null for ${input.symbol}; not falling back`
    )
    return { result: null, provider: 'claude' }
  }
  if (opts.forceProvider === 'ollama') {
    const viaOllama = await ollamaChain(input)
    return { result: viaOllama, provider: 'ollama' }
  }
  const primary = pickProviderForCall()
  if (primary === 'claude') {
    recordClaudeCall()
    const viaClaude = await claudeChain(input)
    if (viaClaude) return { result: viaClaude, provider: 'claude' }
    // Fall through to Ollama so the user still gets a chain rather than
    // an error banner when Claude is down / rate-limited / key invalid.
    console.warn(
      `[aiClient] Claude chain generation returned null for ${input.symbol}, falling back to Ollama`
    )
    const viaOllama = await ollamaChain(input)
    return { result: viaOllama, provider: 'ollama' }
  }
  const viaOllama = await ollamaChain(input)
  return { result: viaOllama, provider: 'ollama' }
}

export async function classifyTickerSectors(
  input: Parameters<typeof ollamaClassify>[0]
): Promise<{ result: TickerSectorClassification | null; provider: AiProviderResolved }> {
  const primary = pickProviderForCall()
  if (primary === 'claude') {
    recordClaudeCall()
    const viaClaude = await claudeClassify(input)
    if (viaClaude) return { result: viaClaude, provider: 'claude' }
    console.warn(
      `[aiClient] Claude classify returned null for ${input.symbol}, falling back to Ollama`
    )
    const viaOllama = await ollamaClassify(input)
    return { result: viaOllama, provider: 'ollama' }
  }
  const viaOllama = await ollamaClassify(input)
  return { result: viaOllama, provider: 'ollama' }
}

// Hyperintelligence Q&A — small structured calls (~500-15K input,
// ~50-2K output). Routes to Haiku 4.5 via claudeService.answerQuestion
// when configured, falls back to Ollama otherwise. Same provider/cap
// pattern as the chain routes.
export async function answerQuestion(
  question: string,
  context?: string
): Promise<{
  result: { answer: string; confident: boolean } | null
  provider: AiProviderResolved
}> {
  const primary = pickProviderForCall()
  if (primary === 'claude') {
    recordClaudeCall()
    const viaClaude = await claudeAnswer(question, context)
    if (viaClaude) return { result: viaClaude, provider: 'claude' }
    console.warn('[aiClient] Claude answerQuestion returned null, falling back to Ollama')
    const viaOllama = await ollamaAnswer(question, context)
    return { result: viaOllama, provider: 'ollama' }
  }
  const viaOllama = await ollamaAnswer(question, context)
  return { result: viaOllama, provider: 'ollama' }
}
