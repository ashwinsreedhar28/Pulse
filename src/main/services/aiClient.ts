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

// ---- usage telemetry (no gate) ---------------------------------------------
//
// Claude calls aren't capped — Pulse's user is willing to pay for quality.
// Per-minute Anthropic rate limits are still respected via call-site pacing
// (see companyValueChainService web-search loop), but there's no daily or
// monthly count ceiling. We keep an in-memory tally purely for the per-100-
// call log line during heavy runs; nothing reads it for routing decisions.

let claudeCallCount = 0

export function recordClaudeCall(): void {
  claudeCallCount += 1
  if (claudeCallCount % 100 === 0) {
    console.log(`[aiClient] Claude call count: ${claudeCallCount} (uncapped).`)
  }
}

export function getClaudeUsage(): { count: number } {
  return { count: claudeCallCount }
}

export function resetClaudeUsage(): { count: number } {
  claudeCallCount = 0
  return { count: 0 }
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

// Single chokepoint for "should this call go to Claude". Today this just
// reflects the user's provider preference; kept as a separate function
// because callers used to consult an additional cap gate here, and the
// indirection makes it cheap to reintroduce a gate later if a per-feature
// rate-limit ever needs one. (Don't reintroduce a *cost* gate without
// re-reading the no-claude-caps memory.)
function pickProviderForCall(): AiProviderResolved {
  return resolveProvider()
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
