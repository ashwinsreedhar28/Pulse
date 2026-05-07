// Per-paper PDF text extraction. Used by Phase 3B's enrichWithFocalPaperReading
// to ground Haiku on the focal paper's intro + related-work; will also feed
// 3C's bilateral checks. Cached for 90 days in paper_pdf_extracts.
//
// pdfjs-dist 4.x runs in Node when imported via the legacy build entry
// (`pdfjs-dist/legacy/build/pdf.mjs`). The default ESM entry assumes a DOM
// (uses `Image`, `OffscreenCanvas`) and explodes in Electron's main
// process. Legacy entry is the supported path for Node-side text
// extraction per pdfjs-dist's docs.
//
// Fetches respect the 5s fast-fail pattern from the rest of the codebase
// (the fetch-timeout work in this same dev session). PDF parse itself
// has a separate budget so a malformed PDF can't hang the chain
// generation forever.

import {
  getPaperPdfExtract,
  upsertPaperPdfExtract,
  type PaperPdfExtract,
  type PaperPdfSection
} from '../database/paperPdfExtracts'

const FETCH_TIMEOUT_MS = 8_000
const PARSE_TIMEOUT_MS = 12_000
// 90-day cache TTL per spec. Reads older than this are treated as a
// miss and re-fetched. Long enough that a paper's intro is effectively
// never re-read in practice (an intro doesn't change post-publication);
// the TTL exists mainly so we re-parse if pdfjs-dist gets better at
// extracting tables/columns over time.
const CACHE_TTL_MS = 90 * 86_400_000
// Hard cap on how much intro/related-work text we hand to Haiku.
// 6_000 token budget per spec ≈ 24_000 chars at the standard 4-chars-
// per-token estimate. Anything past this is dropped before the Haiku
// call so we never blow the model's context window or pay for tokens
// that won't influence the structured output.
const MAX_RAW_INTRO_CHARS = 24_000
// Headings that signal we've left the intro/related-work and are now
// in the methods/results body of the paper. Lowercased, matched as a
// substring of the line (normalized) so "3. Method" and "Methodology"
// both trip the boundary. Conservative list — false positives stop
// extraction early; false negatives let body text bleed into the
// extract. Better to err on the side of stopping early than to feed
// methods sections into Haiku.
const BODY_BOUNDARY_TOKENS = [
  'method',
  'methods',
  'methodology',
  'approach',
  'experimental setup',
  'experiments',
  'data and methods',
  'materials and methods'
]

interface PdfExtractResult {
  ok: boolean
  extract: PaperPdfExtract | null
  reason?: 'no-pdf-url' | 'fetch-failed' | 'parse-failed' | 'empty'
}

// Cache-first read. Returns the cached extract on hit (within TTL),
// otherwise null so the caller can decide whether to fetch.
export function getCachedPdfExtract(paperId: string): PaperPdfExtract | null {
  const cached = getPaperPdfExtract(paperId)
  if (!cached) return null
  if (Date.now() - cached.extractedAt > CACHE_TTL_MS) return null
  return cached
}

// Top-level entry. Cache-aware. On miss, fetches the PDF, runs
// pdfjs-dist text extraction, walks pages until we hit a body-boundary
// heading, persists, returns. Any failure mode returns a tagged
// PdfExtractResult so the caller can render a "metadata only" badge.
export async function extractFocalPaperIntro(input: {
  paperId: string
  pdfUrl: string | null
}): Promise<PdfExtractResult> {
  if (!input.pdfUrl) {
    return { ok: false, extract: null, reason: 'no-pdf-url' }
  }
  const cached = getCachedPdfExtract(input.paperId)
  if (cached) {
    return { ok: true, extract: cached }
  }

  const buf = await fetchPdfBuffer(input.pdfUrl)
  if (!buf) {
    return { ok: false, extract: null, reason: 'fetch-failed' }
  }

  let sections: PaperPdfSection[]
  try {
    sections = await runWithTimeout(
      () => extractIntroSections(buf),
      PARSE_TIMEOUT_MS
    )
  } catch (err) {
    console.warn(
      '[paper-pdf] parse failed for',
      input.paperId,
      ':',
      err instanceof Error ? err.message : err
    )
    return { ok: false, extract: null, reason: 'parse-failed' }
  }

  if (sections.length === 0) {
    return { ok: false, extract: null, reason: 'empty' }
  }

  const rawIntroLength = sections.reduce((acc, s) => acc + s.text.length, 0)
  const persisted = upsertPaperPdfExtract({
    paperId: input.paperId,
    sections,
    rawIntroLength
  })
  return { ok: true, extract: persisted }
}

async function fetchPdfBuffer(url: string): Promise<ArrayBuffer | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Most arXiv / S2-mirror PDF endpoints expect a normal browser-y
      // UA. Mirroring the rest of the codebase's outbound style.
      headers: {
        'User-Agent':
          'Pulse/0.1 (paper-value-chain; ashwin.sreedhar2003@gmail.com)',
        Accept: 'application/pdf'
      },
      redirect: 'follow'
    })
    if (!res.ok) {
      console.warn(`[paper-pdf] fetch HTTP ${res.status} for ${url}`)
      return null
    }
    return await res.arrayBuffer()
  } catch (err) {
    console.warn(
      '[paper-pdf] fetch failed:',
      err instanceof Error ? err.message : err
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function runWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)
    fn().then(
      (val) => {
        clearTimeout(timer)
        resolve(val)
      },
      (err) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    )
  })
}

// Extract intro + related-work text. Walks pages 1..N, accumulating
// text until either a body-boundary heading shows up or we hit the
// MAX_RAW_INTRO_CHARS budget. Each "section" is anchored to a heading
// when one is detected, otherwise lumped under a synthetic "—" heading
// so the renderer can still attribute snippets to a page.
async function extractIntroSections(buf: ArrayBuffer): Promise<PaperPdfSection[]> {
  // Dynamic import keeps pdfjs-dist out of the main-process bundle
  // graph until something actually needs it. The first paper-chain
  // enrichment after boot pays the import cost (~50ms).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // pdfjs-dist 4.x ships a worker that the legacy entry can run inline.
  // Setting workerSrc to an empty string forces inline execution — fine
  // for our single-PDF-at-a-time workflow; not optimal for parallel
  // extraction but we don't do that here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } })
    .GlobalWorkerOptions.workerSrc = ''

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    // Disable image rendering / fonts we don't need — pure text path.
    disableFontFace: true,
    isEvalSupported: false
  })
  const doc = await loadingTask.promise

  const sections: PaperPdfSection[] = []
  let totalChars = 0
  let currentHeading: string | null = null
  let currentText: string[] = []
  let currentPage = 1

  const flushSection = (): void => {
    const text = currentText.join('\n').trim()
    if (text.length > 0) {
      sections.push({
        heading: currentHeading,
        text,
        pageOffset: currentPage
      })
    }
    currentText = []
  }

  outer: for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo)
    const textContent = await page.getTextContent()
    // Group items by approximate Y-position so we get logical lines.
    // pdfjs returns items in reading order; collapse adjacent items
    // with the same transform[5] (Y) into one line.
    const lines: string[] = []
    let currentLine = ''
    let lastY: number | null = null
    for (const item of textContent.items) {
      // pdfjs marker items don't carry text; skip.
      if (!('str' in item)) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = item as any
      const y = Array.isArray(t.transform) ? Number(t.transform[5]) : null
      const str = String(t.str ?? '')
      if (lastY === null || (y !== null && Math.abs(y - lastY) < 2)) {
        currentLine += (currentLine.length > 0 ? ' ' : '') + str
      } else {
        if (currentLine.trim().length > 0) lines.push(currentLine.trim())
        currentLine = str
      }
      lastY = y
    }
    if (currentLine.trim().length > 0) lines.push(currentLine.trim())

    for (const line of lines) {
      const norm = line.toLowerCase().trim()
      // Body-boundary check: a line that starts with one of the body
      // tokens (allow leading "1. ", "2 ", "II. " etc.) ends the intro
      // extraction. Match against a stripped prefix so numbered headings
      // are recognized.
      const stripped = norm.replace(/^\s*([0-9ivxa-z]+\.\s*|\([0-9]+\)\s*)/, '')
      if (
        BODY_BOUNDARY_TOKENS.some((tok) => {
          // Exact-or-leading-word match — "method" should match
          // "method" / "methods" / "methodology" but not "methodical".
          return stripped === tok || stripped.startsWith(tok + ' ') || stripped.startsWith(tok + '.')
        })
      ) {
        // Treat the boundary line itself as a heading-like marker so we
        // don't lose the closing context, then stop.
        currentHeading = line
        flushSection()
        break outer
      }
      // Heading detection — short, mostly-non-punctuated, capitalized
      // first letter, and either contains "introduction" / "related"
      // / "background" or is plausibly a numbered section header.
      // Conservative: when in doubt, treat as body text. False
      // positives split sections too finely; false negatives still
      // collect the right text under the prior heading.
      if (
        line.length < 90 &&
        /^[0-9ivxIVXA-Z]/.test(line) &&
        !/[.!?]$/.test(line) &&
        (norm.includes('introduction') ||
          norm.includes('related') ||
          norm.includes('background') ||
          norm.includes('motivation') ||
          /^\s*([0-9]+\.|[ivx]+\.)\s+\S/.test(norm))
      ) {
        flushSection()
        currentHeading = line
        currentPage = pageNo
        continue
      }
      currentText.push(line)
      totalChars += line.length
      if (totalChars >= MAX_RAW_INTRO_CHARS) {
        flushSection()
        break outer
      }
    }
    // Mark the page where the next-flushed section starts. This is the
    // page where the next heading was detected, OR the page the text
    // continues onto — pageOffset on the section is where its text
    // BEGINS, which matches what the renderer needs for #page=N.
    if (currentText.length === 0) currentPage = pageNo + 1
  }
  flushSection()

  // Truncate the LAST section's text if we blew the cap mid-section,
  // not the full extract — preserves earlier sections fully. This is
  // a belt-and-suspenders check; the loop also bails on totalChars
  // hitting the cap, but a single huge line could push us slightly
  // past it before the check fires.
  let runningTotal = 0
  for (let i = 0; i < sections.length; i++) {
    const remaining = Math.max(0, MAX_RAW_INTRO_CHARS - runningTotal)
    if (sections[i].text.length > remaining) {
      sections[i] = { ...sections[i], text: sections[i].text.slice(0, remaining) }
    }
    runningTotal += sections[i].text.length
    if (runningTotal >= MAX_RAW_INTRO_CHARS) {
      sections.length = i + 1
      break
    }
  }

  return sections
}
