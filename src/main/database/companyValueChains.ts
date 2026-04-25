// Per-ticker generated value chain. Unlike the main graph overrides, this
// table stores a complete self-contained subgraph (its own stages, nodes,
// edges) that's only surfaced on the owning ticker's detail page. Lets
// Ollama propose an industry-appropriate taxonomy without mixing foreign
// stages into the hand-curated semi/hardware/energy graph.

import { getDb } from './connection'

export type CompanyValueChainStatus = 'pending' | 'ready' | 'offline' | 'error'

// Mirrors the shape the Ollama prompt emits (see ollamaService.generateCompanyValueChain).
export interface CompanyValueChainStage {
  id: string
  label: string
}

export interface CompanyValueChainNode {
  symbol: string // ticker when resolvable, else a synthetic uppercase label
  stage: string
  name: string
  blurb: string | null
  // 'ticker' when resolved to a real exchange symbol via companyNameResolver;
  // 'unverified' when the model named an entity we couldn't resolve (still
  // rendered, but flagged so users know it's inferred rather than grounded).
  kind: 'ticker' | 'unverified'
}

// Provenance for the edge claim. Restricted to primary-document sources:
// SEC filings (10-K/10-Q/8-K), in-app news articles (clickable into the
// reader), or 'model' for un-grounded claims. Profile blurbs and Yahoo
// analyst pages used to live here but were dropped — they don't evidence
// supplier/customer/competitor relationships, they evidence either
// company self-description or price-target sentiment. Null on legacy
// chains generated before this field was added.
export type CompanyValueChainEdgeSource = 'filings' | 'news' | 'model'

// Specific citation pointing to the actual document the edge claim came
// from. Optional — old chains generated before this feature shipped, and
// edges grounded only in the model's training knowledge ('model' source),
// have no citation. The renderer uses citations to deep-link the user
// straight to the SEC URL or in-app article reader.
export type CompanyValueChainEdgeCitation =
  | {
      kind: 'filing'
      // SEC accession number, e.g. "0000320193-24-000123". Used to build
      // the public archive URL via secService.buildFilingUrl.
      accession: string
      cik: string
      formType: string // '10-K', '10-K/A', etc.
      filedAt: number // ms epoch — when SEC stamped the filing
      url: string // pre-built primary doc URL so the renderer doesn't need secService
    }
  | {
      kind: 'article'
      // Pulse article id when the article was matched from the local
      // article DB — the renderer can route through the in-app reader.
      // NULL for "external" articles surfaced via Claude's web-search
      // augment (Reuters / Bloomberg / FT / WSJ URLs Pulse doesn't yet
      // index): the renderer falls back to opening the URL directly via
      // the system browser. URL is required when articleId is null.
      articleId: number | null
      title: string
      url: string | null
      publishedAt: number | null
      feedTitle: string | null
    }
  | {
      kind: 'model'
      // The model's free-text best guess at the source it learned the
      // relationship from during training (e.g. "Apple FY2023 10-K",
      // "Bloomberg coverage 2022-2024", "industry-standard supplier
      // disclosure"). Not clickable — there's no URL to open — but
      // surfaces a real attribution string instead of just "Model".
      // Optional: present on edges generated after this feature shipped
      // and where the model was confident enough to attribute; absent
      // on legacy chains and on truly-no-attribution claims.
      attribution?: string
    }

export interface CompanyValueChainEdge {
  from: string
  to: string
  relationship: 'supplier' | 'customer' | 'competitor' | 'partner'
  note: string | null
  source: CompanyValueChainEdgeSource | null
  // Multi-citation array. Each entry is one document the user can click
  // through to. Multiple citations on a single edge mean cross-referenced
  // claims — "this is in the 10-K AND Bloomberg covered it" is a stronger
  // signal than just the 10-K alone. Renderer stacks these as multiple
  // pills under the edge note.
  //
  // Backward compat: chains generated before multi-cite shipped used a
  // single `citation` field. Read paths normalize old shape into
  // citations: [oldCitation] at hydrate time so the renderer always sees
  // an array.
  citations?: CompanyValueChainEdgeCitation[]
  // DEPRECATED: legacy single-citation field on older chains. Kept on
  // the type for read-path normalization; new writes always use
  // citations[]. Will be removed in a future cleanup once old chains
  // have aged out via regeneration.
  citation?: CompanyValueChainEdgeCitation | null
}

export interface CompanyValueChain {
  focus: string
  stages: CompanyValueChainStage[]
  nodes: CompanyValueChainNode[]
  edges: CompanyValueChainEdge[]
}

export interface CompanyValueChainRow {
  symbol: string
  status: CompanyValueChainStatus
  graph: CompanyValueChain | null
  sourceContext: string | null
  generatedAt: number | null
  updatedAt: number
}

interface RawRow {
  symbol: string
  status: string
  graphJson: string | null
  sourceContext: string | null
  generatedAt: number | null
  updatedAt: number
}

function hydrate(row: RawRow): CompanyValueChainRow {
  let graph: CompanyValueChain | null = null
  if (row.graphJson) {
    try {
      graph = JSON.parse(row.graphJson) as CompanyValueChain
      // Backward-compat normalization: old chains stored a single
      // `citation` per edge; new chains use `citations: []`. Lift any
      // legacy single-citation into the array form so the renderer never
      // has to handle two shapes.
      if (graph?.edges) {
        for (const e of graph.edges) {
          if (!e.citations || e.citations.length === 0) {
            e.citations = e.citation ? [e.citation] : []
          }
        }
      }
    } catch {
      graph = null
    }
  }
  return {
    symbol: row.symbol,
    status: (row.status as CompanyValueChainStatus) ?? 'error',
    graph,
    sourceContext: row.sourceContext,
    generatedAt: row.generatedAt,
    updatedAt: row.updatedAt
  }
}

export function setCompanyValueChain(input: {
  symbol: string
  status: CompanyValueChainStatus
  graph: CompanyValueChain | null
  sourceContext?: string | null
}): void {
  const now = Date.now()
  const sym = input.symbol.toUpperCase()
  const db = getDb()
  // Wrap chain-row write + edge-mentions refresh in one transaction so the
  // denormalized table can never drift from the JSON source of truth: a
  // crash mid-write leaves both tables either pre- or post-state, never
  // mixed. The mentions table is consulted by getEdgesMentioningSymbol on
  // every regen — see migration v40.
  db.transaction(() => {
    db.prepare(
      `INSERT INTO company_value_chains
         (symbol, status, graphJson, sourceContext, generatedAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
         status = excluded.status,
         graphJson = excluded.graphJson,
         sourceContext = excluded.sourceContext,
         generatedAt = excluded.generatedAt,
         updatedAt = excluded.updatedAt`
    ).run(
      sym,
      input.status,
      input.graph ? JSON.stringify(input.graph) : null,
      input.sourceContext ?? null,
      input.graph ? now : null,
      now
    )

    // Refresh edge mentions: nuke this focus's prior mentions then insert
    // one row per current edge. INSERT OR IGNORE skips duplicates within
    // the same chain (rare — model occasionally emits the same edge twice).
    db.prepare(`DELETE FROM chain_edge_mentions WHERE sourceFocus = ?`).run(sym)
    if (input.graph?.edges?.length) {
      const insertStmt = db.prepare(
        `INSERT OR IGNORE INTO chain_edge_mentions
           (sourceFocus, fromSym, toSym, relationship, note)
         VALUES (?, ?, ?, ?, ?)`
      )
      for (const e of input.graph.edges) {
        insertStmt.run(
          sym,
          e.from.toUpperCase(),
          e.to.toUpperCase(),
          e.relationship,
          e.note
        )
      }
    }
  })()
}

export function getCompanyValueChain(symbol: string): CompanyValueChainRow | null {
  const row = getDb()
    .prepare<[string], RawRow>(
      `SELECT symbol, status, graphJson, sourceContext, generatedAt, updatedAt
         FROM company_value_chains
        WHERE symbol = ?`
    )
    .get(symbol.toUpperCase())
  return row ? hydrate(row) : null
}

export function deleteCompanyValueChain(symbol: string): void {
  const sym = symbol.toUpperCase()
  const db = getDb()
  db.transaction(() => {
    db.prepare(`DELETE FROM company_value_chains WHERE symbol = ?`).run(sym)
    db.prepare(`DELETE FROM chain_edge_mentions WHERE sourceFocus = ?`).run(sym)
  })()
}

// List every symbol that currently has a chain row. Used by the bulk
// regenerate flow to find "every ticker the user has already generated for"
// — the natural target set for a one-click refresh when the generator or
// absorber evolves.
export function listCompanyValueChainSymbols(): string[] {
  return getDb()
    .prepare<[], { symbol: string }>(
      `SELECT symbol FROM company_value_chains ORDER BY symbol`
    )
    .all()
    .map((r) => r.symbol)
}

// Edges from OTHER chains that mention the focus symbol on either side.
// Feeds the generator's "cross-chain context" block so regens can
// corroborate relationships already claimed by neighboring chains instead
// of re-deriving every edge in isolation.
export interface CrossChainEdgeMention {
  // The chain this edge came from (its focus symbol). Never equal to the
  // query symbol — self-mentions are filtered out at the SQL level.
  sourceFocus: string
  from: string
  to: string
  relationship: 'supplier' | 'customer' | 'competitor' | 'partner'
  note: string | null
}

export function getEdgesMentioningSymbol(
  symbol: string,
  limit = 30
): CrossChainEdgeMention[] {
  const sym = symbol.toUpperCase()
  // Indexed lookup against the denormalized chain_edge_mentions table
  // (migration v40). Two endpoint indexes (idx_*_from / idx_*_to) make
  // the OR cheap; sourceFocus != ? filters out self-mentions. Replaces
  // the prior json_each cross-join scan that was the slowest read path
  // in the chain pipeline.
  const rows = getDb()
    .prepare<
      [string, string, string, number],
      {
        sourceFocus: string
        fromSym: string
        toSym: string
        rel: string
        note: string | null
      }
    >(
      `SELECT sourceFocus, fromSym, toSym, relationship AS rel, note
         FROM chain_edge_mentions
        WHERE (fromSym = ? OR toSym = ?)
          AND sourceFocus != ?
        LIMIT ?`
    )
    .all(sym, sym, sym, limit)
  const out: CrossChainEdgeMention[] = []
  for (const r of rows) {
    if (
      r.rel !== 'supplier' &&
      r.rel !== 'customer' &&
      r.rel !== 'competitor' &&
      r.rel !== 'partner'
    ) {
      continue
    }
    out.push({
      sourceFocus: r.sourceFocus,
      from: r.fromSym,
      to: r.toSym,
      relationship: r.rel,
      note: r.note
    })
  }
  return out
}
