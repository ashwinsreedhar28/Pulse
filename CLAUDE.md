# CLAUDE.md

Guidance for Claude Code working in this repo. For a product-level overview, read [README.md](README.md).

## Current state (2026-09-07)

All 12 original stages plus Stage 13 packaging are done. Since then: sports,
reels, hyperintelligence, smart lookup, the stock value-chain graph, the
research/paper subsystem, SEC + FRED ingestion, and the Claude API provider.

Recent work (this branch): durable article archive, persisted market data, the
3D Market Graph, the research semantic layer, and Phase A1 of the trading
research. See `trading/PHASE_A1_RESULT.md` for where the alpha work stands.

**Known open issues** live in [BUGS.md](BUGS.md) — read it before starting. The
one that bites hardest right now: the Stooq quote fallback is permanently dead
(JS proof-of-work bot wall), so Yahoo is an unguarded single point of failure
for every quote.

**Still missing:** signing/notarization config (deliberate — personal build),
and the reels Python workers ([scripts/reels_kokoro_worker.py](scripts/reels_kokoro_worker.py),
[scripts/reels_video_worker.py](scripts/reels_video_worker.py)) have no pinned
requirements. `trading/requirements.txt` does.

## Architecture map

**Entry points:** [src/main/index.ts](src/main/index.ts) (Electron main — tray, windows, boot orchestration), [src/preload/index.ts](src/preload/index.ts) (typed `window.api` bridge), [src/renderer/](src/renderer/) (React UI). Build config: [electron.vite.config.ts](electron.vite.config.ts) — three renderer entry points (main, popover, splash).

**Database** ([src/main/database/](src/main/database/)): `better-sqlite3` at `app.getPath('userData')/pulse.db`. Schema is at **migration v57** ([src/main/database/migrations.ts](src/main/database/migrations.ts)) — check this file first before adding columns. **62 tables**, grouped roughly as:

- *News:* articles, articles_archive, article_ticker_matches(_archive), articles_fts, feeds, categories
- *Finance:* tickers, market_bars, ticker_fundamentals, ticker_financials, ticker_estimates, ticker_summaries, earnings_releases, company_profiles
- *Graph:* company_value_chains, graph_candidates, graph_edge_overrides, graph_node_overrides, chain_edge_mentions, sectors, ticker_sectors
- *SEC/macro:* sec_filings, sec_cik_map, sec_former_names, fred_observations, fred_series_meta
- *Research:* research_topics/briefs/bookmarks, paper_value_chains(_edges), paper_pdf_extracts, paper_chain_enrichments, paper_embeddings, paper_ticker_links
- *Other:* preferences, reels, hyperintelligence_chats, favorite_teams, notification_log, morning_briefs
- *Trading (Python-managed, `trading_*` prefix):* created by `trading/lib/db.py`, never by the TS migrations

**Two archive tables are deliberately never purged** — `articles_archive` and
`article_ticker_matches_archive` (v54). They have no FK to `articles` and no
cascade, because the 30-day retention purge would otherwise destroy the only
copy of the news corpus. RSS cannot be backfilled. Do not "tidy" this up.

**IPC** ([src/main/ipc/handlers.ts](src/main/ipc/handlers.ts)): all DB channels prefixed `db:*`. Service channels use their own prefixes (`reader:`, `reels:`, `sports:`, `hyper:`, `discovery:`, `stocks:`, `lookup:`, etc.). Typed API surface in [src/preload/index.ts](src/preload/index.ts).

**Renderer** ([src/renderer/App.tsx](src/renderer/App.tsx) is **~6500 lines** and owns top-level routing, the feed list, the reader, and — awkwardly — the entire Stocks and Sports pages inline. Extracting `SportsPage` (~1900 lines) and `StocksPage` (~1500) is the obvious win if that file is ever touched seriously. 31 components live in [src/renderer/components/](src/renderer/components/). State via hooks under [src/renderer/hooks/](src/renderer/hooks/).

**Services** ([src/main/services/](src/main/services/)) — grouped:
- *Ingest/scoring:* [feedPoller.ts](src/main/services/feedPoller.ts), [rssParser.ts](src/main/services/rssParser.ts), [urgencyScorer.ts](src/main/services/urgencyScorer.ts) + [src/main/data/keywordDictionaries.ts](src/main/data/keywordDictionaries.ts)
- *Reading:* [readerService.ts](src/main/services/readerService.ts), [adblockerService.ts](src/main/services/adblockerService.ts)
- *AI:* [aiClient.ts](src/main/services/aiClient.ts) routes between providers by the `aiProvider` preference — **always go through it for new AI calls**, not directly to a provider. [claudeService.ts](src/main/services/claudeService.ts) (Anthropic; `chainGen` = Sonnet, `classifier` = Haiku), [ollamaService.ts](src/main/services/ollamaService.ts) (local; bounded concurrency 2, 60s health cache, `mistral:7b` default, override via `PULSE_OLLAMA_MODEL` / `PULSE_OLLAMA_URL`). Calling a provider directly is how `tickerSummaryService` ended up writing 150 rows and zero summaries.
- *Finance:* [stooqService.ts](src/main/services/stooqService.ts), [yahooFinanceService.ts](src/main/services/yahooFinanceService.ts) (needs crumb+cookie handshake), [stocksScheduler.ts](src/main/services/stocksScheduler.ts) (3 cadences: active/off-hours/weekend), [tickerSummaryService.ts](src/main/services/tickerSummaryService.ts), [companyProfileService.ts](src/main/services/companyProfileService.ts), [discoveryService.ts](src/main/services/discoveryService.ts)
- *News extras:* [smartLookupService.ts](src/main/services/smartLookupService.ts) (Wikipedia → Ollama fallback, 30d cache), [feedFinderService.ts](src/main/services/feedFinderService.ts) (powers Hyperintelligence), [notificationManager.ts](src/main/services/notificationManager.ts)
- *Sports:* [sportsService.ts](src/main/services/sportsService.ts) (ESPN site API, 9 leagues), [sportsAlertsService.ts](src/main/services/sportsAlertsService.ts)
- *Reels pipeline* (Python + native tooling): [reelService.ts](src/main/services/reelService.ts), [videoGenService.ts](src/main/services/videoGenService.ts), [videoClipService.ts](src/main/services/videoClipService.ts), [kokoroService.ts](src/main/services/kokoroService.ts), [piperService.ts](src/main/services/piperService.ts), [mediaToolsService.ts](src/main/services/mediaToolsService.ts). Reels are served to the renderer via a custom `reel://` Electron protocol ([src/main/index.ts](src/main/index.ts#L429)).
- *Housekeeping:* [maintenanceService.ts](src/main/services/maintenanceService.ts) (daily purge — 30d retention unless bookmarked + VACUUM when ≥200 rows deleted)

**Static data:** [src/data/defaultFeeds.json](src/data/defaultFeeds.json) (60 feeds, seeded via migration), [src/data/tickerReference.json](src/data/tickerReference.json) (75 tickers + aliases), [src/data/locationReference.json](src/data/locationReference.json) (~50 places + keywords), [docs/default-feeds.md](docs/default-feeds.md) (source-of-truth for the feed list).

## Commands

```
npm install            # installs + runs electron-rebuild for better-sqlite3 (postinstall)
npm run dev            # electron-vite dev (hot reload)
npm run build          # production build into out/
npm run package        # build + electron-builder — see Stage 13 gaps above
npm run rebuild        # electron-rebuild, run after bumping Electron major
npm run lint           # tsc --noEmit
npm test               # vitest run — 81 tests
npm run test:watch     # vitest watch
```

Ollama reachable? `curl -s http://localhost:11434/api/tags` — the app works without it but AI features (urgency promotion, discovery, smart lookup fallback, ticker summaries, hyperintelligence, reels scripts) degrade gracefully.

## Critical behavioral rules

1. **Announce stages.** When starting a stage, say which. When finishing one, confirm it and update the "Current state" section above so the next session has fresh context.
2. **Pause on blockers.** Ambiguous requirements or destructive decisions → ask, don't guess.
3. **Verify builds.** After structural changes, `npm run lint` at minimum; `npm run dev` for anything user-facing.
4. **Keep this file trimmed.** Don't grow a full changelog here — git log is authoritative. Only keep info a fresh session can't derive from reading code.

## Gotchas

- **`jsdom` pinned to `^24`.** v25+ pulls ESM-only `@exodus/bytes` via `html-encoding-sniffer@6`, which Electron's CJS `require()` can't load. Don't bump without testing reader mode end-to-end.
- **Dock visible at all times.** `dock.hide()` and `setActivationPolicy('accessory')` both strand the tray on macOS Sequoia after a window reopen cycle. Left intentional.
- **Splash orchestration.** [src/main/index.ts](src/main/index.ts#L455) holds the splash until all boot services settle (180s watchdog). Don't move heavy init outside this gate — it's what prevents post-reveal jitter.
- **Window-hidden animation pause.** [src/renderer/styles.css](src/renderer/styles.css) has `body.pulse-hidden *` rule + [src/renderer/App.tsx](src/renderer/App.tsx#L213) listens on `visibilitychange` + `blur`/`focus` (not just `visibilitychange` — macOS keeps `document.hidden = false` when another app merely covers the window). Keep both or GPU helper CPU climbs when Pulse is occluded.
- **`.animate-ticker` has `will-change: transform`** — the marquee runs forever, so paying one-time GPU memory avoids repainting neighbors every frame. Don't remove.
- **Notifications armed flag.** [src/main/services/feedPoller.ts](src/main/services/feedPoller.ts) suppresses notifications on the first `pollAllFeeds` so cold-start catch-up doesn't spam the user. Async Ollama promotions snapshot `notifyOnPromote` at enqueue time so the suppression holds.
- **Yahoo crumb+cookie.** [yahooFinanceService.ts](src/main/services/yahooFinanceService.ts) does a one-time `fc.yahoo.com` handshake + `getcrumb`. Expect 401s to force a re-handshake; don't "simplify" this.
- **External links** are routed through `shell.openExternal` via `setWindowOpenHandler`. Webview has `allowpopups` disabled. Both are load-bearing for the no-tracker-noise guarantee.
- **Reel protocol.** Reel audio/video is served over a custom `reel://` scheme (registered as privileged). Paths are validated against `..` and `/` before joining with the reels dir.
- **No `backdrop-blur` on viewport-filling overlays.** Chromium re-composes the entire underlying frame through the blur filter on every paint; in packaged builds running full-window this surfaces as visible jitter. Both Settings and PeerCompareModal use `bg-black/[0.88]` instead. Small surfaces (header bars, tooltips, popover) are fine.
- **No perpetual CSS keyframe animations.** The marquee + earnings-pulse halos used to be CSS keyframe animations and showed visible jitter when Pulse was screen-shared on macOS — capture sampling didn't sync with the GPU compositor's refresh. Replaced with rAF-driven `scrollLeft` updates (`useTickerAutoScroll` in App.tsx) for the marquee, and static halos for earnings state. Don't add new perpetual `animation: ... infinite` rules without the same screen-share check.

## Conventions worth preserving

- **No direct `ipcRenderer` in React.** Everything goes through the typed preload bridge.
- **DB ops stay in the main process.** Expose via IPC, never open the DB from the renderer.
- **Privacy.** No telemetry, no accounts, no cloud sync, and all *storage* is
  local. This is NOT the same as "all data is local", and the README used to
  overclaim it: with `aiProvider = 'claude'` (the current setting) article and
  paper text is sent to `api.anthropic.com`, and the app contacts ~30 outbound
  hosts (Yahoo, SEC, FRED, Semantic Scholar, OpenAlex, arXiv, ESPN, Nasdaq,
  Wikipedia...). Keep it accurate rather than flattering. What must not regress:
  no analytics, no account system, no syncing user data anywhere.
- **Tailwind only.** No CSS-in-JS, no component libraries. Single global stylesheet for reader content + a few scoped rules.

## Gotchas added 2026-09-07

- **Never point a foreign key at `articles(id)`.** That table is purged at 30
  days. Anything that needs to outlive the purge — event-study results, audit
  rows, longitudinal analysis — must reference `articles_archive(id)` instead.
  `trading/lib/db.py` had this wrong and would have silently deleted every
  result older than a month.
- **`market_bars` 1-minute rows are irreplaceable.** Yahoo serves roughly 30
  days of intraday history, so a day not captured live is gone permanently.
  Daily bars can be backfilled at any time; 1m cannot. This asymmetry is why
  `fetchQuoteOne` persists bars inline rather than leaving it to a sweep.
- **Yahoo rate-limits by IP harder than the poll cadence suggests.** Sustained
  requests earn a 429 with a cooldown that outlives the traffic. Pulse's steady
  state (~500 req/min) is close enough to the ceiling that any added fan-out can
  tip the whole quote path into failure — and `fetchQuoteOne` returns
  `emptyQuote` on `!res.ok`, so it looks like blank prices, not an error.
  `marketBackfillService` trickles one symbol per 30s, market-closed only, for
  this reason.
- **The market graph must not re-run layout on a quote tick.** `MarketGraph` is
  canvas, not SVG, and hover lives in a ref specifically so pointer movement
  causes no React render. Layout is 3D and computed once per topology change;
  rotation is pure projection. An earlier SVG version re-rendered 880 edge paths
  on every hover, which is what the "jitter" was.
- **`tickers.sector` is Pulse's own taxonomy, not GICS.** Values include
  "Semiconductors", "semi", "Technology Hardware", "energy" — mixed case,
  non-standard. Anything mapping sectors to external identifiers (benchmark
  ETFs, GICS codes) must key on these actual strings, case-insensitively. Doing
  otherwise produced a completely spurious "PASS" in the A1 event study.
