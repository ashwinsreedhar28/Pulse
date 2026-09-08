// "What is happening right now" across a spread of research fields.
//
// Research used to open onto an empty search box. That is a bad front door
// twice over: it assumes the user already knows what they are looking for,
// and the paper graph only grows from papers they have engaged with, so an
// empty start meant the graph stayed empty indefinitely. This gives the
// module something to open onto, and every card is a valid graph seed.
//
// Results are cached per field and refreshed in the background rather than
// fetched on open. Semantic Scholar throttles this account intermittently no
// matter how we pace it (measured: 2s and 3s gaps both around 83% success,
// 5s worse), so ten live searches on mount would be slow and would routinely
// render with holes.

import type { ResearchPaper } from '../../preload'
import { getDb } from '../database/connection'
import { getPreferences } from '../database/preferences'
import { s2Schedule } from './s2RateLimit'
import { searchArxiv } from './corpusService'

const S2_BASE = 'https://api.semanticscholar.org/graph/v1'
const UA = 'Pulse/0.1 (research-discover; ashwin.sreedhar2003@gmail.com)'
const FETCH_TIMEOUT_MS = 20_000

// A day is the right granularity — these are "recent notable work in a
// field", which does not meaningfully change hour to hour.
// Trending changes slowly; newest is the whole point of being fresh, so it
// expires far faster.
const TTL_TRENDING_MS = 24 * 60 * 60 * 1000
const TTL_NEWEST_MS = 3 * 60 * 60 * 1000
const PER_FIELD = 8

export type DiscoverMode = 'trending' | 'newest'

const FIELDS_PARAM = [
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

export interface DiscoverField {
  id: string
  label: string
  query: string
  /** S2 fieldsOfStudy filter. Loose on their side, so it only biases. */
  studyField?: string
  // arXiv category for the 'newest' mode. Without one, a date-sorted search
  // returns anything recent that mentions the terms — AI/ML was surfacing
  // astrophysics papers that happened to use a neural network.
  //
  // Left undefined where arXiv genuinely lacks coverage. arXiv is a
  // physics/CS/maths preprint server; clinical oncology and immunology
  // largely publish to bioRxiv/medRxiv or straight to journals, so those
  // fields fall back to an uncategorised search rather than pretending to a
  // precision they cannot have.
  arxivCategory?: string
}

// Deliberately broad and cross-disciplinary rather than a list of the user's
// existing interests. The point of a landing page is to show things you would
// not have searched for; narrowing it to what the library already contains
// would defeat that.
export const DISCOVER_FIELDS: DiscoverField[] = [
  {
    id: 'ai-ml',
    arxivCategory: 'cs.LG',
    label: 'AI & Machine Learning',
    query: 'large language models deep learning',
    studyField: 'Computer Science'
  },
  {
    id: 'oncology',
    label: 'Cancer & Oncology',
    query: 'cancer immunotherapy tumor treatment',
    studyField: 'Medicine'
  },
  {
    id: 'neuro',
    arxivCategory: 'q-bio.NC',
    label: 'Neuroscience',
    query: 'brain neural circuits cognition',
    studyField: 'Biology'
  },
  {
    id: 'genomics',
    arxivCategory: 'q-bio.GN',
    label: 'Genomics & Gene Editing',
    query: 'CRISPR gene editing genomics',
    studyField: 'Biology'
  },
  {
    id: 'climate',
    arxivCategory: 'physics.ao-ph',
    label: 'Climate & Energy',
    query: 'climate change renewable energy decarbonization',
    studyField: 'Environmental Science'
  },
  {
    id: 'quantum',
    arxivCategory: 'quant-ph',
    label: 'Quantum Computing',
    query: 'quantum computing error correction qubits',
    studyField: 'Physics'
  },
  {
    id: 'immunology',
    label: 'Immunology & Vaccines',
    query: 'vaccine immune response antibody',
    studyField: 'Medicine'
  },
  {
    id: 'materials',
    arxivCategory: 'cond-mat.mtrl-sci',
    label: 'Materials Science',
    query: 'materials discovery batteries semiconductors',
    studyField: 'Materials Science'
  },
  {
    id: 'robotics',
    arxivCategory: 'cs.RO',
    label: 'Robotics',
    query: 'robot manipulation embodied agents control',
    studyField: 'Computer Science'
  },
  {
    id: 'longevity',
    label: 'Aging & Longevity',
    query: 'aging longevity senescence lifespan',
    studyField: 'Biology'
  }
]

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
  externalIds?: { ArXiv?: string; DOI?: string }
  publicationDate?: string | null
}

function s2ApiKey(): string | null {
  try {
    const k = getPreferences().semanticScholarApiKey?.trim()
    return k && k.length > 0 ? k : null
  } catch {
    return null
  }
}

function toPaper(p: S2Paper): ResearchPaper | null {
  if (!p.paperId || !p.title) return null
  const arxivId = p.externalIds?.ArXiv ?? null
  return {
    paperId: p.paperId,
    title: p.title,
    abstract: p.abstract ?? null,
    year: p.year ?? null,
    authors: (p.authors ?? []).map((a) => a.name ?? '').filter(Boolean).slice(0, 5),
    venue: p.venue ?? null,
    citationCount: p.citationCount ?? 0,
    influentialCitationCount: p.influentialCitationCount ?? 0,
    publicationDate: p.publicationDate ?? null,
    url: p.url ?? (arxivId ? `https://arxiv.org/abs/${arxivId}` : null),
    // S2 sometimes returns openAccessPdf as {url: ''}, which is not a PDF.
    pdfUrl: p.openAccessPdf?.url?.trim() || (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null),
    arxivId,
    doi: p.externalIds?.DOI ?? null
  }
}

// Recent AND notable. Raw citation count would surface the same decade-old
// classics forever, so this restricts to the last two years and ranks within
// that window — a 2025 paper with 200 citations is a much stronger signal
// than a 2015 paper with 2,000.
function rank(papers: ResearchPaper[]): ResearchPaper[] {
  const now = new Date().getFullYear()
  return [...papers]
    .map((p) => {
      const age = Math.max(0.5, now - (p.year ?? now) + 0.5)
      return { p, score: (p.citationCount + p.influentialCitationCount * 4) / age }
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)
}

// S2 429s intermittently regardless of pacing, so a single attempt per field
// leaves most of the landing page empty. Two retries with growing backoff
// recovers nearly all of them.
const RETRY_DELAYS_MS = [4_000, 12_000]

async function fetchOnce(field: DiscoverField): Promise<ResearchPaper[]> {
  const sinceYear = new Date().getFullYear() - 2
  const params = new URLSearchParams({
    query: field.query,
    limit: '40',
    year: `${sinceYear}-`,
    fields: FIELDS_PARAM
  })
  if (field.studyField) params.set('fieldsOfStudy', field.studyField)

  const json = await s2Schedule(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const headers: Record<string, string> = { 'User-Agent': UA, Accept: 'application/json' }
      const key = s2ApiKey()
      if (key) headers['x-api-key'] = key
      const res = await fetch(`${S2_BASE}/paper/search?${params.toString()}`, {
        headers,
        signal: controller.signal
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as { data?: S2Paper[] }
    } finally {
      clearTimeout(timer)
    }
  })

  const papers = (json.data ?? []).map(toPaper).filter((p): p is ResearchPaper => p !== null)
  return rank(papers).slice(0, PER_FIELD)
}

async function fetchField(field: DiscoverField): Promise<ResearchPaper[]> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
      }
      return await fetchOnce(field)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Only 429 is worth retrying — a malformed query or a 404 will not fix
      // itself by waiting.
      if (!msg.includes('429') || attempt === RETRY_DELAYS_MS.length) {
        console.warn(`[discover] ${field.id} failed:`, msg)
        return []
      }
    }
  }
  return []
}

interface Row {
  fieldId: string
  mode: string
  label: string
  papersJson: string
  fetchedAt: number
}

export interface DiscoverSection {
  fieldId: string
  label: string
  mode: DiscoverMode
  papers: ResearchPaper[]
  fetchedAt: number | null
}

// Newest work, from arXiv rather than S2.
//
// This is the mode that makes the tool actually current. Journals publish
// roughly a year after acceptance and S2 indexes from publication, so its
// freshest hits for a live topic run months behind — measured while building
// this, S2's newest were June/July while arXiv had papers from four days
// prior. arXiv posts preprints immediately.
//
// No citation ranking here, deliberately: a paper from last week has none,
// so any impact-weighted sort would bury exactly what this mode exists to
// surface. Order is submission date, newest first.
async function fetchNewest(field: DiscoverField): Promise<ResearchPaper[]> {
  try {
    const papers = await searchArxiv(
      field.query,
      PER_FIELD * 2,
      field.arxivCategory,
      'submittedDate'
    )
    return papers.slice(0, PER_FIELD)
  } catch (err) {
    console.warn(
      `[discover] ${field.id} newest failed:`,
      err instanceof Error ? err.message : err
    )
    return []
  }
}

// Reads cache only — never fetches. The landing page must paint immediately,
// so refreshing is the scheduler's job, not the render path's.
export function getDiscoverSections(mode: DiscoverMode = 'trending'): DiscoverSection[] {
  let rows: Row[] = []
  try {
    rows = getDb()
      .prepare<[string], Row>(`SELECT * FROM research_discover WHERE mode = ?`)
      .all(mode)
  } catch {
    rows = []
  }
  const byId = new Map(rows.map((r) => [r.fieldId, r]))
  // Iterate the field list, not the table, so a newly added field shows as an
  // empty section awaiting refresh rather than silently disappearing.
  return DISCOVER_FIELDS.map((f) => {
    const row = byId.get(f.id)
    let papers: ResearchPaper[] = []
    if (row) {
      try {
        papers = JSON.parse(row.papersJson) as ResearchPaper[]
      } catch {
        papers = []
      }
    }
    return {
      fieldId: f.id,
      label: f.label,
      mode,
      papers,
      fetchedAt: row?.fetchedAt ?? null
    }
  })
}

// Refreshes stale fields for one mode. Returns how many were refetched.
export async function refreshDiscover(
  opts: { force?: boolean; mode?: DiscoverMode } = {}
): Promise<number> {
  const mode: DiscoverMode = opts.mode ?? 'trending'
  const ttl = mode === 'newest' ? TTL_NEWEST_MS : TTL_TRENDING_MS
  const db = getDb()
  const now = Date.now()
  const existing = new Map(getDiscoverSections(mode).map((s) => [s.fieldId, s.fetchedAt]))
  const stmt = db.prepare(
    `INSERT INTO research_discover (fieldId, mode, label, papersJson, fetchedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(fieldId, mode) DO UPDATE SET
       label = excluded.label,
       papersJson = excluded.papersJson,
       fetchedAt = excluded.fetchedAt`
  )

  let refreshed = 0
  for (const field of DISCOVER_FIELDS) {
    const fetchedAt = existing.get(field.id) ?? null
    if (!opts.force && fetchedAt !== null && now - fetchedAt < ttl) continue

    const papers = mode === 'newest' ? await fetchNewest(field) : await fetchField(field)

    // Never cache an empty result. Two separate reasons:
    //   - with a prior row, a throttled fetch should leave yesterday's papers
    //     on screen rather than blanking the section;
    //   - with no prior row, writing an empty array with a fresh timestamp
    //     would mark the field "fresh" and suppress retries for a full day,
    //     which is how the first run left 8 of 10 sections permanently blank.
    if (papers.length === 0) continue

    stmt.run(field.id, mode, field.label, JSON.stringify(papers), Date.now())
    refreshed++
    // Space the fields out. Ten back-to-back searches is exactly the burst
    // shape that draws 429s. arXiv is far more tolerant, so it waits less.
    await new Promise((r) => setTimeout(r, mode === 'newest' ? 400 : 1500))
  }
  return refreshed
}

export function discoverIsEmpty(mode: DiscoverMode = 'trending'): boolean {
  return getDiscoverSections(mode).every((s) => s.papers.length === 0)
}
