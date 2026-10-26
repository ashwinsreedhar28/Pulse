"""Daily OHLCV, ~10 years, for the held tickers plus benchmark ETFs and the VIX index.
Input for Experiment 2 (price/volume forecasting with Timestral; see the Runpod project's plan).

Run natively:   python bench/prices_pull.py [SYM ...]
Source: api.nasdaq.com historical quotes, one request per symbol (limit=9999 returns the full
~10-year window; verified 2026-10-21: NVDA 2,512 rows from 2016-10-21). Prices and volume are
SPLIT-adjusted (NVDA 2024-06-07 $120.89 / 06-10 $121.79 across the 10:1 split) but NOT dividend-
adjusted, so close-to-close returns are price returns. Yahoo was the first choice and is blocked for
this IP after Pulse's 429 storms on 2026-10-20 (2 h of 429s with the app closed).
Headers mirror src/main/services/nasdaqCalendarService.ts. Paced 2 s apart; resumable.
Output (bench/data/, git-ignored): prices_daily.csv (symbol,date,open,high,low,close,volume),
prices_raw/SYM.json.
"""
import csv
import datetime as dt
import json
import os
import sqlite3
import sys
import time
import urllib.parse
import urllib.request

DB = os.path.expanduser("~/Library/Application Support/pulse/pulse.db")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
BASE = "https://api.nasdaq.com/api/quote/{sym}/historical"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://www.nasdaq.com",
    "Referer": "https://www.nasdaq.com/",
}
PACE_S = 2.0
BENCHMARKS = {"SPY": "etf", "QQQ": "etf", "SMH": "etf", "SOXX": "etf", "VIX": "index"}


def num(s):
    if s in (None, "", "N/A", "--"):
        return None
    return float(str(s).replace("$", "").replace(",", ""))


def fetch(sym, assetclass):
    today = dt.date.today()
    q = urllib.parse.urlencode({"assetclass": assetclass, "fromdate": str(today.replace(year=today.year - 10)),
                                "limit": 9999, "todate": str(today)})
    url = BASE.format(sym=urllib.parse.quote(sym)) + "?" + q
    for attempt in range(1, 9):
        time.sleep(PACE_S)
        try:
            j = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60).read())
            return j
        except Exception as e:
            wait = 60 * attempt
            print(f"    {sym} {type(e).__name__}: {e} (attempt {attempt}); waiting {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"giving up on {sym}")


def rows_of(j):
    t = ((j or {}).get("data") or {}).get("tradesTable") or {}
    out = {}
    for r in t.get("rows") or []:
        day = dt.datetime.strptime(r["date"], "%m/%d/%Y").date()
        c = num(r.get("close"))
        if c is None:
            continue
        out[str(day)] = (num(r.get("open")), num(r.get("high")), num(r.get("low")), c, num(r.get("volume")))
    return out


def main():
    os.makedirs(os.path.join(OUT, "prices_raw"), exist_ok=True)
    if not os.path.exists(os.path.join(OUT, ".gitignore")):
        open(os.path.join(OUT, ".gitignore"), "w").write("*\n")
    if sys.argv[1:]:
        todo = [(s, "stocks") for s in sys.argv[1:]]
    else:
        con = sqlite3.connect(f"file:{urllib.parse.quote(DB)}?mode=ro", uri=True)
        held = [r[0] for r in con.execute("SELECT symbol FROM tickers WHERE isActive = 1 ORDER BY symbol")]
        con.close()
        todo = [(s, "stocks") for s in held] + list(BENCHMARKS.items())
    path = os.path.join(OUT, "prices_daily.csv")
    done = {r["symbol"] for r in csv.DictReader(open(path))} if os.path.exists(path) else set()
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["symbol", "date", "open", "high", "low", "close", "volume"])
        for i, (sym, ac) in enumerate(todo, 1):
            if sym in done:
                continue
            j = fetch(sym, ac)
            rows = rows_of(j)
            if not rows and ac == "stocks":  # some ADRs/ETFs are filed under another asset class
                for alt in ("etf", "index"):
                    j = fetch(sym, alt)
                    rows = rows_of(j)
                    if rows:
                        break
            json.dump(j, open(os.path.join(OUT, "prices_raw", f"{sym}.json"), "w"))
            for day in sorted(rows):
                w.writerow([sym, day, *rows[day]])
            f.flush()
            span = f"{min(rows)}..{max(rows)}" if rows else "NONE"
            print(f"[{i}/{len(todo)}] {sym:6s} days={len(rows):5d} {span}", flush=True)


if __name__ == "__main__":
    main()
