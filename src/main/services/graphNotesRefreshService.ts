// Rolling-note refresh for the value-chain overlay. Existing edges carry a
// note that was accurate when the pipeline auto-committed them; months
// later the supporting articles have rotated out and the note may describe
// a deal that has shifted. This service:
//
//   1. Iterates graph_edge_overrides older than N days.
//   2. Finds fresh articles mentioning both symbols (uses the same
//      article_ticker_matches index that the news co-occurrence source reads).
//   3. Asks the classifyGraphEdge judge whether the relationship still
//      reads the same way with the updated evidence.
//   4. When the relationship still matches and a newer note is available,
//      updates the override row's note + bumps acceptedAt so it falls out
//      of the stale queue for another refresh window.
//
// Every decision — refreshed, skipped-insufficient-evidence, skipped-
// relationship-changed — lands in graph_candidates as kind='note_refresh'
// so the audit log stays honest.

import { BrowserWindow } from 'electron'

import { getDb } from '../database/connection'
import {
  insertCandidate,
  type EvidenceRef
} from '../database/graphCandidates'
import {
  listEdgeOverrides,
  upsertEdgeOverride,
  type GraphEdgeOverride
} from '../database/graphOverrides'
import { listTickers } from '../database/tickers'
import {
  classifyGraphEdge,
  type GraphEdgeRelationship
} from './ollamaService'

// Edges older than this are eligible for refresh. 60 days is short enough
// to catch material changes before users read stale notes but long enough
// that we're not churning the same edges repeatedly.
const STALE_MS = 60 * 24 * 60 * 60 * 1000

// Per-sweep cap. Ollama calls are the constraint here; each refresh is one
// classifyGraphEdge round trip. 10 per sweep bounds the weekly runtime.
const MAX_PER_SWEEP = 10

// How many supporting articles to feed the judge. Matches the co-occurrence
// source so the classifier gets consistent-volume evidence either way.
const EVIDENCE_LIMIT = 6

// Only refresh when we have enough fresh evidence to actually inform an
// updated note. Below this, the classifier would just regurgitate the
// existing note — not worth the call.
const MIN_FRESH_ARTICLES = 3

// Articles newer than this are considered "fresh" — the signal the refresh
// relies on.
const EVIDENCE_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000

// Sweep cadence. Once a month is plenty for slow-moving supply-chain notes.
const SWEEP_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

interface ArticleRow {
  id: number
  title: string
  summary: string | null
  url: string | null
  publishedAt: number | null
}

function findArticlesMentioningBoth(
  symbolA: string,
  symbolB: string,
  sinceMs: number
): ArticleRow[] {
  return getDb()
    .prepare<[number, string, string, number], ArticleRow>(
      `SELECT a.id, a.title, a.summary, a.url, a.publishedAt
         FROM articles a
        WHERE a.publishedAt IS NOT NULL
          AND a.publishedAt >= ?
          AND EXISTS (
            SELECT 1 FROM article_ticker_matches m
             WHERE m.articleId = a.id AND m.symbol = ?
          )
          AND EXISTS (
            SELECT 1 FROM article_ticker_matches m
             WHERE m.articleId = a.id AND m.symbol = ?
          )
        ORDER BY a.publishedAt DESC
        LIMIT ?`
    )
    .all(sinceMs, symbolA.toUpperCase(), symbolB.toUpperCase(), EVIDENCE_LIMIT)
}

// Relationships match if they describe the same shape: the overlay stores
// "supplier" for both supplier and customer (customer is supplier reversed),
// so supplier-vs-supplier is an agreement. Competitor stays as-is; partner
// matches partner.
function relationshipMatches(
  stored: string,
  classified: GraphEdgeRelationship
): boolean {
  if (stored === 'supplier')
    return classified === 'supplier' || classified === 'customer'
  return stored === classified
}

function broadcastUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('graph:updated')
    }
  }
}

export async function runNoteRefresh(): Promise<{
  refreshed: number
  skipped: number
  disagreed: number
}> {
  const now = Date.now()
  const staleCutoff = now - STALE_MS
  const candidates = listEdgeOverrides().filter((o) => o.acceptedAt < staleCutoff)
  if (candidates.length === 0) return { refreshed: 0, skipped: 0, disagreed: 0 }

  const nameBySymbol = new Map<string, string>()
  for (const t of listTickers()) {
    nameBySymbol.set(t.symbol.toUpperCase(), t.companyName ?? t.symbol)
  }

  let refreshed = 0
  let skipped = 0
  let disagreed = 0
  let done = 0

  // Oldest edges first so we drain the staleness debt uniformly across
  // successive sweeps.
  const queue = [...candidates].sort((a, b) => a.acceptedAt - b.acceptedAt)

  for (const edge of queue) {
    if (done >= MAX_PER_SWEEP) break
    done++

    const articles = findArticlesMentioningBoth(
      edge.fromSymbol,
      edge.toSymbol,
      now - EVIDENCE_LOOKBACK_MS
    )
    if (articles.length < MIN_FRESH_ARTICLES) {
      insertCandidate({
        kind: 'note_refresh',
        fromSymbol: edge.fromSymbol,
        toSymbol: edge.toSymbol,
        payload: { relationship: edge.relationship, note: edge.note ?? '' },
        evidence: articles.map(articleToEvidence),
        confidence: 0,
        source: `refresh:${edge.source}`,
        status: 'rejected',
        reviewNote: `Insufficient fresh evidence (${articles.length} article${articles.length === 1 ? '' : 's'})`
      })
      skipped++
      continue
    }

    const nameA = nameBySymbol.get(edge.fromSymbol) ?? edge.fromSymbol
    const nameB = nameBySymbol.get(edge.toSymbol) ?? edge.toSymbol
    const classification = await classifyGraphEdge({
      symbolA: edge.fromSymbol,
      symbolB: edge.toSymbol,
      nameA,
      nameB,
      snippets: articles.map((a) => ({ title: a.title, summary: a.summary }))
    })

    if (!classification || classification.relationship === 'unclear') {
      insertCandidate({
        kind: 'note_refresh',
        fromSymbol: edge.fromSymbol,
        toSymbol: edge.toSymbol,
        payload: { relationship: edge.relationship, note: edge.note ?? '' },
        evidence: articles.map(articleToEvidence),
        confidence: classification?.confidence ?? 0,
        source: `refresh:${edge.source}`,
        status: 'rejected',
        reviewNote: classification
          ? classification.rationale || 'Judge returned unclear on refresh'
          : 'Ollama judge unavailable'
      })
      skipped++
      continue
    }

    if (!relationshipMatches(edge.relationship, classification.relationship)) {
      // The classifier now reads the relationship differently. We don't
      // overwrite — a flip could be noise — but we log it loudly so the
      // user can spot-check. The original edge stays as-is.
      insertCandidate({
        kind: 'note_refresh',
        fromSymbol: edge.fromSymbol,
        toSymbol: edge.toSymbol,
        payload: {
          relationship: classification.relationship,
          note: classification.note
        },
        evidence: articles.map(articleToEvidence),
        confidence: classification.confidence,
        source: `refresh:${edge.source}`,
        status: 'rejected',
        reviewNote: `Refresh found different relationship (${classification.relationship}); kept existing edge`
      })
      disagreed++
      continue
    }

    // Relationship holds. If the note actually changed and the classifier is
    // confident enough, update the edge. If the classifier just re-proposed
    // the existing note, bump acceptedAt without churning the row's content.
    const newNote = classification.note.trim()
    const noteChanged = !!newNote && newNote !== (edge.note ?? '')
    const shouldUpdate = noteChanged && classification.confidence >= 0.6

    upsertEdgeOverride({
      ...edge,
      note: shouldUpdate ? newNote : edge.note,
      weight: shouldUpdate ? Math.max(edge.weight ?? 0, classification.confidence) : edge.weight,
      acceptedAt: now
    })

    insertCandidate({
      kind: 'note_refresh',
      fromSymbol: edge.fromSymbol,
      toSymbol: edge.toSymbol,
      payload: {
        relationship: edge.relationship,
        note: shouldUpdate ? newNote : edge.note ?? ''
      },
      evidence: articles.map(articleToEvidence),
      confidence: classification.confidence,
      source: `refresh:${edge.source}`,
      status: 'accepted',
      reviewNote: shouldUpdate
        ? `Note refreshed from fresh evidence (${articles.length} articles)`
        : `Relationship reconfirmed; note unchanged (${articles.length} articles)`
    })
    refreshed++
  }

  if (refreshed > 0) broadcastUpdated()
  return { refreshed, skipped, disagreed }
}

function articleToEvidence(a: ArticleRow): EvidenceRef {
  return {
    kind: 'article',
    id: a.id,
    title: a.title,
    url: a.url,
    publishedAt: a.publishedAt
  }
}

let timer: NodeJS.Timeout | null = null
let started = false

export function startGraphNotesRefreshScheduler(): void {
  if (started) return
  started = true
  // First refresh runs 15 minutes after boot so the other graph schedulers
  // have had time to populate before we start grinding through their output.
  setTimeout(() => {
    void runNoteRefresh().catch((err) => {
      console.warn(
        '[graph-notes] refresh failed:',
        err instanceof Error ? err.message : err
      )
    })
  }, 15 * 60 * 1000)
  timer = setInterval(() => {
    void runNoteRefresh().catch((err) => {
      console.warn(
        '[graph-notes] refresh failed:',
        err instanceof Error ? err.message : err
      )
    })
  }, SWEEP_INTERVAL_MS)
}

export function stopGraphNotesRefreshScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}

// Exposed for a potential "Run notes refresh now" button. Not wired to the
// UI yet — it's a low-value manual trigger compared to news/10-K scans.
export async function runNoteRefreshNow(): Promise<{
  refreshed: number
  skipped: number
  disagreed: number
}> {
  return runNoteRefresh()
}

// Re-export so the types line up with the overrides we're mutating.
export type { GraphEdgeOverride }
