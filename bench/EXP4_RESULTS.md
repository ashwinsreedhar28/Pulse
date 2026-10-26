# Experiment 4 results (holdout)

Generated 2026-10-21T20:49 by bench/timestral_exp4.py, implementing bench/PREREG_EXP4.md (frozen sha256 9e42f46edafe...). Inputs hash-checked.

Universe: 69 tickers. Excluded: ALAB (198 trading days before the holdout), ATEYY (no Nasdaq history), CRWV (0 trading days before the holdout), QRVO (no Nasdaq history), SNDK (0 trading days before the holdout), SPCX (0 trading days before the holdout).
Origins: 65 (2025-01-02..2026-04-15). Device cuda. Run time 250s.
Covariate rates at the origins: earnings window 2.5%, linked earnings>0 13.0%, expiry 4.6%, witching 1.5%, holiday-adj 16.9%, half-day 1.5%, FOMC 3.1%, jobs 1.5%
RC scale chosen per origin (median over origins): T1_lnV 0.95, T2_absr 0.95.

## BL weight

- BL w = 0.75 (fixed on dev)

## Gates (arm vs B, paired; pass = ratio < 1 and sign p < 0.00227, 22 gates)

- T1_lnV RC: ratio 1.0013, tickers 17/52 (p 2.9e-05), pooled skill -0.0014, pairs 2829 -> FAIL
- T1_lnV X256: ratio 1.0124, tickers 16/53 (p 9.1e-06), pooled skill -0.0112, pairs 4485 -> FAIL
- T1_lnV X2520: ratio 0.9949, tickers 40/29 (p 0.23), pooled skill +0.0051, pairs 4485 -> FAIL
- T1_lnV MV: ratio 0.9987, tickers 41/28 (p 0.15), pooled skill +0.0014, pairs 4485 -> FAIL
- T1_lnV MV3: ratio 0.9978, tickers 41/28 (p 0.15), pooled skill +0.0021, pairs 4485 -> FAIL
- T1_lnV PRc: ratio 0.9993, tickers 39/30 (p 0.34), pooled skill +0.0005, pairs 4485 -> FAIL
- T1_lnV LE: ratio 1.0077, tickers 20/49 (p 0.00064), pooled skill -0.0074, pairs 4485 -> FAIL
- T1_lnV CAL: ratio 1.0140, tickers 15/54 (p 2.6e-06), pooled skill -0.0135, pairs 4485 -> FAIL
- T1_lnV MAC: ratio 1.0014, tickers 27/42 (p 0.091), pooled skill -0.0014, pairs 4485 -> FAIL
- T2_absr RC: ratio 0.9981, tickers 49/20 (p 0.00064), pooled skill +0.0017, pairs 2829 -> PASS
- T2_absr X256: ratio 1.0036, tickers 31/38 (p 0.47), pooled skill -0.0033, pairs 4485 -> FAIL
- T2_absr X2520: ratio 1.0015, tickers 30/39 (p 0.34), pooled skill -0.0009, pairs 4485 -> FAIL
- T2_absr MV: ratio 0.9970, tickers 39/30 (p 0.34), pooled skill +0.0036, pairs 4485 -> FAIL
- T2_absr MV3: ratio 0.9938, tickers 42/27 (p 0.091), pooled skill +0.0059, pairs 4485 -> FAIL
- T2_absr SQ: ratio 1.0014, tickers 31/38 (p 0.47), pooled skill -0.0020, pairs 4485 -> FAIL
- T2_absr LG: ratio 1.0041, tickers 28/41 (p 0.15), pooled skill -0.0052, pairs 4485 -> FAIL
- T2_absr E209: ratio 0.9990, tickers 37/32 (p 0.63), pooled skill +0.0017, pairs 4485 -> FAIL
- T2_absr BL: ratio 0.9963, tickers 52/17 (p 2.9e-05), pooled skill +0.0039, pairs 4485 -> PASS
- T2_absr PRc: ratio 0.9948, tickers 46/23 (p 0.0076), pooled skill +0.0040, pairs 4485 -> FAIL
- T2_absr LE: ratio 1.0013, tickers 38/31 (p 0.47), pooled skill -0.0014, pairs 4485 -> FAIL
- T2_absr CAL: ratio 1.0027, tickers 37/32 (p 0.63), pooled skill -0.0030, pairs 4485 -> FAIL
- T2_absr MAC: ratio 0.9983, tickers 47/22 (p 0.0035), pooled skill +0.0017, pairs 4485 -> FAIL

## All comparisons

| target | method | vs | ratio | tickers won/lost | sign p | pooled skill | ticker-days | 10-90 cov | y>=q90 |
|---|---|---|---|---|---|---|---|---|---|
| T1_lnV | M0 | B | 1.0142 | 17/52 | 2.9e-05 | -0.0137 | 4485 | 0.816 | 0.107 |
| T1_lnV | B | empirical60* | 0.8188 | 69/0 | 3.4e-21 | +0.1880 | 4485 | 0.816 | 0.107 |
| T1_lnV | RC | B | 1.0013 | 17/52 | 2.9e-05 | -0.0014 | 2829 | 0.812 | 0.096 |
| T1_lnV | X256 | B | 1.0124 | 16/53 | 9.1e-06 | -0.0112 | 4485 | 0.819 | 0.109 |
| T1_lnV | X2520 | B | 0.9949 | 40/29 | 0.23 | +0.0051 | 4485 | 0.812 | 0.110 |
| T1_lnV | MV | B | 0.9987 | 41/28 | 0.15 | +0.0014 | 4485 | 0.818 | 0.108 |
| T1_lnV | MV3 | B | 0.9978 | 41/28 | 0.15 | +0.0021 | 4485 | 0.817 | 0.109 |
| T1_lnV | PRc | B | 0.9993 | 39/30 | 0.34 | +0.0005 | 4485 | 0.818 | 0.108 |
| T1_lnV | LE | B | 1.0077 | 20/49 | 0.00064 | -0.0074 | 4485 | 0.815 | 0.109 |
| T1_lnV | CAL | B | 1.0140 | 15/54 | 2.6e-06 | -0.0135 | 4485 | 0.814 | 0.111 |
| T1_lnV | MAC | B | 1.0014 | 27/42 | 0.091 | -0.0014 | 4485 | 0.816 | 0.107 |
| T2_absr | M0 | B | 1.0032 | 34/35 | 1 | -0.0033 | 4485 | 0.774 | 0.125 |
| T2_absr | B | empirical60* | 0.9965 | 37/32 | 0.63 | +0.0043 | 4485 | 0.778 | 0.132 |
| T2_absr | RC | B | 0.9981 | 49/20 | 0.00064 | +0.0017 | 2829 | 0.743 | 0.151 |
| T2_absr | X256 | B | 1.0036 | 31/38 | 0.47 | -0.0033 | 4485 | 0.781 | 0.128 |
| T2_absr | X2520 | B | 1.0015 | 30/39 | 0.34 | -0.0009 | 4485 | 0.772 | 0.133 |
| T2_absr | MV | B | 0.9970 | 39/30 | 0.34 | +0.0036 | 4485 | 0.780 | 0.128 |
| T2_absr | MV3 | B | 0.9938 | 42/27 | 0.091 | +0.0059 | 4485 | 0.784 | 0.123 |
| T2_absr | SQ | B | 1.0014 | 31/38 | 0.47 | -0.0020 | 4485 | 0.778 | 0.123 |
| T2_absr | LG | B | 1.0041 | 28/41 | 0.15 | -0.0052 | 4485 | 0.775 | 0.113 |
| T2_absr | M209 | B | 1.0029 | 33/36 | 0.81 | -0.0016 | 4485 | 0.762 | 0.133 |
| T2_absr | E209 | B | 0.9990 | 37/32 | 0.63 | +0.0017 | 4485 | 0.770 | 0.133 |
| T2_absr | BL | B | 0.9963 | 52/17 | 2.9e-05 | +0.0039 | 4485 | 0.773 | 0.128 |
| T2_absr | PRc | B | 0.9948 | 46/23 | 0.0076 | +0.0040 | 4485 | 0.782 | 0.126 |
| T2_absr | LE | B | 1.0013 | 38/31 | 0.47 | -0.0014 | 4485 | 0.775 | 0.132 |
| T2_absr | CAL | B | 1.0027 | 37/32 | 0.63 | -0.0030 | 4485 | 0.774 | 0.132 |
| T2_absr | MAC | B | 0.9983 | 47/22 | 0.0035 | +0.0017 | 4485 | 0.774 | 0.131 |

Pre-registered expectation: RC passes both targets; PRc and MV help T2; CAL and LE help T1; SQ/LG, E209, BL and context changes open; MAC small if at all. Nulls are reported with the same prominence as positives.
