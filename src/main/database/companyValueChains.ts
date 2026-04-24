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

export interface CompanyValueChainEdge {
  from: string
  to: string
  relationship: 'supplier' | 'customer' | 'competitor' | 'partner'
  note: string | null
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
  getDb()
    .prepare(
      `INSERT INTO company_value_chains
         (symbol, status, graphJson, sourceContext, generatedAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
         status = excluded.status,
         graphJson = excluded.graphJson,
         sourceContext = excluded.sourceContext,
         generatedAt = excluded.generatedAt,
         updatedAt = excluded.updatedAt`
    )
    .run(
      input.symbol.toUpperCase(),
      input.status,
      input.graph ? JSON.stringify(input.graph) : null,
      input.sourceContext ?? null,
      input.graph ? now : null,
      now
    )
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
  getDb()
    .prepare(`DELETE FROM company_value_chains WHERE symbol = ?`)
    .run(symbol.toUpperCase())
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
