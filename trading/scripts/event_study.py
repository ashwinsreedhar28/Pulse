#!/usr/bin/env python3
"""A1.2 — event-study harness.

For every (article, ticker) pair, compute forward excess return over several
horizons and persist it. This is the measurement layer; A1.3 does the
statistics.

Excess return, not raw return. A ticker that rose 2% on a day the whole
sector rose 2% carries no information, and news arrival correlates with
market-wide volatility, so unadjusted returns would mostly measure beta.
Benchmark is the sector ETF where the sector is known, SPY otherwise.

Price sources, in order:
  1. Pulse's own market_bars (migration v55) — local, free, and for
     1-minute data the only copy that will ever exist, since Yahoo serves
     roughly 30 days of intraday history.
  2. yfinance, cached into trading_yfinance_bars_cache.

Idempotent: results are upserted on (articleId, symbol, horizon).
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.db import connect, load_events  # noqa: E402

# Trading-day offsets. 1h/4h need intraday bars and are only computable where
# market_bars has 1m coverage; 1d/5d run off daily bars.
HORIZONS = {"1d": 1, "5d": 5}
INTRADAY_HORIZONS = {"1h": 60, "4h": 240}

# Sector -> benchmark ETF.
#
# Keyed on the labels `tickers.sector` ACTUALLY contains, which are Pulse's
# own taxonomy, not GICS. This matters enormously and was got wrong first
# time: an earlier version keyed on GICS names ("Information Technology",
# "Health Care"), matched almost nothing, and silently benchmarked all 40
# semiconductor names against SPY. Semis moved very differently from the
# broad market over the sample, so every one of them showed a large uniform
# "excess return" — the study reported a confident PASS that was pure
# sector beta.
#
# Semis get SOXX specifically. Benchmarking a semiconductor stock against a
# broad tech ETF leaves most of the cycle in the residual.
#
# Lookup is case-insensitive because the column mixes "Energy"/"energy" and
# "Semiconductors"/"semi".
SECTOR_ETF = {
    "semiconductors": "SOXX",
    "semi": "SOXX",
    "electronic components": "SOXX",
    "electronic manufacturing": "SOXX",
    "quantum computing": "SOXX",
    "technology": "XLK",
    "technology hardware": "XLK",
    "hardware": "XLK",
    "cloud infrastructure": "XLK",
    "cloud": "XLK",
    "healthcare": "XLV",
    "health care": "XLV",
    "financial services": "XLF",
    "financials": "XLF",
    "energy": "XLE",
    "consumer cyclical": "XLY",
    "consumer discretionary": "XLY",
    "consumer defensive": "XLP",
    "consumer staples": "XLP",
    "industrials": "XLI",
    "aerospace": "XLI",
    "aerospace & defense": "XLI",
    "auto": "XLY",
    "materials": "XLB",
    "utilities": "XLU",
    "real estate": "XLRE",
    "communication services": "XLC",
}
DEFAULT_BENCHMARK = "SPY"


def benchmark_for(sector: str | None) -> str:
    if not sector:
        return DEFAULT_BENCHMARK
    return SECTOR_ETF.get(sector.strip().lower(), DEFAULT_BENCHMARK)


def daily_series(conn, symbol: str) -> dict[str, float]:
    """date -> close, from market_bars first, then the yfinance cache."""
    out: dict[str, float] = {}
    for row in conn.execute(
        """SELECT tsMs, close FROM market_bars
            WHERE symbol = ? AND intervalLabel = '1d' AND close IS NOT NULL
            ORDER BY tsMs""",
        (symbol.upper(),),
    ):
        d = datetime.fromtimestamp(row["tsMs"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        out[d] = row["close"]
    if out:
        return out
    for row in conn.execute(
        """SELECT tsMs, close FROM trading_yfinance_bars_cache
            WHERE symbol = ? AND intervalLabel = '1d' AND close IS NOT NULL
            ORDER BY tsMs""",
        (symbol.upper(),),
    ):
        d = datetime.fromtimestamp(row["tsMs"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        out[d] = row["close"]
    return out


def fetch_and_cache(conn, symbols: list[str], period: str = "2y") -> int:
    """Populate the daily cache for symbols we lack. One yfinance call each."""
    try:
        import yfinance as yf
    except ImportError:
        print("yfinance missing. Run: pip install -r trading/requirements.txt")
        return 0

    stored = 0
    for sym in symbols:
        try:
            hist = yf.Ticker(sym).history(period=period, interval="1d", auto_adjust=False)
        except Exception as exc:  # noqa: BLE001 - third-party raises broadly
            print(f"  {sym}: fetch failed ({exc})")
            continue
        if hist is None or hist.empty:
            continue
        rows = []
        for ts, r in hist.iterrows():
            rows.append(
                (
                    sym.upper(),
                    "1d",
                    int(ts.timestamp() * 1000),
                    float(r.get("Open", 0) or 0),
                    float(r.get("High", 0) or 0),
                    float(r.get("Low", 0) or 0),
                    float(r.get("Close", 0) or 0),
                    float(r.get("Volume", 0) or 0),
                )
            )
        conn.executemany(
            """INSERT OR IGNORE INTO trading_yfinance_bars_cache
                 (symbol, intervalLabel, tsMs, open, high, low, close, volume)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
        stored += len(rows)
    conn.commit()
    return stored


def forward_return(series: dict[str, float], start: str, trading_days: int) -> float | None:
    """Return from the first session at/after `start` to `trading_days` later.

    Walks the actual keys rather than adding calendar days, so weekends and
    holidays are skipped by construction — the series only contains sessions.
    """
    dates = sorted(series)
    idx = None
    for i, d in enumerate(dates):
        if d >= start:
            idx = i
            break
    if idx is None or idx + trading_days >= len(dates):
        return None
    p0 = series[dates[idx]]
    p1 = series[dates[idx + trading_days]]
    if not p0:
        return None
    return (p1 - p0) / p0


def main() -> int:
    conn = connect()
    events = load_events(conn)
    if not events:
        print("No archived events. Let Pulse run first.")
        return 1

    sectors = {
        r["symbol"]: r["sector"]
        for r in conn.execute("SELECT symbol, sector FROM tickers WHERE sector IS NOT NULL")
    }

    symbols = sorted({e["symbol"] for e in events})
    benchmarks = sorted({benchmark_for(sectors.get(s)) for s in symbols})
    print(f"{len(events)} events · {len(symbols)} symbols · {len(benchmarks)} benchmarks")

    need = [s for s in symbols + benchmarks if not daily_series(conn, s)]
    if need:
        print(f"Fetching daily bars for {len(need)} symbols…")
        fetch_and_cache(conn, need)

    series_cache: dict[str, dict[str, float]] = {}

    def series(sym: str) -> dict[str, float]:
        if sym not in series_cache:
            series_cache[sym] = daily_series(conn, sym)
        return series_cache[sym]

    now = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    rows: list[tuple] = []
    skipped = 0

    for e in events:
        sym = e["symbol"]
        px = series(sym)
        if not px:
            skipped += 1
            continue
        bench_sym = benchmark_for(sectors.get(sym))
        bench = series(bench_sym)
        if not bench:
            skipped += 1
            continue

        published = datetime.fromtimestamp(e["publishedAt"] / 1000, tz=timezone.utc)
        # News after the close belongs to the next session: measuring from the
        # same day's close would use a price set before the news existed.
        if published.hour >= 21:
            published += timedelta(days=1)
        start = published.strftime("%Y-%m-%d")

        for label, days in HORIZONS.items():
            r_t = forward_return(px, start, days)
            r_b = forward_return(bench, start, days)
            if r_t is None or r_b is None:
                continue
            rows.append(
                (
                    e["articleId"],
                    sym,
                    label,
                    e["publishedAt"],
                    r_t,
                    r_b,
                    r_t - r_b,
                    e["urgencyScore"],
                    None,  # timingTier — A1.1 fills this in
                    e["strength"],
                    None,  # tickerActive
                    None,  # marketCapBucket
                    now,
                )
            )

    conn.executemany(
        """
        INSERT INTO trading_event_study_results
          (articleId, symbol, horizon, t0Ms, tickerReturn, benchmarkReturn,
           excessReturn, urgencyScore, timingTier, mentionStrength,
           tickerActive, marketCapBucket, computedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(articleId, symbol, horizon) DO UPDATE SET
          tickerReturn = excluded.tickerReturn,
          benchmarkReturn = excluded.benchmarkReturn,
          excessReturn = excluded.excessReturn,
          computedAt = excluded.computedAt
        """,
        rows,
    )
    conn.commit()

    print(f"wrote {len(rows)} rows · skipped {skipped} events with no price data")
    print(f"note: {sorted(INTRADAY_HORIZONS)} need 1m bars; market_bars is still filling")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
