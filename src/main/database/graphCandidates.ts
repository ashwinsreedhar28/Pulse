// Audit log of graph-mutation proposals. Every candidate that a source
// pipeline (news co-occurrence, 10-K concentration, etc.) generates lands
// here with its final auto-decision — `accepted` rows also get a companion
// row in graph_edge_overrides; `rejected` rows stay in the log so the
// user can see what was filtered and why.

import { getDb } from './connection'

export type GraphCandidateKind = 'edge' | 'node' | 'sector_move' | 'note_refresh'
export type GraphCandidateStatus = 'pending' | 'accepted' | 'rejected'

export interface EdgePayload {
  // 'unclear' is valid for rejected rows in the audit log (the judge saw
  // the pair but didn't find a concrete relationship). Accepted rows will
  // only ever carry one of the committed types below.
  relationship: 'supplier' | 'customer' | 'competitor' | 'partner' | 'unclear'
  note: string
}

export interface EvidenceRef {
  kind: 'article' | 'filing'
  id: number | string
  title: string
  url: string | null
  publishedAt: number | null
}

export interface GraphCandidate {
  id: number
  kind: GraphCandidateKind
  fromSymbol: string | null
  toSymbol: string | null
  symbol: string | null
  payload: EdgePayload | Record<string, unknown>
  evidence: EvidenceRef[]
  confidence: number
  source: string
  status: GraphCandidateStatus
  createdAt: number
  reviewedAt: number | null
  reviewNote: string | null
}

interface RawRow {
  id: number
  kind: string
  fromSymbol: string | null
  toSymbol: string | null
  symbol: string | null
  payloadJson: string
  evidenceJson: string | null
  confidence: number
  source: string
  status: string
  createdAt: number
  reviewedAt: number | null
  reviewNote: string | null
}

function hydrate(row: RawRow): GraphCandidate {
  let payload: EdgePayload | Record<string, unknown> = {}
  try {
    payload = JSON.parse(row.payloadJson) as EdgePayload
  } catch {
    payload = {}
  }
  let evidence: EvidenceRef[] = []
  if (row.evidenceJson) {
    try {
      const parsed = JSON.parse(row.evidenceJson)
      if (Array.isArray(parsed)) evidence = parsed as EvidenceRef[]
    } catch {
      evidence = []
    }
  }
  return {
    id: row.id,
    kind: row.kind as GraphCandidateKind,
    fromSymbol: row.fromSymbol,
    toSymbol: row.toSymbol,
    symbol: row.symbol,
    payload,
    evidence,
    confidence: row.confidence,
    source: row.source,
    status: row.status as GraphCandidateStatus,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote
  }
}

export interface InsertCandidateInput {
  kind: GraphCandidateKind
  fromSymbol?: string | null
  toSymbol?: string | null
  symbol?: string | null
  payload: EdgePayload | Record<string, unknown>
  evidence: EvidenceRef[]
  confidence: number
  source: string
  status: GraphCandidateStatus
  reviewNote?: string | null
}

export function insertCandidate(input: InsertCandidateInput): number {
  const now = Date.now()
  const info = getDb()
    .prepare(
      `INSERT INTO graph_candidates
         (kind, fromSymbol, toSymbol, symbol, payloadJson, evidenceJson,
          confidence, source, status, createdAt, reviewedAt, reviewNote)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.kind,
      input.fromSymbol ?? null,
      input.toSymbol ?? null,
      input.symbol ?? null,
      JSON.stringify(input.payload),
      input.evidence.length > 0 ? JSON.stringify(input.evidence) : null,
      input.confidence,
      input.source,
      input.status,
      now,
      input.status === 'pending' ? null : now,
      input.reviewNote ?? null
    )
  return Number(info.lastInsertRowid)
}

export function listCandidates(
  opts: { status?: GraphCandidateStatus; limit?: number } = {}
): GraphCandidate[] {
  const limit = opts.limit ?? 50
  const rows = opts.status
    ? getDb()
        .prepare<[string, number], RawRow>(
          `SELECT * FROM graph_candidates WHERE status = ? ORDER BY createdAt DESC LIMIT ?`
        )
        .all(opts.status, limit)
    : getDb()
        .prepare<[number], RawRow>(
          `SELECT * FROM graph_candidates ORDER BY createdAt DESC LIMIT ?`
        )
        .all(limit)
  return rows.map(hydrate)
}

// Pair-level lookup so the generator can skip re-proposing a pair that was
// already judged (accepted or rejected) within a recency window.
export function getMostRecentCandidateForPair(
  fromSymbol: string,
  toSymbol: string
): GraphCandidate | null {
  const row = getDb()
    .prepare<[string, string], RawRow>(
      `SELECT * FROM graph_candidates
        WHERE fromSymbol = ? AND toSymbol = ?
        ORDER BY createdAt DESC LIMIT 1`
    )
    .get(fromSymbol.toUpperCase(), toSymbol.toUpperCase())
  return row ? hydrate(row) : null
}

// Called from the Undo path: flips an accepted audit row to rejected so
// the source generator skips re-proposing the same pair next sweep.
export function markCandidateRejected(id: number, note: string): void {
  getDb()
    .prepare(
      `UPDATE graph_candidates
          SET status = 'rejected',
              reviewedAt = ?,
              reviewNote = ?
        WHERE id = ?`
    )
    .run(Date.now(), note, id)
}

export function countCandidatesSince(since: number): {
  accepted: number
  rejected: number
} {
  const rows = getDb()
    .prepare<[number], { status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM graph_candidates
        WHERE createdAt >= ? GROUP BY status`
    )
    .all(since)
  const out = { accepted: 0, rejected: 0 }
  for (const r of rows) {
    if (r.status === 'accepted') out.accepted = r.n
    else if (r.status === 'rejected') out.rejected = r.n
  }
  return out
}
