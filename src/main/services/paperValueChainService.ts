// Paper Value Chain — research analog to companyValueChainService. Generates
// a fixed-stage citation lineage for a focus paper using ONLY S2 data: refs
// and citations are bucketed into upstream / focal / downstream stages by
// intent + isInfluential + recency + subfield, then each stage is top-N
// pruned and rendered as a star around the focal paper.
//
// Phase 3A scope (this file):
//   - S2 only. No Claude. No PDF reading.
//   - Stages are FIXED. The generator never proposes new ones — every chain
//     uses the same 7 stages (Replications/Refutations is empty until 3D)
//     so a user can compare two chains side-by-side without re-translating
//     labels.
//   - Edge citations are limited to s2-influential and s2-intent kinds.
//     The other kinds in PaperValueChainEdgeCitation are reserved for later
//     phases (haiku-pdf in 3C, bilateral in 3D).
//   - Total S2 calls per generation: 3 in the common path (focal getPaper
//     + refs bulk + citations bulk). Per-paper detail lookups would only
//     fire if we needed extra fields not in the bulk endpoints; today we
//     don't, so we stay well under the 40-call ceiling.
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

  const chain: PaperValueChain = {
    focusPaperId: focal.paperId!,
    focusLabel: focalNode.authorYearLabel,
    stages: FIXED_STAGES,
    nodes,
    edges,
    s2CallsUsed: totalCalls
  }
  setPaperValueChain({ focusPaperId: id, status: 'ready', graph: chain })

  // Empty-chain telemetry. Spec acceptance requires "given a paper with
  // ≥5 references and ≥5 citations, generates a chain with all 7 active
  // stages populated" — for thinner papers we still return ok=true but
  // surface 'empty' as a soft signal to the UI.
  const activeNodeCount = nodes.length - 1 // minus focal
  if (activeNodeCount === 0) {
    return { ok: true, chain, s2CallsUsed: totalCalls, reason: 'empty' }
  }
  return { ok: true, chain, s2CallsUsed: totalCalls }
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
  return generatePaperValueChain(paperId)
}
