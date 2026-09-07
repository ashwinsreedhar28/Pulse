# Phase A5: Tiny Live

**Precondition:** Phase A4 passed cleanly. 90+ days of paper trading completed without operational incident, performance tracked the A2 backtest within tolerance, and the risk layer demonstrably fired and contained things appropriately.

**Goal:** Cross the paper-to-live gap with the smallest possible capital exposure. Demonstrate that real fills, real slippage, and real broker behavior match the paper environment within statistical tolerance. The deliverable is 30+ live trades plus a divergence analysis.

**Budget:** 2-3 months. ~$2-5K capital at risk (with hard cap at total loss of allocated capital). Broker fees only (Alpaca commission-free for stocks).

**Out of scope:** Any change to the model, signal pipeline, risk parameters, or portfolio construction logic vs. what ran in paper. The whole point is to test paper-vs-live divergence holding the strategy constant. If you change the strategy, you've introduced a confound and the result is uninterpretable.

---

## Context

What A4 produced and you're consuming:
- A 90-day paper-trading data set as the comparison baseline.
- Tested code paths for the entire pipeline.
- A risk layer that has demonstrably fired in production conditions.
- Documented expected performance characteristics (Sharpe, hit rate, turnover, average position size, sector exposures).

Regulatory note: Pattern Day Trader rule was eliminated effective June 4, 2026. There is no minimum capital floor for active trading. You can size A5 at any practical level without PDT-flag risk. The new intraday margin framework still applies — it limits leverage based on real-time position risk — but at 1:1 cash trading (which this phase uses) it doesn't constrain anything.

## Tasks

### A5.1 — Live broker integration

Add the live Alpaca endpoint as a config option. Keep paper as the default; live requires an explicit config flag.

```yaml
# trading/config/broker.yaml
mode: paper  # paper | live
paper:
  base_url: https://paper-api.alpaca.markets
live:
  base_url: https://api.alpaca.markets
```

The only code path difference between A4 paper and A5 live should be the URL and credential set. No conditional logic, no "if live then..." branches. Same code, different endpoint.

Fund a live Alpaca brokerage account with $2-5K. Confirm:
- Account is approved for stock trading.
- Margin is **not** enabled (stay on cash account in this phase to sidestep margin complexity).
- Account is funded and settled.

### A5.2 — Position sizing reduction

Modify `trading/config/risk_limits.yaml` (the only place limits live) to reduce sizing 10× from design:
- Position size cap: 0.5% of equity (vs. 5% design).
- Number of positions: 5 long + 5 short (vs. 10+10 design).
- Gross exposure: 50% of equity (vs. 100% design).
- All other limits unchanged.

This means at $5K equity, max position is $25 and gross exposure is $2.5K. Tiny. The point is not to make money in this phase — it's to discover what's different from paper while limiting damage.

Document the sizing reduction in a `reports/a5_sizing_rationale.md` so future-you understands why these numbers, not "production" numbers.

### A5.3 — Run live, log everything

Switch the broker config to live. Fund the account. Set the system running.

The same monitoring, evaluation, and dashboard infrastructure from A4 applies — but now read from the live account. Mark all live data clearly in the database (e.g., `account_type: live` column on all relevant tables) so it's never accidentally pooled with paper data.

Run for at minimum 30 trades or 60 days, whichever takes longer. Do not stop at 30 trades if it's been less than 30 days; do not stop at 60 days if you haven't accumulated 30 trades.

### A5.4 — Manual review of first 10 trades

For the first 10 live trades, spend ~30 minutes per trade reviewing:
- The signal that triggered it (article, predicted return, confidence).
- The order submission path (timing, limit price chosen, fill price actual).
- The slippage experienced vs. the slippage modeled in A2's cost model.
- The exit (was it triggered correctly? did the close-fill happen on time?).
- Any risk-layer interactions.

This is human-in-the-loop QA on the first batch. If anything looks wrong (wrong sign, wrong size, wrong ticker, unexpected risk-layer behavior), halt the system and diagnose before continuing.

After the first 10 trades, you should have high confidence in the basic correctness of the live pipeline. Continue running with passive monitoring.

### A5.5 — Paper-vs-live divergence analysis

Build `trading/analysis/paper_vs_live_divergence.py`.

Continuously, after each trade, log:
- Modeled slippage (from A2 cost assumptions) vs. realized slippage.
- Modeled fill probability vs. actual fill rate (some limit orders won't fill).
- Modeled exit timing vs. actual exit timing (broker latency, queue position).

Aggregate these into a daily divergence report. Track:
- Mean and std of slippage divergence (live − modeled, in bps).
- Fill rate (% of attempted orders that filled vs. timed out).
- Order-to-fill latency distribution.

Compare live performance against paper:
- Did the same signals produce the same direction predictions? (They should — same model.)
- Did the orders match in shape? (They should — same code.)
- Did fills happen at similar prices to paper's simulated fills?
- Where they diverged, by how much?

After 30+ trades, run a statistical test: does live Sharpe match paper Sharpe within 1σ confidence? If not, the cost model in A2 is miscalibrated and needs revision.

---

## Acceptance criteria (the gate)

**Pass (proceed to A5+ scaling consideration, then A6):**
- 30+ live trades completed.
- Live net Sharpe within 1σ of paper net Sharpe over comparable period.
- No operational incidents (incorrect orders, double-fills, runaway positions, missed kill-switch triggers).
- Drawdown < 20% of allocated capital.
- Risk layer fired appropriately in live.
- Realized slippage within 2× of modeled slippage on average.

**Marginal:** Live Sharpe diverges from paper by 1-2σ, OR realized slippage 2-3× modeled. This is a cost-model calibration issue, not a strategy failure. Update A2's cost model to match observed live data, retest the backtest with corrected costs, verify net Sharpe is still positive, then continue A5 for another 30 days. Do not advance to A6 until live performance stabilizes.

**Fail:**
- Any uncontrolled-position incident.
- Drawdown > 20% of allocated.
- Live Sharpe diverges from paper by > 2σ.
- Realized slippage > 3× modeled (means the strategy isn't viable at retail-cost structures).

If you fail, the most likely cause is that A2's cost model was optimistic. The correct response is to revise costs upward, re-run the A2 backtest with realistic-now costs, and see if the strategy still has alpha. If it doesn't, halt the project — you've discovered the strategy works in theory but not at the cost structure available to a single retail trader.

---

## Hard constraints

- **Same code path as paper.** No live-only branches. No "let's tweak this for live." If you discover something needs to be different in live, it needed to be different in paper too — fix the paper code, re-test in paper, then move to live.
- **No model retraining during this phase.** The frozen artifact from A2/A3 is what's being evaluated. If it stops working, that's data — don't paper over it by retraining mid-experiment.
- **Cash account only.** No margin, no shorting (yes, this means the long-short backtest from A2 partially can't run live in this phase — long-only for A5). Document the long-only restriction; if the backtest result was driven by the short side, this phase will reveal it.
- **Hard kill at -20% allocated.** The risk-layer drawdown switch kicks in at 20% from peak equity. With $5K allocated and peak equity at funding, that's a $1K hard floor. Below that, the system halts and the human reviews.
- **Don't add to the position size cap during this phase.** The 10× reduction stays in place for the entire phase, even if performance is excellent. Phase A6 is when sizing scales up.
- **Tax-aware logging.** Log every trade with sufficient detail to reconstruct cost basis for tax purposes (acquisition date, acquisition price, disposal date, disposal price, share count). Wash sales will happen in algo trading; tracking is the only defense.
- **Don't trade options, futures, or anything other than US equities** in this phase. The cost model and risk layer are calibrated for stocks.

## Deliverables

1. Updated `trading/config/broker.yaml` and `trading/config/risk_limits.yaml`.
2. Live Alpaca account funded.
3. New tables tagged with `account_type: live` to separate from paper data.
4. `trading/analysis/paper_vs_live_divergence.py` + daily divergence reports.
5. First-10-trades manual review notes in `reports/a5_first_10_trades_review.md`.
6. After 30+ trades: `reports/a5_paper_live_comparison.md` with statistical comparison.
7. `PHASE_A5_RESULT.md`: pass/marginal/fail, specific numbers, recommendation.

When you finish, do not auto-proceed to Phase A6. Stop, surface results, and require explicit human approval to scale up to design capital.
