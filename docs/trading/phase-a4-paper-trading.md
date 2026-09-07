# Phase A4: Paper Trading Infrastructure

**Precondition:** Phase A2 passed (and optionally A3). You have a frozen signal model that produces predictions per article, a backtest demonstrating positive net alpha after costs, and you have NOT touched a broker yet.

**Goal:** Build the full production-shape pipeline (signal → portfolio construction → execution → risk → evaluation) running against Alpaca's paper-trading API for 90+ continuous days. The deliverable is operational data — does the system run unattended without incident, and does live paper performance track the backtest?

**Budget:** 3-4 months total — 1 month build, then 90+ days of unattended operation. ~$0-200/mo if you keep Polygon news streaming for live signals (the historical bundle from A2 doesn't help once you're going forward).

**Out of scope:** Real money. Any code path that talks to a live broker is forbidden in this phase. No model retraining (use the A2/A3 frozen artifact). No "improvements" to the signal model based on observed paper trades — that's evaluation contamination.

---

## Context

What earlier phases produced and you'll consume:
- A2's signal model artifact: `xgb_v1.pkl` (or A3's `xgb_v2_ensemble.pkl` if A3 passed).
- The feature pipeline in `trading/features/build_features.py`.
- Polygon news API access (need to convert from historical-pull to streaming).

What you'll build here:
- A live news-ingestion path (replaces the historical Polygon pull).
- The portfolio construction layer.
- The execution layer (Alpaca paper).
- The risk layer.
- The evaluation/logging layer.
- A dashboard surfacing daily/weekly performance into Pulse.

## Architecture

```
[Live News Stream]
     ↓
[Feature Pipeline] (existing from A2)
     ↓
[Signal Model] (frozen artifact from A2/A3)
     ↓
[Portfolio Construction Layer]
     ↓
[Risk Layer] ← gates everything
     ↓
[Execution Layer] (Alpaca paper)
     ↓
[Fill Logging]
     ↓
[Evaluation Layer] (P&L, attribution, factor analysis)
     ↓
[Dashboard in Pulse]
```

The risk layer is a **circuit breaker between portfolio construction and execution**. It can veto orders, halt the system, or reduce sizing. It cannot be overridden by anything upstream.

## Tasks

### A4.1 — Live news ingestion

Build `trading/live/news_stream.py`.

Switch from Polygon's historical REST API to their WebSocket streaming endpoint (or polling on a 30-second cadence if WebSocket isn't on your tier). For each incoming article:
1. Persist to `polygon_news_live` table.
2. Run the existing feature pipeline.
3. Run the signal model.
4. Persist the prediction to `signals` table with timestamp.

Keep the live news stream isolated from Pulse's existing 5-min RSS poll. They're separate data paths now; do not modify Pulse's RSS code.

Handle reconnection, rate limits, and gaps gracefully. Log every gap > 5 minutes loudly.

### A4.2 — Portfolio construction layer

Build `trading/live/portfolio.py`.

At each rebalance time (open + close, or open only — pick one and document), compute target portfolio:
1. Read all signals from the past 16 hours.
2. Aggregate to ticker level (same logic as A2.5 backtest — `sum(predicted_excess_return × time_decay_weight)`).
3. Rank tickers. Select top N for long, bottom N for short. Default N = 10.
4. Compute target dollar exposure per position: equal-weighted within long side and short side, gross exposure 100% of equity.
5. Output `target_positions` table: ticker, target_shares, target_notional.

The portfolio construction logic must produce identical results given identical inputs. Determinism is required for paper-vs-live comparison in A5.

### A4.3 — Risk layer

Build `trading/live/risk.py`. **This is the most important module in the entire phase.**

Hard rules enforced before any order is placed:
1. **Position size cap:** no single position exceeds 5% of current equity. If portfolio construction proposes more, the risk layer truncates.
2. **Sector cap:** no sector exceeds 25% of gross exposure. Sectors via the existing ticker→sector mapping.
3. **Gross exposure cap:** total |long| + |short| ≤ 100% of equity. No leverage in this phase.
4. **Concentration cap:** no more than 30% of gross in any single name's correlated cluster (use Pulse's value-chain neighborhoods as a proxy for correlation clusters).
5. **Daily loss circuit breaker:** if today's P&L < −2% of equity, halt new entries until next session. Existing positions can still close.
6. **Drawdown kill switch:** if current equity < 0.80 × peak equity (20% drawdown from peak), halt all trading. Set a `system_halted = True` flag in a `system_state` table. The system requires explicit human reset to resume.
7. **Order sanity checks:** reject any order whose notional > 10% of the ticker's recent average daily volume. Reject any order on a ticker not in Pulse's tracked watchlist. Reject any order during the first 5 minutes after market open or last 5 minutes before close (worst slippage windows).

The risk layer reads a config file `trading/config/risk_limits.yaml`. The config is the only place limits are specified. **Do not hardcode limits inline anywhere else.**

Every risk-layer veto is logged to `risk_events` table with full context (which order, why blocked, system state at the time).

### A4.4 — Execution layer (Alpaca paper)

Build `trading/live/executor.py` using `alpaca-py` SDK against the paper endpoint.

Responsibilities:
1. Read `target_positions` and current paper-account positions. Compute deltas.
2. For each delta, build an order. Use limit orders with limits set 5bps inside the current bid/ask (don't pay full spread); fall back to market if not filled within 30 seconds.
3. Submit orders via Alpaca paper API.
4. Persist every order request and every fill response to `orders` and `fills` tables.
5. Reconcile target vs. actual positions at end of day. Log discrepancies.

Authenticate to Alpaca via env vars (`APCA_API_KEY_ID`, `APCA_API_SECRET_KEY`, `APCA_API_BASE_URL=https://paper-api.alpaca.markets`). **Never commit credentials.** Add `.env` to `.gitignore`.

The executor must be re-startable after a crash without double-trading. Idempotency keys on order submission.

### A4.5 — Evaluation layer

Build `trading/live/evaluation.py`.

Daily after market close:
1. Compute realized P&L per position.
2. Compute attribution: how much P&L came from each signal, each ticker, each sector.
3. Compute factor exposures (regression of recent returns vs. SPY/QQQ/IWM/MTUM/VLUE/USMV from A2).
4. Compute prediction calibration: bucket predictions by magnitude, compute realized return per bucket.
5. Persist to `daily_pnl`, `attribution`, `factor_exposure`, `calibration` tables.

Weekly (Sunday):
1. Roll up daily P&L into weekly metrics.
2. Compute Sharpe (annualized), max drawdown, hit rate, turnover, average winner / loser size.
3. Compare against A2 backtest expectations. Flag if more than 1.5σ off on any major metric.

### A4.6 — Pulse dashboard integration

Add a "Trading" section to the existing Pulse UI showing:
- Current portfolio (positions, P&L).
- Recent signals fired vs. acted upon vs. blocked by risk layer.
- Daily P&L chart, equity curve.
- Weekly metrics panel.
- Factor exposure heatmap.
- Recent risk events.

Read-only. The dashboard is for monitoring, not control. No "manual override" buttons in this phase.

### A4.7 — The 90-day run

Once the above is built and smoke-tested for a week:
1. Set the system running. Connect to live news feeds. Run portfolio rebalancing on schedule.
2. **Do not modify any code, model, or risk parameter for 90 days** unless a critical bug emerges. "Critical bug" means: data corruption, runaway position, system crash. It does not mean: drawdown, performance disappointment, or "this signal didn't work like I expected."
3. Monitor daily via the dashboard. Log surprises but do not act on them.
4. After 90 days, freeze the data. Run final evaluation. Write up the result.

---

## Acceptance criteria (the gate)

**Pass (proceed to A5):**
- 90 days completed with no operational incidents (no missed signals due to crashes, no double-fills, no runaway positions, no hardcoded-limit overrides).
- Net Sharpe within 0.5 of A2 backtest expectation (e.g., if A2 said 1.2, paper should be ≥ 0.7).
- Max drawdown < 15%.
- Risk layer fired vetoes on at least some attempted orders (proves it works in production, not that you're trading recklessly).
- Factor regression confirms paper alpha is in the same neighborhood as backtest alpha.

**Marginal:** 1-2 minor operational incidents that are clearly bugs (not strategy issues). Diagnose, fix, and run another 30 days. Do not advance to A5 with known bugs in the execution path.

**Fail (do not proceed to A5):**
- Any uncontrolled-position incident.
- Net Sharpe drops more than 50% from backtest (e.g., backtest 1.2, paper 0.4 or below).
- Drawdown exceeds 15%.
- Risk layer never fires (means it's broken — your strategy will hit one of those limits eventually, and if it never has, the layer isn't being exercised).

If you fail, the right action is usually to investigate the slippage/timing model in the backtest. Live data has lags and queue effects that backtest cost models often underestimate. Iterate on A2's cost assumptions, retrain if necessary, and re-do A4.

---

## Hard constraints

- **Risk layer is non-negotiable.** It cannot be disabled, bypassed, or overridden. If you find yourself wanting to disable it during the 90-day run because it's blocking trades you "know" are fine, you've identified a calibration issue — solve it by changing the config, document the change with reasoning, and reset the 90-day clock.
- **Frozen model.** Do not retrain, fine-tune, or "tweak" the signal model during paper trading. The point of paper is to evaluate the model from A2/A3, not to iterate on it.
- **Frozen everything during 90-day run.** No code changes (except critical bug fixes), no parameter changes, no new features. The clock resets if you change anything substantive.
- **Identical code path principle.** The code that runs in paper trading is the same code that will run in A5/A6 with real money. No "we'll add risk checks later." No "this is just for paper." The only difference between A4 and A5 is the broker API endpoint and account credentials.
- **No telemetry to external services.** Pulse is local-first; preserve that. Logs stay local.
- **One broker, one venue.** Alpaca paper. Don't simultaneously evaluate IBKR paper "for comparison." That's two integrations to maintain.
- **Don't add monitoring tools beyond what already exists in Pulse.** No Datadog, no Grafana, no Sentry. The Pulse dashboard plus local SQLite logs is sufficient at this scale.

## Deliverables

1. All modules in `trading/live/` as specified above.
2. `trading/config/risk_limits.yaml` — versioned, documented config.
3. New SQLite tables: `signals`, `target_positions`, `orders`, `fills`, `daily_pnl`, `attribution`, `factor_exposure`, `calibration`, `risk_events`, `system_state`.
4. Pulse dashboard "Trading" section.
5. 90 days of populated data.
6. `reports/a4_paper_results.md` with full statistical write-up.
7. `PHASE_A4_RESULT.md`: pass/marginal/fail, specific numbers vs. A2 expectations, recommended next step.

When you finish (after 90+ days), do not auto-proceed to Phase A5. Stop and surface the result for human go/no-go.
