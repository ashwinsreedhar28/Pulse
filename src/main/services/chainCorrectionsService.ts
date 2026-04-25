// Glue layer between the chain_corrections DB module and the rest of the
// app. Three responsibilities:
//   1. Format active corrections as a prompt block for the Claude generator
//      ("user has flagged these — honor as ground-truth").
//   2. Apply corrections to a CompanyValueChain at read time so the focus
//      panel reflects the user's verdicts immediately, before any regen.
//   3. Broadcast a renderer event when corrections change so panels reload.
//
// We deliberately keep the DB module thin (just CRUD) and put the
// formatting / application logic here so the prompt format and render
// behavior can evolve independently from the storage shape.

import { BrowserWindow } from 'electron'

import {
  deleteCorrection,
  listCorrectionsForFocus,
  upsertCorrection,
  type ChainCorrection,
  type UpsertCorrectionInput
} from '../database/chainCorrections'
import type { CompanyValueChain } from '../database/companyValueChains'

export {
  type ChainCorrection,
  type ChainCorrectionType,
  type ChainCorrectionSubjectType,
  type ChainCorrectionValue,
  type UpsertCorrectionInput
} from '../database/chainCorrections'

function broadcastUpdated(focusSymbol: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('chainCorrections:updated', focusSymbol.toUpperCase())
    }
  }
}

export function listForFocus(focusSymbol: string): ChainCorrection[] {
  return listCorrectionsForFocus(focusSymbol)
}

export function applyCorrection(input: UpsertCorrectionInput): ChainCorrection {
  const row = upsertCorrection(input)
  broadcastUpdated(row.focusSymbol)
  return row
}

export function removeCorrection(input: {
  focusSymbol: string
  subjectType: ChainCorrection['subjectType']
  subjectKey: string
  correctionType: ChainCorrection['correctionType']
}): void {
  deleteCorrection(input)
  broadcastUpdated(input.focusSymbol)
}

// Format an active-corrections block for the Claude generator system prompt.
// Returns null when the focus has no corrections — the caller can then omit
// the block entirely rather than emit an empty section.
//
// Lines read like:
//   - GOOG should NOT appear in this chain (user flagged: not relevant)
//   - ADEA is a SUPPLIER of QCOM, not a customer (user-corrected direction)
//   - WMT is a COMPETITOR of TGT, not a supplier (user-corrected category)
//
// We pass the focus symbol in each line so Claude doesn't have to track the
// implicit subject across the prompt — costs a few tokens, eliminates a
// whole class of "I forgot which company we're discussing" errors.
export function formatCorrectionsForPrompt(focusSymbol: string): string | null {
  const focus = focusSymbol.toUpperCase()
  const corrections = listCorrectionsForFocus(focus)
  if (corrections.length === 0) return null

  const lines: string[] = []
  for (const c of corrections) {
    if (c.subjectType !== 'counterparty') continue // future types
    const subject = c.subjectKey
    if (c.correctionType === 'not-relevant') {
      lines.push(
        `- ${subject} should NOT appear in ${focus}'s value chain (user flagged: not relevant). Omit this entity entirely.`
      )
    } else if (c.correctionType === 'wrong-direction') {
      const dir = c.correctedValue?.direction
      if (dir === 'supplier') {
        lines.push(
          `- ${subject} is a SUPPLIER of ${focus}, not a customer (user-corrected direction). Emit the edge as ${subject} → ${focus} with relationship "supplier".`
        )
      } else if (dir === 'customer') {
        lines.push(
          `- ${subject} is a CUSTOMER of ${focus}, not a supplier (user-corrected direction). Emit the edge as ${focus} → ${subject} with relationship "customer", or equivalently ${subject} → ${focus} with relationship "customer".`
        )
      }
    } else if (c.correctionType === 'wrong-relationship') {
      const rel = c.correctedValue?.relationship
      if (rel) {
        lines.push(
          `- ${subject} is a ${rel.toUpperCase()} of ${focus} (user-corrected category). Place ${subject} in the ${rel} relationship, not whatever was emitted previously.`
        )
      }
    }
    if (c.note && c.note.trim()) {
      lines.push(`    User note: ${c.note.trim().slice(0, 200)}`)
    }
  }

  if (lines.length === 0) return null

  return (
    `User-flagged corrections for ${focus}'s chain — these are GROUND TRUTH ` +
    `from the human reviewer. Honor them exactly. They take precedence over ` +
    `cross-chain mentions, news snippets, and your own prior knowledge:\n` +
    lines.join('\n')
  )
}

// Apply stored corrections to a freshly-loaded CompanyValueChain at READ
// time so the focus panel reflects user verdicts immediately, even before
// the next regen rebuilds the chain. Two kinds of mutation:
//   - 'not-relevant': drop nodes + drop any edge touching them.
//   - 'wrong-direction'/'wrong-relationship': flip edge endpoints/relationship
//     for every edge connecting the subject to the focus.
//
// Returns a new chain object — never mutates the input. When the chain has
// no corrections we return the original reference so identity-equality
// checks in the renderer can short-circuit.
export function applyCorrectionsToChain(chain: CompanyValueChain): CompanyValueChain {
  const corrections = listCorrectionsForFocus(chain.focus)
  if (corrections.length === 0) return chain

  const focus = chain.focus.toUpperCase()
  const dropped = new Set<string>()
  const directionFix = new Map<string, 'supplier' | 'customer'>()
  const relationshipFix = new Map<
    string,
    'supplier' | 'customer' | 'competitor' | 'partner'
  >()

  for (const c of corrections) {
    if (c.subjectType !== 'counterparty') continue
    const subject = c.subjectKey.toUpperCase()
    if (c.correctionType === 'not-relevant') {
      dropped.add(subject)
    } else if (c.correctionType === 'wrong-direction' && c.correctedValue?.direction) {
      directionFix.set(subject, c.correctedValue.direction)
    } else if (c.correctionType === 'wrong-relationship' && c.correctedValue?.relationship) {
      relationshipFix.set(subject, c.correctedValue.relationship)
    }
  }

  // Filter dropped nodes (excluding the focus itself — corrections can't
  // remove the chain's own focus). Also filter edges touching dropped nodes.
  const nodes = chain.nodes.filter((n) => !dropped.has(n.symbol.toUpperCase()))
  const edges: typeof chain.edges = []
  for (const e of chain.edges) {
    const from = e.from.toUpperCase()
    const to = e.to.toUpperCase()
    if (dropped.has(from) || dropped.has(to)) continue

    // Only touch edges that connect the focus to a corrected counterparty.
    // Edges between two non-focus nodes are left alone — corrections are
    // scoped to the user's view of the FOCUS's relationships.
    let counterparty: string | null = null
    if (from === focus) {
      counterparty = to
    } else if (to === focus) {
      counterparty = from
    }

    if (counterparty) {
      const newRel = relationshipFix.get(counterparty)
      const newDir = directionFix.get(counterparty)
      // EDGE SCHEMA INVARIANT: relationship='customer' on a (from, to) edge
      // means "from BUYS from to" (i.e. from is the customer side). So an
      // edge expressing "counterparty is a customer of focus" — the user's
      // intent for direction='customer' or relationship='customer' — must
      // emit relationship='supplier' with focus on the FROM side (focus
      // supplies counterparty). Equivalently: relationship='customer' with
      // counterparty on the FROM side. We pick the supplier form for both
      // because unverifiedExtras (in ValueChain.tsx) is more permissive
      // about the supplier shape and renders consistently.
      const buildEdge = (
        target: 'supplier' | 'customer' | 'competitor' | 'partner'
      ): typeof e => {
        if (target === 'supplier') {
          // counter SUPPLIES focus → counter is FROM, focus is TO
          return {
            from: counterparty as string,
            to: focus,
            relationship: 'supplier',
            note: e.note,
            source: e.source ?? null
          }
        }
        if (target === 'customer') {
          // counter is CUSTOMER of focus = focus SUPPLIES counter
          // → focus is FROM, counter is TO, relationship='supplier'
          return {
            from: focus,
            to: counterparty as string,
            relationship: 'supplier',
            note: e.note,
            source: e.source ?? null
          }
        }
        // competitor/partner are symmetric; keep the original (from, to)
        // ordering and just swap the relationship.
        return { ...e, relationship: target }
      }
      if (newRel) {
        edges.push(buildEdge(newRel))
        continue
      }
      if (newDir) {
        edges.push(buildEdge(newDir))
        continue
      }
    }

    edges.push(e)
  }

  return {
    ...chain,
    nodes,
    edges
  }
}
