# Code Quality Review · 2026-04-27

## TL;DR
Pulse's TypeScript hygiene is unusually tight: zero `as any`, zero
`@ts-ignore`/`@ts-expect-error`, zero `: any` (the only matches were a
boolean named `any`, a regex named `any`, and the English word in
comments), and no `console.log` in the renderer. The few real issues are
two orphaned files (a 523-line component + a 30-line tickerTerms
helper), one half-finished refactor in `personalRelevance.ts` that left
a guard block empty + comment contradicting itself, and a triplicated
Ollama env-config block that the codebase already has a helper for but
never imports.

Top three:
1. Important — dead branch in `personalRelevance.ts:397-409` (empty
   `if`, comment describes a guard that no longer exists).
2. Important — `CompanyValueChainSection.tsx` (523 lines) has zero
   importers; superseded by `StockValueChainCard` / `ValueChainDiagram`.
3. Important — `OLLAMA_BASE` / `OLLAMA_MODEL` env-default lines are
   triplicated across three services while `getOllamaModel()` is
   exported but unused.

## Critical
None. The non-null assertions I checked are all guarded by a preceding
`Map.has()` or `??`-narrowed boolean, the catch-blocks I sampled are
intentional (per CLAUDE.md "don't add error handling for scenarios that
can't happen"), and no `: any` / `as any` slipped through.

## Important

### 1. Dead `if` block + self-contradicting comment in `personalRelevance.ts:397-409`
**File:** `/Users/ashwinsreedhar/Pulse/src/main/services/personalRelevance.ts:393-409`

The block reads:

```ts
// Guard: a title-only symbol match with no corroborating signal should not
// be surfaced alone. The existing classifier's 'strong' tier already
// requires company name corroboration, so this is belt-and-braces for the
// rare case where the title alone drives the match.
if (
  ordered.length === 1 &&
  ordered[0].kind === 'ticker-direct' &&
  !haystackForTitleOnly.toLowerCase().includes(
    (allBySymbol.get(ordered[0].symbol!.toUpperCase())?.companyName ?? '').toLowerCase()
  ) &&
  !(input.body ?? input.summary ?? '').toLowerCase().includes(
    (allBySymbol.get(ordered[0].symbol!.toUpperCase())?.companyName ?? '').toLowerCase()
  )
) {
  // No corroboration at all — the classifier already handles this via the
  // ambiguous-symbol list; keep the match, we're just noting the case.
}
```

**Why it matters:** The leading comment promises "should not be
surfaced alone" — i.e. the match gets dropped. The body comment says
"keep the match, we're just noting the case." A reader trying to
understand the personal-relevance heuristic will assume one of the
two is authoritative and likely guess wrong. The actual code path is a
no-op (no return, no mutation, no log) — so the half-page conditional
plus its non-null assertion (`ordered[0].symbol!`) only makes future-me
think they need to adjust a guard that doesn't exist. Classic
abandoned-refactor smell.

**Fix:** Delete the `if (...) { ... }` block entirely (lines 393–409)
and keep `return ordered`. The intent (drop title-only ambiguous
ticker matches) is already enforced upstream — `AMBIGUOUS_SYMBOLS`
gating in `tickerRelevance.ts`.

**Fix safety:** 🟢 Safe — verified the body has no observable effect.

### 2. `CompanyValueChainSection.tsx` is an orphan
**File:** `/Users/ashwinsreedhar/Pulse/src/renderer/components/CompanyValueChainSection.tsx` (523 lines)

`grep -rn "CompanyValueChainSection" src/` returns exactly one hit: the
`export function` declaration on line 78. It is not imported by
`App.tsx`, by `ValueChain.tsx`, or by any other component. The
file's leading comment ("Per-ticker AI-generated value chain, rendered
on the stock detail page") describes functionality now provided by
`StockValueChainCard.tsx` + `ValueChainDiagram.tsx`.

**Why it matters:** Future-me opens the file, sees a polished 500-line
component with a clean `Role` enum and `classifyRole()` helper, and
either (a) wastes 20 minutes wiring it back in before realizing it's
been replaced, or (b) refactors a duplicate of its `Role` model and
introduces drift between the live diagram and this stale copy. The
`classifyRole()` helper at L56 is already implemented (with subtly
different orientation logic) inside `ValueChainDiagram.tsx`.

**Fix:** Delete `src/renderer/components/CompanyValueChainSection.tsx`
in full.

**Fix safety:** 🟢 Safe — zero importers; verified by grep.

### 3. Orphan helper file `tickerTerms.ts`
**File:** `/Users/ashwinsreedhar/Pulse/src/main/services/tickerTerms.ts` (30 lines)

`grep -rn "buildTickerTerms\|tickerTerms" src/` returns only the
declaration. The function builds an alias-set for ticker matching;
`tickerRelevance.ts` now does this inline using `tickerReference.json`
aliases (lines 119–125 there).

**Why it matters:** Reads the same JSON dataset, embeds the same
corporate-suffix-stripping regex, but with diverging behavior (this
copy includes `Technology|Technologies`; the regex in
`tickerRelevance.ts:stripCorporateSuffix` is in a separate helper).
Either copy could drift further before the next reader notices.

**Fix:** Delete `src/main/services/tickerTerms.ts`.

**Fix safety:** 🟢 Safe — verified zero callers.

### 4. `OLLAMA_BASE` / `OLLAMA_MODEL` triplicated; existing `getOllamaModel()` export unused
**Files:**
- `/Users/ashwinsreedhar/Pulse/src/main/services/ollamaService.ts:3-4`
- `/Users/ashwinsreedhar/Pulse/src/main/services/discoveryService.ts:262-263`
- `/Users/ashwinsreedhar/Pulse/src/main/services/reelService.ts:33-34`

All three define the literal pair:

```ts
const OLLAMA_BASE = process.env['PULSE_OLLAMA_URL'] ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env['PULSE_OLLAMA_MODEL'] ?? 'mistral:7b'
```

Meanwhile `ollamaService.ts:175` exports `getOllamaModel()` — but
`grep -rn "getOllamaModel" src/` returns zero importers.

**Why it matters:** The CLAUDE.md gotcha for `PULSE_OLLAMA_MODEL`
treats this as a single override knob. Today, if someone changes the
default to `mistral:7b-instruct-q4_K_M` (the kind of edit that's
plausible during Stage 13 polish), they'll fix `ollamaService.ts`,
test the AI scoring path, and miss the discovery + reel-script
pipelines because those quietly resolve their own env defaults. That's
a silent divergence: env override works, default does not.

**Fix:** Export the constants from `ollamaService.ts` (or use the
already-exported `getOllamaModel()`) and import them in
`discoveryService.ts` and `reelService.ts`.

**Fix safety:** 🟢 Safe — purely a constant relocation; both branches
of the `??` are preserved through one definition.

### 5. `generateCompanyChain` in `companyValueChainService.ts` is 448 lines
**File:** `/Users/ashwinsreedhar/Pulse/src/main/services/companyValueChainService.ts:2327-2774`

Beyond the project's "intentional large files" stance, this single
function chains five sequential augmentation passes
(`bilateralAugmentCitations`, `concentrationAugmentCitations`,
`materialAgreementAugmentCitations`, `riskFactorsAugmentCitations`,
`edgarFullTextSearchAugmentCitations`, `webSearchAugmentCitations`),
each wrapped in identical `try { … } catch (err) { console.warn(…) }`
boilerplate. Each augmenter is already a top-level helper; the body
is essentially a sequencer.

**Why it matters:** Every time a new augmentation step is added (and
the codebase clearly anticipates more — see the "absorbed into unified
graph" memory note), the reader copy-pastes another `try/catch
console.warn`. The pattern has 5 callers already and a 6th is plausible
within the next sprint.

**Fix:** Extract a small local helper inside the file:

```ts
async function safeAugment(
  name: string,
  sym: string,
  fn: () => Promise<CompanyValueChainEdge[]>
): Promise<CompanyValueChainEdge[] | null> {
  try { return await fn() }
  catch (err) {
    console.warn(`[companyChain] ${name} failed for ${sym}:`,
      err instanceof Error ? err.message : err)
    return null
  }
}
```

Then `citedEdges = await safeAugment('webSearch', sym, () => webSearchAugmentCitations(citedEdges, sym, input.companyName)) ?? citedEdges`. Removes ~40 lines, makes the sequencing legible.

**Fix safety:** 🟢 Safe — pure refactor with identical try/catch
semantics; no user-visible change.

## Nice-to-have

### 6. `WIKI_BASE` literal duplicated across two services
**Files:**
- `/Users/ashwinsreedhar/Pulse/src/main/services/smartLookupService.ts:25`
- `/Users/ashwinsreedhar/Pulse/src/main/services/hyperQaService.ts:26`

Both declare `const WIKI_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary'`
plus a near-identical fetch-with-abort + User-Agent block. With only 2
callers it's borderline (per the "3+" rule), so flagging as
nice-to-have rather than important. If a third Wikipedia consumer
shows up, lift to `services/wikipedia.ts`.

**Fix safety:** 🟢 Safe.

### 7. Empty `if`-then ladder branches with no `else` in
`generateCompanyChain` augmenters
**File:** `companyValueChainService.ts:2700-2715`

Two consecutive `try { … } catch (err) { console.warn(…) }` blocks with
identical text differing only in the function name being warned about.
Subsumed by finding 5; mentioning here in case the helper isn't
extracted.

### 8. Boolean variable named `any` in `yahooFinanceService.ts:1638`
**File:** `/Users/ashwinsreedhar/Pulse/src/main/services/yahooFinanceService.ts:1638`

`let any = false` inside the volume-aggregation loop. Not a bug — just
a name that semantically aliases TypeScript's `any` keyword and trips
the eye when grepping. Renaming to `hasAnyVolume` (or `sawValue`) costs
nothing.

**Fix safety:** 🟢 Safe — local scope.

### 9. Regex variable named `any` in `tickerRelevance.ts:80, 87, 98, 128`
**File:** `/Users/ashwinsreedhar/Pulse/src/main/services/tickerRelevance.ts`

Same pattern — the destructured field is `any: RegExp`. Combined with
finding 8, this is the entire "appears to be `: any` typing" set my
grep produced; both are false positives but slow down review. Rename
to `bare` or `general` and the project becomes "zero `any` everywhere
including names."

**Fix safety:** 🟢 Safe — internal only.

### 10. `RegenerateAllProgress` interface exported but only consumed locally
**File:** `companyValueChainService.ts:2786`

`maybeAutoRegenerateOnBoot` is also `export`ed but only used by
`scheduleAutoRegenerateOnBoot` in the same file (verified via grep).
Demote both to non-exported. Trivial cleanliness, not a real problem.

**Fix safety:** 🟢 Safe — both names confirmed module-internal.

### 11. The literal `'http://localhost:11434'` lives in three files
Subset of finding 4; once 4 is fixed this is gone.

### 12. `_v3legacy` source-suffix string magic in `sectorService.ts:272-274`
**File:** `/Users/ashwinsreedhar/Pulse/src/main/services/sectorService.ts:272`

```ts
const newSource = row.source.endsWith('_v3legacy')
  ? row.source
  : `${row.source}_v3legacy`
```

The string `'_v3legacy'` is referenced twice on adjacent lines, then
nowhere else in the codebase (grep confirms). It's the kind of
migration-tag string a future v4 migration will need to grep for.
Promote to a local `const LEGACY_SOURCE_SUFFIX = '_v3legacy'`.

**Fix safety:** 🟢 Safe — string-literal extraction.

## Skipped (intentional given Pulse's nature)

- `App.tsx` at 6,391 lines — explicitly called out in CLAUDE.md as a deliberate choice.
- `ipc/handlers.ts` at 971 lines / 145 handlers — same conventional choice; one file per IPC channel would fight the "DB ops stay in main, expose via IPC" pattern.
- `console.log` calls in main-process services with `[prefix]` tags — the project's chosen logging cadence; consistent across the file set.
- Sparse JSDoc / no docstrings on most exported functions — explicit per "Default to writing no comments."
- Empty `} catch {` in `App.tsx:178, 1097, 2840` — verified intent (UI fall-back paths where the failure surfaces a separate state); not the abandoned-refactor pattern.
- 448-line / 565-line LLM-prompt-construction functions in `claudeService.ts` and `ollamaService.ts` — most of the volume is prompt template strings; would not benefit from extraction.
- "DEPRECATED: legacy single-citation field" comments on `citation?` props in
  `ValueChainDiagram.tsx:38` and `StockValueChainCard.tsx:62` — kept for
  back-compat with absorbed override rows; documented in the comment, not
  a stale-comment case.
- `let any = false` (finding 8) and the regex named `any` (finding 9) — flagged
  as nice-to-have only because they're style, not safety.
