import Parser from 'rss-parser'

const USER_AGENT = 'Pulse/0.1 (macOS news reader; contact via app)'
const FETCH_TIMEOUT_MS = 15_000

export interface FetchedArticle {
  guid: string | null
  title: string
  summary: string | null
  url: string
  publishedAt: number | null
  imageURL: string | null
}

export interface FetchFeedResult {
  status: 'ok' | 'not-modified' | 'error'
  etag?: string | null
  lastModified?: string | null
  articles?: FetchedArticle[]
  error?: string
}

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['media:group', 'mediaGroup'],
      ['itunes:image', 'itunesImage'],
      ['content:encoded', 'contentEncoded']
    ]
  }
})

export async function fetchFeed(
  url: string,
  prevEtag: string | null,
  prevLastModified: string | null
): Promise<FetchFeedResult> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8'
  }
  if (prevEtag) headers['If-None-Match'] = prevEtag
  if (prevLastModified) headers['If-Modified-Since'] = prevLastModified

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' })
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 304) {
    return { status: 'not-modified', etag: prevEtag, lastModified: prevLastModified }
  }
  if (!response.ok) {
    return { status: 'error', error: `HTTP ${response.status}` }
  }

  const etag = response.headers.get('etag')
  const lastModified = response.headers.get('last-modified')
  const body = await response.text()

  let parsed: Awaited<ReturnType<typeof parser.parseString>>
  try {
    parsed = await parser.parseString(body)
  } catch (err) {
    return { status: 'error', error: `parse: ${err instanceof Error ? err.message : String(err)}` }
  }

  const articles: FetchedArticle[] = []
  for (const item of parsed.items ?? []) {
    if (!item.link) continue
    const ts = item.isoDate
      ? Date.parse(item.isoDate)
      : item.pubDate
        ? Date.parse(item.pubDate)
        : NaN
    articles.push({
      guid: item.guid ?? null,
      title: (item.title ?? '(untitled)').trim(),
      summary: extractSummary(item),
      url: item.link,
      publishedAt: Number.isFinite(ts) ? ts : null,
      imageURL: extractImageURL(item, url)
    })
  }

  return { status: 'ok', etag, lastModified, articles }
}

export interface ProbeFeedResult {
  status: 'ok' | 'error'
  title?: string
  description?: string | null
  homepageURL?: string | null
  error?: string
}

// Common feed paths to try when a homepage has no autodiscovery links.
const COMMON_FEED_PATHS = [
  '/feed/',
  '/feed',
  '/rss/',
  '/rss',
  '/rss.xml',
  '/feed.xml',
  '/atom.xml',
  '/index.xml',
  '/feeds/posts/default'
]

function looksLikeFeedPath(u: string): boolean {
  try {
    const path = new URL(u).pathname.toLowerCase()
    return (
      /\/(feed|rss|atom)s?\/?$/.test(path) ||
      /\.(xml|rss|atom)$/.test(path) ||
      path.includes('/feed/') ||
      path.includes('/rss/')
    )
  } catch {
    return false
  }
}

async function quickValidateFeed(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8'
      },
      signal: controller.signal,
      redirect: 'follow'
    })
    if (!res.ok) return false
    const body = await res.text()
    // Cheap check — avoid paying rss-parser's full cost just to validate.
    return /<(rss|feed|rdf:RDF)\b/i.test(body.slice(0, 2048))
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// Autodiscover feed URLs for a publisher. The `startURL` may be a homepage or
// an already-feedy path (the LLM sometimes returns `/feed/` thinking it's a
// homepage). Strategy:
//   1. If `startURL` looks like a feed path, try it first.
//   2. Fetch the page (or its origin) and parse `<link rel="alternate">` tags.
//   3. If still nothing, probe a handful of common feed paths at the origin.
// Returns an ordered list of candidate feed URLs (RSS before Atom).
export async function discoverFeedsFromHomepage(startURL: string): Promise<string[]> {
  const results: string[] = []
  const seen = new Set<string>()
  const push = (u: string): void => {
    if (!seen.has(u)) {
      seen.add(u)
      results.push(u)
    }
  }

  // Step 1: if the LLM gave us something that already looks like a feed URL,
  // validate it cheaply and return it directly.
  if (looksLikeFeedPath(startURL) && (await quickValidateFeed(startURL))) {
    return [startURL]
  }

  // Step 2: HTML autodiscovery via <link rel="alternate">.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let origin: string | null = null
  try {
    const res = await fetch(startURL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*;q=0.8' },
      signal: controller.signal,
      redirect: 'follow'
    })
    if (res.ok) {
      const html = await res.text()
      const finalURL = res.url || startURL
      const base = new URL(finalURL)
      origin = base.origin
      const linkRe = /<link\b[^>]*>/gi
      const rssFeeds: string[] = []
      const atomFeeds: string[] = []
      for (const m of html.matchAll(linkRe)) {
        const tag = m[0]
        if (!/rel\s*=\s*["']?alternate/i.test(tag)) continue
        const typeMatch = tag.match(/type\s*=\s*["']([^"']+)["']/i)
        if (!typeMatch) continue
        const type = typeMatch[1]!.toLowerCase()
        const isRss = type.includes('rss+xml')
        const isAtom = type.includes('atom+xml')
        if (!isRss && !isAtom) continue
        const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i)
        if (!hrefMatch) continue
        try {
          const resolved = new URL(hrefMatch[1]!, base).toString()
          if (isRss) rssFeeds.push(resolved)
          else atomFeeds.push(resolved)
        } catch {
          // ignore malformed href
        }
      }
      for (const u of [...rssFeeds, ...atomFeeds]) push(u)
    }
  } catch {
    // fall through — we'll still try common paths below
  } finally {
    clearTimeout(timer)
  }

  if (results.length > 0) return results

  // Step 3: common feed paths at the origin. Many sites (especially WordPress-
  // or Drupal-based newsrooms) don't advertise via <link rel="alternate"> but
  // still expose /feed/, /rss/, etc.
  if (!origin) {
    try {
      origin = new URL(startURL).origin
    } catch {
      return results
    }
  }
  const probes = await Promise.all(
    COMMON_FEED_PATHS.map(async (path) => {
      const full = origin + path
      const ok = await quickValidateFeed(full)
      return ok ? full : null
    })
  )
  for (const p of probes) if (p) push(p)
  return results
}

// rss-parser / sax emit raw XML complaints like "Attribute without value Line:
// 37 Column: 152 Char: >" or "Feed not recognized as RSS 1 or 2." Those leak
// implementation detail to the UI. Collapse them into a single friendly line.
function friendlyProbeError(raw: string): string {
  const msg = raw.trim()
  if (!msg) return 'Couldn\'t reach feed.'
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(msg)) {
    return 'Couldn\'t reach server.'
  }
  if (/aborted|timeout/i.test(msg)) return 'Timed out.'
  if (/not recognized as RSS|Non-whitespace before|Attribute without value|Unexpected close tag|Unclosed tag|Invalid character/i.test(msg)) {
    return 'No valid RSS feed at this URL.'
  }
  if (/^HTTP (4\d\d|5\d\d)/.test(msg)) return msg
  return 'Couldn\'t parse feed.'
}

export async function probeFeed(url: string): Promise<ProbeFeedResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8'
      },
      signal: controller.signal,
      redirect: 'follow'
    })
    if (!response.ok) return { status: 'error', error: `HTTP ${response.status}` }
    const body = await response.text()
    const parsed = await parser.parseString(body)
    return {
      status: 'ok',
      title: (parsed.title ?? '').trim() || undefined,
      description: parsed.description ?? null,
      homepageURL: parsed.link ?? null
    }
  } catch (err) {
    return {
      status: 'error',
      error: friendlyProbeError(err instanceof Error ? err.message : String(err))
    }
  } finally {
    clearTimeout(timer)
  }
}

function extractSummary(item: Parser.Item & { contentSnippet?: string; content?: string }): string | null {
  const raw = item.contentSnippet ?? item.content ?? (item as { summary?: string }).summary
  if (!raw) return null
  const stripped = String(raw).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  if (!stripped) return null
  return stripped.length > 500 ? stripped.slice(0, 497) + '…' : stripped
}

interface MediaNode {
  $?: { url?: string; href?: string; type?: string; medium?: string; width?: string }
  'media:content'?: MediaNode | MediaNode[]
  'media:thumbnail'?: MediaNode | MediaNode[]
}

type ItemWithMedia = Parser.Item & {
  enclosure?: { url?: string; type?: string }
  mediaContent?: MediaNode | MediaNode[]
  mediaThumbnail?: MediaNode | MediaNode[]
  mediaGroup?: MediaNode
  itunesImage?: { $?: { href?: string } } | string
  contentEncoded?: string
  summary?: string
  description?: string
}

function extractImageURL(item: ItemWithMedia, feedURL: string): string | null {
  const raw = pickImageCandidate(item)
  return raw ? normalizeImageURL(raw, feedURL) : null
}

function pickImageCandidate(item: ItemWithMedia): string | null {
  const enc = item.enclosure
  if (enc?.url && (enc.type ?? '').startsWith('image/')) return enc.url

  const mediaNodes: MediaNode[] = []
  const push = (v: MediaNode | MediaNode[] | undefined): void => {
    if (!v) return
    if (Array.isArray(v)) mediaNodes.push(...v)
    else mediaNodes.push(v)
  }
  push(item.mediaContent)
  push(item.mediaThumbnail)
  if (item.mediaGroup) {
    push(item.mediaGroup['media:content'])
    push(item.mediaGroup['media:thumbnail'])
  }
  for (const node of mediaNodes) {
    const url = node?.$?.url ?? node?.$?.href
    const type = node?.$?.type ?? ''
    const medium = node?.$?.medium ?? ''
    if (!url) continue
    if (medium === 'image' || type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url)) {
      return url
    }
  }

  const itunes = item.itunesImage
  if (itunes) {
    if (typeof itunes === 'string') return itunes
    if (itunes.$?.href) return itunes.$.href
  }

  const html =
    item.contentEncoded ?? item.content ?? item.summary ?? item.description ?? null
  if (typeof html === 'string') {
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (match?.[1]) return match[1]
  }
  return null
}

function normalizeImageURL(url: string, feedURL: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) return null
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  try {
    return new URL(trimmed, feedURL).toString()
  } catch {
    return null
  }
}
