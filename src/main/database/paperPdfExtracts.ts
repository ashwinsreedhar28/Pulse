// Per-paper cache for the focal paper's intro + related-work text.
// Phase 3B uses this to ground Haiku enrichment; 3C will reuse the
// cache for bilateral verification (does paper X's intro reference
// the focal paper, and vice versa).
//
// 90-day TTL enforced at read time by the consumer. Stale rows aren't
// auto-purged — they get overwritten on the next extraction attempt.

import { getDb } from './connection'

// One section per heading in the extracted intro/related-work range.
// `pageOffset` is the 1-indexed PDF page where the section starts;
// passed back to the renderer so a citation pill can deep-link via
// `#page=N` into the in-window reader.
export interface PaperPdfSection {
  heading: string | null
  text: string
  pageOffset: number
}

export interface PaperPdfExtract {
  paperId: string
  extractedAt: number
  sections: PaperPdfSection[]
  rawIntroLength: number
}

interface RawRow {
  paperId: string
  extractedAt: number
  sectionsJson: string
  rawIntroLength: number
}

function hydrate(row: RawRow): PaperPdfExtract | null {
  try {
    const sections = JSON.parse(row.sectionsJson) as PaperPdfSection[]
    if (!Array.isArray(sections)) return null
    return {
      paperId: row.paperId,
      extractedAt: row.extractedAt,
      sections,
      rawIntroLength: row.rawIntroLength
    }
  } catch {
    return null
  }
}

export function getPaperPdfExtract(paperId: string): PaperPdfExtract | null {
  const row = getDb()
    .prepare<[string], RawRow>(
      `SELECT paperId, extractedAt, sectionsJson, rawIntroLength
         FROM paper_pdf_extracts
        WHERE paperId = ?`
    )
    .get(paperId.trim())
  return row ? hydrate(row) : null
}

export function upsertPaperPdfExtract(input: {
  paperId: string
  sections: PaperPdfSection[]
  rawIntroLength: number
}): PaperPdfExtract {
  const now = Date.now()
  const id = input.paperId.trim()
  if (!id) throw new Error('upsertPaperPdfExtract: empty paperId')
  getDb()
    .prepare(
      `INSERT INTO paper_pdf_extracts
         (paperId, extractedAt, sectionsJson, rawIntroLength)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(paperId) DO UPDATE SET
         extractedAt = excluded.extractedAt,
         sectionsJson = excluded.sectionsJson,
         rawIntroLength = excluded.rawIntroLength`
    )
    .run(id, now, JSON.stringify(input.sections), input.rawIntroLength)
  return {
    paperId: id,
    extractedAt: now,
    sections: input.sections,
    rawIntroLength: input.rawIntroLength
  }
}

export function deletePaperPdfExtract(paperId: string): void {
  getDb()
    .prepare(`DELETE FROM paper_pdf_extracts WHERE paperId = ?`)
    .run(paperId.trim())
}
