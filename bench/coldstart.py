#!/usr/bin/env python3
"""Day 1: cold start + warm latency against a worker-vllm queue endpoint.

Usage:
  export RUNPOD_API_KEY=... ENDPOINT_ID=... MODEL=qwen/qwen3-8b
  python coldstart.py --gpu 24GB-0.69 --cycles 1 --warm 10            # first cold-start number
  python coldstart.py --gpu 24GB-0.69 --cycles 10 --warm 5 --idle-wait 300   # FlashBoot hit rate at 5 min idle

The first cycle fires immediately; later cycles idle --idle-wait seconds first.
A cycle's cold row is a hit if delay_ms is under ~2 s and workers_before shows
a parked worker, a miss if delay_ms is minutes.

Every request appends one row to results.csv. Nothing is aggregated here;
the CSV is the source of truth.

Timing fields come from Runpod's job status response:
  delayTime     ms from enqueue to a worker picking the job up (includes cold start)
  executionTime ms the handler spent on the job
Verify field names against https://docs.runpod.io/serverless/endpoints/send-requests
"""
import argparse, csv, json, os, sys, time
from datetime import datetime, timezone
import requests

API = "https://api.runpod.ai/v2"
KEY = os.environ["RUNPOD_API_KEY"]
EID = os.environ["ENDPOINT_ID"]
MODEL = os.environ.get("MODEL", "Qwen/Qwen3-8B")
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
CSV = "results.csv"
FIELDS = ["ts_utc", "endpoint_id", "gpu", "model", "kind", "cycle", "req",
          "wall_ms", "delay_ms", "exec_ms", "status", "prompt_tokens",
          "completion_tokens", "finish_reason", "text", "workers_before", "error"]

# Same prompt shape as Pulse's scoreWithOllama (ollamaService.ts buildSystemPrompt,
# finance branch) so the timing reflects the real workload.
SYSTEM = ("You are a financial news urgency scorer. Given a news headline and summary, "
          "score its urgency from 1 to 5 for an investor holding the following stocks: "
          "NVDA, TSM, AAPL. Consider: Does this news directly impact any of these holdings? "
          "Could it affect their supply chain, customers, or competitors? Is this breaking "
          "news or routine coverage? Respond in JSON only: "
          '{"score": N, "reason": "brief explanation"}')
USER = ("Headline: Fed signals no rate change at September meeting\n"
        "Summary: Officials held the federal funds rate steady and signaled patience "
        "on further moves, citing mixed inflation data.")


def health():
    r = requests.get(f"{API}/{EID}/health", headers=H, timeout=15)
    return r.json().get("workers", {})


def body():
    # Generic proxy form so chat_template_kwargs reaches vLLM (Qwen3 thinking off).
    return {"input": {"route": "/v1/chat/completions", "method": "POST", "body": {
        "model": MODEL,
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": USER}],
        "max_tokens": 64, "temperature": 0,
        "chat_template_kwargs": {"enable_thinking": False},
    }}}


def call():
    t0 = time.perf_counter()
    r = requests.post(f"{API}/{EID}/runsync", headers=H, json=body(), timeout=330)
    j = r.json()
    # runsync can return IN_QUEUE / IN_PROGRESS during a long cold start; poll.
    while j.get("status") in ("IN_QUEUE", "IN_PROGRESS"):
        time.sleep(1)
        j = requests.get(f"{API}/{EID}/status/{j['id']}", headers=H, timeout=15).json()
    wall = (time.perf_counter() - t0) * 1000
    out = j.get("output")
    if isinstance(out, list) and out:
        out = out[0]
    usage = (out or {}).get("usage", {}) if isinstance(out, dict) else {}
    text, finish = "", ""
    try:
        choice = out["choices"][0]
        text = (choice.get("message") or {}).get("content") or ""
        finish = choice.get("finish_reason") or ""
    except (KeyError, IndexError, TypeError):
        pass
    return {"wall_ms": round(wall), "delay_ms": j.get("delayTime"),
            "exec_ms": j.get("executionTime"), "status": j.get("status"),
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "finish_reason": finish, "text": text[:300].replace("\n", "\\n"),
            "error": j.get("error") or ""}


def write(row):
    # Schema guard: if an older results.csv has a different header, keep it
    # aside rather than appending misaligned rows.
    if os.path.exists(CSV):
        with open(CSV, newline="") as f:
            header = f.readline().strip().split(",")
        if header != FIELDS:
            os.replace(CSV, CSV.replace(".csv", "_v0.csv"))
    new = not os.path.exists(CSV)
    with open(CSV, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        if new:
            w.writeheader()
        w.writerow(row)


def wait_for_zero(timeout_s=900):
    # For a true cold start: the worker was terminated in the console; poll /health
    # until no worker is listed in any state (parked ones count), then fire.
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        w = health()
        if sum(int(v or 0) for v in w.values()) == 0:
            return w
        print(f"   waiting for 0 workers: {json.dumps(w)}", flush=True)
        time.sleep(10)
    sys.exit(f"workers never reached 0 within {timeout_s}s: {json.dumps(w)}")


def idle_then_snapshot(idle_s):
    # Runpod parks an unbilled idle worker after jobs finish (observed 4+ min
    # past a 5 s idle timeout), so "wait for zero workers" never returns.
    # Instead: idle for a fixed interval, then record what /health shows right
    # before the cold call. Hit = parked worker answered; miss = full start.
    if idle_s > 0:
        print(f"   idling {idle_s}s", flush=True)
        time.sleep(idle_s)
    return health()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--gpu", required=True, help="GPU type the endpoint ran on (from console)")
    p.add_argument("--cycles", type=int, default=1)
    p.add_argument("--warm", type=int, default=10, help="warm requests per cycle")
    p.add_argument("--idle-wait", type=int, default=0,
                   help="seconds to idle before each cycle's cold call (0 = none)")
    p.add_argument("--wait-zero", action="store_true",
                   help="before each cycle, poll /health until no worker exists (terminate "
                        "the worker in the console first); the cold row is then a true cold start")
    a = p.parse_args()

    for c in range(a.cycles):
        if a.wait_zero:
            if c > 0:
                input(f"   cycle {c}: terminate the worker in the console, then press Enter ")
            w = wait_for_zero()
        else:
            w = idle_then_snapshot(a.idle_wait if c > 0 else 0)
        for i in range(a.warm + 1):
            kind = "cold" if i == 0 else "warm"
            res = call()
            row = {"ts_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "endpoint_id": EID, "gpu": a.gpu, "model": MODEL, "kind": kind,
                   "cycle": c, "req": i, "workers_before": json.dumps(w) if i == 0 else "",
                   **res}
            write(row)
            print(f"cycle={c} {kind:4} wall={res['wall_ms']}ms delay={res['delay_ms']} "
                  f"exec={res['exec_ms']} tok={res['completion_tokens']} "
                  f"finish={res['finish_reason']} {res['status']} {res['error']}", flush=True)
            if i <= 1:
                print(f"   text: {res['text'][:160]}", flush=True)
            if res["status"] != "COMPLETED":
                sys.exit(1)


if __name__ == "__main__":
    main()
