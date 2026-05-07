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

- (2026-05-04) [boot/network] Multi-second app delay after coming online from a long offline period. Repro: laptop offline for hours → reopen packaged Pulse → switch system theme via OS menu → ~10-15s delay before Pulse picks up the change. Likely cause: a network-blocking call somewhere on the resume path (Yahoo/SEC/S2/Anthropic/Ollama health check) is timing out instead of failing fast. Investigate: every fetch on the resume path needs a ≤2s timeout + cached fallback. Theme change in particular has zero network deps and shouldn't be touching anything network-blocking — that's the smoking gun for a shared lock or queue contention with a network call.

### 🟢 Nice-to-have

- (2026-04-28) [renderer] 25 of 32 `void window.api.*` fire-and-forget calls in App.tsx still lack `.catch` — only the 7 user-visible loading-path ones got patched in commit `0bcbeb6`. The rest are markRead, rendererReady, notification subs, etc. where silent failure is by design. Add `.catch(console.warn)` later only if log noise bothers.
- (2026-04-28) [research] S2's `isInfluential` + intent classifier is ~80% accurate per their docs — occasional non-foundational ref slips into "Built on" or true foundational ref is excluded. Phase 2B Claude precision pass (~$0.006/paper Haiku, reads intro+related-works) would tighten this. Defer until the noise surfaces in practice.
- (2026-04-28) [earnings] Scheduler cycle time at 465 tickers × 30 per tick × 30 min = ~7.5 h to fully cycle. 1 h Yahoo TTL is the backstop, so individual freshness is bounded. If a specific ticker feels stale, bump `SYMBOLS_PER_TICK` in [src/main/services/earningsScheduler.ts](src/main/services/earningsScheduler.ts).
- (2026-04-28) [renderer] Stuck `working` state on the ValueChain Regenerate button — observed once on CLS during regen-all recovery; full Cmd+Q reset cleared it. Watch for repro on a different ticker; if it happens again, investigate the local `working` state lifecycle in `UnifiedValueChainCard`.
- (2026-05-04) [logging] Yahoo/Stooq/ESPN fetch failures log fully when they fail in a tight loop (rate limit storms, DNS hiccups during offline → online transitions). Per-call `console.warn` is fine standalone but compounds when the maintenance sweeps cycle through dozens of symbols all hitting the same offline endpoint. Fold to a per-cycle summary ("[stocks] 47/50 fetches failed: ECONNREFUSED") rather than a line per failure. Probably also lets us spot the network-delay issue above more cleanly.

### 🛠 Deferred (decided not to do)

- Tier 4 review-team refactors: `ollamaService.ts` 2.2K-line split, IPC handler-registration consolidation, `aiClient.ts` incomplete abstraction, `generateCompanyChain` 448-line function split, `await import()` → top-level. User decision: "no work without measurable impact." Re-evaluate only if one surfaces during actual feature work in that file.

## Resolved

- (2026-05-03) [renderer] Massive jitter when opening Settings in the packaged build. `Settings.tsx:90` overlay used `backdrop-blur-sm` over the entire viewport — Chromium re-composed the underlying frame through the blur filter every paint, hidden in dev (DevTools shrinks the blurred area) but obvious full-window. Fixed by swapping for `bg-black/[0.88]` solid overlay (same pattern PeerCompareModal already uses). Also added the gotcha to CLAUDE.md so this doesn't regress.
- (2026-05-04) [renderer] Marquee + earnings-pulse halos jittered visibly when Pulse was screen-shared on macOS, requiring a presenter-mode toggle to pause them. Removed the toggle entirely; replaced the CSS keyframe marquee with a JS rAF-driven scrollLeft update (`useTickerAutoScroll`) that rides through the regular paint pipeline and captures cleanly. Earnings-pulse halos became static (state intensity preserved via box-shadow tier instead of opacity sweep). Also dropped the title-bar accent-dot `animate-ping` and ticker-mode dot ping. App is screen-share-seamless by default — no toggle, no jitter. Gotcha added to CLAUDE.md.
