#!/usr/bin/env python3
"""Second-labeler passes for the value-chain eval: a model scores every finance article in
articles_300.json under brief v2 WITH the same links block the human labeler saw.

Output: bench/labels_<slug>.json in the same shape as labels_ashwin.json (plus reason, raw).
Resumes: existing labels for the same model are kept; only missing ids are called.

  OPENROUTER_API_KEY=... python3 bench/label_models.py --model anthropic/claude-opus-4.1
  OPENROUTER_API_KEY=... python3 bench/label_models.py --model openai/gpt-5

Models used here must NOT be among the evaluated models (Haiku 4.5, Sonnet 4.6, Jev, Clef,
Typical); they form the gold set. --list prints OpenRouter ids matching a substring.
"""
import argparse, json, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import quality as q  # noqa: E402  (reuses call_openrouter, parse_score, render_user)
import requests  # noqa: E402

FIXTURE = os.path.join(HERE, "articles_300.json")


def build_system(fx, art, with_links=True):
    sp = fx["system_prompt"]
    parts = [sp["finance"]]
    if with_links:
        parts.append(sp["finance_links_block"].replace("{links}", art.get("links_text") or "none"))
    parts.append(sp["suffix"])
    return "\n\n".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", help="OpenRouter model id")
    ap.add_argument("--list", help="print OpenRouter ids containing this substring and exit")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--no-links", action="store_true", help="omit the links block (not for gold; for checks)")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--effort", default="low", help="reasoning effort sent to OpenRouter (low|medium|high)")
    ap.add_argument("--max-tokens", type=int, default=4096, help="completion budget incl. reasoning tokens")
    a = ap.parse_args()
    a.reasoning = False

    if a.list:
        r = requests.get(q.OPENROUTER_MODELS, timeout=20); r.raise_for_status()
        for m in r.json().get("data", []):
            if a.list.lower() in m["id"].lower():
                p = m.get("pricing") or {}
                print(f"{m['id']:45s} in ${float(p.get('prompt',0))*1e6:.2f}/M out ${float(p.get('completion',0))*1e6:.2f}/M")
        return
    if not a.model:
        sys.exit("--model required (or --list)")
    q.openrouter_rates(a.model)  # exits on a typo before any call is made

    fx = json.load(open(FIXTURE, encoding="utf-8"))
    arts = [x for x in fx["articles"] if x["domain"] == "finance"]
    if a.limit:
        arts = arts[:a.limit]
    slug = re.sub(r"[^a-z0-9]+", "-", a.model.lower()).strip("-") + ("-nolinks" if a.no_links else "")
    out_path = os.path.join(HERE, f"labels_{slug}.json")
    out = {"fixture": os.path.basename(FIXTURE), "frozen_at": fx["frozen_at"], "brief": fx["brief"], "brief_sha": fx["brief_sha"],
           "labeler": a.model, "saw_links": not a.no_links, "reasoning_effort": a.effort, "max_tokens": a.max_tokens, "exported_at": None, "n": 0, "labels": {}}
    if os.path.exists(out_path):
        out["labels"] = json.load(open(out_path, encoding="utf-8")).get("labels", {})
    todo = [x for x in arts if str(x["id"]) not in out["labels"]]
    print(f"{a.model}: {len(arts)} articles, {len(todo)} to do, links={'off' if a.no_links else 'on'}")

    key = os.environ.get("OPENROUTER_API_KEY") or sys.exit("OPENROUTER_API_KEY not set")
    # Reasoning models (Opus 5.5, GPT-5.6) refuse reasoning=disabled; ask for low effort and give the
    # budget room so the answer JSON isn't truncated by the thinking tokens. Recorded per label.
    extra = {"usage": {"include": True}, "reasoning": {"effort": a.effort}}
    q.MAX_TOKENS = a.max_tokens

    def one(art):
        res = q.call_openai_chat(q.OPENROUTER_URL, key, a.model, build_system(fx, art, not a.no_links), q.render_user(art), extra, timeout=180)
        if "error" in res:
            return art["id"], None, res
        sc, reason = q.parse_score(res.get("text", ""))
        return art["id"], sc, {"reason": reason, "raw": res.get("text", ""), "wall_ms": res.get("wall_ms"),
                               "cost": (res.get("extra") or {}).get("billed_cost_usd"),
                               "reasoning_tokens": (res.get("extra") or {}).get("reasoning_tokens")}

    done, errs, streak, t0 = 0, 0, 0, time.time()
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = [ex.submit(one, x) for x in todo]
        for f in as_completed(futs):
            id_, sc, info = f.result()
            if sc is None:
                errs += 1; streak += 1
                print(f"  ! {id_}: {info.get('error') or 'unparseable: ' + (info.get('raw') or '')[:80]}", flush=True)
                if streak >= 3 and done == 0:
                    for g in futs: g.cancel()
                    sys.exit("3 errors before any success; fix the call and rerun (resumes)")
                continue
            streak = 0
            out["labels"][str(id_)] = {"score": sc, "reason": info["reason"], "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                      "wall_ms": info["wall_ms"], "cost": info["cost"], "reasoning_tokens": info.get("reasoning_tokens")}
            done += 1
            if done % 25 == 0:
                print(f"  {done}/{len(todo)} ({time.time()-t0:.0f}s)", flush=True)
                out["n"] = len(out["labels"]); json.dump(out, open(out_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    out["n"] = len(out["labels"]); out["exported_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    json.dump(out, open(out_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    cost = sum((v.get("cost") or 0) for v in out["labels"].values())
    from collections import Counter
    c = Counter(v["score"] for v in out["labels"].values())
    print(f"wrote {out_path}: {out['n']} labels, {errs} errors, dist={[c[i] for i in range(1,6)]}, "
          f"alert>=4 {sum(c[i] for i in (4,5))/max(1,out['n']):.0%}, billed ${cost:.3f}")


if __name__ == "__main__":
    main()
