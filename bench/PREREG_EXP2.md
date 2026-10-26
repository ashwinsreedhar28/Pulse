# Experiment 2 pre-registration: next-day volume, volatility and return with Timestral

Written 2026-10-21 ~03:20 ET, before any price data was analyzed (prices_daily.csv was being
downloaded; nothing in it has been looked at beyond row counts). Frozen by sha256 recorded in the
Runpod project's pulse-timestral-plan.md. Changes after freezing go in "Deviations" at the bottom,
dated, with the reason; nothing above that line is edited.

## Question
Does Timestral-28M forecast next-trading-day log volume, absolute return and signed return better
than standard baselines, and do news volume (GDELT) or value-chain-linked peers' returns, added as
covariates, improve those forecasts?

## Data (frozen inputs)
- Prices: bench/data/prices_daily.csv from api.nasdaq.com, ~2016-10-21..2026-10-20, split-adjusted
  OHLCV, NOT dividend-adjusted (price returns; ex-dividend days carry a small negative bias).
- News: bench/data/gkg_daily_v2.csv, GDELT GKG org-tag doc counts per ticker per UTC day (v2 patterns).
- Links: bench/data/links_frozen.csv, supplier edges from graph_edge_overrides as of 2026-10-21
  (`from` supplies `to`). Caveat: the graph was built in 2026, so link *selection* uses current
  knowledge for all history (values never do). The holdout is the recent six months, where this
  matters least.
- Benchmarks: SMH (sector), SPY (market), VIX (index level).

## Universe
Held tickers (tickers.isActive = 1 on 2026-10-21) with Nasdaq history and >= 250 trading days before
the holdout start. Benchmarks are covariates only, never targets. The excluded tickers and the final
n are reported.

## Calendar and look-ahead cutoff
- t indexes NYSE trading days in prices_daily.csv. r_t = 100 * ln(C_t / C_{t-1}) (percent log return).
- A forecast for trading day t is made after 20:00 ET on the calendar day before t and before t's
  open. It may use: OHLCV through t-1; peers' and benchmarks' values through t-1; GDELT counts for
  UTC days strictly before the calendar date of t. A UTC day D ends at 20:00 EDT / 19:00 EST on
  calendar day D, so every UTC day before date(t) closes before t's 09:30 ET open. The UTC day of
  date(t) is never used for target t (it contains t's trading hours).
- News on the trading axis: news_t = log1p( sum of GDELT counts over UTC days u with
  date(t-1) <= u <= date(t) - 1 ). For a Monday this covers Friday, Saturday and Sunday UTC days.
  news_t is known before t opens, so it enters as a known-future covariate (context values plus the
  horizon value).
- One step ahead only; no overlapping horizons.

## Targets (in this order)
- T1: ln(V_t), log volume.
- T2: |r_t|, absolute return (volatility proxy).
- T3: r_t, signed return. Price quantiles for display are C_{t-1} * exp(q/100); scoring is on r_t.

## Models (all Timestral-28M, context <= 1024 trading days, symmetric_averaging and clip_nonnegative
at package defaults, day of week as a known-future categorical; nothing tuned)
- M0: target only.
- M1: M0 + news_t (known-future, as above).
- M2: M0 + past-only covariates: equal-weight mean r of linked peers (held tickers that are its
  customers or suppliers, either direction) and r of SMH. Tickers with no held linked peer are left
  out of M2/M3 comparisons (count reported).
- M3: M0 + news + peers + SMH.

## Baselines (binding baseline marked *)
- T1: naive ln V_{t-1}; *empirical quantiles of ln V over the prior 60 trading days.
- T2: *empirical quantiles of |r| over the prior 60 trading days; EWMA sigma * sqrt(2/pi) as a point.
- T3: zero-mean random walk (point 0); historical simulation (empirical quantiles of the prior 250 r);
  *EWMA Gaussian: sigma_t^2 = 0.94 sigma_{t-1}^2 + 0.06 r_{t-1}^2 (seeded with the variance of the
  first 60 days), quantiles of N(0, sigma_t^2).

## Windows
- Holdout: the last 126 trading days on or before 2026-10-20, every day an origin. Scored once.
- Development: the 250 trading days before the holdout, every 5th day. Used only to check the
  pipeline runs (shapes, NaNs, timing). No model, covariate, transform or window choice may change
  because of development scores; bug fixes are allowed and are logged under Deviations.

## Metrics
- CRPS from the 21 quantile levels (trapezoid over 0.01..0.99 of 2x pinball loss; point forecasts
  scored by the same formula with all quantiles equal), as in Experiment 1.
- Per ticker: mean CRPS over holdout days. Across tickers: geometric mean of the per-ticker ratio
  (model / comparator), wins/losses, two-sided sign test. Pooled skill 1 - sum CRPS / sum CRPS_comp.
- Calibration: 10-90 coverage (target 0.80), share of y >= q90 (target 0.10).
- T3 only: directional hit rate of sign(median) on days with median != 0 (binomial test vs 0.5,
  pooled); daily cross-sectional Spearman IC between median and r_t, mean and t-stat across days.

## Decision rules
- G1 forecastability: M0 beats the * baseline on target T_k if the geo-mean CRPS ratio < 1 AND the
  across-ticker sign test p < 0.01.
- G2 news adds: M1 vs M0 (paired, same ticker-days) ratio < 1 AND sign-test p < 0.0083
  (0.05 / 6: 3 targets x 2 covariate arms).
- G3 links add: M2 vs M0, same rule.
- M3 is reported, not gated.
- Expected before running (stated so the write-up can't be fitted to the result): G1 passes for T1,
  probably T2; T3 is near a tie with the EWMA baseline, hit rate within a point or two of 50%, IC
  near 0. News should help T1 and T2 more than T3. Peers might help T3 slightly via lead-lag.
  Null results are reported with the same prominence as positive ones.

## Outputs
bench/timestral_exp2.py (written after this file is frozen), bench/EXP2_RESULTS.md,
bench/data/exp2_pairs.csv.

## Deviations
(none yet)
- 2026-10-21 03:25 ET (data, before any analysis): Nasdaq has no history for ATEYY (OTC ADR),
  QRVO (no rows; likely delisted after the Skyworks merger) or VIX (index not served). VIX was a
  listed benchmark but no model uses it, so no model changes. SPCX has 90 rows (< 250 before the
  holdout) and is excluded by the universe rule. The frozen text above this section is everything
  before the line "## Deviations"; its sha256 is recorded in the project plan.
- 2026-10-21 04:10 ET (after the dev pipeline run, before the holdout): added a descriptive column
  to the T3 direction table, the share of up days among the same scored days ("always up" hit
  rate). The pre-registered binomial test is against 0.5, which a drifting market beats with no
  skill: in dev, M0's 53.5% roughly matched hist_sim250, whose median is the trailing trend. The
  column is context only; no gate, metric, model or window changed. Dev numbers changed nothing
  else.
