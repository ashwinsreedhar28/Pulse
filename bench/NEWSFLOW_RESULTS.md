# Experiment 1: next-day news volume (GDELT)

Generated 2026-10-21T00:32 by bench/timestral_newsflow.py.

Data: bench/data/gkg_daily_v2.csv | 75 tickers | 2017-01-01..2026-10-20 UTC days | all languages | 42 missing/partial-outage days set to NaN.
Origins: 168 (2025-03-04..2026-10-20: every 5 days plus every day of the last 60), one step ahead, context <= 1024 days, covariate: day of week (known-future categorical). No earnings/holiday covariates (no history before 2026 in pulse.db).
Timing (M1 Pro, 8 threads): timestral_28M 304s, timestral_209M 1472s

## Gate: Timestral beats seasonal naive (plan) and empirical 28-day quantiles (binding) on CRPS

- timestral_28M: CRPS ratio 0.523 vs seasonal naive, pooled skill +0.537, tickers 74/0 (sign p 1.1e-22) -> PASS
- timestral_209M: CRPS ratio 0.525 vs seasonal naive, pooled skill +0.535, tickers 74/0 (sign p 1.1e-22) -> PASS
- timestral_28M vs empirical_28d (paired): CRPS ratio 0.902, tickers 69/6 (sign p 1.2e-14), pooled skill +0.330, ticker-days 6602/5548 -> PASS
- timestral_209M vs empirical_28d (paired): CRPS ratio 0.953, tickers 69/6 (sign p 1.2e-14), pooled skill +0.327, ticker-days 6429/5721 -> PASS
- empirical_28d vs seasonal naive, for reference: ratio 0.591.

### All tickers (75 tickers, 12150 ticker-days)

| method | CRPS ratio vs SN (geo mean) | tickers won/lost | sign p | pooled skill vs SN | ticker-days won/lost | sign p | MASE (median) | 10-90 coverage | y >= q90 rate |
|---|---|---|---|---|---|---|---|---|---|
| timestral_28M | 0.523 | 74/0 | 1.1e-22 | +0.537 | 6873/5277 | 1.4e-47 | 0.595 | 0.836 | 0.092 |
| timestral_209M | 0.525 | 74/0 | 1.1e-22 | +0.535 | 6836/5314 | 2e-43 | 0.597 | 0.854 | 0.088 |
| seasonal_naive | 1.000 | 0/0 | nan | +0.000 | 0/0 | nan | 0.890 | nan | nan |
| mean_7d | 0.902 | 64/10 | 9e-11 | +0.061 | 5173/5398 | 0.029 | 0.803 | nan | nan |
| empirical_28d | 0.591 | 74/0 | 1.1e-22 | +0.310 | 6327/5366 | 6.5e-19 | 0.661 | 0.855 | 0.217 |

### Covered (>= 5 articles/day, 365 days before the first origin) (24 tickers, 3888 ticker-days)

| method | CRPS ratio vs SN (geo mean) | tickers won/lost | sign p | pooled skill vs SN | ticker-days won/lost | sign p | MASE (median) | 10-90 coverage | y >= q90 rate |
|---|---|---|---|---|---|---|---|---|---|
| timestral_28M | 0.498 | 24/0 | 1.2e-07 | +0.544 | 2873/1015 | 5.5e-203 | 0.627 | 0.812 | 0.095 |
| timestral_209M | 0.503 | 24/0 | 1.2e-07 | +0.542 | 2838/1050 | 1.6e-187 | 0.633 | 0.819 | 0.091 |
| seasonal_naive | 1.000 | 0/0 | nan | +0.000 | 0/0 | nan | 0.967 | nan | nan |
| mean_7d | 0.891 | 21/3 | 0.00028 | +0.058 | 1974/1861 | 0.071 | 0.862 | nan | nan |
| empirical_28d | 0.640 | 24/0 | 1.2e-07 | +0.303 | 2444/1444 | 2.1e-58 | 0.795 | 0.766 | 0.132 |

### Sparse (< 5 articles/day) (51 tickers, 8262 ticker-days)

| method | CRPS ratio vs SN (geo mean) | tickers won/lost | sign p | pooled skill vs SN | ticker-days won/lost | sign p | MASE (median) | 10-90 coverage | y >= q90 rate |
|---|---|---|---|---|---|---|---|---|---|
| timestral_28M | 0.536 | 50/0 | 1.8e-15 | +0.454 | 4000/4262 | 0.0041 | 0.581 | 0.848 | 0.090 |
| timestral_209M | 0.536 | 50/0 | 1.8e-15 | +0.451 | 3998/4264 | 0.0035 | 0.581 | 0.870 | 0.086 |
| seasonal_naive | 1.000 | 0/0 | nan | +0.000 | 0/0 | nan | 0.855 | nan | nan |
| mean_7d | 0.907 | 43/7 | 2.1e-07 | +0.101 | 3199/3537 | 4e-05 | 0.776 | nan | nan |
| empirical_28d | 0.568 | 50/0 | 1.8e-15 | +0.392 | 3883/3922 | 0.67 | 0.606 | 0.896 | 0.256 |

## Surge flag vs gold

Gold-5 articles: 18; (ticker, UTC day) pairs inside the window: 16.

- timestral_28M: flagged 2/16 scored gold-5 days (y >= q90)
- timestral_209M: flagged 1/16 scored gold-5 days (y >= q90)
- empirical_28d: flagged 4/16 scored gold-5 days (y >= q90)

CRPS ratio < 1 and pooled skill > 0 mean better than seasonal naive. 10-90 coverage should be near 0.80 and the q90 exceedance rate near 0.10 for calibrated quantiles.
