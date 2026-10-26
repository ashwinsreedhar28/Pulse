# Experiment 4: can Timestral itself be made better, and do calendar covariates help?

Pre-registered 2026-10-21 ~16:30 ET, after Experiments 1-3 were scored and before any Experiment 4
forecast was run. Frozen text is everything above the line "## Deviations"; its sha256 is recorded in
the Runpod project's pulse-timestral-plan.md. Changes after freezing go in "Deviations" at the bottom,
with a time stamp and whether they were made before or after a scored run.

## Why

Experiments 2 and 3 found that Timestral-28M forecasts next-day log volume well, roughly ties the
60-day empirical baseline on |return|, and that the only covariate that helped was the earnings window.
Every holdout came out slightly narrow (10-90 coverage 0.76-0.78, q90 exceedance ~0.13). This
experiment tests model-side changes (calibration, context, target transform, multivariate call,
ensembling, blending) and calendar covariates known in advance (linked companies' earnings, options
expiry and rebalances, holiday-adjacent days, FOMC and jobs-report days, the daily high-low range as
a past covariate). Signed return is not a target: it tied in Experiments 2 and 3 three times over, and
the app will keep EWMA for the price range.

## Data (frozen; sha256 checked by the script)

- bench/data/prices_daily.csv: api.nasdaq.com daily OHLCV, split-adjusted, through 2026-10-20.
- bench/data/earnings_calendar.csv: api.nasdaq.com earnings calendar 2017-2026 (date, surprise_pct).
- bench/data/links_frozen.csv: Pulse's supplier edges (fromSymbol supplies toSymbol).
- bench/data/macro_days.csv (built 2026-10-21 before freezing): FOMC statement days 2019-2026 from
  federalreserve.gov (scheduled meetings plus the 2020-03-03 and 2020-03-15 unscheduled decisions;
  notation votes excluded). Jobs-report days are computed in the script by rule: the first Friday of
  each month, moved to the previous trading day when that Friday is not a trading day. CPI days are
  not included (no reliable list in hand). Before 2019 the FOMC flag is NaN (missing), not 0.

## Universe and windows

- Universe: the held tickers of gkg_daily_v2.csv (same list as Experiments 2-3) with Nasdaq history and
  at least 250 trading days before the holdout start. Benchmarks (SPY, QQQ, SMH, SOXX, VIX) are never
  targets.
- Development: every 5th trading day from 2023-01-03 to 2024-12-31. Disclosed: these are the days
  Experiment 3 scored (different arms); they are treated as spent and may be used to pick the one
  tuned parameter below.
- Holdout: every 5th trading day from 2025-01-02 to 2026-04-21, scored once (lock file). Disclosed:
  Experiment 2's development run scored the no-covariate model and its counts/links arms on every 5th
  day from 2025-04-24; none of the arms below were ever run on this window.
- Look-ahead: a forecast for trading day t uses prices through t-1. Known covariates for day t are
  computable from calendars published before t.

## Targets and scoring (as Experiments 2-3)

- T1: log volume on day t. T2: |100 * log return| on day t.
- CRPS from the 21 quantiles. Per ticker: mean CRPS over scored days. Across tickers: geometric mean of
  per-ticker CRPS ratios, sign test on tickers won/lost, pooled skill 1 - sum(CRPS_a)/sum(CRPS_b).
- Calibration: 10-90 coverage and y >= q90 rate, reported for every arm.

## Base configuration and arms

B (base, ships today): Timestral-28M, context 1024, day-of-week categorical known covariate, earnings
known covariates (2-day window flag; |EPS surprise %| on the day after the report). M0 (no covariates)
is reported for reference only.

Model-side arms, each a single change to B:
- RC: trailing recalibration. Quantile deviations from the median are multiplied by one scale s per
  target, chosen from the grid 0.70, 0.75, ..., 2.00 to minimise the pooled mean CRPS of B over the
  previous 24 origins (about 120 trading days), using only outcomes known before the origin. The
  first 24 origins of a window are unscored for RC and are dropped from the RC-vs-B pair. Post-
  processing only; no extra model calls. Both targets.
- X256, X2520: context 256 and 2520 (all history). Both targets.
- MV: one multivariate call forecasting [log volume, |r|] jointly; each component scored on its target.
- MV3: as MV with the Parkinson range ln(high/low) as a third variate (not scored itself).
- SQ (T2 only): forecast sqrt(|r|), invert the quantiles pointwise.
- LG (T2 only): forecast log(|r| + 0.05), invert pointwise.
- E209 (T2 only): quantile-average of Timestral-28M and Timestral-209M, both as B.
- BL (T2 only): quantile pool w * B + (1-w) * empirical60, w chosen on development from
  {0.25, 0.5, 0.75} (the one tuned parameter), fixed for the holdout.

Covariate arms, each added to B's known covariates (PR as a past covariate), both targets:
- PR: Parkinson range ln(high/low) of day t-1 and earlier, past covariate.
- LE: number of companies linked to the ticker (either direction in links_frozen.csv) that are in their
  own 2-day earnings window on day t.
- CAL: flags for monthly options expiry (third Friday), quad witching (third Friday of Mar/Jun/Sep/Dec),
  Russell reconstitution (last Friday of June), holiday-adjacent (the trading day immediately before or
  after a weekday market holiday), and half-day (the weekday before Independence Day, the day after
  Thanksgiving, December 24 on a weekday).
- MAC: FOMC statement day and jobs-report day flags from macro_days.csv.

## Gates (decided before the run)

Arm vs B, paired on the same ticker-days: pass = geometric-mean ratio < 1 and sign-test p < alpha,
alpha = 0.05 / 22 = 0.00227 (22 gates: 9 arms on T1, 13 on T2). Every gate is reported, pass or fail.
Expected: RC passes both targets (the narrowness is consistent across three holdouts); PR and MV help
T2; CAL and LE help T1; SQ/LG, E209, BL and context changes are open questions; MAC small if at all.

## What ships

Each arm that passes on the holdout is switched on in Pulse's per-ticker forecast for that target,
composed additively on B (composition is assumed, not tested; the app logs its live forecasts and
outcomes so the composed configuration gets a forward score). Nothing is switched on from
development scores.

## Deviations

(none yet)
