// Paper Value Chain — research analog to companyValueChainService. Generates
// a fixed-stage citation lineage for a focus paper using S2 + (Phase 3B)
// the focal paper's own intro/related-work text read by Haiku.
//
// Phase 3A built the S2-only spine: refs + citations bucketed into fixed
// stages, top-N pruned, edges anchored at the focal paper.
//
// Phase 3B (this file's `enrichWithFocalPaperReading` path) adds the
// "read the focal paper's intro" step — analog of pulling a 10-K Item 1
// in the stock chain. The intro is the author's required formal self-
// positioning, structured and quotable. We:
//   - extract intro + related-work text via paperPdfExtractor
//   - send extracted text to Haiku with a structured-output prompt
//   - resolve each citedPaperHint against the focal's S2 reference list
//     using fuzzy matching (token-set ≥0.7 + first-author surname, OR
//     exact year + title prefix); drop hints that don't resolve
//   - upgrade existing s2-intent edges to paper-pdf provenance, override
//     relationship to 'contrasts' / 'refutes' when Haiku found explicit
//     negative-citation wording (S2's classifier is known to be weak on
//     negative citations)
//   - surface NEW edges only when the resolved paperId is in the S2
//     reference list AND no existing edge already covers it
//
// Hallucination defense: a Haiku-named paper that doesn't fuzzy-match
// any S2 reference is dropped silently and logged. Such papers are
// NEVER added as kind:'unverified' — S2 is the truth anchor.
//
// Stages are FIXED. Phase 3B does not change the taxonomy; new
// enrichment-surfaced nodes land in upstream-ancestors (the catch-all
// upstream bucket) when no stronger signal places them.
//
// We DO NOT share code with researchService.ts yet. A shared rate-limiter
// + S2 fetcher is the natural Phase 4 refactor once both feature shapes
// have stabilized — premature sharing would couple two surfaces that may
// still need to evolve independently.

import {
  setPaperValueChain,
  getPaperValueChain as readPaperValueChain,
  type PaperValueChain,
  type PaperValueChainEdge,
  type PaperValueChainEdgeCitation,
  type PaperValueChainNode,
  type PaperValueChainRelationship,
  type PaperValueChainStage
} from '../database/paperValueChains'
import { getPreferences } from '../database/preferences'
import { extractFocalPaperIntro } from './paperPdfExtractor'
import {
  getPaperChainEnrichment,
  upsertPaperChainEnrichment,
  deletePaperChainEnrichment
} from '../database/paperChainEnrichments'
import { callClaude, CLAUDE_MODELS } from './claudeService'
import { recordClaudeCall } from './aiClient'

const S2_BASE = 'https://api.semanticscholar.org/graph/v1'
const FETCH_TIMEOUT_MS = 20_000
// Per-stage cap. Spec: "max 8 nodes per stage, ranked by isInfluential +
// citationCount." Eight is enough to communicate stage shape without
// turning the diagram into a wall of text.
const TOP_N_PER_STAGE = 8
// Bulk endpoint page size. S2 returns the per-citation `intents` and
// `isInfluential` flags inline with the cited/citing paper fields, so we
// can fetch and bucket in one round-trip per direction. 100 covers the
// reference list of most papers (median ~30-50 refs).
const REFS_LIMIT = 100
const CITATIONS_LIMIT = 100

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
  'externalIds',
  // fieldsOfStudy gates the "different subfield" check in Applications +
  // "same subfield" filter on Direct ancestors. Adding it here costs
  // nothing on the wire (S2 already populates it for most papers) but is
  // intentionally NOT in researchService's PAPER_FIELDS — that surface
  // doesn't need it and we don't share state.
  'fieldsOfStudy'
].join(',')

const UA = 'Pulse/0.1 (paper-value-chain; ashwin.sreedhar2003@gmail.com)'

// Same throttle shape as researchService — anonymous tier shares ~1 RPS
// across all callers, so we serialize behind a single-slot queue with a
// 1.1s minimum gap. Independent counter intentionally so neither feature
// can starve the other; both are bound by S2's per-IP limit anyway.
const S2_MIN_GAP_MS = 1_100
let s2NextSlot = 0
let s2Queue: Promise<unknown> = Promise.resolve()

function s2ApiKey(): string | null {
  try {
    const k = getPreferences().semanticScholarApiKey?.trim()
    return k && k.length > 0 ? k : null
  } catch {
    return null
  }
}

async function s2Throttle(): Promise<void> {
  const now = Date.now()
  if (now < s2NextSlot) {
    await new Promise((resolve) => setTimeout(resolve, s2NextSlot - now))
  }
  s2NextSlot = Date.now() + S2_MIN_GAP_MS
}

class S2RateLimitError extends Error {
  readonly code = 'rate_limited' as const
  constructor() {
    super('Semantic Scholar rate limited')
  }
}

const S2_RETRY_DELAYS_MS = [5_000, 15_000]

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

interface FetchOutcome<T> {
  data: T | null
  callsMade: number
}

async function fetchJson<T>(url: string): Promise<FetchOutcome<T>> {
  const task = s2Queue.then(async (): Promise<FetchOutcome<T>> => {
    let calls = 0
    let lastErr: unknown = null
    for (let attempt = 0; attempt <= S2_RETRY_DELAYS_MS.length; attempt++) {
      try {
        if (attempt === 0) {
          await s2Throttle()
          calls += 1
          return { data: await fetchJsonRaw<T>(url), callsMade: calls }
        }
        await new Promise((resolve) =>
          setTimeout(resolve, S2_RETRY_DELAYS_MS[attempt - 1])
        )
        await s2Throttle()
        calls += 1
        return { data: await fetchJsonRaw<T>(url), callsMade: calls }
      } catch (err) {
        lastErr = err
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('HTTP 429')) throw err
      }
    }
    console.warn(
      '[paper-chain] S2 still rate-limited after retries:',
      lastErr instanceof Error ? lastErr.message : ''
    )
    throw new S2RateLimitError()
  })
  s2Queue = task.catch(() => undefined)
  return task as Promise<FetchOutcome<T>>
}

// ---------- S2 wire shape --------------------------------------------------

interface S2Paper {
  paperId?: string
  title?: string
  abstract?: string | null
  year?: number | null
  authors?: Array<{ authorId?: string | null; name?: string }>
  venue?: string | null
  citationCount?: number
  influentialCitationCount?: number
  url?: string | null
  openAccessPdf?: { url?: string } | null
  externalIds?: { ArXiv?: string; DOI?: string }
  fieldsOfStudy?: string[] | null
}

interface S2RefRow {
  isInfluential?: boolean
  intents?: string[]
  citedPaper?: S2Paper
}

interface S2CitationRow {
  isInfluential?: boolean
  intents?: string[]
  citingPaper?: S2Paper
}

// ---------- Stage taxonomy (FIXED) -----------------------------------------

export const STAGE_IDS = {
  upstreamFoundational: 'upstream-foundational',
  upstreamMethodological: 'upstream-methodological',
  upstreamAncestors: 'upstream-ancestors',
  focal: 'focal',
  downstreamExtensions: 'downstream-extensions',
  downstreamApplications: 'downstream-applications',
  downstreamContrasts: 'downstream-contrasts',
  downstreamReplications: 'downstream-replications'
} as const

export const FIXED_STAGES: PaperValueChainStage[] = [
  {
    id: STAGE_IDS.upstreamFoundational,
    label: 'Foundational',
    order: 0,
    band: 'upstream'
  },
  {
    id: STAGE_IDS.upstreamMethodological,
    label: 'Methodological',
    order: 1,
    band: 'upstream'
  },
  {
    id: STAGE_IDS.upstreamAncestors,
    label: 'Direct ancestors',
    order: 2,
    band: 'upstream'
  },
  { id: STAGE_IDS.focal, label: 'Focal', order: 3, band: 'focal' },
  {
    id: STAGE_IDS.downstreamExtensions,
    label: 'Direct extensions',
    order: 4,
    band: 'downstream'
  },
  {
    id: STAGE_IDS.downstreamApplications,
    label: 'Applications',
    order: 5,
    band: 'downstream'
  },
  {
    id: STAGE_IDS.downstreamContrasts,
    label: 'Contrasts / Competitors',
    order: 6,
    band: 'downstream'
  },
  {
    id: STAGE_IDS.downstreamReplications,
    label: 'Replications / Refutations',
    order: 7,
    band: 'downstream'
  }
]

// Foundational papers must be at least this old to count as "classical."
// Spec: "≥10y old or in classic-paper list."
const FOUNDATIONAL_MIN_AGE_YEARS = 10
// Classic-paper override — extremely high influential-citation count
// counts as classical regardless of age. Threshold picked empirically:
// 500 influential cites is rarefied (Vaswani 2017 has ~6000, the LSTM
// paper ~5000, ResNet ~10000). Keeps it from misfiring on year-old
// papers with low cite counts.
const CLASSIC_PAPER_INFLUENTIAL_THRESHOLD = 500
// Direct-ancestor recency window — refs within N years of the focal
// paper that share at least one fieldsOfStudy entry.
const ANCESTOR_RECENCY_YEARS = 5
// Same-author cluster window for the Focal stage. Spec: "the paper +
// same-author cluster within ±1y if relevant."
const FOCAL_AUTHOR_WINDOW_YEARS = 1
// Phrases that flag a citation as a contrast / competitor result. Lower-
// case, matched against the citing paper's abstract. Conservative list
// to avoid false positives on benign uses ("unlike water, oil…" etc.);
// these phrases are domain-agnostic enough to be reliable signals when
// found in an abstract.
const CONTRAST_PHRASES = [
  'in contrast',
  'unlike ',
  'we differ',
  'differs from',
  'fails to',
  'outperform',
  'we challenge'
]

// ---------- Pure helpers (exported for unit tests) -------------------------

// S2 intent → normalized relationship. Six relationships in the Phase 3A
// taxonomy: builds-on, uses-method, extends, contrasts, replicates, refutes.
// Replicates / refutes never come from S2 alone (they're populated in 3D
// from a different signal); keeping them in the type union avoids a shape
// change later.
//
// Direction matters — same intent maps differently depending on whether
// the focal paper is the citer or the cited.
//   - Focal cites X (X is upstream): focal "builds-on" X for background,
//     focal "uses-method" of X for methodology, focal "extends" X for
//     extension/result.
//   - X cites focal (X is downstream): X "extends" focal for extension,
//     X "uses-method" of focal for methodology, X "contrasts" focal for
//     comparison/result-with-contrast-phrase.
//
// Returns null when the intent is unrecognized — caller decides whether
// to drop the edge or fall back to 'extends'.
export function intentToRelationship(
  intent: string,
  direction: 'focal-cites-other' | 'other-cites-focal',
  options: { contrastPhraseFound?: boolean } = {}
): PaperValueChainRelationship | null {
  const i = intent.toLowerCase()
  if (direction === 'focal-cites-other') {
    if (i === 'background') return 'builds-on'
    if (i === 'methodology') return 'uses-method'
    if (i === 'extension') return 'extends'
    if (i === 'result') return 'extends'
    if (i === 'comparison') return 'contrasts'
    return null
  }
  // direction === 'other-cites-focal'
  if (i === 'extension') return 'extends'
  if (i === 'methodology') return 'uses-method'
  if (i === 'comparison') return 'contrasts'
  if (i === 'result') return options.contrastPhraseFound ? 'contrasts' : 'extends'
  if (i === 'background') return 'builds-on'
  return null
}

// Score used to rank candidates within a stage before top-N pruning.
// isInfluential weighted heavily because it's S2's curated "this citation
// shaped the citing work" flag — a stronger signal than raw count. log10
// on citation count keeps a 50K-cite landmark from dominating but still
// surfaces above a 50-cite paper.
export function rankScore(input: {
  isInfluential: boolean
  citationCount: number
  influentialCitationCount: number
}): number {
  const inflBoost = input.isInfluential ? 5 : 0
  return (
    inflBoost +
    input.influentialCitationCount * 2 +
    Math.log10(Math.max(1, input.citationCount))
  )
}

// Top-N prune. Returns at most `limit` candidates ranked by rankScore
// descending. Stable: ties resolve by paperId so two runs of the same
// inputs produce identical output (matters for cache-equality tests +
// the comparability acceptance criterion).
export function topNByRank<T extends { paperId: string }>(
  candidates: Array<{
    item: T
    score: number
  }>,
  limit: number
): T[] {
  const sorted = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.item.paperId.localeCompare(b.item.paperId)
  })
  return sorted.slice(0, limit).map((x) => x.item)
}

// Subfield overlap test. Empty arrays are treated as "no info" — we
// don't conclude they're the same OR different subfield, so the caller
// chooses the stricter side of the question.
export function shareAnyFieldOfStudy(
  a: string[] | null | undefined,
  b: string[] | null | undefined
): boolean {
  if (!a?.length || !b?.length) return false
  const setA = new Set(a.map((x) => x.toLowerCase()))
  return b.some((x) => setA.has(x.toLowerCase()))
}

// Author cluster check — does any author overlap (by id when available,
// else by normalized name)? Used to populate the focal stage's same-
// author cluster.
export function shareAnyAuthor(
  a: S2Paper['authors'] | null | undefined,
  b: S2Paper['authors'] | null | undefined
): boolean {
  if (!a?.length || !b?.length) return false
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const author of a) {
    if (author.authorId) ids.add(author.authorId)
    if (author.name) names.add(author.name.trim().toLowerCase())
  }
  for (const author of b) {
    if (author.authorId && ids.has(author.authorId)) return true
    if (author.name && names.has(author.name.trim().toLowerCase())) return true
  }
  return false
}

function authorYearLabel(p: S2Paper): string {
  const first = p.authors?.[0]?.name?.trim() ?? ''
  const surname = first.split(/\s+/).slice(-1)[0] ?? 'Unknown'
  const year = p.year ?? '—'
  return `${surname} ${year}`
}

function nodeFromS2(p: S2Paper, stageId: string): PaperValueChainNode | null {
  if (!p.paperId || !p.title) return null
  const arxivId = p.externalIds?.ArXiv ?? null
  const pdfUrl =
    p.openAccessPdf?.url ?? (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null)
  const url =
    p.url ??
    (arxivId ? `https://arxiv.org/abs/${arxivId}` : null) ??
    `https://www.semanticscholar.org/paper/${p.paperId}`
  return {
    paperId: p.paperId,
    stage: stageId,
    title: p.title.trim(),
    authorYearLabel: authorYearLabel(p),
    abstract: typeof p.abstract === 'string' ? p.abstract.trim() : null,
    year: p.year ?? null,
    citationCount: p.citationCount ?? 0,
    influentialCitationCount: p.influentialCitationCount ?? 0,
    url,
    pdfUrl,
    kind: 'paper'
  }
}

// ---------- S2 fetchers (one per direction) --------------------------------

// Focal paper detail. Returns { data, callsMade } so the caller can sum
// the call budget without polling a global counter.
async function fetchFocalPaper(
  paperId: string
): Promise<FetchOutcome<S2Paper>> {
  const url = `${S2_BASE}/paper/${encodeURIComponent(paperId)}?fields=${encodeURIComponent(PAPER_FIELDS)}`
  try {
    return await fetchJson<S2Paper>(url)
  } catch (err) {
    if (err instanceof S2RateLimitError) throw err
    console.warn(
      '[paper-chain] focal lookup failed:',
      err instanceof Error ? err.message : err
    )
    return { data: null, callsMade: 1 }
  }
}

async function fetchReferencesBulk(
  paperId: string
): Promise<FetchOutcome<S2RefRow[]>> {
  const fields = [
    'intents',
    'isInfluential',
    ...PAPER_FIELDS.split(',').map((f) => `citedPaper.${f}`)
  ].join(',')
  const url =
    `${S2_BASE}/paper/${encodeURIComponent(paperId)}/references` +
    `?limit=${REFS_LIMIT}&fields=${encodeURIComponent(fields)}`
  try {
    const result = await fetchJson<{ data?: S2RefRow[] }>(url)
    return { data: result.data?.data ?? [], callsMade: result.callsMade }
  } catch (err) {
    if (err instanceof S2RateLimitError) throw err
    console.warn(
      '[paper-chain] references fetch failed:',
      err instanceof Error ? err.message : err
    )
    return { data: null, callsMade: 1 }
  }
}

async function fetchCitationsBulk(
  paperId: string
): Promise<FetchOutcome<S2CitationRow[]>> {
  const fields = [
    'intents',
    'isInfluential',
    ...PAPER_FIELDS.split(',').map((f) => `citingPaper.${f}`)
  ].join(',')
  const url =
    `${S2_BASE}/paper/${encodeURIComponent(paperId)}/citations` +
    `?limit=${CITATIONS_LIMIT}&fields=${encodeURIComponent(fields)}`
  try {
    const result = await fetchJson<{ data?: S2CitationRow[] }>(url)
    return { data: result.data?.data ?? [], callsMade: result.callsMade }
  } catch (err) {
    if (err instanceof S2RateLimitError) throw err
    console.warn(
      '[paper-chain] citations fetch failed:',
      err instanceof Error ? err.message : err
    )
    return { data: null, callsMade: 1 }
  }
}

// Lightweight reference-list lookup — paperId-only. Used by the Phase
// 3C bilateral check to test whether a counterpart paper's reference
// list contains the focal (the mutual-cite rule). Cheaper than
// fetchReferencesBulk because we don't pull intents / paper metadata
// — just the ID set.
async function fetchCounterpartReferenceIds(
  paperId: string
): Promise<FetchOutcome<Set<string>>> {
  const url =
    `${S2_BASE}/paper/${encodeURIComponent(paperId)}/references` +
    `?limit=200&fields=${encodeURIComponent('citedPaper.paperId')}`
  try {
    const result = await fetchJson<{
      data?: Array<{ citedPaper?: { paperId?: string } }>
    }>(url)
    const ids = new Set<string>()
    for (const row of result.data?.data ?? []) {
      const id = row.citedPaper?.paperId
      if (id) ids.add(id)
    }
    return { data: ids, callsMade: result.callsMade }
  } catch (err) {
    if (err instanceof S2RateLimitError) throw err
    console.warn(
      '[paper-chain] counterpart references fetch failed:',
      err instanceof Error ? err.message : err
    )
    return { data: null, callsMade: 1 }
  }
}

// ---------- Bucketing logic ------------------------------------------------

// Each bucket is keyed by stageId. Candidate lookups walk these in order
// of stage priority — once a paper lands in a higher-priority bucket it
// doesn't double-place in a lower-priority one.

interface Candidate {
  paper: S2Paper
  isInfluential: boolean
  intents: string[]
  // Pre-computed contrast-phrase hit on the abstract, used by
  // the downstream-contrasts bucket. False on upstream papers
  // (where the focal isn't the citer-of-other) — caller fills.
  contrastPhraseFound: boolean
}

function bucketUpstream(
  refs: S2RefRow[],
  focal: S2Paper
): Map<string, Candidate[]> {
  const buckets = new Map<string, Candidate[]>([
    [STAGE_IDS.upstreamFoundational, []],
    [STAGE_IDS.upstreamMethodological, []],
    [STAGE_IDS.upstreamAncestors, []]
  ])
  const placed = new Set<string>()
  const focalYear = focal.year ?? new Date().getFullYear()
  const thisYear = new Date().getFullYear()

  for (const row of refs) {
    const paper = row.citedPaper
    if (!paper?.paperId) continue
    if (placed.has(paper.paperId)) continue
    const isInfluential = row.isInfluential === true
    const intents = (row.intents ?? []).map((x) => x.toLowerCase())
    const cand: Candidate = {
      paper,
      isInfluential,
      intents,
      contrastPhraseFound: false
    }

    // Foundational: isInfluential + intent=background AND (≥10y old OR
    // classic). Fall through to other buckets if checks fail.
    if (isInfluential && intents.includes('background')) {
      const age = paper.year != null ? thisYear - paper.year : Infinity
      const isClassic =
        (paper.influentialCitationCount ?? 0) >= CLASSIC_PAPER_INFLUENTIAL_THRESHOLD
      if (age >= FOUNDATIONAL_MIN_AGE_YEARS || isClassic) {
        buckets.get(STAGE_IDS.upstreamFoundational)!.push(cand)
        placed.add(paper.paperId)
        continue
      }
    }

    // Methodological: isInfluential + intent=methodology.
    if (isInfluential && intents.includes('methodology')) {
      buckets.get(STAGE_IDS.upstreamMethodological)!.push(cand)
      placed.add(paper.paperId)
      continue
    }

    // Direct ancestors: intent=extension OR result, recent, same subfield.
    if (intents.includes('extension') || intents.includes('result')) {
      const recent =
        paper.year != null && focalYear - paper.year <= ANCESTOR_RECENCY_YEARS
      const sameSubfield = shareAnyFieldOfStudy(
        focal.fieldsOfStudy,
        paper.fieldsOfStudy
      )
      if (recent && sameSubfield) {
        buckets.get(STAGE_IDS.upstreamAncestors)!.push(cand)
        placed.add(paper.paperId)
        continue
      }
    }
  }
  return buckets
}

function bucketDownstream(
  citations: S2CitationRow[],
  focal: S2Paper
): Map<string, Candidate[]> {
  const buckets = new Map<string, Candidate[]>([
    [STAGE_IDS.downstreamExtensions, []],
    [STAGE_IDS.downstreamApplications, []],
    [STAGE_IDS.downstreamContrasts, []]
  ])
  const placed = new Set<string>()

  for (const row of citations) {
    const paper = row.citingPaper
    if (!paper?.paperId) continue
    if (placed.has(paper.paperId)) continue
    const isInfluential = row.isInfluential === true
    const intents = (row.intents ?? []).map((x) => x.toLowerCase())
    const abstractLower = (paper.abstract ?? '').toLowerCase()
    const contrastPhraseFound = CONTRAST_PHRASES.some((p) =>
      abstractLower.includes(p)
    )
    const cand: Candidate = {
      paper,
      isInfluential,
      intents,
      contrastPhraseFound
    }

    // Extensions: isInfluential + intent=extension OR methodology.
    if (
      isInfluential &&
      (intents.includes('extension') || intents.includes('methodology'))
    ) {
      buckets.get(STAGE_IDS.downstreamExtensions)!.push(cand)
      placed.add(paper.paperId)
      continue
    }

    // Applications: intent=methodology, different subfield. (Influence
    // not required — survey-paper applications often aren't flagged
    // influential but still represent real-world use.)
    if (intents.includes('methodology')) {
      const sameSubfield = shareAnyFieldOfStudy(
        focal.fieldsOfStudy,
        paper.fieldsOfStudy
      )
      // Strict "different subfield": both papers HAVE fieldsOfStudy AND
      // they don't overlap. When either side is missing the field we
      // skip Applications and let the candidate fall to a later bucket
      // — better to be conservative than to mislabel.
      const haveBothFields =
        (focal.fieldsOfStudy?.length ?? 0) > 0 &&
        (paper.fieldsOfStudy?.length ?? 0) > 0
      if (haveBothFields && !sameSubfield) {
        buckets.get(STAGE_IDS.downstreamApplications)!.push(cand)
        placed.add(paper.paperId)
        continue
      }
    }

    // Contrasts: intent=result OR comparison + abstract contains a
    // contrast phrase. Comparison alone is enough; result requires
    // the phrase to avoid swallowing every paper that builds on the
    // focal's results.
    const isComparison = intents.includes('comparison')
    const isResultWithPhrase =
      intents.includes('result') && contrastPhraseFound
    if (isComparison || isResultWithPhrase) {
      buckets.get(STAGE_IDS.downstreamContrasts)!.push(cand)
      placed.add(paper.paperId)
      continue
    }
  }
  return buckets
}

// ---------- Edge synthesis -------------------------------------------------

// One edge per node, focal at one endpoint. Citation array carries the
// per-intent provenance (s2-influential when the row was flagged
// influential, s2-intent otherwise). Multi-intent rows produce one
// citation entry per intent so the renderer can show "background +
// methodology" instead of collapsing to a single label.
function buildEdgesForBucket(
  candidates: Candidate[],
  focusPaperId: string,
  direction: 'focal-cites-other' | 'other-cites-focal'
): PaperValueChainEdge[] {
  const out: PaperValueChainEdge[] = []
  for (const c of candidates) {
    if (!c.paper.paperId) continue
    const otherId = c.paper.paperId
    const citations: PaperValueChainEdgeCitation[] = []
    let primaryRel: PaperValueChainRelationship | null = null
    const KNOWN_INTENTS = new Set([
      'background',
      'methodology',
      'extension',
      'result',
      'comparison'
    ])
    for (const rawIntent of c.intents) {
      if (!KNOWN_INTENTS.has(rawIntent)) continue
      const intent = rawIntent as
        | 'background'
        | 'methodology'
        | 'extension'
        | 'result'
        | 'comparison'
      const rel = intentToRelationship(intent, direction, {
        contrastPhraseFound: c.contrastPhraseFound
      })
      if (!rel) continue
      // Take the first recognized intent as the primary relationship,
      // since edge.relationship is single-valued. Subsequent intents
      // still record citations so the user sees the full S2 metadata.
      if (primaryRel === null) primaryRel = rel
      const citation: PaperValueChainEdgeCitation = c.isInfluential
        ? { kind: 's2-influential', intent, otherPaperId: otherId }
        : { kind: 's2-intent', intent, otherPaperId: otherId }
      citations.push(citation)
    }
    // Fallback: bucket placement implied a relationship even when no
    // S2 intent matched the relationship table (edge case — extremely
    // rare given the bucketing rules above gate on the same intents).
    // Use 'extends' as the neutral fallback so we don't drop nodes.
    const relationship: PaperValueChainRelationship = primaryRel ?? 'extends'
    const from = direction === 'focal-cites-other' ? focusPaperId : otherId
    const to = direction === 'focal-cites-other' ? otherId : focusPaperId
    out.push({
      from,
      to,
      relationship,
      note: null,
      citations:
        citations.length > 0
          ? citations
          : [{ kind: 'model' as const }]
    })
  }
  return out
}

// ---------- Public entry points --------------------------------------------

export interface GeneratePaperValueChainResult {
  ok: boolean
  chain: PaperValueChain | null
  s2CallsUsed: number
  reason?: 'rate_limited' | 'focal_not_found' | 'empty'
  // Phase 3B — enrichment outcome. 'enriched' = Haiku read the focal
  // PDF and refined the chain. 'metadata-only' = either no openAccessPdf,
  // PDF parse failed, or Haiku was unavailable. 'cache' = enrichment
  // cache hit, no Haiku call this round. UI surfaces this as a badge
  // on the chain card. Undefined on cold paths where enrichment didn't
  // run at all (e.g. focal_not_found / S2 rate-limited).
  enrichmentBadge?: 'enriched' | 'metadata-only' | 'cache'
}

export async function generatePaperValueChain(
  paperId: string
): Promise<GeneratePaperValueChainResult> {
  const id = paperId.trim()
  if (!id) {
    return { ok: false, chain: null, s2CallsUsed: 0, reason: 'focal_not_found' }
  }

  // Mark pending so the renderer can show a working state without
  // polling — it can subscribe to the chain row + see status flip.
  setPaperValueChain({ focusPaperId: id, status: 'pending', graph: null })

  let totalCalls = 0
  let focal: S2Paper | null = null
  let refs: S2RefRow[] = []
  let citations: S2CitationRow[] = []
  try {
    const focalRes = await fetchFocalPaper(id)
    totalCalls += focalRes.callsMade
    focal = focalRes.data
    if (!focal?.paperId || !focal.title) {
      setPaperValueChain({ focusPaperId: id, status: 'error', graph: null })
      return {
        ok: false,
        chain: null,
        s2CallsUsed: totalCalls,
        reason: 'focal_not_found'
      }
    }

    const refsRes = await fetchReferencesBulk(id)
    totalCalls += refsRes.callsMade
    refs = refsRes.data ?? []

    const citationsRes = await fetchCitationsBulk(id)
    totalCalls += citationsRes.callsMade
    citations = citationsRes.data ?? []
  } catch (err) {
    if (err instanceof S2RateLimitError) {
      setPaperValueChain({ focusPaperId: id, status: 'error', graph: null })
      return {
        ok: false,
        chain: null,
        s2CallsUsed: totalCalls,
        reason: 'rate_limited'
      }
    }
    setPaperValueChain({ focusPaperId: id, status: 'error', graph: null })
    return { ok: false, chain: null, s2CallsUsed: totalCalls, reason: 'empty' }
  }

  // Bucketing. Each bucket is a mini-pipeline: priority-place → top-N rank.
  const upstreamBuckets = bucketUpstream(refs, focal)
  const downstreamBuckets = bucketDownstream(citations, focal)

  // Same-author focal cluster — papers within ±1y of focal that share
  // an author. Pulled from the union of refs + citations so we don't
  // burn extra S2 calls.
  const focalYear = focal.year ?? new Date().getFullYear()
  const focalCluster: S2Paper[] = []
  const seenInCluster = new Set<string>([focal.paperId!])
  for (const row of refs) {
    const p = row.citedPaper
    if (!p?.paperId || seenInCluster.has(p.paperId)) continue
    if (p.year == null) continue
    if (Math.abs(p.year - focalYear) > FOCAL_AUTHOR_WINDOW_YEARS) continue
    if (!shareAnyAuthor(focal.authors, p.authors)) continue
    focalCluster.push(p)
    seenInCluster.add(p.paperId)
  }
  for (const row of citations) {
    const p = row.citingPaper
    if (!p?.paperId || seenInCluster.has(p.paperId)) continue
    if (p.year == null) continue
    if (Math.abs(p.year - focalYear) > FOCAL_AUTHOR_WINDOW_YEARS) continue
    if (!shareAnyAuthor(focal.authors, p.authors)) continue
    focalCluster.push(p)
    seenInCluster.add(p.paperId)
  }

  // Top-N pruning per stage.
  const nodes: PaperValueChainNode[] = []
  const edges: PaperValueChainEdge[] = []

  // Focal node always first.
  const focalNode = nodeFromS2(focal, STAGE_IDS.focal)
  if (!focalNode) {
    setPaperValueChain({ focusPaperId: id, status: 'error', graph: null })
    return {
      ok: false,
      chain: null,
      s2CallsUsed: totalCalls,
      reason: 'focal_not_found'
    }
  }
  nodes.push(focalNode)
  for (const p of focalCluster.slice(0, TOP_N_PER_STAGE - 1)) {
    const n = nodeFromS2(p, STAGE_IDS.focal)
    if (n) nodes.push(n)
  }

  // Upstream buckets — rank + prune + emit nodes/edges.
  for (const stageId of [
    STAGE_IDS.upstreamFoundational,
    STAGE_IDS.upstreamMethodological,
    STAGE_IDS.upstreamAncestors
  ]) {
    const candidates = upstreamBuckets.get(stageId) ?? []
    const ranked = topNByRank(
      candidates.map((c) => ({
        item: { paperId: c.paper.paperId!, candidate: c },
        score: rankScore({
          isInfluential: c.isInfluential,
          citationCount: c.paper.citationCount ?? 0,
          influentialCitationCount: c.paper.influentialCitationCount ?? 0
        })
      })),
      TOP_N_PER_STAGE
    )
    for (const r of ranked) {
      const node = nodeFromS2(r.candidate.paper, stageId)
      if (node) nodes.push(node)
    }
    edges.push(
      ...buildEdgesForBucket(
        ranked.map((r) => r.candidate),
        focal.paperId!,
        'focal-cites-other'
      )
    )
  }

  // Downstream buckets — same shape, opposite direction.
  for (const stageId of [
    STAGE_IDS.downstreamExtensions,
    STAGE_IDS.downstreamApplications,
    STAGE_IDS.downstreamContrasts
  ]) {
    const candidates = downstreamBuckets.get(stageId) ?? []
    const ranked = topNByRank(
      candidates.map((c) => ({
        item: { paperId: c.paper.paperId!, candidate: c },
        score: rankScore({
          isInfluential: c.isInfluential,
          citationCount: c.paper.citationCount ?? 0,
          influentialCitationCount: c.paper.influentialCitationCount ?? 0
        })
      })),
      TOP_N_PER_STAGE
    )
    for (const r of ranked) {
      const node = nodeFromS2(r.candidate.paper, stageId)
      if (node) nodes.push(node)
    }
    edges.push(
      ...buildEdgesForBucket(
        ranked.map((r) => r.candidate),
        focal.paperId!,
        'other-cites-focal'
      )
    )
  }

  // Replications/Refutations stage stays empty in 3A. Stage entry is
  // present in FIXED_STAGES so the renderer always allocates its column;
  // 3D will populate the nodes.

  const baseChain: PaperValueChain = {
    focusPaperId: focal.paperId!,
    focusLabel: focalNode.authorYearLabel,
    stages: FIXED_STAGES,
    nodes,
    edges,
    s2CallsUsed: totalCalls
  }

  // Phase 3B — try to enrich with focal-paper-intro reading. The
  // enrichment step is best-effort: any failure (no PDF, parse failure,
  // Haiku rate-limit, key missing) returns the base chain unchanged and
  // the UI falls back to the "metadata only" badge. Enrichment cache is
  // 90-day TTL and consulted before re-running Haiku.
  const refsForEnrichment = buildRefsMetaForEnrichment(refs)
  const enriched = await maybeEnrichWithFocalPaperReading({
    baseChain,
    focal,
    refsMeta: refsForEnrichment
  })

  // Phase 3C — bilateral reinforcement on the post-enrichment chain.
  // Cache hit ('cache' badge) means we just deserialized a previous
  // generation that already ran the bilateral pass; don't re-run.
  // Cold paths run bilateral immediately so the persisted enrichment
  // row carries it. Failures are silent (graceful degradation per
  // spec) — the chain still ships, just without bilateral upgrades.
  let postBilateralChain = enriched.chain
  if (enriched.badge !== 'cache') {
    try {
      const bilateralResult = await findBilateralEdges(
        enriched.chain,
        refsForEnrichment
      )
      postBilateralChain = bilateralResult.chain
      if (bilateralResult.matchedEdges > 0) {
        console.log(
          `[paper-chain] bilateral upgraded ${bilateralResult.matchedEdges} edge(s) ` +
            `for ${id} (+${bilateralResult.s2CallsAdded} S2 calls, ` +
            `+${bilateralResult.pdfFetchesAdded} PDF fetches)`
        )
        // Refresh the enrichment cache row with the bilateral-enriched
        // chain so subsequent reads return the doubled-pill view from
        // the persistent layer rather than re-running bilateral.
        upsertPaperChainEnrichment({
          focusPaperId: id,
          enrichedGraph: postBilateralChain,
          haikuCallsUsed: enriched.haikuCallsUsed
        })
      }
    } catch (err) {
      console.warn(
        '[paper-chain] bilateral pass failed:',
        err instanceof Error ? err.message : err
      )
    }
  }
  const finalChain = postBilateralChain
  setPaperValueChain({ focusPaperId: id, status: 'ready', graph: finalChain })

  // Empty-chain telemetry. Spec acceptance requires "given a paper with
  // ≥5 references and ≥5 citations, generates a chain with all 7 active
  // stages populated" — for thinner papers we still return ok=true but
  // surface 'empty' as a soft signal to the UI.
  const activeNodeCount = finalChain.nodes.length - 1 // minus focal
  if (activeNodeCount === 0) {
    return {
      ok: true,
      chain: finalChain,
      s2CallsUsed: totalCalls,
      enrichmentBadge: enriched.badge,
      reason: 'empty'
    }
  }
  return {
    ok: true,
    chain: finalChain,
    s2CallsUsed: totalCalls,
    enrichmentBadge: enriched.badge
  }
}

// Cache-first read. Returns the persisted chain when present; renderer
// uses this for the <50ms hot-path acceptance criterion. Caller can
// follow up with regeneratePaperValueChain to bypass the cache.
export function getCachedPaperValueChain(
  paperId: string
): PaperValueChain | null {
  const row = readPaperValueChain(paperId)
  return row?.graph ?? null
}

export async function regeneratePaperValueChain(
  paperId: string
): Promise<GeneratePaperValueChainResult> {
  // Invalidate the Haiku enrichment cache so a regen always re-runs the
  // PDF read + Haiku call against the current S2 data. Generate path
  // does NOT delete this on its own — that's why getCachedPaperValueChain
  // can return an enriched chain instantly without paying the Haiku
  // cost on every renderer mount.
  deletePaperChainEnrichment(paperId.trim())
  return generatePaperValueChain(paperId)
}

// =====================================================================
// Phase 3B — focal-paper-intro enrichment
// =====================================================================

// 90-day TTL on the enrichment cache. A regen invalidates immediately
// (regeneratePaperValueChain calls deletePaperChainEnrichment). Outside
// of regen the cache stands until expiry.
const ENRICHMENT_CACHE_TTL_MS = 90 * 86_400_000
// Hard ceiling on Haiku-proposed claims per chain. Keeps the prompt
// bounded and the parser cheap; >12 claims would overflow the chain
// visually anyway.
const MAX_HAIKU_CLAIMS = 12
// Truncation length for quoted sentences before they're stored on the
// edge citation. Renderer hover-preview is comfortable up to ~240 chars.
const QUOTED_SENTENCE_MAX_CHARS = 240

// ----- Reference-list metadata for fuzzy matching -------------------------

// Distilled view of a single S2 reference, used both for fuzzy hint
// matching AND for placing enrichment-surfaced new nodes into the chain.
// Exported for unit tests of the matcher.
export interface RefMeta {
  paperId: string
  title: string
  firstAuthor: string
  year: number | null
  isInfluential: boolean
  intents: string[]
  // Carrier of the underlying S2 paper so a new-node addition can
  // hydrate via nodeFromS2 without round-tripping S2 again.
  paper: S2Paper
}

function buildRefsMetaForEnrichment(refs: S2RefRow[]): RefMeta[] {
  const out: RefMeta[] = []
  for (const row of refs) {
    const p = row.citedPaper
    if (!p?.paperId || !p.title) continue
    const firstAuthor = p.authors?.[0]?.name?.trim() ?? ''
    out.push({
      paperId: p.paperId,
      title: p.title,
      firstAuthor,
      year: p.year ?? null,
      isInfluential: row.isInfluential === true,
      intents: (row.intents ?? []).map((x) => x.toLowerCase()),
      paper: p
    })
  }
  return out
}

// ----- Fuzzy match (exported for tests) -----------------------------------

// Token-set similarity. Returns intersection size / min(setA.size, setB.size)
// rather than Jaccard so a partial title fragment ("Attention is all you need")
// scores well against the full title ("Attention Is All You Need: A Transformer
// Approach for ..."). Tokens shorter than 3 chars are dropped (filters out
// articles like "a", "of", "is" without depending on a stopword list).
export function tokenSetSimilarity(a: string, b: string): number {
  const tokenize = (s: string): Set<string> => {
    const tokens = s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3)
    return new Set(tokens)
  }
  const setA = tokenize(a)
  const setB = tokenize(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let inter = 0
  for (const t of setA) if (setB.has(t)) inter += 1
  return inter / Math.min(setA.size, setB.size)
}

function lastWord(s: string): string {
  return s.trim().split(/\s+/).slice(-1)[0]?.toLowerCase() ?? ''
}

export interface CitedHint {
  titleFragment: string
  firstAuthor: string
  year?: number
}

// Resolve a Haiku-proposed citedPaperHint to a paperId in the focal
// paper's S2 reference list, or null if no match. Two acceptance paths
// per spec:
//   1. Token-set title similarity ≥ 0.7 AND first-author surname match
//   2. Exact year match AND title prefix match (first 30 lowercased chars)
// Returns the FIRST match found. Hints that don't fall under either
// path return null and the caller drops the edge silently.
export function resolveCitedHint(
  hint: CitedHint,
  refs: RefMeta[]
): string | null {
  const hintAuthorLast = lastWord(hint.firstAuthor)
  // Path 1
  for (const ref of refs) {
    const sim = tokenSetSimilarity(hint.titleFragment, ref.title)
    if (sim < 0.7) continue
    const refAuthorLast = lastWord(ref.firstAuthor)
    if (hintAuthorLast && refAuthorLast && hintAuthorLast === refAuthorLast) {
      return ref.paperId
    }
  }
  // Path 2
  if (hint.year != null) {
    const fragmentPrefix = hint.titleFragment.toLowerCase().slice(0, 30)
    for (const ref of refs) {
      if (ref.year !== hint.year) continue
      const titlePrefix = ref.title.toLowerCase().slice(0, 30)
      if (fragmentPrefix === titlePrefix) return ref.paperId
    }
  }
  return null
}

// ----- Haiku claim shape + relationship reconciliation -------------------

interface HaikuClaim {
  claim: string
  citedPaperHint: CitedHint
  relationship: PaperValueChainRelationship
  quotedSentence: string
}

// Spec rule: a 'refutes' or 'contrasts' relationship from Haiku always
// overrides s2-intent, since S2's classifier is known to be weak on
// negative citations. Other Haiku relationships only override when the
// existing edge has no specific relationship signal yet (i.e. the edge
// fell back to 'extends' from the S2-side fallback path). Exported for
// unit tests.
export function reconcileRelationship(
  existing: PaperValueChainRelationship,
  fromHaiku: PaperValueChainRelationship,
  hasInfluentialCitation: boolean
): PaperValueChainRelationship {
  if (fromHaiku === 'refutes' || fromHaiku === 'contrasts') return fromHaiku
  // For positive relationships, defer to existing IF it was anchored
  // in s2-influential (the strongest S2 signal). Otherwise let Haiku's
  // reading refine it — Haiku has the actual sentence in hand.
  if (hasInfluentialCitation) return existing
  return fromHaiku
}

// ----- Haiku call ---------------------------------------------------------

interface EnrichmentOutcome {
  chain: PaperValueChain
  badge: 'enriched' | 'metadata-only' | 'cache'
  haikuCallsUsed: number
}

async function maybeEnrichWithFocalPaperReading(input: {
  baseChain: PaperValueChain
  focal: S2Paper
  refsMeta: RefMeta[]
}): Promise<EnrichmentOutcome> {
  const focusId = input.baseChain.focusPaperId

  // Cache check — 90-day TTL. A regen path deletes this row before
  // calling generate, so a hit here means "no regen since enrichment."
  const cached = getPaperChainEnrichment(focusId)
  if (cached && Date.now() - cached.enrichedAt < ENRICHMENT_CACHE_TTL_MS) {
    return {
      chain: cached.enrichedGraph,
      badge: 'cache',
      haikuCallsUsed: 0
    }
  }

  // PDF availability gate. Prefer S2's openAccessPdf; fall back to a
  // constructed arXiv PDF URL when the paper has an ArXiv externalId.
  // S2 quirk: many landmark papers (e.g. "Attention Is All You Need")
  // come back as openAccessPdf={url:"", status:null, license:null}
  // — an OBJECT with an empty-string url rather than a null/missing
  // field. `??` is nullish-only and would let the empty string through;
  // we explicitly null it out so the arXiv fallback can fire.
  const arxivId = input.focal.externalIds?.ArXiv ?? null
  const openAccessRaw = input.focal.openAccessPdf?.url
  const openAccessUrl =
    typeof openAccessRaw === 'string' && openAccessRaw.trim().length > 0
      ? openAccessRaw
      : null
  const pdfUrl =
    openAccessUrl ?? (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null)
  if (!pdfUrl) {
    console.log(
      `[paper-chain] enrichment skipped for ${focusId}: ` +
        `openAccessPdf=${openAccessUrl ? 'present' : 'empty/null'}, ` +
        `arxivId=${arxivId ?? 'null'}`
    )
    return {
      chain: input.baseChain,
      badge: 'metadata-only',
      haikuCallsUsed: 0
    }
  }

  const extractResult = await extractFocalPaperIntro({
    paperId: focusId,
    pdfUrl
  })
  if (!extractResult.ok || !extractResult.extract) {
    console.log(
      `[paper-chain] enrichment skipped for ${focusId}: PDF extract failed (${extractResult.reason ?? 'unknown'})`
    )
    return {
      chain: input.baseChain,
      badge: 'metadata-only',
      haikuCallsUsed: 0
    }
  }

  // Build the Haiku prompt. Reference list is numbered so the model
  // can refer to entries by index when convenient; the structured
  // output also takes free-text titleFragment / firstAuthor / year so
  // the matcher works without relying on the model returning indices.
  const refList = input.refsMeta
    .slice(0, 60) // hard ceiling on the prompt size; 60 covers most
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title} — ${r.firstAuthor || 'unknown'}${
          r.year != null ? ` — ${r.year}` : ''
        }`
    )
    .join('\n')
  const introBlob = extractResult.extract.sections
    .map((s) => (s.heading ? `# ${s.heading}\n${s.text}` : s.text))
    .join('\n\n')

  const system =
    `You read the introduction and related-work sections of a research ` +
    `paper. Identify places where the paper EXPLICITLY positions itself ` +
    `relative to specific cited works — building on, using methods from, ` +
    `extending, contrasting, replicating, or refuting them.\n\n` +
    `Output STRICT JSON only — an array of up to ${MAX_HAIKU_CLAIMS} ` +
    `entries, no prose, no fences:\n` +
    `[\n` +
    `  {\n` +
    `    "claim": "brief paraphrase of what the focal paper says",\n` +
    `    "citedPaperHint": {\n` +
    `      "titleFragment": "fragment of the cited paper's title",\n` +
    `      "firstAuthor": "first author name as cited",\n` +
    `      "year": 2017\n` +
    `    },\n` +
    `    "relationship": "builds-on|uses-method|extends|contrasts|replicates|refutes",\n` +
    `    "quotedSentence": "verbatim sentence from the text grounding the claim"\n` +
    `  }\n` +
    `]\n\n` +
    `Rules:\n` +
    `- Only return citations the focal paper EXPLICITLY discusses. Do not ` +
    `infer relationships from a bare citation marker.\n` +
    `- Use 'contrasts' when the focal paper says it differs from / takes ` +
    `a different approach than the cited work. Use 'refutes' only when ` +
    `the focal paper actively argues the cited work is wrong.\n` +
    `- The reference list below is the only set of papers the focal cites. ` +
    `If you can't link a claim to one of these, drop it.\n` +
    `- quotedSentence MUST be a verbatim substring of the intro text. ` +
    `Don't paraphrase or summarize the sentence.`

  const user =
    `Reference list (focal paper cites these):\n${refList}\n\n` +
    `Intro / related-work text:\n${introBlob}`

  recordClaudeCall()
  const raw = await callClaude({
    model: CLAUDE_MODELS.classifier,
    system,
    user,
    maxTokens: 4_000
  })
  if (!raw) {
    console.log(
      `[paper-chain] enrichment skipped for ${focusId}: Haiku returned null ` +
        `(check anthropicApiKey in Settings → AI; rate limit; or transient error)`
    )
    return {
      chain: input.baseChain,
      badge: 'metadata-only',
      haikuCallsUsed: 1
    }
  }
  console.log(
    `[paper-chain] enriched ${focusId}: Haiku returned ${raw.length} chars; ` +
      `parsing claims`
  )

  const claims = parseHaikuClaims(raw)
  if (claims.length === 0) {
    // Haiku ran successfully but found nothing groundable. Persist the
    // enrichment cache row anyway with the base chain so a re-render
    // doesn't burn another Haiku call.
    upsertPaperChainEnrichment({
      focusPaperId: focusId,
      enrichedGraph: input.baseChain,
      haikuCallsUsed: 1
    })
    return {
      chain: input.baseChain,
      badge: 'enriched',
      haikuCallsUsed: 1
    }
  }

  const enriched = applyClaimsToChain({
    baseChain: input.baseChain,
    refsMeta: input.refsMeta,
    claims,
    pdfSections: extractResult.extract.sections
  })

  upsertPaperChainEnrichment({
    focusPaperId: focusId,
    enrichedGraph: enriched,
    haikuCallsUsed: 1
  })

  return { chain: enriched, badge: 'enriched', haikuCallsUsed: 1 }
}

// Tolerant JSON parse — Haiku occasionally wraps the array in a
// ```json fence or prepends a one-line preamble. Slice between the
// first '[' and last ']' before parsing. Returns [] on any failure;
// the enrichment caller treats that as "ran but found nothing."
function parseHaikuClaims(raw: string): HaikuClaim[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch (err) {
    console.warn(
      '[paper-chain] Haiku JSON parse failed:',
      err instanceof Error ? err.message : err
    )
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: HaikuClaim[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    const hint = e.citedPaperHint as Record<string, unknown> | undefined
    if (!hint || typeof hint !== 'object') continue
    const titleFragment = typeof hint.titleFragment === 'string' ? hint.titleFragment.trim() : ''
    const firstAuthor = typeof hint.firstAuthor === 'string' ? hint.firstAuthor.trim() : ''
    if (!titleFragment || !firstAuthor) continue
    const year = typeof hint.year === 'number' ? hint.year : undefined
    const relationship = e.relationship as PaperValueChainRelationship
    if (
      relationship !== 'builds-on' &&
      relationship !== 'uses-method' &&
      relationship !== 'extends' &&
      relationship !== 'contrasts' &&
      relationship !== 'replicates' &&
      relationship !== 'refutes'
    ) {
      continue
    }
    const claimText = typeof e.claim === 'string' ? e.claim.trim() : ''
    const quotedSentence = typeof e.quotedSentence === 'string' ? e.quotedSentence.trim() : ''
    if (!quotedSentence) continue
    out.push({
      claim: claimText,
      citedPaperHint: { titleFragment, firstAuthor, year },
      relationship,
      quotedSentence
    })
    if (out.length >= MAX_HAIKU_CLAIMS) break
  }
  return out
}

// Apply the resolved + matched Haiku claims to the base chain.
// Returns a new chain (never mutates the input) so callers can compare
// pre/post for tests.
//
// Per spec:
//   - Haiku UPGRADES an existing edge: append paper-pdf citation,
//     override relationship for 'refutes' / 'contrasts' (or via
//     reconcileRelationship for positive cases when the edge isn't
//     anchored on s2-influential).
//   - Haiku SURFACES a new edge ONLY IF the citedPaperHint resolves to
//     a paper in the S2 reference list (already enforced — claims
//     unresolved by resolveCitedHint never make it here).
//   - Hallucination defense: claims that don't resolve are dropped
//     silently; never added as kind:'unverified'.
function applyClaimsToChain(input: {
  baseChain: PaperValueChain
  refsMeta: RefMeta[]
  claims: HaikuClaim[]
  pdfSections: ReturnType<typeof Object> extends never
    ? never
    : { heading: string | null; text: string; pageOffset: number }[]
}): PaperValueChain {
  // Clone-on-write: copy node + edge arrays so mutations stay local.
  const nodes = input.baseChain.nodes.map((n) => ({ ...n }))
  const edges = input.baseChain.edges.map((e) => ({
    ...e,
    citations: [...e.citations]
  }))
  const focusId = input.baseChain.focusPaperId
  const refsByPaperId = new Map<string, RefMeta>(
    input.refsMeta.map((r) => [r.paperId, r])
  )
  const nodesByPaperId = new Map<string, number>(
    nodes.map((n, i) => [n.paperId, i])
  )

  for (const claim of input.claims) {
    const resolvedId = resolveCitedHint(claim.citedPaperHint, input.refsMeta)
    if (!resolvedId) {
      // Hallucination defense — log and drop. Never surfaces in the
      // chain; never becomes kind:'unverified'.
      console.warn(
        '[paper-chain] dropping Haiku claim — citedPaperHint did not resolve to any S2 reference:',
        JSON.stringify(claim.citedPaperHint)
      )
      continue
    }

    // Locate the quoted sentence's page in the extract. Pick the FIRST
    // section whose text contains the sentence (case-insensitive); use
    // the section's pageOffset. charOffset is the index within the
    // section's text; reserved for future pdfjs-rendered viewer
    // highlighting (Phase 3B's Chromium viewer can only honor #page=N).
    const pageInfo = locateSentenceInSections(
      claim.quotedSentence,
      input.pdfSections
    )
    const quotedSentenceTrimmed = claim.quotedSentence.slice(
      0,
      QUOTED_SENTENCE_MAX_CHARS
    )

    const paperPdfCitation: PaperValueChainEdgeCitation = {
      kind: 'paper-pdf',
      paperId: focusId,
      otherPaperId: resolvedId,
      quotedSentence: quotedSentenceTrimmed,
      pageOffset: pageInfo.pageOffset,
      charOffset: pageInfo.charOffset
    }

    // Find an existing edge between focal and resolvedId in either
    // direction. Upstream edges have from=focal, to=resolved; downstream
    // are reversed. For Phase 3B's intro-reading scope we only deal
    // with the upstream direction (focal cites resolved), so check that
    // direction first; fall back to the reverse for safety.
    const existingIdx = edges.findIndex(
      (e) =>
        (e.from === focusId && e.to === resolvedId) ||
        (e.from === resolvedId && e.to === focusId)
    )
    if (existingIdx >= 0) {
      const e = edges[existingIdx]
      const hadInfluential = e.citations.some(
        (c) => c.kind === 's2-influential'
      )
      e.citations.push(paperPdfCitation)
      e.relationship = reconcileRelationship(
        e.relationship,
        claim.relationship,
        hadInfluential
      )
      // Note carries the Haiku claim paraphrase when present — gives
      // the renderer a one-line summary of why the edge exists beyond
      // S2's intent label.
      if (e.note === null && claim.claim) {
        e.note = claim.claim.slice(0, 140)
      }
      continue
    }

    // SURFACE new edge. Only if the resolvedId ↔ S2 ref list link
    // exists (always true here since resolveCitedHint walked refsMeta).
    const refMeta = refsByPaperId.get(resolvedId)
    if (!refMeta) continue
    edges.push({
      from: focusId,
      to: resolvedId,
      relationship: claim.relationship,
      note: claim.claim ? claim.claim.slice(0, 140) : null,
      citations: [paperPdfCitation]
    })

    // If the resolved paper isn't already a node in the chain, add it
    // to upstream-ancestors (catch-all upstream bucket — Phase 3B
    // doesn't sub-bucket enrichment-surfaced nodes; spec says stage
    // taxonomy is unchanged).
    if (!nodesByPaperId.has(resolvedId)) {
      const node = nodeFromS2(refMeta.paper, STAGE_IDS.upstreamAncestors)
      if (node) {
        nodes.push(node)
        nodesByPaperId.set(resolvedId, nodes.length - 1)
      }
    }
  }

  return {
    ...input.baseChain,
    nodes,
    edges
  }
}

// Find which extracted section a sentence lives in. Returns the
// matching section's pageOffset + character index of the sentence
// within that section, or { pageOffset: 1, charOffset: 0 } when no
// section contains the sentence (graceful fallback — the renderer
// opens at page 1, accepts ±1 page tolerance per spec).
function locateSentenceInSections(
  sentence: string,
  sections: { heading: string | null; text: string; pageOffset: number }[]
): { pageOffset: number; charOffset: number } {
  if (!sentence) return { pageOffset: 1, charOffset: 0 }
  // Use the first ~80 chars of the sentence for the search — shorter
  // is more tolerant of pdfjs's whitespace + ligature quirks.
  const needle = sentence.slice(0, 80).toLowerCase().trim()
  if (!needle) return { pageOffset: 1, charOffset: 0 }
  for (const section of sections) {
    const idx = section.text.toLowerCase().indexOf(needle)
    if (idx >= 0) {
      return { pageOffset: section.pageOffset, charOffset: idx }
    }
  }
  // Fall back to the first section's page so the deep-link still
  // opens "near" the relevant text. Page 1 is a safer default than
  // unconditionally page 0.
  return {
    pageOffset: sections[0]?.pageOffset ?? 1,
    charOffset: 0
  }
}

// =====================================================================
// Phase 3C — bilateral citation reinforcement
// =====================================================================

// Eligibility: only edges whose relationship suggests an upstream
// dependency (focal-cites-counterpart) AND which are anchored on a
// strong-confidence citation. s2-intent and model-only edges are
// intentionally below the bar — bilateral upgrade is for already-
// confident edges.
const BILATERAL_RELATIONSHIPS = new Set<PaperValueChainRelationship>([
  'builds-on',
  'extends',
  'uses-method'
])
const BILATERAL_PROVENANCE_KINDS = new Set<PaperValueChainEdgeCitation['kind']>([
  'paper-pdf',
  's2-influential'
])
// Cap the bilateral check at the top-K edges by isInfluential rank.
// Keeps the per-chain cost bounded: 6 edges × (1 S2 ref-list + 1 PDF
// fetch + 1 extract) ≈ ~6s and ≤6 added S2 calls. Picked 6 as the
// spec value; lower is fine, higher would push past the per-chain
// budget envelope.
const BILATERAL_TOP_K = 6
// Jaccard thresholds for the heuristic rules. Forward-reference is
// looser (counterpart only needs to mention concepts overlapping with
// focal); framing-alignment is stricter (counterpart's contribution
// sentence should largely echo focal's quoted sentence).
const FORWARD_REFERENCE_JACCARD = 0.3
const FRAMING_ALIGNMENT_JACCARD = 0.4
// Phrases that flag a sentence as forward-looking ("future work" /
// "open question" / etc.). Lowercased, matched as substrings.
// Conservative to avoid false positives — most papers state their
// future work explicitly using one of these idioms.
const FORWARD_REFERENCE_PHRASES = [
  'future work',
  'future research',
  'open question',
  'open problem',
  'remains to be',
  'remains an open',
  'could be extended',
  'would be interesting',
  'left for future',
  'we leave',
  'we plan to'
]
// Sentence prefixes that flag a "we present / we propose / our
// contribution" sentence. The framing-alignment rule scans the
// counterpart's intro for one of these and compares its content to
// the focal's quoted sentence.
const CONTRIBUTION_SENTENCE_PHRASES = [
  'we present',
  'we propose',
  'we introduce',
  'we describe',
  'in this paper',
  'in this work',
  'our contribution',
  'our approach',
  'our method',
  'we show',
  'this paper presents',
  'this work presents'
]
const STOP_TOKENS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'these', 'those',
  'from', 'into', 'are', 'has', 'have', 'had', 'was', 'were',
  'been', 'being', 'their', 'they', 'them', 'our', 'this',
  'using', 'used', 'use', 'such', 'paper', 'work', 'show',
  'shown', 'present', 'propose', 'introduce', 'describe', 'study',
  'studies', 'method', 'methods', 'approach', 'approaches',
  'result', 'results', 'find', 'found', 'shows'
])

// Symmetric Jaccard on content tokens. Lowercase, strip punctuation,
// drop short tokens (<3 chars) and a small stopword list. Used by both
// forward-reference and framing-alignment rules.
//
// Symmetric (intersection / union) — different from tokenSetSimilarity
// in 3B which is asymmetric (intersection / min) for short-fragment
// matching. The bilateral rules want symmetric overlap because both
// sides are full sentences / abstracts of comparable length.
//
// Exported for unit tests.
export function contentTokenJaccard(a: string, b: string): number {
  const tokenize = (s: string): Set<string> => {
    const tokens = s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t))
    return new Set(tokens)
  }
  const setA = tokenize(a)
  const setB = tokenize(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let inter = 0
  for (const t of setA) if (setB.has(t)) inter += 1
  const union = setA.size + setB.size - inter
  return inter / union
}

// Walk an extracted-intro text looking for a sentence that contains
// one of the forward-reference phrases AND has Jaccard ≥0.3 with the
// focal paper's content tokens. Returns the matching sentence + the
// trigger phrase that fired, or null if no sentence qualifies.
//
// Sentence segmentation: split on `.!?` followed by whitespace +
// capital letter or end-of-string. Imperfect (handles e.g. but
// breaks on "et al.") — fine for this heuristic since false-positive
// sentences just need to ALSO match the Jaccard threshold to count.
//
// Exported for tests.
export function findForwardReferenceMatch(
  introText: string,
  focalContentTokensSource: string,
  threshold: number = FORWARD_REFERENCE_JACCARD
): { sentence: string; trigger: string } | null {
  const sentences = splitIntoSentences(introText)
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase()
    const trigger = FORWARD_REFERENCE_PHRASES.find((p) => lower.includes(p))
    if (!trigger) continue
    const overlap = contentTokenJaccard(sentence, focalContentTokensSource)
    if (overlap >= threshold) {
      return { sentence: sentence.trim().slice(0, 240), trigger }
    }
  }
  return null
}

// Walk the counterpart's intro for a "we present / we propose / …"
// sentence and compare its content overlap with the focal's quoted
// sentence (from 3B's paper-pdf citation). Returns the matching
// sentence if Jaccard ≥0.4, else null.
//
// Exported for tests.
export function findFramingAlignmentMatch(
  counterpartIntroText: string,
  focalQuotedSentence: string,
  threshold: number = FRAMING_ALIGNMENT_JACCARD
): { sentence: string } | null {
  const sentences = splitIntoSentences(counterpartIntroText)
  let best: { sentence: string; score: number } | null = null
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase()
    const isContribution = CONTRIBUTION_SENTENCE_PHRASES.some((p) =>
      lower.includes(p)
    )
    if (!isContribution) continue
    const overlap = contentTokenJaccard(sentence, focalQuotedSentence)
    if (overlap < threshold) continue
    if (!best || overlap > best.score) {
      best = { sentence: sentence.trim().slice(0, 240), score: overlap }
    }
  }
  return best ? { sentence: best.sentence } : null
}

// Sentence splitter — naive but adequate for intro text. Splits on
// punctuation-then-whitespace transitions; preserves trailing
// fragments. Exported for tests so the splitter can be exercised
// directly without going through the rule helpers.
export function splitIntoSentences(text: string): string[] {
  if (!text) return []
  // Replace pdfjs-extracted line wraps with single spaces so a
  // sentence broken across lines still compares cleanly.
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const out: string[] = []
  let buf = ''
  for (let i = 0; i < collapsed.length; i++) {
    buf += collapsed[i]
    const ch = collapsed[i]
    const next = collapsed[i + 1]
    if ((ch === '.' || ch === '!' || ch === '?') && (next === ' ' || next === undefined)) {
      const trimmed = buf.trim()
      if (trimmed.length > 0) out.push(trimmed)
      buf = ''
    }
  }
  const tail = buf.trim()
  if (tail.length > 0) out.push(tail)
  return out
}

// Aggregate result returned from the bilateral pass. Caller folds
// these into edge.citations.
interface BilateralOutcome {
  chain: PaperValueChain
  s2CallsAdded: number
  pdfFetchesAdded: number
  matchedEdges: number
}

// Eligible edge candidate plus the pre-computed rank score (used to
// pick the top-K within budget).
interface BilateralCandidate {
  edgeIndex: number
  edge: PaperValueChainEdge
  counterpartPaperId: string
  // Anchor citation that triggered eligibility — passed through into
  // the bilateral citation's focalCitation slot when a match fires.
  anchor:
    | Extract<PaperValueChainEdgeCitation, { kind: 'paper-pdf' }>
    | Extract<PaperValueChainEdgeCitation, { kind: 's2-influential' }>
  // True when the anchor was paper-pdf — preferred over s2-influential
  // for tie-breaking and used to gate framing-alignment (which needs
  // a quoted sentence from the focal).
  hasHaikuAnchor: boolean
  // Counterpart node metadata pulled from chain.nodes — needed for
  // the PDF URL fallback (openAccessPdf || arxiv).
  counterpartNode: PaperValueChainNode | null
  // Rank score for top-K selection. Higher = check first.
  rankScore: number
}

function pickBilateralCandidates(
  chain: PaperValueChain,
  refsMeta: RefMeta[]
): BilateralCandidate[] {
  const focusId = chain.focusPaperId
  const refsByPaperId = new Map(refsMeta.map((r) => [r.paperId, r]))
  const nodesByPaperId = new Map(chain.nodes.map((n) => [n.paperId, n]))
  const out: BilateralCandidate[] = []
  for (let i = 0; i < chain.edges.length; i++) {
    const edge = chain.edges[i]
    if (!BILATERAL_RELATIONSHIPS.has(edge.relationship)) continue
    // Edges in 3A point focal-as-from for upstream, focal-as-to for
    // downstream. Bilateral only operates on edges where focal cites
    // someone — i.e. focal is on the `from` side. Downstream edges
    // (someone cites focal) are excluded by relationship pre-filter
    // anyway since 'extends'/'builds-on' don't normally describe
    // citers, but double-check by direction here.
    if (edge.from !== focusId) continue
    const counterpartPaperId = edge.to
    if (!counterpartPaperId || counterpartPaperId === focusId) continue
    // Already bilateral? Skip — no double-upgrade.
    if (edge.citations.some((c) => c.kind === 'bilateral')) continue
    // Pick the strongest anchor citation. paper-pdf preferred over
    // s2-influential per the provenance hierarchy.
    const haikuAnchor = edge.citations.find(
      (c) => c.kind === 'paper-pdf'
    ) as Extract<PaperValueChainEdgeCitation, { kind: 'paper-pdf' }> | undefined
    const influAnchor = edge.citations.find(
      (c) => c.kind === 's2-influential'
    ) as
      | Extract<PaperValueChainEdgeCitation, { kind: 's2-influential' }>
      | undefined
    const anchor = haikuAnchor ?? influAnchor
    if (!anchor) continue
    if (!BILATERAL_PROVENANCE_KINDS.has(anchor.kind)) continue
    const refMeta = refsByPaperId.get(counterpartPaperId)
    out.push({
      edgeIndex: i,
      edge,
      counterpartPaperId,
      anchor,
      hasHaikuAnchor: !!haikuAnchor,
      counterpartNode: nodesByPaperId.get(counterpartPaperId) ?? null,
      // Rank: isInfluential + influentialCitationCount tier from the
      // refs metadata, with a small lift for haiku-pdf anchors so
      // those tip the list (more interesting to verify).
      rankScore:
        (refMeta?.isInfluential ? 5 : 0) +
        (refMeta?.paper.influentialCitationCount ?? 0) * 2 +
        Math.log10(Math.max(1, refMeta?.paper.citationCount ?? 0)) +
        (haikuAnchor ? 1 : 0)
    })
  }
  out.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore
    return a.counterpartPaperId.localeCompare(b.counterpartPaperId)
  })
  return out.slice(0, BILATERAL_TOP_K)
}

// Build the PDF-fetch URL for a counterpart node. Mirrors the focal
// fallback: openAccessPdf → arXiv direct → null. We don't have S2's
// raw paper object on the chain node, so fall back to the existing
// pdfUrl field that nodeFromS2 pre-populated; if that's null/empty
// (S2 quirk: sometimes empty-string), we have nothing to fetch.
function counterpartPdfUrl(node: PaperValueChainNode | null): string | null {
  if (!node?.pdfUrl) return null
  return node.pdfUrl
}

export interface FindBilateralEdgesOptions {
  // Allow tests to mock S2 + PDF dependencies without spinning up the
  // full network stack. Both default to the real impls in production.
  fetchCounterpartReferences?: (
    paperId: string
  ) => Promise<FetchOutcome<Set<string>>>
  fetchCounterpartPdfExtract?: (input: {
    paperId: string
    pdfUrl: string | null
  }) => Promise<{
    sections: { heading: string | null; text: string; pageOffset: number }[]
  } | null>
}

// Phase 3C public entry. Walks the chain looking for edges that
// qualify for bilateral upgrade, runs the three-rule check on the top
// 6 by rank, and returns the augmented chain plus call-budget
// telemetry. Pure function — does not write to the DB; the caller
// (generatePaperValueChain) folds the result into the persisted
// enrichment row.
//
// Graceful degradation: if a counterpart's PDF is unavailable, only
// the mutual-cite rule fires (S2-only); the edge stays at its
// pre-bilateral provenance otherwise. Spec mandates silent — no log
// spam on degradation.
export async function findBilateralEdges(
  chain: PaperValueChain,
  refsMeta: RefMeta[],
  options: FindBilateralEdgesOptions = {}
): Promise<BilateralOutcome> {
  const focusId = chain.focusPaperId
  const candidates = pickBilateralCandidates(chain, refsMeta)
  if (candidates.length === 0) {
    return {
      chain,
      s2CallsAdded: 0,
      pdfFetchesAdded: 0,
      matchedEdges: 0
    }
  }

  // Real-world fetchers; tests inject mocks.
  const refsFetcher =
    options.fetchCounterpartReferences ?? fetchCounterpartReferenceIds
  const pdfExtractFetcher =
    options.fetchCounterpartPdfExtract ??
    (async (input: { paperId: string; pdfUrl: string | null }) => {
      const result = await extractFocalPaperIntro(input)
      if (!result.ok || !result.extract) return null
      return { sections: result.extract.sections }
    })

  // Clone-on-write so we never mutate the caller's chain.
  const edges = chain.edges.map((e) => ({ ...e, citations: [...e.citations] }))
  let s2CallsAdded = 0
  let pdfFetchesAdded = 0
  let matchedEdges = 0

  for (const cand of candidates) {
    const upgrade = await checkBilateralForCandidate({
      cand,
      focusId,
      refsFetcher,
      pdfExtractFetcher
    })
    s2CallsAdded += upgrade.s2CallsAdded
    pdfFetchesAdded += upgrade.pdfFetchesAdded
    if (upgrade.citation) {
      edges[cand.edgeIndex].citations.push(upgrade.citation)
      matchedEdges += 1
    }
  }

  return {
    chain: { ...chain, edges },
    s2CallsAdded,
    pdfFetchesAdded,
    matchedEdges
  }
}

// Per-candidate rule chain. Returns the bilateral citation to append
// (when a rule matches) plus call-budget telemetry. Encapsulated for
// readability and to make per-candidate testing straightforward.
async function checkBilateralForCandidate(input: {
  cand: BilateralCandidate
  focusId: string
  refsFetcher: NonNullable<FindBilateralEdgesOptions['fetchCounterpartReferences']>
  pdfExtractFetcher: NonNullable<
    FindBilateralEdgesOptions['fetchCounterpartPdfExtract']
  >
}): Promise<{
  citation: Extract<PaperValueChainEdgeCitation, { kind: 'bilateral' }> | null
  s2CallsAdded: number
  pdfFetchesAdded: number
}> {
  const { cand, focusId, refsFetcher, pdfExtractFetcher } = input
  let s2Calls = 0
  let pdfFetches = 0

  // Rule 1 — mutual-cite. Counterpart's reference list contains focal.
  // S2-only; doesn't need a PDF. Highest confidence.
  let counterpartRefIds: Set<string> | null = null
  try {
    const refsRes = await refsFetcher(cand.counterpartPaperId)
    s2Calls += refsRes.callsMade
    counterpartRefIds = refsRes.data
  } catch {
    // Rate-limited or transient — fall through to other rules.
  }
  if (counterpartRefIds && counterpartRefIds.has(focusId)) {
    return {
      citation: {
        kind: 'bilateral',
        matchReason: 'mutual-cite',
        focalCitation: cand.anchor,
        counterpartCitation: null,
        trigger: null
      },
      s2CallsAdded: s2Calls,
      pdfFetchesAdded: pdfFetches
    }
  }

  // Rules 2 + 3 require the counterpart's PDF. If unavailable, stay
  // at current provenance. Silent — no log per spec.
  const pdfUrl = counterpartPdfUrl(cand.counterpartNode)
  if (!pdfUrl) {
    return { citation: null, s2CallsAdded: s2Calls, pdfFetchesAdded: pdfFetches }
  }

  let extract: {
    sections: { heading: string | null; text: string; pageOffset: number }[]
  } | null = null
  try {
    extract = await pdfExtractFetcher({
      paperId: cand.counterpartPaperId,
      pdfUrl
    })
    if (extract) pdfFetches += 1
  } catch {
    // Same silent-degradation policy.
  }
  if (!extract || extract.sections.length === 0) {
    return { citation: null, s2CallsAdded: s2Calls, pdfFetchesAdded: pdfFetches }
  }

  const introBlob = extract.sections.map((s) => s.text).join('\n')

  // Rule 2 — forward-reference. Counterpart's intro mentions a future-
  // work / open-question phrase AND token-overlaps with focal content.
  // Focal content tokens come from the focal node title + the anchor
  // quoted sentence (when available).
  const focalContentSource = buildFocalContentForJaccard(cand)
  const forwardMatch = findForwardReferenceMatch(introBlob, focalContentSource)
  if (forwardMatch) {
    const counterpartCitation = makeCounterpartCitation({
      counterpartPaperId: cand.counterpartPaperId,
      focusId,
      sentence: forwardMatch.sentence,
      sections: extract.sections
    })
    return {
      citation: {
        kind: 'bilateral',
        matchReason: 'forward-reference',
        focalCitation: cand.anchor,
        counterpartCitation,
        trigger: forwardMatch.trigger
      },
      s2CallsAdded: s2Calls,
      pdfFetchesAdded: pdfFetches
    }
  }

  // Rule 3 — framing-alignment. Counterpart's contribution sentence
  // overlaps focal's anchor sentence. Only meaningful when focal
  // anchor is paper-pdf (i.e. we have a quoted sentence to compare
  // against). For s2-influential anchors, fall through.
  if (cand.hasHaikuAnchor) {
    const focalQuoted =
      cand.anchor.kind === 'paper-pdf' ? cand.anchor.quotedSentence : ''
    if (focalQuoted) {
      const framingMatch = findFramingAlignmentMatch(introBlob, focalQuoted)
      if (framingMatch) {
        const counterpartCitation = makeCounterpartCitation({
          counterpartPaperId: cand.counterpartPaperId,
          focusId,
          sentence: framingMatch.sentence,
          sections: extract.sections
        })
        return {
          citation: {
            kind: 'bilateral',
            matchReason: 'framing-alignment',
            focalCitation: cand.anchor,
            counterpartCitation,
            trigger: framingMatch.sentence.slice(0, 80)
          },
          s2CallsAdded: s2Calls,
          pdfFetchesAdded: pdfFetches
        }
      }
    }
  }

  // No rule fired. Silent degradation — edge stays as-is.
  return { citation: null, s2CallsAdded: s2Calls, pdfFetchesAdded: pdfFetches }
}

// Compose a content blob the Jaccard rules compare against. For
// paper-pdf anchors we have a quoted sentence; for s2-influential we
// only have node title. Use the strongest available signal.
function buildFocalContentForJaccard(cand: BilateralCandidate): string {
  const parts: string[] = []
  if (cand.anchor.kind === 'paper-pdf' && cand.anchor.quotedSentence) {
    parts.push(cand.anchor.quotedSentence)
  }
  if (cand.counterpartNode?.title) {
    // Counterpart title isn't really "focal content," but it boosts
    // overlap when focal's quoted sentence references the counterpart
    // by paper title. Harmless on the false-positive side because the
    // Jaccard threshold still has to clear.
    parts.push(cand.counterpartNode.title)
  }
  return parts.join(' ')
}

// Build the paper-pdf-shape citation for the counterpart side. Locates
// the matched sentence's page in the counterpart's extracted sections
// using the same fuzzy anchor as the 3B path.
function makeCounterpartCitation(input: {
  counterpartPaperId: string
  focusId: string
  sentence: string
  sections: { heading: string | null; text: string; pageOffset: number }[]
}): Extract<PaperValueChainEdgeCitation, { kind: 'paper-pdf' }> {
  const located = locateSentenceInSections(input.sentence, input.sections)
  return {
    kind: 'paper-pdf',
    paperId: input.counterpartPaperId,
    otherPaperId: input.focusId,
    quotedSentence: input.sentence.slice(0, 240),
    pageOffset: located.pageOffset,
    charOffset: located.charOffset
  }
}
