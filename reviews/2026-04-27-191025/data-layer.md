# Data Layer Review · 2026-04-27

## TL;DR

The data layer is in solid shape: migrations are strictly ordered v1..v45 with no gaps or duplicates, every migration runs inside a `db.transaction(...)` (`src/main/database/connection.ts:58`), `PRAGMA foreign_keys = ON` is set on connection (line 19), and the bulk-write paths I sampled (`upsertArticles`, `upsertQuarters`, `upsertMatches`, `upsertFilings`, `setCompanyValueChain`) wrap their loops correctly. No Critical findings. The notable smells are: (1) `chainAbsorberService.absorbGeneratedChain` performs a multi-step delete-then-rewrite of `graph_node_overrides` + `graph_edge_overrides` without a wrapping transaction, leaving room for partial-state on a mid-call throw; (2) `companyNameResolver.loadIndex` rebuilds the full ticker + SEC name index on every call, with a JOIN (`sec_former_names → sec_cik_map`) where `sec_cik_map.cik` is unindexed; (3) preload's `Feed` interface is missing the `tickerId` field that the handler ships back. None bite today, all fix-able with 🟢/🟡 changes.

## Critical

None.

## Important

### 1. `absorbGeneratedChain` is not transactional — partial-state on mid-call throw
- **File:** `src/main/services/chainAbsorberService.ts:126-251`
- **Evidence:** The function runs (in order) a `DELETE FROM graph_node_overrides WHERE source = ?`, then a SELECT/UPDATE/DELETE loop over `graph_edge_overrides`, then a loop calling `ensurePassiveTicker` + `upsertNodeOverride` per node, then a loop calling `upsertEdgeOverrideWithConsensus` per edge. None of this is wrapped in `db.transaction(...)`. There are 4+ separate writes with no atomic boundary.
- **Trigger:** A user saves a regenerated chain for `COF`. `absorbGeneratedChain('COF', graph)` enters the function, deletes the old `chain_gen_COF` node-override rows, finishes the edge-source rewrite, gets partway through the new node loop, and throws — e.g. `ensurePassiveTicker` fails on a malformed symbol ("&AMP" from a sloppy Claude response), or an `upsertEdgeOverrideWithConsensus` `JSON.parse` fails on a corrupt existing `citationJson`. The chain row in `company_value_chains` was already saved (the caller has its own try/catch around `absorbGeneratedChain`, see `companyValueChainService.ts:2755`), so the user thinks regeneration succeeded — but the unified graph overlay is missing roughly half of `COF`'s nodes and all of its edges.
- **Impact:** Silent data divergence between `company_value_chains.graphJson` and the `graph_*_overrides` overlay. The Value Chain renderer shows a partial sector view; subsequent regenerations re-run the same delete-first sequence so the corrupt state can persist across multiple regens until the user manually rebuilds.
- **Fix:** Wrap the body of `absorbGeneratedChain` (lines 126-251) in `db.transaction(() => { ... })()` so a throw rolls back the deletes alongside the half-applied inserts. Idempotent — same writes, same outcome on success, atomic on failure.
- **Fix safety:** 🟡 Bug

### 2. `companyNameResolver.loadIndex` rebuilds the entire name index on every call, with an unindexed JOIN
- **File:** `src/main/services/companyNameResolver.ts:185-229`, called from `companyValueChainService.ts:699` (per-node in a chain regen) and `tenKConcentrationService.ts:385` (batch).
- **Evidence:** `loadIndex` does (a) `listTickers()`, (b) `SELECT symbol, companyName FROM sec_cik_map WHERE companyName IS NOT NULL` (~10k rows per the comment), (c) `listFormerNamesJoinedToSymbols()` which is `SELECT m.symbol, f.originalName, f.normalizedName FROM sec_former_names f JOIN sec_cik_map m ON m.cik = f.cik` (`secFilings.ts:267-274`). The join is on `sec_cik_map.cik`, which is NOT indexed — `sec_cik_map`'s only index is its PRIMARY KEY on `symbol` (migration v30, `migrations.ts:795-800`). So every call does a full scan of `sec_cik_map` per former-names row (or merge-join with two scans, depending on planner).
- **Trigger:** A regenerate-all run on a 60-ticker watchlist calls `resolveCompanyName` once per node per chain. With ~30 nodes per chain this is ~1800 `loadIndex` invocations, each rebuilding a ~10k-entry array and re-doing the unindexed join. The companion comment ("<50ms") was written before `sec_former_names` got populated; with the v36 former-names path filled in, each call gets noticeably slower.
- **Impact:** Bulk regen path spends seconds doing redundant DB work the cache could eliminate. Not a correctness bug — just throughput. Indirectly compounds Claude/Ollama timeout risk because each chain takes longer end-to-end.
- **Fix:**
  1. Add a module-level cache for the index: build once, invalidate when `tickers` mutates (callers already know to invalidate — `db:tickers:create`, `db:tickers:delete`, `setTickerActive`) and when `secFilingsService` finishes a CIK refresh. Expose an `invalidateNameIndex()` and call it from those mutation sites.
  2. `CREATE INDEX IF NOT EXISTS idx_sec_cik_map_cik ON sec_cik_map(cik)` in a new migration v46 so the join is indexed even on cold first-call.
- **Fix safety:** 🟢 Safe — the index is additive; the cache is a read-side memoization with explicit invalidation hooks.

### 3. `preload Feed` interface is missing `tickerId`, which the handler ships back
- **File:** `src/preload/index.ts:15-23` vs `src/main/database/feeds.ts:25-34`
- **Evidence:** Main's `toFeed` (line 25-34) hydrates `tickerId: row.tickerId`, so the IPC return shape always includes that field. Preload's `Feed` interface omits it. `db:feeds:list` happens to filter `WHERE f.tickerId IS NULL` in the SQL (line 41), so today every returned row has `tickerId === null`, and the renderer's omission is harmless. `db:feeds:create` and `feedFinder:add` also return `Feed` and likewise pass through any non-null `tickerId` field that exists on the row.
- **Trigger:** Today, no live trigger — the renderer doesn't read `feed.tickerId` and SQL hides the populated rows. The drift bites the day someone (a) writes a future handler that returns ticker-owned feeds (e.g. for a Watchlist Sources management UI) or (b) uses `feed.tickerId` from the bridge in TypeScript code that compiles fine because the field is implicitly `undefined` on the typed surface.
- **Impact:** Silent contract drift waiting to surface. Today: nothing. Tomorrow: a renderer that thinks `feed.tickerId` is always `undefined` and treats a real ticker-owned feed like a regular one.
- **Fix:** Add `tickerId: number | null` to the preload `Feed` interface. Renderer doesn't need to use it — TS will allow but not require. No behavior change.
- **Fix safety:** 🟢 Safe

### 4. `discovery_suggestions` has no index on `createdAt`, scanned for every list/sweep
- **File:** `src/main/database/migrations.ts:84-92` (table), `src/main/database/discovery.ts:65-72` and `93-97` (queries).
- **Evidence:** `listSuggestions` runs `SELECT * FROM discovery_suggestions ORDER BY createdAt DESC LIMIT ?` and `clearOlderThan` does `DELETE FROM discovery_suggestions WHERE createdAt < ?`. Neither has an index — the only index implied is the AUTOINCREMENT PK on `id`.
- **Trigger:** Discovery's three sweeps (daily/weekly/portfolio-gaps) write rows continuously. Over months the table grows; the renderer's Discovery panel calls `db:discovery:list` on every focus and the maintenance pass calls `clearOlderThan`. Both become full scans.
- **Impact:** Won't be felt at the current scale (table is small) but will compound. Same shape as a missed index in `notification_log` or `reader_cache` — both of which DID get indexes in their migrations.
- **Fix:** New migration `CREATE INDEX IF NOT EXISTS idx_discovery_suggestions_createdAt ON discovery_suggestions(createdAt DESC);` — covers both the list-newest and prune queries.
- **Fix safety:** 🟢 Safe

### 5. Per-call `db.prepare` in hot bulk-write helpers
- **Files:** `src/main/database/tickerFinancials.ts:82` (`upsertQuarters`), `src/main/database/secFilings.ts:51, 96` (`upsertCikMap`, `upsertFilings`), `src/main/database/fredObservations.ts:28` (`upsertObservations`), `src/main/database/articleTickerMatches.ts:17` (`upsertMatches`), `src/main/database/articles.ts:188, 232` (`upsertArticles`, `rescoreArticles`).
- **Evidence:** Each of these calls `getDb().prepare(...)` inside the function body, so the statement compiles every time the function is invoked. The compile is amortized across the inner loop (good — no re-compile per row), but every batch call still pays one parse. better-sqlite3 documents prepared-statement caching as the single biggest perf lever.
- **Trigger:** `feedPoller.pollAllFeeds` calls `upsertArticles` once per feed cycle (`feedPoller.ts:176`). `stocksScheduler` calls `upsertQuarters` per-ticker on its 3-cadence loop. `secFilingsService` calls `upsertFilings` per ticker. None catastrophic, but each is on a polling loop.
- **Impact:** A measurable but small (microseconds per call) overhead. Not user-visible.
- **Fix:** Hoist each `prepare` call to module scope, lazily initialized on first use (lazy because `getDb()` requires `initDatabase()` to have run). Pattern: `let stmt: Statement | null = null; function getStmt() { return stmt ??= getDb().prepare(...); }`. Cleaner: a tiny helper that memoizes by SQL text.
- **Fix safety:** 🟢 Safe

### 6. `companyValueChainService` calls `await import('../services/...')` inside per-IPC handlers
- **File:** `src/main/ipc/handlers.ts:602-651` (and elsewhere — chainCorrections, research, fred, brief).
- **Evidence:** Multiple handlers do `const { generateCompanyChain } = await import('../services/companyValueChainService')` on every invocation. Node caches dynamic imports so the second call is essentially free, but the first call on an already-loaded process still goes through the module resolver, and TypeScript-emitted `await import` desugars to a `Promise.resolve(require(...))` that does a sync require under the hood.
- **Trigger:** Not a bug — just a delayed-init pattern that keeps boot fast. The cost is one extra microtask per IPC call.
- **Impact:** Negligible. Worth flagging only because it makes IPC handlers slightly harder to reason about — error stacks become "Error in async handler at handlers.ts:<line>" with no obvious service binding.
- **Fix:** Hoist these to top-level imports in handlers.ts now that boot is splash-gated and the import cost is paid before the user sees anything. Don't change anything that's deliberately deferred (e.g., reels Python workers).
- **Fix safety:** 🟢 Safe (no behavior change)

## Nice-to-have

### 7. No backup / corruption recovery path
- **Files:** `src/main/database/connection.ts`, `src/main/services/maintenanceService.ts`
- **Observation:** No periodic file-copy of `pulse.db`, no `wal_checkpoint(TRUNCATE)` cadence, no `PRAGMA integrity_check` on boot. The maintenance service runs `VACUUM` after >200 deletes (`maintenanceService.ts:47-52`); that's the only health-affecting DB op outside migrations.
- **Risk:** A corrupted .db (power loss mid-write on a non-WAL filesystem, disk pressure, ungraceful kernel kill) means total data loss. Pulse is local-only with no cloud sync — there's no recovery story.
- **Fix:** A daily snapshot is one `db.backup('pulse.db.bak')` call. Roll two slots (today/yesterday). better-sqlite3 supports this directly. Not blocking.
- **Fix safety:** 🟢 Safe — net-new file in `userData`, no schema change.

### 8. `mode` column on `discovery_suggestions` is a free-form TEXT (`'daily'`/`'weekly'`/`'portfolio_gaps'`) with no `CHECK`
- **File:** `src/main/database/migrations.ts:184`
- **Observation:** Migration v6 added the column with `DEFAULT 'daily'` but no constraint on values. If the discovery service grows new modes, old code that filters on `mode = 'daily'` will silently miss them.
- **Fix safety:** 🔴 Feature change (CHECK constraints in SQLite require table rebuild). Heads-up only.

### 9. `chain_corrections.subjectType` and `correctionType` are also free-form TEXT
- **File:** `src/main/database/migrations.ts:1142-1158`
- **Observation:** Both are part of the composite PK and have no CHECK. The TS-side `ChainCorrectionSubjectType` and `ChainCorrectionType` unions are the only validation; an arbitrary string written via direct DB access (debug session) would silently land in the table.
- **Fix safety:** 🔴 Feature change. Heads-up only.

### 10. Several JSON-blob columns are queryable-as-text but not indexable
- **Files:** `ticker_estimates.dataJson` (v29), `morning_briefs.payloadJson` (v37), `earnings_releases.summaryJson` (v31), `graph_candidates.payloadJson/evidenceJson` (v32), `company_value_chains.graphJson` (v34), `research_briefs.payloadJson` (v44), `article_relevance.matchesJson` (v27).
- **Observation:** These are intentional design — read-as-a-whole units, not queryable fields. Migration v40 (`chain_edge_mentions`) shows the team's playbook for when a JSON blob outgrows that pattern: denormalize into a side table at write-time. Worth noting that `article_relevance.matchesJson` is the most likely future candidate (the renderer will eventually want "all articles matching this watchlist symbol via personal relevance" without parsing every row's JSON).
- **Fix safety:** 🔴 Feature change. Heads-up only — no action recommended now.

### 11. `__none__` sentinel in `article_ticker_matches` rides the `'weak'` strength channel
- **File:** `src/main/database/articleTickerMatches.ts:94-103`, schema at `migrations.ts:462`
- **Observation:** The CHECK constraint allows `('strong', 'weak')`; the sentinel uses `'weak'`. Reads are filtered by `WHERE m.symbol = '<real-symbol>'` so the sentinel never accidentally returns. Only `graphCandidatesService.ts:132` explicitly excludes it. The `idx_atm_symbol_strength` index on `(symbol, strength)` happily indexes the sentinel rows; on a long-running install, sentinel rows could meaningfully outnumber real matches and bloat the index.
- **Fix safety:** 🔴 Feature change to add a `kind` discriminator. Heads-up only. A simpler 🟢 mitigation: the maintenance service could prune `WHERE symbol = '__none__' AND articleId IN (purged-articles)` — but `ON DELETE CASCADE` on `articles` already handles that.

## Skipped (intentional given Pulse's nature)

- **No multi-writer concurrency.** Single-process Electron + better-sqlite3 — there's exactly one writer thread by construction. No lock-contention concerns.
- **No sharding / replication.** Single-user, single-machine; not applicable.
- **No telemetry on schema usage.** Privacy stance in CLAUDE.md ("All data is local. No telemetry") makes "we should track which queries are slow in production" moot.
- **No migration v37/v38 misorder repeat.** Spot-checked — versions are strictly monotonic 1→45 with no duplicates or skips, and `runMigrations` filters strictly by `version > currentVersion` so an out-of-order definition would be caught immediately by the v6/v7 etc. boot.
- **v45's `DELETE FROM company_profiles`** is a coarse but considered choice. A `promptVersion` column would have been cleaner (old rows render their pre-v45 description until the new prefetch supersedes them) but the current design has the renderer always call `ensureCompanyProfile`, which serializes through `inflight` and an Ollama queue. The user-visible cost is a "loading…" state on detail pages opened during the post-migration prefetch window — accepted by the migration's author. Not flagged as a fix candidate (the user's no-feature-change rule rules out the schema change anyway).
- **`PRAGMA foreign_keys = ON`** is set at connection open (`connection.ts:19`), before any migration runs. FK enforcement is live across the whole app. Verified.
- **`closeDatabase()` runs on `will-quit`** (`index.ts:783`), and no service queries the DB after that hook fires — schedulers stop above the close call.
- **Renderer never opens the DB** — `grep -rn "getDb()" src/renderer/` returned nothing. The "DB ops stay in main process" rule from CLAUDE.md holds.
