"""Experiment 3, covariate C5: Jev materiality for historical GDELT headlines (2021-2024).

    python bench/jev_titles.py --limit 20        # smoke test
    python bench/jev_titles.py --concurrency 8   # full run, resumable

Same prompt as the 2026-10-21 validity gate (v2-headline row in report_gold.py): quality.py's brief v2
system prompt from articles_300.json, no links block, headline only, jev-1.13.0, argmax score (plus the
expected value, recorded but not used by the pre-registered covariate). Needs TYPESAFE_API_KEY.
Rules (PREREG_EXP3): titles are html-unescaped; a title is scored only if >= 80% of its letters are
ASCII (the gate measured English headlines); others are written with status=non_english and no call.
Symbols outside the Exp 2 universe (no Nasdaq history, or SPCX) are skipped.
In: bench/data/gkg_titles.csv. Out: bench/data/jev_titles.csv.
"""
import argparse
import csv
import html
import os
import sys
import threading
import time
from argparse import Namespace
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import quality  # noqa: E402

DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "jev_titles.csv")
FIELDS = ["symbol", "day", "first_seen", "title", "n_docs", "n_titles_day", "status", "score", "expected", "wall_ms"]
SKIP = {"SPCX", "ATEYY", "QRVO"}


def english(t):
    letters = [c for c in t if c.isalpha()]
    return bool(letters) and sum(c.isascii() for c in letters) / len(letters) >= 0.8


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    quality.FIXTURE = os.path.join(HERE, "articles_300.json")
    fx = quality.load_fixture()
    system = quality.render_fixture_system(fx, {"domain": "finance"}, False)
    ns = Namespace(model="jev-1.13.0")
    priced = {r["symbol"] for r in csv.DictReader(open(os.path.join(DATA, "prices_daily.csv")))}

    done = set()
    if os.path.exists(OUT):
        done = {(r["symbol"], r["day"], r["title"]) for r in csv.DictReader(open(OUT))}
    todo = []
    for r in csv.DictReader(open(os.path.join(DATA, "gkg_titles.csv"))):
        if r["symbol"] in SKIP or r["symbol"] not in priced:
            continue
        r["title"] = html.unescape(r["title"]).strip()
        if (r["symbol"], r["day"], r["title"]) not in done:
            todo.append(r)
    if a.limit:
        todo = todo[: a.limit]
    calls = sum(english(r["title"]) for r in todo)
    print(f"fixture {fx['_sha']}; {len(todo):,} titles to write, {calls:,} Jev calls (~${calls * 0.03 / 1000:.2f} list)", flush=True)

    new = not os.path.exists(OUT)
    lock = threading.Lock()
    f = open(OUT, "a", newline="")
    w = csv.DictWriter(f, fieldnames=FIELDS)
    if new:
        w.writeheader()
    stats = {"n": 0, "err": 0, "t0": time.time()}

    def one(r):
        row = {k: r[k] for k in ("symbol", "day", "first_seen", "title", "n_docs", "n_titles_day")}
        if not english(r["title"]):
            row.update(status="non_english", score="", expected="", wall_ms="")
        else:
            res = {}
            for attempt in range(4):
                try:
                    res = quality.call_jev(ns, system, quality.render_user({"title": r["title"]}, True))
                except Exception as e:  # network
                    res = {"error": f"{type(e).__name__}: {e}"}
                if not res.get("error"):
                    break
                time.sleep(5 * (attempt + 1))
            score, _ = quality.parse_score(res.get("text", ""))
            ok = score is not None and not res.get("error")
            row.update(status="ok" if ok else "error", score=score if ok else "",
                       expected=(res.get("extra") or {}).get("expected", ""), wall_ms=res.get("wall_ms", ""))
        with lock:
            w.writerow(row)
            stats["n"] += 1
            stats["err"] += row["status"] == "error"
            if stats["n"] % 2000 == 0:
                f.flush()
                rate = stats["n"] / (time.time() - stats["t0"])
                print(f"  {stats['n']:,}/{len(todo):,}  {rate:.0f}/s  errors {stats['err']}  "
                      f"eta {(len(todo) - stats['n']) / max(rate, 1e-9) / 60:.0f} min", flush=True)

    with ThreadPoolExecutor(max_workers=a.concurrency) as ex:
        list(ex.map(one, todo))
    f.close()
    print(f"done: {stats['n']:,} rows, {stats['err']} errors -> {OUT}", flush=True)


if __name__ == "__main__":
    main()
