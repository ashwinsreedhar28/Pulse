// General-knowledge Q&A for Hyperintelligence's "general" intent. Prefers
// Wikipedia (reliable, citable) and falls back to Ollama for things the
// encyclopedia doesn't cover. Deliberately separate from smartLookupService
// — that one is built around short highlighted terms with a 120-char cap
// and a per-term cache; questions are longer, less cacheable, and want a
// different prompt shape.

import { answerQuestion, resolveCanonicalTitle } from './ollamaService'

export interface HyperQaResult {
  answer: string
  source: 'wikipedia' | 'ollama' | 'none'
  sourceTitle: string | null
  sourceURL: string | null
  confident: boolean
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

  // Ask Ollama to extract the canonical Wikipedia title from the question
  // ("how does CHIPS Act work" → "CHIPS and Science Act"). If we have a
  // confident title, try Wikipedia first — extracts are much more reliable
  // than local-model answers.
  const canonical = await resolveCanonicalTitle(trimmed, trimmed)
  if (canonical && canonical.length > 0) {
    const wiki = await fetchWiki(canonical)
    if (wiki && wiki.extract) {
      return {
        answer: wiki.extract.trim(),
        source: 'wikipedia',
        sourceTitle: wiki.title ?? canonical,
        sourceURL: wiki.content_urls?.desktop?.page ?? null,
        confident: true
      }
    }
  }

  const llm = await answerQuestion(trimmed)
  if (llm) {
    return {
      answer: llm.answer,
      source: 'ollama',
      sourceTitle: null,
      sourceURL: null,
      confident: llm.confident
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
