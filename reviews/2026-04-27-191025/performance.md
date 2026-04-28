# Performance Review · 2026-04-27

## TL;DR
The Pulse codebase is unusually performance-aware: visibility-gated polling, idle-gated regen, debounced inputs, GPU layer choices documented inline in `styles.css`, and the splash-orchestration boot path are all defensible. There are **no Critical findings**. The biggest concrete issue is a presentation-mode coverage gap (`body.pulse-presenting` doesn't pause the earnings-pulse halo animation, leaving a flicker surface during screen-share — direct contradiction of the gotcha the user just shipped). Two Important findings: (1) the StocksPage rebuilds a quote→symbol Map and sector grouping unmemoized on every quote tick, doing ~60-Map-allocations + grouping work every minute during market hours, and (2) `companyValueChainService.filingBodyCache` keeps full SEC filing text (~1–3 MB each) in memory for the lifetime of the process with no eviction.

## Critical
None.

## Important

### 1. Presentation-mode CSS rule misses earnings-pulse halo animations
**[src/renderer/styles.css:390-394]** — `body.pulse-presenting` only pauses `.animate-ticker, .animate-ping, .animate-pulse`. The `earnings-pulse-warning::before` / `earnings-pulse-imminent::before` / `earnings-pulse-reported::before` animations defined at lines 627-637 use distinct keyframes (`earnings-pulse-opacity-fast/slow/calm`) and infinite loops (`1500ms`, `2500ms`, `4000ms`). The CSS comment at lines 593-596 explicitly notes "with 10+ tiles pulsing simultaneously, drove full-page jitter" — meaning these animations are exactly the kind of perpetual GPU compositing the screen-share fix was supposed to suppress.

**Cost:** When the user presents the Value Chain page on Zoom/Meet during earnings season, every tile in `imminent` or `warning` state continues to pulse-animate the `::before` halo at 1.5–2.5s cycles. With 5–15 tiles in pulse states (typical during a heavy earnings week), that's 5–15 always-running infinite opacity animations on each tile's `::before` pseudo-element while screen-share capture samples the GPU compositor at a non-aligned cadence. Same flicker class as the marquee, same fix pattern, just missed in the rule.

**Fix:** Extend the rule to cover the earnings-pulse classes:
```css
body.pulse-presenting .animate-ticker,
body.pulse-presenting .animate-ping,
body.pulse-presenting .animate-pulse,
body.pulse-presenting .earnings-pulse-warning::before,
body.pulse-presenting .earnings-pulse-imminent::before,
body.pulse-presenting .earnings-pulse-reported::before,
body.pulse-presenting .earnings-pulse-ambient::before {
  animation-play-state: paused !important;
}
```
**Fix safety:** 🟡 Bug — the just-shipped pulse-presenting feature has incomplete coverage; this is finishing the same fix. No user-visible change beyond "presenting mode now also stops the halo flicker on the value-chain page".

### 2. `StocksPage` rebuilds 60-entry Map + sector grouping on every quote tick
**[src/renderer/App.tsx:3126-3137]** — Inside the StocksPage component body (not inside a `useMemo`):
```js
const bySymbol = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]))
const sectorOrder: string[] = []
const grouped: Record<string, Ticker[]> = {}
for (const t of tickers) {
  if (!t.isActive) continue
  const sector = t.sector?.trim() || 'Other'
  if (!(sector in grouped)) {
    grouped[sector] = []
    sectorOrder.push(sector)
  }
  grouped[sector].push(t)
}
```
StocksPage subscribes to `window.api.stocks.onUpdated(setQuotes)` at line 3107; the broadcast fires once per minute during market hours.

**Cost:** Per quote tick during market hours (60s cadence, 4–8h per weekday): one `Array.prototype.map` over ~60 quotes producing a 60-entry tuple array, one Map allocation, one `for…of` over ~60 tickers producing ~5 sector buckets. Three fresh object/array references per tick → every `StockCard` (none of which are `React.memo`-wrapped) re-renders, fine on its own. The actual cost is the ~60 fresh `quote` references (`bySymbol.get(t.symbol)` returns the same object reference across ticks because `quotes` is a fresh array on each broadcast — Object.is still false), and the `grouped[sector].map(...)` pass on render. Estimate: ~0.5–2 ms of work per tick at 60-symbol scale, repeated every 60 s for hours. Not a screen-share flicker source, but an Always-On Drain pattern.

**Fix:** Wrap both in `useMemo`:
```js
const bySymbol = useMemo(
  () => new Map(quotes.map((q) => [q.symbol.toUpperCase(), q])),
  [quotes]
)
const { sectorOrder, grouped } = useMemo(() => {
  const order: string[] = []
  const buckets: Record<string, Ticker[]> = {}
  for (const t of tickers) {
    if (!t.isActive) continue
    const sector = t.sector?.trim() || 'Other'
    if (!(sector in buckets)) { buckets[sector] = []; order.push(sector) }
    buckets[sector].push(t)
  }
  return { sectorOrder: order, grouped: buckets }
}, [tickers])
```
The `bySymbol` memo still invalidates per quote tick (correct — child cards need fresh quotes), but `sectorOrder` / `grouped` only invalidate when `tickers` actually changes (rare). Wrapping `StockCard` in `React.memo` would compound the win, but that's a larger touch and the parent re-render is already cheap once these allocations stop.
**Fix safety:** 🟢 Safe.

### 3. `filingBodyCache` accumulates full SEC filing text without eviction
**[src/main/services/companyValueChainService.ts:207-219, 244]** — A module-level Map stores raw HTML→text-stripped bodies of SEC filings, keyed by accession number. Comment at lines 212-213: *"Cleared at process start; never invalidated since SEC accessions are immutable."*

**Cost:** Each cached entry holds the full primary-document text of a 10-K/10-Q (typical: 800 KB–3 MB after `stripHtmlToText`, plus the original `filing` object). Bilateral counterparty scans (`fetchFilingBody` calls in `runBilateralFilingScan` line 429, in `extractCustomerConcentration` line 1264, in `runEightKBilateralScan` line 1411, in `runItemOneBilateralScan` line 1495) hit each counterparty's most recent 10-K. Auto-regen-on-boot processes up to 20 stalest tickers per launch; over many days the cache touches every ticker × every counterparty in its chain (typically 5–15 counterparties per chain). Steady-state for a 100-ticker watchlist after a few days of regens: 200–500 cached filings × ~1.5 MB each = **300 MB–750 MB resident in main process**. For a desktop app the user leaves running for hours/days, this is real memory pressure.

**Fix:** Bound the cache. Either an LRU with a size cap (e.g. 50 entries via a small `Map` + insertion-order eviction — `Map` already preserves order, just `delete` the oldest key when over cap), or a TTL-based eviction (clear entries older than 1h; SEC filings are immutable but the cache doesn't have to be). The fetch is cheap to repeat — SEC EDGAR responds in ~200 ms — so eviction has near-zero correctness cost.

```js
// Inside fetchFilingBody, after filingBodyCache.set:
if (filingBodyCache.size > 50) {
  const oldestKey = filingBodyCache.keys().next().value
  if (oldestKey) filingBodyCache.delete(oldestKey)
}
```
**Fix safety:** 🟢 Safe — re-fetching a recently-evicted filing is a 200 ms HTTP call; the worst case is one extra SEC request per chain regen.

### 4. `feedPoller.pollAllFeeds` calls `listTickers()` twice per poll
**[src/main/services/feedPoller.ts:91, 149]** — `pollAllFeeds` loads `listTickers().filter(t => t.isActive)` at line 91, then `buildPromptLists()` at line 86 internally calls `listTickers()` again at line 149.

**Cost:** Two full `SELECT * FROM tickers ORDER BY symbol` against ~100 rows, every 5 minutes. Per poll: ~2 ms of unnecessary DB work. Over 24 h: ~288 polls × duplicate query. Trivial in absolute terms, but `pollAllFeeds` is the most-traveled path in main.

**Fix:** Take the snapshot once and pass it down:
```js
const allTickers = listTickers()
const activeTickers = allTickers.filter((t) => t.isActive)
const promptLists = buildPromptLists(allTickers, listGeoInterests())
```
Refactor `buildPromptLists` to accept tickers + geo as args.
**Fix safety:** 🟢 Safe — pure refactor.

### 5. Ticker-symbol matcher cache is dirty-cleared on every ticker mutation
**[src/main/ipc/handlers.ts:263, 302, 315]** + **[src/main/services/tickerRelevance.ts:145-147]** — `invalidateMatcherCache()` (clears the entire `matcherCache` Map) is called on `db:tickers:create`, `db:tickers:delete`, and `db:tickers:activate`. The cache contains pre-compiled regexes per ticker symbol — building one is ~5 regex compilations + a few `escapeRegex` passes (≈0.5 ms each). For a 100-ticker watchlist, full rebuild on demand is ~50 ms.

**Cost:** Every time a user clicks "+ Add ticker" or "Activate", the next article-classification batch (called by the scheduler immediately after via `classifyAllArticlesForTicker`) triggers a full rebuild. With back-to-back additions of, say, 5 tickers, the user pays ~250 ms of regex recompilation that could have been ~25 ms (only the new ticker compiled fresh).

**Fix:** Make `invalidateMatcherCache` accept an optional symbol — `invalidateMatcherCache(symbol?: string)` — and have the IPC handlers pass the just-changed symbol so only that entry is purged. The Map is keyed by uppercased symbol, so this is a one-line `matcherCache.delete(symbol.toUpperCase())`.
**Fix safety:** 🟢 Safe.

## Nice-to-have

### 6. `db:articles:listForTicker` loads full ticker list to do an O(N) find
**[src/main/ipc/handlers.ts:216-223]** — Handler does `tickersDb.listTickers().find((t) => t.id === tickerId)` instead of using the existing `getTicker(id)` (defined at `src/main/database/tickers.ts:73`).

**Cost:** Each ticker-detail-page open pays a `SELECT * FROM tickers` + JS `Array.find`. Microseconds, but unnecessary.

**Fix:** Use `tickersDb.getTicker(tickerId)`.
**Fix safety:** 🟢 Safe.

### 7. `tickerSummaryService.refreshOne` re-reads ticker list inside loop
**[src/main/services/tickerSummaryService.ts:22-23]** — `refreshOne` reloads `listTickers()` and finds by id every iteration, even though `pump()` already has the active tickers list at line 111.

**Cost:** During a `refreshAllTickerSummaries` sweep on a 100-ticker watchlist: 101 calls to `SELECT * FROM tickers ORDER BY symbol`. Each call is sub-millisecond, but it's measurable as a small CPU spike during the bootstrap classify-then-summarize pass.

**Fix:** Pass the resolved `Ticker` (or just the id+symbol+companyName) into `refreshOne` from `pump`.
**Fix safety:** 🟢 Safe.

### 8. `TitleBar` and `TopNav` use `backdrop-blur` permanently
**[src/renderer/App.tsx:869, 1611, 2098, 2570]** — Four always-on backdrop-blur surfaces in the chrome. Each promotes the underlying content to its own compositor layer + runs a Gaussian blur shader on every paint of what's underneath. The TitleBar and TopNav have static content underneath them (no movement above the ticker strip), so the per-frame cost is one-shot at layer creation, not per-frame.

The article-list `ArticleDateRail` at 2098 (`sticky top-0 ... backdrop-blur-sm`) is the genuinely-expensive one — it runs over the *scrolling* article list, so every scroll frame re-blurs.

**Cost:** Hard to quantify without a Performance recording, but `backdrop-blur` over a scrolling surface at 60 fps is one of the more expensive per-frame GPU ops in Chromium. On Apple Silicon this is rarely measurable; on Intel Macs it can show up as scroll jank.

**Fix:** Two options. Either drop `backdrop-blur-sm` on the date rail and use a solid `bg-surface-0` (the rail is sticky over a dark feed list — the visual difference of the blur is already subtle); or make the blur conditional on a "high-quality UI" pref.
**Fix safety:** 🔴 Feature change — would alter the visible chrome of the date rail. User approval required. Mentioned for completeness only.

### 9. `App.tsx`-level `pulse-hidden` listener uses `document.addEventListener` for `visibilitychange` but `window.addEventListener` for blur/focus
**[src/renderer/App.tsx:374-380]** — Listeners are registered and removed correctly. No bug. Just noting that `sync()` does three reads (`document.hidden`, `document.hasFocus()`, `classList.toggle`) on every focus/blur event, and macOS fires both blur+focus on every Mission Control swipe. With `body.pulse-hidden` already being a binary state, the toggle is idempotent.

**Cost:** Negligible. Not a finding.

### 10. `companyValueChainService.scheduleAutoRegenerateOnBoot` re-imports its own module
**[src/main/index.ts:680-682, 688-690, 696, 702]** — Boot code uses `await import('./services/companyValueChainService')` style dynamic imports inside `whenReady`. Module is already evaluated; the dynamic import is a no-op other than a Promise allocation.

**Cost:** Microseconds per call, but it's a code-style oddity that costs Promise + microtask plumbing. Probably done deliberately to avoid circular imports during boot.

**Fix:** None unless the circular-import constraint can be broken. Skip.

## Skipped (intentional given Pulse's nature)

- **App.tsx's 6391-line size** — CLAUDE.md flags this as known. The component decomposition is already aggressive (~80 sub-functions); breaking apart the top-level App into separate files wouldn't change runtime behavior.
- **`.animate-ticker { will-change: transform }`** — Documented intentional one-time GPU memory payment in `styles.css:352-362`. Keep it.
- **`stocksScheduler` 60s active cadence** — Three-cadence design (active/off-hours/weekend) + visibility gating + market-hours fork makes this already as conservative as it can be without missing real price moves. Skip.
- **`feedPoller` 5-min cadence + per-poll AI budget of 20** — The architecture already dedups, defers, and idle-drains. Lowering cadence hurts urgency latency; raising the AI budget burns Ollama. Skip.
- **`ValueChainDiagram` re-renders on every pan-drag mousemove** (`setView` per mousemove at line 904) — User is actively dragging, expects smooth updates. Throttling to rAF would be safer but `setView` already triggers React batching; not measurably bad.
- **better-sqlite3 prepared-statement cache concerns** — better-sqlite3 caches prepared statements internally per connection, so the per-call `getDb().prepare(...)` pattern in DB modules is cheap. No need to module-level the statements.
- **`App.tsx` re-renders on every state slice** — App owns ~30 useState slices. Re-renders cascade, but downstream components (FeedCard, HeroCard, UrgencyBadge, FeedSource) are `React.memo`-wrapped and stable when their props don't change. The non-memoized ones (TopNav, TitleBar) render trivial trees.
- **Yahoo per-symbol caches** — Bounded by symbol count (~100), entries are small. Not a leak.
- **Reels infinite Ken Burns + scene animations** — Only render inside the Reels view; user is actively watching. Not a screen-share concern (reels are the user's intended sharable surface).
- **Sports score-flourish CSS animation** (`will-change: transform, opacity` at `styles.css:421`) — One-shot 2.5s animation on score change, auto-removed by hook. Not a sustained GPU layer.
- **`backdrop-blur` on Settings modal overlay** — Modal is open only while Settings is up. Ephemeral cost.
- **Boot orchestration is mostly parallelized** — `index.ts:717-746` already runs feeds/stocks/ollama/kokoro/piper/video/mediaTools in parallel under a single `Promise.all`. Splash watchdog at 180s caps the worst case. No serial chain to break up.
