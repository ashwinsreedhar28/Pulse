import { Readability } from '@mozilla/readability'
import { JSDOM, VirtualConsole } from 'jsdom'
import DOMPurify from 'dompurify'
import { getDb } from '../database/connection'

export interface ReaderResult {
  status: 'ok' | 'error'
  title?: string
  byline?: string | null
  siteName?: string | null
  contentHTML?: string
  textLength?: number
  excerpt?: string | null
  error?: string
}

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

// Readability extractions are expensive (~200ms on long articles) and rarely
// change between reopens, so memoize by URL for 7 days. Only successful
// extractions are cached — errors stay live so transient fetch failures can
// recover on retry.
const READER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
// Bump when the extraction pipeline changes in a way that would make old
// cached payloads wrong (e.g., lazy-image promotion added 2026-04-22). Old
// entries miss the version check and get refetched on next open.
const READER_CACHE_VERSION = 2

interface ReaderCacheRow {
  payload: string
  extractedAt: number
}

function readCache(url: string): ReaderResult | null {
  try {
    const row = getDb()
      .prepare<[string], ReaderCacheRow>(
        `SELECT payload, extractedAt FROM reader_cache WHERE url = ?`
      )
      .get(url)
    if (!row) return null
    if (Date.now() - row.extractedAt > READER_CACHE_TTL_MS) return null
    const parsed = JSON.parse(row.payload) as ReaderResult & { _v?: number }
    if (parsed._v !== READER_CACHE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(url: string, result: ReaderResult): void {
  if (result.status !== 'ok') return
  try {
    const payload = JSON.stringify({ ...result, _v: READER_CACHE_VERSION })
    getDb()
      .prepare(
        `INSERT INTO reader_cache (url, payload, extractedAt) VALUES (?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET payload = excluded.payload, extractedAt = excluded.extractedAt`
      )
      .run(url, payload, Date.now())
  } catch {
    // Cache failures are never fatal — the extraction itself already succeeded.
  }
}

export function purgeStaleReaderCache(): number {
  const cutoff = Date.now() - READER_CACHE_TTL_MS
  try {
    const info = getDb()
      .prepare(`DELETE FROM reader_cache WHERE extractedAt < ?`)
      .run(cutoff)
    return info.changes
  } catch {
    return 0
  }
}

// Common named entities encountered in the wild, including malformed
// variants without a trailing semicolon (which the HTML parser won't decode).
// Structural entities (lt/gt/amp) are intentionally excluded from HTML-path
// decoding so we don't break tag boundaries.
const TEXT_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: '\u00A0', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
  laquo: '\u00AB', raquo: '\u00BB', copy: '\u00A9', reg: '\u00AE',
  trade: '\u2122', euro: '\u20AC', pound: '\u00A3', yen: '\u00A5',
  deg: '\u00B0', bull: '\u2022', middot: '\u00B7', sect: '\u00A7',
  prime: '\u2032', Prime: '\u2033', times: '\u00D7', divide: '\u00F7'
}
// Subset safe to decode inside contentHTML (skip lt/gt/amp/quot/apos which
// must stay escaped to preserve tag structure).
const HTML_SAFE_ENTITIES: Record<string, string> = Object.fromEntries(
  Object.entries(TEXT_ENTITIES).filter(
    ([k]) => !['amp', 'lt', 'gt', 'quot', 'apos'].includes(k)
  )
)

function decodeTextEntities(s: string | null | undefined): string {
  if (!s) return s ?? ''
  return s
    .replace(/&#(\d+);?/g, (_, n) => {
      const code = Number.parseInt(n, 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
    .replace(/&#x([0-9a-f]+);?/gi, (_, n) => {
      const code = Number.parseInt(n, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
    .replace(/&([a-zA-Z]+);?/g, (m, name) => TEXT_ENTITIES[name] ?? m)
}

// For HTML: only repair semicolonless named entities (the browser handles the
// rest) and never touch structural entities. This avoids breaking tag parsing.
function repairHtmlEntities(html: string): string {
  if (!html) return html
  // Semicolonless numeric decimal at a safe boundary (followed by non-alnum).
  // The browser's HTML parser tolerates &#123 only in legacy contexts.
  return html
    .replace(/&#(\d+)(?![0-9;])/g, (_, n) => {
      const code = Number.parseInt(n, 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
    .replace(/&#x([0-9a-f]+)(?![0-9a-f;])/gi, (_, n) => {
      const code = Number.parseInt(n, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
    .replace(/&([a-zA-Z]+)(?![a-zA-Z0-9;])/g, (m, name) => HTML_SAFE_ENTITIES[name] ?? m)
}

// Most publishers lazy-load images: `<img src="" data-src="real.jpg">` or
// `<img src="1x1.gif" data-srcset="…">`. Readability resolves `src` to absolute
// but doesn't know about the `data-*` attrs, so the rendered reader view shows
// a broken placeholder with alt text. Promote the real URL into `src`/`srcset`
// on the live JSDOM document *before* Readability parses — that way its own
// `_fixRelativeUris` resolves the populated URL against the article base.
const LAZY_SRC_ATTRS = [
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-hi-res-src',
  'data-full-src',
  'data-image'
]
const LAZY_SRCSET_ATTRS = ['data-srcset', 'data-lazy-srcset']

function isPlaceholderSrc(src: string): boolean {
  if (!src) return true
  if (src.startsWith('data:image/gif;base64,R0lGOD')) return true // 1x1 GIFs
  if (src.startsWith('data:image/svg+xml')) return true // spacer SVGs
  if (/\/(blank|spacer|placeholder|pixel)\.(gif|png|jpe?g|svg)/i.test(src)) return true
  return false
}

function promoteLazyImages(doc: Document): void {
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const currentSrc = img.getAttribute('src') ?? ''
    if (isPlaceholderSrc(currentSrc)) {
      for (const attr of LAZY_SRC_ATTRS) {
        const v = img.getAttribute(attr)
        if (v) {
          img.setAttribute('src', v)
          break
        }
      }
    }
    if (!img.getAttribute('srcset')) {
      for (const attr of LAZY_SRCSET_ATTRS) {
        const v = img.getAttribute(attr)
        if (v) {
          img.setAttribute('srcset', v)
          break
        }
      }
    }
    // `loading="lazy"` is harmless in the webview but a few sites pair it with
    // IntersectionObserver shims that hide the image until JS runs.
    img.removeAttribute('loading')
  }
  for (const source of Array.from(doc.querySelectorAll('picture source'))) {
    if (!source.getAttribute('srcset')) {
      const v = source.getAttribute('data-srcset') ?? source.getAttribute('data-src')
      if (v) source.setAttribute('srcset', v)
    }
  }
}

// Only http(s) URLs cross into the reader pipeline — blocks `file://`,
// `reel://`, etc. from being exfiltrated by a crafted IPC caller.
function isSafeURL(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export async function extractReadable(url: string): Promise<ReaderResult> {
  if (!isSafeURL(url)) {
    return { status: 'error', error: 'Unsupported URL scheme.' }
  }
  const cached = readCache(url)
  if (cached) return cached

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*;q=0.8' }
    }).finally(() => clearTimeout(timer))

    if (!res.ok) {
      return { status: 'error', error: `HTTP ${res.status}` }
    }
    const html = await res.text()
    // jsdom's CSS parser can't handle @layer/@container/nested rules and
    // logs a noisy "Could not parse CSS stylesheet" for each one. Readability
    // only walks the DOM, so drop those errors on the floor.
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', () => {})
    const dom = new JSDOM(html, { url, virtualConsole })
    promoteLazyImages(dom.window.document)
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (!article) return { status: 'error', error: 'Could not parse article content.' }

    // Defense-in-depth for the renderer's `dangerouslySetInnerHTML`: Readability
    // strips <script> but leaves event-handler attributes and javascript: hrefs.
    // We sanitize in main so the renderer never sees hostile markup.
    const purify = DOMPurify(dom.window as unknown as Window & typeof globalThis)
    const rawHTML = repairHtmlEntities(article.content ?? '')
    const cleanHTML = purify.sanitize(rawHTML, {
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['style']
    })

    const result: ReaderResult = {
      status: 'ok',
      title: article.title ? decodeTextEntities(article.title) : undefined,
      byline: article.byline ? decodeTextEntities(article.byline) : null,
      siteName: article.siteName ? decodeTextEntities(article.siteName) : null,
      contentHTML: cleanHTML,
      textLength: article.length ?? 0,
      excerpt: article.excerpt ? decodeTextEntities(article.excerpt) : null
    }
    writeCache(url, result)
    return result
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}
