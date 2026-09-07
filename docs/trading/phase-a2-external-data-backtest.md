# Phase A2: External Data + First Model + Backtest

**Precondition:** Phase A1 passed. You have at least one statistically detectable signal bucket and you know which feeds carry trustworthy timing.

**Goal:** Validate the A1 result on publication-timestamp-accurate external data, train a first predictive model, and produce a backtest with realistic costs and factor decomposition. The deliverable is a single number — out-of-sample factor-residual Sharpe ratio — and a documented model artifact.

**Budget:** 1-2 months of evening/weekend work. ~$300-1000 in data subscription costs (cancellable after the phase).

**Out of scope:** Anything that talks to a broker, paper or live. No LLM augmentation (that's A3). No portfolio construction logic, no risk layer, no execution code. This phase is about *whether the signal exists in clean data and survives realistic costs*. Nothing more.

---

## Context

What A1 produced and you should leverage:
- `event_study_results` table — historical excess returns by article × ticker × horizon.
- Per-feed timing tier classification.
- A `PHASE_A1_RESULT.md` documenting which (urgency × horizon × cap × tier) buckets have signal.

What you don't have yet and need:
- Publication-timestamp-accurate news beyond Pulse's archive.
- Tick-level or minute-bar prices for accurate forward-return computation around event time.

## Tasks

### A2.1 — External data subscription and ingestion

Subscribe to **Polygon.io Stocks Starter** (~$29/mo prices) **plus News add-on** (~$79/mo as of writing — verify current pricing). If Polygon is unavailable for any reason, fall back to **Tiingo News + Tiingo IEX** (~$30/mo each).

Pull 3 years of historical data:
- News articles with `published_utc`, `tickers`, `title`, `description`, `keywords`, `publisher` for the union of Pulse's 65 active + 400 passive tickers.
- 1-minute OHLCV bars for those same tickers + the 11 sector SPDR ETFs (XLK, XLV, XLF, XLY, XLP, XLE, XLI, XLB, XLU, XLRE, XLC) over the same period.

Store in new tables `polygon_news` and `polygon_bars`. Use bulk loading; the news pull alone will be 100K+ articles.

Build a single resumable ingestion script `trading/ingest/polygon_backfill.py`. It must be safe to interrupt and restart — checkpoint progress.

### A2.2 — A1 replication on Polygon data

Re-run the Phase A1 event-study analysis using `polygon_news.published_utc` as `t0` and `polygon_bars` for forward returns. Same urgency-bucket × horizon × cap-bucket × mention-type design.

You don't have Pulse's urgency scores on Polygon articles yet. Either:
- (a) Match Polygon articles to Pulse articles by URL or near-duplicate title and import urgency scores, or
- (b) Score a sample of Polygon articles using the existing Pulse classifier modules (read-only), or
- (c) Run a single Haiku pass on the Polygon corpus to assign urgency scores. Cost estimate first: at ~$0.25/M input tokens for Haiku, 100K articles × ~500 tokens = $12-15. Cheap enough.

Pick whichever is fastest and document the choice. Sanity check: results on Polygon data should be directionally consistent with A1's Pulse-data result. If they're not, halt — your A1 finding was likely a timestamp artifact, and the backtest below will be invalid.

### A2.3 — Feature engineering

Build `trading/features/build_features.py` that, for each (article, ticker, t0) tuple, computes a feature row. Include candidates from each category below — the model will select what matters.

**Article features:**
- urgency_score, urgency_source
- title_length, body_length, has_numbers (regex)
- ticker_mention_count_in_body
- mention_type (active vs passive)
- value_chain_hop_count (from Pulse's existing chain data — read-only)
- novelty_score: 1 − max cosine similarity to any other article on the same ticker in the prior 24h

**Source features:**
- feed timing_tier
- publisher (one-hot for top 20, "other" otherwise)

**Ticker features (computed at t0, not later):**
- market cap bucket
- 20-day realized volatility
- 5-day return (price momentum)
- 20-day return
- distance-to-earnings (days until next earnings, from Pulse's existing earnings table)
- avg_dollar_volume_30d

**Market features (at t0):**
- VIX level
- SPY 5-day return
- sector SPDR 5-day return for ticker's sector
- time-of-day bucket (pre-market, open, mid-day, close, after-hours)
- day-of-week

Target: `excess_return_4h` (ticker return minus sector SPDR return, 4 hours after t0). Also compute targets at 1h, 1d, 5d for parallel models, but 4h is the primary.

### A2.4 — Model training (walk-forward CV)

Build `trading/models/train_xgb.py`.

**Critical constraints on the training procedure:**
- Walk-forward cross-validation, not random k-fold. Train on data up to time T, validate on (T, T+90d], advance T by 90 days, repeat.
- Held-out test set: the most recent 6 months of data, never seen during training or validation.
- All features must be computable using only data available before t0. If a feature could leak forward information (e.g., earnings surprise computed from earnings that haven't happened at t0), exclude it. Audit every feature for this.
- Deduplicate by (ticker, day) using A1's first-mention logic before training. Otherwise the model overfits to repeat-coverage patterns.

Train an XGBoost regressor (or LightGBM — pick one and stick with it) targeting `excess_return_4h`. Tune hyperparameters via grid search on the walk-forward CV, **not** on the held-out test set. Tune ranges:
- max_depth: [3, 5, 7]
- learning_rate: [0.01, 0.05, 0.1]
- n_estimators: [100, 300, 1000] with early stopping
- subsample: [0.7, 0.9, 1.0]
- colsample_bytree: [0.5, 0.7, 0.9]

Pick the config with best validation Sharpe (see A2.5 for definition), retrain on all training+validation data, evaluate on held-out test set ONCE.

Persist the trained model to `trading/models/artifacts/xgb_v1.pkl`. Persist feature importances to `reports/a2_feature_importance.md`.

### A2.5 — Long-short backtest with realistic costs

Build `trading/backtest/run_backtest.py`.

For each day in the held-out test period, at market open:
- Score all articles published in the prior 16 hours (overnight news + intraday yesterday).
- Aggregate to ticker level: each ticker's score = sum of predicted excess returns from articles mentioning it, weighted by 1/(hours since publication + 1).
- Long top 10 tickers by score. Short bottom 10. Equal-weight within each side.
- Hold for 4 hours, then close.

**Cost model — apply in this order, do not omit any:**
1. Commission: $0 (Alpaca-style) for stocks; if using IBKR-style, $0.005/share with $1 minimum.
2. SEC fee: 0.0027% of notional on sells.
3. FINRA TAF: $0.000166/share on sells.
4. Slippage: bid-ask half-spread modeled per liquidity bucket — large cap 2bps, mid cap 8bps, small cap 25bps.
5. Market impact: 0.1 × (order_size / avg_daily_volume) × volatility, capped at 100bps.
6. Borrow cost on shorts: 50bps annualized for hard-to-borrow names (small cap), 25bps for mid, 0 for large. Apply pro-rata.

Track daily P&L, turnover, hit rate, average winner/loser size.

### A2.6 — Factor regression

Build `trading/backtest/factor_regression.py`.

Regress the strategy's daily returns against:
- SPY (market)
- QQQ (tech tilt)
- IWM (small-cap tilt)
- MTUM (momentum factor)
- VLUE (value factor)
- USMV (low-vol factor)

Output:
- Beta to each factor (with t-stats)
- Annualized alpha (intercept × 252)
- Alpha t-stat
- Alpha Sharpe = alpha / residual std × sqrt(252)

The Sharpe of the alpha residual is what matters. A strategy that's just long QQQ in disguise has gross Sharpe but zero alpha Sharpe.

---

## Acceptance criteria (the gate)

**Pass (proceed to A3 or A4):** Held-out test set:
- Gross Sharpe > 1.5
- Net Sharpe (after costs) > 1.0
- Factor-residual alpha Sharpe > 0.5
- Max drawdown in test period < 15%
- Hit rate > 52% on individual position outcomes

**Marginal:** Sharpe metrics in 0.5-1.0 range. Document the issue (capacity-constrained on small caps? signal decays faster than 4h? costs eat too much?) and propose one specific fix to try in an A2.5 sub-iteration. Limit to one iteration; do not infinitely retune.

**Fail (stop):** Net Sharpe < 0.5 OR alpha Sharpe < 0.2 OR in-sample Sharpe is more than 2× out-of-sample (overfit). Stop here. The signal A1 found doesn't survive realistic costs at retail speed. This is a real outcome and the correct action is to halt the project, not to keep tuning.

---

## Hard constraints

- **No look-ahead bias.** Audit every feature. If you can't justify why a feature is computable from data available before t0, exclude it.
- **Walk-forward only.** No random k-fold cross-validation. No shuffling time-series data.
- **Test set is sacred.** Do not iterate on it. One evaluation on the held-out test set, full stop. If you re-evaluate after tuning, the test set is no longer held-out.
- **Costs always.** Never report a Sharpe number without specifying gross vs net.
- **Don't let `urgency_score` dominate features without competition.** If feature importance is >50% on urgency_score alone, the model is basically reproducing the A1 result and you've gained nothing. Add more features and retrain.
- **Don't add new dependencies beyond:** xgboost OR lightgbm (pick one), pandas, numpy, scipy, scikit-learn, statsmodels (for factor regression), polygon-api-client. Anything else, flag for review.
- **One model class.** Don't train XGBoost AND a neural net AND a transformer "to compare." Pick one (XGBoost is recommended), get it working end-to-end, gate on results.

## Deliverables

1. `trading/ingest/polygon_backfill.py` + populated `polygon_news` and `polygon_bars` tables.
2. `trading/features/build_features.py` + populated `features` table.
3. `trading/models/train_xgb.py` + persisted `xgb_v1.pkl` model artifact.
4. `trading/models/artifacts/xgb_v1_metadata.json` — full hyperparameters, training data range, feature list, training/validation/test metrics.
5. `trading/backtest/run_backtest.py` + `backtest_results` table with daily P&L.
6. `trading/backtest/factor_regression.py` + `reports/a2_factor_attribution.md`.
7. `reports/a2_feature_importance.md`.
8. `PHASE_A2_RESULT.md` at repo root: pass/marginal/fail with the specific numbers, plot of equity curve vs. SPY, recommended next step.

When you finish, do not auto-proceed to Phase A3 or A4. Stop and surface the result for human go/no-go.
