// Per-paper generated value chain — research analog to company_value_chains.
// Each row stores a complete self-contained subgraph (its own stages,
// nodes, edges) keyed by focus paperId. Mirrors the company chain shape
// closely on purpose; once both feature shapes stabilize, a future phase
// can hoist common code into a shared module. Until then, intentional
// duplication keeps each chain feature evolvable independently.

import { getDb } from './connection'

export type PaperValueChainStatus = 'pending' | 'ready' | 'error'

// Stages are FIXED for paper chains (Phase 3A spec). The model never
// proposes them — they're a stable taxonomy across every focus paper so
// a user can compare two chains side-by-side without translating labels.
// Replications/Refutations is shipped empty in 3A; populated in 3D.
export interface PaperValueChainStage {
  id: string
  label: string
  // Position along the time axis. Diagram lays stages out left-to-right
  // by this index — Upstream-* before Focal before Downstream-*.
  order: number
  // Vertical bucket within the column. 'upstream' / 'focal' / 'downstream'
  // — the diagram uses this to tint stage headers consistently regardless
  // of which papers populated them on a given chain.
  band: 'upstream' | 'focal' | 'downstream'
}

export interface PaperValueChainNode {
  // S2 paperId when resolvable; synthetic stable id (e.g. 'unverified:<hash>')
  // when the citation text named a paper S2 didn't return.
  paperId: string
  stage: string
  title: string
  // First-author + year, e.g. "Vaswani 2017". Pre-formatted at write
  // time so the renderer doesn't redo it on every paint.
  authorYearLabel: string
  abstract: string | null
  year: number | null
  citationCount: number
  influentialCitationCount: number
  url: string | null
  pdfUrl: string | null
  // 'paper' when resolved to an S2 paperId; 'unverified' when the
  // citation text couldn't be resolved (still rendered, flagged so users
  // know it's a textual reference, not a grounded paper).
  kind: 'paper' | 'unverified'
}

// Provenance for an edge claim. Confidence ordering (high → low):
//   bilateral > haiku-pdf > s2-influential > s2-intent > model
// 3A produces only s2-influential and s2-intent. The other kinds are
// declared in the type union now so 3B/3C/3D can fill them in without a
// migration or shape break.
export type PaperValueChainEdgeCitation =
  | {
      // S2 marked the edge `isInfluential` AND tagged a foundational
      // intent (background / methodology / extension). Highest-quality
      // signal we have without reading the PDF.
      kind: 's2-influential'
      intent: 'background' | 'methodology' | 'extension' | 'result' | 'comparison'
      // S2 paperId of the OTHER endpoint (the one being cited or citing).
      // Lets the renderer link to the S2 paper page for cross-reference.
      otherPaperId: string
    }
  | {
      // S2 tagged the citation with an intent but didn't flag it
      // influential. Weaker than s2-influential but still grounded in
      // S2's data, not the model.
      kind: 's2-intent'
      intent: 'background' | 'methodology' | 'extension' | 'result' | 'comparison'
      otherPaperId: string
    }
  | {
      // Phase 3C — bilateral reinforcement. Direct analog of the stock
      // chain's "this edge appears in both 10-Ks" upgrade. Strict
      // citation reciprocity is rare in papers (papers can't normally
      // cite each other unless one is a preprint update), so we use
      // "vibe-bilateral" — three rules in priority order:
      //   - mutual-cite: counterpart's S2 reference list contains focal
      //     (rare; only when focal predates counterpart).
      //   - forward-reference: counterpart's intro mentions a future-
      //     work / open-question phrase AND token-overlaps with focal
      //     (Jaccard ≥ 0.3 on content tokens).
      //   - framing-alignment: counterpart's "we present / propose"
      //     sentence overlaps focal's quoted sentence (Jaccard ≥ 0.4).
      //
      // The bilateral entry carries TWO leaf citations — one from the
      // focal paper, one from the counterpart — so the renderer can
      // produce a doubled pill (mirrors the stock UnifiedValueChainCard
      // double-citation UX where both 10-Ks are linked). counterpart
      // side is null for mutual-cite (S2 record only, no quoted text).
      kind: 'bilateral'
      matchReason: 'mutual-cite' | 'forward-reference' | 'framing-alignment'
      // Snapshot of the focal-side anchor citation that triggered the
      // bilateral check. Restricted to paper-pdf or s2-influential —
      // s2-intent / model edges don't qualify for bilateral upgrade
      // per the provenance threshold.
      focalCitation:
        | Extract<PaperValueChainEdgeCitation, { kind: 'paper-pdf' }>
        | Extract<PaperValueChainEdgeCitation, { kind: 's2-influential' }>
      // Counterpart-side evidence. paper-pdf shape (paperId points at
      // the counterpart, otherPaperId at the focal) for forward-
      // reference / framing-alignment. Null for mutual-cite, since
      // that rule fires from S2 metadata only — no PDF reading on the
      // counterpart side.
      counterpartCitation: Extract<
        PaperValueChainEdgeCitation,
        { kind: 'paper-pdf' }
      > | null
      // Trigger phrase / sentence prefix that fired the rule. Useful
      // for hover tooltips so the user sees WHY the bilateral upgrade
      // applied — e.g. "future work" for forward-reference, the
      // counterpart's "We propose…" prefix for framing-alignment.
      // Null for mutual-cite (no extracted phrase).
      trigger: string | null
    }
  | {
      // Claude (Haiku) read the focal paper's intro/related-works and
      // confirmed the citation. Populated in Phase 3C.
      kind: 'haiku-pdf'
      excerpt: string // <=240 chars; pre-trimmed at write time
      otherPaperId: string
    }
  | {
      // Phase 3B — Haiku read the focal paper's intro and quoted a
      // sentence that grounds this edge. `paperId` is the focal paper
      // (the document the quote came from); `pageOffset` is the
      // 1-indexed PDF page where the sentence lives so the renderer can
      // deep-link via `#page=N`. `charOffset` is reserved for a future
      // pdfjs-rendered viewer that supports text-position highlighting;
      // 3B's Chromium PDF viewer can only honor #page=N.
      kind: 'paper-pdf'
      paperId: string
      otherPaperId: string
      quotedSentence: string // <=240 chars; pre-trimmed at write time
      pageOffset: number
      charOffset: number
    }
  | {
      // No grounded source — the model's free-text attribution. Carries
      // the lowest confidence; renderer can render dimmed.
      kind: 'model'
      attribution?: string
    }

// Six normalized relationships, mapped from S2 intents at chain-build
// time. Renderer styles them per-relationship (e.g. amber for builds-on,
// red for refutes). Unrecognized intents → fallback to 'extends' so we
// never drop edges silently.
export type PaperValueChainRelationship =
  | 'builds-on'
  | 'uses-method'
  | 'extends'
  | 'contrasts'
  | 'replicates'
  | 'refutes'

export interface PaperValueChainEdge {
  // paperId of either endpoint. For Phase 3A every edge has the focal
  // paper at one end (chain is a star around the focal paper). 3E will
  // generalize to non-focal-incident edges.
  from: string
  to: string
  relationship: PaperValueChainRelationship
  note: string | null
  // Multi-citation array. Each entry is one piece of provenance for
  // this edge; multiple citations stack on the same edge ("S2 says
  // background AND Haiku confirmed in intro" = stronger signal).
  citations: PaperValueChainEdgeCitation[]
}

export interface PaperValueChain {
  focusPaperId: string
  // The focal paper's first-author-year label, kept on the chain for
  // header rendering without a separate paper lookup.
  focusLabel: string
  stages: PaperValueChainStage[]
  nodes: PaperValueChainNode[]
  edges: PaperValueChainEdge[]
  // Total S2 calls used to generate this chain. Surfaced in the UI
  // header for transparency about cost; also used by tests to verify
  // the ≤40 call budget acceptance criterion.
  s2CallsUsed: number
}

export interface PaperValueChainRow {
  focusPaperId: string
  status: PaperValueChainStatus
  graph: PaperValueChain | null
  generatedAt: number | null
  updatedAt: number
}

interface RawRow {
  focusPaperId: string
  status: string
  graphJson: string | null
  generatedAt: number | null
  updatedAt: number
}

function hydrate(row: RawRow): PaperValueChainRow {
  let graph: PaperValueChain | null = null
  if (row.graphJson) {
    try {
      graph = JSON.parse(row.graphJson) as PaperValueChain
    } catch {
      graph = null
    }
  }
  return {
    focusPaperId: row.focusPaperId,
    status: (row.status as PaperValueChainStatus) ?? 'error',
    graph,
    generatedAt: row.generatedAt,
    updatedAt: row.updatedAt
  }
}

export function setPaperValueChain(input: {
  focusPaperId: string
  status: PaperValueChainStatus
  graph: PaperValueChain | null
}): void {
  const now = Date.now()
  const focus = input.focusPaperId.trim()
  if (!focus) throw new Error('setPaperValueChain: empty focusPaperId')
  const db = getDb()
  // One transaction so the chain row + denormalized edges table stay
  // consistent. Crash mid-write leaves both pre- or post-state.
  db.transaction(() => {
    db.prepare(
      `INSERT INTO paper_value_chains
         (focusPaperId, status, graphJson, generatedAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(focusPaperId) DO UPDATE SET
         status = excluded.status,
         graphJson = excluded.graphJson,
         generatedAt = excluded.generatedAt,
         updatedAt = excluded.updatedAt`
    ).run(
      focus,
      input.status,
      input.graph ? JSON.stringify(input.graph) : null,
      input.graph ? now : null,
      now
    )

    db.prepare(`DELETE FROM paper_value_chain_edges WHERE sourceFocusPaperId = ?`).run(focus)
    if (input.graph?.edges?.length) {
      const insert = db.prepare(
        `INSERT OR IGNORE INTO paper_value_chain_edges
           (sourceFocusPaperId, fromPaperId, toPaperId, relationship)
         VALUES (?, ?, ?, ?)`
      )
      for (const e of input.graph.edges) {
        insert.run(focus, e.from, e.to, e.relationship)
      }
    }
  })()
}

export function getPaperValueChain(focusPaperId: string): PaperValueChainRow | null {
  const row = getDb()
    .prepare<[string], RawRow>(
      `SELECT focusPaperId, status, graphJson, generatedAt, updatedAt
         FROM paper_value_chains
        WHERE focusPaperId = ?`
    )
    .get(focusPaperId.trim())
  return row ? hydrate(row) : null
}

export function deletePaperValueChain(focusPaperId: string): void {
  const focus = focusPaperId.trim()
  const db = getDb()
  db.transaction(() => {
    db.prepare(`DELETE FROM paper_value_chains WHERE focusPaperId = ?`).run(focus)
    // CASCADE handles the edges table, but be explicit so this works
    // even if foreign-key enforcement is off in some test path.
    db.prepare(`DELETE FROM paper_value_chain_edges WHERE sourceFocusPaperId = ?`).run(focus)
  })()
}

// Cross-chain mention lookup — returns paper-chain edges from OTHER
// chains that touch the given paperId on either endpoint. Not consumed
// by 3A's UI but exposed now so 3E (Universe view) doesn't need to
// parse every graphJson to build the unified graph.
export interface PaperCrossChainMention {
  sourceFocusPaperId: string
  fromPaperId: string
  toPaperId: string
  relationship: PaperValueChainRelationship
}

export function getEdgesMentioningPaper(
  paperId: string,
  limit = 30
): PaperCrossChainMention[] {
  const id = paperId.trim()
  const rows = getDb()
    .prepare<
      [string, string, string, number],
      {
        sourceFocusPaperId: string
        fromPaperId: string
        toPaperId: string
        relationship: string
      }
    >(
      `SELECT sourceFocusPaperId, fromPaperId, toPaperId, relationship
         FROM paper_value_chain_edges
        WHERE (fromPaperId = ? OR toPaperId = ?)
          AND sourceFocusPaperId != ?
        LIMIT ?`
    )
    .all(id, id, id, limit)
  const out: PaperCrossChainMention[] = []
  for (const r of rows) {
    if (
      r.relationship !== 'builds-on' &&
      r.relationship !== 'uses-method' &&
      r.relationship !== 'extends' &&
      r.relationship !== 'contrasts' &&
      r.relationship !== 'replicates' &&
      r.relationship !== 'refutes'
    ) {
      continue
    }
    out.push({
      sourceFocusPaperId: r.sourceFocusPaperId,
      fromPaperId: r.fromPaperId,
      toPaperId: r.toPaperId,
      relationship: r.relationship as PaperValueChainRelationship
    })
  }
  return out
}
