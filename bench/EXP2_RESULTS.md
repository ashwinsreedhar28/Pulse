# Experiment 2 results (holdout)

Generated 2026-10-21T05:24 by bench/timestral_exp2.py, implementing bench/PREREG_EXP2.md (frozen sha256 de848082a5e3...). Inputs hash-checked.

Universe: 72 tickers. Excluded: ATEYY (no Nasdaq history), QRVO (no Nasdaq history), SPCX (0 trading days before the holdout).
Origins: 126 (2026-04-22..2026-10-20). Tickers with >= 1 linked peer: 69.
Run time: 4799s on 8 threads.

## Gates

- T1_lnV G1 M0 vs empirical60*: ratio 0.785, tickers 72/0 (p 4.2e-22), pooled skill +0.223 -> PASS
- T1_lnV G2 news (M1 vs M0): ratio 1.0105, tickers 24/48 (p 0.0063), pooled skill -0.0105 -> FAIL
- T1_lnV G3 links (M2 vs M0, 69 tickers with peers): ratio 1.0010, tickers 24/45 (p 0.015), pooled skill -0.0009 -> FAIL
- T2_absr G1 M0 vs empirical60*: ratio 0.991, tickers 46/26 (p 0.024), pooled skill +0.009 -> FAIL
- T2_absr G2 news (M1 vs M0): ratio 1.0046, tickers 18/54 (p 2.6e-05), pooled skill -0.0042 -> FAIL
- T2_absr G3 links (M2 vs M0, 69 tickers with peers): ratio 0.9970, tickers 48/21 (p 0.0016), pooled skill +0.0032 -> PASS
- T3_r G1 M0 vs ewma_gauss*: ratio 1.009, tickers 11/61 (p 1.5e-09), pooled skill -0.011 -> FAIL
- T3_r G2 news (M1 vs M0): ratio 1.0034, tickers 21/51 (p 0.00053), pooled skill -0.0034 -> FAIL
- T3_r G3 links (M2 vs M0, 69 tickers with peers): ratio 0.9993, tickers 39/30 (p 0.34), pooled skill +0.0007 -> FAIL

## All comparisons (paired CRPS ratio, geo mean across tickers; < 1 = first method better)

| target | method | vs | ratio | tickers won/lost | sign p | pooled skill | ticker-days | 10-90 cov | y>=q90 |
|---|---|---|---|---|---|---|---|---|---|
| T1_lnV | M0 | empirical60* | 0.7846 | 72/0 | 4.2e-22 | +0.2233 | 9072 | 0.820 | 0.096 |
| T1_lnV | M1 | empirical60* | 0.7929 | 72/0 | 4.2e-22 | +0.2152 | 9072 | 0.792 | 0.114 |
| T1_lnV | M1 | M0 | 1.0105 | 24/48 | 0.0063 | -0.0105 | 9072 | 0.792 | 0.114 |
| T1_lnV | M2 | empirical60* | 0.7854 | 72/0 | 4.2e-22 | +0.2226 | 9072 | 0.825 | 0.094 |
| T1_lnV | M2 | M0 | 1.0010 | 24/45 | 0.015 | -0.0009 | 8694 | 0.825 | 0.094 |
| T1_lnV | M3 | empirical60* | 0.7922 | 72/0 | 4.2e-22 | +0.2159 | 9072 | 0.799 | 0.112 |
| T1_lnV | M3 | M0 | 1.0102 | 22/47 | 0.0035 | -0.0100 | 8694 | 0.799 | 0.112 |
| T1_lnV | naive | empirical60* | 1.2524 | 6/66 | 7.3e-14 | -0.2392 | 9072 | nan | nan |
| T2_absr | M0 | empirical60* | 0.9906 | 46/26 | 0.024 | +0.0092 | 9072 | 0.781 | 0.126 |
| T2_absr | M1 | empirical60* | 0.9951 | 34/38 | 0.72 | +0.0051 | 9072 | 0.758 | 0.144 |
| T2_absr | M1 | M0 | 1.0046 | 18/54 | 2.6e-05 | -0.0042 | 9072 | 0.758 | 0.144 |
| T2_absr | M2 | empirical60* | 0.9877 | 53/19 | 7.6e-05 | +0.0122 | 9072 | 0.783 | 0.126 |
| T2_absr | M2 | M0 | 0.9970 | 48/21 | 0.0016 | +0.0032 | 8694 | 0.783 | 0.126 |
| T2_absr | M3 | empirical60* | 0.9935 | 37/35 | 0.91 | +0.0066 | 9072 | 0.761 | 0.143 |
| T2_absr | M3 | M0 | 1.0030 | 25/44 | 0.029 | -0.0027 | 8694 | 0.761 | 0.143 |
| T2_absr | ewma_point | empirical60* | 1.4188 | 0/72 | 4.2e-22 | -0.4164 | 9072 | nan | nan |
| T3_r | M0 | ewma_gauss* | 1.0095 | 11/61 | 1.5e-09 | -0.0108 | 9072 | 0.758 | 0.111 |
| T3_r | M1 | ewma_gauss* | 1.0129 | 12/60 | 8.1e-09 | -0.0143 | 9072 | 0.740 | 0.116 |
| T3_r | M1 | M0 | 1.0034 | 21/51 | 0.00053 | -0.0034 | 9072 | 0.740 | 0.116 |
| T3_r | M2 | ewma_gauss* | 1.0088 | 12/60 | 8.1e-09 | -0.0101 | 9072 | 0.755 | 0.112 |
| T3_r | M2 | M0 | 0.9993 | 39/30 | 0.34 | +0.0007 | 8694 | 0.755 | 0.112 |
| T3_r | M3 | ewma_gauss* | 1.0111 | 14/58 | 1.6e-07 | -0.0124 | 9072 | 0.742 | 0.116 |
| T3_r | M3 | M0 | 1.0014 | 26/43 | 0.053 | -0.0014 | 8694 | 0.742 | 0.116 |
| T3_r | random_walk | ewma_gauss* | 1.3544 | 0/72 | 4.2e-22 | -0.3568 | 9072 | nan | nan |
| T3_r | hist_sim250 | ewma_gauss* | 1.0185 | 5/67 | 6.4e-15 | -0.0204 | 9072 | 0.708 | 0.130 |

## T3 direction (signed return)

| method | hit rate of sign(median) | always-up rate, same days (deviation 2) | n | binomial p vs 0.5 | mean daily IC | IC t-stat | days |
|---|---|---|---|---|---|---|---|
| M0 | 0.4915 | 0.4991 | 9064 | 0.11 | -0.0221 | -1.23 | 126 |
| M1 | 0.4957 | 0.4991 | 9064 | 0.42 | -0.0162 | -0.93 | 126 |
| M2 | 0.4862 | 0.4991 | 9064 | 0.0089 | -0.0262 | -1.38 | 126 |
| M3 | 0.4939 | 0.4991 | 9064 | 0.25 | -0.0196 | -1.07 | 126 |
| hist_sim250 | 0.5005 | 0.4987 | 9033 | 0.93 | -0.0090 | -0.37 | 126 |

Pre-registered expectation: T1 passes G1, T2 probably, T3 ties (hit rate ~50%, IC ~0). Nulls are reported with the same prominence as positives.
