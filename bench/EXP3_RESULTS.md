# Experiment 3 results (holdout)

Generated 2026-10-21T15:49 by bench/timestral_exp3.py, implementing bench/PREREG_EXP3.md (frozen sha256 49548560a4eb...). Inputs hash-checked.

Universe: 65 tickers. Excluded: ALAB (0 trading days before the holdout), ARM (0 trading days before the holdout), ATEYY (no Nasdaq history), COHR (80 trading days before the holdout), CRDO (234 trading days before the holdout), CRWV (0 trading days before the holdout), LIN (0 trading days before the holdout), QRVO (no Nasdaq history), SNDK (0 trading days before the holdout), SPCX (0 trading days before the holdout).
Origins: 101 (2023-01-03..2024-12-30). Run time 7439s.
Covariate availability at the origins: tone 69%, abn tone 66%, polarity 69%, news surprise 99%, Jev n>=4 100%, Jev max 53%
Earnings-window days among scored ticker-days: 3.9%.

## Gates (arm vs M0, paired; pass = ratio < 1 and sign p < 0.0042)

- T1_lnV MT: ratio 1.0031, tickers 32/33 (p 1), pooled skill -0.0027 -> FAIL
- T1_lnV ME: ratio 0.9825, tickers 52/13 (p 1.2e-06), pooled skill +0.0173 -> PASS
- T1_lnV MS: ratio 0.9998, tickers 35/30 (p 0.62), pooled skill +0.0001 -> FAIL
- T1_lnV MJ: ratio 1.0034, tickers 26/39 (p 0.14), pooled skill -0.0035 -> FAIL
- T2_absr MT: ratio 1.0037, tickers 25/40 (p 0.082), pooled skill -0.0033 -> FAIL
- T2_absr ME: ratio 0.9891, tickers 49/16 (p 5.1e-05), pooled skill +0.0112 -> PASS
- T2_absr MS: ratio 1.0018, tickers 27/38 (p 0.21), pooled skill -0.0019 -> FAIL
- T2_absr MJ: ratio 1.0014, tickers 31/34 (p 0.8), pooled skill -0.0007 -> FAIL
- T3_r MT: ratio 0.9994, tickers 31/34 (p 0.8), pooled skill +0.0009 -> FAIL
- T3_r ME: ratio 0.9981, tickers 42/23 (p 0.025), pooled skill +0.0016 -> FAIL
- T3_r MS: ratio 1.0009, tickers 33/32 (p 1), pooled skill -0.0004 -> FAIL
- T3_r MJ: ratio 1.0016, tickers 28/37 (p 0.32), pooled skill -0.0014 -> FAIL

## All comparisons

| target | method | vs | ratio | tickers won/lost | sign p | pooled skill | ticker-days | 10-90 cov | y>=q90 |
|---|---|---|---|---|---|---|---|---|---|
| T1_lnV | M0 | empirical60* | 0.8330 | 65/0 | 5.4e-20 | +0.1696 | 6565 | 0.779 | 0.132 |
| T1_lnV | MT | M0 | 1.0031 | 32/33 | 1 | -0.0027 | 6565 | 0.770 | 0.137 |
| T1_lnV | MT | empirical60* | 0.8356 | 65/0 | 5.4e-20 | +0.1673 | 6565 | 0.770 | 0.137 |
| T1_lnV | ME | M0 | 0.9825 | 52/13 | 1.2e-06 | +0.0173 | 6565 | 0.780 | 0.133 |
| T1_lnV | ME | empirical60* | 0.8185 | 65/0 | 5.4e-20 | +0.1840 | 6565 | 0.780 | 0.133 |
| T1_lnV | MS | M0 | 0.9998 | 35/30 | 0.62 | +0.0001 | 6565 | 0.773 | 0.137 |
| T1_lnV | MS | empirical60* | 0.8328 | 65/0 | 5.4e-20 | +0.1697 | 6565 | 0.773 | 0.137 |
| T1_lnV | MJ | M0 | 1.0034 | 26/39 | 0.14 | -0.0035 | 6565 | 0.769 | 0.141 |
| T1_lnV | MJ | empirical60* | 0.8358 | 65/0 | 5.4e-20 | +0.1667 | 6565 | 0.769 | 0.141 |
| T1_lnV | MC | M0 | 1.0021 | 24/41 | 0.046 | -0.0021 | 6565 | 0.768 | 0.142 |
| T1_lnV | MC | empirical60* | 0.8347 | 65/0 | 5.4e-20 | +0.1679 | 6565 | 0.768 | 0.142 |
| T2_absr | M0 | empirical60* | 0.9845 | 54/11 | 6e-08 | +0.0157 | 6565 | 0.775 | 0.132 |
| T2_absr | MT | M0 | 1.0037 | 25/40 | 0.082 | -0.0033 | 6565 | 0.773 | 0.138 |
| T2_absr | MT | empirical60* | 0.9882 | 54/11 | 6e-08 | +0.0125 | 6565 | 0.773 | 0.138 |
| T2_absr | ME | M0 | 0.9891 | 49/16 | 5.1e-05 | +0.0112 | 6565 | 0.779 | 0.133 |
| T2_absr | ME | empirical60* | 0.9738 | 59/6 | 5e-12 | +0.0268 | 6565 | 0.779 | 0.133 |
| T2_absr | MS | M0 | 1.0018 | 27/38 | 0.21 | -0.0019 | 6565 | 0.771 | 0.138 |
| T2_absr | MS | empirical60* | 0.9863 | 54/11 | 6e-08 | +0.0138 | 6565 | 0.771 | 0.138 |
| T2_absr | MJ | M0 | 1.0014 | 31/34 | 0.8 | -0.0007 | 6565 | 0.769 | 0.138 |
| T2_absr | MJ | empirical60* | 0.9859 | 52/13 | 1.2e-06 | +0.0150 | 6565 | 0.769 | 0.138 |
| T2_absr | MC | M0 | 1.0013 | 29/36 | 0.46 | -0.0006 | 6565 | 0.768 | 0.142 |
| T2_absr | MC | empirical60* | 0.9858 | 57/8 | 3.2e-10 | +0.0152 | 6565 | 0.768 | 0.142 |
| T3_r | M0 | ewma_gauss* | 0.9931 | 49/16 | 5.1e-05 | +0.0061 | 6565 | 0.778 | 0.127 |
| T3_r | MT | M0 | 0.9994 | 31/34 | 0.8 | +0.0009 | 6565 | 0.773 | 0.126 |
| T3_r | MT | ewma_gauss* | 0.9926 | 48/17 | 0.00015 | +0.0070 | 6565 | 0.773 | 0.126 |
| T3_r | ME | M0 | 0.9981 | 42/23 | 0.025 | +0.0016 | 6565 | 0.777 | 0.128 |
| T3_r | ME | ewma_gauss* | 0.9913 | 51/14 | 4.5e-06 | +0.0077 | 6565 | 0.777 | 0.128 |
| T3_r | MS | M0 | 1.0009 | 33/32 | 1 | -0.0004 | 6565 | 0.767 | 0.132 |
| T3_r | MS | ewma_gauss* | 0.9941 | 47/18 | 0.00042 | +0.0057 | 6565 | 0.767 | 0.132 |
| T3_r | MJ | M0 | 1.0016 | 28/37 | 0.32 | -0.0014 | 6565 | 0.771 | 0.129 |
| T3_r | MJ | ewma_gauss* | 0.9947 | 46/19 | 0.0011 | +0.0047 | 6565 | 0.771 | 0.129 |
| T3_r | MC | M0 | 0.9991 | 33/32 | 1 | +0.0017 | 6565 | 0.768 | 0.130 |
| T3_r | MC | ewma_gauss* | 0.9922 | 50/15 | 1.6e-05 | +0.0078 | 6565 | 0.768 | 0.130 |

## T3 direction (signed return)

| method | hit rate of sign(median) | always-up rate, same days | n | binomial p vs 0.5 | mean daily IC | IC t-stat | days |
|---|---|---|---|---|---|---|---|
| M0 | 0.5180 | 0.5503 | 6535 | 0.0038 | +0.0213 | +1.22 | 101 |
| MT | 0.5255 | 0.5503 | 6535 | 4e-05 | +0.0369 | +2.19 | 101 |
| ME | 0.5158 | 0.5503 | 6535 | 0.011 | +0.0147 | +0.86 | 101 |
| MS | 0.5204 | 0.5503 | 6535 | 0.001 | +0.0166 | +0.99 | 101 |
| MJ | 0.5164 | 0.5503 | 6535 | 0.0081 | +0.0137 | +0.81 | 101 |
| MC | 0.5243 | 0.5503 | 6535 | 9.2e-05 | +0.0439 | +2.37 | 101 |

Pre-registered expectation: ME helps T1 and T2 clearly; MS helps T1; MT and MJ help T1/T2 a little if at all; T3 ties for every arm. Nulls are reported with the same prominence as positives.
