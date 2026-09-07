// Additional literature sources beyond Semantic Scholar.
//
// S2 was the only research backend, which is a real ceiling: its coverage of
// very recent preprints lags, its rate limit is ~1 RPS anonymous, and a
// single source means a single point of failure for the whole research tab.
// Notably there was no arXiv client at all — "arXiv" appeared in the codebase
// only as URL string-building for links and one RSS feed.
//
//   OpenAlex — ~250M works, no key, generous limits, and returns `concepts`
//     (a subject taxonomy) that S2 does not. Those concepts feed the
//     research/finance bridge with something better than a bare abstract.
//   arXiv    — the authoritative source for preprints, and the fastest place
//     to see work that has not been indexed anywhere else yet.
//
// Both are normalized into the existing ResearchPaper shape so the rest of
// the research UI needs no knowledge of where a paper came from.

import type { ResearchPaper } from '../../preload'

const OPENALEX_BASE = 'https://api.openalex.org/works'
const ARXIV_BASE = 'https://export.arxiv.org/api/query'
const FETCH_TIMEOUT_MS = 15_000

// OpenAlex asks API users to identify themselves via mailto for the faster
// "polite pool"; arXiv asks for a descriptive User-Agent. Both are courtesy
// requirements from the operators, not authentication.
const CONTACT = 'ashwin.sreedhar2003@gmail.com'
const UA = `Pulse/0.1 (research; ${CONTACT})`

async function fetchText(url: string, accept: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: accept },
      signal: controller.signal,
      // arXiv 301-redirects plain http to https.
      redirect: 'follow'
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (err) {
    console.warn('[corpus] fetch failed:', err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ---- OpenAlex --------------------------------------------------------------

interface OpenAlexWork {
  id?: string
  doi?: string | null
  display_name?: string | null
  publication_year?: number | null
  cited_by_count?: number
  abstract_inverted_index?: Record<string, number[]> | null
  authorships?: Array<{ author?: { display_name?: string } }>
  primary_location?: { source?: { display_name?: string } | null } | null
  best_oa_location?: { pdf_url?: string | null } | null
  concepts?: Array<{ display_name?: string; score?: number }>
  ids?: { pmid?: string; mag?: string }
}

// OpenAlex ships abstracts as an inverted index (token -> positions) rather
// than plain text, for licensing reasons. Reconstruct by placing each token
// at each of its positions.
function abstractFromInverted(idx: Record<string, number[]> | null | undefined): string | null {
  if (!idx) return null
  const slots: string[] = []
  for (const [word, positions] of Object.entries(idx)) {
    for (const p of positions) slots[p] = word
  }
  const text = slots.join(' ').replace(/\s+/g, ' ').trim()
  return text.length > 0 ? text : null
}

function openAlexToPaper(w: OpenAlexWork): ResearchPaper | null {
  const title = w.display_name?.trim()
  if (!title) return null
  // OpenAlex ids look like https://openalex.org/W2741809807 — keep the bare
  // key, prefixed so it can never collide with an S2 hash.
  const rawId = (w.id ?? '').split('/').pop() ?? ''
  if (!rawId) return null
  const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//, '') : null
  return {
    paperId: `openalex:${rawId}`,
    title,
    abstract: abstractFromInverted(w.abstract_inverted_index),
    year: w.publication_year ?? null,
    authors: (w.authorships ?? [])
      .map((a) => a.author?.display_name ?? '')
      .filter(Boolean)
      .slice(0, 5),
    venue: w.primary_location?.source?.display_name ?? null,
    citationCount: w.cited_by_count ?? 0,
    // OpenAlex has no influential-citation metric. Reporting 0 is honest;
    // inventing a proxy would silently distort the ranking that
    // paperScore() applies across sources.
    influentialCitationCount: 0,
    url: doi ? `https://doi.org/${doi}` : `https://openalex.org/${rawId}`,
    pdfUrl: w.best_oa_location?.pdf_url ?? null,
    arxivId: null,
    doi
  }
}

export interface OpenAlexResult {
  papers: ResearchPaper[]
  /** Subject concepts aggregated across hits — useful topical context. */
  concepts: Array<{ name: string; score: number }>
}

export async function searchOpenAlex(query: string, limit = 20): Promise<OpenAlexResult> {
  const q = query.trim()
  if (!q) return { papers: [], concepts: [] }
  const url =
    `${OPENALEX_BASE}?search=${encodeURIComponent(q)}` +
    `&per-page=${Math.min(limit, 50)}&mailto=${encodeURIComponent(CONTACT)}`
  const body = await fetchText(url, 'application/json')
  if (!body) return { papers: [], concepts: [] }

  let json: { results?: OpenAlexWork[] }
  try {
    json = JSON.parse(body)
  } catch {
    return { papers: [], concepts: [] }
  }

  const papers: ResearchPaper[] = []
  const conceptScores = new Map<string, number>()
  for (const w of json.results ?? []) {
    const p = openAlexToPaper(w)
    if (p) papers.push(p)
    for (const c of w.concepts ?? []) {
      const name = c.display_name?.trim()
      if (!name || typeof c.score !== 'number') continue
      conceptScores.set(name, (conceptScores.get(name) ?? 0) + c.score)
    }
  }
  const concepts = [...conceptScores.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
  return { papers, concepts }
}

// ---- arXiv -----------------------------------------------------------------

// The Atom feed is small and regular, so a couple of targeted regexes beat
// pulling in an XML parser. Entries are split first so a greedy match can
// never bleed across records.
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function pick(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
  return m ? unescapeXml(m[1].replace(/\s+/g, ' ').trim()) : null
}

export async function searchArxiv(query: string, limit = 20): Promise<ResearchPaper[]> {
  const q = query.trim()
  if (!q) return []
  const url =
    `${ARXIV_BASE}?search_query=${encodeURIComponent(`all:${q}`)}` +
    `&start=0&max_results=${Math.min(limit, 50)}&sortBy=relevance`
  const xml = await fetchText(url, 'application/atom+xml')
  if (!xml) return []

  const out: ResearchPaper[] = []
  for (const raw of xml.split('<entry>').slice(1)) {
    const block = raw.split('</entry>')[0]
    const title = pick(block, 'title')
    const idUrl = pick(block, 'id')
    if (!title || !idUrl) continue
    // http://arxiv.org/abs/2401.12345v2 -> 2401.12345
    const arxivId = (idUrl.split('/abs/')[1] ?? '').replace(/v\d+$/, '')
    if (!arxivId) continue
    const published = pick(block, 'published')
    const authors = [...block.matchAll(/<name>([\s\S]*?)<\/name>/g)]
      .map((m) => unescapeXml(m[1].trim()))
      .slice(0, 5)
    out.push({
      paperId: `arxiv:${arxivId}`,
      title,
      abstract: pick(block, 'summary'),
      year: published ? Number(published.slice(0, 4)) || null : null,
      authors,
      venue: 'arXiv',
      // arXiv publishes no citation counts. Zero is honest; the ranking
      // treats these as recency-driven rather than impact-driven.
      citationCount: 0,
      influentialCitationCount: 0,
      url: `https://arxiv.org/abs/${arxivId}`,
      pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
      arxivId,
      doi: null
    })
  }
  return out
}

// ---- merge -----------------------------------------------------------------

// Normalized title, for cross-source dedup. The same paper routinely appears
// as an arXiv preprint, an OpenAlex record and an S2 record with different
// ids, so identity has to come from the title.
function titleKey(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Merge results from several sources, preferring earlier lists on conflict.
// Callers pass S2 first: it has the richest metadata (influential-citation
// counts, resolved PDFs), so it should win ties.
export function mergePaperSources(...lists: ResearchPaper[][]): ResearchPaper[] {
  const byTitle = new Map<string, ResearchPaper>()
  const byId = new Set<string>()
  for (const list of lists) {
    for (const p of list) {
      if (byId.has(p.paperId)) continue
      const key = titleKey(p.title)
      const existing = byTitle.get(key)
      if (existing) {
        // Same paper from a later source: keep the incumbent but fill gaps,
        // so an arXiv hit can supply a PDF the S2 record lacked.
        if (!existing.pdfUrl && p.pdfUrl) existing.pdfUrl = p.pdfUrl
        if (!existing.arxivId && p.arxivId) existing.arxivId = p.arxivId
        if (!existing.doi && p.doi) existing.doi = p.doi
        if (!existing.abstract && p.abstract) existing.abstract = p.abstract
        continue
      }
      byTitle.set(key, p)
      byId.add(p.paperId)
    }
  }
  return [...byTitle.values()]
}
