#!/usr/bin/env python3
"""Classification as retrieval: a kNN "history vote" baseline for Pulse's urgency score.

No model call. For each of the 271 gold articles (leave-one-out), retrieve the k nearest labelled
articles among the other 270, take a rank-weighted vote (1/(rank+1)) over their gold scores, and
report the winning score's vote share as the confidence. Also a kNN-regression variant (weighted
mean score, rounded) for MAE. The method and k=10 follow XERJ's benchmarks/decisions-as-retrieval
(github.com/xerj-org/xerj); k and the weights were fixed before any result was seen.

Arms (retrieval only, no embedder): BM25 (rank_bm25, Okapi) and TF-IDF cosine (scikit-learn,
word 1-2 grams, sublinear tf). A MiniLM arm (sentence-transformers/all-MiniLM-L6-v2) is wired in
behind --minilm and runs when the package and model are available (huggingface.co is not reachable
from the machines this was first run on).

Text variants, matching the eval's links column: "no" = headline + summary; "yes" = headline +
summary + matched tickers with [held] tags + the article's rendered value-chain links.

Baselines: majority class (always 4) and the sampling-stratum prior (the modal gold score of the
other articles in the same fixture stratum: finance:1/3/5 are Pulse's stored keyword score computed
from title + summary; finance:cp is the sampler's counterparty-only bucket). Both baselines and the
kNN are supervised on the other 270 gold labels; this is a retrospective leave-one-out (BM25/TF-IDF
statistics include the query document; neighbours may postdate the query), not a prospective
history evaluation.

Metrics: exact, within-1, MAE, alert recall / precision at >= 4 (same definitions as report_gold.py),
ECE (10 bins) of the vote share against exact-match correctness, and the decided-at-confidence gate:
share of articles with confidence >= 0.8, exact accuracy and alert accuracy on that subset.

  python3 bench/knn_vote.py [--k 10] [--md bench/KNN_VOTE.md] [--json bench/knn_vote.json] [--minilm]
Per-article predictions, confidences and neighbour lists are written to the --json file.
"""
import argparse, json, math, os, re, sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ALERT = 4
TOKEN = re.compile(r"[a-z0-9]+(?:[.'][a-z0-9]+)*")


def tokenize(s):
    return TOKEN.findall(s.lower())


def held_set(fixture):
    return {t.split(" ")[0] for t in fixture["prompt_lists"]["tickers"]}


def render_links(art, held, cap):
    seen, out = set(), []
    # held-name endpoints first, mirrors collapsed, cap — same shape as the eval's links block
    edges = sorted(art.get("links") or [], key=lambda e: not (e["from"] in held or e["to"] in held))
    for e in edges:
        key = frozenset((e["from"], e["to"], e["relationship"]))
        if key in seen:
            continue
        seen.add(key)
        tag = lambda t: f"{t} [held]" if t in held else t
        out.append(f"{tag(e['from'])} -> {e['relationship']} -> {tag(e['to'])} ({e.get('form', '')} {e.get('filed_year', '')})")
        if len(out) >= cap:
            break
    return out


def texts(arts, fixture, variant):
    held = held_set(fixture)
    cap = fixture.get("max_links", 8)
    out = []
    for a in arts:
        base = f"{a['title']}. {a.get('summary') or ''}"
        if variant == "no":
            out.append(base)
            continue
        tick = [t for t in a.get("tickers", []) if t != "__none__"]
        tick_s = ", ".join(f"{t} [held]" if t in held else t for t in tick)
        links = render_links(a, held, cap)
        out.append(base + (f" Companies: {tick_s}." if tick_s else "") + (" Links: " + "; ".join(links) if links else ""))
    return out


# ---------------- retrieval arms: each returns, for query i, ranked neighbour indices excluding i ----------------

def neighbours_bm25(docs, k):
    from rank_bm25 import BM25Okapi
    toks = [tokenize(d) for d in docs]
    bm = BM25Okapi(toks)
    out = []
    for i, q in enumerate(toks):
        s = bm.get_scores(q)
        s[i] = -1e9
        idx = sorted(range(len(docs)), key=lambda j: -s[j])[:k]
        out.append([(j, float(s[j])) for j in idx if s[j] > 0])
    return out


def neighbours_tfidf(docs, k):
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    X = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1, token_pattern=TOKEN.pattern).fit_transform(docs)
    S = cosine_similarity(X)
    out = []
    for i in range(len(docs)):
        s = S[i].copy()
        s[i] = -1
        idx = s.argsort()[::-1][:k]
        out.append([(int(j), float(s[j])) for j in idx if s[j] > 0])
    return out


def neighbours_minilm(docs, k):
    from sentence_transformers import SentenceTransformer
    import numpy as np
    m = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    E = m.encode(docs, normalize_embeddings=True, batch_size=64)
    S = E @ E.T
    out = []
    for i in range(len(docs)):
        s = S[i].copy()
        s[i] = -1
        idx = np.argsort(-s)[:k]
        out.append([(int(j), float(s[j])) for j in idx])
    return out


ARMS = {"bm25": neighbours_bm25, "tfidf": neighbours_tfidf, "minilm": neighbours_minilm}


# ---------------- vote ----------------

def vote(neigh, gold_list):
    """Rank-weighted vote. Returns (argmax score, confidence=vote share, weighted-mean score)."""
    if not neigh:
        return None, 0.0, None
    w = Counter()
    tot = 0.0
    mean = 0.0
    for r, (j, _) in enumerate(neigh):
        wt = 1.0 / (r + 1)
        w[gold_list[j]] += wt
        tot += wt
        mean += wt * gold_list[j]
    lab, top = w.most_common(1)[0]
    return lab, top / tot, mean / tot


def ece(conf_correct, bins=10):
    n = len(conf_correct)
    tot = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        xs = [(c, k) for c, k in conf_correct if (lo < c <= hi) or (b == 0 and c == 0)]
        if xs:
            tot += len(xs) / n * abs(sum(k for _, k in xs) / len(xs) - sum(c for c, _ in xs) / len(xs))
    return tot


def metrics(pred, gold, ids):
    ex = sum(pred[i] == gold[i] for i in ids)
    w1 = sum(abs(pred[i] - gold[i]) <= 1 for i in ids)
    mae = sum(abs(pred[i] - gold[i]) for i in ids) / len(ids)
    tp = sum(pred[i] >= ALERT and gold[i] >= ALERT for i in ids)
    fp = sum(pred[i] >= ALERT and gold[i] < ALERT for i in ids)
    fn = sum(pred[i] < ALERT and gold[i] >= ALERT for i in ids)
    pos = tp + fn
    return {"n": len(ids), "exact": ex / len(ids), "within1": w1 / len(ids), "mae": mae,
            "recall": tp / pos if pos else float("nan"), "precision": tp / (tp + fp) if tp + fp else float("nan"),
            "tp": tp, "fp": fp, "fn": fn, "pos": pos}


def gate(pred, conf, gold, ids, thr=0.8):
    sel = [i for i in ids if conf[i] >= thr]
    if not sel:
        return {"coverage": 0.0, "exact": float("nan"), "alert_acc": float("nan"), "n": 0}
    return {"coverage": len(sel) / len(ids), "n": len(sel),
            "exact": sum(pred[i] == gold[i] for i in sel) / len(sel),
            "alert_acc": sum((pred[i] >= ALERT) == (gold[i] >= ALERT) for i in sel) / len(sel)}


def pc(x):
    return "–" if x != x else f"{100 * x:.0f}%"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gold", default=os.path.join(HERE, "gold.json"))
    ap.add_argument("--fixture", default=os.path.join(HERE, "articles_300.json"))
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--minilm", action="store_true")
    ap.add_argument("--md", default=None)
    ap.add_argument("--json", default=None)
    a = ap.parse_args()

    G = json.load(open(a.gold, encoding="utf-8"))
    gold = {int(k): v["score"] for k, v in G["labels"].items() if v["source"] != "pending"}
    FX = json.load(open(a.fixture, encoding="utf-8"))
    arts = [x for x in FX["articles"] if x["id"] in gold]
    ids = [x["id"] for x in arts]
    gold_list = [gold[i] for i in ids]
    strata = {x["id"]: x["stratum"] for x in arts}
    print(f"{len(arts)} gold articles, k={a.k}, gold distribution {dict(sorted(Counter(gold_list).items()))}", file=sys.stderr)

    rows = []  # (label, links, pred_argmax, conf, pred_reg)
    arms = ["bm25", "tfidf"] + (["minilm"] if a.minilm else [])
    for arm in arms:
        for variant in ("no", "yes"):
            docs = texts(arts, FX, variant)
            try:
                neigh = ARMS[arm](docs, a.k)
            except Exception as e:  # missing package / model
                print(f"skip {arm}: {e}", file=sys.stderr)
                break
            pa, conf, pr = {}, {}, {}
            nohit = 0
            for q, i in enumerate(ids):
                lab, c, m = vote(neigh[q], gold_list)
                if lab is None:
                    nohit += 1
                    fallback = Counter(gold_list[j] for j in range(len(ids)) if j != q).most_common(1)[0][0]
                    lab, c, m = fallback, 0.0, float(fallback)  # LOO majority class, zero confidence (abstains at any gate)
                pa[i], conf[i], pr[i] = lab, c, int(round(m))
            rows.append({"arm": arm, "links": variant, "pred": pa, "conf": conf, "reg": pr, "nohit": nohit})

    # baselines
    maj = {i: 4 for i in ids}
    prior = {}
    for i in ids:
        others = [gold[j] for j in ids if j != i and strata[j] == strata[i]]
        prior[i] = Counter(others).most_common(1)[0][0]
    base_rows = [("majority class (always 4)", maj), ("sampling-stratum prior (LOO mode)", prior)]

    # ---- report ----
    out_lines = []
    P = out_lines.append
    P(f"# kNN history vote on the 271-article gold set (k = {a.k}, leave-one-out)\n")
    P("Classification as retrieval, no model call (method from XERJ's decisions-as-retrieval benchmark): rank-weighted vote over the k nearest labelled articles; confidence = winning score's vote share. Same gold, alert and metric definitions as VALUECHAIN_EVAL.md. Gate = articles decided at confidence >= 0.8.\n")
    P("| arm | links | decoder | exact | within 1 | MAE | alert recall | precision | ECE | gate coverage | gate exact | gate alert-correct | gate alert precision |")
    P("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    res = {"k": a.k, "n": len(ids), "rows": []}
    for name, pred in base_rows:
        m = metrics(pred, gold, ids)
        P(f"| {name} | – | – | {pc(m['exact'])} | {pc(m['within1'])} | {m['mae']:.2f} | {pc(m['recall'])} ({m['tp']}/{m['pos']}) | {pc(m['precision'])} ({m['fp']} false) | – | – | – | – | – |")
        res["rows"].append({"arm": name, **{k: v for k, v in m.items()}})
    for r in rows:
        for dec, pred in (("argmax", r["pred"]), ("weighted mean", r["reg"])):
            m = metrics(pred, gold, ids)
            if dec == "argmax":  # the vote share is the argmax class's confidence; it is not a probability for the mean decoder
                cc = [(r["conf"][i], 1 if pred[i] == gold[i] else 0) for i in ids]
                e = ece(cc)
                g = gate(pred, r["conf"], gold, ids)
                sel = [i for i in ids if r["conf"][i] >= 0.8]
                gp = metrics(pred, gold, sel) if sel else None
                gate_s = f"{e:.3f} | {pc(g['coverage'])} ({g['n']}) | {pc(g['exact'])} | {pc(g['alert_acc'])} | {pc(gp['precision']) if gp else '–'} ({gp['fp'] if gp else 0} false)"
                res["rows"].append({"arm": r["arm"], "links": r["links"], "decoder": dec, **m, "ece": e, "gate": g, "gate_precision": gp["precision"] if gp else None, "nohit": r["nohit"]})
            else:
                gate_s = "– | – | – | – | –"
                res["rows"].append({"arm": r["arm"], "links": r["links"], "decoder": dec, **m, "nohit": r["nohit"]})
            P(f"| {r['arm']} | {r['links']} | {dec} | {pc(m['exact'])} | {pc(m['within1'])} | {m['mae']:.2f} | {pc(m['recall'])} ({m['tp']}/{m['pos']}) | {pc(m['precision'])} ({m['fp']} false) | {gate_s} |")
    # per-stratum recall for the argmax rows
    P("\nAlert recall by stratum (argmax rows; gold positives per stratum in the header):\n")
    strat_names = sorted(set(strata.values()))
    pos_by = {s: sum(1 for i in ids if strata[i] == s and gold[i] >= ALERT) for s in strat_names}
    P("| arm | links | " + " | ".join(f"{s} ({pos_by[s]})" for s in strat_names) + " |")
    P("|---|---|" + "---|" * len(strat_names))
    for r in rows:
        cells = []
        for s in strat_names:
            sid = [i for i in ids if strata[i] == s]
            m = metrics(r["pred"], gold, sid)
            cells.append(f"{pc(m['recall'])} ({m['tp']}/{m['pos']})")
        P(f"| {r['arm']} | {r['links']} | " + " | ".join(cells) + " |")
    # confidence histogram for the first arm with links
    for r in rows:
        if r["links"] == "yes":
            hist = Counter(min(int(r["conf"][i] * 10), 9) for i in ids)
            P(f"\nConfidence histogram, {r['arm']} with links (tenths): " + ", ".join(f"{b / 10:.1f}–{(b + 1) / 10:.1f}: {hist.get(b, 0)}" for b in range(10)))
            break
    text = "\n".join(out_lines) + "\n"
    print(text)
    if a.md:
        open(a.md, "w", encoding="utf-8").write(text)
    if a.json:
        res["per_article"] = {str(i): {"gold": gold[i], "stratum": strata[i], "prior": prior[i],
                              **{f"{r['arm']}/{r['links']}": {"argmax": r["pred"][i], "conf": round(r["conf"][i], 4), "mean": r["reg"][i]} for r in rows}} for i in ids}
        res["inputs"] = {"gold_sha": G.get("brief_sha"), "fixture_frozen_at": FX.get("frozen_at"), "n_gold": len(ids)}
        json.dump(res, open(a.json, "w"), indent=1)


if __name__ == "__main__":
    main()
