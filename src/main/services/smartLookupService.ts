import { getDb } from '../database/connection'
import { defineTerm, resolveCanonicalTitle } from './ollamaService'

export interface SmartLookup {
  term: string
  title: string | null
  summary: string
  source: 'wikipedia' | 'ollama'
  sourceURL: string | null
  thumbnailURL: string | null
  createdAt: number
}

interface SmartLookupRow {
  term: string
  title: string | null
  summary: string
  source: string
  sourceURL: string | null
  thumbnailURL: string | null
  createdAt: number
}

const FETCH_TIMEOUT_MS = 8_000
const WIKI_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary'
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLowerCase()
}

function hashContext(context: string | undefined): string {
  if (!context) return ''
  const trimmed = context.trim()
  if (trimmed.length === 0) return ''
  let h = 5381
  for (let i = 0; i < trimmed.length; i++) {
    h = ((h << 5) + h) ^ trimmed.charCodeAt(i)
  }
  return (h >>> 0).toString(36)
}

function cacheKey(term: string, context: string | undefined): string {
  const h = hashContext(context)
  return h ? `${term}::${h}` : term
}

function rowToLookup(row: SmartLookupRow): SmartLookup {
  return {
    term: row.term,
    title: row.title,
    summary: row.summary,
    source: row.source === 'ollama' ? 'ollama' : 'wikipedia',
    sourceURL: row.sourceURL,
    thumbnailURL: row.thumbnailURL,
    createdAt: row.createdAt
  }
}

function readCached(term: string): SmartLookup | null {
  const row = getDb()
    .prepare<[string], SmartLookupRow>(
      `SELECT term, title, summary, source, sourceURL, thumbnailURL, createdAt
       FROM smart_lookups WHERE term = ?`
    )
    .get(term)
  if (!row) return null
  if (Date.now() - row.createdAt > CACHE_TTL_MS) return null
  return rowToLookup(row)
}

function writeCache(lookup: SmartLookup): void {
  getDb()
    .prepare(
      `INSERT INTO smart_lookups (term, title, summary, source, sourceURL, thumbnailURL, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(term) DO UPDATE SET
         title = excluded.title,
         summary = excluded.summary,
         source = excluded.source,
         sourceURL = excluded.sourceURL,
         thumbnailURL = excluded.thumbnailURL,
         createdAt = excluded.createdAt`
    )
    .run(
      lookup.term,
      lookup.title,
      lookup.summary,
      lookup.source,
      lookup.sourceURL,
      lookup.thumbnailURL,
      lookup.createdAt
    )
}

interface WikiSummaryResponse {
  type?: string
  title?: string
  extract?: string
  description?: string
  thumbnail?: { source?: string }
  content_urls?: { desktop?: { page?: string } }
}

async function fetchWikipedia(term: string): Promise<SmartLookup | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const url = `${WIKI_BASE}/${encodeURIComponent(term)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Pulse/0.1 (macOS reader smart-lookup)',
        Accept: 'application/json'
      },
      signal: controller.signal
    })
    if (res.status === 404) return null
    if (!res.ok) return null
    const data = (await res.json()) as WikiSummaryResponse
    // `type: 'disambiguation'` pages still have useful extracts; let them through.
    const extract = (data.extract ?? '').trim()
    if (extract.length === 0) return null
    return {
      term: normalizeTerm(term),
      title: data.title ?? term,
      summary: extract,
      source: 'wikipedia',
      sourceURL: data.content_urls?.desktop?.page ?? null,
      thumbnailURL: data.thumbnail?.source ?? null,
      createdAt: Date.now()
    }
  } catch (err) {
    console.warn('[smart-lookup] wiki fetch failed:', err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function lookupTerm(
  rawTerm: string,
  context?: string
): Promise<SmartLookup | null> {
  const clean = rawTerm.trim()
  if (clean.length === 0 || clean.length > 120) return null
  const key = normalizeTerm(clean)
  const ckey = cacheKey(key, context)

  const cached = readCached(ckey)
  if (cached) return cached

  // Use context to pick the right Wikipedia entry for ambiguous terms (e.g.
  // "Jordan" → "Michael Jordan" vs the country). Falls through silently if
  // Ollama is offline or returns no confident title.
  let result: SmartLookup | null = null
  if (context && context.trim().length >= 20) {
    const canonical = await resolveCanonicalTitle(clean, context)
    if (canonical && canonical.toLowerCase() !== clean.toLowerCase()) {
      result = await fetchWikipedia(canonical)
    }
  }
  // Direct Wikipedia fallback with the raw selection (titles are case-sensitive).
  if (!result) result = await fetchWikipedia(clean)
  // Final fallback: Ollama-generated definition for jargon, nicknames, or
  // anything Wikipedia doesn't cover.
  if (!result) {
    const summary = await defineTerm(clean, context)
    if (summary) {
      result = {
        term: key,
        title: clean,
        summary,
        source: 'ollama',
        sourceURL: null,
        thumbnailURL: null,
        createdAt: Date.now()
      }
    }
  }
  if (result) writeCache({ ...result, term: ckey })
  return result
}

export function purgeStaleSmartLookups(): number {
  const cutoff = Date.now() - CACHE_TTL_MS
  try {
    const info = getDb()
      .prepare(`DELETE FROM smart_lookups WHERE createdAt < ?`)
      .run(cutoff)
    return info.changes
  } catch {
    return 0
  }
}
