# Pulse Bug Backlog

Running list of known issues and deferred fixes. Append during dev sessions; move items to Resolved or delete the line as they're addressed. Goes through end-of-session triage.

## How to use

- **🔴 Critical** — already broken, data loss risk, privacy regression. Fix next session.
- **🟡 Important** — functional but degraded; user-visible. Schedule deliberately.
- **🟢 Nice-to-have** — polish, log noise, perf at scale, edge cases.
- **🛠 Deferred** — known scope cut, conscious decision to skip. Re-evaluate only if it resurfaces.

Entry format:

```
- (YYYY-MM-DD) [scope] one-line description — optional file:line or commit
```

## Open

### 🔴 Critical

- (2026-09-07) [stocks] **The Stooq quote fallback is permanently dead — Stooq deployed a JS proof-of-work bot wall.** `https://stooq.com/q/l/?s=<sym>.us&f=sd2t2ohlcv&h&e=csv` ([stooqService.ts:6](src/main/services/stooqService.ts#L6)) returns HTTP 404 to any client that hasn't cleared the challenge. Root cause confirmed by fetching a normal Stooq page, which returns a 796-byte `noindex` stub containing a hashcash script: SHA-256 over `c+n` until the digest has 4 leading zeros, then `POST /__verify` to obtain a session cookie, then reload. A browser passes this transparently (which is why the site looks fine when opened by hand); Pulse's plain `fetch()` executes no JS and so can never pass it. Not transient, not a UA issue, not rate limiting — verified across `stooq.com`/`stooq.pl`, both UAs, and with `&h`/`&f=` dropped.
  Failure is *silent by design*: `fetchChunk` correctly sees `!res.ok`, throws, and returns `null`, and the catch is deliberately quiet to avoid offline log spam ([stooqService.ts:95-101](src/main/services/stooqService.ts#L95-L101)). Consequence: **Yahoo is an unguarded single point of failure for every quote in the app**, and has been since Stooq shipped this.
  Needs a product decision, not a silent fix. Options: (a) drop Stooq and pick a different second source, (b) keep Yahoo-only but surface the degraded state instead of showing blanks. Solving the proof-of-work in Node is technically trivial but would be deliberately circumventing an explicit anti-bot control — not something to do without an explicit call.

### 🟡 Important

- (2026-09-07) [stocks] Yahoo rate-limits by IP harder than the poll cadence assumes. Sustained probing earned HTTP 429 on `/v8/finance/chart` across *all* symbols and intervals, with a cooldown that outlived the traffic. Pulse's steady state is ~503 requests/minute (`stocksScheduler.ts` ACTIVE_MS=60s × full watchlist), which is close enough to the limit that any added fan-out (a backfill sweep, a chain regen touching passive tickers) risks tipping the whole quote path into 429. `fetchQuoteOne` returns `emptyQuote` on `!res.ok`, so a throttled window looks like blank prices rather than an error. Worth a shared token bucket across the Yahoo callers, and a visible diagnostic when 429s spike — especially now that the Stooq fallback is gone.

### 🟢 Nice-to-have

- (2026-04-28) [renderer] 25 of 32 `void window.api.*` fire-and-forget calls in App.tsx still lack `.catch` — only the 7 user-visible loading-path ones got patched in commit `0bcbeb6`. The rest are markRead, rendererReady, notification subs, etc. where silent failure is by design. Add `.catch(console.warn)` later only if log noise bothers.
- (2026-04-28) [research] S2's `isInfluential` + intent classifier is ~80% accurate per their docs — occasional non-foundational ref slips into "Built on" or true foundational ref is excluded. Phase 2B Claude precision pass (~$0.006/paper Haiku, reads intro+related-works) would tighten this. Defer until the noise surfaces in practice.
- (2026-04-28) [earnings] Scheduler cycle time at 465 tickers × 30 per tick × 30 min = ~7.5 h to fully cycle. 1 h Yahoo TTL is the backstop, so individual freshness is bounded. If a specific ticker feels stale, bump `SYMBOLS_PER_TICK` in [src/main/services/earningsScheduler.ts](src/main/services/earningsScheduler.ts).
- (2026-04-28) [renderer] Stuck `working` state on the ValueChain Regenerate button — observed once on CLS during regen-all recovery; full Cmd+Q reset cleared it. Watch for repro on a different ticker; if it happens again, investigate the local `working` state lifecycle in `UnifiedValueChainCard`.
- (2026-05-07) [research/pdf] pdfjs warning during paper chain enrichment: `Ensure that the standardFontDataUrl API parameter is provided.` Fires on every `getDocument()` call in [src/main/services/paperPdfExtractor.ts](src/main/services/paperPdfExtractor.ts). pdfjs falls back to system fonts when embedded fonts can't be loaded — slightly garbles glyph extraction on PDFs with non-standard embedded fonts (older scanned conference PDFs), no impact on arXiv papers. One-line fix: pass `standardFontDataUrl` pointing at `pdfjs-dist/standard_fonts/` to `getDocument`. Defer until a paper's enrichment surfaces real garbled-glyph output.

### 🛠 Deferred (decided not to do)

- Tier 4 review-team refactors: `ollamaService.ts` 2.2K-line split, IPC handler-registration consolidation, `aiClient.ts` incomplete abstraction, `generateCompanyChain` 448-line function split, `await import()` → top-level. User decision: "no work without measurable impact." Re-evaluate only if one surfaces during actual feature work in that file.

## Resolved

- (2026-09-07) [data] **Correction to the record: article retention was never broken.** The 2026-04-27 review round and a later scan both concluded "retention is not running — 27,362 rows past due." That was a misreading of a snapshot taken inside `maintenanceService`'s 10-minute `INITIAL_DELAY_MS`, before the first purge of the session fires. Retention works exactly as written. The real problem was the opposite: it works, and it was silently destroying the only copy of the news corpus. Observed live mid-session — articles 31,085 → 4,125, `article_ticker_matches` 43,144 → 5,583, June 2026 17,223 → 11, and the usable event-study sample 22,641 pairs → 3,365. Unlike prices, news cannot be backfilled: RSS serves only a recent window. Fixed by migration v54, which splits the corpus — `articles` keeps its FTS, cascade and 30-day purge; `articles_archive` + `article_ticker_matches_archive` have no FK, no cascade, and are never purged. Maintained by triggers (same pattern as `articles_fts`) so no ingest path can bypass them. `maintenanceService` now logs every run including no-ops, since this was invisible precisely because it only logged on failure.
- (2026-09-07) [stocks] `purgeOlderThan` deleted every article that arrived without a pubDate, however fresh. `COALESCE(publishedAt, 0) < cutoff` is always true when `publishedAt` is NULL. Now falls back to `scoredAt` (written within seconds of insert). 51 live rows were affected at the time of the fix.

- (2026-05-06) [boot/network] Multi-second app delay after coming online from a long offline period. Root cause: every scheduler tick on the resume path fanned out into doomed fetches (44 RSS at 15s timeout, ~300-symbol Yahoo + Stooq waves at 10s, ESPN at 12s) when the OS already knew the network was gone — saturated the Node TCP layer and queued behind the IPC nativeTheme 'updated' event in the v8 event loop, which is why a system theme switch with zero network deps felt 10-15s slow. Two-part fix: (a) new [networkStatus.ts](src/main/services/networkStatus.ts) wraps Electron's `net.isOnline()` with a 5s memo and (b) feedPoller pollAllFeeds, stocksScheduler tick, sportsReelScheduler tick, sportsAlertsService tick all early-return when `isOnline()` is false — they retry naturally on the next interval once the OS sees the network. Also tightened fetch timeouts to fail-fast values for the rare case where `net.isOnline()` says yes but connectivity is degraded: rss 15→8s, yahoo 10→6s, stooq 10→5s, sports 12→6s (4s for conferences), wikipediaEvents 10→5s, ipoBrief 10→5s. Cuts cascade-recovery from ~3 min worst-case to ~1 min, and zero-fetch the obviously-offline case.
- (2026-05-06) [logging] Yahoo/Stooq/ESPN fetch-fail spam during offline → online transitions. Largely resolved by the network-gate above (fetches don't run when OS reports offline, so they don't fail-and-log). Also dropped the per-chunk `[stooq] chunk fetch failed` line since stocksScheduler already emits a per-cycle summary via the Yahoo→Stooq fallback log. Yahoo's per-symbol getYahooQuotes path was already silent (returns null, no warn). Remaining ESPN warns are only fired on per-cycle failures during online periods, which is acceptable signal.
- (2026-05-03) [renderer] Massive jitter when opening Settings in the packaged build. `Settings.tsx:90` overlay used `backdrop-blur-sm` over the entire viewport — Chromium re-composed the underlying frame through the blur filter every paint, hidden in dev (DevTools shrinks the blurred area) but obvious full-window. Fixed by swapping for `bg-black/[0.88]` solid overlay (same pattern PeerCompareModal already uses). Also added the gotcha to CLAUDE.md so this doesn't regress.
- (2026-05-04) [renderer] Marquee + earnings-pulse halos jittered visibly when Pulse was screen-shared on macOS, requiring a presenter-mode toggle to pause them. Removed the toggle entirely; replaced the CSS keyframe marquee with a JS rAF-driven scrollLeft update (`useTickerAutoScroll`) that rides through the regular paint pipeline and captures cleanly. Earnings-pulse halos became static (state intensity preserved via box-shadow tier instead of opacity sweep). Also dropped the title-bar accent-dot `animate-ping` and ticker-mode dot ping. App is screen-share-seamless by default — no toggle, no jitter. Gotcha added to CLAUDE.md.
