# Experiment 5: price levels. Does Timestral forecast the close itself better than a random walk?

Pre-registered 2026-10-21 ~16:40 ET, before any Experiment 5 forecast was run (Experiment 4's dev run
was in progress and unread). Frozen text is everything above the line "## Deviations"; its sha256 is
recorded in the Runpod project's pulse-timestral-plan.md. Changes after freezing go under "Deviations".

## Why

Experiments 2 and 3 fed Timestral the daily RETURN series and found no edge on signed returns or
direction (hit rate 49-52%, below always-up; range no better than EWMA). A foundation model given the
log PRICE series sees the level, trend and mean-reversion structure that a return series hides. This is
the one untested route to a literal price-point forecast, so it gets its own test rather than an
assumption either way. The app currently shows an EWMA random-walk fan; an arm that passes at a horizon
replaces it at that horizon.

## Data, universe, windows, look-ahead

As PREREG_EXP4.md (same frozen prices_daily.csv, earnings_calendar.csv, gkg_daily_v2.csv ticker list;
same universe rule; dev every 5th trading day 2023-01-03..2024-12-31; holdout every 5th trading day
2025-01-02..2026-04-21, scored once; same disclosure about Experiment 2's dev overlap from 2025-04-24).
A forecast made at origin t uses closes through t-1 and known covariates through t+4.

## Target and scoring

- Target: 100 * ln(close) on days t, t+1, ..., t+4 (horizons h = 1..5), i.e. the cumulative log return
  from t-1 in percent plus a constant. CRPS at each horizon from the 21 quantiles; per-ticker mean over
  origins; across tickers the geometric mean ratio, sign test and pooled skill as before.
- Baseline per horizon: Gaussian random walk centred on 100 * ln(close_{t-1}) with variance h * sigma2,
  sigma2 the EWMA(0.94) variance at the origin (as Experiments 2-4).
- Direction per horizon: hit rate of sign(median_h - ln close_{t-1}) against the realised sign, with the
  always-up rate on the same ticker-days; mean daily rank IC of (median_h - ln close_{t-1}) against the
  realised cumulative return, with its t-stat.
- Calibration: 10-90 coverage and y >= q90 rate per arm and horizon.

## Arms (all with day of week categorical and the earnings known covariates of Experiment 4's base B)

- L28: Timestral-28M on 100 * ln(close), context 1024, prediction_length 5.
- R28: Timestral-28M on the raw close (the model's own scaling), quantiles mapped to 100 * ln.
- L209: Timestral-209M on 100 * ln(close), context 1024.

## Gates (decided before the run)

Arm vs the random-walk baseline, paired, per horizon: pass = ratio < 1 and sign p < alpha,
alpha = 0.05 / 15 (3 arms x 5 horizons). Direction is reported, not gated: a hit rate is only called
evidence if its binomial p against the always-up rate (not 0.5) is below the same alpha.
Expected: ties at every horizon; the pre-registered prior is that price levels carry no more
forecastable signal than returns at daily resolution. A pass at any horizon switches the app's fan to
that arm at that horizon; direction is never shown unless its gate above is met on the holdout.

## Deviations

(none yet)
