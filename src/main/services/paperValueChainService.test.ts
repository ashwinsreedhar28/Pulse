// Pure-function unit tests for paperValueChainService. Written in vitest
// syntax so they're picked up automatically once a test runner is wired
// in (no runner is currently installed — `npm test` is a stub). Until
// then they serve as executable documentation of the expected behavior
// for each acceptance criterion in the Phase 3A spec.
//
// Imports only the pure exports (no S2 calls, no DB writes), which is
// why the test file lives alongside the service rather than in a separate
// /tests directory — colocates the assertion with the code under test
// and avoids needing a separate import path.

import { describe, expect, it } from 'vitest'
import {
  intentToRelationship,
  rankScore,
  shareAnyAuthor,
  shareAnyFieldOfStudy,
  topNByRank,
  FIXED_STAGES,
  STAGE_IDS
} from './paperValueChainService'

describe('intentToRelationship', () => {
  describe('focal-cites-other (upstream)', () => {
    it("maps background → builds-on", () => {
      expect(intentToRelationship('background', 'focal-cites-other')).toBe('builds-on')
    })

    it("maps methodology → uses-method", () => {
      expect(intentToRelationship('methodology', 'focal-cites-other')).toBe('uses-method')
    })

    it("maps extension and result → extends", () => {
      expect(intentToRelationship('extension', 'focal-cites-other')).toBe('extends')
      expect(intentToRelationship('result', 'focal-cites-other')).toBe('extends')
    })

    it("maps comparison → contrasts", () => {
      expect(intentToRelationship('comparison', 'focal-cites-other')).toBe('contrasts')
    })

    it("returns null for unknown intent", () => {
      expect(intentToRelationship('discussion', 'focal-cites-other')).toBeNull()
    })

    it("normalizes case", () => {
      expect(intentToRelationship('Background', 'focal-cites-other')).toBe('builds-on')
    })
  })

  describe('other-cites-focal (downstream)', () => {
    it("maps extension → extends", () => {
      expect(intentToRelationship('extension', 'other-cites-focal')).toBe('extends')
    })

    it("maps methodology → uses-method", () => {
      expect(intentToRelationship('methodology', 'other-cites-focal')).toBe('uses-method')
    })

    it("maps comparison → contrasts even without phrase hint", () => {
      expect(intentToRelationship('comparison', 'other-cites-focal')).toBe('contrasts')
    })

    it("maps result → extends without contrast phrase, contrasts with phrase", () => {
      expect(intentToRelationship('result', 'other-cites-focal')).toBe('extends')
      expect(
        intentToRelationship('result', 'other-cites-focal', { contrastPhraseFound: true })
      ).toBe('contrasts')
    })

    it("maps background → builds-on (rare downstream case)", () => {
      // Some citing papers cite the focal as background — they still build
      // on the focal's premises, so 'builds-on' is the right label.
      expect(intentToRelationship('background', 'other-cites-focal')).toBe('builds-on')
    })
  })
})

describe('rankScore', () => {
  it("favors influential citations heavily", () => {
    const a = rankScore({ isInfluential: true, citationCount: 100, influentialCitationCount: 10 })
    const b = rankScore({ isInfluential: false, citationCount: 100, influentialCitationCount: 10 })
    expect(a - b).toBe(5)
  })

  it("scales with influentialCitationCount linearly (×2 weight)", () => {
    const a = rankScore({ isInfluential: false, citationCount: 100, influentialCitationCount: 10 })
    const b = rankScore({ isInfluential: false, citationCount: 100, influentialCitationCount: 20 })
    expect(b - a).toBe(20)
  })

  it("uses log10 on citation count to prevent landmark dominance", () => {
    const a = rankScore({ isInfluential: false, citationCount: 100, influentialCitationCount: 0 })
    const b = rankScore({ isInfluential: false, citationCount: 10000, influentialCitationCount: 0 })
    // 10000 has 100x more cites but only ~2x more score (log10).
    expect(b - a).toBe(2)
  })

  it("clamps citationCount=0 to a positive log argument", () => {
    const score = rankScore({
      isInfluential: false,
      citationCount: 0,
      influentialCitationCount: 0
    })
    expect(score).toBe(0)
  })
})

describe('topNByRank', () => {
  const make = (id: string, score: number) => ({ item: { paperId: id }, score })

  it("returns top N by score descending", () => {
    const result = topNByRank(
      [make('a', 1), make('b', 5), make('c', 3), make('d', 4), make('e', 2)],
      3
    )
    expect(result.map((x) => x.paperId)).toEqual(['b', 'd', 'c'])
  })

  it("respects limit when fewer candidates", () => {
    const result = topNByRank([make('a', 1), make('b', 2)], 8)
    expect(result.map((x) => x.paperId)).toEqual(['b', 'a'])
  })

  it("breaks ties stably by paperId for cross-run determinism", () => {
    // Acceptance: "two-paper-chain comparability test: generating chains
    // for two distinct papers produces stage labels in identical
    // positions" — the comparability rests on stable ordering, which
    // means equal scores need a deterministic tiebreak.
    const result1 = topNByRank(
      [make('zebra', 5), make('apple', 5), make('mango', 5)],
      3
    )
    const result2 = topNByRank(
      [make('mango', 5), make('zebra', 5), make('apple', 5)],
      3
    )
    expect(result1.map((x) => x.paperId)).toEqual(result2.map((x) => x.paperId))
  })
})

describe('shareAnyFieldOfStudy', () => {
  it("returns true for overlapping fields", () => {
    expect(shareAnyFieldOfStudy(['CS', 'Math'], ['Biology', 'CS'])).toBe(true)
  })

  it("is case-insensitive", () => {
    expect(shareAnyFieldOfStudy(['cs'], ['CS'])).toBe(true)
  })

  it("returns false for non-overlapping fields", () => {
    expect(shareAnyFieldOfStudy(['CS'], ['Biology'])).toBe(false)
  })

  it("treats empty / null arrays as 'no info' (returns false)", () => {
    // Conservative: when either side is missing fieldsOfStudy we don't
    // claim same OR different — caller must decide.
    expect(shareAnyFieldOfStudy([], ['CS'])).toBe(false)
    expect(shareAnyFieldOfStudy(null, ['CS'])).toBe(false)
    expect(shareAnyFieldOfStudy(['CS'], undefined)).toBe(false)
    expect(shareAnyFieldOfStudy(null, null)).toBe(false)
  })
})

describe('shareAnyAuthor', () => {
  it("matches by authorId when present", () => {
    expect(
      shareAnyAuthor([{ authorId: '1', name: 'Alice' }], [{ authorId: '1', name: 'Different' }])
    ).toBe(true)
  })

  it("falls back to name match when authorId missing", () => {
    expect(
      shareAnyAuthor([{ name: 'Alice Smith' }], [{ name: 'alice smith' }])
    ).toBe(true)
  })

  it("returns false when neither id nor name overlap", () => {
    expect(
      shareAnyAuthor([{ authorId: '1', name: 'Alice' }], [{ authorId: '2', name: 'Bob' }])
    ).toBe(false)
  })

  it("handles empty / null", () => {
    expect(shareAnyAuthor([], [{ name: 'A' }])).toBe(false)
    expect(shareAnyAuthor(null, [{ name: 'A' }])).toBe(false)
  })
})

describe('FIXED_STAGES', () => {
  it("has 8 stages in time-axis order", () => {
    // 7 active stages + 1 stub (Replications/Refutations) per spec.
    expect(FIXED_STAGES).toHaveLength(8)
    expect(FIXED_STAGES.map((s) => s.id)).toEqual([
      STAGE_IDS.upstreamFoundational,
      STAGE_IDS.upstreamMethodological,
      STAGE_IDS.upstreamAncestors,
      STAGE_IDS.focal,
      STAGE_IDS.downstreamExtensions,
      STAGE_IDS.downstreamApplications,
      STAGE_IDS.downstreamContrasts,
      STAGE_IDS.downstreamReplications
    ])
  })

  it("places focal at order=3 with band='focal'", () => {
    const focal = FIXED_STAGES.find((s) => s.id === STAGE_IDS.focal)
    expect(focal?.order).toBe(3)
    expect(focal?.band).toBe('focal')
  })

  it("groups stages into upstream / focal / downstream bands consistently", () => {
    const upstream = FIXED_STAGES.filter((s) => s.band === 'upstream')
    const downstream = FIXED_STAGES.filter((s) => s.band === 'downstream')
    expect(upstream.map((s) => s.order)).toEqual([0, 1, 2])
    expect(downstream.map((s) => s.order)).toEqual([4, 5, 6, 7])
  })

  it("two-paper-chain comparability — stage labels at identical positions", () => {
    // Acceptance criterion: any two chains have stages at the same index,
    // because the taxonomy is fixed. This tests that we never mutate the
    // shared FIXED_STAGES array per chain.
    const labelsAtIndex = (i: number) => FIXED_STAGES[i].label
    expect(labelsAtIndex(0)).toBe('Foundational')
    expect(labelsAtIndex(3)).toBe('Focal')
    expect(labelsAtIndex(7)).toBe('Replications / Refutations')
  })
})
