// "Why this matters to you" — per-article personalization.
//
// Computes the list of entities the reader personally tracks that also appear
// in a given article (watchlist tickers, their supply-chain neighbors, favorite
// teams/athletes, tracked geos), then asks Ollama to write one sentence
// explaining why this article matters to *this* reader. Results cache in
// article_relevance so repeat opens and reloads paint instantly.
//
// Matching is cheap pure-regex work (same machinery as tickerRelevance); the
// expensive step is the Ollama call, which runs through the shared queue and
// updates the cached row when it lands. The renderer subscribes to the
// "relevance:updated" channel and swaps prose in without a layout shift.
//
// Offline behavior: if Ollama isn't reachable, we still cache the matches and
// set status='offline'. The renderer shows the chips alone, and a later
// article open while Ollama is up kicks off a retry via shouldRegenerate().

import graphJson from '../../data/supplyChainGraph.json'
import { BrowserWindow } from 'electron'

import { listTickers, type Ticker } from '../database/tickers'
import { listGeoInterests } from '../database/geoInterests'
import { listFavoriteTeams } from '../database/favoriteTeams'
import { listFavoriteAthletes } from '../database/favoriteAthletes'
import {
  getRelevance,
  updateRelevanceSummary,
  upsertRelevance,
  type PersonalMatch,
  type ArticleRelevanceRow
} from '../database/articleRelevance'
import {
  classifyArticleForTicker,
  invalidateMatcherCache as invalidateTickerMatcherCache
} from './tickerRelevance'
import {
  checkOllamaHealth,
  enqueueOllamaTask,
  generatePersonalBrief
} from './ollamaService'

interface GraphNode {
  symbol: string
  stage: string
  sector: string
  name?: string
  blurb?: string
}
interface GraphEdge {
  from: string
  to: string
  note?: string
}
interface GraphShape {
  nodes: GraphNode[]
  edges: GraphEdge[]
  competitors: string[][]
}

const GRAPH = graphJson as unknown as GraphShape

// One-time graph indexes. The graph JSON is imported at build time and never
// mutates at runtime, so these maps are safe to compute once.
const NODE_BY_SYMBOL = new Map<string, GraphNode>()
for (const n of GRAPH.nodes) NODE_BY_SYMBOL.set(n.symbol.toUpperCase(), n)

interface Neighbor {
  symbol: string
  relation: 'supplier' | 'customer' | 'competitor'
  note?: string
}

const NEIGHBORS_BY_SYMBOL = new Map<string, Neighbor[]>()
function pushNeighbor(sym: string, n: Neighbor): void {
  const key = sym.toUpperCase()
  if (!NEIGHBORS_BY_SYMBOL.has(key)) NEIGHBORS_BY_SYMBOL.set(key, [])
  NEIGHBORS_BY_SYMBOL.get(key)!.push(n)
}
for (const e of GRAPH.edges) {
  const from = e.from.toUpperCase()
  const to = e.to.toUpperCase()
  // Edge semantics: `from` supplies to `to`. So `from` sees `to` as a
  // customer, and `to` sees `from` as a supplier.
  pushNeighbor(from, { symbol: to, relation: 'customer', note: e.note })
  pushNeighbor(to, { symbol: from, relation: 'supplier', note: e.note })
}
for (const pair of GRAPH.competitors ?? []) {
  if (!Array.isArray(pair) || pair.length !== 2) continue
  const [a, b] = pair
  pushNeighbor(a, { symbol: b.toUpperCase(), relation: 'competitor' })
  pushNeighbor(b, { symbol: a.toUpperCase(), relation: 'competitor' })
}

// Max matches we surface in the UI block. Beyond this the briefing gets noisy
// and the Ollama prompt loses focus on the 1-2 most material links.
const MAX_MATCHES = 4

export interface RelevanceRequestInput {
  articleId: number
  title: string
  summary: string | null
  // Full reader-extracted body when available. Falls back to summary for
  // matching when the renderer hasn't run reader.extract yet.
  body?: string | null
}

export interface RelevanceResponse {
  articleId: number
  matches: PersonalMatch[]
  summary: string | null
  status: ArticleRelevanceRow['status']
}

// Entry point for the `relevance:get` IPC handler. Returns cached row when
// present, otherwise computes matches synchronously and enqueues the Ollama
// summary. The returned payload always reflects the current DB state — the
// caller can display chips immediately and subscribe to "relevance:updated"
// for the prose once it lands.
export async function getOrComputeRelevance(
  input: RelevanceRequestInput
): Promise<RelevanceResponse> {
  const cached = getRelevance(input.articleId)
  if (cached) {
    // If we previously stored "offline" but Ollama is now reachable, retry the
    // prose generation in the background. Keeps the UI healing without
    // requiring the user to toggle anything.
    if (shouldRegenerate(cached)) {
      scheduleSummary(input, cached.matches)
    }
    return {
      articleId: input.articleId,
      matches: cached.matches,
      summary: cached.summary,
      status: cached.status
    }
  }

  const matches = computeMatches(input)
  if (matches.length === 0) {
    upsertRelevance({
      articleId: input.articleId,
      matches: [],
      summary: null,
      status: 'no_matches'
    })
    return {
      articleId: input.articleId,
      matches: [],
      summary: null,
      status: 'no_matches'
    }
  }

  // Write the pending row synchronously so repeat opens during the Ollama
  // round-trip see the same matches and don't kick off a second task.
  upsertRelevance({
    articleId: input.articleId,
    matches,
    summary: null,
    status: 'pending'
  })
  scheduleSummary(input, matches)
  return {
    articleId: input.articleId,
    matches,
    summary: null,
    status: 'pending'
  }
}

function shouldRegenerate(cached: ArticleRelevanceRow): boolean {
  if (cached.matches.length === 0) return false
  if (cached.summary !== null) return false
  // pending: summary task is already in flight (or crashed mid-flight — let
  // the next reopen retry once status flips to offline/error).
  return cached.status === 'offline' || cached.status === 'error'
}

function scheduleSummary(
  input: RelevanceRequestInput,
  matches: PersonalMatch[]
): void {
  enqueueOllamaTask(async () => {
    const healthy = await checkOllamaHealth()
    if (!healthy) {
      updateRelevanceSummary(input.articleId, null, 'offline')
      broadcast(input.articleId)
      return
    }
    try {
      const prose = await generatePersonalBrief({
        title: input.title,
        body: (input.body ?? input.summary ?? '').slice(0, 2400),
        matches: matches.map((m) => ({ label: m.label, detail: m.detail }))
      })
      if (prose) {
        updateRelevanceSummary(input.articleId, prose, 'ready')
      } else {
        // Model returned empty — treat as "no personal angle worth
        // prose-ifying" rather than an error. Matches still display.
        updateRelevanceSummary(input.articleId, null, 'ready')
      }
    } catch (err) {
      console.warn(
        '[relevance] summary generation failed:',
        err instanceof Error ? err.message : err
      )
      updateRelevanceSummary(input.articleId, null, 'error')
    } finally {
      broadcast(input.articleId)
    }
  })
}

function broadcast(articleId: number): void {
  const row = getRelevance(articleId)
  if (!row) return
  const payload: RelevanceResponse = {
    articleId,
    matches: row.matches,
    summary: row.summary,
    status: row.status
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('relevance:updated', payload)
    }
  }
}

// ---- matching ----

function computeMatches(input: RelevanceRequestInput): PersonalMatch[] {
  const haystack = [input.title, input.summary ?? '', input.body ?? '']
    .filter(Boolean)
    .join('\n')
  const lower = haystack.toLowerCase()

  const tickers = listTickers()
  const activeTickers = tickers.filter((t) => t.isActive)
  const activeBySymbol = new Map(activeTickers.map((t) => [t.symbol.toUpperCase(), t]))
  const allBySymbol = new Map(tickers.map((t) => [t.symbol.toUpperCase(), t]))

  const direct: PersonalMatch[] = []
  const seenSymbols = new Set<string>()

  // Direct watchlist tickers: classifier matches title/summary/body. We do
  // not rely on the cached article_ticker_matches row here because the body
  // may be available now (reader extract) that wasn't at ingest.
  for (const t of activeTickers) {
    const strength = classifyArticleForTicker(
      { title: input.title, summary: input.summary ?? '', body: input.body ?? '' },
      t
    )
    if (strength !== 'strong') continue
    direct.push({
      kind: 'ticker-direct',
      label: t.symbol,
      detail: t.companyName
        ? `${t.companyName} — in your watchlist`
        : 'in your watchlist',
      symbol: t.symbol
    })
    seenSymbols.add(t.symbol.toUpperCase())
  }

  // Indirect (supply-chain) matches: for every watchlist ticker that matched
  // directly, consult the graph for its 1-hop neighbors and see if any of
  // THOSE companies also appear in the article. Surfacing these is the
  // point of the graph — an article about TSMC and NVDA is much more
  // valuable than "article mentions NVDA" alone.
  const indirect: PersonalMatch[] = []
  for (const d of direct) {
    const parentSym = d.symbol!
    const neighbors = NEIGHBORS_BY_SYMBOL.get(parentSym.toUpperCase()) ?? []
    for (const nb of neighbors) {
      if (seenSymbols.has(nb.symbol)) continue
      const neighborTicker =
        activeBySymbol.get(nb.symbol) ?? allBySymbol.get(nb.symbol)
      // If the ticker row doesn't exist, synthesize a minimal one from the
      // graph's own node metadata (name/symbol) so the classifier has
      // enough to match against.
      let classified: 'strong' | 'weak' | 'none'
      if (neighborTicker) {
        classified = classifyArticleForTicker(
          { title: input.title, summary: input.summary ?? '', body: input.body ?? '' },
          neighborTicker
        )
      } else {
        const graphNode = NODE_BY_SYMBOL.get(nb.symbol)
        if (!graphNode) continue
        const synthetic: Ticker = {
          id: -1,
          symbol: nb.symbol,
          companyName: graphNode.name ?? nb.symbol,
          sector: graphNode.sector ?? null,
          industry: null,
          isActive: false,
          addedAt: 0
        }
        classified = classifyArticleForTicker(
          { title: input.title, summary: input.summary ?? '', body: input.body ?? '' },
          synthetic
        )
      }
      if (classified !== 'strong') continue

      const label = nb.symbol
      const parentLabel = d.label
      const relationPhrase =
        nb.relation === 'supplier'
          ? `supplier to ${parentLabel}`
          : nb.relation === 'customer'
            ? `customer of ${parentLabel}`
            : `competitor of ${parentLabel}`
      const detail = nb.note
        ? `${relationPhrase} — ${nb.note}`
        : `${relationPhrase} in your value chain`
      indirect.push({
        kind: 'ticker-indirect',
        label,
        detail,
        symbol: nb.symbol,
        relatedSymbol: parentSym,
        relation: nb.relation
      })
      seenSymbols.add(nb.symbol)
    }
  }

  // Favorite teams: match the team name (and reasonable abbreviations) in
  // title or body. We look for the full team name first; falling back to
  // just the abbreviation leads to too many false positives ("NYM" in a
  // finance article that isn't about the Mets).
  const teamMatches: PersonalMatch[] = []
  for (const team of listFavoriteTeams()) {
    const tokens = teamNameTokens(team.teamName)
    const hit = tokens.some((tok) => containsWord(lower, tok.toLowerCase()))
    if (!hit) continue
    teamMatches.push({
      kind: 'team',
      label: team.teamName,
      detail: `your favorite ${team.leagueId.toUpperCase()} team`
    })
  }

  // Favorite athletes: match the full name (at least two name parts).
  // Single-part nicknames ("LeBron") could work but risk collisions with
  // common words in some languages; keep conservative for v1.
  const athleteMatches: PersonalMatch[] = []
  for (const a of listFavoriteAthletes()) {
    const name = a.athleteName.trim()
    if (name.length < 4 || name.split(/\s+/).length < 2) continue
    if (!containsWord(lower, name.toLowerCase())) continue
    athleteMatches.push({
      kind: 'athlete',
      label: a.athleteName,
      detail: a.teamAbbreviation
        ? `your tracked athlete (${a.teamAbbreviation})`
        : 'your tracked athlete'
    })
  }

  // Geo interests: match any keyword. Keywords are user-curated, so they
  // tend to be discriminating (e.g., "Toronto", "Ontario"). We report the
  // displayName of the first matched keyword.
  const geoMatches: PersonalMatch[] = []
  for (const geo of listGeoInterests()) {
    if (!geo.isActive) continue
    const keywords = [geo.displayName, ...geo.keywords]
    const hit = keywords.find((k) => k.length >= 3 && containsWord(lower, k.toLowerCase()))
    if (!hit) continue
    geoMatches.push({
      kind: 'geo',
      label: geo.displayName,
      detail: `${geoTypeLabel(geo.type)} you track`
    })
  }

  // Merge with priority: direct tickers > teams > geo > indirect tickers > athletes.
  // Direct ticker matches are the densest signal because they tie directly
  // to the user's watchlist. Supply-chain matches are valuable but secondary
  // — they only make sense in the context of a direct match.
  const ordered = [
    ...direct,
    ...teamMatches,
    ...geoMatches,
    ...indirect,
    ...athleteMatches
  ].slice(0, MAX_MATCHES)

  return ordered
}

function containsWord(lowerHay: string, needle: string): boolean {
  if (needle.length < 3) return false
  let from = 0
  while (from <= lowerHay.length - needle.length) {
    const idx = lowerHay.indexOf(needle, from)
    if (idx < 0) return false
    const before = idx > 0 ? lowerHay.charCodeAt(idx - 1) : 0
    const after =
      idx + needle.length < lowerHay.length
        ? lowerHay.charCodeAt(idx + needle.length)
        : 0
    if (!isWordChar(before) && !isWordChar(after)) return true
    from = idx + 1
  }
  return false
}

function isWordChar(code: number): boolean {
  if (code === 0) return false
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  )
}

// Produce matchable tokens from a team name. ESPN gives "Arsenal" and
// "New York Mets" — the first is strong enough to match alone, the second
// is anchored by its city/mascot pair. Dropping to a city-only match leads
// to "New York" noise, so we require the full team name.
function teamNameTokens(teamName: string): string[] {
  const t = teamName.trim()
  const tokens = [t]
  // If the team has a multi-word name, also accept the mascot alone when
  // it's distinctive (>=5 chars) — handles "Mets", "Dodgers", "Heat",
  // "Patriots" without matching "New York" or "Los Angeles" alone.
  const parts = t.split(/\s+/)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    if (last.length >= 5) tokens.push(last)
  }
  return tokens
}

function geoTypeLabel(type: 'city' | 'state' | 'country' | 'region'): string {
  switch (type) {
    case 'city':
      return 'city'
    case 'state':
      return 'state/province'
    case 'country':
      return 'country'
    case 'region':
      return 'region'
  }
}

// Re-export for IPC invalidation wiring.
export { invalidateTickerMatcherCache }
