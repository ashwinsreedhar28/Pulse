# Experiment 2 results (dev)

Generated 2026-10-21T04:01 by bench/timestral_exp2.py, implementing bench/PREREG_EXP2.md (frozen sha256 de848082a5e3...). Inputs hash-checked.

Universe: 72 tickers. Excluded: ATEYY (no Nasdaq history), QRVO (no Nasdaq history), SPCX (0 trading days before the holdout).
Origins: 50 (2025-04-23..2026-04-15). Tickers with >= 1 linked peer: 69.
Run time: 1960s on 8 threads.

## Gates

- T1_lnV G1 M0 vs empirical60*: ratio 0.843, tickers 71/1 (p 3.1e-20), pooled skill +0.167 -> PASS
- T1_lnV G2 news (M1 vs M0): ratio 1.0112, tickers 24/48 (p 0.0063), pooled skill -0.0103 -> FAIL
- T1_lnV G3 links (M2 vs M0, 69 tickers with peers): ratio 0.9991, tickers 39/30 (p 0.34), pooled skill +0.0011 -> FAIL
- T2_absr G1 M0 vs empirical60*: ratio 0.996, tickers 40/32 (p 0.41), pooled skill +0.004 -> FAIL
- T2_absr G2 news (M1 vs M0): ratio 1.0015, tickers 33/39 (p 0.56), pooled skill -0.0009 -> FAIL
- T2_absr G3 links (M2 vs M0, 69 tickers with peers): ratio 0.9941, tickers 49/20 (p 0.00064), pooled skill +0.0051 -> PASS
- T3_r G1 M0 vs ewma_gauss*: ratio 0.979, tickers 61/11 (p 1.5e-09), pooled skill +0.022 -> PASS
- T3_r G2 news (M1 vs M0): ratio 1.0039, tickers 21/51 (p 0.00053), pooled skill -0.0040 -> FAIL
- T3_r G3 links (M2 vs M0, 69 tickers with peers): ratio 1.0000, tickers 32/37 (p 0.63), pooled skill -0.0002 -> FAIL

## All comparisons (paired CRPS ratio, geo mean across tickers; < 1 = first method better)

| target | method | vs | ratio | tickers won/lost | sign p | pooled skill | ticker-days | 10-90 cov | y>=q90 |
|---|---|---|---|---|---|---|---|---|---|
| T1_lnV | M0 | empirical60* | 0.8433 | 71/1 | 3.1e-20 | +0.1670 | 3597 | 0.819 | 0.098 |
| T1_lnV | M1 | empirical60* | 0.8531 | 71/1 | 3.1e-20 | +0.1579 | 3597 | 0.791 | 0.114 |
| T1_lnV | M1 | M0 | 1.0112 | 24/48 | 0.0063 | -0.0103 | 3600 | 0.791 | 0.114 |
| T1_lnV | M2 | empirical60* | 0.8426 | 70/2 | 1.1e-18 | +0.1677 | 3597 | 0.820 | 0.098 |
| T1_lnV | M2 | M0 | 0.9991 | 39/30 | 0.34 | +0.0011 | 3450 | 0.820 | 0.098 |
| T1_lnV | M3 | empirical60* | 0.8526 | 71/1 | 3.1e-20 | +0.1584 | 3597 | 0.796 | 0.113 |
| T1_lnV | M3 | M0 | 1.0110 | 25/44 | 0.029 | -0.0102 | 3450 | 0.796 | 0.113 |
| T1_lnV | naive | empirical60* | 1.3044 | 3/69 | 2.6e-17 | -0.2875 | 3597 | nan | nan |
| T2_absr | M0 | empirical60* | 0.9959 | 40/32 | 0.41 | +0.0038 | 3597 | 0.780 | 0.121 |
| T2_absr | M1 | empirical60* | 0.9974 | 39/33 | 0.56 | +0.0028 | 3597 | 0.767 | 0.131 |
| T2_absr | M1 | M0 | 1.0015 | 33/39 | 0.56 | -0.0009 | 3600 | 0.767 | 0.131 |
| T2_absr | M2 | empirical60* | 0.9902 | 43/29 | 0.12 | +0.0086 | 3597 | 0.776 | 0.126 |
| T2_absr | M2 | M0 | 0.9941 | 49/20 | 0.00064 | +0.0051 | 3450 | 0.776 | 0.126 |
| T2_absr | M3 | empirical60* | 0.9974 | 41/31 | 0.29 | +0.0024 | 3597 | 0.767 | 0.133 |
| T2_absr | M3 | M0 | 1.0016 | 27/42 | 0.091 | -0.0017 | 3450 | 0.767 | 0.133 |
| T2_absr | ewma_point | empirical60* | 1.5641 | 0/72 | 4.2e-22 | -0.5786 | 3588 | nan | nan |
| T3_r | M0 | ewma_gauss* | 0.9791 | 61/11 | 1.5e-09 | +0.0223 | 3588 | 0.787 | 0.122 |
| T3_r | M1 | ewma_gauss* | 0.9822 | 56/16 | 2.4e-06 | +0.0198 | 3588 | 0.776 | 0.126 |
| T3_r | M1 | M0 | 1.0039 | 21/51 | 0.00053 | -0.0040 | 3600 | 0.776 | 0.126 |
| T3_r | M2 | ewma_gauss* | 0.9791 | 61/11 | 1.5e-09 | +0.0221 | 3588 | 0.779 | 0.126 |
| T3_r | M2 | M0 | 1.0000 | 32/37 | 0.63 | -0.0002 | 3450 | 0.779 | 0.126 |
| T3_r | M3 | ewma_gauss* | 0.9808 | 58/14 | 1.6e-07 | +0.0211 | 3588 | 0.773 | 0.128 |
| T3_r | M3 | M0 | 1.0023 | 26/43 | 0.053 | -0.0024 | 3450 | 0.773 | 0.128 |
| T3_r | random_walk | ewma_gauss* | 1.3232 | 0/72 | 4.2e-22 | -0.3128 | 3588 | nan | nan |
| T3_r | hist_sim250 | ewma_gauss* | 0.9839 | 55/17 | 8.1e-06 | +0.0185 | 3562 | 0.777 | 0.130 |

## T3 direction (signed return)

| method | hit rate of sign(median) | n | binomial p | mean daily IC | IC t-stat | days |
|---|---|---|---|---|---|---|
| M0 | 0.5351 | 3590 | 2.8e-05 | +0.0623 | +2.04 | 50 |
| M1 | 0.5301 | 3590 | 0.00033 | +0.0598 | +2.12 | 50 |
| M2 | 0.5362 | 3590 | 1.5e-05 | +0.0524 | +1.81 | 50 |
| M3 | 0.5251 | 3590 | 0.0028 | +0.0595 | +2.02 | 50 |
| hist_sim250 | 0.5352 | 3513 | 3.3e-05 | +0.0844 | +2.62 | 50 |

Pre-registered expectation: T1 passes G1, T2 probably, T3 ties (hit rate ~50%, IC ~0). Nulls are reported with the same prominence as positives.
