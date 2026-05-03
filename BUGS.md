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

### 🛠 Deferred (decided not to do)

- Tier 4 review-team refactors: `ollamaService.ts` 2.2K-line split, IPC handler-registration consolidation, `aiClient.ts` incomplete abstraction, `generateCompanyChain` 448-line function split, `await import()` → top-level. User decision: "no work without measurable impact." Re-evaluate only if one surfaces during actual feature work in that file.

## Resolved

- (2026-05-03) [renderer] Massive jitter when opening Settings in the packaged build. `Settings.tsx:90` overlay used `backdrop-blur-sm` over the entire viewport — Chromium re-composed the underlying frame through the blur filter every paint, hidden in dev (DevTools shrinks the blurred area) but obvious full-window. Fixed by swapping for `bg-black/[0.88]` solid overlay (same pattern PeerCompareModal already uses). Also added the gotcha to CLAUDE.md so this doesn't regress.
