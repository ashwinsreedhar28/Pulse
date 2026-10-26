# Experiment 4 results (dev)

Generated 2026-10-21T20:44 by bench/timestral_exp4.py, implementing bench/PREREG_EXP4.md (frozen sha256 9e42f46edafe...). Inputs hash-checked.

Universe: 69 tickers. Excluded: ALAB (198 trading days before the holdout), ATEYY (no Nasdaq history), CRWV (0 trading days before the holdout), QRVO (no Nasdaq history), SNDK (0 trading days before the holdout), SPCX (0 trading days before the holdout).
Origins: 101 (2023-01-03..2024-12-30). Device cuda. Run time 377s.
Covariate rates at the origins: earnings window 3.9%, linked earnings>0 17.1%, expiry 5.9%, witching 2.0%, holiday-adj 10.9%, half-day 2.0%, FOMC 5.0%, jobs 5.9%
RC scale chosen per origin (median over origins): T1_lnV 1.00, T2_absr 1.05.

## BL weight

- BL w=0.25: ratio vs B 1.0138, tickers 9/60 (p 2.2e-10)
- BL w=0.5: ratio vs B 1.0062, tickers 14/55 (p 6.9e-07)
- BL w=0.75: ratio vs B 1.0017, tickers 22/47 (p 0.0035)
- chosen w = 0.75 (written to data/exp4_bl_w.txt)

## Gates (arm vs B, paired; pass = ratio < 1 and sign p < 0.00227, 22 gates)

- T1_lnV RC: ratio 1.0019, tickers 19/50 (p 0.00024), pooled skill -0.0019, pairs 5302 -> FAIL
- T1_lnV X256: ratio 1.0070, tickers 24/45 (p 0.015), pooled skill -0.0067, pairs 6926 -> FAIL
- T1_lnV X2520: ratio 0.9955, tickers 40/29 (p 0.23), pooled skill +0.0043, pairs 6926 -> FAIL
- T1_lnV MV: ratio 0.9990, tickers 39/30 (p 0.34), pooled skill +0.0010, pairs 6926 -> FAIL
- T1_lnV MV3: ratio 0.9991, tickers 41/28 (p 0.15), pooled skill +0.0009, pairs 6926 -> FAIL
- T1_lnV PRc: ratio 0.9993, tickers 39/30 (p 0.34), pooled skill +0.0007, pairs 6926 -> FAIL
- T1_lnV LE: ratio 1.0112, tickers 15/54 (p 2.6e-06), pooled skill -0.0108, pairs 6926 -> FAIL
- T1_lnV CAL: ratio 1.0121, tickers 18/51 (p 8.8e-05), pooled skill -0.0120, pairs 6926 -> FAIL
- T1_lnV MAC: ratio 1.0023, tickers 23/46 (p 0.0076), pooled skill -0.0022, pairs 6926 -> FAIL
- T2_absr RC: ratio 1.0013, tickers 24/45 (p 0.015), pooled skill -0.0005, pairs 5301 -> FAIL
- T2_absr X256: ratio 1.0125, tickers 8/61 (p 3.2e-11), pooled skill -0.0114, pairs 6924 -> FAIL
- T2_absr X2520: ratio 0.9987, tickers 37/32 (p 0.63), pooled skill +0.0006, pairs 6924 -> FAIL
- T2_absr MV: ratio 0.9976, tickers 37/32 (p 0.63), pooled skill +0.0022, pairs 6924 -> FAIL
- T2_absr MV3: ratio 0.9954, tickers 43/26 (p 0.053), pooled skill +0.0045, pairs 6924 -> FAIL
- T2_absr SQ: ratio 0.9999, tickers 37/32 (p 0.63), pooled skill +0.0001, pairs 6924 -> FAIL
- T2_absr LG: ratio 1.0027, tickers 34/35 (p 1), pooled skill -0.0032, pairs 6924 -> FAIL
- T2_absr E209: ratio 0.9954, tickers 47/22 (p 0.0035), pooled skill +0.0039, pairs 6924 -> FAIL
- T2_absr BL: ratio 1.0017, tickers 22/47 (p 0.0035), pooled skill -0.0018, pairs 6912 -> FAIL
- T2_absr PRc: ratio 0.9981, tickers 40/29 (p 0.23), pooled skill +0.0022, pairs 6924 -> FAIL
- T2_absr LE: ratio 1.0043, tickers 31/38 (p 0.47), pooled skill -0.0043, pairs 6924 -> FAIL
- T2_absr CAL: ratio 1.0070, tickers 30/39 (p 0.34), pooled skill -0.0079, pairs 6924 -> FAIL
- T2_absr MAC: ratio 1.0031, tickers 25/44 (p 0.029), pooled skill -0.0029, pairs 6924 -> FAIL

## All comparisons

| target | method | vs | ratio | tickers won/lost | sign p | pooled skill | ticker-days | 10-90 cov | y>=q90 |
|---|---|---|---|---|---|---|---|---|---|
| T1_lnV | M0 | B | 1.0176 | 13/56 | 1.7e-07 | -0.0174 | 6926 | 0.779 | 0.132 |
| T1_lnV | B | empirical60* | 0.8149 | 69/0 | 3.4e-21 | +0.1874 | 6914 | 0.782 | 0.132 |
| T1_lnV | RC | B | 1.0019 | 19/50 | 0.00024 | -0.0019 | 5302 | 0.790 | 0.133 |
| T1_lnV | X256 | B | 1.0070 | 24/45 | 0.015 | -0.0067 | 6926 | 0.785 | 0.130 |
| T1_lnV | X2520 | B | 0.9955 | 40/29 | 0.23 | +0.0043 | 6926 | 0.784 | 0.129 |
| T1_lnV | MV | B | 0.9990 | 39/30 | 0.34 | +0.0010 | 6926 | 0.787 | 0.130 |
| T1_lnV | MV3 | B | 0.9991 | 41/28 | 0.15 | +0.0009 | 6926 | 0.786 | 0.132 |
| T1_lnV | PRc | B | 0.9993 | 39/30 | 0.34 | +0.0007 | 6926 | 0.785 | 0.131 |
| T1_lnV | LE | B | 1.0112 | 15/54 | 2.6e-06 | -0.0108 | 6926 | 0.779 | 0.136 |
| T1_lnV | CAL | B | 1.0121 | 18/51 | 8.8e-05 | -0.0120 | 6926 | 0.779 | 0.135 |
| T1_lnV | MAC | B | 1.0023 | 23/46 | 0.0076 | -0.0022 | 6926 | 0.781 | 0.133 |
| T2_absr | M0 | B | 1.0112 | 16/53 | 9.1e-06 | -0.0118 | 6924 | 0.775 | 0.134 |
| T2_absr | B | empirical60* | 0.9759 | 61/8 | 3.2e-11 | +0.0251 | 6912 | 0.779 | 0.134 |
| T2_absr | RC | B | 1.0013 | 24/45 | 0.015 | -0.0005 | 5301 | 0.821 | 0.131 |
| T2_absr | X256 | B | 1.0125 | 8/61 | 3.2e-11 | -0.0114 | 6924 | 0.778 | 0.139 |
| T2_absr | X2520 | B | 0.9987 | 37/32 | 0.63 | +0.0006 | 6924 | 0.779 | 0.133 |
| T2_absr | MV | B | 0.9976 | 37/32 | 0.63 | +0.0022 | 6924 | 0.781 | 0.131 |
| T2_absr | MV3 | B | 0.9954 | 43/26 | 0.053 | +0.0045 | 6924 | 0.780 | 0.133 |
| T2_absr | SQ | B | 0.9999 | 37/32 | 0.63 | +0.0001 | 6924 | 0.790 | 0.121 |
| T2_absr | LG | B | 1.0027 | 34/35 | 1 | -0.0032 | 6924 | 0.790 | 0.111 |
| T2_absr | M209 | B | 0.9991 | 36/33 | 0.81 | -0.0008 | 6924 | 0.781 | 0.128 |
| T2_absr | E209 | B | 0.9954 | 47/22 | 0.0035 | +0.0039 | 6924 | 0.782 | 0.129 |
| T2_absr | BL | B | 1.0017 | 22/47 | 0.0035 | -0.0018 | 6912 | 0.774 | 0.135 |
| T2_absr | PRc | B | 0.9981 | 40/29 | 0.23 | +0.0022 | 6924 | 0.776 | 0.137 |
| T2_absr | LE | B | 1.0043 | 31/38 | 0.47 | -0.0043 | 6924 | 0.773 | 0.140 |
| T2_absr | CAL | B | 1.0070 | 30/39 | 0.34 | -0.0079 | 6924 | 0.777 | 0.135 |
| T2_absr | MAC | B | 1.0031 | 25/44 | 0.029 | -0.0029 | 6924 | 0.773 | 0.138 |

Pre-registered expectation: RC passes both targets; PRc and MV help T2; CAL and LE help T1; SQ/LG, E209, BL and context changes open; MAC small if at all. Nulls are reported with the same prominence as positives.
