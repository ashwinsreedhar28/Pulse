// Daily Claude-authored pre-market brief. Pulls overnight news, this-week
// earnings, and just-landed SEC filings for every watchlist ticker, hands
// it to claudeService.generateMorningBrief, and persists the structured
// result via morning_briefs (single-row table).
//
// Cadence: refreshed on boot if the stored brief is more than
// BRIEF_STALE_AFTER_MS old. Manual refresh button (IPC) bypasses the
// staleness gate. Cron-style "always run at ~5am ET" is a future
// improvement once we have a less coupled scheduler — the boot-trigger
// catches the common case (user opens Pulse in the morning).

import { BrowserWindow } from 'electron'

import { listArticlesForTicker } from '../database/articles'
import {
  getMorningBrief,
  setMorningBrief,
  type BriefPayload
} from '../database/morningBriefs'
import { getRecentFilingsForSymbols, type SecFiling } from '../database/secFilings'
import { listTickers } from '../database/tickers'
import { recordClaudeCall, resolveProvider } from './aiClient'
import { generateMorningBrief } from './claudeService'
import { getEarnings } from './yahooFinanceService'
import { INTERESTING_FORMS, buildPrimaryDocUrl } from './secService'

// Generate at most once per this window even when called repeatedly. Manual
// refresh bypasses (force=true). 4 hours catches the "user opens Pulse mid-
// morning, brief still fresh from earlier today" case without re-burning a
// Sonnet call.
const BRIEF_STALE_AFTER_MS = 4 * 60 * 60 * 1000

// How far back to pull news for the brief. 16h covers overnight + early
// pre-market without dragging in yesterday's lunch headlines.
const NEWS_WINDOW_MS = 16 * 60 * 60 * 1000

// Earnings calendar window — "next week" is the standard pre-market frame.
const EARNINGS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// Filings landed in the last day. Anything older isn't pre-market news.
const FILINGS_WINDOW_MS = 24 * 60 * 60 * 1000

// Cap inputs handed to Claude so a heavy news day doesn't blow the context
// budget. Per category caps; the prompt also re-truncates.
const MAX_NEWS_PER_TICKER = 3
const MAX_NEWS_TOTAL = 30
const MAX_EARNINGS_TOTAL = 20
const MAX_FILINGS_TOTAL = 20

// Boot-time delay before the first-eligibility check fires. Long enough that
// the financials backfill + chain auto-regen aren't competing for Claude
// bandwidth, short enough that the brief lands well before the user starts
// scrolling.
const BOOT_DELAY_MS = 5 * 60 * 1000

interface BriefAssembly {
  newsLines: string[]
  earningsLines: string[]
  filingsLines: string[]
  // accessionNumber → resolved primary-doc URL, used to enrich filing
  // citations with a clickable link before the brief is persisted.
  filingUrlByAccession: Map<string, string>
}

// Format a unix-ms into a short "Mon Apr 25" label for inline use.
function shortDate(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return 'unknown date'
  const d = new Date(ms)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function localDateLabel(): string {
  const d = new Date()
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

async function assembleInputs(symbols: string[]): Promise<BriefAssembly & { earningsCounted: number }> {
  const now = Date.now()
  const sinceNews = now - NEWS_WINDOW_MS
  const sinceFilings = now - FILINGS_WINDOW_MS
  const earningsCutoff = now + EARNINGS_WINDOW_MS

  // ---- News ----
  // Pull per-ticker, then merge + rank by publishedAt desc + cap. Each line
  // carries the article id so Claude can cite it; the renderer maps the id
  // back to the in-app reader on click.
  type NewsLine = { line: string; publishedAt: number }
  const newsLines: NewsLine[] = []
  for (const sym of symbols) {
    const articles = listArticlesForTicker(sym, {
      sinceMs: sinceNews,
      limit: MAX_NEWS_PER_TICKER * 2,
      includeWeak: false
    })
    for (const a of articles.slice(0, MAX_NEWS_PER_TICKER)) {
      const headline = a.title.trim().slice(0, 220)
      const summary = a.summary ? a.summary.trim().slice(0, 200) : ''
      const tag = `[article:${a.id}]`
      const published = a.publishedAt ?? 0
      const line =
        `${sym} ${tag} ${headline}` +
        (summary ? ` — ${summary}` : '') +
        ` (urgency: ${a.urgencyScore ?? 0})`
      newsLines.push({ line, publishedAt: published })
    }
  }
  newsLines.sort((a, b) => b.publishedAt - a.publishedAt)

  // ---- Earnings ----
  // Yahoo's calendarEvents already cached; we fan out with a small parallel
  // limit so the boot scheduler doesn't queue 50 sequential network calls.
  const earningsResults = await Promise.all(
    symbols.map(async (sym) => {
      try {
        const cal = await getEarnings(sym)
        if (!cal?.nextDate) return null
        if (cal.nextDate > earningsCutoff || cal.nextDate < now - 24 * 60 * 60 * 1000) {
          return null
        }
        const dateLabel = shortDate(cal.nextDate)
        const tag = `[symbol:${sym}]`
        const conf = cal.isEstimate ? ' (est)' : ''
        return {
          line: `${sym} ${tag} reports ${dateLabel}${conf}`,
          when: cal.nextDate
        }
      } catch {
        return null
      }
    })
  )
  const earningsLines = earningsResults
    .filter((r): r is { line: string; when: number } => r !== null)
    .sort((a, b) => a.when - b.when)
    .slice(0, MAX_EARNINGS_TOTAL)
    .map((r) => r.line)

  // ---- Filings ----
  // 8-K, 10-Q, 10-K, S-1, 13D — anything in INTERESTING_FORMS. Per-ticker
  // map, flatten + sort.
  const filingsBySymbol = getRecentFilingsForSymbols(symbols, sinceFilings, INTERESTING_FORMS)
  const filingsLines: string[] = []
  type FilingPair = { symbol: string; filing: SecFiling }
  const flatFilings: FilingPair[] = []
  for (const [symbol, filings] of filingsBySymbol) {
    for (const f of filings) flatFilings.push({ symbol, filing: f })
  }
  flatFilings.sort((a, b) => b.filing.filedAt - a.filing.filedAt)
  const filingUrlByAccession = new Map<string, string>()
  for (const { symbol, filing } of flatFilings.slice(0, MAX_FILINGS_TOTAL)) {
    const dateLabel = shortDate(filing.filedAt)
    const items = filing.items ? ` (items ${filing.items})` : ''
    const desc = filing.primaryDocDescription
      ? ` — ${filing.primaryDocDescription.slice(0, 80)}`
      : ''
    const tag = `[filing:${filing.accessionNumber}]`
    filingsLines.push(`${symbol} ${tag} ${filing.formType} filed ${dateLabel}${items}${desc}`)
    filingUrlByAccession.set(
      filing.accessionNumber,
      buildPrimaryDocUrl(filing.cik, filing.accessionNumber, filing.primaryDocument)
    )
  }

  return {
    newsLines: newsLines.slice(0, MAX_NEWS_TOTAL).map((n) => n.line),
    earningsLines,
    filingsLines,
    filingUrlByAccession,
    earningsCounted: earningsLines.length
  }
}

let inFlight: Promise<BriefPayload | null> | null = null

export async function refreshMorningBrief(opts: { force?: boolean } = {}): Promise<BriefPayload | null> {
  // Single-flight: a manual click while the boot run is in progress just
  // returns the in-flight promise instead of starting a parallel call.
  if (inFlight) return inFlight
  inFlight = (async (): Promise<BriefPayload | null> => {
    try {
      const existing = getMorningBrief()
      if (
        !opts.force &&
        existing &&
        Date.now() - existing.generatedAt < BRIEF_STALE_AFTER_MS
      ) {
        return existing.payload
      }
      const provider = resolveProvider()
      if (provider !== 'claude') {
        console.log('[brief] skip — Claude not configured (provider=' + provider + ')')
        return existing?.payload ?? null
      }
      const watchlist = listTickers().filter((t) => t.isActive).map((t) => t.symbol.toUpperCase())
      if (watchlist.length === 0) {
        console.log('[brief] skip — empty watchlist')
        return null
      }
      const inputs = await assembleInputs(watchlist)
      const totalLines =
        inputs.newsLines.length +
        inputs.earningsLines.length +
        inputs.filingsLines.length
      if (totalLines === 0) {
        console.log('[brief] skip — no news / earnings / filings to summarize')
        return existing?.payload ?? null
      }
      console.log(
        `[brief] generating: ${watchlist.length} watchlist, ${inputs.newsLines.length} news, ` +
          `${inputs.earningsLines.length} earnings, ${inputs.filingsLines.length} filings`
      )
      recordClaudeCall()
      const payload = await generateMorningBrief({
        watchlistSize: watchlist.length,
        newsLines: inputs.newsLines,
        earningsLines: inputs.earningsLines,
        filingsLines: inputs.filingsLines,
        ivLines: [],
        localDateLabel: localDateLabel()
      })
      if (!payload) {
        console.warn('[brief] Claude returned no usable payload')
        return existing?.payload ?? null
      }
      // Enrich filing citations with their resolved URLs so the renderer
      // can deep-link without an additional round trip. Article citations
      // route through the in-app reader by id; symbol citations open the
      // ticker detail page — neither needs a URL.
      for (const section of payload.sections) {
        for (const bullet of section.bullets) {
          if (!bullet.citations) continue
          for (const c of bullet.citations) {
            if (c.type !== 'filing') continue
            const url = inputs.filingUrlByAccession.get(c.ref)
            if (url) c.url = url
          }
        }
      }
      setMorningBrief({
        payload,
        watchlistSize: watchlist.length,
        provider: 'claude'
      })
      broadcastUpdated()
      console.log(`[brief] saved — headline: "${payload.headline.slice(0, 80)}"`)
      return payload
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function getCurrentMorningBrief(): ReturnType<typeof getMorningBrief> {
  return getMorningBrief()
}

function broadcastUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('morningBrief:updated')
    }
  }
}

// Boot scheduler. Fires once per launch BOOT_DELAY_MS after startup; the
// staleness gate inside refreshMorningBrief decides whether the call
// actually hits Claude or just returns the cached row.
export function scheduleMorningBriefRefresh(): void {
  setTimeout(() => {
    void refreshMorningBrief().catch((err) => {
      console.warn('[brief] boot refresh failed:', err instanceof Error ? err.message : err)
    })
  }, BOOT_DELAY_MS)
}
