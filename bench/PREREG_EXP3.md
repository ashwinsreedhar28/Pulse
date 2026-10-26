# Experiment 3 pre-registration: does news CONTENT improve next-day volume, volatility and return
# forecasts?

Frozen 2026-10-21 ~11:55 ET, BEFORE Experiment 2's holdout results (EXP2_RESULTS.md, written 05:24 ET)
were opened, and before any content covariate was joined to a price outcome. sha256 of the text above
"## Deviations" is recorded in the Runpod project's pulse-timestral-plan.md, with the input hashes.
Experiments 1-2 tested article COUNTS. Ashwin's premise is content: surprise and tone, not amount.
History of the design: PREREG_EXP3_DRAFT.md (kept unchanged as the audit trail).

## Inherited from PREREG_EXP2.md unchanged
Universe (72 tickers), NYSE calendar from SPY, targets T1 ln V, T2 |r|, T3 r (percent log return),
look-ahead cutoff (a forecast for trading day t uses prices through t-1 and GDELT UTC days strictly
before date(t); UTC days date(t-1)..date(t)-1 aggregate onto t), Timestral-28M with context <= 1024
trading days, day of week as a known-future categorical, package defaults, no tuning; CRPS on the 21
levels, per-ticker ratio, geometric mean, two-sided sign test, pooled skill, calibration, the T3
direction table including the always-up base rate (Exp 2 deviation 2).

## Windows (nothing has scored these days before)
- Holdout: every 5th NYSE trading day from 2023-01-03 to 2024-12-31 (~100 origins, weekdays rotate).
  Scored once; the script refuses a second holdout run.
- Development: every 10th trading day of 2022. Pipeline checks only; no choice may change because of
  development scores; bug fixes are logged under Deviations.
- Forward test (secondary, built later): Jev on Pulse's own live corpus (headline + summary, brief v2)
  over trading days after this freeze through 2026-12-31. Its own addendum is frozen before it starts.

## Inputs (sha256 in the plan)
prices_daily.csv, links_frozen.csv (unused here), gkg_daily_v2.csv (counts, for C4), gkg_tone_daily.csv
(GKG V2Tone per ticker-UTC day 2017-2024, n/tone/tone_sd/pos/neg/polarity), gkg_titles.csv (distinct
page titles per ticker-UTC day 2021-2024, cap 30 by FARM_FINGERPRINT, uncapped count kept),
jev_titles.csv (jev-1.13.0 argmax per title; fixture 473ed7df056d, the validity gate's), and
earnings_calendar.csv (api.nasdaq.com calendar, 2017-2026, 73 held symbols, 97.6% of rows
'time-not-supplied'). Extraction cost: 175.4 + 237.0 GB BigQuery; Jev 406,440 calls (~$12.19 list).

## Covariates (all known before t's open; aggregated over UTC days date(t-1)..date(t)-1 unless stated)
- C1 tone: doc-weighted mean tone; abnormal tone = (C1 - trailing mean over the prior 60 trading days)
  / trailing sd over the same days (NaN until 20 of those days exist).
- C2 polarity: doc-weighted mean polarity.
- C3a earnings window: 1 on the report date's trading day and the next trading day, else 0. Known
  ahead (scheduled). Two days because report time is almost never supplied.
- C3b EPS surprise: |surprise %| on the trading day AFTER the report date only, else 0. Public by that
  day's open whatever the report time.
- C4 news surprise: PIT of the trading-axis doc count (gkg_daily_v2, same UTC-day aggregation) under
  Experiment 1's model: Timestral-28M one-step forecast of the daily UTC count series from the prior
  1024 UTC days, DOW categorical, evaluated at the aggregated count (CDF interpolated over the 21
  levels; multi-day windows use the sum of the per-day medians and quantiles as an approximation,
  stated as such). No new fitting.
- C5 Jev materiality (2021-2024; NaN before): per ticker-UTC day over headlines that are
  (i) html-unescaped, (ii) >= 80% ASCII letters, (iii) NAME THE COMPANY: a case-insensitive
  word-boundary match of any of its terms in bench/gdelt_pull.py's Q map, or its symbol as an
  exchange-prefixed form "(NASDAQ:SYM)", "NYSE: SYM" etc., or a cashtag "$SYM". Rule (iii) was added
  after inspecting 20 smoke-test rows (market roundups that never name the company scored 5) and
  before any outcome was computed. Aggregates: number of headlines scored >= 4, max score, mean score.
  Headlines naming the company but scored on routine filler (13F holdings notes) remain; that is a
  known weakness of headline-only Jev on GDELT's mix, reported, not filtered.

## Models
M0 (as Exp 2). MT = M0 + C1 (both rows) + C2. ME = M0 + C3a + C3b. MS = M0 + C4. MJ = M0 + C5 (3 rows).
MC = all. Every covariate enters as known-future (context values plus the horizon value).

## Decision rules
For each target and each gated arm (MT, ME, MS, MJ) vs M0, paired over the same ticker-days:
geo-mean CRPS ratio < 1 AND across-ticker sign-test p < 0.05/12 = 0.0042. MC reported, not gated.
Also reported, not gated: M0 vs Exp 2's binding baselines on this window.
Expectation stated before running: ME (earnings) helps T1 and T2 clearly; MS helps T1; MT and MJ help
T1/T2 a little if at all; T3 is a tie for every arm (hit rate within a point of always-up, IC ~0).
Nulls are reported with the same prominence as positives.

## Outputs
bench/timestral_exp3.py, bench/EXP3_RESULTS.md (holdout), bench/EXP3_DEV.md, bench/data/exp3_pairs_*.csv.

## Deviations
- 2026-10-21 ~12:35 ET (from a random-weight code check; before any real-model result): the inherited
  universe rule (>= 250 trading days of prices before the holdout start), applied to this holdout
  (2023-01-03), gives 65 tickers, not the 72 stated above, which was Experiment 2's count. The rule is
  the operative definition. Excluded in addition to ATEYY, QRVO and SPCX: ALAB, ARM, CRWV, LIN, SNDK
  (no prices before 2023 under these symbols), COHR (80 days; traded as IIVI before 2022-09) and CRDO
  (234 days). No model, covariate, window or metric changed.
