#!/usr/bin/env python3
"""Verify the filings-sourced value-chain edges used in articles_300.json against the cited EDGAR document.

An edge is `verified` when the distinctive names of BOTH endpoints appear in the cited document's text
(index pages are resolved to the primary document first). Writes:
  bench/edges_verified.json   per edge: status, which names were found, doc url, filer line
  bench/links_verified.json   per article id: links_text rebuilt from verified edges only (same format, cap 8)

Usage: python3 bench/verify_edges.py [--db PATH] [--rps 2]
EDGAR asks for a User-Agent with contact info and <=10 req/s; we use 2/s.
"""
import argparse, html, json, os, re, sqlite3, sys, time
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sample_300 import name_key, render_links, canon, DEFAULT_DB  # noqa: E402

FIXTURE = os.path.join(HERE, "articles_300.json")
UA = {"User-Agent": "Pulse bench (ashwin.sreedhar2003@gmail.com)", "Accept-Encoding": "gzip, deflate"}
CACHE = os.path.join(HERE, ".edgar_cache")


def fetch(url, rps):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9]+", "_", url)[-180:])
    if os.path.exists(fn):
        return open(fn, encoding="utf-8", errors="ignore").read()
    for attempt in range(3):
        time.sleep(1.0 / rps)
        try:
            r = requests.get(url, headers=UA, timeout=90)
        except requests.RequestException as e:
            if attempt == 2:
                return f"__HTTP_timeout__"
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code != 200:
            return f"__HTTP_{r.status_code}__"
        open(fn, "w", encoding="utf-8").write(r.text)
        return r.text


def to_text(doc):
    doc = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", doc)
    doc = re.sub(r"(?s)<[^>]+>", " ", doc)
    doc = html.unescape(doc)
    return " " + re.sub(r"[^a-z0-9 ]+", " ", doc.lower()) + " "


def primary_doc(index_url, index_html):
    """From an EDGAR -index.htm page, pick the main document: first .htm/.html row that is not the index itself."""
    base = index_url.rsplit("/", 1)[0] + "/"
    cands = re.findall(r'href="([^"]+\.html?)"', index_html, flags=re.I)
    for c in cands:
        if "-index" in c or c.endswith("/"):
            continue
        name = c.split("/")[-1]
        if name.lower().startswith(("ex-", "ex_", "exhibit", "ex99", "ex10", "ex31", "ex32")):
            continue
        return base + name if not c.startswith("http") else c
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--rps", type=float, default=2.0)
    a = ap.parse_args()
    fx = json.load(open(FIXTURE, encoding="utf-8"))
    held = {t.split(" ")[0] for t in fx["prompt_lists"]["tickers"]}

    # company names: held from the fixture list, everything else from chain nodes
    names = {t.split(" ")[0]: t[t.find("(") + 1:t.rfind(")")] for t in fx["prompt_lists"]["tickers"]}
    db = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    for _, gj in db.execute("SELECT symbol, graphJson FROM company_value_chains WHERE status='ready' AND graphJson IS NOT NULL"):
        try:
            g = json.loads(gj)
        except Exception:
            continue
        for n in g.get("nodes", []):
            if n.get("kind") == "ticker" and n.get("symbol") and n.get("name"):
                names.setdefault(n["symbol"], n["name"])
    keys = {s: name_key(n) for s, n in names.items()}

    edges = {}
    for art in fx["articles"]:
        for e in art.get("links", []):
            edges.setdefault(canon(e), e)
    print(f"{len(edges)} unique edges, {len(set(e['url'] for e in edges.values()))} documents", flush=True)

    out, docs = {}, {}
    for i, (k, e) in enumerate(sorted(edges.items()), 1):
        url = e.get("url") or ""
        rec = {"from": e["from"], "to": e["to"], "relationship": e["relationship"], "form": e["form"], "url": url}
        if not url:
            rec["status"] = "no_url"; out["|".join(k)] = rec; continue
        if url not in docs:
            raw = fetch(url, a.rps)
            if raw.startswith("__HTTP_"):
                docs[url] = {"status": raw, "text": "", "doc": url}
            else:
                doc_url = url
                if url.endswith("-index.htm") or url.endswith("-index.html"):
                    pd = primary_doc(url, raw)
                    if pd:
                        doc_url = pd; raw2 = fetch(pd, a.rps)
                        raw = raw2 if not raw2.startswith("__HTTP_") else raw
                text = to_text(raw)
                docs[url] = {"status": "ok", "text": text, "doc": doc_url, "image_only": len(text) < 3000}
        d = docs[url]
        rec["doc"] = d["doc"]
        if d["status"] != "ok":
            rec["status"] = d["status"]
        elif d.get("image_only"):
            rec["status"] = "unverifiable_short_doc"
        else:
            kf, kt = keys.get(e["from"]), keys.get(e["to"])
            ff = bool(kf) and f" {kf} " in d["text"]
            ft = bool(kt) and f" {kt} " in d["text"]
            rec.update({"from_key": kf, "to_key": kt, "from_found": ff, "to_found": ft})
            rec["status"] = "verified" if (ff and ft) else ("no_key" if not (kf and kt) else ("filer_only" if (ff or ft) else "neither_named"))
        out["|".join(k)] = rec
        if i % 25 == 0:
            print(f"  {i}/{len(edges)}", flush=True)

    from collections import Counter
    c = Counter(r["status"] for r in out.values())
    print("edge status:", dict(c))
    json.dump(out, open(os.path.join(HERE, "edges_verified.json"), "w", encoding="utf-8"), indent=1)

    # rebuild per-article links text from verified edges only (same ordering/cap as the fixture)
    ver = {k for k, r in out.items() if r["status"] == "verified"}
    per = {}
    n_any = 0
    for art in fx["articles"]:
        if art["domain"] != "finance":
            continue
        kept = [e for e in art.get("links", []) if "|".join(canon(e)) in ver][:8]
        per[str(art["id"])] = render_links(kept, held)
        n_any += bool(kept)
    json.dump({"fixture": os.path.basename(FIXTURE), "frozen_at": fx["frozen_at"], "rule": "both endpoint names appear in cited document",
               "n_edges": len(edges), "n_verified": len(ver), "links": per},
              open(os.path.join(HERE, "links_verified.json"), "w", encoding="utf-8"), indent=1)
    print(f"wrote links_verified.json: {n_any} of {len(per)} articles keep >=1 verified link")


if __name__ == "__main__":
    main()
