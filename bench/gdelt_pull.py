"""Daily GDELT news volume per held ticker (Timestral plan, option 3: external backtest source).

Run natively on the Mac (GDELT is not reachable from the VM or the cloud workspace):
    python bench/gdelt_pull.py
Reads the held list (tickers.isActive = 1) from pulse.db read-only. One DOC 2.0 timelinevolraw
call per ticker, 2017-01-01 to yesterday, all languages, paced 15 s apart (6-10 s drew 429s on 10-year queries).
If a response is not daily, the window is split in half until it is. Raw responses are kept.
Outputs (bench/data/, git-ignored):
    gdelt_queries.csv   symbol, companyName, query, source (map | FALLBACK)
    gdelt_raw/SYM.json  raw response text per call
    gdelt_daily.csv     symbol, date (UTC day), count, norm (all articles GDELT saw that day)
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
START = dt.date(2017, 1, 1)  # timeline modes reach back to 2017-01-01
END = dt.date.today()  # exclusive: last complete UTC day is yesterday
API = "https://api.gdeltproject.org/api/v2/doc/doc"
PACE_S = 15.0
# "" = all languages (GDELT translates non-English sources); v1 used " sourcelang:english".
LANG_FILTER = ""

# Explicit phrases. Bare words that collide with ordinary English or places are avoided.
Q = {
    "NVDA": ["Nvidia"], "AMD": ["Advanced Micro Devices", "AMD"], "AVGO": ["Broadcom"], "QCOM": ["Qualcomm"],
    "MRVL": ["Marvell Technology", "Marvell"], "ARM": ["Arm Holdings"], "LSCC": ["Lattice Semiconductor"],
    "INTC": ["Intel"], "ON": ["onsemi", "ON Semiconductor"], "MU": ["Micron Technology"],
    "STM": ["STMicroelectronics"], "NXPI": ["NXP Semiconductors"], "MCHP": ["Microchip Technology"],
    "WOLF": ["Wolfspeed"], "TSM": ["TSMC", "Taiwan Semiconductor"], "GFS": ["GlobalFoundries"],
    "UMC": ["United Microelectronics"], "ASML": ["ASML"], "AMAT": ["Applied Materials"], "LRCX": ["Lam Research"],
    "KLAC": ["KLA Corp", "KLA Corporation"], "TER": ["Teradyne"], "ONTO": ["Onto Innovation"],
    "UCTT": ["Ultra Clean Holdings"], "ACLS": ["Axcelis"], "COHR": ["Coherent Corp"], "FORM": ["FormFactor"],
    "SNPS": ["Synopsys"], "CDNS": ["Cadence Design"], "AMKR": ["Amkor"], "ASX": ["ASE Technology", "ASE Group"],
    "ENTG": ["Entegris"], "MKSI": ["MKS Instruments"], "LIN": ["Linde"], "FCX": ["Freeport-McMoRan", "Freeport McMoRan"],
    "APH": ["Amphenol"], "CLS": ["Celestica"], "CRWV": ["CoreWeave"], "GLW": ["Corning Inc", "Corning Incorporated"],
    "CRDO": ["Credo Technology"], "LITE": ["Lumentum"], "MPWR": ["Monolithic Power"], "RKLB": ["Rocket Lab"],
    "SNDK": ["Sandisk"], "VRT": ["Vertiv"], "ATEYY": ["Advantest"], "VICR": ["Vicor"], "ADEA": ["Adeia"],
    "RMBS": ["Rambus"], "QRVO": ["Qorvo"], "COHU": ["Cohu"], "CE": ["Celanese"], "CRUS": ["Cirrus Logic"],
    "JCI": ["Johnson Controls"], "SWKS": ["Skyworks"], "TEL": ["TE Connectivity"], "MTSI": ["MACOM"],
    "PH": ["Parker Hannifin", "Parker-Hannifin"], "SMCI": ["Supermicro", "Super Micro Computer"],
    "ETN": ["Eaton Corp", "Eaton Corporation"], "KLIC": ["Kulicke"], "CAMT": ["Camtek"], "CIEN": ["Ciena"],
    "CSCO": ["Cisco"], "ANET": ["Arista Networks"], "ALAB": ["Astera Labs"], "AEIS": ["Advanced Energy Industries"],
    "STX": ["Seagate"], "WDC": ["Western Digital"], "FLEX": ["Flex Ltd", "Flextronics"], "JBL": ["Jabil"],
    "AAOI": ["Applied Optoelectronics"], "SIMO": ["Silicon Motion"], "FN": ["Fabrinet"], "SPCX": ["SpaceX", "Space Exploration Technologies"],
}
SUFFIXES = (" Corporation", " Corp.", " Corp", " Inc.", " Inc", " Holdings", " Holding", " plc", " Ltd.", " Ltd",
            " N.V.", " S.A.", " Co.", " Group", " Technologies", " Technology")


def query_for(symbol, name):
    terms, src = Q.get(symbol), "map"
    if not terms:
        n = name or symbol
        for s in SUFFIXES:
            n = n[: -len(s)] if n.endswith(s) else n
        terms, src = [n.strip()], "FALLBACK"
    phrases = [f'"{t}"' if " " in t or "-" in t else t for t in terms]
    core = phrases[0] if len(phrases) == 1 else "(" + " OR ".join(phrases) + ")"
    return core + LANG_FILTER, src


def get(query, start, end):
    params = {"query": query, "mode": "timelinevolraw", "format": "json",
              "startdatetime": start.strftime("%Y%m%d000000"), "enddatetime": end.strftime("%Y%m%d000000")}
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(1, 31):  # ~3.5 h of patience; resumable anyway
        time.sleep(PACE_S)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pulse-bench/0.1 (personal research)"})
            text = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
        except Exception as e:  # network / 429
            text = f"__error__ {e}"
        if text.strip().startswith("{"):
            return text
        print(f"    non-JSON (attempt {attempt}): {text.strip()[:120]!r}", flush=True)
        time.sleep(min(60 * attempt, 600))
    raise RuntimeError(f"giving up on {query} {start}..{end}")


def parse(text):
    d = json.loads(text)
    tl = d.get("timeline") or []
    if not tl:
        return []  # {} = no matching articles in the window
    out = []
    for p in tl[0]["data"]:
        day = dt.datetime.strptime(p["date"][:8], "%Y%m%d").date()
        out.append((day, int(p["value"]), int(p.get("norm", 0) or 0)))
    return out


def fetch(symbol, query, start, end, raw):
    text = get(query, start, end)
    raw.append({"start": str(start), "end": str(end), "text": text})
    pts = parse(text)
    if len(pts) >= 2:
        step = min((b[0] - a[0]).days for a, b in zip(pts, pts[1:]))
        if step > 1 and (end - start).days > 2:
            mid = start + (end - start) // 2
            print(f"    step {step}d over {start}..{end}; splitting", flush=True)
            return fetch(symbol, query, start, mid, raw) + fetch(symbol, query, mid, end, raw)
        if step < 1:  # sub-daily: sum to UTC days
            agg = {}
            for day, v, n in pts:
                a = agg.setdefault(day, [0, 0]); a[0] += v; a[1] += n
            pts = [(k, v[0], v[1]) for k, v in sorted(agg.items())]
    return pts


def main():
    os.makedirs(os.path.join(OUT, "gdelt_raw"), exist_ok=True)
    with open(os.path.join(OUT, ".gitignore"), "w") as f:
        f.write("*\n")
    con = sqlite3.connect(f"file:{urllib.parse.quote(DB)}?mode=ro", uri=True)
    held = con.execute("SELECT symbol, companyName FROM tickers WHERE isActive = 1 ORDER BY symbol").fetchall()
    con.close()
    only = set(sys.argv[1:])
    qs = [(s, n, *query_for(s, n)) for s, n in held if not only or s in only]
    with open(os.path.join(OUT, "gdelt_queries.csv"), "w", newline="") as f:
        csv.writer(f).writerows([("symbol", "companyName", "query", "source"), *qs])
    for s, n, q, src in qs:
        if src == "FALLBACK":
            print(f"FALLBACK query for {s} ({n}): {q}")
    daily_path = os.path.join(OUT, "gdelt_daily.csv")
    done = set()
    if os.path.exists(daily_path):
        with open(daily_path) as f:
            done = {r["symbol"] for r in csv.DictReader(f)}
    new_file = not os.path.exists(daily_path)
    with open(daily_path, "a", newline="") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(("symbol", "date", "count", "norm"))
        for i, (s, n, q, src) in enumerate(qs, 1):
            if s in done:
                continue
            raw = []
            pts = fetch(s, q, START, END, raw)
            with open(os.path.join(OUT, "gdelt_raw", f"{s}.json"), "w") as rf:
                json.dump({"symbol": s, "query": q, "calls": raw}, rf)
            for day, v, nm in pts:
                w.writerow((s, day.isoformat(), v, nm))
            f.flush()
            tot = sum(v for _, v, _ in pts)
            span = f"{pts[0][0]}..{pts[-1][0]}" if pts else "none"
            print(f"[{i}/{len(qs)}] {s:6s} days={len(pts):4d} {span} total={tot:7d}  {q}", flush=True)


if __name__ == "__main__":
    main()
