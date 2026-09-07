# Pulse Trading System — Phased Build Plan

This directory contains the full phased plan for building a news-driven trading system on top of Pulse. Each phase is a separate brief. **Phases are executed sequentially with human go/no-go between them.**

## Phase summary

| Phase | Name | Calendar | Cost | Capital at risk |
|-------|------|----------|------|-----------------|
| A1 | Signal-existence proof | 2-3 weeks | ~$50 | $0 |
| A2 | External data + first model + backtest | 1-2 months | $300-1000 | $0 |
| A3 | LLM signal augmentation (optional) | 1 month | $200-500 | $0 |
| A4 | Paper trading infrastructure | 3-4 months | $0-200/mo | $0 |
| A5 | Tiny live | 2-3 months | broker fees | $2-5K |
| A6 | Scaled live | ongoing | broker fees | design capital |

Total time A1→A6: 9-15 months. Pre-live cost: ~$1-3K.

## How to use these briefs

1. **One phase at a time.** Read the brief for the current phase. Do that work. Stop. Surface results to the human. Wait for go/no-go.
2. **Do not skim ahead.** Each phase is calibrated assuming the prior phase delivered its expected output. Reading A4 before A2 is finished will tempt premature scope expansion.
3. **The gate is the point.** Every phase has a "pass / marginal / fail" criterion with explicit numbers. Hitting the criterion is what unlocks the next phase. Subjective "this seems to be working" is not a gate.
4. **Hard constraints are non-negotiable.** Each brief has a "Hard constraints" section. These exist because the LLM-coding-agent failure modes here are predictable: scope drift, premature abstraction, dependency sprawl, and look-ahead bias in backtests. The constraints prevent each one specifically.

## Regulatory note: PDT rule eliminated

The Pattern Day Trader rule (the historical $25K minimum equity requirement) is being eliminated effective **June 4, 2026**, replaced by a real-time intraday margin framework based on actual position risk. This means:
- No $25K floor for active intraday trading.
- No 4-day-trades-per-5-days restriction.
- Margin/leverage is now risk-based per position, not account-size based.
- Phase A5 ("tiny live") can start at any practical capital level without PDT-flag concerns.

This does **not** mean leverage is unconstrained — brokers will block trades that create intraday margin deficits in real time. The phases below assume cash trading or 1:1 margin, which sidesteps this entirely.

## Architecture (target shape across all phases)

The friend's original framing — "model takes news and price, executes orders, explains why" — is replaced by a layered architecture:

1. **Signal layer** — emits `{ticker, direction, confidence, horizon, expected_return, rationale}`. Built in A2 (classical ML), optionally augmented in A3 (LLM).
2. **Portfolio construction layer** — aggregates signals into target weights respecting constraints. Built in A4.
3. **Execution layer** — translates targets into broker orders. Built in A4 (paper) and reused in A5/A6 (live).
4. **Risk layer** — sizing limits, sector caps, drawdown halts, kill switches. Lives outside the model. Cannot be overridden by signals. Built in A4.
5. **Evaluation layer** — logs every signal, fill, and realized outcome. Provides the labeled data for future model iterations.

The model is the smallest part of this system. Most "trading bot" failures are infrastructure failures, not model failures.

## What lives where in Pulse

- All new code lives in a `trading/` subdirectory unless otherwise specified.
- All new tables in the existing Pulse SQLite database.
- All reports written to `trading/reports/` as Markdown.
- Existing Pulse modules (scheduler, classifier, scoring, value chains) are **read-only** from the trading system's perspective. Do not modify them in any phase.

## Files

- `phase-a1-signal-existence.md` — Phase A1 brief
- `phase-a2-external-data-backtest.md` — Phase A2 brief
- `phase-a3-llm-augmentation.md` — Phase A3 brief
- `phase-a4-paper-trading.md` — Phase A4 brief
- `phase-a5-tiny-live.md` — Phase A5 brief
- `phase-a6-scaled-live.md` — Phase A6 brief
