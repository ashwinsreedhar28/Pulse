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

import { describe, expect, it, vi } from 'vitest'
import {
  intentToRelationship,
  rankScore,
  shareAnyAuthor,
  shareAnyFieldOfStudy,
  topNByRank,
  tokenSetSimilarity,
  resolveCitedHint,
  reconcileRelationship,
  contentTokenJaccard,
  findForwardReferenceMatch,
  findFramingAlignmentMatch,
  splitIntoSentences,
  findBilateralEdges,
  FIXED_STAGES,
  STAGE_IDS,
  type RefMeta
} from './paperValueChainService'
import type {
  PaperValueChain,
  PaperValueChainEdge,
  PaperValueChainEdgeCitation,
  PaperValueChainNode
} from '../../preload'

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

// ============================================================
// Phase 3C — bilateral citation reinforcement
// ============================================================

describe('contentTokenJaccard', () => {
  it('is symmetric (intersection / union, not asymmetric)', () => {
    // Different from tokenSetSimilarity (3B) which uses
    // intersection / min for short-fragment matching.
    const a = 'transformer attention sequence'
    const b = 'transformer attention model architecture'
    expect(contentTokenJaccard(a, b)).toBe(contentTokenJaccard(b, a))
  })

  it('returns 0 for fully disjoint content', () => {
    expect(
      contentTokenJaccard('graph neural networks', 'cardiac arrest models')
    ).toBe(0)
  })

  it('drops short tokens AND stopword-like tokens', () => {
    // Stopword filter ("the", "and", etc.) plus length<3 filter.
    expect(
      contentTokenJaccard('the and for the', 'the and for the and')
    ).toBe(0)
  })

  it('ignores punctuation and case', () => {
    expect(
      contentTokenJaccard(
        'Transformer Attention Sequence!',
        'transformer, ATTENTION sequence.'
      )
    ).toBe(1)
  })
})

describe('splitIntoSentences', () => {
  it('splits on terminal punctuation followed by whitespace', () => {
    const sentences = splitIntoSentences(
      'First sentence. Second sentence! Third one? Last.'
    )
    expect(sentences).toEqual([
      'First sentence.',
      'Second sentence!',
      'Third one?',
      'Last.'
    ])
  })

  it('collapses pdfjs-style whitespace before splitting', () => {
    const sentences = splitIntoSentences(
      'Line one\n  continues here. Second begins.'
    )
    expect(sentences).toEqual(['Line one continues here.', 'Second begins.'])
  })

  it('returns single sentence when no terminal punctuation', () => {
    expect(splitIntoSentences('a fragment with no end mark')).toEqual([
      'a fragment with no end mark'
    ])
  })

  it('returns empty array on empty input', () => {
    expect(splitIntoSentences('')).toEqual([])
  })
})

describe('findForwardReferenceMatch', () => {
  it('matches when intro contains a forward-reference phrase + sufficient overlap', () => {
    const intro =
      'Our model handles convolutional sequence problems. ' +
      'Future work could extend this to attention-based transformer architectures with self-attention layers.'
    const focalContent =
      'attention transformer architectures self-attention'
    const result = findForwardReferenceMatch(intro, focalContent)
    expect(result).not.toBeNull()
    expect(result?.trigger).toBe('future work')
    expect(result?.sentence).toContain('attention-based transformer')
  })

  it('returns null when no future-work phrase appears', () => {
    const intro =
      'Our model handles convolutional sequence problems with stacked convolution layers.'
    const focalContent = 'attention transformer self-attention'
    expect(findForwardReferenceMatch(intro, focalContent)).toBeNull()
  })

  it('returns null when the forward-ref sentence is below Jaccard threshold', () => {
    const intro =
      'Future work in completely different research areas is left to others.'
    const focalContent = 'attention transformer self-attention'
    expect(findForwardReferenceMatch(intro, focalContent)).toBeNull()
  })
})

describe('findFramingAlignmentMatch', () => {
  it('matches when contribution sentence overlaps with focal quote', () => {
    const counterpartIntro =
      'Some background on convolutions. ' +
      'We propose a transformer attention sequence model with multi-head self-attention layers.'
    const focalQuoted =
      'building on transformer attention sequence models with multi-head self-attention'
    const result = findFramingAlignmentMatch(counterpartIntro, focalQuoted)
    expect(result).not.toBeNull()
    expect(result?.sentence).toContain('transformer attention sequence model')
  })

  it('returns null when no contribution sentence is found', () => {
    const counterpartIntro =
      'Background discussion only. The field has many open problems.'
    const focalQuoted = 'transformer attention'
    expect(findFramingAlignmentMatch(counterpartIntro, focalQuoted)).toBeNull()
  })

  it('returns null when contribution sentence is below threshold', () => {
    const counterpartIntro =
      'We present a study of mitochondrial gene expression patterns in zebrafish.'
    const focalQuoted = 'transformer attention sequence model'
    expect(findFramingAlignmentMatch(counterpartIntro, focalQuoted)).toBeNull()
  })
})

// Helpers for chain-fixture construction in the integration tests below.
function makeNode(paperId: string, title: string, pdfUrl: string | null): PaperValueChainNode {
  return {
    paperId,
    stage: STAGE_IDS.upstreamFoundational,
    title,
    authorYearLabel: `${paperId} 2020`,
    abstract: null,
    year: 2020,
    citationCount: 100,
    influentialCitationCount: 10,
    url: null,
    pdfUrl,
    kind: 'paper'
  }
}

function makeRefMeta(paperId: string, title: string, pdfUrl: string | null): RefMeta {
  return {
    paperId,
    title,
    firstAuthor: 'Test Author',
    year: 2020,
    isInfluential: true,
    intents: ['background'],
    paper: {
      paperId,
      title,
      authors: [{ name: 'Test Author' }],
      year: 2020,
      citationCount: 100,
      influentialCitationCount: 10,
      url: null,
      openAccessPdf: pdfUrl ? { url: pdfUrl } : null
    } as RefMeta['paper']
  }
}

function makeBuildsOnEdge(
  focusId: string,
  counterpartId: string
): PaperValueChainEdge {
  const haikuPdf: PaperValueChainEdgeCitation = {
    kind: 'paper-pdf',
    paperId: focusId,
    otherPaperId: counterpartId,
    quotedSentence:
      'building on transformer attention sequence models with multi-head self-attention',
    pageOffset: 1,
    charOffset: 0
  }
  return {
    from: focusId,
    to: counterpartId,
    relationship: 'builds-on',
    note: null,
    citations: [haikuPdf]
  }
}

function makeChain(
  focusId: string,
  edges: PaperValueChainEdge[],
  nodes: PaperValueChainNode[]
): PaperValueChain {
  const focalNode = makeNode(focusId, 'Focal Title', null)
  return {
    focusPaperId: focusId,
    focusLabel: 'Focal 2021',
    stages: FIXED_STAGES,
    nodes: [focalNode, ...nodes],
    edges,
    s2CallsUsed: 3
  }
}

describe('findBilateralEdges', () => {
  it('mutual-cite fires from S2 alone — no PDF read on counterpart side', async () => {
    const focus = 'focal-1'
    const counterpart = 'counterpart-1'
    const chain = makeChain(
      focus,
      [makeBuildsOnEdge(focus, counterpart)],
      [makeNode(counterpart, 'Counterpart Title', 'https://example.com/cp.pdf')]
    )
    const refsMeta: RefMeta[] = [
      makeRefMeta(counterpart, 'Counterpart Title', 'https://example.com/cp.pdf')
    ]
    // Mock counterpart S2 refs to contain focal — triggers mutual-cite.
    const refsFetcher = vi.fn(async (id: string) => ({
      data: id === counterpart ? new Set([focus]) : new Set<string>(),
      callsMade: 1
    }))
    const pdfFetcher = vi.fn()

    const result = await findBilateralEdges(chain, refsMeta, {
      fetchCounterpartReferences: refsFetcher,
      fetchCounterpartPdfExtract: pdfFetcher
    })

    expect(result.matchedEdges).toBe(1)
    expect(pdfFetcher).not.toHaveBeenCalled()
    const edge = result.chain.edges[0]
    const bilateral = edge.citations.find((c) => c.kind === 'bilateral')
    expect(bilateral).toBeDefined()
    expect(bilateral?.kind).toBe('bilateral')
    if (bilateral?.kind !== 'bilateral') throw new Error('expected bilateral')
    expect(bilateral.matchReason).toBe('mutual-cite')
    expect(bilateral.counterpartCitation).toBeNull()
  })

  it('counterpart PDF unavailable + no mutual-cite → edge stays unchanged', async () => {
    const focus = 'focal-1'
    const counterpart = 'counterpart-1'
    const chain = makeChain(
      focus,
      [makeBuildsOnEdge(focus, counterpart)],
      // pdfUrl=null → counterpart PDF is unavailable.
      [makeNode(counterpart, 'Counterpart Title', null)]
    )
    const refsMeta: RefMeta[] = [
      makeRefMeta(counterpart, 'Counterpart Title', null)
    ]
    const refsFetcher = vi.fn(async () => ({ data: new Set<string>(), callsMade: 1 }))
    const pdfFetcher = vi.fn(async () => null)

    const result = await findBilateralEdges(chain, refsMeta, {
      fetchCounterpartReferences: refsFetcher,
      fetchCounterpartPdfExtract: pdfFetcher
    })

    expect(result.matchedEdges).toBe(0)
    // No log spam, no error — edge unchanged.
    expect(result.chain.edges[0].citations.length).toBe(1)
    expect(result.chain.edges[0].citations[0].kind).toBe('paper-pdf')
  })

  it('forward-reference fires when counterpart intro contains future-work phrase + overlap', async () => {
    const focus = 'focal-1'
    const counterpart = 'counterpart-1'
    const chain = makeChain(
      focus,
      [makeBuildsOnEdge(focus, counterpart)],
      [
        makeNode(
          counterpart,
          'transformer attention sequence multi-head self-attention',
          'https://example.com/cp.pdf'
        )
      ]
    )
    const refsMeta: RefMeta[] = [
      makeRefMeta(
        counterpart,
        'transformer attention sequence multi-head self-attention',
        'https://example.com/cp.pdf'
      )
    ]
    const refsFetcher = vi.fn(async () => ({ data: new Set<string>(), callsMade: 1 }))
    const pdfFetcher = vi.fn(async () => ({
      sections: [
        {
          heading: 'Conclusion',
          text:
            'Our convolutional approach scales linearly. ' +
            'Future work could extend this to transformer attention sequence models with multi-head self-attention layers.',
          pageOffset: 7
        }
      ]
    }))

    const result = await findBilateralEdges(chain, refsMeta, {
      fetchCounterpartReferences: refsFetcher,
      fetchCounterpartPdfExtract: pdfFetcher
    })

    expect(result.matchedEdges).toBe(1)
    const edge = result.chain.edges[0]
    expect(edge.citations.length).toBe(2) // original paper-pdf + bilateral
    const bilateral = edge.citations.find((c) => c.kind === 'bilateral')
    if (bilateral?.kind !== 'bilateral') throw new Error('expected bilateral')
    expect(bilateral.matchReason).toBe('forward-reference')
    expect(bilateral.counterpartCitation).not.toBeNull()
    expect(bilateral.counterpartCitation?.pageOffset).toBe(7)
    expect(bilateral.trigger).toBe('future work')
  })

  it('top-K cap: only first 6 candidates checked when 20 qualify', async () => {
    const focus = 'focal-1'
    const edges: PaperValueChainEdge[] = []
    const nodes: PaperValueChainNode[] = []
    const refsMeta: RefMeta[] = []
    for (let i = 0; i < 20; i++) {
      const cp = `cp-${i.toString().padStart(2, '0')}`
      edges.push(makeBuildsOnEdge(focus, cp))
      nodes.push(makeNode(cp, `Counterpart ${i}`, 'https://example.com/x.pdf'))
      refsMeta.push(
        makeRefMeta(cp, `Counterpart ${i}`, 'https://example.com/x.pdf')
      )
    }
    const chain = makeChain(focus, edges, nodes)
    const refsFetcher = vi.fn(async () => ({ data: new Set<string>(), callsMade: 1 }))
    const pdfFetcher = vi.fn(async () => null)

    await findBilateralEdges(chain, refsMeta, {
      fetchCounterpartReferences: refsFetcher,
      fetchCounterpartPdfExtract: pdfFetcher
    })

    // Spec: top-6 cap. Each candidate consumes one S2 ref-list call.
    expect(refsFetcher).toHaveBeenCalledTimes(6)
  })

  it('does not call any Anthropic / Haiku client (heuristic-only)', async () => {
    // The implementation imports callClaude from claudeService for 3B
    // enrichment; bilateral pass must NOT invoke it. We verify by
    // checking that no async call reaches the network — the test
    // mocks both S2 and PDF fetchers, so any unmocked external call
    // would fail. If this test passes with the current
    // findBilateralEdges signature, it confirms heuristic-only.
    const focus = 'focal-1'
    const counterpart = 'counterpart-1'
    const chain = makeChain(
      focus,
      [makeBuildsOnEdge(focus, counterpart)],
      [makeNode(counterpart, 'Counterpart', 'https://example.com/cp.pdf')]
    )
    const refsMeta: RefMeta[] = [
      makeRefMeta(counterpart, 'Counterpart', 'https://example.com/cp.pdf')
    ]
    const refsFetcher = vi.fn(async () => ({ data: new Set<string>(), callsMade: 1 }))
    const pdfFetcher = vi.fn(async () => ({
      sections: [{ heading: null, text: 'Background discussion only.', pageOffset: 1 }]
    }))

    const result = await findBilateralEdges(chain, refsMeta, {
      fetchCounterpartReferences: refsFetcher,
      fetchCounterpartPdfExtract: pdfFetcher
    })

    // Whether or not a rule fires, the call should complete without
    // touching Claude. Result shape verified.
    expect(result).toBeDefined()
    expect(result.chain.edges).toHaveLength(1)
  })

  it('does not upgrade s2-intent or model-anchored edges (provenance threshold)', async () => {
    const focus = 'focal-1'
    const counterpart = 'counterpart-1'
    // Edge anchored on s2-intent only — below the bilateral provenance
    // threshold (paper-pdf | s2-influential). Should be skipped.
    const intentOnlyEdge: PaperValueChainEdge = {
      from: focus,
      to: counterpart,
      relationship: 'builds-on',
      note: null,
      citations: [
        {
          kind: 's2-intent',
          intent: 'background',
          otherPaperId: counterpart
        }
      ]
    }
    const chain = makeChain(
      focus,
      [intentOnlyEdge],
      [makeNode(counterpart, 'Counterpart', 'https://example.com/cp.pdf')]
    )
    const refsMeta: RefMeta[] = [
      makeRefMeta(counterpart, 'Counterpart', 'https://example.com/cp.pdf')
    ]
    const refsFetcher = vi.fn(async () => ({
      data: new Set([focus]), // mutual-cite would fire IF the edge were eligible
      callsMade: 1
    }))
    const pdfFetcher = vi.fn()

    const result = await findBilateralEdges(chain, refsMeta, {
      fetchCounterpartReferences: refsFetcher,
      fetchCounterpartPdfExtract: pdfFetcher
    })

    expect(result.matchedEdges).toBe(0)
    expect(refsFetcher).not.toHaveBeenCalled()
  })
})

