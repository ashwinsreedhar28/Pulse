#!/usr/bin/env python3
"""Quality + cost harness: the same 50 Pulse articles scored by every backend.

Usage (run with trading/.venv, same env as coldstart.py):
  python bench/quality.py freeze                       # -> bench/articles_50.json (once)
  python bench/quality.py run --backend ollama --model qwen3:8b
  python bench/quality.py run --backend ollama --model mistral:7b
  python bench/quality.py run --backend claude --model claude-haiku-4-5-20251001
  python bench/quality.py run --backend claude --model claude-sonnet-4-6
  python bench/quality.py run --backend runpod --model qwen/qwen3-8b \
      --runpod-label prefixcache-off --gpu "RTX 4090" --rate-hr 1.10 --allow-runpod
  python bench/quality.py run --backend runpod ... --concurrency 8      # throughput batch
  python bench/quality.py run --backend openrouter --model deepseek/deepseek-v4.1-flash
  python bench/quality.py report                       # -> bench/quality_summary.md

Every call appends one row to bench/quality.csv; every `run` appends one row to
bench/quality_batches.csv. Nothing is aggregated at run time; `report` reads the
CSVs. The fixture stores the exact rendered system prompt per domain so every
backend sends byte-identical text (only the model differs).

Prompt = ollamaService.buildScoringSystemPrompt + runpodService.RUNPOD_PROMPT_SUFFIX,
user message = "Headline: ...\\nSummary: ...", temperature 0, max_tokens 128.
Pulse's production Ollama path sends no temperature (Ollama default), so the
Ollama column here is greedy where production is not; noted in the report.

Env:
  OLLAMA_URL           default http://localhost:11434
  ANTHROPIC_API_KEY    else read from pulse.db preferences (read-only)
  RUNPOD_API_KEY, ENDPOINT_ID (same names as coldstart.py)
  OPENROUTER_API_KEY   for the DeepSeek comparator (hosted, per-token)
"""
import argparse, csv, hashlib, json, os, re, sqlite3, statistics, subprocess, sys, time, uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(HERE, "articles_50.json")
ROWS_CSV = os.path.join(HERE, "quality.csv")
BATCH_CSV = os.path.join(HERE, "quality_batches.csv")
SUMMARY_MD = os.path.join(HERE, "quality_summary.md")
DEFAULT_DB = os.path.expanduser("~/Library/Application Support/pulse/pulse.db")

MAX_TOKENS = 128
# Verbatim from src/main/services/runpodService.ts
PROMPT_SUFFIX = " Keep reason to one sentence under 20 words."

ROW_FIELDS = ["ts_utc", "backend", "model", "label", "host", "gpu", "batch_id", "concurrency",
              "article_id", "domain", "wall_ms", "prompt_tokens", "completion_tokens",
              "finish_reason", "score", "reason", "parse_ok", "text", "error",
              "price_unit", "rate_in", "rate_out", "rate_hr", "rate_source", "est_cost_usd",
              "fixture_sha", "extra"]
BATCH_FIELDS = ["batch_id", "ts_utc", "backend", "model", "label", "host", "gpu", "worker_id",
                "concurrency", "n", "ok", "parse_ok", "wall_ms", "served_model", "workers_before",
                "price_unit", "rate_in", "rate_out", "rate_hr", "rate_source", "est_cost_usd",
                "fixture_sha", "note"]

# DeepSeek comparator runs on OpenRouter (the Runpod console's "DeepSeek V4
# Flash" is a self-host GPU template, not a per-token endpoint). OpenAI-
# compatible chat route; listed $/token comes from the public models index and
# is recorded per row with URL + read time. Docs: https://openrouter.ai/docs
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODELS = "https://openrouter.ai/api/v1/models"


# ---- prompt rendering (must match ollamaService.buildScoringSystemPrompt) -----

def render_system(domain, tickers, interests):
    if domain == "finance":
        lst = ", ".join(tickers) if tickers else "none listed"
        base = ("You are a financial news urgency scorer. Given a news headline and summary, "
                f"score its urgency from 1 to 5 for an investor holding the following stocks: {lst}. "
                "Consider: Does this news directly impact any of these holdings? Could it affect their "
                "supply chain, customers, or competitors? Is this breaking news or routine coverage? "
                'Respond in JSON only: {"score": N, "reason": "brief explanation"}')
    else:
        lst = ", ".join(interests) if interests else "none listed"
        base = ("You are a news urgency scorer. Given a news headline and summary, score its urgency "
                f"from 1 to 5 for a person interested in the following topics and locations: {lst}. "
                "Consider: Is this breaking or developing news? Does it directly affect one of these areas? "
                "Is this a significant event or routine coverage? Would someone want to know about this "
                'immediately? Respond in JSON only: {"score": N, "reason": "brief explanation"}')
    return base + PROMPT_SUFFIX


def render_user(article):
    return f"Headline: {article['title']}\nSummary: {article.get('summary') or ''}"


# ---- fixture ------------------------------------------------------------------

def open_db(path):
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def norm_title(t):
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def freeze(a):
    if os.path.exists(FIXTURE) and not a.force:
        sys.exit(f"{FIXTURE} exists; pass --force to overwrite (this changes the comparison set)")
    db = open_db(a.db)
    tickers = [f"{s} ({n})" for s, n in
               db.execute("SELECT symbol, companyName FROM tickers WHERE isActive=1 ORDER BY symbol")]
    interests = [r[0] for r in
                 db.execute("SELECT displayName FROM geo_interests WHERE isActive=1 ORDER BY displayName")]
    # Deterministic pseudo-shuffle instead of random() so the set is reproducible.
    # Pulls 3x the target so near-duplicate titles can be dropped before the cut.
    q = """SELECT id, title, summary, domain, publishedAt FROM articles
           WHERE urgencyScore = 3
             AND urgencyReason NOT LIKE 'AI(%' AND urgencyReason NOT LIKE 'AI:%'
             AND length(coalesce(summary,'')) >= 80
             AND publishedAt >= strftime('%s','now','-30 days') * 1000
             AND domain = ?
           ORDER BY (id * 7919) % 10007, id
           LIMIT ?"""
    seen, articles = set(), []
    for domain in ("finance", "general"):
        picked = 0
        for id_, title, summary, dom, pub in db.execute(q, (domain, a.per_domain * 3)):
            k = norm_title(title)
            if k in seen:
                continue
            seen.add(k)
            articles.append({"id": id_, "title": title, "summary": summary, "domain": dom,
                             "publishedAt": pub})
            picked += 1
            if picked >= a.per_domain:
                break
        if picked < a.per_domain:
            print(f"warning: only {picked} {domain} articles matched", file=sys.stderr)
    try:
        commit = subprocess.check_output(["git", "-C", HERE, "rev-parse", "--short", "HEAD"],
                                         text=True).strip()
    except Exception:
        commit = ""
    fx = {"frozen_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
          "db": a.db, "pulse_commit": commit, "max_tokens": MAX_TOKENS, "temperature": 0,
          "prompt_lists": {"tickers": tickers, "interests": interests},
          "system_prompt": {d: render_system(d, tickers, interests) for d in ("finance", "general")},
          "articles": articles}
    with open(FIXTURE, "w") as f:
        json.dump(fx, f, indent=1, ensure_ascii=False)
    n_f = sum(1 for x in articles if x["domain"] == "finance")
    print(f"wrote {FIXTURE}: {len(articles)} articles ({n_f} finance, {len(articles)-n_f} general), "
          f"{len(tickers)} tickers, {len(interests)} interests, "
          f"finance system prompt {len(fx['system_prompt']['finance'])} chars")


def load_fixture():
    with open(FIXTURE, "rb") as f:
        raw = f.read()
    fx = json.loads(raw)
    fx["_sha"] = hashlib.sha256(raw).hexdigest()[:12]
    return fx


# ---- shared parsing -------------------------------------------------------------

def parse_score(text):
    """Same acceptance as Pulse: first {...} object, numeric score rounded to 1..5.

    Slicing from the first '{' to the last '}' also strips ```json fences and
    any preamble; qwen3-32b-awq fences its output on short prompts. Same rule
    as runpodService.extractJsonObject."""
    if not text:
        return None, ""
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e <= s:
        return None, ""
    try:
        obj = json.loads(text[s:e + 1])
    except json.JSONDecodeError:
        return None, ""
    sc = obj.get("score")
    if not isinstance(sc, (int, float)) or isinstance(sc, bool):
        return None, ""
    sc = round(sc)
    if sc < 1 or sc > 5:
        return None, ""
    reason = obj.get("reason")
    return sc, reason if isinstance(reason, str) else ""


def ms(t0):
    return round((time.perf_counter() - t0) * 1000)


# ---- backends: each returns a dict of row fields ------------------------------

def call_ollama(a, system, user):
    body = {"model": a.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": False, "format": "json",
            "options": {"temperature": 0, "num_predict": MAX_TOKENS}}
    if "qwen3" in a.model:
        body["think"] = False  # verified 2026-09-23: returns bare JSON on qwen3:8b
    t0 = time.perf_counter()
    r = requests.post(f"{a.ollama_url}/api/chat", json=body, timeout=300)
    wall = ms(t0)
    if r.status_code != 200:
        return {"wall_ms": wall, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    j = r.json()
    text = (j.get("message") or {}).get("content") or ""
    return {"wall_ms": wall, "text": text,
            "prompt_tokens": j.get("prompt_eval_count"), "completion_tokens": j.get("eval_count"),
            "finish_reason": j.get("done_reason") or "",
            # Ollama reports prefill and decode separately (ns). wall/output
            # tokens hides that an 860-token prompt is prefill-bound locally.
            "extra": {"load_ms": round((j.get("load_duration") or 0) / 1e6),
                      "total_ms": round((j.get("total_duration") or 0) / 1e6),
                      "prompt_eval_ms": round((j.get("prompt_eval_duration") or 0) / 1e6),
                      "eval_ms": round((j.get("eval_duration") or 0) / 1e6)}}


def anthropic_key(a):
    k = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if k:
        return k
    db = open_db(a.db)
    row = db.execute("SELECT value FROM preferences WHERE key='anthropicApiKey'").fetchone()
    if not row or not row[0].strip():
        sys.exit("no ANTHROPIC_API_KEY in env or pulse.db")
    return row[0].strip()


def call_claude(a, system, user, _key_cache={}):
    if "k" not in _key_cache:
        _key_cache["k"] = anthropic_key(a)
    headers = {"x-api-key": _key_cache["k"], "anthropic-version": "2023-06-01",
               "content-type": "application/json"}
    body = {"model": a.model, "max_tokens": MAX_TOKENS, "temperature": 0, "system": system,
            "messages": [{"role": "user", "content": user}]}
    for attempt in (1, 2):
        t0 = time.perf_counter()
        r = requests.post("https://api.anthropic.com/v1/messages", headers=headers, json=body, timeout=120)
        wall = ms(t0)
        if r.status_code == 429 and attempt == 1:
            ra = r.headers.get("retry-after")
            time.sleep(min(60, float(ra)) if ra and ra.replace(".", "").isdigit() else 30)
            continue
        break
    if r.status_code != 200:
        return {"wall_ms": wall, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    j = r.json()
    text = "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text")
    u = j.get("usage", {})
    return {"wall_ms": wall, "text": text,
            "prompt_tokens": u.get("input_tokens"), "completion_tokens": u.get("output_tokens"),
            "finish_reason": j.get("stop_reason") or "",
            "extra": {"model": j.get("model")}}


def runpod_base(a):
    key, eid = os.environ.get("RUNPOD_API_KEY"), os.environ.get("ENDPOINT_ID")
    if not key or not eid:
        sys.exit("RUNPOD_API_KEY and ENDPOINT_ID must be set (same names as coldstart.py)")
    return key, eid


def runpod_health(a):
    key, eid = runpod_base(a)
    r = requests.get(f"https://api.runpod.ai/v2/{eid}/health",
                     headers={"Authorization": f"Bearer {key}"}, timeout=15)
    return r.json().get("workers", {}) if r.status_code == 200 else {"http": r.status_code}


def call_openai_chat(url, key, model, system, user, extra_body, timeout):
    body = {"model": model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0, "max_tokens": MAX_TOKENS, **extra_body}
    t0 = time.perf_counter()
    retries = 0
    while True:
        r = requests.post(url, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                          json=body, timeout=timeout)
        if r.status_code == 429 and retries < 6:
            # OpenRouter new-account limit is 20 requests/min on some models; back off and retry.
            wait = float(r.headers.get("Retry-After") or 0) or min(8 * (retries + 1), 40)
            print(f"   429, waiting {wait:.0f}s", flush=True)
            time.sleep(wait)
            retries += 1
            t0 = time.perf_counter()  # wall measures the successful call, not the backoff
            continue
        break
    wall = ms(t0)
    if r.status_code != 200:
        return {"wall_ms": wall, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    j = r.json()
    ch = (j.get("choices") or [{}])[0]
    text = (ch.get("message") or {}).get("content") or ""
    u = j.get("usage") or {}
    extra = {"served_model": j.get("model")}
    # OpenRouter usage accounting returns the billed amount as usage.cost when
    # asked for; recorded alongside the list-price estimate, never in place of it.
    if u.get("cost") is not None:
        extra["billed_cost_usd"] = u["cost"]
    if u.get("reasoning_tokens") is not None:
        extra["reasoning_tokens"] = u["reasoning_tokens"]
    return {"wall_ms": wall, "text": text,
            "prompt_tokens": u.get("prompt_tokens"), "completion_tokens": u.get("completion_tokens"),
            "finish_reason": ch.get("finish_reason") or "", "extra": extra}


def call_runpod(a, system, user):
    key, eid = runpod_base(a)
    # Same body as Pulse's runpodService.buildChatBody. 330 s tolerates a cold
    # start on the first call; wall_ms records it, the report separates it.
    return call_openai_chat(f"https://api.runpod.ai/v2/{eid}/openai/v1/chat/completions",
                            key, a.model, system, user,
                            {"chat_template_kwargs": {"enable_thinking": False}}, timeout=330)


def openrouter_rates(model):
    """Listed $/token for `model` from the public index, returned as $/M plus a
    source string. Exits if the id is not listed, so a typo never runs."""
    r = requests.get(OPENROUTER_MODELS, timeout=20)
    r.raise_for_status()
    for m in r.json().get("data", []):
        if m.get("id") == model:
            p = m.get("pricing") or {}
            src = (f"{OPENROUTER_MODELS} pricing for {model}, read "
                   f"{datetime.now(timezone.utc).isoformat(timespec='seconds')}")
            return float(p["prompt"]) * 1e6, float(p["completion"]) * 1e6, src
    sys.exit(f"{model} not listed at {OPENROUTER_MODELS}; check https://openrouter.ai/{model}")


def call_openrouter(a, system, user):
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY not set")
    # usage.include asks OpenRouter to return the billed cost in usage.cost
    # (verify against https://openrouter.ai/docs if the field stays absent).
    # reasoning.enabled=false: OpenRouter's unified switch for hybrid-reasoning models
    # (DeepSeek V4.1 Flash, Kimi K3); otherwise the thinking eats the max_tokens budget.
    extra = {"usage": {"include": True}}
    if not a.reasoning:
        extra["reasoning"] = {"enabled": False}
    return call_openai_chat(OPENROUTER_URL, key, a.model, system, user, extra, timeout=120)


BACKENDS = {"ollama": call_ollama, "claude": call_claude, "runpod": call_runpod,
            "openrouter": call_openrouter}


# ---- run --------------------------------------------------------------------------

def write_row(path, fields, row):
    # Header guard, as in coldstart.py: never misalign. A pure column addition
    # rewrites the file under the new header (blank new cells); anything else
    # keeps the old file aside as _v0.
    if os.path.exists(path):
        with open(path, newline="") as f:
            header = f.readline().strip().split(",")
        if header != fields:
            if set(header) <= set(fields):
                old = list(csv.DictReader(open(path, newline="")))
                with open(path, "w", newline="") as f:
                    w = csv.DictWriter(f, fieldnames=fields)
                    w.writeheader()
                    for r in old:
                        w.writerow({k: r.get(k, "") for k in fields})
            else:
                os.replace(path, path.replace(".csv", "_v0.csv"))
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        if new:
            w.writeheader()
        w.writerow(row)


def price_fields(a):
    if a.backend == "runpod":
        return {"price_unit": "per_gpu_hour" if a.rate_hr else "", "rate_hr": a.rate_hr,
                "rate_in": "", "rate_out": "", "rate_source": a.rate_source}
    if a.backend == "ollama":
        return {"price_unit": "none", "rate_hr": "", "rate_in": "", "rate_out": "",
                "rate_source": "local GPU; electricity not counted"}
    return {"price_unit": "per_m_tokens" if a.rate_in is not None else "",
            "rate_in": a.rate_in, "rate_out": a.rate_out, "rate_hr": "", "rate_source": a.rate_source}


def row_cost(a, pf, res):
    pt, ct = res.get("prompt_tokens"), res.get("completion_tokens")
    if pf["price_unit"] == "per_m_tokens" and isinstance(pt, int) and isinstance(ct, int):
        return round((pt * float(pf["rate_in"]) + ct * float(pf["rate_out"])) / 1e6, 6)
    if pf["price_unit"] == "per_gpu_hour" and a.concurrency == 1 and res.get("wall_ms"):
        return round(res["wall_ms"] / 3.6e6 * float(pf["rate_hr"]), 6)
    return ""


def run(a):
    if a.backend == "runpod" and not a.allow_runpod:
        sys.exit("refusing to send to the Runpod endpoint without --allow-runpod "
                 "(a cycle benchmark may be running)")
    fx = load_fixture()
    articles = fx["articles"][:a.limit] if a.limit else fx["articles"]
    if a.backend == "ollama":
        tags = requests.get(f"{a.ollama_url}/api/tags", timeout=5).json().get("models", [])
        if a.model not in {m["name"] for m in tags}:
            sys.exit(f"{a.model} not installed in Ollama; ollama pull {a.model}")
    label = a.runpod_label if a.backend == "runpod" else a.label
    host = {"ollama": "mac-ollama", "claude": "anthropic",
            "runpod": f"runpod:{label}", "openrouter": "openrouter"}[a.backend]
    if a.backend == "openrouter" and a.rate_in is None:
        a.rate_in, a.rate_out, a.rate_source = openrouter_rates(a.model)
        print(f"openrouter list price: ${a.rate_in:.4f}/M in, ${a.rate_out:.4f}/M out", flush=True)
    pf = price_fields(a)
    if a.backend in ("claude", "openrouter") and pf["price_unit"] == "":
        print("note: no --rate-in/--rate-out given; est_cost_usd left blank", file=sys.stderr)
    workers_before = json.dumps(runpod_health(a)) if a.backend == "runpod" else ""
    if workers_before:
        print(f"/health workers before batch: {workers_before}", flush=True)
    batch_id = uuid.uuid4().hex[:8]
    fn = BACKENDS[a.backend]
    base = {"backend": a.backend, "model": a.model, "label": label, "host": host, "gpu": a.gpu,
            "worker_id": a.worker_id, "batch_id": batch_id, "concurrency": a.concurrency,
            "fixture_sha": fx["_sha"], **pf}

    def one(art):
        system = fx["system_prompt"][art["domain"]]
        try:
            res = fn(a, system, render_user(art))
        except requests.RequestException as e:
            res = {"wall_ms": "", "error": f"{type(e).__name__}: {str(e)[:200]}"}
        score, reason = parse_score(res.get("text", ""))
        row = {**base, "ts_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "article_id": art["id"], "domain": art["domain"],
               "wall_ms": res.get("wall_ms", ""), "prompt_tokens": res.get("prompt_tokens", ""),
               "completion_tokens": res.get("completion_tokens", ""),
               "finish_reason": res.get("finish_reason", ""),
               "score": score if score is not None else "", "reason": reason[:300],
               "parse_ok": 1 if score is not None else 0,
               "text": (res.get("text") or "")[:300].replace("\n", "\\n"),
               "error": res.get("error", ""), "est_cost_usd": row_cost(a, pf, res),
               "extra": json.dumps(res.get("extra", {}), ensure_ascii=False)}
        return row

    t0 = time.perf_counter()
    rows, served = [], set()
    with ThreadPoolExecutor(max_workers=a.concurrency) as ex:
        futs = [ex.submit(one, art) for art in articles]
        for i, fut in enumerate(as_completed(futs), 1):
            row = fut.result()
            rows.append(row)
            write_row(ROWS_CSV, ROW_FIELDS, row)
            sm = json.loads(row["extra"]).get("served_model")
            if sm:
                served.add(sm)
            print(f"[{i:2}/{len(articles)}] {row['domain']:7} id={row['article_id']:<6} "
                  f"wall={row['wall_ms']}ms tok={row['prompt_tokens']}/{row['completion_tokens']} "
                  f"score={row['score'] or '-'} {row['finish_reason']} {row['error']}", flush=True)
            if a.sleep:
                time.sleep(a.sleep)
    wall = ms(t0)
    ok = sum(1 for r in rows if not r["error"])
    pok = sum(r["parse_ok"] for r in rows)
    bcost = ""
    if pf["price_unit"] == "per_gpu_hour":
        bcost = round(wall / 3.6e6 * float(pf["rate_hr"]), 6)
    elif pf["price_unit"] == "per_m_tokens":
        bcost = round(sum(float(r["est_cost_usd"] or 0) for r in rows), 6)
    write_row(BATCH_CSV, BATCH_FIELDS, {**base, "ts_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                        "n": len(rows), "ok": ok, "parse_ok": pok, "wall_ms": wall,
                                        "served_model": ",".join(sorted(served)),
                                        "workers_before": workers_before, "est_cost_usd": bcost,
                                        "note": a.note})
    print(f"batch {batch_id}: {a.backend} {a.model} [{label}] n={len(rows)} ok={ok} parse_ok={pok} "
          f"wall={wall}ms concurrency={a.concurrency} est_cost=${bcost or '?'}"
          + (f" served={','.join(sorted(served))}" if served else ""))


# ---- report -------------------------------------------------------------------------

def pct(xs, p):
    if not xs:
        return ""
    xs = sorted(xs)
    k = max(0, min(len(xs) - 1, round(p / 100 * (len(xs) - 1))))
    return xs[k]


def report(a):
    if not os.path.exists(ROWS_CSV):
        sys.exit(f"{ROWS_CSV} not found")
    rows = list(csv.DictReader(open(ROWS_CSV, newline="")))
    batches = list(csv.DictReader(open(BATCH_CSV, newline=""))) if os.path.exists(BATCH_CSV) else []
    # Latest row per (group, article) wins, so a re-run replaces, never double
    # counts. Concurrency is part of the group: a sequential and a concurrent
    # batch of the same model measure different things.
    latest = {}
    for r in rows:
        if a.fixture_sha and r["fixture_sha"] != a.fixture_sha:
            continue
        g = (r["backend"], r["model"], r["label"], r["concurrency"])
        latest[(g, r["article_id"])] = r
    groups = {}
    for (g, aid), r in latest.items():
        groups.setdefault(g, {})[aid] = r
    ref_key = next((g for g in groups if g[0] == "claude" and g[1] == a.ref), None)
    if ref_key is None:
        sys.exit(f"reference {a.ref} has no rows yet")
    ref = {aid: int(r["score"]) for aid, r in groups[ref_key].items() if r["parse_ok"] == "1"}

    def agree(rs):
        pairs = [(int(r["score"]), ref[aid]) for aid, r in rs.items()
                 if r["parse_ok"] == "1" and aid in ref]
        n = len(pairs)
        if n == 0:
            return {"n": 0}
        exact = sum(1 for p, q in pairs if p == q) / n
        within1 = sum(1 for p, q in pairs if abs(p - q) <= 1) / n
        mae = sum(abs(p - q) for p, q in pairs) / n
        tp = sum(1 for p, q in pairs if p >= 4 and q >= 4)
        fp = sum(1 for p, q in pairs if p >= 4 and q < 4)
        fn_ = sum(1 for p, q in pairs if p < 4 and q >= 4)
        prec = tp / (tp + fp) if tp + fp else float("nan")
        rec = tp / (tp + fn_) if tp + fn_ else float("nan")
        return {"n": n, "exact": exact, "within1": within1, "mae": mae, "prec": prec, "rec": rec,
                "ref_urgent": sum(1 for _, q in pairs if q >= 4)}

    def f(x, d=2, pc=False):
        if x == "" or x is None or (isinstance(x, float) and x != x):
            return "-"
        return f"{x*100:.0f}%" if pc else f"{x:.{d}f}"

    lines = [f"# Quality harness summary", "",
             f"Generated {datetime.now(timezone.utc).isoformat(timespec='seconds')}. Reference: "
             f"`{a.ref}`, {len(ref)} scored articles. Source: `bench/quality.csv`, `bench/quality_batches.csv`.",
             "", "Agreement is against the reference model's score on the same article. "
             "\"Urgent\" is score >= 4, Pulse's notification threshold; precision/recall treat the "
             "reference as truth. Parse failures are excluded from agreement and reported separately.", "",
             "| backend | model | label | c | n | parse ok | exact | within 1 | MAE | urgent P | urgent R | "
             "fin exact | gen exact | wall p50 ms | wall p99 ms | in tok | out tok | $/1,000 |",
             "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for g, rs in sorted(groups.items()):
        n = len(rs)
        pok = sum(1 for r in rs.values() if r["parse_ok"] == "1")
        ag = agree(rs)
        fin = agree({k: v for k, v in rs.items() if v["domain"] == "finance"})
        gen = agree({k: v for k, v in rs.items() if v["domain"] == "general"})
        timed = [r for r in rs.values() if r["wall_ms"]]
        walls = [int(r["wall_ms"]) for r in timed]
        # Calls > 10x the group median are cold starts or model loads. They
        # leave the latency stats and the per-article cost, and are reported
        # in the per-group note with their own cost, so a 168 s first call
        # does not become "$1.70 per 1,000".
        note, outliers = "", []
        if len(walls) >= 5:
            med = statistics.median(walls)
            outliers = [r for r in timed if int(r["wall_ms"]) > 10 * med]
            if outliers:
                walls = [w for w in walls if w <= 10 * med]
                ocost = sum(float(r["est_cost_usd"] or 0) for r in outliers)
                note = (f" (excluded {len(outliers)} call(s) >10x median: "
                        f"{[int(r['wall_ms']) for r in outliers]} ms"
                        + (f", ${ocost:.4f}" if ocost else "") + ")")
        steady = [r for r in rs.values() if r not in outliers]
        pin = [int(r["prompt_tokens"]) for r in rs.values() if r["prompt_tokens"]]
        pout = [int(r["completion_tokens"]) for r in rs.values() if r["completion_tokens"]]
        costs = [float(r["est_cost_usd"]) for r in steady if r["est_cost_usd"]]
        per1k = ""
        if costs and len(costs) == len(steady):
            per1k = f"${sum(costs)/len(steady)*1000:.2f}"
        elif g[0] == "runpod":
            # Concurrent batch: from batch wall time at the GPU rate, the rate
            # recorded on the run, else --runpod-rate-hr (price read later).
            parts = []
            for b in batches:
                if (b["backend"], b["model"], b["label"], b["concurrency"]) != g or not int(b["n"] or 0):
                    continue
                rate = float(b["rate_hr"]) if b["rate_hr"] else a.runpod_rate_hr
                if rate:
                    parts.append(f"${int(b['wall_ms'])/3.6e6*rate/int(b['n'])*1000:.2f}")
            per1k = ", ".join(parts)
        elif g[0] == "ollama":
            per1k = "$0 marginal"
        lines.append(f"| {g[0]} | {g[1]} | {g[2]} | {g[3]} | {n} | {pok}/{n} | {f(ag.get('exact'),pc=True)} | "
                     f"{f(ag.get('within1'),pc=True)} | {f(ag.get('mae'))} | {f(ag.get('prec'),pc=True)} | "
                     f"{f(ag.get('rec'),pc=True)} | {f(fin.get('exact'),pc=True)} | {f(gen.get('exact'),pc=True)} | "
                     f"{pct(walls,50)} | {pct(walls,99)} | {f(statistics.mean(pin),0) if pin else '-'} | "
                     f"{f(statistics.mean(pout),0) if pout else '-'} | {per1k or '-'} |" + note)
    # Local timing split. Ollama reports prefill (prompt_eval_duration) and
    # decode (eval_duration) separately; wall / output tokens conflates them.
    # Rows recorded before prompt_eval_ms existed fall back to
    # total - load - eval, which also contains a few ms of Ollama overhead.
    split = []
    for g, rs in sorted(groups.items()):
        if g[0] != "ollama":
            continue
        # One row per domain plus "all": the finance system prompt is ~4x the
        # general one, so the domain split shows whether prefill tracks length.
        for dom in ("all", "finance", "general"):
            pre, dec, intok, ptok, dtok, loads, approx = [], [], [], [], [], [], False
            for r in rs.values():
                if dom != "all" and r["domain"] != dom:
                    continue
                x = json.loads(r["extra"] or "{}")
                if not r["prompt_tokens"] or not r["completion_tokens"] or not x.get("eval_ms"):
                    continue
                if x.get("prompt_eval_ms"):
                    p = x["prompt_eval_ms"]
                else:
                    p = max(0, x.get("total_ms", 0) - x.get("load_ms", 0) - x["eval_ms"])
                    approx = True
                pre.append(p)
                dec.append(x["eval_ms"])
                intok.append(int(r["prompt_tokens"]))
                ptok.append(int(r["prompt_tokens"]) / p * 1000 if p else 0)
                dtok.append(int(r["completion_tokens"]) / x["eval_ms"] * 1000)
                loads.append(x.get("load_ms", 0))
            if pre:
                share = statistics.median(pre) / (statistics.median(pre) + statistics.median(dec)) * 100
                split.append(f"| {g[1]} | {dom} | {len(pre)} | {statistics.median(intok):.0f} | "
                             f"{pct(pre,50)}{' ≈' if approx else ''} | {pct(dec,50)} | {share:.0f}% | "
                             f"{statistics.median(ptok):.0f} | {statistics.median(dtok):.1f} | {max(loads)} |")
    if split:
        lines += ["", "## Local timing split (Ollama)", "",
                  "Prefill is `prompt_eval_duration`, decode is `eval_duration`, both from Ollama's "
                  "response. `≈` marks rows recorded before prefill was captured directly "
                  "(total - load - eval). Medians; tok/s are per-call medians. Ollama reuses the KV "
                  "cache for a matching prompt prefix across requests, so a shared system prompt is "
                  "prefilled once per model load; if prefill barely moves between the finance and "
                  "general rows despite the token gap, that cache is why. Prefill tok/s below counts "
                  "all prompt tokens, cached or not.", "",
                  "| model | domain | n | in tok | prefill p50 ms | decode p50 ms | prefill share | "
                  "prefill tok/s | decode tok/s | max load ms |",
                  "|---|---|---|---|---|---|---|---|---|---|"] + split
    lines += ["", f"Reference urgent (>=4) articles: {sum(1 for v in ref.values() if v >= 4)} of {len(ref)}.",
              "", "Notes:", "- Ollama rows run at temperature 0; Pulse's production Ollama scoring "
              "sends no temperature (Ollama default), so production is sampled, not greedy.",
              "- Ollama models are Q4_K_M; the Runpod model is bf16. Same weights, different quantization.",
              "- Runpod $/1,000 uses measured wall time at the GPU hourly rate given per run "
              "(sequential rows) or the batch wall time (concurrent runs). Cold starts appear as "
              "excluded outliers above and are costed separately in REPORT.md.",
              "- Token prices come from the rate flags on each run (see rate_source in the CSV)."]
    if batches:
        lines += ["", "## Batches", "", "| batch | backend | model | label | gpu | worker | c | n | ok | "
                  "parse ok | wall ms | served model | workers before | est $ | note |",
                  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for b in batches:
            lines.append(f"| {b['batch_id']} | {b['backend']} | {b['model']} | {b['label']} | {b['gpu']} | "
                         f"{b.get('worker_id','')} | {b['concurrency']} | {b['n']} | {b['ok']} | {b['parse_ok']} | "
                         f"{b['wall_ms']} | {b['served_model']} | {b['workers_before']} | {b['est_cost_usd']} | "
                         f"{b.get('note','')} |")
    md = "\n".join(lines) + "\n"
    with open(SUMMARY_MD, "w") as fh:
        fh.write(md)
    print(md)


# ---- cli ---------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    pf = sub.add_parser("freeze", help="select 50 articles + render prompts into articles_50.json")
    pf.add_argument("--db", default=DEFAULT_DB)
    pf.add_argument("--per-domain", type=int, default=25)
    pf.add_argument("--force", action="store_true")
    pf.set_defaults(fn=freeze)

    pr = sub.add_parser("run", help="score the fixture with one backend")
    pr.add_argument("--backend", required=True, choices=sorted(BACKENDS))
    pr.add_argument("--model", required=True)
    pr.add_argument("--label", default="", help="free-form tag recorded per row")
    pr.add_argument("--runpod-label", default="", help="e.g. prefixcache-off / prefixcache-on")
    pr.add_argument("--gpu", default="", help="GPU actually placed (from the console Workers tab)")
    pr.add_argument("--worker-id", default="", help="worker id from the console Workers tab")
    pr.add_argument("--note", default="", help="free text recorded on the batch row (e.g. engine log observations)")
    pr.add_argument("--concurrency", type=int, default=1)
    pr.add_argument("--max-tokens", type=int, default=None,
                    help=f"override MAX_TOKENS ({MAX_TOKENS}) for this run; recorded per row")
    pr.add_argument("--reasoning", action="store_true",
                    help="openrouter: leave the model's reasoning on (default: send reasoning.enabled=false)")
    pr.add_argument("--limit", type=int, default=0, help="first N articles only (smoke test)")
    pr.add_argument("--sleep", type=float, default=0.0, help="seconds between calls")
    pr.add_argument("--ollama-url", default=os.environ.get("OLLAMA_URL", "http://localhost:11434"))
    pr.add_argument("--db", default=DEFAULT_DB)
    pr.add_argument("--rate-in", type=float, default=None, help="$ per 1M input tokens")
    pr.add_argument("--rate-out", type=float, default=None, help="$ per 1M output tokens")
    pr.add_argument("--rate-hr", type=float, default=None, help="$ per GPU hour (runpod)")
    pr.add_argument("--rate-source", default="", help="where/when the rate was read")
    pr.add_argument("--allow-runpod", action="store_true",
                    help="required for --backend runpod; the endpoint may be under a cycle test")
    pr.set_defaults(fn=run)

    pp = sub.add_parser("report", help="agreement + cost table from the CSVs")
    pp.add_argument("--ref", default="claude-haiku-4-5-20251001")
    pp.add_argument("--fixture-sha", default="", help="only rows from this fixture version")
    pp.add_argument("--runpod-rate-hr", type=float, default=None,
                    help="$ per GPU hour for runpod batches recorded without a rate")
    pp.set_defaults(fn=report)

    a = p.parse_args()
    if getattr(a, "max_tokens", None):
        globals()["MAX_TOKENS"] = a.max_tokens
    a.fn(a)


if __name__ == "__main__":
    main()
