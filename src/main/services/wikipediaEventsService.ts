// Wikipedia Current Events Portal ingest — fuels the `worldEvent` calendar
// kind. The portal publishes a daily subpage (Portal:Current_events/<date>)
// with categorized bullet events curated by editors, which is exactly the
// signal we want: "big enough to warrant a reference" without the noise of
// a raw news feed.
//
// Coverage is trailing-only: the portal logs what happened that day, so this
// service fetches the last N days (default 3) and surfaces them alongside
// forward-looking calendar kinds. That turns the calendar strip from a pure
// "what's next" surface into a "what's on the radar" one — matching its
// existing "On the Radar" header.
//
// Cache: one entry per day, 1h TTL. Today's page changes intraday as editors
// add events, but the portal is low-traffic enough that 1h is plenty.

import { JSDOM, VirtualConsole } from 'jsdom'

const WIKI_PARSE_API = 'https://en.wikipedia.org/w/api.php'
const FETCH_TIMEOUT_MS = 10_000
const DAY_TTL_MS = 60 * 60_000
// Per-day cap doubles as day-normalization: today's portal page is often empty
// until editors populate it, so without an equal cap the two days before
// dominate the strip. 3/day × 3 days ≈ 9 events total — few enough to scan
// without overwhelming the calendar strip.
const MAX_EVENTS_PER_DAY = 3
// Per-category cap so a single busy section (usually "Armed conflicts and
// attacks") doesn't monopolize the slots and starve Politics, Business, etc.
const MAX_EVENTS_PER_CATEGORY = 1

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

export interface WikiWorldEvent {
  // Stable id so React reconciles across refetches: date + category + index.
  id: string
  // Unix ms at local midnight of the event's date. The event is all-day; the
  // portal doesn't carry timestamps.
  date: number
  title: string
  category: string
  // First external reference linked from the bullet, if any. Routes through
  // the in-app webview so the user stays in Pulse.
  url: string | null
}

interface CachedDay {
  events: WikiWorldEvent[]
  fetchedAt: number
}

const dayCache = new Map<string, CachedDay>()

function dayKey(year: number, month0: number, day: number): string {
  return `${year}-${month0 + 1}-${day}`
}

function pageTitle(year: number, month0: number, day: number): string {
  return `Portal:Current_events/${year}_${MONTHS[month0]}_${day}`
}

function localMidnight(year: number, month0: number, day: number): number {
  return new Date(year, month0, day, 0, 0, 0, 0).getTime()
}

// Strip MediaWiki citation superscripts (`[1]`, `[a]`, etc.) plus trailing
// punctuation whitespace. The portal tends to terminate bullets with a
// period then a citation, so we also trim a dangling period if one remains.
function cleanText(raw: string): string {
  return raw
    .replace(/\[[^\]]{1,6}\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Wikipedia's Current Events daily subpage nests real event prose at the
// leaf of a <li><ul><li><ul>… tree, where each outer bullet is a topic
// heading (e.g., "Middle Eastern crisis" → "2026 Iran war" → "…ceasefire" →
// leaf: "Trump announces that the ceasefire will be extended…"). Categories
// are bolded paragraphs (`<p><b>Armed conflicts and attacks</b></p>`) that
// precede the top-level <ul> for their section.
//
// The portal templates wrap everything in two layers of <div> before the
// actual content list — `.mw-parser-output > .current-events > .current-
// events-main.vevent > .current-events-content.description`. Target that
// content div as the walk root so we don't miss the nested structure, and
// extract leaf bullets only (any <li> that contains another <ul> is a topic
// title rather than an event).
function findLeafLinkURL(li: Element): string | null {
  for (const a of Array.from(li.querySelectorAll('a'))) {
    const href = a.getAttribute('href')
    if (!href || !/^https?:\/\//i.test(href)) continue
    if (/^https?:\/\/en\.wikipedia\.org\//i.test(href)) continue
    return href
  }
  return null
}

function parseDayHtml(html: string, eventDate: number, dateKey: string): WikiWorldEvent[] {
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('error', () => {
    // jsdom will warn on CSS parse errors inside Wikipedia's inline styles;
    // they are harmless to us and would otherwise spam stderr.
  })
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { virtualConsole })
  const doc = dom.window.document
  const parserOutput = doc.querySelector('.mw-parser-output')
  const content =
    parserOutput?.querySelector('.current-events-content.description') ??
    parserOutput ??
    doc.body

  const events: WikiWorldEvent[] = []
  let currentCategory = 'World events'
  let indexInCategory = 0
  let emittedInCategory = 0

  const emitLeaves = (ul: Element): void => {
    if (events.length >= MAX_EVENTS_PER_DAY) return
    for (const li of Array.from(ul.children)) {
      if (events.length >= MAX_EVENTS_PER_DAY) return
      if (emittedInCategory >= MAX_EVENTS_PER_CATEGORY) return
      if (li.tagName.toLowerCase() !== 'li') continue
      if (li.classList.contains('mw-empty-elt')) continue
      let nestedList: Element | null = null
      for (const child of Array.from(li.children)) {
        const t = child.tagName.toLowerCase()
        if (t === 'ul' || t === 'ol') {
          nestedList = child
          break
        }
      }
      if (nestedList) {
        emitLeaves(nestedList)
        continue
      }
      const text = cleanText(li.textContent ?? '')
      if (!text) continue
      events.push({
        id: `wiki:${dateKey}:${currentCategory}:${indexInCategory++}`,
        date: eventDate,
        title: text,
        category: currentCategory,
        url: findLeafLinkURL(li)
      })
      emittedInCategory++
    }
  }

  for (const node of Array.from(content.children)) {
    if (events.length >= MAX_EVENTS_PER_DAY) break
    const tag = node.tagName.toLowerCase()
    // Category heading shapes:
    //   <p><b>Armed conflicts and attacks</b></p>
    //   <dl><dt>Armed conflicts and attacks</dt></dl>
    //   <h2|h3|h4>…</h*>
    if (tag === 'p') {
      const bold = node.querySelector('b, strong')
      if (bold && bold.textContent && node.textContent?.trim() === bold.textContent.trim()) {
        currentCategory = bold.textContent.trim()
        indexInCategory = 0
        emittedInCategory = 0
      }
      continue
    }
    if (tag === 'dl') {
      const dt = node.querySelector('dt')
      if (dt?.textContent) {
        currentCategory = dt.textContent.trim()
        indexInCategory = 0
        emittedInCategory = 0
      }
      for (const dd of Array.from(node.children)) {
        if (dd.tagName.toLowerCase() !== 'dd') continue
        for (const inner of Array.from(dd.children)) {
          const t = inner.tagName.toLowerCase()
          if (t === 'ul' || t === 'ol') emitLeaves(inner)
        }
      }
      continue
    }
    if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const text = node.textContent?.replace(/\[edit\]/gi, '').trim()
      if (text) {
        currentCategory = text
        indexInCategory = 0
        emittedInCategory = 0
      }
      continue
    }
    if (tag === 'ul' || tag === 'ol') {
      emitLeaves(node)
    }
  }

  return events
}

async function fetchDay(year: number, month0: number, day: number): Promise<WikiWorldEvent[]> {
  const key = dayKey(year, month0, day)
  const cached = dayCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < DAY_TTL_MS) return cached.events

  const params = new URLSearchParams({
    action: 'parse',
    page: pageTitle(year, month0, day),
    prop: 'text',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    disabletoc: '1',
    disableeditsection: '1',
    origin: '*'
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${WIKI_PARSE_API}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        // Wikimedia asks for a descriptive UA with contact info; a generic
        // browser UA gets rate-limited harder.
        'User-Agent': 'Pulse/0.1 (https://github.com/ashwin-sreedhar/pulse; private app) jsdom'
      },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { parse?: { text?: string }; error?: { code?: string } }
    // `missingtitle` just means that day's portal page doesn't exist yet —
    // normal for today before any editor has created it. Cache an empty
    // result so we don't retry immediately.
    if (json.error?.code === 'missingtitle' || !json.parse?.text) {
      dayCache.set(key, { events: [], fetchedAt: Date.now() })
      return []
    }
    const eventDate = localMidnight(year, month0, day)
    const events = parseDayHtml(json.parse.text, eventDate, key)
    dayCache.set(key, { events, fetchedAt: Date.now() })
    return events
  } catch (err) {
    console.warn(
      `[wiki-events] fetch failed for ${key}:`,
      err instanceof Error ? err.message : err
    )
    // Serve stale cache on error rather than 0 events — a transient network
    // blip shouldn't empty the strip.
    return cached?.events ?? []
  } finally {
    clearTimeout(timer)
  }
}

// Returns events for the last `trailingDays` whole days including today,
// sorted ascending by date. Most-recent day last so the calendar strip shows
// "older → newer" from left to right, matching the forward-looking kinds.
export async function getWorldEvents(
  now: number,
  trailingDays: number = 3
): Promise<WikiWorldEvent[]> {
  const today = new Date(now)
  const results = await Promise.all(
    Array.from({ length: trailingDays }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
      return fetchDay(d.getFullYear(), d.getMonth(), d.getDate())
    })
  )
  return results.flat().sort((a, b) => a.date - b.date)
}
