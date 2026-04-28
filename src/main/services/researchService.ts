// Research-tab service. Two responsibilities:
//   1. Search Semantic Scholar for papers matching a keyword query,
//      then enrich + filter to "groundbreaking / interesting" hits.
//   2. Pass the filtered set to Claude for a multi-paper synthesis
//      brief — same shape as MorningBrief but rooted in academic
//      papers instead of finance news.
//
// Phase 3 also lives here: per-paper "cited by" + "references"
// lookups for the citation-lineage panel.
//
// We use Semantic Scholar Graph API as the anchor (no auth required;
// 100 req/sec without a key) plus arXiv URL construction for PDF
// links when ESPN-style direct openAccessPdf isn't supplied.

import { callClaude, CLAUDE_MODELS } from './claudeService'
import type {
  ResearchBriefPayload,
  ResearchBriefSection,
  ResearchPaper,
  ResearchSearchResult
} from '../../preload'

const S2_BASE = 'https://api.semanticscholar.org/graph/v1'
const FETCH_TIMEOUT_MS = 20_000
const SEARCH_LIMIT = 25
// Pull these fields on every paper request — keeps response payload
// tight while supplying everything the brief generator + UI need.
//
// Use `authors` (not `authors.name`) here. S2's citations + references
// endpoints reject nested traversal — they accept `citingPaper.authors`
// but not `citingPaper.authors.name`, returning HTTP 400 with
// "Unrecognized or unsupported fields: [authors.name]". Asking for the
// whole `authors` object works on both this and the search endpoint;
// fromS2Paper below already extracts `.name` from the response.
const PAPER_FIELDS = [
  'paperId',
  'title',
  'abstract',
  'year',
  'authors',
  'venue',
  'citationCount',
  'influentialCitationCount',
  'url',
  'openAccessPdf',
  'externalIds'
].join(',')

// User-Agent identifies Pulse to the API operators per S2's
// guidelines; mailto contact lets them reach us if our traffic
// pattern looks abusive.
const UA = 'Pulse/0.1 (research; ashwin.sreedhar2003@gmail.com)'

// Optional API key — S2 hands out free keys at
// https://www.semanticscholar.org/product/api#api-key-form which give
// a dedicated 1 RPS lane outside the anonymous pool. Without a key,
// we share an aggressively-throttled pool with everyone else and 429s
// are common during peak hours.
//
// Stored in preferences (pulse.db) instead of env vars so the packaged
// .app picks it up without terminal-side configuration. Re-read on
// every fetch so a Settings change is picked up live without restart;
// the cost is one DB read per S2 call (negligible vs the network).
import { getPreferences } from '../database/preferences'

function s2ApiKey(): string | null {
  try {
    const k = getPreferences().semanticScholarApiKey?.trim()
    return k && k.length > 0 ? k : null
  } catch {
    return null
  }
}

// Tagged error so callers can distinguish "rate limited, retry later"
// from "search returned nothing". The renderer uses this to show a
// useful message instead of the misleading "No papers found".
class S2RateLimitError extends Error {
  readonly code = 'rate_limited' as const
  constructor() {
    super('Semantic Scholar rate limited')
  }
}

// ---------- Semantic Scholar shape -----------------------------------------

interface S2Paper {
  paperId?: string
  title?: string
  abstract?: string | null
  year?: number | null
  authors?: Array<{ name?: string }>
  venue?: string | null
  citationCount?: number
  influentialCitationCount?: number
  url?: string | null
  openAccessPdf?: { url?: string } | null
  externalIds?: { ArXiv?: string; DOI?: string; CorpusId?: number; PubMed?: string }
}

function fromS2Paper(p: S2Paper): ResearchPaper | null {
  if (!p.paperId || !p.title) return null
  const arxivId = p.externalIds?.ArXiv ?? null
  const doi = p.externalIds?.DOI ?? null
  // Prefer openAccessPdf, then arXiv direct PDF, then null. Renderer
  // shows a "Read PDF" affordance only when one of these is non-null.
  const pdfUrl =
    p.openAccessPdf?.url ?? (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null)
  // Best landing URL: explicit url field, then arXiv abstract page,
  // then DOI resolver, then S2 paper page.
  const url =
    p.url ??
    (arxivId ? `https://arxiv.org/abs/${arxivId}` : null) ??
    (doi ? `https://doi.org/${doi}` : null) ??
    `https://www.semanticscholar.org/paper/${p.paperId}`
  return {
    paperId: p.paperId,
    title: p.title.trim(),
    abstract: typeof p.abstract === 'string' ? p.abstract.trim() : null,
    year: p.year ?? null,
    authors: (p.authors ?? [])
      .map((a) => a.name?.trim() ?? '')
      .filter(Boolean)
      .slice(0, 5),
    venue: p.venue?.trim() || null,
    citationCount: p.citationCount ?? 0,
    influentialCitationCount: p.influentialCitationCount ?? 0,
    url,
    pdfUrl,
    arxivId,
    doi
  }
}

// Semantic Scholar's unauthenticated tier is throttled to roughly
// 1 request/second shared across all anonymous traffic — even one
// user clicking through papers will 429 if we let request cluster.
// We serialize all S2 calls behind a single-slot queue with a 1.1s
// minimum gap, plus per-call retry-once on 429 with a 5s backoff.
// 1.1s > 1s adds enough margin that simultaneous Pulse + other-app
// traffic doesn't tip us over.
const S2_MIN_GAP_MS = 1_100
let s2NextSlot = 0
let s2Queue: Promise<unknown> = Promise.resolve()

async function s2Throttle(): Promise<void> {
  const now = Date.now()
  if (now < s2NextSlot) {
    const wait = s2NextSlot - now
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
  s2NextSlot = Date.now() + S2_MIN_GAP_MS
}

async function fetchJsonRaw<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Accept: 'application/json'
    }
    const key = s2ApiKey()
    if (key) headers['x-api-key'] = key
    const res = await fetch(url, { headers, signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

// Backoff schedule for 429s. Two retries past the initial attempt —
// first a short 5s nap to ride out a momentary spike, then a 15s nap
// for sustained anonymous-pool congestion. If both retries still 429,
// throw S2RateLimitError so the caller can show a useful message.
const S2_RETRY_DELAYS_MS = [5_000, 15_000]

async function fetchJson<T>(url: string): Promise<T> {
  // Chain into the queue so concurrent callers are serialized.
  // Each task awaits its slot, runs, and returns its result; the
  // queue advances regardless of success/failure.
  const task = s2Queue.then(async () => {
    await s2Throttle()
    let lastErr: unknown = null
    for (let attempt = 0; attempt <= S2_RETRY_DELAYS_MS.length; attempt++) {
      try {
        if (attempt === 0) {
          return await fetchJsonRaw<T>(url)
        }
        await new Promise((resolve) =>
          setTimeout(resolve, S2_RETRY_DELAYS_MS[attempt - 1])
        )
        await s2Throttle()
        return await fetchJsonRaw<T>(url)
      } catch (err) {
        lastErr = err
        const msg = err instanceof Error ? err.message : String(err)
        // Only retry on 429. 404/500/network errors propagate immediately.
        if (!msg.includes('HTTP 429')) throw err
      }
    }
    // Exhausted retries — convert to tagged error so the caller can
    // distinguish from empty-result.
    console.warn(
      '[research] Semantic Scholar still rate-limited after retries; surfacing rate_limited to caller',
      lastErr instanceof Error ? lastErr.message : ''
    )
    throw new S2RateLimitError()
  })
  // Replace the queue head so the next caller chains off this task.
  // Catch the rejection on the queue side so a single failure doesn't
  // poison every subsequent S2 call.
  s2Queue = task.catch(() => undefined)
  return task as Promise<T>
}

// ---------- Search + filter -------------------------------------------------

// Compute a "groundbreaking" score for ranking. Influence-citation
// count is the strongest signal (S2's curated metric of citations
// that shaped subsequent work), with a small recency lift so a
// 2025 paper with 5 influential cites edges out a 2010 paper with
// 7. Citation count itself is a secondary tiebreaker.
function paperScore(p: ResearchPaper): number {
  const ageYears = Math.max(0, new Date().getFullYear() - (p.year ?? 0))
  const recencyBoost = Math.max(0, 6 - ageYears) // +6 for 2025, +0 for 2019+
  return (
    p.influentialCitationCount * 5 +
    Math.log10(Math.max(1, p.citationCount)) * 2 +
    recencyBoost
  )
}

export async function searchPapers(query: string): Promise<ResearchPaper[]> {
  const q = query.trim()
  if (!q) return []
  const url =
    `${S2_BASE}/paper/search?query=${encodeURIComponent(q)}` +
    `&limit=${SEARCH_LIMIT}&fields=${encodeURIComponent(PAPER_FIELDS)}`
  let response: { data?: S2Paper[]; total?: number }
  try {
    response = await fetchJson<typeof response>(url)
  } catch (err) {
    // Rate-limit errors propagate so the caller can render a useful
    // message. Other errors (network, 5xx) are logged and swallowed
    // so the UI just shows "no results" rather than crashing.
    if (err instanceof S2RateLimitError) throw err
    console.warn(
      '[research] Semantic Scholar search failed:',
      err instanceof Error ? err.message : err
    )
    return []
  }
  const raw = (response.data ?? []).map(fromS2Paper).filter(
    (p): p is ResearchPaper => p !== null
  )
  // Re-rank by paperScore — S2's relevance ordering doesn't always
  // surface the most influential paper first for a multi-faceted
  // query, especially when the user wants groundbreaking work.
  raw.sort((a, b) => paperScore(b) - paperScore(a))
  return raw
}

// ---------- Synthesis (Claude) ---------------------------------------------

export async function synthesizeResearchBrief(
  query: string,
  papers: ResearchPaper[]
): Promise<ResearchBriefPayload | null> {
  // Filter to "groundbreaking / interesting" before sending to
  // Claude. Threshold scales with the breadth of the query — when
  // we have 25 hits we want top decile influence; with only a
  // handful we accept everything we have.
  const considered = papers.length
  const filtered = filterToGroundbreaking(papers).slice(0, 12)
  if (filtered.length === 0) return null

  const refList = filtered
    .map(
      (p, i) =>
        `[P${i + 1}] ${p.title} (${p.year ?? '—'})${
          p.venue ? ` — ${p.venue}` : ''
        }\n` +
        `       Authors: ${p.authors.slice(0, 3).join(', ')}${p.authors.length > 3 ? ' et al.' : ''}\n` +
        `       Citations: ${p.citationCount} (influential ${p.influentialCitationCount})\n` +
        `       paperId: ${p.paperId}\n` +
        `       Abstract: ${p.abstract?.slice(0, 1500) ?? '—'}`
    )
    .join('\n\n')

  const system =
    `You synthesize a multi-paper research brief from the academic ` +
    `papers below. Only the GROUNDBREAKING / INTERESTING work — the user ` +
    `wants signal not survey. Output STRICT JSON, no prose:\n\n` +
    `{\n` +
    `  "headline": "one sentence — what's the state of this field today?",\n` +
    `  "sections": [\n` +
    `    {\n` +
    `      "kind": "kebab-case section identifier (you choose)",\n` +
    `      "title": "Display title shown to the user",\n` +
    `      "bullets": [\n` +
    `        {\n` +
    `          "text": "one sentence, <180 chars, factual, no marketing",\n` +
    `          "citations": ["P1", "P3"]   ← refs from the [P#] tags above\n` +
    `        }\n` +
    `      ]\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `**Pick 3-6 section names that best characterize what's interesting ` +
    `about THIS specific query.** Don't reuse a fixed template. Different ` +
    `topics deserve different framings:\n` +
    `- An ML query might warrant: "architectures", "benchmarks", "scaling-laws", "limitations".\n` +
    `- A networking query might warrant: "protocols", "measurements", "deployment-experience".\n` +
    `- A biology query might warrant: "mechanisms", "techniques", "model-organisms", "open-questions".\n` +
    `Recognized kinds for which the renderer has color coding: "findings", ` +
    `"trends", "methods", "datasets", "open-questions", "notable". Use them ` +
    `when they genuinely fit; otherwise pick a topic-specific kebab-case kind ` +
    `— it'll render with neutral styling, that's fine.\n\n` +
    `Always include a "notable" section listing 3-5 specific papers worth ` +
    `opening (one bullet per paper) — that's the highest-leverage thing the ` +
    `user can do with this brief.\n\n` +
    `Cite every claim with the [P#] tag from above (citations array). ` +
    `If you can't cite a claim, drop it. Headline must be punchy ` +
    `(<140 chars) and SPECIFIC to this query — name a paper, technique, or ` +
    `result, not a vague "researchers are exploring" / "growing interest" / ` +
    `"emerging area" cliché. Use vocabulary from the abstracts; don't ` +
    `paraphrase into generic ML/science blog phrasing. State substance, not vibes.`

  const user =
    `Query: ${query}\n\n` +
    `Papers (${filtered.length} of ${considered} retrieved):\n\n${refList}`

  const raw = await callClaude({
    model: CLAUDE_MODELS.chainGen,
    system,
    user,
    maxTokens: 4000
  })
  if (!raw) return null

  // Tolerate fences / prose around the JSON.
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < 0) {
    console.warn('[research] synthesis: no JSON object in Claude response')
    return null
  }
  let parsed: {
    headline?: string
    sections?: Array<{
      kind?: string
      title?: string
      bullets?: Array<{ text?: string; citations?: string[] }>
    }>
  }
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as typeof parsed
  } catch (err) {
    console.warn(
      '[research] synthesis: JSON parse failed:',
      err instanceof Error ? err.message : err
    )
    return null
  }

  // Resolve [P#] refs → ResearchBriefCitation pointing at filtered[N-1].
  const sections: ResearchBriefSection[] = []
  for (const s of parsed.sections ?? []) {
    if (!s.kind || !s.title) continue
    const bullets = (s.bullets ?? [])
      .map((b) => {
        const text = (b.text ?? '').trim()
        if (!text) return null
        const citations = (b.citations ?? [])
          .map((ref) => {
            const m = /^P(\d+)$/.exec(ref.trim())
            if (!m) return null
            const idx = Number(m[1]) - 1
            const paper = filtered[idx]
            if (!paper) return null
            return {
              paperId: paper.paperId,
              label:
                (paper.authors[0] ?? 'Unknown').split(' ').slice(-1)[0] +
                ' et al. ' +
                (paper.year ?? '—'),
              url: paper.url
            }
          })
          .filter((c): c is NonNullable<typeof c> => c !== null)
        return { text, citations }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
    if (bullets.length === 0) continue
    sections.push({ kind: s.kind, title: s.title.trim(), bullets })
  }
  if (sections.length === 0) return null

  return {
    headline: (parsed.headline ?? '').trim().slice(0, 200) || `Brief on "${query}"`,
    generatedAtIso: new Date().toISOString(),
    sections,
    inputs: {
      query,
      papersConsidered: considered,
      papersFiltered: filtered.length
    }
  }
}

function filterToGroundbreaking(papers: ResearchPaper[]): ResearchPaper[] {
  // Threshold sliding scale — when search returns lots of hits we
  // demand higher influence; when there are few we relax. Works
  // because S2's relevance is decent at first-pass — the tail of
  // a 25-result query is usually low-quality anyway.
  if (papers.length <= 6) return papers
  if (papers.length <= 12) {
    return papers.filter(
      (p) => p.influentialCitationCount >= 1 || p.citationCount >= 10
    )
  }
  // Larger candidate sets: take papers with ≥3 influential cites
  // OR a strong citation count (≥30) to capture both established
  // benchmarks and recent high-velocity work.
  return papers.filter(
    (p) => p.influentialCitationCount >= 3 || p.citationCount >= 30
  )
}

// ---------- Entry point used by IPC + scheduler ----------------------------

export async function searchAndSynthesize(query: string): Promise<ResearchSearchResult> {
  let papers: ResearchPaper[]
  try {
    papers = await searchPapers(query)
  } catch (err) {
    if (err instanceof S2RateLimitError) {
      const headline = s2ApiKey()
        ? 'Semantic Scholar rate-limited — retry in ~30s'
        : 'Semantic Scholar rate-limited — add a key in Settings → AI for a dedicated lane (free)'
      return {
        brief: {
          headline,
          generatedAtIso: new Date().toISOString(),
          sections: [],
          inputs: { query, papersConsidered: 0, papersFiltered: 0 }
        },
        papers: []
      }
    }
    throw err
  }
  if (papers.length === 0) {
    return {
      brief: {
        headline: `No papers found for "${query}"`,
        generatedAtIso: new Date().toISOString(),
        sections: [],
        inputs: { query, papersConsidered: 0, papersFiltered: 0 }
      },
      papers: []
    }
  }
  const brief = await synthesizeResearchBrief(query, papers)
  return {
    brief:
      brief ??
      {
        headline: `Found ${papers.length} papers — synthesis unavailable`,
        generatedAtIso: new Date().toISOString(),
        sections: [],
        inputs: { query, papersConsidered: papers.length, papersFiltered: 0 }
      },
    papers
  }
}

// ---------- Citation lineage (Phase 3) -------------------------------------

// Top-N papers citing a given paper. S2's citations endpoint defaults
// to chronological; we re-sort by influence so the most impactful
// downstream work surfaces first.
export async function listCitingPapers(
  paperId: string,
  limit = 10
): Promise<ResearchPaper[]> {
  const url =
    `${S2_BASE}/paper/${encodeURIComponent(paperId)}/citations` +
    `?limit=${limit * 3}&fields=${encodeURIComponent('citingPaper.' + PAPER_FIELDS.split(',').join(',citingPaper.'))}`
  try {
    const res = await fetchJson<{ data?: Array<{ citingPaper?: S2Paper }> }>(url)
    const list = (res.data ?? [])
      .map((entry) => (entry.citingPaper ? fromS2Paper(entry.citingPaper) : null))
      .filter((p): p is ResearchPaper => p !== null)
    list.sort((a, b) => paperScore(b) - paperScore(a))
    return list.slice(0, limit)
  } catch (err) {
    console.warn(
      '[research] citations endpoint failed:',
      err instanceof Error ? err.message : err
    )
    return []
  }
}

// Top-N papers that this paper references. Unlike citations, the
// reference list is fixed — we sort by influence so the most-cited
// foundational papers in this paper's bibliography come first.
export async function listReferencedPapers(
  paperId: string,
  limit = 10
): Promise<ResearchPaper[]> {
  const url =
    `${S2_BASE}/paper/${encodeURIComponent(paperId)}/references` +
    `?limit=${limit * 3}&fields=${encodeURIComponent('citedPaper.' + PAPER_FIELDS.split(',').join(',citedPaper.'))}`
  try {
    const res = await fetchJson<{ data?: Array<{ citedPaper?: S2Paper }> }>(url)
    const list = (res.data ?? [])
      .map((entry) => (entry.citedPaper ? fromS2Paper(entry.citedPaper) : null))
      .filter((p): p is ResearchPaper => p !== null)
    list.sort((a, b) => paperScore(b) - paperScore(a))
    return list.slice(0, limit)
  } catch (err) {
    console.warn(
      '[research] references endpoint failed:',
      err instanceof Error ? err.message : err
    )
    return []
  }
}

export async function getPaper(paperId: string): Promise<ResearchPaper | null> {
  const url = `${S2_BASE}/paper/${encodeURIComponent(paperId)}?fields=${encodeURIComponent(PAPER_FIELDS)}`
  try {
    const p = await fetchJson<S2Paper>(url)
    return fromS2Paper(p)
  } catch (err) {
    console.warn(
      '[research] getPaper failed:',
      err instanceof Error ? err.message : err
    )
    return null
  }
}
