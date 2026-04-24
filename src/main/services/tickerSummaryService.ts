import { BrowserWindow } from 'electron'
import { listArticlesForTicker } from '../database/articles'
import { listTickers } from '../database/tickers'
import { getTickerSummary, upsertTickerSummary } from '../database/tickerSummaries'
import { checkOllamaHealth, summarizeTickerNews } from './ollamaService'
import { getCompanyProfile } from './companyProfileService'

const WINDOW_MS = 24 * 60 * 60 * 1000
const MIN_REGEN_INTERVAL_MS = 15 * 60 * 1000
const MAX_CONCURRENT = 1

let running = false
let queuedRun = false

function broadcast(tickerId: number): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('tickers:summaryUpdated', tickerId)
  }
}

async function refreshOne(tickerId: number, force: boolean): Promise<void> {
  const tickers = listTickers()
  const ticker = tickers.find((t) => t.id === tickerId)
  if (!ticker) return
  const prev = getTickerSummary(tickerId)
  const cutoff = Date.now() - WINDOW_MS
  // Strong-match only: articles that name the company directly. The classifier
  // has already filtered out bare-symbol noise ("ARM" in a laptop article),
  // so what we pass to the LLM is guaranteed on-topic at the retrieval level.
  const recent = listArticlesForTicker(ticker.symbol, { limit: 40, sinceMs: cutoff })
  const lastArticleAt = recent.length > 0 ? (recent[0].publishedAt ?? null) : null

  // Skip if nothing material changed since the last successful run.
  if (
    !force &&
    prev &&
    prev.summary !== null &&
    prev.articleCount === recent.length &&
    prev.lastArticleAt === lastArticleAt &&
    Date.now() - prev.generatedAt < MIN_REGEN_INTERVAL_MS
  ) {
    return
  }

  if (recent.length === 0) {
    upsertTickerSummary({
      tickerId,
      summary: null,
      articleCount: 0,
      relevantCount: 0,
      generatedAt: Date.now(),
      lastArticleAt: null
    })
    broadcast(tickerId)
    return
  }

  const online = await checkOllamaHealth()
  if (!online) {
    // Record the article count so the UI can show "N articles" even when the
    // LLM is offline — but leave prev.summary intact if we had one.
    upsertTickerSummary({
      tickerId,
      summary: prev?.summary ?? null,
      articleCount: recent.length,
      relevantCount: prev?.relevantCount ?? null,
      generatedAt: Date.now(),
      lastArticleAt
    })
    broadcast(tickerId)
    return
  }

  // Feed the summarizer the company's own description so the model knows what
  // the ticker actually does — shields against hallucinations that extrapolate
  // "may benefit from" claims by anchoring every sentence to the company's
  // real business.
  const profile = getCompanyProfile(ticker.symbol)
  const result = await summarizeTickerNews({
    symbol: ticker.symbol,
    companyName: ticker.companyName ?? ticker.symbol,
    companyDescription: profile?.description ?? null,
    headlines: recent.slice(0, 10).map((a) => ({
      title: a.title,
      summary: a.summary,
      source: a.feedTitle
    }))
  })

  // `result === null` is a hard failure (Ollama crashed / HTTP error) — keep
  // any previous summary so we don't wipe a valid brief on transient trouble.
  // `result.summary === null` with a valid relevantCount=0 is the "nothing
  // material" signal; we store null to show the empty state in the UI.
  const nextSummary =
    result === null ? (prev?.summary ?? null) : result.summary
  const nextRelevantCount =
    result === null ? (prev?.relevantCount ?? null) : result.relevantCount

  upsertTickerSummary({
    tickerId,
    summary: nextSummary,
    articleCount: recent.length,
    relevantCount: nextRelevantCount,
    generatedAt: Date.now(),
    lastArticleAt
  })
  broadcast(tickerId)
}

async function pump(force: boolean): Promise<void> {
  const tickers = listTickers().filter((t) => t.isActive)
  const queue = tickers.map((t) => t.id)
  const workers: Promise<void>[] = []
  const next = async (): Promise<void> => {
    while (queue.length > 0) {
      const id = queue.shift()!
      try {
        await refreshOne(id, force)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // App is shutting down — `closeDatabase()` has run and every
        // subsequent getDb() throws. Drain the queue silently instead of
        // emitting hundreds of identical error lines for each of the
        // concurrent workers still mid-loop.
        if (msg.includes('Database not initialized')) {
          queue.length = 0
          return
        }
        console.warn('[tickerSummary] refresh failed:', msg)
      }
    }
  }
  for (let i = 0; i < MAX_CONCURRENT; i++) workers.push(next())
  await Promise.all(workers)
}

export async function refreshAllTickerSummaries(force = false): Promise<void> {
  if (running) {
    queuedRun = true
    return
  }
  running = true
  try {
    await pump(force)
    if (queuedRun) {
      queuedRun = false
      await pump(false)
    }
  } finally {
    running = false
  }
}

export function refreshTickerSummary(tickerId: number, force = false): void {
  void refreshOne(tickerId, force).catch((err) =>
    console.warn('[tickerSummary] single refresh failed:', err instanceof Error ? err.message : err)
  )
}

export { getTickerSummary } from '../database/tickerSummaries'
