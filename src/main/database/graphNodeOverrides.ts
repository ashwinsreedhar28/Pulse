// Auto-discovered node overlay. When a source pipeline (today: 10-K customer
// concentration) resolves a customer name to a ticker that isn't in the
// static supplyChainGraph.json, it lands here so the renderer can place it
// as a first-class tile alongside the hand-curated graph.

import { getDb } from './connection'

export interface GraphNodeOverride {
  symbol: string
  stage: string
  sector: string | null
  name: string | null
  blurb: string | null
  source: string
  acceptedAt: number
}

export function upsertNodeOverride(input: GraphNodeOverride): void {
  getDb()
    .prepare(
      `INSERT INTO graph_node_overrides
         (symbol, stage, sector, name, blurb, source, acceptedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
         stage = excluded.stage,
         sector = excluded.sector,
         name = excluded.name,
         blurb = excluded.blurb,
         source = excluded.source,
         acceptedAt = excluded.acceptedAt`
    )
    .run(
      input.symbol.toUpperCase(),
      input.stage,
      input.sector,
      input.name,
      input.blurb,
      input.source,
      input.acceptedAt
    )
}

export function deleteNodeOverride(symbol: string): void {
  getDb()
    .prepare(`DELETE FROM graph_node_overrides WHERE symbol = ?`)
    .run(symbol.toUpperCase())
}

export function listNodeOverrides(): GraphNodeOverride[] {
  return getDb()
    .prepare<[], GraphNodeOverride>(
      `SELECT symbol, stage, sector, name, blurb, source, acceptedAt
         FROM graph_node_overrides
        ORDER BY acceptedAt DESC`
    )
    .all()
}

export function hasNodeOverride(symbol: string): boolean {
  const row = getDb()
    .prepare<[string], { n: number }>(
      `SELECT 1 AS n FROM graph_node_overrides WHERE symbol = ?`
    )
    .get(symbol.toUpperCase())
  return !!row
}
