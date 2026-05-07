# Pulse development workflow

Two long-lived branches. Audit gate before promotion. Repackage from `main`.

## Branches

- **`main`** — production. Always shippable. The packaged `.app` the user runs daily is built from here. Every commit on `main` has passed the audit gate.
- **`dev`** — active development. All work — features, fixes, refactors, experiments — lands here first. Commits accumulate freely.
- **`feat/<name>`** (optional) — short-lived branches off `dev` for multi-session features. Merged back to `dev` when working.

## Default working branch

**Always check out `dev` at the start of a session.** Future commits go here unless the user explicitly says otherwise.

```bash
git checkout dev    # at session start
# ... work, commit, work, commit ...
```

## Audit gate (`dev` → `main`)

Run before every promotion. Each item must pass.

1. **Diff inventory** — `git diff main..dev --stat` then a per-file scan. The promoting human has seen every change. No "I forgot that was in there."
2. **Type-clean** — `npx tsc --noEmit` exits 0.
3. **Smoke test** (~5 min) — open Pulse, exercise the main flows that exist today:
   - Markets ticker scrolls, no jitter; switch to Stories / Sports tabs
   - Stocks page opens, click a ticker, value chain renders, regenerate works
   - Research tab — search, bookmark, view detail panel, open PDF in-window, switch to Map view
   - Settings — open, close, change a setting, apply
   - Calendar strip — expand / collapse, click a day
4. **Bug review on the diff** — `/bug-review main..dev` (the existing slash command). Reviews correctness regressions on the actual diff, not the whole codebase.
5. **Review team (optional, big batches)** — `/review-team` after major feature batches or before a release that ships outside personal use. Slower, broader, six lenses.
6. **`BUGS.md` is clean** — no 🔴 Critical entries open. 🟡 Important entries are acceptable to ship if they're tracked deliberately.
7. **Network audit** — for any change that touches a service / IPC / fetch path: confirm timeouts ≤ 2s on the resume path, errors fall back to cached state, no new always-on polling without justification.
8. **Privacy audit** — the no-telemetry / local-only promise still holds. No new outbound hosts. API keys still read from preferences, never logged.
9. **User approves the merge.**

## Promotion mechanics

```bash
git checkout main
git merge --ff-only dev          # fast-forward; keeps history linear
git push origin main             # back up production state to GitHub
git checkout dev
```

Then re-package + install:

```bash
npm run package                                    # build → dist/mac-arm64/Pulse.app
# Quit Pulse if running (Cmd+Q)
# Drag dist/mac-arm64/Pulse.app to /Applications, replace
# Right-click → Open the first time (Gatekeeper bypass for unsigned)
```

## Hotfix path

If a real bug surfaces in the running packaged app and `dev` has unfinished work that can't ship yet:

```bash
git checkout main
git checkout -b hotfix/<short-name>
# ... fix and commit ...
# Run the audit gate (steps 1-9) on the hotfix
git checkout main
git merge --ff-only hotfix/<short-name>
git checkout dev
git merge main                   # bring the hotfix into dev
git branch -d hotfix/<short-name>
```

Then repackage main as above.

## Why not `production` / `dev` / `staging` / etc.

This is a single-user personal project, not a team SaaS with QA / staging / canary tiers. `main` is production by convention. `dev` is the only "pre-release" stage that adds value. More branches would be process for its own sake — exactly the kind of "no measurable impact" overhead we don't take on.

If Pulse ever ships outside personal use, this doc gets revised — staging, signed builds, distribution channels, the works. Until then: two branches, audit gate, repackage.
