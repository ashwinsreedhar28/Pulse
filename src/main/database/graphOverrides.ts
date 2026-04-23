// Accepted-candidate overlay for the value-chain graph. The renderer merges
// these rows on top of the static supplyChainGraph.json at read time so
// auto-committed edges persist across reboots without touching the base JSON.

import { getDb } from './connection'

export interface GraphEdgeOverride {
  fromSymbol: string
  toSymbol: string
  relationship: string
  note: string | null
  weight: number | null
  source: string
  acceptedAt: number
}

export function upsertEdgeOverride(input: GraphEdgeOverride): void {
  getDb()
    .prepare(
      `INSERT INTO graph_edge_overrides
         (fromSymbol, toSymbol, relationship, note, weight, source, acceptedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(fromSymbol, toSymbol, relationship) DO UPDATE SET
         note = excluded.note,
         weight = excluded.weight,
         source = excluded.source,
         acceptedAt = excluded.acceptedAt`
    )
    .run(
      input.fromSymbol.toUpperCase(),
      input.toSymbol.toUpperCase(),
      input.relationship,
      input.note,
      input.weight,
      input.source,
      input.acceptedAt
    )
}

export function deleteEdgeOverride(
  fromSymbol: string,
  toSymbol: string,
  relationship: string
): void {
  getDb()
    .prepare(
      `DELETE FROM graph_edge_overrides
        WHERE fromSymbol = ? AND toSymbol = ? AND relationship = ?`
    )
    .run(fromSymbol.toUpperCase(), toSymbol.toUpperCase(), relationship)
}

export function listEdgeOverrides(): GraphEdgeOverride[] {
  return getDb()
    .prepare<[], GraphEdgeOverride>(
      `SELECT fromSymbol, toSymbol, relationship, note, weight, source, acceptedAt
         FROM graph_edge_overrides
        ORDER BY acceptedAt DESC`
    )
    .all()
}
