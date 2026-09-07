---
description: Spawn the full Pulse review team — 6 specialized read-only reviewers (architect, security, reliability, performance, code-quality, data-layer) in parallel. Each writes a markdown report; an INDEX.md summary is generated after.
allowed-tools: Read, Glob, Grep, Bash, Write, Agent
model: opus
---

You are orchestrating a full read-only code review of the Pulse codebase using 6 specialized reviewer agents. Your job is to spawn them in parallel, wait for completion, and write a top-level summary. **You may not modify any source files.**

# Audit principles (apply to every agent)

These are baked into each agent's prompt, but reinforce them when invoking — the user has explicitly asked for them:

1. **High precision over completeness.** False positives are worse than missed findings. Every finding must cite a verified `file:line` and propose a specific fix. Dropping a marginal finding is better than padding the report.
2. **Critical findings need triggers.** Theoretical risks ("could fail under load") without a concrete firing path go to Nice-to-have or get dropped.
3. **Fix-safety classification on every finding.** Each finding's fix is tagged 🟢 Safe (behavior-preserving) / 🟡 Bug (corrects unambiguously-broken behavior) / 🔴 Feature change (alters UX, needs separate user approval). The user has stated explicitly that no fix from this review may alter user-visible functionality, so 🔴 findings are heads-up only — strongly bias toward 🟢 and 🟡.
4. **No agent overlap.** Each lens has a defined scope; agents skip topics owned by other reviewers (architect skips perf; reliability skips code style; etc.).

# Procedure

## Step 1 — set up the review directory

Run:

```bash
TIMESTAMP=$(date -u +"%Y-%m-%d-%H%M%S")
REVIEW_DIR="reviews/${TIMESTAMP}"
mkdir -p "$REVIEW_DIR"
echo "REVIEW_DIR=$REVIEW_DIR"
```

Capture the resulting `REVIEW_DIR` path — every agent gets it.

## Step 2 — spawn all 6 reviewer agents IN PARALLEL

Use a **single message with 6 Agent tool calls** so they run concurrently. Each call:

- `subagent_type` is the agent name (see below).
- `description` is a 3-5 word phrase.
- `prompt` is a self-contained brief that:
  - States the review scope in one line (matches the agent's frontmatter description).
  - Tells the agent to write its report to `{REVIEW_DIR}/{report_filename}.md` — pass the actual resolved path, not a placeholder.
  - Reminds the agent it is read-only.

Roster (agent → output filename):

| subagent_type | report file |
|---|---|
| pulse-reviewer-architect | architecture.md |
| pulse-reviewer-security | security.md |
| pulse-reviewer-reliability | reliability.md |
| pulse-reviewer-performance | performance.md |
| pulse-reviewer-quality | code-quality.md |
| pulse-reviewer-data | data-layer.md |

Example prompt template (substitute actual REVIEW_DIR):

```
Run an architectural review of the entire Pulse codebase per your agent definition. 
Project root is the repository root. Read CLAUDE.md first. 
Sample broadly across src/main/, src/renderer/, src/preload/ — don't try to read every file.
Write your report to reviews/2026-04-26-031500/architecture.md (this exact path).
Read-only — do not modify any source file.
```

## Step 3 — wait for all six to complete

The Agent tool returns a result for each. If any agent reports an error or fails to write its file, note it in the INDEX (don't re-spawn — just record).

## Step 4 — verify all 6 reports landed

```bash
ls -la "$REVIEW_DIR"
```

Should list 6 .md files (architecture, security, reliability, performance, code-quality, data-layer). Read each one's TL;DR section to source the cross-cutting summary.

## Step 5 — write INDEX.md

Write `{REVIEW_DIR}/INDEX.md` with:

```markdown
# Pulse Review · {timestamp}

Six specialized reviewers ran in parallel against the entire codebase. Reports below; this index surfaces only the **Critical** findings across all six. Read each report directly for the full picture.

## How to read

Each report follows the same structure: TL;DR → Critical → Important → Nice-to-have → Skipped. Severity bar:
- **Critical** = will already break, mislead, leak, or violate a documented invariant
- **Important** = will compound over the next few months
- **Nice-to-have** = small wins, low pressure
- **Skipped** = intentional given Pulse's personal-tool framing

## Cross-cutting Critical findings

(Aggregate the Critical sections from all 6 reports here. Group by theme if more than ~10 items.)

## Reports

- [Architecture](architecture.md) — {one-line TL;DR from that report}
- [Security & Privacy](security.md) — {one-line TL;DR}
- [Reliability](reliability.md) — {one-line TL;DR}
- [Performance](performance.md) — {one-line TL;DR}
- [Code Quality](code-quality.md) — {one-line TL;DR}
- [Data Layer](data-layer.md) — {one-line TL;DR}

## Stats

- Generated: {timestamp UTC}
- Branch: {git branch} @ {git short-sha}
- Reviewers run: 6 / 6 successful
```

Use `git rev-parse --short HEAD` and `git branch --show-current` to fill in the stats. Use `date -u` for the timestamp.

## Step 6 — print the path

End your turn with a one-line message: `Reports written to {REVIEW_DIR}/. Open INDEX.md to triage.`

# Constraints

- **READ-ONLY.** No source files may be modified. Only the `reviews/` tree is writable.
- **PARALLEL.** All 6 agents in one message. Do not chain them sequentially.
- **NO RE-RUNS.** If an agent fails, record it in INDEX.md and move on. Don't auto-retry.
- **NO ARGUMENTS.** Ignore any args passed; this command always reviews the whole codebase. (If the user wants a diff-only review, they should use `/bug-review`.)
