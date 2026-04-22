# CLAUDE.md

Guidance for Claude Code working in this repo. For a product-level overview, read [README.md](README.md).

## Current state (2026-04-21)

All 12 stages from the original spec are long done, plus substantial additional work (sports, reels, hyperintelligence, smart lookup, stock quotes + rollups + profiles, media/TTS pipeline). Next planned work: **Stage 13 — packaging & polish** (electron-builder, `.dmg`/`.app`, app icon pass, animations, edge cases).

**Stage 13 readiness gaps** (worth fixing early):
- `electron-builder` is not in `devDependencies` despite being referenced in the `package` script
- No `build` config key in `package.json` and no `electron-builder.yml`
- `resources/icons/appIcon.png` exists but no `.icns`
- No signing/notarization config
- Python workers ([scripts/reels_kokoro_worker.py](scripts/reels_kokoro_worker.py), [scripts/reels_video_worker.py](scripts/reels_video_worker.py)) have no pinned requirements

## Architecture map

**Entry points:** [src/main/index.ts](src/main/index.ts) (Electron main — tray, windows, boot orchestration), [src/preload/index.ts](src/preload/index.ts) (typed `window.api` bridge), [src/renderer/](src/renderer/) (React UI). Build config: [electron.vite.config.ts](electron.vite.config.ts) — three renderer entry points (main, popover, splash).

**Database** ([src/main/database/](src/main/database/)): `better-sqlite3` at `app.getPath('userData')/pulse.db`. Schema is at **migration v20** ([src/main/database/migrations.ts](src/main/database/migrations.ts)) — check this file first before adding columns. Tables span articles, feeds, categories, tickers/ticker summaries, geo_interests, discovery_suggestions, preferences, reels, hyper_chats, favorite_teams, favorite_athletes.

**IPC** ([src/main/ipc/handlers.ts](src/main/ipc/handlers.ts)): all DB channels prefixed `db:*`. Service channels use their own prefixes (`reader:`, `reels:`, `sports:`, `hyper:`, `discovery:`, `stocks:`, `lookup:`, etc.). Typed API surface in [src/preload/index.ts](src/preload/index.ts).

**Renderer** ([src/renderer/App.tsx](src/renderer/App.tsx) is ~5000 lines and owns all top-level routing / feed list / reader). Sub-panels live in [src/renderer/components/](src/renderer/components/): Settings, Discovery, Reels, Hyperintelligence. State via hooks under [src/renderer/hooks/](src/renderer/hooks/).

**Services** ([src/main/services/](src/main/services/)) — grouped:
- *Ingest/scoring:* [feedPoller.ts](src/main/services/feedPoller.ts), [rssParser.ts](src/main/services/rssParser.ts), [urgencyScorer.ts](src/main/services/urgencyScorer.ts) + [src/main/data/keywordDictionaries.ts](src/main/data/keywordDictionaries.ts)
- *Reading:* [readerService.ts](src/main/services/readerService.ts), [adblockerService.ts](src/main/services/adblockerService.ts)
- *AI:* [ollamaService.ts](src/main/services/ollamaService.ts) (bounded concurrency 2, 60s health cache, `mistral:7b` default, override via `PULSE_OLLAMA_MODEL` / `PULSE_OLLAMA_URL`)
- *Finance:* [stooqService.ts](src/main/services/stooqService.ts), [yahooFinanceService.ts](src/main/services/yahooFinanceService.ts) (needs crumb+cookie handshake), [stocksScheduler.ts](src/main/services/stocksScheduler.ts) (3 cadences: active/off-hours/weekend), [tickerSummaryService.ts](src/main/services/tickerSummaryService.ts), [companyProfileService.ts](src/main/services/companyProfileService.ts), [discoveryService.ts](src/main/services/discoveryService.ts)
- *News extras:* [smartLookupService.ts](src/main/services/smartLookupService.ts) (Wikipedia → Ollama fallback, 30d cache), [feedFinderService.ts](src/main/services/feedFinderService.ts) (powers Hyperintelligence), [notificationManager.ts](src/main/services/notificationManager.ts)
- *Sports:* [sportsService.ts](src/main/services/sportsService.ts) (ESPN site API, 9 leagues), [sportsAlertsService.ts](src/main/services/sportsAlertsService.ts)
- *Reels pipeline* (Python + native tooling): [reelService.ts](src/main/services/reelService.ts), [videoGenService.ts](src/main/services/videoGenService.ts), [videoClipService.ts](src/main/services/videoClipService.ts), [kokoroService.ts](src/main/services/kokoroService.ts), [piperService.ts](src/main/services/piperService.ts), [mediaToolsService.ts](src/main/services/mediaToolsService.ts). Reels are served to the renderer via a custom `reel://` Electron protocol ([src/main/index.ts](src/main/index.ts#L429)).
- *Housekeeping:* [maintenanceService.ts](src/main/services/maintenanceService.ts) (daily purge — 30d retention unless bookmarked + VACUUM when ≥200 rows deleted)

**Static data:** [src/data/defaultFeeds.json](src/data/defaultFeeds.json) (44 feeds, seeded via migration), [src/data/tickerReference.json](src/data/tickerReference.json) (~65 tickers + aliases), [src/data/locationReference.json](src/data/locationReference.json) (~50 places + keywords), [docs/default-feeds.md](docs/default-feeds.md) (source-of-truth for the feed list).

## Commands

```
npm install            # installs + runs electron-rebuild for better-sqlite3 (postinstall)
npm run dev            # electron-vite dev (hot reload)
npm run build          # production build into out/
npm run package        # build + electron-builder — see Stage 13 gaps above
npm run rebuild        # electron-rebuild, run after bumping Electron major
npm run lint           # tsc --noEmit
npm test               # stub
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

## Conventions worth preserving

- **No direct `ipcRenderer` in React.** Everything goes through the typed preload bridge.
- **DB ops stay in the main process.** Expose via IPC, never open the DB from the renderer.
- **Privacy.** All data is local. No telemetry, no accounts, no cloud sync. Don't regress this.
- **Tailwind only.** No CSS-in-JS, no component libraries. Single global stylesheet for reader content + a few scoped rules.
