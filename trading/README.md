# Pulse Trading System

News-driven trading research + execution layered on top of Pulse's existing
data surface. Phased build per `docs/trading/`.

## Current phase

**Phase A1 — Signal-existence proof.** Pure measurement; no model, no trades.

## Layout

```
trading/
├── README.md            # this file
├── requirements.txt     # Python deps for all scripts
├── .gitignore           # cache + venv hygiene
├── lib/
│   └── db.py            # Pulse DB connection helpers
├── scripts/
│   ├── audit_pubdate_reliability.py   # A1.1
│   ├── event_study.py                 # A1.2
│   ├── a1_signal_check.py             # A1.3
│   └── a1_dedup.py                    # A1.4
├── cache/               # yfinance bars + scraped page metadata; gitignored
├── reports/             # markdown reports written by scripts
└── PHASE_A1_RESULT.md   # written at end of A1
```

## Setup

One-time:

```sh
cd trading
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

All subsequent invocations:

```sh
source trading/.venv/bin/activate
python trading/scripts/<script>.py
```

## Schema deviations from the Phase A1 brief

Opus's brief made several guesses about Pulse's schema that don't match the
actual code. The scripts here use the real columns:

| Brief says | Pulse actual | Notes |
|---|---|---|
| `articles.feed_id` | `articles.feedId` | camelCase throughout |
| `articles.pubDate` | `articles.publishedAt` (INTEGER ms) | Unix ms epoch |
| `articles.fetched_at` | `articles.scoredAt` (best proxy) | No fetch timestamp persisted; scoredAt fires within seconds of insertion |
| `articles.body` | `articles.summary` | Reader-mode body is fetched on-demand and never persisted; RSS summary is what we have |
| `articles.urgency_score` | `articles.urgencyScore` | |
| `articles.urgency_source` | (does not exist) | Pulse doesn't record which model produced the score; treat all sources equally |
| `article_tickers` table | `article_ticker_matches` | columns: articleId, symbol, strength (strong/weak) |
| `mention_type` (active/passive) | derived: join `article_ticker_matches.symbol` to `tickers.isActive` | |

Other brief-vs-reality differences:

- **Feed count:** brief says 44 feeds; live DB has 212 (Discovery feature grows
  the list). Scripts iterate over whatever's in the `feeds` table.
- **Article retention:** Pulse purges non-bookmarked articles after 30 days
  ([maintenanceService.ts:9](../src/main/services/maintenanceService.ts#L9)).
  The brief assumed 6 months. We work with what's in the DB at run time
  (~30 days at any given moment).
- **Ticker market cap:** not in `tickers` table. Scripts pull from yfinance
  and cache locally.
- **Sector mapping:** `tickers.sector` is populated and reliable — used
  preferentially. yfinance fallback only when null.
- **Reports location:** brief says repo-root `reports/`; trading README pins
  to `trading/reports/`. Following the README.

## Hard rules from the brief (preserved verbatim)

- No `pandas.iterrows` over the article table — vectorized ops or SQL only.
- All yfinance calls cached locally (under `cache/yfinance/`).
- Don't introduce dependencies beyond: `yfinance`, `pandas`, `numpy`,
  `scipy`, `scikit-learn`, `trafilatura`.
- Existing Pulse code is **read-only**. No modifications to schedulers,
  classifiers, scoring, or schema migrations. New tables managed by these
  scripts via `CREATE TABLE IF NOT EXISTS` — prefixed `trading_*` so they
  can never collide with Pulse's namespace.
- Scripts idempotent + re-runnable. Result tables use upsert.

## Database

All trading-system tables live in Pulse's existing SQLite database
(`~/Library/Application Support/Pulse/pulse.db` on macOS). Tables are
prefixed `trading_*` and managed by these scripts, NOT by Pulse's
TypeScript migration system.

Existing Pulse tables are read-only:
- `feeds`, `articles`, `article_ticker_matches`, `tickers`

New trading-system tables:
- `trading_feed_timing` — feed reliability tier from A1.1
- `trading_event_study_results` — event-study output from A1.2
- `trading_yfinance_bars_cache` — cached yfinance bars (1-min + daily)
- `trading_yfinance_meta_cache` — cached ticker.info (sector, marketCap)
- `trading_article_dedup` — first-mention flags from A1.4
