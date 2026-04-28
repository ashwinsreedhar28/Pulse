// Per-paper bookmarks for the Research tab. We store the full
// ResearchPaper JSON inline (not just paperId) so the Bookmarks view
// renders without round-tripping to Semantic Scholar — both saves
// rate-limit budget and means the bookmark list works even when S2
// is degrading.

import { getDb } from './connection'
import type { ResearchPaper } from '../../preload'

export interface ResearchBookmarkRow {
  paperId: string
  savedAt: number
  paper: ResearchPaper
}

interface RawRow {
  paperId: string
  savedAt: number
  paperJson: string
}

function hydrate(row: RawRow): ResearchBookmarkRow | null {
  try {
    const paper = JSON.parse(row.paperJson) as ResearchPaper
    return { paperId: row.paperId, savedAt: row.savedAt, paper }
  } catch {
    // Corrupt JSON is rare but possible if a future schema change
    // breaks back-compat. Skip the row rather than crash the list call.
    return null
  }
}

export function listResearchBookmarks(): ResearchBookmarkRow[] {
  const rows = getDb()
    .prepare<[], RawRow>(
      `SELECT paperId, savedAt, paperJson
         FROM research_bookmarks
        ORDER BY savedAt DESC`
    )
    .all()
  const out: ResearchBookmarkRow[] = []
  for (const r of rows) {
    const hydrated = hydrate(r)
    if (hydrated) out.push(hydrated)
  }
  return out
}

export function bookmarkResearchPaper(paper: ResearchPaper): ResearchBookmarkRow {
  const savedAt = Date.now()
  const paperJson = JSON.stringify(paper)
  getDb()
    .prepare(
      `INSERT INTO research_bookmarks (paperId, savedAt, paperJson)
       VALUES (?, ?, ?)
       ON CONFLICT(paperId) DO UPDATE SET
         savedAt = excluded.savedAt,
         paperJson = excluded.paperJson`
    )
    .run(paper.paperId, savedAt, paperJson)
  return { paperId: paper.paperId, savedAt, paper }
}

export function unbookmarkResearchPaper(paperId: string): void {
  getDb()
    .prepare(`DELETE FROM research_bookmarks WHERE paperId = ?`)
    .run(paperId)
}

// Set of currently-bookmarked paperIds. Used by the renderer to render
// the ⭐ filled vs hollow on each paper card without a per-paper IPC.
export function getBookmarkedPaperIds(): Set<string> {
  const rows = getDb()
    .prepare<[], { paperId: string }>(
      `SELECT paperId FROM research_bookmarks`
    )
    .all()
  return new Set(rows.map((r) => r.paperId))
}
