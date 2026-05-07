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
  tokenSetSimilarity,
  resolveCitedHint,
  reconcileRelationship,
  FIXED_STAGES,
  STAGE_IDS,
  type RefMeta
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

// ============================================================
// Phase 3B — focal-paper-intro enrichment
// ============================================================

describe('tokenSetSimilarity', () => {
  it('returns 1 for identical token sets', () => {
    expect(tokenSetSimilarity('attention is all you need', 'attention is all you need')).toBe(1)
  })

  it('is asymmetric: short fragments score high against long titles', () => {
    // Spec: token-set similarity uses intersection / min, so a short
    // partial title gets a high score against a long matching title.
    const sim = tokenSetSimilarity(
      'attention all need',
      'Attention Is All You Need: A Transformer Approach'
    )
    expect(sim).toBeGreaterThanOrEqual(0.7)
  })

  it('returns 0 for disjoint token sets', () => {
    expect(tokenSetSimilarity('graph neural networks', 'cardiac arrest models')).toBe(0)
  })

  it('drops tokens shorter than 3 chars (filters articles)', () => {
    // "is", "a", "in" are dropped. "transformer" is kept on both sides.
    const sim = tokenSetSimilarity('a transformer is in', 'a transformer is in')
    expect(sim).toBe(1)
    // No real tokens on either side ("is", "a" both dropped) → 0.
    expect(tokenSetSimilarity('is a', 'in a')).toBe(0)
  })

  it('handles punctuation and case', () => {
    expect(
      tokenSetSimilarity('GraphNet: Neural Networks', 'graphnet  Neural,  networks!')
    ).toBe(1)
  })
})

describe('resolveCitedHint', () => {
  const refs: RefMeta[] = [
    {
      paperId: 's2:vaswani-2017',
      title: 'Attention Is All You Need',
      firstAuthor: 'Ashish Vaswani',
      year: 2017,
      isInfluential: true,
      intents: ['methodology'],
      paper: {
        paperId: 's2:vaswani-2017',
        title: 'Attention Is All You Need',
        authors: [{ name: 'Ashish Vaswani' }],
        year: 2017
      }
    },
    {
      paperId: 's2:he-2016',
      title: 'Deep Residual Learning for Image Recognition',
      firstAuthor: 'Kaiming He',
      year: 2016,
      isInfluential: true,
      intents: ['background'],
      paper: {
        paperId: 's2:he-2016',
        title: 'Deep Residual Learning for Image Recognition',
        authors: [{ name: 'Kaiming He' }],
        year: 2016
      }
    },
    {
      paperId: 's2:smith-2019',
      title: 'A Smaller Approach to Sparse Attention',
      firstAuthor: 'Jane Smith',
      year: 2019,
      isInfluential: false,
      intents: ['background'],
      paper: {
        paperId: 's2:smith-2019',
        title: 'A Smaller Approach to Sparse Attention',
        authors: [{ name: 'Jane Smith' }],
        year: 2019
      }
    }
  ]

  it('matches by token-set ≥0.7 + first-author surname (Path 1)', () => {
    expect(
      resolveCitedHint(
        { titleFragment: 'Attention Is All You Need', firstAuthor: 'Vaswani' },
        refs
      )
    ).toBe('s2:vaswani-2017')
  })

  it('matches partial title fragments via Path 1', () => {
    expect(
      resolveCitedHint(
        { titleFragment: 'attention all need', firstAuthor: 'Vaswani', year: 2017 },
        refs
      )
    ).toBe('s2:vaswani-2017')
  })

  it('rejects when title matches but author differs (Path 1 needs both)', () => {
    expect(
      resolveCitedHint(
        { titleFragment: 'Attention Is All You Need', firstAuthor: 'Different' },
        refs
      )
    ).toBeNull()
  })

  it('matches by exact year + title prefix (Path 2)', () => {
    // Even when surname differs, exact year + identical first 30 chars
    // of title resolves.
    expect(
      resolveCitedHint(
        {
          titleFragment: 'Deep Residual Learning for Imag',
          firstAuthor: 'WrongAuthor',
          year: 2016
        },
        refs
      )
    ).toBe('s2:he-2016')
  })

  it('returns null when neither path matches (hallucination defense)', () => {
    // Hint names a paper that isn't in the focal's reference list.
    // Phase 3B drops these silently — never adds as kind:'unverified'.
    expect(
      resolveCitedHint(
        {
          titleFragment: 'Some Fictional Architecture',
          firstAuthor: 'Doesnotexist',
          year: 2099
        },
        refs
      )
    ).toBeNull()
  })

  it('uses surname (last word) for author match — handles full names', () => {
    // First-author "Ashish Vaswani"; hint says "A. Vaswani" or just
    // "Vaswani" — both should match because we compare last words.
    expect(
      resolveCitedHint(
        { titleFragment: 'Attention Is All You Need', firstAuthor: 'A. Vaswani' },
        refs
      )
    ).toBe('s2:vaswani-2017')
  })
})

describe('reconcileRelationship', () => {
  it('Haiku contrasts always overrides existing positive relationship', () => {
    // Negative-citation override per spec — S2's classifier is known
    // to be weak on negative citations, so Haiku's reading wins.
    expect(reconcileRelationship('builds-on', 'contrasts', true)).toBe('contrasts')
    expect(reconcileRelationship('builds-on', 'contrasts', false)).toBe('contrasts')
  })

  it('Haiku refutes always overrides existing positive relationship', () => {
    expect(reconcileRelationship('extends', 'refutes', true)).toBe('refutes')
    expect(reconcileRelationship('uses-method', 'refutes', false)).toBe('refutes')
  })

  it('Haiku positive defers to existing when s2-influential anchored', () => {
    // s2-influential is the strongest S2 signal; we don't downgrade.
    expect(reconcileRelationship('uses-method', 'extends', true)).toBe('uses-method')
    expect(reconcileRelationship('builds-on', 'extends', true)).toBe('builds-on')
  })

  it('Haiku positive overrides existing when not anchored on influential', () => {
    expect(reconcileRelationship('extends', 'uses-method', false)).toBe('uses-method')
    expect(reconcileRelationship('extends', 'builds-on', false)).toBe('builds-on')
  })
})

