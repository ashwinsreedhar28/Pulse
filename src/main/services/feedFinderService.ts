import * as categoriesDb from '../database/categories'
import * as feedsDb from '../database/feeds'
import { suggestFeeds } from './ollamaService'
import { discoverFeedsFromHomepage, probeFeed } from './rssParser'

export interface FeedFinderCandidate {
  title: string
  url: string
  category: string
  reason: string
  alreadySubscribed: boolean
}

export interface FeedFinderResult {
  status: 'ok' | 'ollama-offline' | 'no-candidates'
  reply: string
  candidates: FeedFinderCandidate[]
}

export interface ProbeResult {
  status: 'ok' | 'error'
  title?: string
  description?: string | null
  homepageURL?: string | null
  error?: string
}

function normalizeURL(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return url
  }
}

export async function findFeedCandidates(userMessage: string): Promise<FeedFinderResult> {
  const trimmed = userMessage.trim()
  if (trimmed.length === 0) {
    return { status: 'no-candidates', reply: '', candidates: [] }
  }

  const categories = categoriesDb.listCategories()
  const feeds = feedsDb.listFeeds()
  const existingURLs = new Set(feeds.map((f) => normalizeURL(f.url)))

  const ollama = await suggestFeeds(
    trimmed,
    categories.map((c) => c.name),
    feeds.map((f) => f.url)
  )
  if (!ollama) {
    return { status: 'ollama-offline', reply: '', candidates: [] }
  }

  // Autodiscover real feed URLs from each suggested homepage in parallel.
  // The LLM reliably knows publisher homepages but hallucinates feed paths,
  // so we trust its homepage and parse the page HTML for the real feed.
  const discovered = await Promise.all(
    ollama.suggestions.map(async (s) => {
      const feeds = await discoverFeedsFromHomepage(s.homepage)
      return { suggestion: s, feeds }
    })
  )

  const seen = new Set<string>()
  const candidates: FeedFinderCandidate[] = []
  for (const { suggestion, feeds } of discovered) {
    // Pick the first feed from discovery (RSS before Atom, per rssParser).
    // If nothing discoverable, surface the homepage so the user sees a
    // clearly-unreachable card rather than a silently-dropped suggestion.
    const url = feeds[0] ?? suggestion.homepage
    const norm = normalizeURL(url)
    if (seen.has(norm)) continue
    seen.add(norm)
    // Silently skip anything the user already subscribes to — the LLM is told
    // about existing feeds but doesn't always obey, and post-discovery resolution
    // can land on a feed we already have even when the suggested homepage didn't.
    if (existingURLs.has(norm)) continue
    candidates.push({
      title: suggestion.title,
      url,
      category: suggestion.category,
      reason: suggestion.reason,
      alreadySubscribed: false
    })
  }

  return {
    status: candidates.length > 0 ? 'ok' : 'no-candidates',
    reply: ollama.reply,
    candidates
  }
}

export async function probeCandidate(url: string): Promise<ProbeResult> {
  const probe = await probeFeed(url)
  if (probe.status !== 'ok') {
    return { status: 'error', error: probe.error }
  }
  return {
    status: 'ok',
    title: probe.title ?? undefined,
    description: probe.description ?? null,
    homepageURL: probe.homepageURL ?? null
  }
}

export interface AddSuggestedFeedInput {
  title: string
  url: string
  categoryName: string
  domain: categoriesDb.Domain
}

export function addSuggestedFeed(input: AddSuggestedFeedInput): feedsDb.Feed {
  const categories = categoriesDb.listCategories()
  let category = categories.find(
    (c) => c.name.toLowerCase() === input.categoryName.trim().toLowerCase()
  )
  if (!category) {
    category = categoriesDb.createCategory(input.categoryName.trim(), input.domain)
  }
  return feedsDb.createFeed({
    title: input.title.trim(),
    url: input.url.trim(),
    categoryId: category.id
  })
}
