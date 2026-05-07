// Per-focus cache for the Haiku-enriched paper value chain JSON.
// Phase 3B saves the post-enrichment chain here so a regen request
// hitting the same focal paper within the 90-day TTL reuses the
// prior Haiku output instead of paying for another Anthropic call.
//
// The row is keyed off the same focusPaperId as paper_value_chains
// with ON DELETE CASCADE so chain deletion takes the enrichment with
// it. The service also explicitly deletes the row before a regen so a
// "Regenerate" click always re-runs Haiku on the freshest S2 data.

import { getDb } from './connection'
import type { PaperValueChain } from './paperValueChains'

export interface PaperChainEnrichmentRow {
  focusPaperId: string
  enrichedAt: number
  enrichedGraph: PaperValueChain
  haikuCallsUsed: number
}

interface RawRow {
  focusPaperId: string
  enrichedAt: number
  enrichedGraphJson: string
  haikuCallsUsed: number
}

function hydrate(row: RawRow): PaperChainEnrichmentRow | null {
  try {
    const graph = JSON.parse(row.enrichedGraphJson) as PaperValueChain
    return {
      focusPaperId: row.focusPaperId,
      enrichedAt: row.enrichedAt,
      enrichedGraph: graph,
      haikuCallsUsed: row.haikuCallsUsed
    }
  } catch {
    return null
  }
}

export function getPaperChainEnrichment(
  focusPaperId: string
): PaperChainEnrichmentRow | null {
  const row = getDb()
    .prepare<[string], RawRow>(
      `SELECT focusPaperId, enrichedAt, enrichedGraphJson, haikuCallsUsed
         FROM paper_chain_enrichments
        WHERE focusPaperId = ?`
    )
    .get(focusPaperId.trim())
  return row ? hydrate(row) : null
}

export function upsertPaperChainEnrichment(input: {
  focusPaperId: string
  enrichedGraph: PaperValueChain
  haikuCallsUsed: number
}): PaperChainEnrichmentRow {
  const now = Date.now()
  const id = input.focusPaperId.trim()
  if (!id) throw new Error('upsertPaperChainEnrichment: empty focusPaperId')
  getDb()
    .prepare(
      `INSERT INTO paper_chain_enrichments
         (focusPaperId, enrichedAt, enrichedGraphJson, haikuCallsUsed)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(focusPaperId) DO UPDATE SET
         enrichedAt = excluded.enrichedAt,
         enrichedGraphJson = excluded.enrichedGraphJson,
         haikuCallsUsed = excluded.haikuCallsUsed`
    )
    .run(id, now, JSON.stringify(input.enrichedGraph), input.haikuCallsUsed)
  return {
    focusPaperId: id,
    enrichedAt: now,
    enrichedGraph: input.enrichedGraph,
    haikuCallsUsed: input.haikuCallsUsed
  }
}

export function deletePaperChainEnrichment(focusPaperId: string): void {
  getDb()
    .prepare(`DELETE FROM paper_chain_enrichments WHERE focusPaperId = ?`)
    .run(focusPaperId.trim())
}
