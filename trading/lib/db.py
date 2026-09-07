"""DB connection + trading-system table bootstrap.

Pulse's main SQLite database lives at platform-standard userData. We connect
read-only against Pulse's own tables (articles, feeds, article_ticker_matches,
tickers) and write to a set of trading_* tables created on first use.

Trading-system tables are managed here, NOT in Pulse's TypeScript migration
system, so the trading scripts can't accidentally modify Pulse's schema.
The naming prefix `trading_` is the only thing keeping these from colliding
with Pulse's namespace — keep it.
"""

from __future__ import annotations

import os
import platform
import sqlite3
from pathlib import Path


def _user_data_dir() -> Path:
    if platform.system() == "Darwin":
        return Path.home() / "Library" / "Application Support" / "Pulse"
    if platform.system() == "Windows":  # untested, but Pulse can run there
        return Path(os.environ.get("APPDATA", str(Path.home()))) / "Pulse"
    # Linux + others
    return Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share"))) / "Pulse"


def db_path() -> Path:
    p = _user_data_dir() / "pulse.db"
    if not p.exists():
        raise FileNotFoundError(
            f"Pulse DB not found at {p}. Boot Pulse at least once before running trading scripts."
        )
    return p


def connect() -> sqlite3.Connection:
    """Open a connection with the trading-system tables bootstrapped.

    `detect_types` enables sqlite3 to parse INTEGER timestamps as ints rather
    than promoting to int64-safe Python types automatically; we leave it
    default since Pulse stores Unix-ms epochs as plain INTEGER.
    """
    conn = sqlite3.connect(str(db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    _bootstrap_trading_tables(conn)
    return conn


def _bootstrap_trading_tables(conn: sqlite3.Connection) -> None:
    """Create trading_* tables if missing. Idempotent."""
    cur = conn.cursor()

    # A1.1 — feed reliability tiering. Sidecar to feeds; we never mutate feeds
    # itself (existing Pulse code is read-only per the trading README).
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trading_feed_timing (
            feedId INTEGER PRIMARY KEY REFERENCES feeds(id) ON DELETE CASCADE,
            tier INTEGER NOT NULL CHECK (tier IN (1, 2, 3)),
            sampleSize INTEGER NOT NULL,
            medianDeltaSec INTEGER,
            p90DeltaSec INTEGER,
            fractionOver5min REAL,
            note TEXT,
            updatedAt INTEGER NOT NULL
        )
        """
    )

    # A1.2 — event-study output. One row per (article, ticker, horizon).
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trading_event_study_results (
            articleId INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL,
            horizon TEXT NOT NULL CHECK (horizon IN ('1h', '4h', '1d', '5d')),
            t0Ms INTEGER NOT NULL,
            tickerReturn REAL,
            benchmarkReturn REAL,
            excessReturn REAL,
            urgencyScore INTEGER,
            timingTier INTEGER,
            mentionStrength TEXT,
            tickerActive INTEGER,
            marketCapBucket TEXT,
            computedAt INTEGER NOT NULL,
            PRIMARY KEY (articleId, symbol, horizon)
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_tesr_symbol_horizon ON trading_event_study_results(symbol, horizon)"
    )

    # yfinance caches. Bars cache stores arbitrary-interval rows;
    # primary key (symbol, intervalLabel, tsMs) covers any horizon.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trading_yfinance_bars_cache (
            symbol TEXT NOT NULL,
            intervalLabel TEXT NOT NULL CHECK (intervalLabel IN ('1m', '5m', '1h', '1d')),
            tsMs INTEGER NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume REAL,
            PRIMARY KEY (symbol, intervalLabel, tsMs)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trading_yfinance_meta_cache (
            symbol TEXT PRIMARY KEY,
            sector TEXT,
            industry TEXT,
            marketCap REAL,
            fetchedAt INTEGER NOT NULL
        )
        """
    )

    # A1.4 — first-mention dedup flags.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trading_article_dedup (
            articleId INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            isDuplicate INTEGER NOT NULL CHECK (isDuplicate IN (0, 1)),
            clusterKey TEXT,
            firstMentionArticleId INTEGER,
            computedAt INTEGER NOT NULL,
            PRIMARY KEY (articleId, symbol)
        )
        """
    )

    # A1.1 — per-article scraped-pubdate audit results. Stored so re-runs can
    # incrementally extend coverage instead of re-scraping.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trading_article_pubdate_audit (
            articleId INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
            scrapedPubDateMs INTEGER,
            scrapeMethod TEXT,
            scrapeOk INTEGER NOT NULL CHECK (scrapeOk IN (0, 1)),
            errorMsg TEXT,
            scrapedAt INTEGER NOT NULL
        )
        """
    )

    conn.commit()
