#!/usr/bin/env python3
"""Freeze the 300-article fixture for the value-chain eval (plan: claude/pulse-valuechain-eval-plan.md).

Strata (keyword urgencyScore, excluding AI-scored rows): finance 80/80/80 at 1/3/5,
plus a counterparty-only slice (any score). General dropped. Deterministic pseudo-shuffle (id*7919 % 10007) like quality.py's
freeze(). Excludes articles_50.json ids and near-duplicate titles / normalizedUrls.
Each article gets `links`: up to 8 value-chain edges with source='filings' touching its
matched tickers (ticker-kind nodes only), each with the filing citation. `stratum` is
recorded for reporting but MUST be hidden in the labeling UI.

Usage: python3 bench/sample_300.py [--db PATH] [--force]
"""
import argparse, hashlib, json, os, re, sqlite3, subprocess, sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(HERE, "articles_300.json")
FIX50 = os.path.join(HERE, "articles_50.json")
BRIEF = os.path.join(HERE, "brief_v2.txt")
DEFAULT_DB = os.path.expanduser("~/Library/Application Support/pulse/pulse.db")
STRATA = [("finance", 1, 80), ("finance", 3, 80), ("finance", 5, 80)]  # general dropped 2026-10-20: no interests list, finance is the question
CP_STRATUM_N = 40  # finance articles naming a filings-linked counterparty of a held name, but no held name; any keyword score
MAX_LINKS = 8
REL_VERB = {"supplier": "supplies", "customer": "is a customer of", "competitor": "competes with", "partner": "partners with"}


def norm_title(t):
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def load_brief():
    sections, cur = {}, None
    for line in open(BRIEF, encoding="utf-8"):
        if line.startswith("#"):
            continue
        m = re.match(r"^\[(\w+)\]\s*$", line)
        if m:
            cur = m.group(1); sections[cur] = []
        elif cur:
            sections[cur].append(line.rstrip("\n"))
    return {k: "\n".join(v).strip() for k, v in sections.items()}


STOP_NAMES = {"inc", "corp", "corporation", "co", "company", "ltd", "plc", "holdings", "holding", "group", "the", "nv", "sa", "ag", "se", "limited", "incorporated", "technologies", "technology", "international", "parent"}
# First words that are ordinary English / too generic to identify a company on their own.
GENERIC = {"united", "carrier", "frontier", "element", "analog", "general", "american", "first", "national", "global", "advanced", "applied", "micro", "universal", "standard", "digital", "capital", "energy", "pacific", "western", "southern", "northern", "central", "federal", "new", "royal", "liberty", "summit", "alliance", "allied", "atlas", "pioneer", "premier", "prime", "core", "northwest", "southwest", "target", "range", "match", "block", "ball", "shift", "gap", "best", "key", "main", "tech", "data", "cloud", "solar", "quantum", "vertex", "orion", "phoenix", "eagle", "star", "sun", "crown", "titan", "apex", "fortune", "harbor", "bridge"}


BRAND_WORDS = {"apple", "amazon", "oracle", "shell", "target", "intel", "micron", "boeing", "caterpillar", "corning", "tesla", "nvidia", "broadcom", "qualcomm", "samsung", "toyota", "honda", "sony", "nokia", "ericsson", "siemens", "lockheed", "raytheon", "northrop", "honeywell", "emerson", "danaher", "pfizer", "merck", "amgen", "gilead", "visa", "mastercard", "paypal", "netflix", "disney", "comcast", "walmart", "costco", "kroger", "starbucks", "chipotle", "nike", "adidas", "ford", "stellantis", "ferrari", "exxon", "chevron", "halliburton", "schlumberger", "freeport", "newmont", "alcoa", "nucor", "linde", "dupont", "dow", "celanese", "eastman", "credo", "coherent", "cadence", "allegro", "marvell", "lattice", "rambus", "synopsys", "amphenol", "skyworks", "teradyne", "ichor", "onsemi", "wolfspeed", "navitas", "vishay", "universal display"}
try:
    _DICT = {w.strip().lower() for w in open("/usr/share/dict/words", encoding="utf-8", errors="ignore")}
except OSError:
    _DICT = set()


def name_key(name):
    """'Credo Technology Group Holding Ltd' -> 'credo'; 'United Rentals Inc' -> 'united rentals';
    'Power Integrations Inc' -> 'power integrations'. A one-word key must not be an English word
    (unless in BRAND_WORDS). None if nothing distinctive remains."""
    words = [w for w in re.sub(r"[^a-z0-9 ]+", " ", (name or "").lower()).split() if w not in STOP_NAMES]
    if not words:
        return None
    w0 = words[0]
    generic = w0 in GENERIC or len(w0) < 5 or (w0 in _DICT and w0 not in BRAND_WORDS)
    if generic:
        return " ".join(words[:2]) if len(words) >= 2 else None
    return w0


def build_name_index(db):
    """symbol -> distinctive name key, from chain node names (ticker-kind only)."""
    names = {}
    for _, gj in db.execute("SELECT symbol, graphJson FROM company_value_chains WHERE status='ready' AND graphJson IS NOT NULL"):
        try:
            g = json.loads(gj)
        except Exception:
            continue
        for n in g.get("nodes", []):
            if n.get("kind") == "ticker" and n.get("symbol") and n.get("name"):
                names.setdefault(n["symbol"], name_key(n["name"]))
    names = {k: v for k, v in names.items() if v}
    # drop keys shared by two symbols (ambiguous)
    from collections import Counter
    dup = {k for k, c in Counter(names.values()).items() if c > 1}
    return {k: v for k, v in names.items() if v not in dup}


def build_edge_index(db):
    """symbol -> list of filings-sourced edges touching it (either endpoint)."""
    idx = {}
    seen = set()
    for symbol, gj in db.execute("SELECT symbol, graphJson FROM company_value_chains WHERE status='ready' AND graphJson IS NOT NULL"):
        try:
            g = json.loads(gj)
        except Exception:
            continue
        kinds = {n.get("symbol"): n.get("kind") for n in g.get("nodes", [])}
        for e in g.get("edges", []):
            if e.get("source") != "filings":
                continue
            f, t, rel = e.get("from"), e.get("to"), e.get("relationship")
            if kinds.get(f) != "ticker" or kinds.get(t) != "ticker":
                continue
            cites = e.get("citations") or ([e["citation"]] if e.get("citation") else [])
            cite = next((c for c in cites if c and c.get("kind") == "filing"), None)
            if not cite:
                continue
            key = (f, t, rel)
            if key in seen:
                continue
            seen.add(key)
            filed = cite.get("filedAt")
            fy = datetime.fromtimestamp(filed / 1000, tz=timezone.utc).year if filed else None
            row = {"from": f, "to": t, "relationship": rel, "note": e.get("note"),
                   "chain": symbol, "form": cite.get("formType"), "accession": cite.get("accession"),
                   "filed_year": fy, "url": cite.get("url")}
            idx.setdefault(f, []).append(row)
            idx.setdefault(t, []).append(row)
    return idx


def render_links(links, held):
    if not links:
        return "none"
    out = []
    for l in links:
        tag = f"{l['form']} {l['filed_year']}" if l["filed_year"] else l["form"]
        f = l["from"] + (" [held]" if l["from"] in held else "")
        t = l["to"] + (" [held]" if l["to"] in held else "")
        out.append(f"{f} -> {REL_VERB.get(l['relationship'], l['relationship'])} -> {t} ({tag})")
    return "\n".join(out)


def canon(e):
    """supplier(A->B) and customer(B->A) are one fact; canonical key is the supplier form."""
    f, t, r = e["from"], e["to"], e["relationship"]
    if r == "customer":
        return (t, f, "supplier")
    if r in ("competitor", "partner"):
        return (min(f, t), max(f, t), r)
    return (f, t, r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if os.path.exists(FIXTURE) and not a.force:
        sys.exit(f"{FIXTURE} exists; pass --force to overwrite (this changes the comparison set)")
    db = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)

    tickers = [f"{s} ({n})" for s, n in db.execute("SELECT symbol, companyName FROM tickers WHERE isActive=1 ORDER BY symbol")]
    held = {s for s, _ in db.execute("SELECT symbol, companyName FROM tickers WHERE isActive=1")}
    interests = [r[0] for r in db.execute("SELECT displayName FROM geo_interests WHERE isActive=1 ORDER BY displayName")]

    exclude_ids, seen_titles = set(), set()
    if os.path.exists(FIX50):
        for x in json.load(open(FIX50))["articles"]:
            exclude_ids.add(x["id"]); seen_titles.add(norm_title(x["title"]))
    seen_urls = set()

    edge_idx = build_edge_index(db)
    name_idx = build_name_index(db)
    counterparties = {e["from"] if e["to"] == h else e["to"] for h in held for e in edge_idx.get(h, [])} - held
    cp_names = {sym: name_idx[sym] for sym in counterparties if sym in name_idx}
    q = """SELECT id, title, summary, domain, publishedAt, normalizedUrl, url FROM articles
           WHERE urgencyScore = ? AND domain = ?
             AND coalesce(urgencyReason,'') NOT LIKE 'AI(%' AND coalesce(urgencyReason,'') NOT LIKE 'AI:%'
             AND length(coalesce(summary,'')) >= 80
           ORDER BY (id * 7919) % 10007, id"""
    articles, counts = [], {}

    def match(id_, title, summary):
        syms = [s for (s,) in db.execute("SELECT symbol FROM article_ticker_matches WHERE articleId=? ORDER BY strength, symbol", (id_,))]
        # second pass: counterparties of held names, matched by distinctive company name in title/summary
        text = " " + re.sub(r"[^a-z0-9 ]+", " ", f"{title} {summary or ''}".lower()) + " "
        name_hits = [sym for sym, key in cp_names.items() if sym not in syms and f" {key} " in text]
        return syms + sorted(name_hits), name_hits

    def accept(id_, title, nurl, url):
        if id_ in exclude_ids:
            return False
        k = norm_title(title); u = nurl or url
        if k in seen_titles or u in seen_urls:
            return False
        seen_titles.add(k); seen_urls.add(u)
        return True

    for domain, score, n in STRATA:
        picked = 0
        for id_, title, summary, dom, pub, nurl, url in db.execute(q, (score, domain)):
            if not accept(id_, title, nurl, url):
                continue
            syms, name_hits = match(id_, title, summary)
            links, lseen = [], set()
            if domain == "finance":
                # candidates: every filings edge touching a matched ticker; mirrored
                # supplier/customer pairs collapse to one; edges whose other endpoint
                # is a held name come first, then edges off a held matched ticker.
                cands = []
                for s in syms:
                    for e in edge_idx.get(s, []):
                        other = e["to"] if e["from"] == s else e["from"]
                        cands.append(((other not in held, s not in held, e["from"], e["to"]), e))
                for _, e in sorted(cands, key=lambda x: x[0]):
                    key = canon(e)
                    if key in lseen:
                        continue
                    lseen.add(key); links.append(e)
                    if len(links) >= MAX_LINKS:
                        break
            articles.append({"id": id_, "title": title, "summary": summary, "domain": dom, "publishedAt": pub,
                             "stratum": f"{dom}:{score}", "tickers": syms, "name_hits": name_hits, "links": links,
                             "links_text": render_links(links, held) if domain == "finance" else None})
            picked += 1
            if picked >= n:
                break
        counts[f"{domain}:{score}"] = picked
        if picked < n:
            print(f"warning: only {picked}/{n} for {domain} score {score}", file=sys.stderr)

    # sixth stratum: counterparty-only finance articles, any keyword score, same pseudo-shuffle
    qcp = """SELECT id, title, summary, domain, publishedAt, normalizedUrl, url FROM articles
             WHERE domain='finance'
               AND coalesce(urgencyReason,'') NOT LIKE 'AI(%' AND coalesce(urgencyReason,'') NOT LIKE 'AI:%'
               AND length(coalesce(summary,'')) >= 80
             ORDER BY (id * 7919) % 10007, id"""
    picked, pool = 0, 0
    for id_, title, summary, dom, pub, nurl, url in db.execute(qcp):
        if id_ in exclude_ids:
            continue
        syms, name_hits = match(id_, title, summary)
        if not name_hits or any(x in held for x in syms):
            continue
        pool += 1
        if picked >= CP_STRATUM_N or not accept(id_, title, nurl, url):
            continue
        links, lseen = [], set()
        cands = []
        for sym in syms:
            for e in edge_idx.get(sym, []):
                other = e["to"] if e["from"] == sym else e["from"]
                cands.append(((other not in held, sym not in held, e["from"], e["to"]), e))
        for _, e in sorted(cands, key=lambda x: x[0]):
            key = canon(e)
            if key in lseen:
                continue
            lseen.add(key); links.append(e)
            if len(links) >= MAX_LINKS:
                break
        articles.append({"id": id_, "title": title, "summary": summary, "domain": dom, "publishedAt": pub,
                         "stratum": "finance:cp", "tickers": syms, "name_hits": name_hits, "links": links,
                         "links_text": render_links(links, held)})
        picked += 1
    counts["finance:cp"] = picked
    print(f"counterparty-only pool (any keyword score, excl. the 50): {pool}; took {picked}")

    try:
        commit = subprocess.check_output(["git", "-C", HERE, "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        commit = ""
    brief = load_brief()
    fx = {"frozen_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "db": a.db, "pulse_commit": commit,
          "brief": "v2", "brief_sha": hashlib.sha256(open(BRIEF, "rb").read()).hexdigest()[:12],
          "max_tokens": 128, "temperature": 0, "strata": counts, "max_links": MAX_LINKS,
          "prompt_lists": {"tickers": tickers, "interests": interests},
          "system_prompt": {
              "finance": brief["finance"].replace("{tickers}", ", ".join(tickers) or "none listed"),
              "finance_links_block": brief["links"],
              "general": brief["general"].replace("{interests}", ", ".join(interests) or "none listed"),
              "suffix": brief["suffix"]},
          "articles": articles}
    with open(FIXTURE, "w", encoding="utf-8") as f:
        json.dump(fx, f, indent=1, ensure_ascii=False)
    n_links = sum(1 for x in articles if x["links"])
    n_held = sum(1 for x in articles if x["domain"] == "finance" and any(s in held for s in x["tickers"]))
    n_cp = sum(1 for x in articles if x["domain"] == "finance" and x["name_hits"] and not any(s in held for s in x["tickers"]))
    print(f"counterparties of held names: {len(counterparties)} ({len(cp_names)} with a name key); "
          f"finance articles naming a counterparty but no held name: {n_cp}")
    print(f"wrote {FIXTURE}: {len(articles)} articles {counts}; {len(tickers)} tickers, {len(interests)} interests; "
          f"{n_held} finance articles match a held name; {n_links} have >=1 filings link "
          f"(edge index: {sum(len(v) for v in edge_idx.values())//2} unique filings edges over {len(edge_idx)} symbols)")


if __name__ == "__main__":
    main()
