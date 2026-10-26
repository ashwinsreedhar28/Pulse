# Experiment 5 results (holdout)

Generated 2026-10-21T20:51 by bench/timestral_exp5.py, implementing bench/PREREG_EXP5.md (frozen sha256 624f321332e2...). Inputs hash-checked.

Universe: 69 tickers. Excluded: ALAB (198 trading days before the holdout), ATEYY (no Nasdaq history), CRWV (0 trading days before the holdout), QRVO (no Nasdaq history), SNDK (0 trading days before the holdout), SPCX (0 trading days before the holdout).
Origins: 65 (2025-01-02..2026-04-15). Device cuda. Run time 57s.

## Gates (arm vs random walk, paired, per horizon; pass = ratio < 1 and sign p < 0.0033)

- L28 h=1: ratio 0.9854, tickers 54/15 (p 2.6e-06), pooled skill +0.0176, pairs 4485 -> PASS
- L28 h=2: ratio 0.9853, tickers 51/18 (p 8.8e-05), pooled skill +0.0174, pairs 4485 -> PASS
- L28 h=3: ratio 0.9914, tickers 50/19 (p 0.00024), pooled skill +0.0098, pairs 4485 -> PASS
- L28 h=4: ratio 0.9909, tickers 51/18 (p 8.8e-05), pooled skill +0.0108, pairs 4485 -> PASS
- L28 h=5: ratio 0.9909, tickers 49/20 (p 0.00064), pooled skill +0.0111, pairs 4485 -> PASS
- R28 h=1: ratio 1.0282, tickers 49/20 (p 0.00064), pooled skill -0.7616, pairs 4485 -> FAIL
- R28 h=2: ratio 1.0298, tickers 47/22 (p 0.0035), pooled skill -0.6655, pairs 4485 -> FAIL
- R28 h=3: ratio 1.0263, tickers 37/32 (p 0.63), pooled skill -0.3036, pairs 4485 -> FAIL
- R28 h=4: ratio 1.0287, tickers 39/30 (p 0.34), pooled skill -0.3994, pairs 4485 -> FAIL
- R28 h=5: ratio 1.0204, tickers 39/30 (p 0.34), pooled skill -0.2505, pairs 4485 -> FAIL
- L209 h=1: ratio 0.9816, tickers 61/8 (p 3.2e-11), pooled skill +0.0196, pairs 4485 -> PASS
- L209 h=2: ratio 0.9867, tickers 57/12 (p 3.7e-08), pooled skill +0.0153, pairs 4485 -> PASS
- L209 h=3: ratio 0.9927, tickers 49/20 (p 0.00064), pooled skill +0.0084, pairs 4485 -> PASS
- L209 h=4: ratio 0.9905, tickers 59/10 (p 1.4e-09), pooled skill +0.0118, pairs 4485 -> PASS
- L209 h=5: ratio 0.9912, tickers 52/17 (p 2.9e-05), pooled skill +0.0113, pairs 4485 -> PASS

## Calibration (10-90 coverage / y>=q90)

| method | h=1 | h=2 | h=3 | h=4 | h=5 |
|---|---|---|---|---|---|
| L28 | 0.819 / 0.091 | 0.797 / 0.143 | 0.767 / 0.146 | 0.763 / 0.139 | 0.759 / 0.146 |
| R28 | 0.816 / 0.096 | 0.791 / 0.149 | 0.759 / 0.150 | 0.753 / 0.150 | 0.751 / 0.155 |
| L209 | 0.806 / 0.105 | 0.787 / 0.151 | 0.761 / 0.148 | 0.763 / 0.140 | 0.754 / 0.148 |
| rw* | 0.833 / 0.090 | 0.820 / 0.129 | 0.799 / 0.122 | 0.795 / 0.115 | 0.789 / 0.126 |

## Direction (reported, not gated; evidence only if p vs always-up < alpha)

| method | h | hit rate | always-up | n | p vs always-up | mean daily IC | IC t |
|---|---|---|---|---|---|---|---|
| L28 | 1 | 0.4952 | 0.5133 | 4475 | 0.015 | -0.0047 | -0.22 |
| L28 | 2 | 0.5214 | 0.5690 | 4473 | 1.3e-10 | +0.0215 | +1.03 |
| L28 | 3 | 0.5084 | 0.5482 | 4475 | 9e-08 | -0.0077 | -0.44 |
| L28 | 4 | 0.5127 | 0.5578 | 4480 | 1.2e-09 | -0.0111 | -0.49 |
| L28 | 5 | 0.5185 | 0.5793 | 4478 | 1.8e-16 | -0.0050 | -0.25 |
| R28 | 1 | 0.4972 | 0.5133 | 4475 | 0.031 | -0.0046 | -0.23 |
| R28 | 2 | 0.5028 | 0.5690 | 4473 | 4e-19 | +0.0092 | +0.47 |
| R28 | 3 | 0.4959 | 0.5482 | 4475 | 2.1e-12 | -0.0180 | -1.01 |
| R28 | 4 | 0.5036 | 0.5578 | 4480 | 2.7e-13 | -0.0140 | -0.73 |
| R28 | 5 | 0.5047 | 0.5793 | 4478 | 5e-24 | -0.0116 | -0.62 |
| L209 | 1 | 0.5108 | 0.5133 | 4475 | 0.74 | +0.0023 | +0.12 |
| L209 | 2 | 0.5202 | 0.5690 | 4473 | 4.6e-11 | +0.0126 | +0.65 |
| L209 | 3 | 0.5026 | 0.5482 | 4475 | 8.9e-10 | -0.0015 | -0.08 |
| L209 | 4 | 0.5185 | 0.5578 | 4480 | 1.2e-07 | +0.0267 | +1.28 |
| L209 | 5 | 0.5261 | 0.5793 | 4478 | 5.8e-13 | +0.0281 | +1.39 |

Pre-registered expectation: ties at every horizon. Nulls are reported with the same prominence as positives.
