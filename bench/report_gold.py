#!/usr/bin/env python3
"""Score quality.csv rows against the adjudicated gold set (bench/gold.json).

Groups rows by (model, brief, links) over the 271-article v2 fixture. Per group: exact agreement,
within-1, MAE, alert recall/precision at >=4 (and at 5), by stratum, plus paired with-vs-without-links
comparison per model (McNemar exact test on alert correctness) and the two pre-registered ensembles.

  python3 bench/report_gold.py [--gold bench/gold.json] [--md bench/VALUECHAIN_RESULTS.md]
"""
import argparse, csv, json, math, os, sys
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ALERT = 4


def mcnemar_exact(b, c):
    """Two-sided exact McNemar p for discordant counts b (A right, B wrong) and c (A wrong, B right)."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    p = sum(math.comb(n, i) for i in range(0, k + 1)) / 2 ** n
    return min(1.0, 2 * p)


def wilson(k, n, z=1.96):
    if n == 0:
        return (0, 0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def metrics(pred, gold, ids):
    ex = sum(pred[i] == gold[i] for i in ids); w1 = sum(abs(pred[i] - gold[i]) <= 1 for i in ids)
    mae = sum(abs(pred[i] - gold[i]) for i in ids) / len(ids)
    tp = sum(pred[i] >= ALERT and gold[i] >= ALERT for i in ids); fp = sum(pred[i] >= ALERT and gold[i] < ALERT for i in ids)
    fn = sum(pred[i] < ALERT and gold[i] >= ALERT for i in ids); pos = tp + fn
    tp5 = sum(pred[i] == 5 and gold[i] == 5 for i in ids); pos5 = sum(gold[i] == 5 for i in ids); pred5 = sum(pred[i] == 5 for i in ids)
    return {"n": len(ids), "exact": ex / len(ids), "within1": w1 / len(ids), "mae": mae,
            "recall": tp / pos if pos else float("nan"), "precision": tp / (tp + fp) if tp + fp else float("nan"),
            "tp": tp, "fp": fp, "fn": fn, "pos": pos, "recall_ci": wilson(tp, pos) if pos else (0, 0),
            "recall5": tp5 / pos5 if pos5 else float("nan"), "precision5": tp5 / pred5 if pred5 else float("nan"), "pos5": pos5}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gold", default=os.path.join(HERE, "gold.json"))
    ap.add_argument("--csv", default=os.path.join(HERE, "quality.csv"))
    ap.add_argument("--fixture", default=os.path.join(HERE, "articles_300.json"))
    ap.add_argument("--md", default=None)
    a = ap.parse_args()

    G = json.load(open(a.gold, encoding="utf-8"))
    gold = {int(k): v["score"] for k, v in G["labels"].items()}
    pending = [k for k, v in G["labels"].items() if v["source"] == "pending"]
    if pending:
        print(f"warning: {len(pending)} articles still pending adjudication (using Ashwin's label)", file=sys.stderr)
    fx = json.load(open(a.fixture, encoding="utf-8"))
    strat = {x["id"]: x["stratum"] for x in fx["articles"] if x["domain"] == "finance"}
    ids = sorted(i for i in gold if i in strat)

    # latest row per (group, article); group = (model, brief, links, decoder)
    rows = defaultdict(dict)
    with open(a.csv, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                ex = json.loads(r.get("extra") or "{}")
            except json.JSONDecodeError:
                ex = {}
            if ex.get("fixture") != os.path.basename(a.fixture) or r["parse_ok"] != "1":
                continue
            aid = int(r["article_id"])
            if aid not in strat:
                continue
            key = (r["model"], ex.get("brief", "v2"), int(ex.get("links", 0)))
            rows[key][aid] = int(r["score"])
            if ex.get("expected") is not None:  # decision models: expected-value decoder sibling
                rows[(r["model"] + "+ev", ex.get("brief", "v2"), int(ex.get("links", 0)))][aid] = max(1, min(5, round(float(ex["expected"]))))

    out = []
    out.append(f"# Results vs gold ({len(ids)} finance articles, brief v2, alert = score >= {ALERT})\n")
    gc = Counter(gold[i] for i in ids)
    out.append(f"gold distribution: {[gc[k] for k in range(1, 6)]}; alert rate {sum(gc[k] for k in (4, 5)) / len(ids):.0%}; "
               f"5-rate {gc[5] / len(ids):.0%}; adjudicated {G.get('n_adjudicated')} of {G.get('n_queue')} queued; "
               f"changed by adjudication {sum(1 for v in G['labels'].values() if v['source'] == 'adjudicated:changed')}\n")
    out.append("| model | brief | links | n | exact | within 1 | MAE | alert recall | precision | recall@5 | prec@5 |")
    out.append("|---|---|---|---|---|---|---|---|---|---|---|")
    full = {}
    for key in sorted(rows):
        pred = rows[key]
        have = [i for i in ids if i in pred]
        if len(have) < len(ids) * 0.9:
            out.append(f"| {key[0]} | {key[1]} | {key[2]} | {len(have)} | incomplete | | | | | | |")
            continue
        m = metrics(pred, gold, have); full[key] = (pred, have)
        lo, hi = m["recall_ci"]
        out.append(f"| {key[0]} | {key[1]} | {'yes' if key[2] else 'no'} | {m['n']} | {m['exact']:.0%} | {m['within1']:.0%} | {m['mae']:.2f} | "
                   f"{m['recall']:.0%} ({m['tp']}/{m['pos']}, CI {lo:.0%}–{hi:.0%}) | {m['precision']:.0%} ({m['fp']} false) | "
                   f"{m['recall5']:.0%} | {m['precision5']:.0%} |")

    # paired links effect per model (same brief v2)
    out.append("\n## Links effect (paired, same articles)\n")
    out.append("| model | alerts right: no-links only | links only | both | neither | McNemar p | exact no→links | MAE no→links |")
    out.append("|---|---|---|---|---|---|---|---|")
    models = sorted({k[0] for k in full if k[1] == "v2"})
    for mname in models:
        k0, k1 = (mname, "v2", 0), (mname, "v2", 1)
        if k0 not in full or k1 not in full:
            continue
        p0, h0 = full[k0]; p1, h1 = full[k1]
        both = [i for i in h0 if i in p1]
        r0 = {i: (p0[i] >= ALERT) == (gold[i] >= ALERT) for i in both}; r1 = {i: (p1[i] >= ALERT) == (gold[i] >= ALERT) for i in both}
        b = sum(r0[i] and not r1[i] for i in both); c = sum(r1[i] and not r0[i] for i in both)
        bb = sum(r0[i] and r1[i] for i in both); nn = sum(not r0[i] and not r1[i] for i in both)
        m0 = metrics(p0, gold, both); m1 = metrics(p1, gold, both)
        out.append(f"| {mname} | {b} | {c} | {bb} | {nn} | {mcnemar_exact(b, c):.3f} | {m0['exact']:.0%}→{m1['exact']:.0%} | {m0['mae']:.2f}→{m1['mae']:.2f} |")

    # by stratum, alert recall, for v2 groups
    out.append("\n## Alert recall by stratum (brief v2)\n")
    strata = sorted(set(strat.values()))
    out.append("| model | links | " + " | ".join(strata) + " |")
    out.append("|---|---|" + "---|" * len(strata))
    for key in sorted(full):
        if key[1] != "v2":
            continue
        pred, have = full[key]
        cells = []
        for s in strata:
            sid = [i for i in have if strat[i] == s]
            m = metrics(pred, gold, sid) if sid else None
            cells.append(f"{m['recall']:.0%} ({m['tp']}/{m['pos']}), {m['fp']} false" if m and m["pos"] else "–")
        out.append(f"| {key[0]} | {'yes' if key[2] else 'no'} | " + " | ".join(cells) + " |")

    # pre-registered ensembles over base (non-ev) v2 groups, separately for links on/off
    out.append("\n## Ensembles (pre-registered: (a) rounded mean, alert >= 4; (b) alert if >= 2 models alert)\n")
    for links in (0, 1):
        keys = [k for k in full if k[1] == "v2" and k[2] == links and not k[0].endswith("+ev")]
        if len(keys) < 2:
            continue
        common = [i for i in ids if all(i in full[k][0] for k in keys)]
        mean = {i: max(1, min(5, round(sum(full[k][0][i] for k in keys) / len(keys)))) for i in common}
        vote = {i: (ALERT if sum(full[k][0][i] >= ALERT for k in keys) >= 2 else 1) for i in common}
        ma, mb = metrics(mean, gold, common), metrics(vote, gold, common)
        out.append(f"links={'yes' if links else 'no'} over {len(keys)} models ({', '.join(k[0] for k in keys)}), n={len(common)}: "
                   f"(a) exact {ma['exact']:.0%} MAE {ma['mae']:.2f} recall {ma['recall']:.0%} precision {ma['precision']:.0%}; "
                   f"(b) recall {mb['recall']:.0%} precision {mb['precision']:.0%}")

    text = "\n".join(out)
    print(text)
    if a.md:
        open(a.md, "w", encoding="utf-8").write(text + "\n")
        print(f"\nwrote {a.md}")


if __name__ == "__main__":
    main()
