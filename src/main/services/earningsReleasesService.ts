// Earnings press-release summary pipeline. Given a watchlist ticker's 8-K
// that carries Item 2.02 (Results of Operations), this service:
//
//   1. Fetches the primary document from SEC (the press release HTML)
//   2. Extracts clean body text via jsdom (same lib as readerService)
//   3. Sends it to Ollama for a structured summary
//   4. Stores overview + keyNumbers + guidance + quotes in earnings_releases
//
// Coverage: only triggered for watchlist tickers, and only for 8-Ks whose
// `items` field includes "2.02". Non-earnings 8-Ks (proxy events, leadership
// changes, etc.) are ignored by this service.

import { BrowserWindow } from 'electron'
import { JSDOM, VirtualConsole } from 'jsdom'

import {
  getEarningsRelease,
  getPendingOrOfflineReleases,
  upsertEarningsRelease,
  type EarningsReleaseRow
} from '../database/earningsReleases'
import { getFilingsForSymbol } from '../database/secFilings'
import { listTickers } from '../database/tickers'
import { summarizeEarningsRelease } from './ollamaService'
import {
  buildPrimaryDocUrl,
  INTERESTING_FORMS
} from './secService'
import type { SecFiling } from '../database/secFilings'

const UA = 'Pulse Desktop (ashwin.sreedhar2003@gmail.com)'
const FETCH_TIMEOUT_MS = 20_000

// Proactive retry sweep interval — picks up pending/offline rows and retries
// summarization. Keeps the UI moving forward when Ollama comes back online
// after a window of unavailability.
const RETRY_INTERVAL_MS = 30 * 60 * 1000

// Items field on an 8-K contains a comma-separated code list ("2.02,9.01").
// 2.02 = Results of Operations; the canonical "earnings release" marker.
const EARNINGS_ITEM_CODE = '2.02'

export function isEarningsRelease(filing: SecFiling): boolean {
  if (!filing.formType.startsWith('8-K')) return false
  if (!filing.items) return false
  return filing.items.split(',').some((code) => code.trim() === EARNINGS_ITEM_CODE)
}

// Fetches the primary document, strips to body text, runs it through Ollama.
// Idempotent — safe to call on a row that's already 'ready' (we no-op in
// that case). Callers pass an explicit companyName so we don't have to
// re-query the tickers table every invocation.
export async function summarizeRelease(input: {
  symbol: string
  companyName: string
  filing: SecFiling
}): Promise<EarningsReleaseRow | null> {
  const { symbol, companyName, filing } = input
  if (!isEarningsRelease(filing)) return null
  const existing = getEarningsRelease(symbol, filing.accessionNumber)
  if (existing?.status === 'ready') return existing

  // Mark pending so concurrent invocations don't double-trigger.
  upsertEarningsRelease({
    symbol,
    accessionNumber: filing.accessionNumber,
    status: 'pending',
    summary: null,
    rawTextLength: existing?.rawTextLength ?? null,
    filedAt: filing.filedAt
  })
  broadcastUpdated(symbol)

  const url = buildPrimaryDocUrl(filing.cik, filing.accessionNumber, filing.primaryDocument)
  let bodyText: string
  let rawLength: number
  try {
    const html = await fetchPrimaryDoc(url)
    bodyText = extractText(html)
    rawLength = bodyText.length
    if (rawLength < 200) {
      // Too short to be an actual earnings release — probably a wrapper page
      // that points to an attached exhibit we can't fetch without more work.
      upsertEarningsRelease({
        symbol,
        accessionNumber: filing.accessionNumber,
        status: 'error',
        summary: null,
        rawTextLength: rawLength,
        filedAt: filing.filedAt
      })
      broadcastUpdated(symbol)
      return getEarningsRelease(symbol, filing.accessionNumber)
    }
  } catch (err) {
    console.warn(
      `[earningsReleases] fetch failed for ${symbol} ${filing.accessionNumber}:`,
      err instanceof Error ? err.message : err
    )
    upsertEarningsRelease({
      symbol,
      accessionNumber: filing.accessionNumber,
      status: 'error',
      summary: null,
      rawTextLength: null,
      filedAt: filing.filedAt
    })
    broadcastUpdated(symbol)
    return getEarningsRelease(symbol, filing.accessionNumber)
  }

  const summary = await summarizeEarningsRelease({
    symbol,
    companyName,
    filedAt: filing.filedAt,
    bodyText
  })

  if (!summary) {
    // Ollama offline or bad response. Mark offline so the retry sweep will
    // pick it up later instead of leaving a permanent pending.
    upsertEarningsRelease({
      symbol,
      accessionNumber: filing.accessionNumber,
      status: 'offline',
      summary: null,
      rawTextLength: rawLength,
      filedAt: filing.filedAt
    })
    broadcastUpdated(symbol)
    return getEarningsRelease(symbol, filing.accessionNumber)
  }

  upsertEarningsRelease({
    symbol,
    accessionNumber: filing.accessionNumber,
    status: 'ready',
    summary,
    rawTextLength: rawLength,
    filedAt: filing.filedAt
  })
  broadcastUpdated(symbol)
  return getEarningsRelease(symbol, filing.accessionNumber)
}

async function fetchPrimaryDoc(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        // SEC's fair-access policy: identify yourself. Accept HTML for the
        // EDGAR primary doc; some filings return XBRL/XML but the HTML path
        // is the overwhelming majority for 8-K 2.02 press releases.
        'User-Agent': UA,
        Accept: 'text/html, application/xhtml+xml, text/plain'
      },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// HTML → plain text via jsdom. Earnings release docs are simple enough that
// a direct DOM walk for .textContent is sufficient; no readability parsing
// needed. We strip <script>, <style>, and comments, then normalize whitespace.
function extractText(html: string): string {
  const virtualConsole = new VirtualConsole()
  // jsdom logs CSS parse errors loudly for SEC's stylesheets; silence them.
  virtualConsole.on('error', () => {})
  virtualConsole.on('jsdomError', () => {})
  const dom = new JSDOM(html, { virtualConsole })
  const doc = dom.window.document
  for (const el of Array.from(doc.querySelectorAll('script, style, noscript'))) {
    el.remove()
  }
  const text = (doc.body?.textContent ?? doc.documentElement.textContent ?? '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

function broadcastUpdated(symbol: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('earningsReleases:updated', symbol.toUpperCase())
    }
  }
}

// Called by secFilingsService after a filings sweep. Scans the cached
// filings for a symbol and queues any earnings 8-Ks we haven't summarized
// yet. Cheap — no network fan-out unless a new 8-K 2.02 actually landed.
export async function processRecentEarnings(
  symbol: string,
  companyName: string
): Promise<void> {
  const filings = getFilingsForSymbol(symbol, 10, INTERESTING_FORMS).filter(isEarningsRelease)
  for (const f of filings) {
    const existing = getEarningsRelease(symbol, f.accessionNumber)
    if (existing?.status === 'ready') continue
    // Fire-and-forget; callers don't need to await the whole batch.
    void summarizeRelease({ symbol, companyName, filing: f })
  }
}

async function retrySweep(): Promise<void> {
  const pending = getPendingOrOfflineReleases(12)
  if (pending.length === 0) return
  const tickerMap = new Map<string, string>()
  for (const t of listTickers()) tickerMap.set(t.symbol.toUpperCase(), t.companyName ?? t.symbol)
  for (const row of pending) {
    const filings = getFilingsForSymbol(row.symbol, 10)
    const match = filings.find((f) => f.accessionNumber === row.accessionNumber)
    if (!match) continue
    const companyName = tickerMap.get(row.symbol) ?? row.symbol
    try {
      await summarizeRelease({ symbol: row.symbol, companyName, filing: match })
    } catch (err) {
      console.warn(
        `[earningsReleases] retry failed for ${row.symbol} ${row.accessionNumber}:`,
        err instanceof Error ? err.message : err
      )
    }
  }
}

let timer: NodeJS.Timeout | null = null
let started = false

export function startEarningsReleasesScheduler(): void {
  if (started) return
  started = true
  // Initial retry runs 2 minutes after start — lets the filings scheduler
  // populate the table on its 90s lag first so we have something to retry.
  setTimeout(() => {
    void retrySweep()
  }, 2 * 60 * 1000)
  timer = setInterval(() => {
    void retrySweep()
  }, RETRY_INTERVAL_MS)
}

export function stopEarningsReleasesScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}
