// Single-row store for the most recent Claude-authored morning brief.
// Schema lives in migration v37; this module owns the read/write API.
//
// payloadJson holds a structured BriefPayload (sections + citations) so the
// renderer can lay it out without re-parsing markdown. We keep exactly one
// row in the table — the daily refresh issues an INSERT-OR-REPLACE on the
// fixed singleton id (1).

import { getDb } from './connection'

export interface BriefCitation {
  // What the citation points to. 'article' opens the in-app reader for the
  // article id; 'filing' opens the SEC filing URL; 'symbol' opens the
  // ticker detail page.
  type: 'article' | 'filing' | 'symbol'
  // article: numeric article id; filing: accession number; symbol: ticker.
  ref: string
  // Pre-resolved URL for filing citations (filled during brief assembly so
  // the renderer doesn't need CIK lookups at click time). Article and
  // symbol citations don't carry a URL — the renderer opens those via the
  // in-app reader / detail page.
  url?: string
  label?: string
}

export interface BriefBullet {
  text: string
  citations?: BriefCitation[]
}

export interface BriefSection {
  // 'headlines' | 'earnings' | 'filings' | 'iv' | 'macro' …
  // Renderer maps known kinds to icons; unknown kinds render with a generic
  // header so a future Claude prompt can add new sections without a code
  // change.
  kind: string
  title: string
  bullets: BriefBullet[]
}

export interface BriefPayload {
  headline: string // 1-line summary used as the card title / notification body
  generatedAtIso: string // human-readable iso timestamp Claude saw
  sections: BriefSection[]
  // Provenance — what Claude was actually fed, useful for debugging stale
  // / weird briefs. The renderer surfaces a small info chip with the
  // counts so the user knows whether the brief was thin because there was
  // nothing newsworthy, or because data plumbing failed.
  inputs: {
    watchlistSize: number
    articleCount: number
    earningsCount: number
    filingsCount: number
    ivMoverCount: number
  }
}

export interface MorningBriefRow {
  generatedAt: number
  payload: BriefPayload
  watchlistSize: number
  provider: 'claude' | 'ollama' | null
}

export function setMorningBrief(input: {
  payload: BriefPayload
  watchlistSize: number
  provider: 'claude' | 'ollama' | null
}): void {
  getDb()
    .prepare(
      `INSERT INTO morning_briefs (id, generatedAt, payloadJson, watchlistSize, provider)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         generatedAt = excluded.generatedAt,
         payloadJson = excluded.payloadJson,
         watchlistSize = excluded.watchlistSize,
         provider = excluded.provider`
    )
    .run(Date.now(), JSON.stringify(input.payload), input.watchlistSize, input.provider)
}

export function getMorningBrief(): MorningBriefRow | null {
  const row = getDb()
    .prepare<
      [],
      {
        generatedAt: number
        payloadJson: string
        watchlistSize: number
        provider: string | null
      }
    >(
      `SELECT generatedAt, payloadJson, watchlistSize, provider
         FROM morning_briefs WHERE id = 1`
    )
    .get()
  if (!row) return null
  let payload: BriefPayload
  try {
    payload = JSON.parse(row.payloadJson) as BriefPayload
  } catch {
    return null
  }
  return {
    generatedAt: row.generatedAt,
    payload,
    watchlistSize: row.watchlistSize,
    provider:
      row.provider === 'claude' || row.provider === 'ollama' ? row.provider : null
  }
}
