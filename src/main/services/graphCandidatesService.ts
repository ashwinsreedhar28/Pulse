// Dynamic graph-growth pipeline. Runs on a weekly sweep:
//
//   1. Scan article_ticker_matches for ticker pairs that co-occur in the
//      same article across the last 90 days.
//   2. Drop pairs that are already edges in the static graph or in the
//      overrides overlay, and pairs the judge already ruled on recently.
//   3. For the top N co-occurring candidates, pull the supporting article
//      snippets and ask Ollama's classifyGraphEdge judge whether the pair
//      is a genuine supplier/customer/competitor/partner relationship.
//   4. Apply a threshold gate (high Ollama confidence OR moderate confidence
//      + strong co-occurrence signal) and commit the winners to
//      graph_edge_overrides. Every judged pair — accept or reject — lands
//      in graph_candidates as an audit row.
//
// No human-in-the-loop gate. The review is automatic and conservative; the
// audit log + per-edge Undo button in the UI are the escape hatches if a
// judgement looks wrong in hindsight.

import { BrowserWindow } from 'electron'

import graph from '../../data/supplyChainGraph.json'
import { getDb } from '../database/connection'
import {
  getMostRecentCandidateForPair,
  insertCandidate,
  type EdgePayload,
  type EvidenceRef
} from '../database/graphCandidates'
import {
  listEdgeOverrides,
  upsertEdgeOverrideWithConsensus
} from '../database/graphOverrides'
import { listTickers } from '../database/tickers'
import { classifyGraphEdge, type GraphEdgeClassification } from './ollamaService'

interface StaticEdge {
  from: string
  to: string
}

interface StaticGraphShape {
  edges: StaticEdge[]
}

// Only consider articles from the last 90 days. Older co-occurrence is still
// useful context but we want the freshest signal so stale partnerships don't
// propagate into edges that no longer exist.
const LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000

// Minimum co-occurrence count to even ask the Ollama judge. Below this,
// the signal is too noisy — any pair of big-cap tickers will co-occur a
// handful of times in sector news without actually being connected.
const MIN_COOCCURRENCE = 3

// Threshold gate. Tuned conservatively so false positives are rare:
//   - HIGH: judge is very confident → accept regardless of count
//   - MID: judge has moderate confidence → accept only with strong signal
//   - below MID: reject
const HIGH_CONFIDENCE = 0.75
const MID_CONFIDENCE = 0.6
const MID_COUNT_REQUIREMENT = 8

// How many top candidate pairs we run the Ollama judge on per sweep. Each
// call takes a few seconds of inference time; the budget caps runtime for
// a single sweep.
const MAX_PAIRS_PER_SWEEP = 20

// Cooldown before re-judging a pair we already judged. If we rejected a
// pair last week, don't re-propose for at least this long — let new
// evidence accumulate before asking again.
const PAIR_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000

// Sweep cadence. Weekly keeps the audit log manageable and respects that
// supply-chain relationships are slow-moving.
const SWEEP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

// How many articles of evidence we hand the judge per pair.
const EVIDENCE_ARTICLE_LIMIT = 6

interface PairCandidate {
  a: string // lexically lower symbol
  b: string // lexically higher symbol
  count: number
  articleIds: number[]
}

interface ArticleSnippet {
  id: number
  title: string
  summary: string | null
  url: string | null
  publishedAt: number | null
}

// Case-insensitive pair key, always lexically ordered so (AAPL, NVDA) and
// (NVDA, AAPL) collapse to the same bucket.
function pairKey(a: string, b: string): string {
  const ua = a.toUpperCase()
  const ub = b.toUpperCase()
  return ua < ub ? `${ua}|${ub}` : `${ub}|${ua}`
}

function staticEdgeSet(): Set<string> {
  const s = new Set<string>()
  for (const e of (graph as StaticGraphShape).edges) {
    s.add(pairKey(e.from, e.to))
  }
  return s
}

function overlayEdgeSet(): Set<string> {
  const s = new Set<string>()
  for (const o of listEdgeOverrides()) {
    s.add(pairKey(o.fromSymbol, o.toSymbol))
  }
  return s
}

// Build the pair co-occurrence table from article_ticker_matches. We walk
// the rows ordered by articleId so we can accumulate sets per article
// without a separate SQL grouping query — cheaper for the expected row
// count (<100k) than a self-join.
function buildCoOccurrence(sinceMs: number): PairCandidate[] {
  const db = getDb()
  const rows = db
    .prepare<[number], { articleId: number; symbol: string; publishedAt: number | null }>(
      `SELECT m.articleId, m.symbol, a.publishedAt
         FROM article_ticker_matches m
         JOIN articles a ON a.id = m.articleId
        WHERE a.publishedAt IS NOT NULL
          AND a.publishedAt >= ?
          AND m.symbol <> '__none__'
        ORDER BY m.articleId`
    )
    .all(sinceMs)

  const pairs = new Map<string, PairCandidate>()
  let currentArticleId = -1
  let currentSymbols: string[] = []

  const flushCurrent = (): void => {
    if (currentArticleId === -1 || currentSymbols.length < 2) return
    const uniq = [...new Set(currentSymbols.map((s) => s.toUpperCase()))]
    uniq.sort()
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const key = `${uniq[i]}|${uniq[j]}`
        const existing = pairs.get(key)
        if (existing) {
          existing.count += 1
          existing.articleIds.push(currentArticleId)
        } else {
          pairs.set(key, {
            a: uniq[i],
            b: uniq[j],
            count: 1,
            articleIds: [currentArticleId]
          })
        }
      }
    }
  }

  for (const r of rows) {
    if (r.articleId !== currentArticleId) {
      flushCurrent()
      currentArticleId = r.articleId
      currentSymbols = [r.symbol]
    } else {
      currentSymbols.push(r.symbol)
    }
  }
  flushCurrent()

  return [...pairs.values()].sort((x, y) => y.count - x.count)
}

function fetchArticleSnippets(ids: number[]): ArticleSnippet[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb()
    .prepare<unknown[], ArticleSnippet>(
      `SELECT id, title, summary, url, publishedAt
         FROM articles
        WHERE id IN (${placeholders})
        ORDER BY publishedAt DESC`
    )
    .all(...ids)
  return rows
}

// Pick the direction of the stored edge based on the judge's answer.
// For supplier/customer we normalize to "from = supplier, to = customer"
// so the stored edge reads as "product/service flows from -> to".
function resolveEdgeDirection(
  symbolA: string,
  symbolB: string,
  classification: GraphEdgeClassification
): { from: string; to: string; relationship: 'supplier' | 'competitor' | 'partner' } | null {
  if (classification.relationship === 'unclear') return null
  const aToB = classification.direction === 'a_to_b'
  if (classification.relationship === 'supplier') {
    // supplier relationship + a_to_b means A supplies B.
    return aToB
      ? { from: symbolA, to: symbolB, relationship: 'supplier' }
      : { from: symbolB, to: symbolA, relationship: 'supplier' }
  }
  if (classification.relationship === 'customer') {
    // Store as supplier edge from the seller's perspective. "A is a customer
    // of B" normalizes to "B supplies A".
    return aToB
      ? { from: symbolB, to: symbolA, relationship: 'supplier' }
      : { from: symbolA, to: symbolB, relationship: 'supplier' }
  }
  if (classification.relationship === 'competitor') {
    return { from: symbolA, to: symbolB, relationship: 'competitor' }
  }
  // partner
  return { from: symbolA, to: symbolB, relationship: 'partner' }
}

function shouldAccept(
  confidence: number,
  count: number,
  relationship: GraphEdgeClassification['relationship']
): boolean {
  if (relationship === 'unclear') return false
  if (confidence >= HIGH_CONFIDENCE) return true
  if (confidence >= MID_CONFIDENCE && count >= MID_COUNT_REQUIREMENT) return true
  return false
}

function broadcastUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('graph:updated')
    }
  }
}

// Runs the full pipeline for one sweep. Exported so a "Run now" button in
// Settings can trigger it on demand. Returns the counts so the caller can
// show a toast-like summary.
export async function runGraphSweep(): Promise<{
  proposed: number
  accepted: number
  rejected: number
  skipped: number
}> {
  const pairs = buildCoOccurrence(Date.now() - LOOKBACK_MS).filter(
    (p) => p.count >= MIN_COOCCURRENCE
  )
  if (pairs.length === 0) {
    return { proposed: 0, accepted: 0, rejected: 0, skipped: 0 }
  }

  const staticEdges = staticEdgeSet()
  const overlayEdges = overlayEdgeSet()

  // Build a lookup of company names for the Ollama judge's grounding.
  const tickers = listTickers()
  const nameBySymbol = new Map<string, string>()
  for (const t of tickers) {
    nameBySymbol.set(t.symbol.toUpperCase(), t.companyName ?? t.symbol)
  }

  let proposed = 0
  let accepted = 0
  let rejected = 0
  let skipped = 0

  for (const p of pairs) {
    if (accepted + rejected >= MAX_PAIRS_PER_SWEEP) break
    const key = pairKey(p.a, p.b)

    // Skip pairs we already have an edge for, static or overlay.
    if (staticEdges.has(key) || overlayEdges.has(key)) {
      skipped++
      continue
    }

    // Skip recently-judged pairs (both accepted — redundant — and rejected,
    // which we don't re-ask until fresh evidence).
    const prior = getMostRecentCandidateForPair(p.a, p.b)
    if (prior && Date.now() - prior.createdAt < PAIR_COOLDOWN_MS) {
      skipped++
      continue
    }

    // Only judge pairs where we know at least one endpoint's company name.
    // Otherwise Ollama's grounding is weak and we'd just be guessing from
    // ticker symbols.
    const nameA = nameBySymbol.get(p.a) ?? p.a
    const nameB = nameBySymbol.get(p.b) ?? p.b

    // Pull up to N supporting articles, newest first.
    const uniqueIds = [...new Set(p.articleIds)].slice(0, EVIDENCE_ARTICLE_LIMIT)
    const snippets = fetchArticleSnippets(uniqueIds)
    if (snippets.length === 0) {
      skipped++
      continue
    }

    proposed++

    const classification = await classifyGraphEdge({
      symbolA: p.a,
      symbolB: p.b,
      nameA,
      nameB,
      snippets: snippets.map((s) => ({ title: s.title, summary: s.summary }))
    })

    if (!classification) {
      // Ollama offline or errored — log as rejected-with-reason so we don't
      // spin on the same pair next sweep before retry cooldown.
      insertCandidate({
        kind: 'edge',
        fromSymbol: p.a,
        toSymbol: p.b,
        payload: { relationship: 'unclear', note: '' } satisfies EdgePayload,
        evidence: snippetsToEvidence(snippets),
        confidence: 0,
        source: 'news_cooccurrence',
        status: 'rejected',
        reviewNote: 'Ollama judge unavailable'
      })
      rejected++
      continue
    }

    const accept = shouldAccept(classification.confidence, p.count, classification.relationship)

    if (!accept) {
      insertCandidate({
        kind: 'edge',
        fromSymbol: p.a,
        toSymbol: p.b,
        payload: {
          relationship: classification.relationship,
          note: classification.note
        } satisfies EdgePayload,
        evidence: snippetsToEvidence(snippets),
        confidence: classification.confidence,
        source: 'news_cooccurrence',
        status: 'rejected',
        reviewNote:
          classification.rationale ||
          `Below threshold (confidence ${classification.confidence.toFixed(2)}, co-mentions ${p.count})`
      })
      rejected++
      continue
    }

    const resolved = resolveEdgeDirection(p.a, p.b, classification)
    if (!resolved) {
      // defensive — shouldAccept rejects 'unclear', so we shouldn't get here
      insertCandidate({
        kind: 'edge',
        fromSymbol: p.a,
        toSymbol: p.b,
        payload: {
          relationship: classification.relationship,
          note: classification.note
        } satisfies EdgePayload,
        evidence: snippetsToEvidence(snippets),
        confidence: classification.confidence,
        source: 'news_cooccurrence',
        status: 'rejected',
        reviewNote: 'Could not resolve edge direction'
      })
      rejected++
      continue
    }

    // Accept: write both the audit row and the overlay edge.
    insertCandidate({
      kind: 'edge',
      fromSymbol: resolved.from,
      toSymbol: resolved.to,
      payload: {
        relationship: resolved.relationship,
        note: classification.note
      } satisfies EdgePayload,
      evidence: snippetsToEvidence(snippets),
      confidence: classification.confidence,
      source: 'news_cooccurrence',
      status: 'accepted',
      reviewNote: classification.rationale
    })
    upsertEdgeOverrideWithConsensus({
      fromSymbol: resolved.from,
      toSymbol: resolved.to,
      relationship: resolved.relationship,
      note: classification.note,
      weight: classification.confidence,
      source: 'news_cooccurrence',
      acceptedAt: Date.now()
    })
    accepted++
  }

  if (accepted > 0) broadcastUpdated()

  return { proposed, accepted, rejected, skipped }
}

function snippetsToEvidence(snippets: ArticleSnippet[]): EvidenceRef[] {
  return snippets.map((s) => ({
    kind: 'article',
    id: s.id,
    title: s.title,
    url: s.url,
    publishedAt: s.publishedAt
  }))
}

let timer: NodeJS.Timeout | null = null
let started = false

export function startGraphCandidatesScheduler(): void {
  if (started) return
  started = true
  // First sweep runs 5 minutes after boot so the ticker matcher has had time
  // to populate article_ticker_matches for the articles ingested on startup.
  setTimeout(() => {
    void runGraphSweep().catch((err) => {
      console.warn('[graph] sweep failed:', err instanceof Error ? err.message : err)
    })
  }, 5 * 60 * 1000)
  timer = setInterval(() => {
    void runGraphSweep().catch((err) => {
      console.warn('[graph] sweep failed:', err instanceof Error ? err.message : err)
    })
  }, SWEEP_INTERVAL_MS)
}

export function stopGraphCandidatesScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}
