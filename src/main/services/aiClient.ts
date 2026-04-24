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
  isClaudeConfigured
} from './claudeService'
import {
  generateCompanyValueChain as ollamaChain,
  classifyTickerSectors as ollamaClassify,
  type GeneratedValueChain,
  type TickerSectorClassification
} from './ollamaService'

export type AiProviderResolved = 'claude' | 'ollama'

export function resolveProvider(): AiProviderResolved {
  const prefs = getPreferences()
  if (prefs.aiProvider === 'ollama') return 'ollama'
  if (prefs.aiProvider === 'claude') {
    return isClaudeConfigured() ? 'claude' : 'ollama'
  }
  // 'auto': Claude when configured, else local.
  return isClaudeConfigured() ? 'claude' : 'ollama'
}

export async function generateCompanyValueChain(
  input: Parameters<typeof ollamaChain>[0]
): Promise<{ result: GeneratedValueChain | null; provider: AiProviderResolved }> {
  const primary = resolveProvider()
  if (primary === 'claude') {
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
  const primary = resolveProvider()
  if (primary === 'claude') {
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
