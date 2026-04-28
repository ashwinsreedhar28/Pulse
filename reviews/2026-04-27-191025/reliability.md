# Reliability Review · 2026-04-27

## TL;DR
Most external services degrade well: Yahoo's crumb-401 path is solid, ESPN/SEC/FRED/Semantic Scholar wrap fetches in timeout + try/catch with cached or empty fallbacks, and every scheduler I traced wraps per-symbol work in try/catch so a single failure doesn't abort the loop. The two real reliability gaps are (1) no React error boundary anywhere in the renderer, so a single component throw blanks the app, and (2) `initDatabase()` runs unguarded inside `app.whenReady()` *before* the 180s splash watchdog is armed — a corrupt DB / failed migration leaves the user staring at a transparent splash forever with no error feedback. A handful of smaller issues round out the report.

## Critical

### 1. Renderer has zero error boundaries — any component throw blanks the entire app
- **[src/renderer/App.tsx, src/renderer/components/*]** — no `ErrorBoundary`, no class component with `componentDidCatch`/`getDerivedStateFromError` exists in the renderer tree (verified by `grep -rn "ErrorBoundary\|componentDidCatch\|getDerivedStateFromError" src/renderer/` → 0 hits, and `grep -l "class.*extends.*Component" src/renderer/ -r` → 0 hits).
- **Failure scenario:** Yahoo returns a malformed `optionChain.result[0]` shape during market hours (this has happened in 2024-2026 — see comment at `yahooFinanceService.ts:1196`). The renderer's options-snapshot consumer destructures a field that's now undefined and throws inside a render. Or: a `BriefSection` arrives from an old cache row whose `bullets[].citations` is `null` instead of an array, and a `.map()` throws. Or any of the dozens of `quote.regularMarketPrice ?? null` paths that don't quite cover all shapes.
- **What happens today:** React 18 unmounts the whole tree, the user sees a blank white window with no error and no recovery short of restarting the app. Console logs the crash but the user doesn't see those.
- **What should happen:** A top-level `<ErrorBoundary>` in `App.tsx` (and ideally per-panel boundaries around Settings, Discovery, Reels, Hyperintelligence) catches the throw, shows a "Something went wrong in [section]" stub with a Reload button, and logs to console. Other panels keep rendering.
- **Fix:** Add a single `ErrorBoundary` class component (~30 lines) wrapping `<App>`'s top-level switch in `App.tsx` (and ideally one per major panel). The fallback UI is a centered message + Reload button. Pure defensive — never visible on the success path.
- **Fix safety:** 🟢 Safe — the boundary only renders its fallback on a render error; otherwise it's a passthrough.

### 2. `initDatabase()` failure inside `app.whenReady()` hangs the splash forever with no error
- **[src/main/index.ts:525-528, 715]** — `initDatabase()` is the first non-window call inside the `whenReady` callback. The 180s splash watchdog (line 715) is armed *after* DB init, after several other synchronous calls that can also throw (`bootstrapSectorCatalog`, `backfillPassiveTickersForAbsorbedNodes`, `repopulateAbsorbedSectorIds`).
- **Failure scenario:** A pending migration in `migrations.ts` references a column that no longer exists (or a CHECK constraint a prior version's data violates) — the migration's `db.transaction` wrapper rolls back and re-throws. Or: the user filled their disk and the WAL write fails with `SQLITE_FULL`. Or: a hard crash during a previous run left the DB in a state better-sqlite3 considers unrecoverable. In each case `initDatabase()` throws synchronously inside `app.whenReady().then(...)`.
- **What happens today:** The async callback rejects, no `.catch` chained on the `whenReady().then(...)` (verified at `src/main/index.ts:525`). Splash window stays up showing pending dots forever. Watchdog at line 715 was never set, so there's no 180s reveal. No `process.on('uncaughtException')` or `unhandledRejection` handler is registered (verified by grep — zero hits in `src/`). User has to force-quit and has no on-screen indication of what's wrong.
- **What should happen:** Wrap the boot init in a try/catch that, on failure, shows a real Electron `dialog.showErrorBox('Pulse failed to start', err.message)` and calls `app.quit()`. Keep the existing happy path identical.
- **Fix:** Wrap `initDatabase()` (and the bootstrap calls that follow) in try/catch around `src/main/index.ts:528-557`; on catch, `dialog.showErrorBox('Pulse: database initialization failed', err.message)` and `app.quit()`. No user-visible behavior changes when the DB is healthy.
- **Fix safety:** 🟢 Safe — the new code path only runs when init throws, which today produces no user feedback at all.

## Important

### 3. `regenerateAllChains` body throws between the running flag and the per-symbol try/catch leak the flag forever
- **[src/main/services/companyValueChainService.ts:2877-2997]** — `regenRunning = true` at line 2879, but the body up through line 2957 (DB lookups via `listCompanyValueChainSymbols()`, `listTickers()`, `getCompanyValueChain(sym)` inside the skip-fresh filter, `getTickerBySymbol`) is unguarded. Only the per-symbol generation inside the for loop has try/catch (line 2974). `regenRunning` is reset only on the happy path at line 2994.
- **Failure scenario:** A regen kicks off; meanwhile the user triggers app shutdown. `app.on('will-quit')` calls `closeDatabase()` (`src/main/index.ts:783`). The next sync DB read inside the `regenerateAllChains` setup throws `Database not initialized`. The promise rejects unhandled (called via `void regenerateAllChains()` from `handlers.ts:623`). `regenRunning` stays `true`. App restarts. New regen call short-circuits on `if (regenRunning) return regenProgress` and the UI's Regenerate-All button shows a stale "running" state forever (since `getRegenerateAllProgress()` is read for the UI).
- **What happens today:** The flag is process-local, so a restart clears it (becomes a non-issue *across* restarts). Within one session the user only sees the bad state if they happen to click again after a shutdown-race throw, which is rare. Still a real foot-gun.
- **What should happen:** Wrap the body in `try { ... } finally { regenRunning = false }`.
- **Fix:** Move the existing `regenRunning = false` (line 2994) into a `finally` block around the body of `regenerateAllChains`.
- **Fix safety:** 🟡 Bug — corrects unambiguously-wrong behavior (flag leak on early throw). Happy path is identical.

### 4. `researchScheduler.tick()` and `discoveryService.runDailyDrip` lack a top-level try/catch
- **[src/main/services/researchScheduler.ts:53-66, src/main/services/discoveryService.ts:41-101]** — `tick()` calls `listResearchTopics()` (sync DB read) before any try/catch. If that throws, the rejection from `void tick()` (line 72, 75) is unhandled. Same shape in `runDailyDrip`'s `recentArticles()` + `listTickers()` calls before any try/catch — invoked via `setTimeout(() => void runDailyDrip(), 30_000)` and `setInterval(() => void runDailyDrip(), DAILY_MS)` (`discoveryService.ts:239, 245`).
- **Failure scenario:** App is shutting down — `closeDatabase()` runs from `will-quit`. Either timer's callback fires in the small window between the tick scheduling and the timer being cleared. `getDb()` throws. `void tick()` or `void runDailyDrip()` produces an unhandled promise rejection. With no `process.on('unhandledRejection')` handler, Node 20 logs it and (on `--unhandled-rejections=throw`, the future default) would terminate the process. Even today it's noise in dev logs.
- **What happens today:** Most schedulers (`secFilingsService.ts:152-159`, `analystEstimatesService.ts:158-163`, `tenKConcentrationService.ts:600-607`, `graphCandidatesService.ts:438-440`, `graphNotesRefreshService.ts:284-296`, `fredService.ts:347, 352`) wrap their tick body in `.catch` or try/catch — these two are the outliers.
- **What should happen:** Either wrap `tick()` body in try/catch (matches the sportsAlerts tick at `sportsAlertsService.ts:84-184` which already does this), or `.catch` the `void tick()` calls.
- **Fix:** Wrap the body of `researchScheduler.ts` `tick()` and `discoveryService.ts` `runDailyDrip` / `runWeeklyCurated` in try/catch with `console.warn`. Match the pattern at `sportsAlertsService.ts:84-184`.
- **Fix safety:** 🟢 Safe — the new catch arm only fires today on an error path that produces nothing useful (an unhandled rejection log).

### 5. Renderer has 32 `void window.api.X()` calls with no `.catch()` — IPC failures are silently swallowed
- **[src/renderer/App.tsx]** — `grep -nc "void window.api"` → 32 hits; `grep -B 0 -A 1 "void window.api" | grep -c catch` → 0. Examples: `App.tsx:122` (articles.getById), `:140` (articles.markRead), `:301` (articles.markRead → triggers state change), `:1011` (tickers.list), `:3637` (stocks.getFundamentals).
- **Failure scenario:** Yahoo is down. `window.api.stocks.getFundamentals(symbol)` (called at App.tsx:3637) eventually rejects after the IPC handler's chain throws. The `.then(setFundamentals)` never fires; the user sees the loading skeleton indefinitely with no error message and no retry. There's no toast, no badge — the panel just stays empty. Same shape for any of the 32 paths if their handler ever throws (DB error, Yahoo crumb auth permanently broken, Anthropic returning an unexpected shape, etc.).
- **What happens today:** Renderer console gets the rejection, user sees nothing.
- **What should happen:** Either chain `.catch(err => console.warn(...))` to suppress the unhandled-rejection noise (preserves current UX, just silences the noise) — or, where the user benefits, set the state to a known "error" sentinel so the UI can show a retry affordance. The latter would change UX, so for the safe variant: just silence.
- **Fix:** Add `.catch((err) => console.warn('[ui] X failed:', err))` to every `void window.api.X().then(...)` chain in App.tsx. Bulk find-and-replace; no behavioral change in the success path.
- **Fix safety:** 🟢 Safe — only changes what happens when an IPC rejection occurs (noise-reduction; UI behavior unchanged).

### 6. Stocks scheduler `tick()` Yahoo fallback path doesn't wrap Stooq in try/catch
- **[src/main/services/stocksScheduler.ts:80-114]** — When Yahoo returns mostly-null (`yahooOk = false`), the code calls `getStooqQuotes(symbols)` without a `.catch`. That call is awaited in line 84 with no try/catch around it (the outer try/catch on line 63 does cover it though). Also the overlay `getExtendedQuotes` has `.catch(() => [])` (line 86), but Stooq doesn't.
- **Failure scenario:** Yahoo returns mostly-null because its v8 chart endpoint shifted shape. Code falls through to Stooq. Stooq's CSV parser throws because their format changed (their quirky tab-separated header lines have moved before — `stooqService.ts` parses them by hand). The outer try/catch on line 63 catches the throw, logs `[stocks] tick failed:`, and returns. The stocks marquee silently goes empty for that tick.
- **What happens today:** `console.warn('[stocks] tick failed: …')`. Marquee is empty for one cycle (60s). Next tick retries from scratch.
- **What should happen:** This is mostly OK — the outer catch at line 131-133 does cover it, and recovery happens on the next tick. The cosmetic issue is the marquee briefly empties. Acceptable.
- **Fix:** Tighten by giving Stooq its own `.catch(() => [] as StockQuote[])` mirroring Yahoo at line 76, so a Stooq parse failure preserves the prior `lastQuotes` instead of resetting to empty.
- **Fix safety:** 🟡 Bug — corrects "marquee briefly blanks on Stooq parse failure" → "marquee keeps showing the prior tick's quotes." Visible-but-narrow improvement; matches the comment at line 80 ("treat it as a partial outage").

### 7. Notification API not checked for permission, only `isSupported()`
- **[src/main/services/notificationService.ts:170-218]** — `Notification.isSupported()` is checked (line 171), but on macOS the user can revoke notification permission for Pulse in System Settings. Electron's `Notification.show()` just silently no-ops in that case.
- **Failure scenario:** User opens System Settings → Notifications → Pulse → toggles off. Pulse continues firing `Notification` objects internally, the `notification_log` row gets written (line 222), the daily cap counter increments. From the user's perspective, breaking-news alerts went silent. From Pulse's perspective, it thinks it delivered them.
- **What happens today:** Silent. The `notification_log` insert at line 222 still runs, so the dedup + cap accounting is wrong relative to what the user actually saw.
- **What should happen:** `Notification.isSupported()` doesn't capture macOS permission state — there's no clean Electron API for this. Acceptable to leave as-is; the user is the one who toggled it. But if recovering: only insert the `notification_log` row after `notif.show()` resolved without obvious failure. (The `Notification` object on macOS exposes `failed` + `error` events.)
- **Fix:** Subscribe to the `failed` event on the `Notification` object (`notif.on('failed', err => ...)`), and on failure, *don't* insert the log row — so a user who later re-enables notifications will see the buffered breaking event.
- **Fix safety:** 🟡 Bug — current behavior over-counts delivered notifications when the OS dropped them. New behavior is closer to truth without changing what the user sees on the success path.

## Nice-to-have

### 8. `app.whenReady()` chain has no `.catch` — any throw outside the explicit try/catches becomes an unhandled rejection
- **[src/main/index.ts:525, 759]** — The big `whenReady().then(async () => { ... })` block is a 234-line callback with no `.catch` at the end. Any synchronous throw (covered partially by Critical #2) or any `await` rejection that escapes the inline `.catch` arms (e.g., a malformed `applyDockIcon` call, a window-creation failure) silently rejects the chain.
- **Fix:** `.catch((err) => { console.error('[boot] whenReady failed:', err); dialog.showErrorBox('Pulse boot error', String(err)); app.quit() })` at the end of the chain.
- **Fix safety:** 🟢 Safe.

### 9. No `requestSingleInstanceLock()` — second launch silently shares the SQLite WAL
- **[src/main/index.ts]** — `grep -rn "requestSingleInstanceLock\|second-instance" src/` → 0. better-sqlite3 + WAL handles concurrent connections OK for reads, but two writers competing on the same `pulse.db` (e.g., both running migrations on a fresh install, or both running maintenance VACUUM) can produce SQLITE_BUSY. The second instance's UI is also a duplicate window the user didn't expect.
- **Fix:** `if (!app.requestSingleInstanceLock()) app.quit()` at the top of `whenReady`; in the `second-instance` event, focus the existing window. Stage 13 packaging is the right time to add this.
- **Fix safety:** 🔴 Feature change — alters behavior for the (small) cohort of users who launch Pulse twice on purpose. Mention only.

### 10. `setInterval` calls aren't wrapped in `unref()`-style cleanup — extra liveness during quit
- **[src/main/index.ts:731 (`ollamaHealthInterval`)]** — Cleared in `will-quit`, good. But the `ollamaP` promise chain inside the boot may continue past `will-quit` if Ollama is in the middle of a slow response. Since Ollama health check is short (3s timeout via `HEALTH_CHECK_TIMEOUT_MS`), this is mostly cosmetic — appears as a stray console line if shutdown lands inside the request.
- **Fix:** Already mostly fine. If desired, abort the controller in `will-quit`. Low priority.
- **Fix safety:** 🟢 Safe.

### 11. `companyValueChainService.regenerateAllChains` is not cancellable mid-run
- **[src/main/services/companyValueChainService.ts:2863-2997]** — A 2-4h run has no abort signal. The user can quit the app (which kills it cleanly enough), but cannot say "stop after this symbol." If the user closes the main window the run continues in the background; if they quit, partial progress is preserved (each symbol is committed individually via `setCompanyValueChain` at line 2733 and `markCorrectionsApplied` at line 2744 — atomically per better-sqlite3 default).
- **Fix:** Add a `regenAbortRequested` flag toggled by an IPC and checked at the top of each loop iteration. New surface area, modest work.
- **Fix safety:** 🔴 Feature change — adds a user-facing cancel button. Mention only.

## Skipped (intentional given Pulse's nature)

- **Distributed-system concerns** — single-process desktop app, N/A.
- **Better-sqlite3 transaction safety on hard kill** — better-sqlite3 inherits SQLite's WAL durability; a SIGKILL mid-transaction rolls back cleanly via the journal on next open. Already correct.
- **The `setInterval` 32-bit overflow** — already accounted for at `graphNotesRefreshService.ts:59-62` (the only weekly-cadence scheduler) with explicit comment. Other schedulers all use sub-day intervals.
- **Yahoo crumb re-handshake** — verified all six crumb-gated endpoints (`getFundamentals`, `getEarnings`, `getEarningsHistory`, `getAnalystEstimates`, plus the auth-fallback path of `getOptionsSnapshot`) properly call `ensureYahooCreds(true)` on 401 and one-retry. The chart endpoints (`getHistory`, `fetchExtendedOne`, `fetchQuoteOne`) are anonymous and don't need the dance.
- **Ollama "AI features degrade gracefully" claim** — verified: every call site (`scoreWithOllama`, `discoveryService.runWeeklyCurated`, `companyValueChainService` via `aiClient`, `tickerSummaryService`, `smartLookupService`, `hyperQaService`, `claudeService.checkClaudeHealth` for Claude path) gates on `checkOllamaHealth()` / `isClaudeConfigured()` / `checkClaudeHealth()` and returns null on failure. Callers all handle null.
- **Stage 13 packaging gaps** — out of scope per CLAUDE.md; covered by the packaging-readiness reviewer.
- **App.tsx 5000-line size** — code-quality reviewer's territory.
- **Reel protocol path-traversal** — already correctly validated at `src/main/index.ts:509` (rejects `..` and `/`).
