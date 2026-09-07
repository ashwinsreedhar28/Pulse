# Phase A6: Scaled Live (Ongoing)

**Precondition:** Phase A5 passed. Live performance tracked paper within statistical tolerance over 30+ trades, the cost model is calibrated to live reality, and operational incidents have been zero.

**Goal:** Run the strategy at design capital and design sizing, with full risk discipline, indefinitely. The phase has no end date; it ends when one of: (a) a kill condition is triggered, (b) you decide to halt for non-system reasons, or (c) the strategy decays below acceptance criteria over a documented review period.

**Budget:** Design capital — your call, given the friend asked about $25K but the actual amount is yours to set. Broker fees only. Optional: Polygon news streaming subscription (~$80/mo) if not already in place.

**Out of scope:** Adding new instruments (options, futures, crypto, international). Adding new model classes. Substantially restructuring the strategy. Each of those is a separate Phase B-something that requires its own gate.

---

## Context

What's coming in:
- Calibrated signal pipeline + cost model.
- Tested execution and risk infrastructure.
- 90 days paper + 30+ trades live track record.
- A clear understanding of paper-vs-live divergence and how it's calibrated.

What's new in this phase:
- Real money at design size, not 10×-reduced size.
- Long *and* short (margin account enabled).
- Ongoing operation rather than fixed-duration evaluation.

## Tasks

### A6.1 — Scale up

Update `trading/config/risk_limits.yaml` from A5's reduced parameters to design parameters:
- Position size cap: 5% of equity.
- Number of positions: 10 long + 10 short.
- Gross exposure: 100% of equity.
- All circuit breakers retained at A4-design levels (2% daily loss, 20% drawdown kill).

Fund the live Alpaca account to design capital. Enable margin (Reg-T margin account, not portfolio margin — portfolio margin requires $100K+ and isn't relevant here).

If scaling up beyond ~$50K equity, evaluate migrating from Alpaca to Interactive Brokers for better fills on small/mid caps. This is a separate sub-project; do not undertake it during the initial scale-up.

### A6.2 — Run with full risk layer

Same code as A5, sizing changed via config only. Run continuously.

The risk layer is doing the most work in this phase. Verify daily that:
- Position size cap enforces correctly at the new equity level.
- Daily loss circuit breaker triggers correctly when applicable.
- Drawdown kill switch triggers correctly.
- Sector caps are respected.

### A6.3 — Monthly review cadence

On the first business day of each month, run `trading/analysis/monthly_review.py`:

1. **Performance:** month-to-date and trailing 3-month Sharpe, max drawdown, hit rate, turnover.
2. **Factor decomposition:** regress monthly returns vs. SPY/QQQ/IWM/MTUM/VLUE/USMV. Compute alpha and alpha t-stat.
3. **Attribution:** P&L by signal source, by ticker, by sector, by time-of-day.
4. **Drift detection:** compare current-month feature distributions vs. training-period distributions. If KL divergence > threshold on any feature, flag as potential model drift.
5. **Cost reconciliation:** realized slippage and commissions vs. modeled. Update A2's cost model if drift is consistent.
6. **Tax accrual:** running estimate of short-term capital gains tax liability, segregated by lot.

Output to `reports/monthly_YYYY_MM.md`. The dashboard surfaces a "current month" view derived from this.

### A6.4 — Quarterly model review

Every 3 months, evaluate whether the model is decaying:

1. Run the held-out test set evaluation again on the most recent 3 months of data (which is now "out-of-sample" relative to original training).
2. Compare predicted vs. realized at the same horizon.
3. Compute the decay: how does current-period prediction quality compare to original test-period?

If decay is mild (Sharpe drop < 30% from original), continue running.
If decay is severe (Sharpe drop > 50%), halt and consider retraining (which is a Phase B task — write a brief and gate it like A2).

Do not casually retrain. Retraining mid-flight introduces all the validation problems that walk-forward CV in A2 was designed to prevent.

### A6.5 — Tax-lot tracking and year-end reporting

Use a dedicated tax-lot tracker: TradeLog, GainsKeeper, or a custom implementation. Track:
- Every acquisition lot (date, price, share count, ticker).
- Every disposal (matched against lots via FIFO or specific-lot identification — pick FIFO for simplicity).
- Wash sale detection: any disposal at a loss followed by acquisition of a substantially-identical security within 30 days (in any account, including non-Alpaca accounts you may have).

At year-end, generate a tax report that maps cleanly to Form 8949. Reconcile against Alpaca's 1099-B. Discrepancies must be resolved before tax filing.

Consider engaging a CPA familiar with active trader taxation for the first year. The combination of high trade volume + wash sales + potentially-elective trader status is not something to figure out alone.

---

## Acceptance criteria (the gate — ongoing, not phase-end)

There's no "pass" gate here because the phase doesn't end. Instead, there are **continuance criteria** evaluated monthly:

**Continue running:**
- Trailing 3-month Sharpe > 0.5 (net of costs).
- Trailing 3-month alpha t-stat > 1.0 (i.e., factor-residual alpha is at least somewhat distinguishable from zero).
- Drawdown from peak < 15%.
- No operational incidents.

**Reduce sizing 50%, keep running:**
- Trailing 3-month Sharpe between 0 and 0.5.
- Drawdown 15-20%.
- Investigate: is this strategy decay or just a bad month? Reduce sizing while diagnosing.

**Halt (kill switch, manual review required):**
- Drawdown > 20% from peak (this is the hard kill switch from A4).
- Trailing 3-month Sharpe < 0.
- Trailing 6-month alpha t-stat < 0 (alpha is statistically zero or negative — paying costs for nothing).
- Any operational incident.
- Material market regime change (new monetary regime, structural change in news distribution, etc.) that invalidates the training-period assumptions.

If halted, the next decision is not "restart at smaller size" — it's a full retro. Was this expected drawdown variance? Strategy decay? Regime shift? The retro determines whether to restart, retrain, or shelve.

---

## Hard constraints

- **Hard kill switch at 20% from peak.** Non-negotiable. The kill switch is in code, in the risk layer, and cannot be disabled by a config setting. It can only be reset by deleting a state row in `system_state` table — a deliberate human action.
- **No "just one more trade" overrides.** When the system halts, the system halts. The discipline of stopping is more valuable than any single trade.
- **No daily P&L watching during market hours.** Performance is a monthly metric, not a daily one. Watching minute-by-minute P&L is a known path to discretionary intervention, which destroys the basis for every preceding phase. The dashboard exists for forensics, not for in-flight piloting.
- **No discretionary overrides of the system.** The system either runs or it doesn't. You don't manually open a position because "I read this article and I think it's important." If the model didn't fire, the model didn't fire.
- **No leverage > 1:1 in this phase.** Margin is enabled to allow shorting (which requires a margin account), but gross exposure stays at 100% of equity. Leverage is a separate Phase B with its own gate.
- **No new instruments without a Phase B gate.** Each new instrument class (options, futures, ETFs you weren't trading, international stocks) requires its own design phase, calibration phase, paper-trade phase, and tiny-live phase. The structure here is reusable; the analysis is not skippable.
- **Tax discipline.** Every trade logs with sufficient detail for cost-basis tracking. Year-end reporting reconciles against broker 1099-B.
- **Quarterly model review is not optional.** A decaying model that runs unmonitored is the most expensive failure mode in algo trading. Calendar reminders, not "I'll do it when I have time."

## Deliverables (ongoing)

1. Updated `trading/config/risk_limits.yaml` for design sizing.
2. Live account funded to design capital with margin enabled.
3. `trading/analysis/monthly_review.py` + monthly reports.
4. `trading/analysis/quarterly_model_review.py` + quarterly reports.
5. Tax-lot tracking system + year-end reporting.
6. Continuous `reports/monthly_YYYY_MM.md` with go/no-go decision per the continuance criteria.

There is no `PHASE_A6_RESULT.md`. The phase is open-ended. Each monthly report is a checkpoint with go/no-go on continuing.

When the phase eventually halts (kill switch, decay, regime change, voluntary stop), write a `PHASE_A6_FINAL.md` documenting the full run: total return, Sharpe, max drawdown, lessons, and recommendation for next steps.

---

## Closing note for the system running this

The most common failure of algorithmic trading at this scale is not bad models — it's discipline failure. The temptation to override the system, increase sizing after a winning streak, decrease drawdown limits because a recent drawdown was scary, or tweak the model based on a hunch — these are the failure modes that turn a viable strategy into a disaster. The risk layer is designed to make these temptations expensive: changing limits requires editing a config file, restarting the system, and documenting the rationale. Don't fight the friction. The friction is the strategy.
