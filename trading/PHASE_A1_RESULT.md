# Phase A1 — signal-existence proof: RESULT

**Verdict: MARGINAL — a real differential appears, but the calendar span is
far too short to call it. Do not proceed to A2 on this evidence.**

Generated 2026-09-07. Regenerate with `trading/scripts/a1_signal_check.py`.

## What was measured

3,693 (article, ticker) events over 75 symbols, 4,964 forward-return
observations at 1d and 5d horizons, excess of a sector-ETF benchmark.

## The headline number

| | 5-day excess return |
|---|---|
| Random non-event days (placebo) | **+1.33%** |
| News days, urgency 3, strong mention | **−1.59%** |

A ~2.9 percentage-point spread, opposite in sign. Stocks in this universe beat
their sector benchmark on ordinary days and underperform it on days they are in
the news. The effect persists on first-mentions only (−1.56%, t=−5.04), so it is
not an artefact of repeat coverage.

## Why this is not a PASS

The mechanical gate in the brief (|t| > 2.5, N > 200) is satisfied. It should
not be believed, for three reasons found while building this:

1. **Calendar span.** 82 distinct event days is roughly 16 non-overlapping
   5-day windows. Nominal N of 403 wildly overstates the real degrees of
   freedom, and cross-sectional breadth does not rescue it — the universe is
   one heavily-correlated sector, so symbols are not independent draws either.
   The gate now caps at MARGINAL below 250 event days.

2. **Clustering was doing most of the work.** Before collapsing to one
   observation per (symbol, day), t-statistics reached −8.6. Several articles
   about one ticker on one day share an identical forward return, so counting
   them separately counts one observation many times. After clustering, the 1d
   urgency-5 and 1d urgency-1 results lost significance entirely.

3. **The first run was a benchmark bug.** `tickers.sector` holds Pulse's own
   taxonomy ("Semiconductors", "semi"), not GICS names. The initial ETF map
   keyed on GICS, matched almost nothing, and silently benchmarked all 40
   semiconductor names against SPY — manufacturing a confident, entirely
   spurious PASS. Semis now map to SOXX.

## What is genuinely encouraging

The placebo control is what makes the surviving result interesting. Had the
effect been a level shift, the placebo would have reproduced it; instead the
placebo has the opposite sign. That is the shape a real conditional effect has.

It is also economically plausible — negative-news bias in coverage, and the
attention literature both predict it — which is a reason to keep measuring, not
a reason to believe it yet.

## Blockers to a real verdict

- **Corpus length.** This is the binding constraint. `articles_archive`
  (migration v54) is what makes a growing window possible at all; before it,
  the 30-day purge meant the sample could never exceed a month. Re-run once
  the archive spans a year.
- **Universe concentration.** 75 symbols, overwhelmingly semiconductors. Any
  finding here is a statement about one sector in one regime.
- **Intraday horizons.** 1h/4h are unmeasured. They need 1-minute bars, which
  Yahoo only serves ~30 days back — `market_bars` (v55) now captures them
  live, so this becomes possible going forward and never retroactively.
- **No costs.** These are gross excess returns. Spread, commission and impact
  are not modelled, and a −1.6% signal is not a −1.6% strategy.

## Recommended next step

Do **not** start A2. Let the archive accumulate, re-run quarterly, and watch
whether the spread holds as the calendar grows.

Meanwhile the higher-value target is the one this data is unusually good for:
**SEC 8-K event studies.** `filedAt` is a legally exact timestamp, which
sidesteps the entire pubDate-reliability problem A1.1 exists to measure, and
all 39,305 retained 8-Ks carry item codes (2.02 earnings, 5.02 executive
departure, 1.01 material agreement). Combined with the 881 supplier/competitor
edges in `graph_edge_overrides`, that supports the genuinely differentiated
test — whether a supplier's 8-K predicts its customer's return — which is a
published anomaly Pulse holds rare private data for.
