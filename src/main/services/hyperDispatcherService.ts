// Hyperintelligence dispatcher — routes a free-text user message to one of
// four handlers (feed finder, article search, general Q&A, settings
// inspector) and returns a discriminated payload the renderer can switch on.
// The classifier lives in ollamaService; this file is the glue that picks a
// handler, including a cheap keyword preflight so obvious messages skip the
// ~500ms-1s LLM round trip.

import { classifyHyperIntent, type HyperIntent } from './ollamaService'
import { findFeedCandidates, type FeedFinderResult } from './feedFinderService'
import { searchArticlesFts } from '../database/articles'
import { answerHyperQuestion, type HyperQaResult } from './hyperQaService'
import {
  inspectSettings,
  matchSettingsByKeywords,
  type InspectSettingsResult
} from './settingsInspectorService'
import {
  proposeSettingsChange,
  type SettingsProposal,
  type SettingsRejection
} from './settingsWriteService'
import type { Article } from '../database/articles'

// Keyword heuristics that skip the Ollama classifier for obvious phrasing.
// The regex set is intentionally narrow — anything ambiguous falls through
// to the LLM classifier, which is more robust. Keeping these anchored at the
// start of the message avoids false positives on substrings ("find some
// articles about finding a job" should still classify as article search).
const HEURISTIC_PATTERNS: Array<{ pattern: RegExp; intent: HyperIntent }> = [
  { pattern: /^\s*(find|show|get|search)\s+(me\s+)?(feeds?|rss|publishers?)\b/i, intent: 'find_feeds' },
  { pattern: /^\s*(suggest|recommend)\s+.*\b(feed|publisher|rss)\b/i, intent: 'find_feeds' },
  { pattern: /^\s*(find|show|search)\s+(me\s+)?(articles?|stor(y|ies)|posts?|coverage)\b/i, intent: 'search_articles' },
  { pattern: /^\s*(what\s+(did|have)\s+i\s+read)\b/i, intent: 'search_articles' },
  { pattern: /^\s*(what|who|when|where|why|how)\s+(is|are|was|were|does|do|did)\b/i, intent: 'general_qa' },
  { pattern: /^\s*(explain|define)\b/i, intent: 'general_qa' },
  // Keyword-based settings hits. "color" is intentionally included so the
  // classic "change the color of my UI" phrasing routes to the write path.
  {
    pattern:
      /\b(preference|setting|option|theme|color|colour|density|quiet hours?|poll interval|digest interval|launch at login|team alerts?|calendar window|tts engine)\b/i,
    intent: 'adjust_settings'
  },
  { pattern: /^\s*(how\s+do\s+i\s+(change|set|adjust|turn|enable|disable))/i, intent: 'adjust_settings' },
  // Write-verb shapes: "turn on X", "enable X", "change X to Y". These are
  // the same shapes settingsWriteService parses — keeping them in sync
  // avoids a classifier round trip for obvious writes.
  { pattern: /^\s*(turn\s+(on|off)|enable|disable|activate|deactivate|toggle)\s+\S+/i, intent: 'adjust_settings' },
  {
    pattern:
      /^\s*(set|change|update|make|switch|adjust|put)\s+(my\s+|the\s+)?.+?\s+(to|into|=|:|as|be)\s+/i,
    intent: 'adjust_settings'
  }
]

function heuristicIntent(message: string): HyperIntent | null {
  for (const { pattern, intent } of HEURISTIC_PATTERNS) {
    if (pattern.test(message)) return intent
  }
  // Explicit settings keyword hits trump other heuristics. If any registry
  // keyword is present and the question looks like a preference query ("my
  // theme", "current density"), classify as adjust_settings directly.
  if (/(my|current|change|set|what\s+is)\b/i.test(message)) {
    if (matchSettingsByKeywords(message).length > 0) return 'adjust_settings'
  }
  return null
}

export type HyperResponse =
  | { kind: 'feeds'; reply: string; payload: FeedFinderResult }
  | { kind: 'articles'; reply: string; payload: { articles: Article[]; query: string } }
  | { kind: 'qa'; reply: string; payload: HyperQaResult }
  | { kind: 'settings'; reply: string; payload: InspectSettingsResult }
  | { kind: 'settings-proposal'; reply: string; payload: SettingsProposal }
  | { kind: 'settings-rejection'; reply: string; payload: SettingsRejection }
  | { kind: 'offline'; reply: string }

export async function dispatchHyperMessage(
  userMessage: string
): Promise<HyperResponse> {
  const trimmed = userMessage.trim()
  if (trimmed.length === 0) {
    return { kind: 'offline', reply: 'Say something and I\'ll route it.' }
  }

  const heuristic = heuristicIntent(trimmed)
  const intent: HyperIntent | null = heuristic ?? (await classifyHyperIntent(trimmed))

  // When the classifier and heuristics are both silent, preserve the legacy
  // feed-finder behavior rather than falling off a cliff. This also covers
  // the Ollama-offline case — users can still get feed suggestions where
  // hardcoded data is enough.
  const resolved: HyperIntent = intent ?? 'find_feeds'

  switch (resolved) {
    case 'find_feeds': {
      const payload = await findFeedCandidates(trimmed)
      const reply =
        payload.status === 'ollama-offline'
          ? 'Local AI is offline — start Ollama to enable feed suggestions.'
          : payload.status === 'no-candidates'
            ? payload.reply ||
              'No matching feeds came to mind. Try a broader topic or a publisher name.'
            : payload.reply ||
              `Here are ${payload.candidates.length} candidate${payload.candidates.length === 1 ? '' : 's'}. Verifying…`
      return { kind: 'feeds', reply, payload }
    }
    case 'search_articles': {
      const articles = searchArticlesFts(trimmed, 20)
      const reply =
        articles.length === 0
          ? `No articles in your feed match "${trimmed}". Try different keywords, or ask me to find new feeds on this topic.`
          : `Found ${articles.length} article${articles.length === 1 ? '' : 's'} in your feed.`
      return {
        kind: 'articles',
        reply,
        payload: { articles, query: trimmed }
      }
    }
    case 'general_qa': {
      const qa = await answerHyperQuestion(trimmed)
      if (qa.source === 'none') {
        return {
          kind: 'qa',
          reply:
            'I couldn\'t answer that from Wikipedia or the local model. Try rephrasing, or ask me to find feeds about this topic instead.',
          payload: qa
        }
      }
      return { kind: 'qa', reply: '', payload: qa }
    }
    case 'adjust_settings': {
      // Try the write path first. If the message has the shape of a write
      // ("change X to Y", "turn on X", "enable X") and a writable target is
      // found, we return a proposal (APPLY button in the UI) or a rejection
      // (with allowed values). Otherwise fall through to the read inspector
      // which deep-links to Settings.
      const write = await proposeSettingsChange(trimmed)
      if (write.kind === 'proposal') {
        return {
          kind: 'settings-proposal',
          reply: write.proposal.reply,
          payload: write.proposal
        }
      }
      if (write.kind === 'rejection') {
        return {
          kind: 'settings-rejection',
          reply: write.rejection.reply,
          payload: write.rejection
        }
      }
      const result = await inspectSettings(trimmed)
      return { kind: 'settings', reply: result.reply, payload: result }
    }
  }
}
