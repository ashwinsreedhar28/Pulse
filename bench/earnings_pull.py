"""Earnings calendar 2017-01-01 .. 2026-12-31 for the held tickers (Experiment 3, covariate C3).
Run natively:   python bench/earnings_pull.py
Source: api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD, one request per weekday (verified
2026-10-21: 2023-02-22 -> 163 rows incl. NVDA, time 'time-not-supplied', surprise 35.42). Keeps rows
for the 75 held symbols (bench/data/gkg_daily_v2.csv). Headers as nasdaqCalendarService.ts. 2 s apart,
resumable by date. Output: bench/data/earnings_calendar.csv
(date,symbol,time,eps,eps_forecast,surprise_pct,n_ests,fiscal_quarter) and earnings_raw/YYYY.jsonl.
"""
import csv
import datetime as dt
import json
import os
import time
import urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
URL = "https://api.nasdaq.com/api/calendar/earnings?date={d}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://www.nasdaq.com",
    "Referer": "https://www.nasdaq.com/",
}


def num(s):
    if s in (None, "", "N/A", "--"):
        return ""
    return str(s).replace("$", "").replace(",", "").replace("(", "-").replace(")", "")


def main():
    held = sorted({r["symbol"] for r in csv.DictReader(open(os.path.join(OUT, "gkg_daily_v2.csv")))})
    os.makedirs(os.path.join(OUT, "earnings_raw"), exist_ok=True)
    path = os.path.join(OUT, "earnings_calendar.csv")
    done_path = os.path.join(OUT, "earnings_dates_done.txt")
    done = set(open(done_path).read().split()) if os.path.exists(done_path) else set()
    new = not os.path.exists(path)
    d, end = dt.date(2017, 1, 1), dt.date(2026, 12, 31)
    with open(path, "a", newline="") as f, open(done_path, "a") as dl:
        w = csv.writer(f)
        if new:
            w.writerow(["date", "symbol", "time", "eps", "eps_forecast", "surprise_pct", "n_ests", "fiscal_quarter"])
        while d <= end:
            ds = str(d)
            if d.weekday() < 5 and ds not in done:
                for attempt in range(1, 7):
                    time.sleep(2.0)
                    try:
                        j = json.loads(urllib.request.urlopen(urllib.request.Request(URL.format(d=ds), headers=HEADERS), timeout=60).read())
                        break
                    except Exception as e:
                        print(f"  {ds} {type(e).__name__}: {e} (attempt {attempt})", flush=True)
                        time.sleep(30 * attempt)
                else:
                    raise RuntimeError(f"giving up on {ds}")
                rows = ((j or {}).get("data") or {}).get("rows") or []
                with open(os.path.join(OUT, "earnings_raw", f"{d.year}.jsonl"), "a") as rf:
                    rf.write(json.dumps({"date": ds, "rows": rows}) + "\n")
                mine = [r for r in rows if r.get("symbol") in held]
                for r in mine:
                    w.writerow([ds, r["symbol"], r.get("time", ""), num(r.get("eps")), num(r.get("epsForecast")),
                                num(r.get("surprise")), num(r.get("noOfEsts")), r.get("fiscalQuarterEnding", "")])
                f.flush()
                dl.write(ds + "\n")
                dl.flush()
                if mine or d.day == 1:
                    print(f"{ds}: {len(rows)} rows, held: {' '.join(r['symbol'] for r in mine) or '-'}", flush=True)
            d += dt.timedelta(days=1)


if __name__ == "__main__":
    main()
