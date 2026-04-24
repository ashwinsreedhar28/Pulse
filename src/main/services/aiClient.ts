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

import { getPreferences } from '../database/preferences'
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
// exceeded, routed calls fall back to Ollama with a warning. Counter is
// in-memory; resets on app restart and at UTC day rollover. Persisting
// across restarts would be safer in theory but adds DB write churn for
// limited additional protection — a runaway across multiple restarts is
// already a bigger system problem the user would notice.
//
// Default ceiling: 100 calls/day. At Haiku 4.5 pricing (~$0.015/call) that
// caps the worst case around $1.50/day = $45/month. At Sonnet 4.6
// (~$0.045/call) it's $4.50/day = $135/month. Both exceed the $10/month
// preference but are sized as a hard ceiling, not a target. Typical
// usage runs well below.

const DAILY_CLAUDE_CAP = 100

let claudeCounter = { date: utcDateKey(), count: 0 }

function utcDateKey(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function rollCounterIfNewDay(): void {
  const today = utcDateKey()
  if (claudeCounter.date !== today) {
    claudeCounter = { date: today, count: 0 }
  }
}

export function canCallClaude(): boolean {
  rollCounterIfNewDay()
  return claudeCounter.count < DAILY_CLAUDE_CAP
}

export function recordClaudeCall(): void {
  rollCounterIfNewDay()
  claudeCounter.count += 1
  // Soft warning at 50% of cap so the user has a chance to throttle their
  // own usage before the hard ceiling kicks in.
  if (claudeCounter.count === Math.floor(DAILY_CLAUDE_CAP / 2)) {
    console.warn(
      `[aiClient] Claude usage at ${claudeCounter.count}/${DAILY_CLAUDE_CAP} for ${claudeCounter.date} — about halfway to today's safety cap.`
    )
  }
  if (claudeCounter.count === DAILY_CLAUDE_CAP) {
    console.warn(
      `[aiClient] Claude daily cap (${DAILY_CLAUDE_CAP}) reached for ${claudeCounter.date}. Subsequent routed calls fall back to Ollama until UTC midnight.`
    )
  }
}

export function getClaudeUsage(): { date: string; count: number; cap: number } {
  rollCounterIfNewDay()
  return { date: claudeCounter.date, count: claudeCounter.count, cap: DAILY_CLAUDE_CAP }
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
  input: Parameters<typeof ollamaChain>[0]
): Promise<{ result: GeneratedValueChain | null; provider: AiProviderResolved }> {
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
