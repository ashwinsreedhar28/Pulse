# Experiment 5 results (dev)

Generated 2026-10-21T20:50 by bench/timestral_exp5.py, implementing bench/PREREG_EXP5.md (frozen sha256 624f321332e2...). Inputs hash-checked.

Universe: 69 tickers. Excluded: ALAB (198 trading days before the holdout), ATEYY (no Nasdaq history), CRWV (0 trading days before the holdout), QRVO (no Nasdaq history), SNDK (0 trading days before the holdout), SPCX (0 trading days before the holdout).
Origins: 101 (2023-01-03..2024-12-30). Device cuda. Run time 89s.

## Gates (arm vs random walk, paired, per horizon; pass = ratio < 1 and sign p < 0.0033)

- L28 h=1: ratio 0.9942, tickers 43/26 (p 0.053), pooled skill +0.0068, pairs 6900 -> FAIL
- L28 h=2: ratio 0.9941, tickers 50/19 (p 0.00024), pooled skill +0.0062, pairs 6900 -> PASS
- L28 h=3: ratio 0.9931, tickers 54/15 (p 2.6e-06), pooled skill +0.0076, pairs 6900 -> PASS
- L28 h=4: ratio 0.9931, tickers 51/18 (p 8.8e-05), pooled skill +0.0072, pairs 6900 -> PASS
- L28 h=5: ratio 0.9909, tickers 60/9 (p 2.2e-10), pooled skill +0.0091, pairs 6900 -> PASS
- R28 h=1: ratio 0.9976, tickers 37/32 (p 0.63), pooled skill +0.0034, pairs 6900 -> FAIL
- R28 h=2: ratio 0.9991, tickers 35/34 (p 1), pooled skill +0.0012, pairs 6900 -> FAIL
- R28 h=3: ratio 0.9964, tickers 41/28 (p 0.15), pooled skill +0.0043, pairs 6900 -> FAIL
- R28 h=4: ratio 0.9963, tickers 38/31 (p 0.47), pooled skill +0.0035, pairs 6900 -> FAIL
- R28 h=5: ratio 0.9949, tickers 45/24 (p 0.015), pooled skill +0.0049, pairs 6900 -> FAIL
- L209 h=1: ratio 0.9928, tickers 53/16 (p 9.1e-06), pooled skill +0.0072, pairs 6900 -> PASS
- L209 h=2: ratio 0.9925, tickers 55/14 (p 6.9e-07), pooled skill +0.0076, pairs 6900 -> PASS
- L209 h=3: ratio 0.9906, tickers 56/13 (p 1.7e-07), pooled skill +0.0096, pairs 6900 -> PASS
- L209 h=4: ratio 0.9909, tickers 52/17 (p 2.9e-05), pooled skill +0.0090, pairs 6900 -> PASS
- L209 h=5: ratio 0.9888, tickers 56/13 (p 1.7e-07), pooled skill +0.0114, pairs 6900 -> PASS

## Calibration (10-90 coverage / y>=q90)

| method | h=1 | h=2 | h=3 | h=4 | h=5 |
|---|---|---|---|---|---|
| L28 | 0.802 / 0.113 | 0.798 / 0.109 | 0.820 / 0.099 | 0.819 / 0.104 | 0.812 / 0.110 |
| R28 | 0.788 / 0.126 | 0.785 / 0.121 | 0.808 / 0.108 | 0.806 / 0.115 | 0.796 / 0.123 |
| L209 | 0.785 / 0.125 | 0.792 / 0.115 | 0.823 / 0.096 | 0.821 / 0.102 | 0.810 / 0.109 |
| rw* | 0.794 / 0.117 | 0.789 / 0.114 | 0.817 / 0.095 | 0.814 / 0.104 | 0.807 / 0.108 |

## Direction (reported, not gated; evidence only if p vs always-up < alpha)

| method | h | hit rate | always-up | n | p vs always-up | mean daily IC | IC t |
|---|---|---|---|---|---|---|---|
| L28 | 1 | 0.5091 | 0.5508 | 6894 | 3.7e-12 | +0.0094 | +0.59 |
| L28 | 2 | 0.5078 | 0.5710 | 6904 | 2.9e-26 | -0.0040 | -0.24 |
| L28 | 3 | 0.4949 | 0.5572 | 6908 | 2.1e-25 | -0.0144 | -0.89 |
| L28 | 4 | 0.4923 | 0.5406 | 6911 | 7.5e-16 | +0.0035 | +0.23 |
| L28 | 5 | 0.5004 | 0.5566 | 6912 | 5.8e-21 | +0.0054 | +0.39 |
| R28 | 1 | 0.5013 | 0.5508 | 6894 | 1.5e-16 | +0.0119 | +0.79 |
| R28 | 2 | 0.4919 | 0.5710 | 6904 | 3.2e-40 | +0.0035 | +0.22 |
| R28 | 3 | 0.4876 | 0.5572 | 6908 | 2.3e-31 | -0.0102 | -0.66 |
| R28 | 4 | 0.4886 | 0.5406 | 6911 | 4.5e-18 | +0.0056 | +0.37 |
| R28 | 5 | 0.4945 | 0.5566 | 6912 | 2.8e-25 | +0.0067 | +0.47 |
| L209 | 1 | 0.5190 | 0.5508 | 6894 | 1.1e-07 | +0.0149 | +0.91 |
| L209 | 2 | 0.5180 | 0.5710 | 6904 | 5.6e-19 | +0.0008 | +0.06 |
| L209 | 3 | 0.5093 | 0.5572 | 6908 | 1.1e-15 | -0.0097 | -0.75 |
| L209 | 4 | 0.5144 | 0.5406 | 6911 | 1.2e-05 | +0.0102 | +0.71 |
| L209 | 5 | 0.5208 | 0.5566 | 6912 | 2.2e-09 | +0.0174 | +1.19 |

Pre-registered expectation: ties at every horizon. Nulls are reported with the same prominence as positives.
