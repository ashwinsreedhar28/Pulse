# Pulse Review · 2026-04-27T19:20:37Z

Six specialized reviewers ran in parallel against the entire codebase. Reports below; this index surfaces only the **Critical** findings across all six. Read each report directly for the full picture.

## How to read

Each report follows the same structure: **TL;DR → Critical → Important → Nice-to-have → Skipped**. Severity bar:

- **Critical** — will already break, mislead, leak, or violate a documented invariant
- **Important** — will compound over the next few months
- **Nice-to-have** — small wins, low pressure
- **Skipped** — intentional given Pulse's personal-tool framing

Every finding is also tagged with a fix-safety label — strongly bias toward 🟢 / 🟡 when triaging:

- **🟢 Safe** — pure refactor / dead code / defensive guard. Cannot regress any working feature.
- **🟡 Bug** — corrects unambiguously-broken behavior; reproduction included in the finding.
- **🔴 Feature change** — would alter user-visible behavior in a debatable way. Heads-up only — the user has explicitly stated no fix from this review may alter functionality without separate approval.

## Cross-cutting Critical findings

Two Critical findings total — both from the **Reliability** report, both with 🟢 Safe fixes:

1. **Renderer has zero React error boundaries** — any component throw blanks the entire app. Verified: `grep -rn "ErrorBoundary\|componentDidCatch\|getDerivedStateFromError" src/renderer/` returns 0 hits. A malformed Yahoo `optionChain` shape, a stale cached `BriefSection`, or any unguarded destructure can blank-screen the whole UI with no recovery short of an app restart. Fix: add a top-level `<ErrorBoundary>` in `App.tsx` plus per-panel boundaries (~30-line class component, fallback shows "Something went wrong" + Reload button). 🟢 Safe — only renders its fallback on render error; passthrough otherwise. → see **[reliability.md](reliability.md)** §Critical #1.

2. **`initDatabase()` failure inside `app.whenReady()` hangs the splash forever with no error** — `src/main/index.ts:525-528, 715`. The DB init runs *before* the 180s splash watchdog is armed and is not wrapped in a try/catch. A failed migration, a `SQLITE_FULL`, or a prior-crash-corrupted DB throws synchronously, the splash never reveals, the user has no indication of what's wrong. Fix: wrap boot init in try/catch → `dialog.showErrorBox(...)` + `app.quit()`. 🟢 Safe — new path only runs when init throws (today: no user feedback at all). → see **[reliability.md](reliability.md)** §Critical #2.

The other four reviewers all found **0 Critical**. The codebase is in unusually good shape for a pre-packaging personal project: layering invariants intact, privacy claim verified end-to-end, migrations strictly ordered with proper transactions and `PRAGMA foreign_keys = ON`, TypeScript hygiene at zero `any` / zero `@ts-ignore` / zero renderer `console.log`, and the just-shipped presentation-mode covers the marquee correctly (one minor gap noted as Important).

## Reports

- **[Architecture](architecture.md)** — *0 Critical, 3 Important, 3 Nice-to-have.* Three-tier separation intact; main structural debts are the `ollamaService.ts` god-module (2.2K lines, 14 prompt families), uneven IPC handler-registration split, and `aiClient.ts` being an incomplete abstraction (3 of ~14 Ollama call sites route through it).
- **[Security & Privacy](security.md)** — *0 Critical, 0 Important, 5 Nice-to-have — privacy claim intact.* Only documented data-source hosts contacted; API keys read from `pulse.db` and never logged; `setWindowOpenHandler` denies non-`http(s)`; `reel://` scheme rejects path traversal; preferences whitelist intact. Findings are minor hardening, all 🟢/🟡.
- **[Reliability](reliability.md)** — *2 Critical, 5 Important, 4 Nice-to-have.* Two Critical findings (above). Important: `regenRunning` flag leak on early throw, two scheduler ticks lacking top-level try/catch, 32 unhandled `void window.api` chains in `App.tsx`, Stooq fallback briefly blanks the marquee on parse failure, notification-permission accounting drift on macOS.
- **[Performance](performance.md)** — *0 Critical, 5 Important, 5 Nice-to-have.* Headline: presentation-mode misses the `earnings-pulse-*::before` halo animations (just-shipped feature has a coverage gap, 🟡 Bug). Others: StocksPage rebuilds quote→symbol Map + sector grouping unmemoized on every quote tick, `filingBodyCache` accumulates 300–750 MB over multi-day sessions with no eviction, `feedPoller` calls `listTickers()` twice per poll, ticker matcher cache fully cleared on any single ticker mutation.
- **[Code Quality](code-quality.md)** — *0 Critical, 5 Important, 7 Nice-to-have.* All fix-safety tags 🟢. Top three: empty `if` block + self-contradicting comments in `personalRelevance.ts:393-409` (abandoned half-finished refactor), `CompanyValueChainSection.tsx` (523 lines) is an orphan with zero importers, `OLLAMA_BASE`/`OLLAMA_MODEL` env-default lines triplicated across three services while existing `getOllamaModel()` helper has zero importers.
- **[Data Layer](data-layer.md)** — *0 Critical, 6 Important, 5 Nice-to-have.* Migrations strictly ordered v1..v45, all transactional, `PRAGMA foreign_keys = ON` set on connect. Top: `chainAbsorberService.absorbGeneratedChain` does multi-step delete-then-rewrite of node + edge overrides outside any transaction (partial-state risk on mid-call throw, 🟡 Bug), `companyNameResolver.loadIndex` rebuilds full ticker + SEC index on every call with an unindexed JOIN (🟢 Safe — cache + index), preload `Feed` interface missing the `tickerId` field the handler ships back (🟢 Safe — type tightening).

## Stats

- Generated: 2026-04-27T19:20:37Z
- Branch: main @ 3b7de0d
- Reviewers run: 6 / 6 successful
- Findings: 2 Critical, 24 Important, 26 Nice-to-have (52 total)
