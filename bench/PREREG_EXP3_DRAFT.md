# Experiment 3 (DRAFT, not frozen): does news CONTENT (surprise, tone, materiality) improve
# next-day volume / volatility / return forecasts?

Drafted 2026-10-21 04:40 ET while Experiment 2's holdout was running. Experiments 1-2 tested article
COUNTS only; Ashwin's premise was content: surprise and tone, not amount. This tests that premise.
Freeze rule: becomes PREREG_EXP3.md (sha256 recorded in the plan) after the three open items at the
bottom are closed and before any tone, theme or Jev covariate is joined to a price outcome.

## Windows (no overlap with anything already scored)
- Historical holdout: trading days 2023-01-03 .. 2024-12-31 (~500), every 5th day (~100 origins,
  weekday-rotating). Nothing has evaluated 2017-2024: Exp 1 scored 2025-03..2026-10, Exp 2 dev
  2025-04..2026-04, Exp 2 holdout 2026-04..2026-10. Scored once.
- Development: 2022 trading days, every 10th; pipeline checks only, no tuning.
- Forward test: trading days from the freeze date to 2026-12-31, every day, Jev on Pulse's own
  live corpus (headline + summary, brief v2). Scored once at the end of the window.

## Data
- Prices, universe, calendar, look-ahead cutoff, targets T1-T3, model (Timestral-28M, context <= 1024,
  DOW categorical), baselines and metrics: identical to PREREG_EXP2.md.
- GDELT GKG content per matched doc (v2 org patterns): DATE, V2Tone (tone, positive, negative,
  polarity, activity, self/group ref, word count), V2Themes, Extras <PAGE_TITLE>, DocumentIdentifier.
  Per ticker per UTC day, then aggregated onto the trading axis over UTC days date(t-1)..date(t)-1
  exactly as Exp 2's news covariate.

## Covariates (all known before t's open)
- C1 tone: mean doc tone; abnormal tone = (mean tone - trailing 60-trading-day mean) / trailing sd.
- C2 polarity: mean polarity (how emotionally charged, regardless of sign).
- C3 earnings (two known-future rows). Source: api.nasdaq.com earnings calendar by date (verified
  2026-10-21: 2023-02-22 returns 163 rows incl. NVDA, time 'time-not-supplied', surprise 35.42).
  (a) earnings window: 1 on the trading day of the report date and on the next trading day. Two
      days because historical report times are often 'time-not-supplied' (NVDA reports after the
      close, so its reaction day is the day after). Dates are scheduled weeks ahead: known before t.
  (b) EPS surprise: |surprise %| (Nasdaq's field, actual vs consensus) placed ONLY on the trading day
      after the report date, 0 elsewhere. By that day's open the report is public whatever its time
      of day, so there is no leak; pre-market reporters get it one day late, which costs timeliness,
      not validity. GDELT themes were the first plan and are dropped: LOOKUP-GKGTHEMES has no
  earnings, M&A, guidance or product-launch themes (checked 2026-10-21; closest are ECON_BANKRUPTCY,
  ECON_IPO, RESIGNATION, TAX_FNCACT_CEO), and the column would cost 238 GB.
- C4 news surprise: the PIT of the day's doc count under Experiment 1's model (Timestral-28M one-day-
  ahead forecast from the prior 1024 days of counts, made the day before). Uses Exp 1's validated
  model; no new fitting.
- C5 Jev materiality (historical, headline-only): per doc, Jev 1.13.0 argmax score under brief v2
  with the headline and NO links block (the 2026 graph would leak link knowledge into 2022-2024).
  Per ticker-day: number of distinct headlines scored >= 4, max score, mean score. Titles deduped per
  ticker per UTC day; at most 30 distinct titles per ticker-day, sampled by FARM_FINGERPRINT(title)
  (deterministic); the uncapped title count is kept so the share can be scaled. Scored for
  2021-01..2024-12 (context for the 2023 origins); earlier context days are NaN.

## Models
M0 (Exp 2's), MT = M0 + C1 + C2 (tone), ME = M0 + C3a + C3b (earnings), MS = M0 + C4 (news surprise),
MJ = M0 + C5 (Jev), MC = all.
Known-future for all (values known before t's open), as Exp 2's news.

## Decision rules
Per target and content arm vs M0, paired: ratio < 1 and across-ticker sign-test p < 0.05 / 12
(3 targets x 4 gated arms: MT, ME, MS, MJ). MC reported, not gated. Expectation stated before running: C3 (earnings window and EPS surprise)
and C4 (surprise) help T1/T2; C1/C5 might help T3 slightly via direction, and T3 is most likely a tie.

## Open items (close before freezing)
1. Cost: bench/gkg_content_dryrun.sh bytes for tone+themes 2017-2024 and titles 2022-2024; must
   fit what's left of the 1 TB monthly free tier (~780 GB on Oct 21), or the windows shrink.
   Round 1 (04:36): tone + V2Themes 2017-2024 = 1,429 GB (over budget; V2Themes carries per-mention
   offsets); titles (Extras) 2022-2024 = 222 GB. Round 2 (04:39): V2Tone 2017-2024 114 GB; V1 Themes
   2017-2024 587 GB, 2021-2024 238 GB; Extras 2021-2024 213 GB. With themes dropped (C3 is the Nasdaq
   earnings flag): V2Tone 2017-2024 + Extras 2021-2024 + Organizations/DATE ~ 410 GB, inside the
   ~780 GB left this month. One extraction run, maximum_bytes_billed capped at 450 GB.
2. Headline-only Jev validity gate, on the 271-article gold set (brief v2, no links, headline only,
   summary removed): proceed with C5 only if alert recall >= 64% (full-text no-links Jev 74% minus 10)
   and precision >= 90%. Otherwise C5 is dropped from the historical test and lives only in the
   forward test.
   CLOSED 2026-10-21 04:36 ET: PASS. jev-1.13.0 argmax, v2-headline, no links, n=271: alert recall
   85% (126/148, CI 79-90%), precision 93% (9 false), exact 46%, MAE 0.61 (full text no links: 74%,
   98%, 41%, 0.79). The expected-value decoder scored MAE 0.52 / recall 84% / precision 94%, but C5
   stays argmax as drafted: the decoder is not chosen after seeing gold results.
3. Volume for C5: distinct titles per ticker-day in 2021-2024 (one counting query) -> Jev calls and
   cost at $0.03/1k list; cap or window tightened if it exceeds ~$25.
