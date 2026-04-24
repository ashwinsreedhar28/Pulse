// General-knowledge Q&A for Hyperintelligence's "general" intent. Prefers
// Wikipedia (reliable, citable) and falls back to Ollama for things the
// encyclopedia doesn't cover. Deliberately separate from smartLookupService
// — that one is built around short highlighted terms with a 120-char cap
// and a per-term cache; questions are longer, less cacheable, and want a
// different prompt shape.

import { answerQuestion as routedAnswer } from './aiClient'
import { isClaudeConfigured } from './claudeService'
import { resolveCanonicalTitle } from './ollamaService'

export interface HyperQaResult {
  answer: string
  // 'ollama' is kept for backwards compat with renderer matchers but now
  // covers either local Ollama or cloud Claude — whichever the router
  // picked. The actual provider is reflected in `provider` for telemetry
  // / UI hints without breaking existing code paths.
  source: 'wikipedia' | 'ollama' | 'none'
  sourceTitle: string | null
  sourceURL: string | null
  confident: boolean
  provider?: 'claude' | 'ollama'
}

const FETCH_TIMEOUT_MS = 8_000
const WIKI_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary'

interface WikiSummary {
  title?: string
  extract?: string
  content_urls?: { desktop?: { page?: string } }
}

async function fetchWiki(title: string): Promise<WikiSummary | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${WIKI_BASE}/${encodeURIComponent(title)}`, {
      headers: {
        'User-Agent': 'Pulse/0.1 (macOS reader hyper-qa)',
        Accept: 'application/json'
      },
      signal: controller.signal
    })
    if (!res.ok) return null
    const data = (await res.json()) as WikiSummary
    if (!data.extract || data.extract.trim().length === 0) return null
    return data
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function answerHyperQuestion(question: string): Promise<HyperQaResult> {
  const trimmed = question.trim()
  if (trimmed.length === 0) {
    return {
      answer: '',
      source: 'none',
      sourceTitle: null,
      sourceURL: null,
      confident: false
    }
  }

  const aiCapable = isClaudeConfigured()

  // When Claude is configured, prefer the AI for the first pass — it
  // handles synthesis questions ("what's the relationship between X and Y")
  // far better than Wikipedia's article-summary endpoint, which would
  // just return the lead paragraph of whichever entity the title-resolver
  // picked. Wikipedia stays as a fallback when the AI returns nothing or
  // signals low confidence on a single-entity factual lookup it didn't
  // know. With local Ollama only (Mistral 7B), Wikipedia stays first
  // because the model's factual recall is weaker than the encyclopedia.
  if (aiCapable) {
    const { result: llm, provider } = await routedAnswer(trimmed)
    if (llm && llm.confident && llm.answer.length > 0) {
      return {
        answer: llm.answer,
        source: 'ollama',
        sourceTitle: null,
        sourceURL: null,
        confident: true,
        provider
      }
    }
    // AI not confident — try Wikipedia as a fallback for factual lookups
    // the model wouldn't know (specific stats, dates, lesser-known entities).
    const wiki = await tryWikipedia(trimmed)
    if (wiki) return wiki
    // Last resort: return whatever the AI gave us, even if not confident.
    if (llm && llm.answer.length > 0) {
      return {
        answer: llm.answer,
        source: 'ollama',
        sourceTitle: null,
        sourceURL: null,
        confident: false,
        provider
      }
    }
    return {
      answer: '',
      source: 'none',
      sourceTitle: null,
      sourceURL: null,
      confident: false
    }
  }

  // Ollama-only path: Wikipedia first (more reliable than Mistral 7B for
  // factual questions), AI fallback for things the encyclopedia doesn't
  // cover.
  const wiki = await tryWikipedia(trimmed)
  if (wiki) return wiki

  const { result: llm, provider } = await routedAnswer(trimmed)
  if (llm) {
    return {
      answer: llm.answer,
      source: 'ollama',
      sourceTitle: null,
      sourceURL: null,
      confident: llm.confident,
      provider
    }
  }

  return {
    answer: '',
    source: 'none',
    sourceTitle: null,
    sourceURL: null,
    confident: false
  }
}

async function tryWikipedia(question: string): Promise<HyperQaResult | null> {
  const canonical = await resolveCanonicalTitle(question, question)
  if (!canonical || canonical.length === 0) return null
  const wiki = await fetchWiki(canonical)
  if (!wiki || !wiki.extract) return null
  return {
    answer: wiki.extract.trim(),
    source: 'wikipedia',
    sourceTitle: wiki.title ?? canonical,
    sourceURL: wiki.content_urls?.desktop?.page ?? null,
    confident: true
  }
}
