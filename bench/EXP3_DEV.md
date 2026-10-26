# Experiment 3 results (dev)

Generated 2026-10-21T13:40 by bench/timestral_exp3.py, implementing bench/PREREG_EXP3.md (frozen sha256 49548560a4eb...). Inputs hash-checked.

Universe: 65 tickers. Excluded: ALAB (0 trading days before the holdout), ARM (0 trading days before the holdout), ATEYY (no Nasdaq history), COHR (80 trading days before the holdout), CRDO (234 trading days before the holdout), CRWV (0 trading days before the holdout), LIN (0 trading days before the holdout), QRVO (no Nasdaq history), SNDK (0 trading days before the holdout), SPCX (0 trading days before the holdout).
Origins: 26 (2022-01-03..2022-12-30). Run time 1901s.
Covariate availability at the origins: tone 59%, abn tone 56%, polarity 59%, news surprise 100%, Jev n>=4 100%, Jev max 29%
Earnings-window days among scored ticker-days: 3.6%.

## Gates (arm vs M0, paired; pass = ratio < 1 and sign p < 0.0042)

- T1_lnV MT: ratio 1.0029, tickers 35/30 (p 0.62), pooled skill -0.0025 -> FAIL
- T1_lnV ME: ratio 0.9760, tickers 52/13 (p 1.2e-06), pooled skill +0.0224 -> PASS
- T1_lnV MS: ratio 1.0011, tickers 34/31 (p 0.8), pooled skill -0.0015 -> FAIL
- T1_lnV MJ: ratio 1.0025, tickers 35/30 (p 0.62), pooled skill -0.0027 -> FAIL
- T2_absr MT: ratio 1.0030, tickers 34/31 (p 0.8), pooled skill -0.0028 -> FAIL
- T2_absr ME: ratio 1.0000, tickers 20/45 (p 0.0026), pooled skill -0.0004 -> FAIL
- T2_absr MS: ratio 0.9998, tickers 30/35 (p 0.62), pooled skill +0.0004 -> FAIL
- T2_absr MJ: ratio 0.9976, tickers 40/25 (p 0.082), pooled skill +0.0022 -> FAIL
- T3_r MT: ratio 1.0058, tickers 24/41 (p 0.046), pooled skill -0.0065 -> FAIL
- T3_r ME: ratio 1.0002, tickers 30/35 (p 0.62), pooled skill -0.0011 -> FAIL
- T3_r MS: ratio 1.0043, tickers 27/38 (p 0.21), pooled skill -0.0048 -> FAIL
- T3_r MJ: ratio 1.0020, tickers 31/34 (p 0.8), pooled skill -0.0022 -> FAIL

## All comparisons

| target | method | vs | ratio | tickers won/lost | sign p | pooled skill | ticker-days | 10-90 cov | y>=q90 |
|---|---|---|---|---|---|---|---|---|---|
| T1_lnV | M0 | empirical60* | 0.8369 | 63/2 | 1.2e-16 | +0.1677 | 1690 | 0.811 | 0.091 |
| T1_lnV | MT | M0 | 1.0029 | 35/30 | 0.62 | -0.0025 | 1690 | 0.808 | 0.093 |
| T1_lnV | MT | empirical60* | 0.8393 | 60/5 | 4.9e-13 | +0.1657 | 1690 | 0.808 | 0.093 |
| T1_lnV | ME | M0 | 0.9760 | 52/13 | 1.2e-06 | +0.0224 | 1690 | 0.817 | 0.088 |
| T1_lnV | ME | empirical60* | 0.8168 | 63/2 | 1.2e-16 | +0.1864 | 1690 | 0.817 | 0.088 |
| T1_lnV | MS | M0 | 1.0011 | 34/31 | 0.8 | -0.0015 | 1690 | 0.805 | 0.095 |
| T1_lnV | MS | empirical60* | 0.8378 | 62/3 | 2.5e-15 | +0.1665 | 1690 | 0.805 | 0.095 |
| T1_lnV | MJ | M0 | 1.0025 | 35/30 | 0.62 | -0.0027 | 1690 | 0.809 | 0.093 |
| T1_lnV | MJ | empirical60* | 0.8390 | 61/4 | 3.9e-14 | +0.1655 | 1690 | 0.809 | 0.093 |
| T1_lnV | MC | M0 | 0.9982 | 37/28 | 0.32 | +0.0014 | 1690 | 0.804 | 0.098 |
| T1_lnV | MC | empirical60* | 0.8354 | 60/5 | 4.9e-13 | +0.1689 | 1690 | 0.804 | 0.098 |
| T2_absr | M0 | empirical60* | 1.0108 | 22/43 | 0.013 | -0.0117 | 1690 | 0.717 | 0.175 |
| T2_absr | MT | M0 | 1.0030 | 34/31 | 0.8 | -0.0028 | 1690 | 0.713 | 0.179 |
| T2_absr | MT | empirical60* | 1.0138 | 21/44 | 0.0059 | -0.0145 | 1690 | 0.713 | 0.179 |
| T2_absr | ME | M0 | 1.0000 | 20/45 | 0.0026 | -0.0004 | 1690 | 0.714 | 0.185 |
| T2_absr | ME | empirical60* | 1.0108 | 22/43 | 0.013 | -0.0122 | 1690 | 0.714 | 0.185 |
| T2_absr | MS | M0 | 0.9998 | 30/35 | 0.62 | +0.0004 | 1690 | 0.710 | 0.183 |
| T2_absr | MS | empirical60* | 1.0106 | 25/40 | 0.082 | -0.0113 | 1690 | 0.710 | 0.183 |
| T2_absr | MJ | M0 | 0.9976 | 40/25 | 0.082 | +0.0022 | 1690 | 0.715 | 0.180 |
| T2_absr | MJ | empirical60* | 1.0084 | 24/41 | 0.046 | -0.0095 | 1690 | 0.715 | 0.180 |
| T2_absr | MC | M0 | 1.0033 | 30/35 | 0.62 | -0.0031 | 1690 | 0.708 | 0.188 |
| T2_absr | MC | empirical60* | 1.0141 | 22/43 | 0.013 | -0.0149 | 1690 | 0.708 | 0.188 |
| T3_r | M0 | ewma_gauss* | 0.9967 | 34/31 | 0.8 | +0.0032 | 1688 | 0.707 | 0.131 |
| T3_r | MT | M0 | 1.0058 | 24/41 | 0.046 | -0.0065 | 1690 | 0.699 | 0.133 |
| T3_r | MT | ewma_gauss* | 1.0026 | 25/40 | 0.082 | -0.0034 | 1688 | 0.699 | 0.133 |
| T3_r | ME | M0 | 1.0002 | 30/35 | 0.62 | -0.0011 | 1690 | 0.696 | 0.136 |
| T3_r | ME | ewma_gauss* | 0.9970 | 37/28 | 0.32 | +0.0020 | 1688 | 0.696 | 0.136 |
| T3_r | MS | M0 | 1.0043 | 27/38 | 0.21 | -0.0048 | 1690 | 0.698 | 0.136 |
| T3_r | MS | ewma_gauss* | 1.0012 | 33/32 | 1 | -0.0017 | 1688 | 0.698 | 0.136 |
| T3_r | MJ | M0 | 1.0020 | 31/34 | 0.8 | -0.0022 | 1690 | 0.701 | 0.133 |
| T3_r | MJ | ewma_gauss* | 0.9988 | 32/33 | 1 | +0.0010 | 1688 | 0.701 | 0.133 |
| T3_r | MC | M0 | 1.0095 | 21/44 | 0.0059 | -0.0100 | 1690 | 0.686 | 0.140 |
| T3_r | MC | ewma_gauss* | 1.0063 | 22/43 | 0.013 | -0.0070 | 1688 | 0.686 | 0.140 |

## T3 direction (signed return)

| method | hit rate of sign(median) | always-up rate, same days | n | binomial p vs 0.5 | mean daily IC | IC t-stat | days |
|---|---|---|---|---|---|---|---|
| M0 | 0.5134 | 0.5122 | 1685 | 0.28 | +0.0075 | +0.23 | 26 |
| MT | 0.4997 | 0.5122 | 1685 | 1 | -0.0173 | -0.49 | 26 |
| ME | 0.5098 | 0.5122 | 1685 | 0.44 | +0.0047 | +0.13 | 26 |
| MS | 0.5039 | 0.5122 | 1685 | 0.77 | +0.0034 | +0.10 | 26 |
| MJ | 0.5062 | 0.5122 | 1685 | 0.63 | -0.0016 | -0.05 | 26 |
| MC | 0.4938 | 0.5122 | 1685 | 0.63 | -0.0364 | -1.06 | 26 |

Pre-registered expectation: ME helps T1 and T2 clearly; MS helps T1; MT and MJ help T1/T2 a little if at all; T3 ties for every arm. Nulls are reported with the same prominence as positives.
