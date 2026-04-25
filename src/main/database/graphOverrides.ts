// Accepted-candidate overlay for the value-chain graph. The renderer merges
// these rows on top of the static supplyChainGraph.json at read time so
// auto-committed edges persist across reboots without touching the base JSON.

import { getDb } from './connection'

import type { CompanyValueChainEdgeCitation } from './companyValueChains'

export interface GraphEdgeOverride {
  fromSymbol: string
  toSymbol: string
  relationship: string
  note: string | null
  weight: number | null
  source: string
  acceptedAt: number
  // Unified-graph sector tag. Identifies which sector's value-chain view
  // this edge naturally lives in (usually the focus ticker's primary
  // sector at the time the edge was proposed). Nullable because rows
  // predating v35 may not have one until the bootstrap backfills.
  sectorId?: string | null
  // Per-edge citation lifted from the per-ticker chain that the absorber
  // pulled this edge from. Renders as a clickable badge in the diagram
  // tooltip + counterparty chip — opens the cited 10-K / article in the
  // in-app reader. Null on legacy rows and on edges not absorbed from a
  // chain (e.g. hand-curated overrides). Schema is migration v41.
  citation?: CompanyValueChainEdgeCitation | null
}

export function upsertEdgeOverride(input: GraphEdgeOverride): void {
  // Citation persists as JSON. Null when the absorber didn't get one (legacy
  // chains pre-citation-feature, or hand-curated overrides). Conflict path
  // prefers the new citation only when present so a re-absorption with
  // null citation doesn't blow away an earlier richer one.
  const citationJson = input.citation ? JSON.stringify(input.citation) : null
  getDb()
    .prepare(
      `INSERT INTO graph_edge_overrides
         (fromSymbol, toSymbol, relationship, note, weight, source, acceptedAt, sectorId, citationJson)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(fromSymbol, toSymbol, relationship) DO UPDATE SET
         note = excluded.note,
         weight = excluded.weight,
         source = excluded.source,
         acceptedAt = excluded.acceptedAt,
         sectorId = COALESCE(excluded.sectorId, graph_edge_overrides.sectorId),
         citationJson = COALESCE(excluded.citationJson, graph_edge_overrides.citationJson)`
    )
    .run(
      input.fromSymbol.toUpperCase(),
      input.toSymbol.toUpperCase(),
      input.relationship,
      input.note,
      input.weight,
      input.source,
      input.acceptedAt,
      input.sectorId ?? null,
      citationJson
    )
}

// Multi-source consensus upsert. When a pair is already present from a
// different source, we don't overwrite — we merge. The source column
// becomes a comma-separated list of contributing sources (e.g.
// "news_cooccurrence,sec_10k_concentration"), and the weight gets a
// consensus bonus capped at 1.0. The 10-K's note wins over a news note
// when both are present, because the filer's own language is more
// authoritative than aggregated article snippets.
//
// Returns the resulting source list so the caller can tell whether this
// was a fresh accept (single source) or a consensus merge.
export function upsertEdgeOverrideWithConsensus(input: GraphEdgeOverride): {
  sources: string[]
  consensus: boolean
  finalWeight: number
} {
  const db = getDb()
  const from = input.fromSymbol.toUpperCase()
  const to = input.toSymbol.toUpperCase()
  // Consensus path doesn't need citation — just merging sources/weights/
  // notes. citation is preserved by the bare UPDATE below (no column touch).
  const existing = db
    .prepare<
      [string, string, string],
      Omit<GraphEdgeOverride, 'citation'>
    >(
      `SELECT fromSymbol, toSymbol, relationship, note, weight, source, acceptedAt, sectorId
         FROM graph_edge_overrides
        WHERE fromSymbol = ? AND toSymbol = ? AND relationship = ?`
    )
    .get(from, to, input.relationship)

  if (!existing) {
    upsertEdgeOverride(input)
    return {
      sources: [input.source],
      consensus: false,
      finalWeight: input.weight ?? 0
    }
  }

  const priorSources = new Set(existing.source.split(',').map((s) => s.trim()).filter(Boolean))
  const wasAlreadyMultiSource = priorSources.size > 1
  priorSources.add(input.source)
  const mergedSources = [...priorSources]
  const consensus = mergedSources.length > 1
  const priorWeight = existing.weight ?? 0
  const newWeight = input.weight ?? 0
  // Consensus bonus: the average of the two scores plus a 0.15 bump, capped
  // at 1.0. If we were already multi-source, keep the prior weight as the
  // floor so repeated confirmations never *lower* an edge's weight.
  const combined = consensus ? Math.min(1, (priorWeight + newWeight) / 2 + 0.15) : newWeight
  const finalWeight = wasAlreadyMultiSource ? Math.max(priorWeight, combined) : combined

  // Prefer the 10-K note when available, even if news arrived second.
  const isTenK = (s: string): boolean => s === 'sec_10k_concentration'
  const prevWasTenK = existing.source.split(',').some(isTenK)
  const newIsTenK = isTenK(input.source)
  const preferredNote =
    newIsTenK && input.note
      ? input.note
      : prevWasTenK && existing.note
        ? existing.note
        : input.note ?? existing.note ?? null

  // sectorId: keep whichever one is set. First-in wins; if the merge
  // introduces a new sectorId over a null, adopt it.
  const mergedSectorId = existing.sectorId ?? input.sectorId ?? null

  db
    .prepare(
      `UPDATE graph_edge_overrides
          SET note = ?, weight = ?, source = ?, acceptedAt = ?, sectorId = ?
        WHERE fromSymbol = ? AND toSymbol = ? AND relationship = ?`
    )
    .run(
      preferredNote,
      finalWeight,
      mergedSources.join(','),
      input.acceptedAt,
      mergedSectorId,
      from,
      to,
      input.relationship
    )

  return { sources: mergedSources, consensus, finalWeight }
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

interface RawEdgeOverrideRow {
  fromSymbol: string
  toSymbol: string
  relationship: string
  note: string | null
  weight: number | null
  source: string
  acceptedAt: number
  sectorId: string | null
  citationJson: string | null
}

function hydrateEdgeOverride(row: RawEdgeOverrideRow): GraphEdgeOverride {
  let citation: CompanyValueChainEdgeCitation | null = null
  if (row.citationJson) {
    try {
      citation = JSON.parse(row.citationJson) as CompanyValueChainEdgeCitation
    } catch {
      citation = null
    }
  }
  return {
    fromSymbol: row.fromSymbol,
    toSymbol: row.toSymbol,
    relationship: row.relationship,
    note: row.note,
    weight: row.weight,
    source: row.source,
    acceptedAt: row.acceptedAt,
    sectorId: row.sectorId,
    citation
  }
}

export function listEdgeOverrides(): GraphEdgeOverride[] {
  return getDb()
    .prepare<[], RawEdgeOverrideRow>(
      `SELECT fromSymbol, toSymbol, relationship, note, weight, source, acceptedAt, sectorId, citationJson
         FROM graph_edge_overrides
        ORDER BY acceptedAt DESC`
    )
    .all()
    .map(hydrateEdgeOverride)
}
