# Phase A1.3 — conditional return analysis

Generated 2026-09-07T23:04:56+00:00

**Verdict: MARGINAL (insufficient calendar span)**

- raw (article, ticker, horizon) rows: 4964
- independent observations after (symbol, day) clustering: 3925
- buckets: 18 (10 with N >= 200)
- distinct event days: 82 (~16 non-overlapping 5-day windows) — BELOW the 250-day minimum
- gate: |t| > 2.5 and N > 200, surviving Benjamini-Hochberg at 5%,
  and NOT reproduced by the placebo

## Placebo (random non-event days, same symbols, same window)

| horizon | N | mean excess |
|---|---|---|
| 1d | 867 | +0.260% |
| 5d | 864 | +1.325% |

If a bucket's effect matches its placebo row in sign and magnitude, the
effect belongs to the universe and window rather than to the news.

## Buckets

| horizon | urgency | mention | subset | N (clustered) | raw rows | mean excess | sd | t | p | BH sig |
|---|---|---|---|---|---|---|---|---|---|---|
| 5d | 3 | strong | all | 403 | 948 | -1.585% | 6.171% | -5.16 | 0.000 | yes |
| 5d | 3 | strong | first | 398 | 509 | -1.563% | 6.182% | -5.04 | 0.000 | yes |
| 1d | 5 | weak | all | 3 ⚠ | 3 | -0.584% | 0.213% | -4.74 | 0.000 | n/a |
| 5d | 1 | strong | all | 137 ⚠ | 232 | -1.790% | 5.858% | -3.58 | 0.000 | n/a |
| 5d | 1 | strong | first | 136 ⚠ | 156 | -1.760% | 5.869% | -3.50 | 0.000 | n/a |
| 1d | 5 | weak | first | 2 ⚠ | 2 | -0.494% | 0.206% | -3.40 | 0.001 | n/a |
| 5d | 5 | strong | all | 249 | 843 | -0.969% | 6.321% | -2.42 | 0.016 | — |
| 5d | 5 | strong | first | 246 | 360 | -0.921% | 6.321% | -2.29 | 0.022 | — |
| 1d | 3 | strong | all | 598 | 1470 | -0.195% | 3.159% | -1.51 | 0.131 | — |
| 1d | 3 | strong | first | 591 | 889 | -0.176% | 3.167% | -1.35 | 0.176 | — |
| 1d | 1 | strong | all | 212 | 356 | -0.246% | 2.658% | -1.35 | 0.177 | — |
| 1d | 1 | strong | first | 210 | 266 | -0.219% | 2.654% | -1.20 | 0.231 | — |
| 1d | 3 | weak | all | 28 ⚠ | 52 | -0.353% | 2.780% | -0.67 | 0.501 | n/a |
| 5d | 3 | weak | first | 15 ⚠ | 15 | +1.103% | 6.762% | +0.63 | 0.528 | n/a |
| 1d | 5 | strong | first | 327 | 481 | +0.080% | 3.115% | +0.46 | 0.644 | — |
| 1d | 5 | strong | all | 331 | 1022 | +0.051% | 3.115% | +0.30 | 0.766 | — |
| 5d | 3 | weak | all | 18 ⚠ | 38 | +0.403% | 6.613% | +0.26 | 0.796 | n/a |
| 1d | 3 | weak | first | 21 ⚠ | 24 | -0.045% | 2.367% | -0.09 | 0.930 | n/a |

⚠ = below the minimum sample size; excluded from the gate and from the
multiple-testing correction.

## Reading this

- **Excess return** is ticker minus sector-ETF (SPY where sector is
  unknown). Raw returns would largely measure beta, since news arrival
  correlates with market-wide volatility.
- **subset=first** restricts to first-mentions (A1.4). If novelty carries
  the signal, first-mention t-statistics should exceed the `all` row for
  the same bucket. If they don't, repeat coverage was inflating N rather
  than adding information.
- **Urgency buckets are 1 / 3 / 5**, not the brief's 1-2 / 3 / 4 / 5.
  urgencyScorer only emits those three values; 2 and 4 arrive solely via
  AI promotion and account for ~0.3% of scored articles.
- **BH sig** is what matters. A raw |t| > 2.5 in one of dozens of buckets
  is unremarkable — roughly one in twenty clears p<0.05 by chance alone.
