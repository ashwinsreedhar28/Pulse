#!/usr/bin/env python3
"""Throughput and batched cost against a worker-vllm queue endpoint.

Usage:
  export RUNPOD_API_KEY=... ENDPOINT_ID=... MODEL=qwen/qwen3-8b
  python bench/throughput.py --gpu "24GBPRO-1.10" --rate 1.10 --n 200 --concurrency 8 --label prefix_off

Sends --n scoring requests through --concurrency threads, each via /runsync
(polled to completion) so Runpod's delayTime/executionTime are captured per
job. Writes one row per request to results_throughput.csv and prints a
summary: wall clock, p50/p95 executionTime, articles/s, tokens/s, and cost
per 1,000 articles = wall_s * rate/3600 / n * 1000.

The system prompt carries a 75-ticker watchlist so prefill is sized like
Pulse's real finance prompt (~600 tokens per CC's read), not the 3-ticker
prompt coldstart.py uses. Replace TICKERS with the frozen list from
bench/articles_50.json once CC commits it.

Run it once with prefix caching off and once with it on (endpoint edit),
using --label to tag the rows.
"""
import argparse, csv, json, os, sys, time, threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import requests

API = "https://api.runpod.ai/v2"
KEY = os.environ["RUNPOD_API_KEY"]
EID = os.environ["ENDPOINT_ID"]
MODEL = os.environ.get("MODEL", "qwen/qwen3-8b")
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
CSV = "results_throughput.csv"
FIELDS = ["ts_utc", "endpoint_id", "gpu", "model", "label", "n", "concurrency", "req",
          "wall_ms", "delay_ms", "exec_ms", "status", "prompt_tokens",
          "completion_tokens", "finish_reason", "score", "error"]

TICKERS = [
    ("NVDA", "NVIDIA"), ("TSM", "Taiwan Semiconductor"), ("AAPL", "Apple"), ("MSFT", "Microsoft"),
    ("AMZN", "Amazon"), ("GOOGL", "Alphabet"), ("META", "Meta Platforms"), ("AVGO", "Broadcom"),
    ("AMD", "Advanced Micro Devices"), ("ASML", "ASML Holding"), ("AMAT", "Applied Materials"),
    ("LRCX", "Lam Research"), ("KLAC", "KLA"), ("MU", "Micron Technology"), ("INTC", "Intel"),
    ("QCOM", "Qualcomm"), ("TXN", "Texas Instruments"), ("ARM", "Arm Holdings"), ("MRVL", "Marvell Technology"),
    ("SNPS", "Synopsys"), ("CDNS", "Cadence Design Systems"), ("ANET", "Arista Networks"),
    ("SMCI", "Super Micro Computer"), ("DELL", "Dell Technologies"), ("VRT", "Vertiv"),
    ("ORCL", "Oracle"), ("CRM", "Salesforce"), ("NOW", "ServiceNow"), ("ADBE", "Adobe"),
    ("PLTR", "Palantir"), ("SNOW", "Snowflake"), ("NET", "Cloudflare"), ("DDOG", "Datadog"),
    ("TSLA", "Tesla"), ("F", "Ford Motor"), ("GM", "General Motors"), ("TM", "Toyota Motor"),
    ("JPM", "JPMorgan Chase"), ("GS", "Goldman Sachs"), ("MS", "Morgan Stanley"), ("BAC", "Bank of America"),
    ("V", "Visa"), ("MA", "Mastercard"), ("BRK.B", "Berkshire Hathaway"), ("BLK", "BlackRock"),
    ("XOM", "Exxon Mobil"), ("CVX", "Chevron"), ("COP", "ConocoPhillips"), ("SLB", "Schlumberger"),
    ("LIN", "Linde"), ("APD", "Air Products"), ("FCX", "Freeport-McMoRan"), ("ALB", "Albemarle"),
    ("UNH", "UnitedHealth"), ("LLY", "Eli Lilly"), ("NVO", "Novo Nordisk"), ("PFE", "Pfizer"),
    ("MRK", "Merck"), ("ABBV", "AbbVie"), ("TMO", "Thermo Fisher Scientific"), ("ISRG", "Intuitive Surgical"),
    ("CAT", "Caterpillar"), ("DE", "Deere"), ("HON", "Honeywell"), ("GE", "GE Aerospace"),
    ("BA", "Boeing"), ("LMT", "Lockheed Martin"), ("RTX", "RTX"), ("UPS", "United Parcel Service"),
    ("WMT", "Walmart"), ("COST", "Costco"), ("HD", "Home Depot"), ("NKE", "Nike"), ("SBUX", "Starbucks"),
    ("DIS", "Walt Disney"),
]
assert len(TICKERS) == 75, len(TICKERS)

SYSTEM = (
    "You are a financial news urgency scorer. Given a news headline and summary, "
    "score its urgency from 1 to 5 for an investor holding the following stocks: "
    + ", ".join(f"{s} ({n})" for s, n in TICKERS) + ". "
    "Consider: Does this news directly impact any of these holdings? Could it affect their "
    "supply chain, customers, or competitors? Is this breaking news or routine coverage? "
    'Respond in JSON only: {"score": N, "reason": "brief explanation"} '
    "Keep reason to one sentence under 20 words."
)

EVENTS = [
    ("{co} beats quarterly revenue estimates on {seg} demand", "Shares rose in extended trading after the company reported revenue above consensus and raised full-year guidance."),
    ("{co} recalls {seg} product after regulator inquiry", "The company said the recall affects a limited number of units and it is cooperating with regulators."),
    ("{co} announces $5 billion buyback", "The board authorized the repurchase program, which has no expiration date, alongside a dividend increase."),
    ("{co} CEO to step down at year end", "The company said a search for a successor is under way and the transition is expected to be orderly."),
    ("{co} warns of {seg} supply constraints through next quarter", "Management cited component shortages and said it expects the situation to ease later in the year."),
    ("{co} signs multiyear {seg} supply agreement", "Terms were not disclosed. Analysts said the deal could add low single digits to revenue."),
    ("Regulators open antitrust probe into {co}", "The inquiry focuses on the company's {seg} business practices, according to people familiar with the matter."),
    ("{co} to cut 4% of workforce", "The company said the reductions are part of a broader efficiency effort and will result in a one-time charge."),
    ("{co} raises prices on {seg} lineup", "The increase averages about 5% and takes effect next month, the company said in a note to customers."),
    ("{co} data center outage disrupts {seg} customers", "Service was restored after several hours. The company said it is investigating the root cause."),
]
SEGMENTS = ["AI accelerator", "cloud", "consumer", "enterprise", "automotive", "memory", "networking", "energy", "pharma", "logistics"]


def make_user(i):
    sym, co = TICKERS[i % len(TICKERS)]
    title, summary = EVENTS[(i // len(TICKERS)) % len(EVENTS)]
    seg = SEGMENTS[i % len(SEGMENTS)]
    return f"Headline: {title.format(co=co, seg=seg)}\nSummary: {summary.format(seg=seg)}"


def body(i):
    return {"input": {"route": "/v1/chat/completions", "method": "POST", "body": {
        "model": MODEL,
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": make_user(i)}],
        "max_tokens": 128, "temperature": 0,
        "chat_template_kwargs": {"enable_thinking": False},
    }}}


def call(i):
    t0 = time.perf_counter()
    try:
        r = requests.post(f"{API}/{EID}/runsync", headers=H, json=body(i), timeout=330)
        j = r.json()
        while j.get("status") in ("IN_QUEUE", "IN_PROGRESS"):
            time.sleep(0.5)
            j = requests.get(f"{API}/{EID}/status/{j['id']}", headers=H, timeout=15).json()
    except Exception as e:  # noqa: BLE001
        return {"req": i, "wall_ms": round((time.perf_counter() - t0) * 1000), "status": "EXC", "error": str(e)[:200]}
    wall = (time.perf_counter() - t0) * 1000
    out = j.get("output")
    if isinstance(out, list) and out:
        out = out[0]
    usage = out.get("usage", {}) if isinstance(out, dict) else {}
    text, finish, score = "", "", ""
    try:
        choice = out["choices"][0]
        text = (choice.get("message") or {}).get("content") or ""
        finish = choice.get("finish_reason") or ""
        score = json.loads(text).get("score", "")
    except Exception:  # noqa: BLE001
        pass
    return {"req": i, "wall_ms": round(wall), "delay_ms": j.get("delayTime"),
            "exec_ms": j.get("executionTime"), "status": j.get("status"),
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "finish_reason": finish, "score": score,
            "error": (j.get("error") or "") if isinstance(j.get("error"), str) else json.dumps(j.get("error") or "")[:200]}


lock = threading.Lock()


def write(row):
    with lock:
        new = not os.path.exists(CSV)
        with open(CSV, "a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            if new:
                w.writeheader()
            w.writerow(row)


def pct(xs, p):
    xs = sorted(xs)
    if not xs:
        return None
    k = max(0, min(len(xs) - 1, round(p / 100 * (len(xs) - 1))))
    return xs[k]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gpu", required=True)
    ap.add_argument("--rate", type=float, required=True, help="$/hr for the placed GPU tier")
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--label", default="prefix_off")
    a = ap.parse_args()

    # Warm-up: one request so the run doesn't include a cold start or a
    # restored worker's slow first call. Its row is written with req=-1.
    print("warm-up request...", flush=True)
    w = call(-1)
    print(f"   delay={w.get('delay_ms')} exec={w.get('exec_ms')} {w.get('status')} {w.get('error','')}", flush=True)
    if w.get("status") != "COMPLETED":
        sys.exit("warm-up failed; not running the batch")
    base = {"ts_utc": "", "endpoint_id": EID, "gpu": a.gpu, "model": MODEL, "label": a.label,
            "n": a.n, "concurrency": a.concurrency}
    write({**base, "ts_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), **w})

    print(f"batch: n={a.n} concurrency={a.concurrency} label={a.label}", flush=True)
    t0 = time.perf_counter()
    rows = []
    with ThreadPoolExecutor(max_workers=a.concurrency) as ex:
        futs = [ex.submit(call, i) for i in range(a.n)]
        for fut in as_completed(futs):
            res = fut.result()
            row = {**base, "ts_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), **res}
            write(row)
            rows.append(res)
            if len(rows) % 25 == 0:
                print(f"   {len(rows)}/{a.n} done, {time.perf_counter() - t0:.0f}s", flush=True)
    wall_s = time.perf_counter() - t0

    ok = [r for r in rows if r.get("status") == "COMPLETED"]
    execs = [r["exec_ms"] for r in ok if r.get("exec_ms") is not None]
    delays = [r["delay_ms"] for r in ok if r.get("delay_ms") is not None]
    ptok = sum(r.get("prompt_tokens") or 0 for r in ok)
    ctok = sum(r.get("completion_tokens") or 0 for r in ok)
    parsed = sum(1 for r in ok if r.get("score") != "")
    cost = wall_s * a.rate / 3600
    print("\nSUMMARY")
    print(f"  label={a.label} gpu={a.gpu} rate=${a.rate}/hr n={a.n} concurrency={a.concurrency}")
    print(f"  completed {len(ok)}/{a.n}, parsed JSON {parsed}/{len(ok)}")
    print(f"  wall {wall_s:.1f}s -> {len(ok) / wall_s:.2f} articles/s")
    print(f"  exec_ms p50 {pct(execs, 50)} p95 {pct(execs, 95)} max {max(execs) if execs else None}")
    print(f"  delay_ms p50 {pct(delays, 50)} p95 {pct(delays, 95)} max {max(delays) if delays else None}")
    print(f"  prompt tokens/article {ptok / max(len(ok), 1):.0f}, completion tokens/article {ctok / max(len(ok), 1):.0f}")
    print(f"  aggregate {(ptok + ctok) / wall_s:.0f} tok/s ({ctok / wall_s:.0f} generated tok/s)")
    print(f"  worker cost for the batch ${cost:.4f} -> ${cost / max(len(ok), 1) * 1000:.4f} per 1,000 articles (excludes cold start)")


if __name__ == "__main__":
    main()
