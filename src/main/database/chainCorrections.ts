// User corrections to per-ticker value chains. Schema lives in migration
// v39; this module owns the typed read/write API.
//
// Each row is one user judgment on a counterparty (or other subject) within
// a specific focus's chain. Corrections drive two things:
//  1. Render-time filtering/swapping in the focus panel (so the user sees
//     the corrected chain immediately, no regen needed).
//  2. Ground-truth context fed into the Claude generator prompt on the
//     next regen, so the model honors the correction instead of repeating
//     the original mistake.

import { getDb } from './connection'

// 'counterparty' is the only subjectType the MVP UI emits — corrections on
// counterparty chips in the per-ticker focus panel. Reserved for future
// use: 'edge' (correct an edge note/source), 'node' (correct a graph-tile
// stage/sector outside the focus chain).
export type ChainCorrectionSubjectType = 'counterparty' | 'edge' | 'node'

// Three correction verdicts the user can apply to a counterparty:
//  - 'not-relevant': chip should not appear in this chain at all.
//  - 'wrong-direction': supplier should be customer, or vice versa.
//  - 'wrong-relationship': re-classify entirely (e.g. supplier → competitor).
export type ChainCorrectionType =
  | 'not-relevant'
  | 'wrong-direction'
  | 'wrong-relationship'

// Free-form structured payload describing the FIX (when applicable).
// Negative corrections (not-relevant) carry no payload — the type itself
// is the verdict. Direction/relationship corrections carry the new value.
export interface ChainCorrectionValue {
  // For 'wrong-direction': the corrected category as the user sees it in
  // the focus panel ('supplier' or 'customer'). 'wrong-direction' is only
  // emitted when flipping between these two — competitors/partners get a
  // 'wrong-relationship' instead.
  direction?: 'supplier' | 'customer'
  // For 'wrong-relationship': the new relationship category. Lets the user
  // re-bucket a chip that's in the wrong cluster entirely.
  relationship?: 'supplier' | 'customer' | 'competitor' | 'partner'
}

export interface ChainCorrection {
  focusSymbol: string
  subjectType: ChainCorrectionSubjectType
  // The thing being corrected. For 'counterparty' this is the
  // counterparty's symbol/label as it appears in the focus chain.
  subjectKey: string
  correctionType: ChainCorrectionType
  correctedValue: ChainCorrectionValue | null
  note: string | null
  createdAt: number
  appliedAt: number | null
}

interface RawRow {
  focusSymbol: string
  subjectType: string
  subjectKey: string
  correctionType: string
  correctedValueJson: string | null
  note: string | null
  createdAt: number
  appliedAt: number | null
}

function rowToCorrection(row: RawRow): ChainCorrection {
  let correctedValue: ChainCorrectionValue | null = null
  if (row.correctedValueJson) {
    try {
      correctedValue = JSON.parse(row.correctedValueJson) as ChainCorrectionValue
    } catch {
      correctedValue = null
    }
  }
  return {
    focusSymbol: row.focusSymbol,
    subjectType: row.subjectType as ChainCorrectionSubjectType,
    subjectKey: row.subjectKey,
    correctionType: row.correctionType as ChainCorrectionType,
    correctedValue,
    note: row.note,
    createdAt: row.createdAt,
    appliedAt: row.appliedAt
  }
}

export function listCorrectionsForFocus(focusSymbol: string): ChainCorrection[] {
  const rows = getDb()
    .prepare(
      `SELECT focusSymbol, subjectType, subjectKey, correctionType,
              correctedValueJson, note, createdAt, appliedAt
         FROM chain_corrections
        WHERE focusSymbol = ?
        ORDER BY createdAt DESC`
    )
    .all(focusSymbol.toUpperCase()) as RawRow[]
  return rows.map(rowToCorrection)
}

export function listAllCorrections(): ChainCorrection[] {
  const rows = getDb()
    .prepare(
      `SELECT focusSymbol, subjectType, subjectKey, correctionType,
              correctedValueJson, note, createdAt, appliedAt
         FROM chain_corrections
        ORDER BY focusSymbol, createdAt DESC`
    )
    .all() as RawRow[]
  return rows.map(rowToCorrection)
}

export interface UpsertCorrectionInput {
  focusSymbol: string
  subjectType: ChainCorrectionSubjectType
  subjectKey: string
  correctionType: ChainCorrectionType
  correctedValue?: ChainCorrectionValue | null
  note?: string | null
}

// INSERT-OR-REPLACE on the (focus, subject, type) PK so re-applying the
// same verdict updates the timestamp + value rather than producing
// duplicates. Returns the canonical row that ended up in the table.
export function upsertCorrection(input: UpsertCorrectionInput): ChainCorrection {
  const now = Date.now()
  const valueJson =
    input.correctedValue && Object.keys(input.correctedValue).length > 0
      ? JSON.stringify(input.correctedValue)
      : null
  const focus = input.focusSymbol.toUpperCase()
  const subject = input.subjectKey.toUpperCase()
  getDb()
    .prepare(
      `INSERT INTO chain_corrections (
         focusSymbol, subjectType, subjectKey, correctionType,
         correctedValueJson, note, createdAt, appliedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(focusSymbol, subjectType, subjectKey, correctionType)
       DO UPDATE SET
         correctedValueJson = excluded.correctedValueJson,
         note = excluded.note,
         createdAt = excluded.createdAt,
         appliedAt = NULL`
    )
    .run(
      focus,
      input.subjectType,
      subject,
      input.correctionType,
      valueJson,
      input.note ?? null,
      now
    )
  return {
    focusSymbol: focus,
    subjectType: input.subjectType,
    subjectKey: subject,
    correctionType: input.correctionType,
    correctedValue: input.correctedValue ?? null,
    note: input.note ?? null,
    createdAt: now,
    appliedAt: null
  }
}

export function deleteCorrection(input: {
  focusSymbol: string
  subjectType: ChainCorrectionSubjectType
  subjectKey: string
  correctionType: ChainCorrectionType
}): void {
  getDb()
    .prepare(
      `DELETE FROM chain_corrections
        WHERE focusSymbol = ?
          AND subjectType = ?
          AND subjectKey = ?
          AND correctionType = ?`
    )
    .run(
      input.focusSymbol.toUpperCase(),
      input.subjectType,
      input.subjectKey.toUpperCase(),
      input.correctionType
    )
}

// Stamp appliedAt for every correction tied to a focus that just regenerated.
// Lets us tell "the user fixed this AND the next regen honored it" apart
// from "fix is still pending the next generation pass".
export function markCorrectionsApplied(focusSymbol: string): void {
  getDb()
    .prepare(
      `UPDATE chain_corrections
          SET appliedAt = ?
        WHERE focusSymbol = ?`
    )
    .run(Date.now(), focusSymbol.toUpperCase())
}
