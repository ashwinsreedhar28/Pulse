# Phase A1: Signal-Existence Proof

**Goal:** Determine whether Pulse's existing news + urgency-score + ticker-classification data has any statistically detectable predictive signal for ticker-relative forward returns. This is a pure measurement phase. No model is built. No trade is made. The deliverable is a yes/no with statistical evidence.

**Budget:** 2-3 weeks of evening/weekend work. ~$50 of out-of-pocket cost (none expected, but margin for incidental data subs if needed).

**Out of scope:** Anything that builds a predictive model, runs a backtest with costs, paper-trades, or interacts with a broker. Those are later phases. If you find yourself reaching for `xgboost` or `alpaca-py`, stop — wrong phase.

---

## Context (Pulse internals)

- SQLite DB at the standard Pulse path. Tables of interest:
  - `articles` — has `id`, `feed_id`, `pubDate` (from RSS, may be unreliable), `fetched_at`, `url`, `title`, `body`, `urgency_score`, `urgency_source` (ollama vs haiku).
  - `article_tickers` — many-to-many between `articles` and tickers, with `mention_type` (active vs passive chain).
  - `feeds` — 44 feeds with metadata.
- `urgency_score` is 1-5, calibrated for "should I read this," not P&L. Treat it as a candidate feature, not a verdict.
- Watchlist: ~65 active + ~400 passive tickers — see existing watchlist module.

## Tasks

### A1.1 — Feed pubDate reliability audit

Build `scripts/audit_pubdate_reliability.py`.

For each of the 44 feeds:
1. Random-sample 50 articles from the past 6 months.
2. For each, fetch the article URL and try to extract a publication timestamp from the page itself (look for `<meta property="article:published_time">`, `<time datetime=...>`, JSON-LD `datePublished`, common byline patterns). Use `trafilatura` or BeautifulSoup; reuse Pulse's existing reader-extraction module if it captures this.
3. Compute the delta: `rss_pubDate - page_published_time` (seconds).
4. Tabulate per-feed: median delta, 90th percentile delta, fraction of articles where pubDate is more than 5 minutes off.

**Output:** `reports/feed_reliability.md` — table classifying each feed:
- **Tier 1:** median |delta| < 5 min, 90th pct < 15 min — usable for backtest timing.
- **Tier 2:** median |delta| < 30 min — usable with caveats.
- **Tier 3:** unreliable — use for content but not for timing-sensitive analysis.

Persist tier classification into a new column `feeds.timing_tier` (or a sidecar table; pick whichever fits Pulse's existing migration pattern).

### A1.2 — Event-study harness

Build `scripts/event_study.py`.

For each (article, ticker) pair where:
- The article's feed is Tier 1 or Tier 2,
- The article has at least one ticker in `article_tickers`,
- The article was published during US market hours OR within 4 hours before market open,

compute:
- `t0` = effective news time. Tier 1: use `pubDate`. Tier 2: use `min(pubDate, fetched_at)` and add a `timing_tier_2` flag.
- Forward returns at +1h, +4h, +1d, +5d (trading-day clock — skip weekends/holidays).
- Ticker return: use `yfinance` 1-minute bars when horizon ≤ 1 day, daily otherwise. Cache to local SQLite to avoid re-fetching.
- Benchmark return: sector SPDR ETF for the ticker's sector. Use a simple ticker→sector mapping table (build once from yfinance `Ticker.info['sector']`, cache).
- **Excess return** = ticker_return − benchmark_return. This is the dependent variable.

Persist results to `event_study_results` table: `(article_id, ticker, horizon, t0, ticker_return, benchmark_return, excess_return, urgency_score, timing_tier)`.

### A1.3 — Conditional return analysis

Build `notebooks/a1_signal_check.ipynb` (or a `.py` if you prefer; reproducibility matters more than format).

For each combination of:
- Urgency score bucket (1-2, 3, 4, 5),
- Horizon (1h, 4h, 1d, 5d),
- Cap bucket (large >$10B, mid $1-10B, small <$1B — use yfinance market cap, cached),
- Mention type (active vs passive chain),

compute:
- N (sample size),
- Mean excess return,
- Std of excess return,
- t-statistic against H0: mean = 0,
- Same metrics restricted to Tier 1 feeds only (for cleaner timing).

Output a heatmap-style table to `reports/a1_results.md`. Include sample-size warnings where N < 100.

### A1.4 — Novelty deduplication

The above will be polluted by repeat-coverage of the same event. Build a dedup pass:
- Group articles by (ticker, day). Within each group, find articles with cosine similarity > 0.7 on title+lead-paragraph TF-IDF.
- Keep only the **earliest** article per cluster as a "first-mention." Mark the rest as `is_duplicate = True`.
- Re-run A1.3 restricted to first-mentions only.

Compare results: does the signal sharpen on first-mentions, weaken, or stay the same? (If novelty matters, first-mention t-stats should be higher.)

---

## Acceptance criteria (the gate)

**Pass (proceed to Phase A2 planning):** at least one (urgency × horizon × cap × tier) bucket on first-mentions has |t-stat| > 2.5 with N > 200. Document which bucket and what direction.

**Marginal (re-evaluate before Phase A2):** t-stats in 1.5-2.5 range on multiple buckets, but no single clean result. Means a signal might exist but Pulse's data shape isn't capturing it cleanly.

**Fail (stop, do not proceed to A2):** all t-stats < 1.5, or only-significant results disappear when restricted to Tier 1 feeds (means the "signal" was timestamp noise).

---

## Hard constraints

- No `pandas.DataFrame.iterrows` over the article table — use vectorized ops or SQL aggregation. The article table is large enough that naive Python loops will take hours.
- All yfinance calls must be cached locally. Hitting yfinance unrate-limited is rude and unreliable.
- Don't introduce new top-level dependencies beyond: `yfinance`, `pandas`, `numpy`, `scipy.stats`, `scikit-learn` (for TF-IDF), `trafilatura` or equivalent. Anything else, flag it for review first.
- Do not modify any existing Pulse scheduler, classifier, or scoring code. This phase only *reads* the existing data and adds new tables/scripts/reports.
- All scripts idempotent and re-runnable. Use upsert patterns on result tables.

## Deliverables

1. `scripts/audit_pubdate_reliability.py` + `reports/feed_reliability.md`.
2. `scripts/event_study.py` + new `event_study_results` table populated.
3. `notebooks/a1_signal_check.ipynb` + `reports/a1_results.md`.
4. A short `PHASE_A1_RESULT.md` at repo root summarizing pass/fail/marginal with the specific numbers and the recommended next step.

When you finish, do not auto-proceed to Phase A2. Stop and surface the result for human go/no-go.
