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

_(none)_

### 🟡 Important

_(none)_

### 🟢 Nice-to-have

- (2026-04-28) [renderer] 25 of 32 `void window.api.*` fire-and-forget calls in App.tsx still lack `.catch` — only the 7 user-visible loading-path ones got patched in commit `0bcbeb6`. The rest are markRead, rendererReady, notification subs, etc. where silent failure is by design. Add `.catch(console.warn)` later only if log noise bothers.
- (2026-04-28) [research] S2's `isInfluential` + intent classifier is ~80% accurate per their docs — occasional non-foundational ref slips into "Built on" or true foundational ref is excluded. Phase 2B Claude precision pass (~$0.006/paper Haiku, reads intro+related-works) would tighten this. Defer until the noise surfaces in practice.
- (2026-04-28) [earnings] Scheduler cycle time at 465 tickers × 30 per tick × 30 min = ~7.5 h to fully cycle. 1 h Yahoo TTL is the backstop, so individual freshness is bounded. If a specific ticker feels stale, bump `SYMBOLS_PER_TICK` in [src/main/services/earningsScheduler.ts](src/main/services/earningsScheduler.ts).
- (2026-04-28) [renderer] Stuck `working` state on the ValueChain Regenerate button — observed once on CLS during regen-all recovery; full Cmd+Q reset cleared it. Watch for repro on a different ticker; if it happens again, investigate the local `working` state lifecycle in `UnifiedValueChainCard`.
- (2026-05-07) [research/pdf] pdfjs warning during paper chain enrichment: `Ensure that the standardFontDataUrl API parameter is provided.` Fires on every `getDocument()` call in [src/main/services/paperPdfExtractor.ts](src/main/services/paperPdfExtractor.ts). pdfjs falls back to system fonts when embedded fonts can't be loaded — slightly garbles glyph extraction on PDFs with non-standard embedded fonts (older scanned conference PDFs), no impact on arXiv papers. One-line fix: pass `standardFontDataUrl` pointing at `pdfjs-dist/standard_fonts/` to `getDocument`. Defer until a paper's enrichment surfaces real garbled-glyph output.

### 🛠 Deferred (decided not to do)

- Tier 4 review-team refactors: `ollamaService.ts` 2.2K-line split, IPC handler-registration consolidation, `aiClient.ts` incomplete abstraction, `generateCompanyChain` 448-line function split, `await import()` → top-level. User decision: "no work without measurable impact." Re-evaluate only if one surfaces during actual feature work in that file.

## Resolved

- (2026-05-06) [boot/network] Multi-second app delay after coming online from a long offline period. Root cause: every scheduler tick on the resume path fanned out into doomed fetches (44 RSS at 15s timeout, ~300-symbol Yahoo + Stooq waves at 10s, ESPN at 12s) when the OS already knew the network was gone — saturated the Node TCP layer and queued behind the IPC nativeTheme 'updated' event in the v8 event loop, which is why a system theme switch with zero network deps felt 10-15s slow. Two-part fix: (a) new [networkStatus.ts](src/main/services/networkStatus.ts) wraps Electron's `net.isOnline()` with a 5s memo and (b) feedPoller pollAllFeeds, stocksScheduler tick, sportsReelScheduler tick, sportsAlertsService tick all early-return when `isOnline()` is false — they retry naturally on the next interval once the OS sees the network. Also tightened fetch timeouts to fail-fast values for the rare case where `net.isOnline()` says yes but connectivity is degraded: rss 15→8s, yahoo 10→6s, stooq 10→5s, sports 12→6s (4s for conferences), wikipediaEvents 10→5s, ipoBrief 10→5s. Cuts cascade-recovery from ~3 min worst-case to ~1 min, and zero-fetch the obviously-offline case.
- (2026-05-06) [logging] Yahoo/Stooq/ESPN fetch-fail spam during offline → online transitions. Largely resolved by the network-gate above (fetches don't run when OS reports offline, so they don't fail-and-log). Also dropped the per-chunk `[stooq] chunk fetch failed` line since stocksScheduler already emits a per-cycle summary via the Yahoo→Stooq fallback log. Yahoo's per-symbol getYahooQuotes path was already silent (returns null, no warn). Remaining ESPN warns are only fired on per-cycle failures during online periods, which is acceptable signal.
- (2026-05-03) [renderer] Massive jitter when opening Settings in the packaged build. `Settings.tsx:90` overlay used `backdrop-blur-sm` over the entire viewport — Chromium re-composed the underlying frame through the blur filter every paint, hidden in dev (DevTools shrinks the blurred area) but obvious full-window. Fixed by swapping for `bg-black/[0.88]` solid overlay (same pattern PeerCompareModal already uses). Also added the gotcha to CLAUDE.md so this doesn't regress.
- (2026-05-04) [renderer] Marquee + earnings-pulse halos jittered visibly when Pulse was screen-shared on macOS, requiring a presenter-mode toggle to pause them. Removed the toggle entirely; replaced the CSS keyframe marquee with a JS rAF-driven scrollLeft update (`useTickerAutoScroll`) that rides through the regular paint pipeline and captures cleanly. Earnings-pulse halos became static (state intensity preserved via box-shadow tier instead of opacity sweep). Also dropped the title-bar accent-dot `animate-ping` and ticker-mode dot ping. App is screen-share-seamless by default — no toggle, no jitter. Gotcha added to CLAUDE.md.
