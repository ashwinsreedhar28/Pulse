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
  // Per-edge citations lifted from the per-ticker chain the absorber
  // pulled this edge from. Multi-cite means each edge can carry several
  // documents (10-K + 10-Q + a news article + an analyst action), and
  // the renderer stacks them so the user can pick which source to open.
  // Empty array on legacy rows and on edges not absorbed from a chain.
  // Stored in the existing citationJson column as either a JSON array
  // (new shape) or a JSON object (legacy single-cite shape) — hydrate
  // normalizes both into the array form.
  citations?: CompanyValueChainEdgeCitation[]
  // DEPRECATED: legacy single-citation field. Read paths normalize the
  // old citationJson object into citations: [oldCitation]; this remains
  // only so existing callers building a GraphEdgeOverride manually with
  // the old shape compile until they migrate.
  citation?: CompanyValueChainEdgeCitation | null
}

export function upsertEdgeOverride(input: GraphEdgeOverride): void {
  // Citations persist as a JSON array in citationJson. Multi-cite chains
  // produce more than one entry per edge (e.g. 10-K + a news article).
  // Legacy callers passing a single `citation` field are folded into a
  // singleton array so the on-disk shape converges. Empty array becomes
  // null so the COALESCE in the conflict path leaves richer existing
  // citations alone when a re-absorption arrives without any.
  const merged = input.citations && input.citations.length > 0
    ? input.citations
    : input.citation
      ? [input.citation]
      : []
  const citationJson = merged.length > 0 ? JSON.stringify(merged) : null
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

// Evidence class for an edge source tag. Consensus is measured across these,
// not across raw tags, because every per-ticker chain emits its own
// `chain_gen_<FOCUS>` tag from the same underlying model.
//   'llm'  — chain_gen_* (any focus ticker): one Claude prompt, one prior
//   'news' — news_cooccurrence, incl. the refresh: variant
//   '10k'  — sec_10k_concentration: a disclosed revenue dependency
function sourceClass(source: string): string {
  const s = source.trim()
  if (s.startsWith('chain_gen_')) return 'llm'
  if (s === 'sec_10k_concentration') return '10k'
  if (s.endsWith('news_cooccurrence')) return 'news'
  return s
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
      Omit<GraphEdgeOverride, 'citation' | 'citations'>
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
  priorSources.add(input.source)
  const mergedSources = [...priorSources]

  // Consensus requires independent *kinds* of evidence, not merely more
  // source tags. Every per-ticker chain writes `chain_gen_<FOCUS>`, so an
  // edge asserted by NVDA's chain and again by AMD's chain accumulated two
  // tags — and the old `mergedSources.length > 1` test read that as
  // corroboration, compounding the weight bonus each time. It is one Claude
  // prompt run repeatedly against one model prior: correlated, not
  // independent. A live edge had reached nine such "confirmations" and was
  // pinned at the 1.0 cap.
  //
  // Weight feeds edge ranking and is a candidate feature in the
  // supply-chain event study, so inflating it on self-agreement is not
  // cosmetic.
  const classes = new Set(mergedSources.map(sourceClass))
  const consensus = classes.size > 1
  const priorClasses = new Set(
    existing.source.split(',').map((s) => s.trim()).filter(Boolean).map(sourceClass)
  )
  const wasAlreadyMultiClass = priorClasses.size > 1

  const priorWeight = existing.weight ?? 0
  const newWeight = input.weight ?? 0
  // Consensus bonus: the average of the two scores plus a 0.15 bump, capped
  // at 1.0. If we already had cross-class agreement, keep the prior weight as
  // the floor so repeated confirmations never *lower* an edge's weight.
  const combined = consensus ? Math.min(1, (priorWeight + newWeight) / 2 + 0.15) : newWeight
  const finalWeight = wasAlreadyMultiClass ? Math.max(priorWeight, combined) : combined

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
  // citationJson can be either a JSON array (new multi-cite shape) or a
  // single JSON object (legacy v41 shape). Normalize to an array so the
  // renderer always sees one shape.
  let citations: CompanyValueChainEdgeCitation[] = []
  if (row.citationJson) {
    try {
      const parsed = JSON.parse(row.citationJson)
      if (Array.isArray(parsed)) {
        citations = parsed as CompanyValueChainEdgeCitation[]
      } else if (parsed && typeof parsed === 'object') {
        citations = [parsed as CompanyValueChainEdgeCitation]
      }
    } catch {
      citations = []
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
    citations,
    // Keep legacy `citation` populated to the first entry for any caller
    // still reading the old field — drop once renderers all migrate.
    citation: citations[0] ?? null
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
