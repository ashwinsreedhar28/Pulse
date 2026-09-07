// Tests for cross-source paper merging.
//
// The same paper routinely appears as an arXiv preprint, an OpenAlex record
// and an S2 record under three different ids, so dedup has to key on the
// title. Getting this wrong shows up as duplicate cards in the results list
// rather than as an error, which is exactly the kind of thing worth pinning
// down in a test.

import { describe, it, expect } from 'vitest'
import { mergePaperSources } from './corpusService'
import type { ResearchPaper } from '../../preload'

function paper(over: Partial<ResearchPaper> & { paperId: string; title: string }): ResearchPaper {
  return {
    abstract: null,
    year: null,
    authors: [],
    venue: null,
    citationCount: 0,
    influentialCitationCount: 0,
    url: null,
    pdfUrl: null,
    arxivId: null,
    doi: null,
    ...over
  }
}

describe('mergePaperSources', () => {
  it('keeps a single copy when the same title arrives from two sources', () => {
    const s2 = [paper({ paperId: 'abc123', title: 'Attention Is All You Need' })]
    const arxiv = [paper({ paperId: 'arxiv:1706.03762', title: 'Attention is all you need' })]
    const merged = mergePaperSources(s2, arxiv)
    expect(merged).toHaveLength(1)
    // Earlier list wins — callers pass S2 first because its metadata is richest.
    expect(merged[0].paperId).toBe('abc123')
  })

  it('normalizes punctuation and spacing when comparing titles', () => {
    const a = [paper({ paperId: 'a', title: 'Deep Residual Learning, Revisited!' })]
    const b = [paper({ paperId: 'b', title: 'deep   residual learning revisited' })]
    expect(mergePaperSources(a, b)).toHaveLength(1)
  })

  it('backfills fields the winning record lacks', () => {
    // The point of merging rather than just deduping: an arXiv hit can supply
    // a PDF that the S2 record was missing.
    const s2 = [paper({ paperId: 'abc', title: 'A Paper', pdfUrl: null, doi: null })]
    const arxiv = [
      paper({
        paperId: 'arxiv:1234.5678',
        title: 'A Paper',
        pdfUrl: 'https://arxiv.org/pdf/1234.5678',
        arxivId: '1234.5678',
        abstract: 'from arxiv'
      })
    ]
    const [merged] = mergePaperSources(s2, arxiv)
    expect(merged.paperId).toBe('abc')
    expect(merged.pdfUrl).toBe('https://arxiv.org/pdf/1234.5678')
    expect(merged.arxivId).toBe('1234.5678')
    expect(merged.abstract).toBe('from arxiv')
  })

  it('does not overwrite fields the winning record already has', () => {
    const s2 = [paper({ paperId: 'abc', title: 'A Paper', abstract: 'authoritative' })]
    const other = [paper({ paperId: 'x', title: 'A Paper', abstract: 'lower quality' })]
    expect(mergePaperSources(s2, other)[0].abstract).toBe('authoritative')
  })

  it('keeps genuinely different papers apart', () => {
    const merged = mergePaperSources([
      paper({ paperId: 'a', title: 'Attention Is All You Need' }),
      paper({ paperId: 'b', title: 'BERT: Pre-training of Deep Bidirectional Transformers' })
    ])
    expect(merged).toHaveLength(2)
  })

  it('drops a repeated paperId even when titles differ', () => {
    const merged = mergePaperSources(
      [paper({ paperId: 'same', title: 'One Title' })],
      [paper({ paperId: 'same', title: 'A Different Title' })]
    )
    expect(merged).toHaveLength(1)
  })

  it('handles empty inputs', () => {
    expect(mergePaperSources()).toEqual([])
    expect(mergePaperSources([], [])).toEqual([])
  })
})
