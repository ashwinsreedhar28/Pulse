import { BrowserWindow, powerMonitor } from 'electron'
import { listEnabledFeedsForPolling, updateFeedFetchMeta, type PollableFeed } from '../database/feeds'
import { upsertArticles, updateArticleScore } from '../database/articles'
import { listTickers, type Ticker } from '../database/tickers'
import { listGeoInterests } from '../database/geoInterests'
import {
  listArticlesNeedingClassification,
  markClassifiedWithNoMatches,
  upsertMatches,
  type ArticleTickerMatch
} from '../database/articleTickerMatches'
import { getDb } from '../database/connection'
import { fetchFeed } from './rssParser'
import { buildUrgencyContext, scoreArticle, type UrgencyContext } from './urgencyScorer'
import { notifyUrgent, trackMedium } from './notificationManager'
import { enqueueOllamaTask, scoreWithOllama } from './ollamaService'
import { refreshAllTickerSummaries } from './tickerSummaryService'
import { classifyArticleAgainstTickers } from './tickerRelevance'
import { isVideoGenBusy, onVideoGenSettled } from './videoGenService'
import { isKokoroBusy, onKokoroSettled } from './kokoroService'
import { isMediaToolsBusy, onMediaToolsSettled } from './mediaToolsService'

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const POLL_CONCURRENCY = 6
// Per-poll ceiling on Ollama scoring calls. Without this, a single poll can
// queue 30+ AI calls back-to-back and peg mistral for a minute, which burns
// energy and delays urgent notifications. The overflow is drained off-peak
// (see idleScoreDrain) when the system has been idle.
const MAX_AI_CALLS_PER_POLL = 20
const IDLE_DRAIN_INTERVAL_MS = 30_000
const IDLE_THRESHOLD_SEC = 60

let intervalHandle: NodeJS.Timeout | null = null
let idleDrainHandle: NodeJS.Timeout | null = null
let pollInProgress = false
let paused = false
// Suppress notifications on the very first poll so a cold-start catch-up
// doesn't flood the user. Flipped to true at the end of the first pollAllFeeds.
let notificationsArmed = false
// Deferred-poll tracking: when we skip a poll because the Python ML workers
// (SDXL, Kokoro) are in the middle of a cold-start install/download/load, we
// subscribe to their settle events and retry once they're idle again.
let deferredPollPending = false
// Current poll's AI budget. Reset at the start of each pollAllFeeds.
let aiCallsUsed = 0
// Score-3 articles that exceeded the per-poll AI budget. Drained when the
// system has been idle for IDLE_THRESHOLD_SEC, one item per tick.
const deferredScoreQueue: Array<() => Promise<void>> = []

export interface PollSummary {
  startedAt: number
  durationMs: number
  feedsPolled: number
  articlesInserted: number
  errors: Array<{ feedId: number; title: string; error: string }>
}

export async function pollAllFeeds(options: { force?: boolean } = {}): Promise<PollSummary> {
  if (pollInProgress) {
    return { startedAt: Date.now(), durationMs: 0, feedsPolled: 0, articlesInserted: 0, errors: [] }
  }
  // Yield to heavy ML cold-start work (SDXL, Kokoro). They hammer the network
  // and disk installing/downloading; running 44 concurrent feed fetches on top
  // slows both. Re-run automatically once they settle. Manual refreshes from
  // the UI pass force=true to bypass this.
  if (!options.force && (isVideoGenBusy() || isKokoroBusy() || isMediaToolsBusy())) {
    if (!deferredPollPending) {
      deferredPollPending = true
      console.log('[poller] deferring poll until video-gen / kokoro / mediaTools finish loading')
      const runDeferred = (): void => {
        if (isVideoGenBusy() || isKokoroBusy() || isMediaToolsBusy()) return
        deferredPollPending = false
        void pollAllFeeds()
      }
      onVideoGenSettled(runDeferred)
      onKokoroSettled(runDeferred)
      onMediaToolsSettled(runDeferred)
    }
    return { startedAt: Date.now(), durationMs: 0, feedsPolled: 0, articlesInserted: 0, errors: [] }
  }
  pollInProgress = true
  aiCallsUsed = 0
  const startedAt = Date.now()
  const feeds = listEnabledFeedsForPolling()
  const scoringCtx = buildUrgencyContext()
  // Snapshot the active watchlist once per poll so every inserted article is
  // classified against the same ticker set — cheaper than re-reading from DB
  // per feed batch and identical in behaviour since ticker changes are rare
  // relative to poll cadence. Reuse the same snapshot for promptLists so
  // pollAllFeeds doesn't pay for two `SELECT * FROM tickers` per cycle.
  const allTickers = listTickers()
  const activeTickers = allTickers.filter((t) => t.isActive)
  const promptLists = buildPromptLists(allTickers)
  let articlesInserted = 0
  const errors: PollSummary['errors'] = []

  try {
    for (let i = 0; i < feeds.length; i += POLL_CONCURRENCY) {
      const batch = feeds.slice(i, i + POLL_CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map((f) => pollOne(f, scoringCtx, promptLists, activeTickers))
      )
      results.forEach((res, idx) => {
        const feed = batch[idx]!
        if (res.status === 'fulfilled') {
          articlesInserted += res.value.inserted
          if (res.value.error) errors.push({ feedId: feed.id, title: feed.title, error: res.value.error })
        } else {
          errors.push({
            feedId: feed.id,
            title: feed.title,
            error: res.reason instanceof Error ? res.reason.message : String(res.reason)
          })
        }
      })
    }
  } finally {
    pollInProgress = false
    notificationsArmed = true
  }

  const summary: PollSummary = {
    startedAt,
    durationMs: Date.now() - startedAt,
    feedsPolled: feeds.length,
    articlesInserted,
    errors
  }
  broadcast('feeds:polled', summary)
  console.log(
    `[poller] ${feeds.length} feeds in ${summary.durationMs}ms — ${articlesInserted} new articles, ${errors.length} errors`
  )
  // Pre-compute per-ticker summaries in the background so clicks on a ticker
  // are instant. Run on the first poll (to populate the cache on a cold launch)
  // and any subsequent poll that ingested new articles.
  if (articlesInserted > 0 || !tickerSummariesBootstrapped) {
    tickerSummariesBootstrapped = true
    void refreshAllTickerSummaries()
  }
  return summary
}

let tickerSummariesBootstrapped = false

interface PromptLists {
  tickers: string[]
  interests: string[]
}

function buildPromptLists(allTickers: Ticker[]): PromptLists {
  const tickers = allTickers
    .filter((t) => t.isActive)
    .map((t) => `${t.symbol} (${t.companyName})`)
  const interests = listGeoInterests()
    .filter((g) => g.isActive)
    .map((g) => g.displayName)
  return { tickers, interests }
}

async function pollOne(
  feed: PollableFeed,
  ctx: UrgencyContext,
  promptLists: PromptLists,
  activeTickers: Ticker[]
): Promise<{ inserted: number; error?: string }> {
  const result = await fetchFeed(feed.url, feed.etag, feed.lastModified)
  const now = Date.now()

  if (result.status === 'error') {
    updateFeedFetchMeta(feed.id, now, feed.etag, feed.lastModified)
    return { inserted: 0, error: result.error }
  }
  if (result.status === 'not-modified') {
    updateFeedFetchMeta(feed.id, now, result.etag ?? feed.etag, result.lastModified ?? feed.lastModified)
    return { inserted: 0 }
  }

  const inserted = upsertArticles(
    (result.articles ?? []).map((a) => {
      const scored = scoreArticle(
        { title: a.title, summary: a.summary, domain: feed.domain },
        ctx
      )
      return {
        feedId: feed.id,
        guid: a.guid,
        title: a.title,
        summary: a.summary,
        url: a.url,
        publishedAt: a.publishedAt,
        domain: feed.domain,
        imageURL: a.imageURL,
        urgencyScore: scored.score,
        urgencyReason: scored.reason,
        scoredAt: now
      }
    })
  )

  classifyInsertedArticles(inserted, activeTickers)

  // Ticker-owned feeds carry a built-in relevance guarantee: Yahoo / Nasdaq
  // only emit an item under NVDA's per-ticker RSS when it's about NVDA. Write
  // a strong match directly so the classifier's word-boundary caution doesn't
  // miss a real NVDA article whose headline doesn't happen to contain the
  // literal string "Nvidia".
  if (feed.tickerId !== null && feed.tickerSymbol && inserted.length > 0) {
    upsertMatches(
      inserted.map((row) => ({
        articleId: row.id,
        symbol: feed.tickerSymbol!,
        strength: 'strong' as const
      }))
    )
  }

  const notifyOnPromote = notificationsArmed && feed.notificationsEnabled
  for (const row of inserted) {
    if (row.urgencyScore === null) continue
    if (row.urgencyScore >= 4) {
      if (notifyOnPromote) {
        notifyUrgent({
          articleId: row.id,
          title: row.title,
          summary: row.summary,
          feedTitle: feed.title,
          urgencyReason: row.urgencyReason
        })
      }
    } else if (row.urgencyScore === 3) {
      // Ambiguous — hand off to Ollama for refined scoring. If we've already
      // burned the per-poll AI budget, defer to the idle-drain queue instead
      // of queueing a long synchronous backlog on mistral.
      const task = async (): Promise<void> => {
        const refined = await scoreWithOllama({
          title: row.title,
          summary: row.summary,
          domain: feed.domain,
          tickers: promptLists.tickers,
          interests: promptLists.interests
        })
        if (!refined) return
        updateArticleScore(row.id, refined.score, `AI: ${refined.reason}`.slice(0, 280))
        if (refined.score >= 4 && notifyOnPromote) {
          notifyUrgent({
            articleId: row.id,
            title: row.title,
            summary: row.summary,
            feedTitle: feed.title,
            urgencyReason: refined.reason
          })
        } else if (refined.score >= 2 && notifyOnPromote) {
          trackMedium({ articleId: row.id, title: row.title, feedTitle: feed.title })
        }
      }
      if (aiCallsUsed < MAX_AI_CALLS_PER_POLL) {
        aiCallsUsed++
        enqueueOllamaTask(task)
      } else {
        deferredScoreQueue.push(task)
      }
    } else if (row.urgencyScore >= 2 && notifyOnPromote) {
      trackMedium({ articleId: row.id, title: row.title, feedTitle: feed.title })
    }
  }

  updateFeedFetchMeta(feed.id, now, result.etag ?? null, result.lastModified ?? null)
  return { inserted: inserted.length }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

// powerMonitor handlers must be registered ONCE for the lifetime of the
// process. applyPreferences() calls stopPolling() + startPolling() on every
// preference save; if we re-registered listeners here they'd stack and a
// single Mac wake would fire N polls. Module-level flag gates registration.
let powerHandlersRegistered = false

function ensurePowerHandlers(): void {
  if (powerHandlersRegistered) return
  powerHandlersRegistered = true
  powerMonitor.on('suspend', () => {
    paused = true
  })
  powerMonitor.on('resume', () => {
    paused = false
    void pollAllFeeds()
  })
}

export function startPolling(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  stopPolling()
  // Kick off immediately, then on interval.
  void pollAllFeeds()
  intervalHandle = setInterval(() => {
    if (!paused) void pollAllFeeds()
  }, intervalMs)

  // Drain the deferred AI-score queue only while the user is genuinely away
  // from the keyboard, so mistral runs don't compete with interactive work.
  idleDrainHandle = setInterval(() => {
    if (paused) return
    if (deferredScoreQueue.length === 0) return
    if (powerMonitor.getSystemIdleTime() < IDLE_THRESHOLD_SEC) return
    const task = deferredScoreQueue.shift()
    if (task) enqueueOllamaTask(task)
  }, IDLE_DRAIN_INTERVAL_MS)

  ensurePowerHandlers()
}

export function stopPolling(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
  if (idleDrainHandle) {
    clearInterval(idleDrainHandle)
    idleDrainHandle = null
  }
}

// Classify a fresh batch of inserted articles against the active watchlist
// and persist strong/weak matches. Articles that touch no ticker get a
// sentinel row so the startup backfill knows they're already considered.
function classifyInsertedArticles(
  inserted: Array<{ id: number; title: string; summary: string | null }>,
  activeTickers: Ticker[]
): void {
  if (inserted.length === 0 || activeTickers.length === 0) {
    // Still mark articles as classified so the backfill skips them — otherwise
    // a watchlist-less install would re-scan the same articles every boot.
    for (const row of inserted) markClassifiedWithNoMatches(row.id)
    return
  }
  const rows: ArticleTickerMatch[] = []
  for (const article of inserted) {
    const matches = classifyArticleAgainstTickers(
      { title: article.title, summary: article.summary },
      activeTickers
    )
    if (matches.size === 0) {
      markClassifiedWithNoMatches(article.id)
      continue
    }
    for (const [symbol, strength] of matches) {
      rows.push({ articleId: article.id, symbol, strength })
    }
  }
  if (rows.length > 0) upsertMatches(rows)
}

// Backfill classifications for articles that predate the matches table or
// that were ingested when the watchlist was empty. Runs once at startup in
// batches so we don't block boot — the UI degrades gracefully if a ticker's
// matches aren't yet populated (it just shows fewer articles than expected
// until the backfill catches up).
const BACKFILL_BATCH = 500
let backfilling = false

export async function backfillArticleTickerMatches(): Promise<void> {
  if (backfilling) return
  backfilling = true
  try {
    const activeTickers = listTickers().filter((t) => t.isActive)
    // Even with no tickers we still stamp the sentinel so future runs skip.
    let total = 0
    while (true) {
      const batch = listArticlesNeedingClassification(BACKFILL_BATCH)
      if (batch.length === 0) break
      classifyInsertedArticles(batch, activeTickers)
      total += batch.length
      // Yield back to the event loop between batches so we don't monopolize
      // the main thread during boot.
      await new Promise((r) => setImmediate(r))
    }
    if (total > 0) {
      console.log(`[poller] backfilled article-ticker matches for ${total} articles`)
    }
  } finally {
    backfilling = false
  }
}

// Re-classify every article against a single ticker. Called when the user
// adds a ticker to the watchlist — existing articles haven't been considered
// against this symbol yet, so the brief would be empty until the next poll.
export async function classifyAllArticlesForTicker(ticker: Ticker): Promise<void> {
  const db = getDb()
  const BATCH = 500
  let offset = 0
  while (true) {
    const batch = db
      .prepare<[number, number], { id: number; title: string; summary: string | null }>(
        `SELECT id, title, summary FROM articles
         ORDER BY publishedAt DESC, id DESC
         LIMIT ? OFFSET ?`
      )
      .all(BATCH, offset)
    if (batch.length === 0) break
    const rows: ArticleTickerMatch[] = []
    for (const a of batch) {
      const matches = classifyArticleAgainstTickers(
        { title: a.title, summary: a.summary },
        [ticker]
      )
      const strength = matches.get(ticker.symbol.toUpperCase())
      if (strength && strength !== 'none') {
        rows.push({ articleId: a.id, symbol: ticker.symbol, strength })
      }
    }
    if (rows.length > 0) upsertMatches(rows)
    offset += batch.length
    await new Promise((r) => setImmediate(r))
  }
}
