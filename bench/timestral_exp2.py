"""Experiment 2: next-trading-day log volume, |return| and return with Timestral-28M.
Implements bench/PREREG_EXP2.md exactly; read it first. Anything that differs is logged there under
"Deviations".

    python bench/timestral_exp2.py --window dev        # pipeline check: 50 origins, writes EXP2_DEV.md
    python bench/timestral_exp2.py --window holdout    # the one scored run: writes EXP2_RESULTS.md
    python bench/timestral_exp2.py --window dev --tiny # random-weight model, no HF (code check only)

The holdout refuses to run twice (bench/data/exp2_holdout.done). Inputs are hash-checked against the
values frozen in the Runpod project's plan; a mismatch aborts.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import os
import statistics
import time
import warnings

import numpy as np

warnings.filterwarnings("ignore", category=RuntimeWarning)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
FROZEN = {  # sha256, recorded at freeze (2026-10-21 03:25 ET)
    "PREREG_EXP2.md#frozen": "de848082a5e365ebf89c395a66aaa78690cbcab6af282af30d2e4b0a12777b6e",
    "data/prices_daily.csv": "3b7f9d591313a1e730676c2f345585ded2ca8681b26649df090f86b13914c1ba",
    "data/gkg_daily_v2.csv": "2c8099907db399a8b2123bf223934567afa943cc155d49874644f1c673a9be85",
    "data/links_frozen.csv": "f94f97b7e039e3b6fc0aecfa2b500e6aeb79effdd0990f83311422c13134551c",
}
BENCH = {"SPY", "QQQ", "SMH", "SOXX", "VIX"}
CONTEXT = 1024
HOLDOUT_N = 126
DEV_N, DEV_STEP = 250, 5
MIN_DAYS_BEFORE_HOLDOUT = 250
ALPHA_G1, ALPHA_G23 = 0.01, 0.05 / 6

ap = argparse.ArgumentParser()
ap.add_argument("--window", choices=["dev", "holdout"], required=True)
ap.add_argument("--threads", type=int, default=8)
ap.add_argument("--tiny", action="store_true")
ap.add_argument("--max-origins", type=int, default=0, help="dev only: cap origins (code checks)")
args = ap.parse_args()


# ---------------- integrity ----------------
def sha(path, frozen_part=False):
    b = open(path, "rb").read()
    if frozen_part:
        b = b[: b.index(b"## Deviations")]
    return hashlib.sha256(b).hexdigest()


for key, want in FROZEN.items():
    rel, part = (key.split("#")[0], True) if "#" in key else (key, False)
    got = sha(os.path.join(HERE, rel), part)
    if got != want:
        raise SystemExit(f"frozen input changed: {key} sha256 {got} != {want}")
done_flag = os.path.join(DATA, "exp2_holdout.done")
if args.window == "holdout" and os.path.exists(done_flag):
    raise SystemExit(f"holdout already scored ({open(done_flag).read().strip()}); prereg says once")
if args.window == "holdout" and args.tiny:
    raise SystemExit("--tiny is for code checks on dev only")

# ---------------- data ----------------
px = {}
for r in csv.DictReader(open(os.path.join(DATA, "prices_daily.csv"))):
    px.setdefault(r["symbol"], {})[r["date"]] = (float(r["close"]), float(r["volume"]) if r["volume"] else np.nan)
cal = sorted(px["SPY"])  # NYSE trading calendar
cal = [d for d in cal if d <= "2026-10-20"]
T = len(cal)
ti = {d: i for i, d in enumerate(cal)}
dates = [dt.date.fromisoformat(d) for d in cal]
held = sorted(s for s in px if s not in BENCH)
# Held list reference: the 75 symbols in the GDELT file (tickers.isActive = 1 when it was pulled), so held
# tickers with no Nasdaq rows at all are reported as excluded rather than silently absent.
held_ref = sorted({r["symbol"] for r in csv.DictReader(open(os.path.join(DATA, "gkg_daily_v2.csv")))})

hold = list(range(T - HOLDOUT_N, T))
dev = list(range(T - HOLDOUT_N - DEV_N, T - HOLDOUT_N, DEV_STEP))
origins = hold if args.window == "holdout" else (dev[: args.max_origins] if args.max_origins else dev)
h0 = hold[0]


def series(sym):
    c = np.full(T, np.nan)
    v = np.full(T, np.nan)
    for d, (cl, vol) in px.get(sym, {}).items():
        if d in ti:
            c[ti[d]], v[ti[d]] = cl, vol
    return c, v


universe, excluded = [], {}
for s in held:
    c, _ = series(s)
    n_before = int(np.isfinite(c[:h0]).sum())
    if n_before >= MIN_DAYS_BEFORE_HOLDOUT:
        universe.append(s)
    else:
        excluded[s] = f"{n_before} trading days before the holdout"
for s in held_ref:
    if s not in px:
        excluded[s] = "no Nasdaq history"
S = len(universe)
C = np.stack([series(s)[0] for s in universe])
V = np.stack([series(s)[1] for s in universe])
R = np.full((S, T), np.nan)
R[:, 1:] = 100 * np.log(C[:, 1:] / C[:, :-1])
LNV = np.where(V > 0, np.log(V), np.nan)
ABSR = np.abs(R)
smh_c, _ = series("SMH")
SMH_R = np.full(T, np.nan)
SMH_R[1:] = 100 * np.log(smh_c[1:] / smh_c[:-1])

# News on the trading axis (prereg "Calendar and look-ahead cutoff"): log1p of the GDELT counts over UTC
# days date(t-1) .. date(t)-1. Missing (outage) UTC days are skipped; all missing -> NaN.
gk = {}
for r in csv.DictReader(open(os.path.join(DATA, "gkg_daily_v2.csv"))):
    gk.setdefault(r["symbol"], {})[r["date"]] = int(r["count"])
NEWS = np.full((S, T), np.nan)
for i, s in enumerate(universe):
    m = gk.get(s, {})
    for t in range(1, T):
        d, tot, seen = dates[t - 1], 0, 0
        while d < dates[t]:
            k = d.isoformat()
            if k in m:
                tot += m[k]
                seen += 1
            d += dt.timedelta(days=1)
        if seen:
            NEWS[i, t] = math.log1p(tot)

# Linked peers: held tickers that are customers or suppliers (either edge direction), equal-weight mean r.
priced_held = {s for s in held}
nbrs = {s: set() for s in universe}
for r in csv.DictReader(open(os.path.join(DATA, "links_frozen.csv"))):
    a, b = r["fromSymbol"], r["toSymbol"]
    if a in nbrs and b in priced_held and a != b:
        nbrs[a].add(b)
    if b in nbrs and a in priced_held and a != b:
        nbrs[b].add(a)
peer_r_all = {s: (100 * np.log(series(s)[0][1:] / series(s)[0][:-1])) for s in priced_held}
PEER = np.full((S, T), np.nan)
for i, s in enumerate(universe):
    if nbrs[s]:
        stack = np.stack([np.concatenate([[np.nan], peer_r_all[j]]) for j in sorted(nbrs[s])])
        PEER[i] = np.nanmean(stack, axis=0)
has_peers = np.array([bool(nbrs[s]) for s in universe])
DOW = np.array([d.weekday() for d in dates], dtype=np.float64)

# ---------------- model ----------------
import torch
from timestral import TimestralForecaster

torch.set_num_threads(args.threads)
if args.tiny:
    from timestral import TimestralConfig, TimestralModel
    knots = (0.01, 0.05) + tuple(round(0.1 + 0.05 * i, 2) for i in range(17)) + (0.95, 0.99)
    torch.manual_seed(0)
    F = TimestralForecaster(TimestralModel(TimestralConfig(
        patch_size=8, d_model=32, num_heads=4, mlp_hidden_dim=64, block_schedule=("time", "time_variate"),
        quantile_knots=knots, block_size=4, context_length=4096)).eval())
else:
    F = TimestralForecaster.from_pretrained("mistralai/Timestral-28M")
LEVELS = np.array([float(x) for x in F.quantile_levels])
Q = len(LEVELS)
ia = {round(float(a), 2): i for i, a in enumerate(LEVELS)}
Z = np.array([statistics.NormalDist().inv_cdf(a) for a in LEVELS])

TARGETS = {"T1_lnV": LNV, "T2_absr": ABSR, "T3_r": R}
VARIANTS = ["M0", "M1", "M2", "M3"]


def timestral(Y, t, variant):
    lo = max(0, t - CONTEXT)
    kw = {"categorical_known_covariates": np.broadcast_to(DOW[lo:t + 1], (S, t + 1 - lo))[:, None, :].copy()}
    if variant in ("M1", "M3"):
        kw["known_covariates"] = NEWS[:, None, lo:t + 1]
    if variant in ("M2", "M3"):
        kw["past_covariates"] = np.stack([PEER[:, lo:t], np.broadcast_to(SMH_R[lo:t], (S, t - lo))], axis=1)
    return F.forecast(Y[:, None, lo:t], prediction_length=1, **kw).quantiles.numpy()[:, 0, 0, :]


def empirical(Y, t, n, min_n):
    w = Y[:, max(0, t - n):t]
    return np.stack([np.nanquantile(w[i], LEVELS) if np.isfinite(w[i]).sum() >= min_n else np.full(Q, np.nan)
                     for i in range(S)])


# EWMA(0.94) variance: seeded with the variance of each ticker's first 60 finite returns.
SIG2 = np.full((S, T), np.nan)
for i in range(S):
    fin = np.where(np.isfinite(R[i]))[0]
    if len(fin) < 61:
        continue
    seed_end = fin[59]
    SIG2[i, seed_end + 1] = np.var(R[i, fin[:60]])
    for t in range(seed_end + 2, T):
        x = R[i, t - 1]
        SIG2[i, t] = 0.94 * SIG2[i, t - 1] + 0.06 * x * x if np.isfinite(x) else SIG2[i, t - 1]


def point(v):
    return np.repeat(v[:, None], Q, axis=1)


def baselines(tk, t):
    if tk == "T1_lnV":
        return {"naive": point(LNV[:, t - 1]), "empirical60*": empirical(LNV, t, 60, 30)}
    if tk == "T2_absr":
        return {"empirical60*": empirical(ABSR, t, 60, 30), "ewma_point": point(np.sqrt(SIG2[:, t]) * math.sqrt(2 / math.pi))}
    return {"random_walk": point(np.zeros(S)), "hist_sim250": empirical(R, t, 250, 125),
            "ewma_gauss*": np.sqrt(SIG2[:, t])[:, None] * Z[None, :]}


BINDING = {"T1_lnV": "empirical60*", "T2_absr": "empirical60*", "T3_r": "ewma_gauss*"}

# ---------------- run ----------------
K = len(origins)
FC = {tk: {} for tk in TARGETS}
t_start = time.perf_counter()
for tk, Y in TARGETS.items():
    for m in VARIANTS:
        FC[tk][m] = np.full((S, K, Q), np.nan)
    for k, t in enumerate(origins):
        for m in VARIANTS:
            FC[tk][m][:, k] = timestral(Y, t, m)
        for b, q in baselines(tk, t).items():
            FC[tk].setdefault(b, np.full((S, K, Q), np.nan))[:, k] = q
        if k == 0 and tk == "T1_lnV":
            per = time.perf_counter() - t_start
            print(f"first origin {per:.1f}s for 4 variants; est. total {per * K * 3 / 60:.0f} min", flush=True)
    print(f"{tk}: done, {time.perf_counter() - t_start:.0f}s elapsed", flush=True)


# ---------------- scoring ----------------
def crps(q, y):
    pin = np.where(y[..., None] < q, (1 - LEVELS) * (q - y[..., None]), LEVELS * (y[..., None] - q))
    return 2 * np.trapezoid(pin, LEVELS, axis=-1) if hasattr(np, "trapezoid") else 2 * np.trapz(pin, LEVELS, axis=-1)


def sign_p(w, l):
    n = w + l
    if n == 0:
        return float("nan")
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(min(w, l) + 1)) / 2 ** n)


def compare(tk, a, b, sel):
    """Paired over (ticker, origin) where y, a and b are all finite, tickers in sel."""
    y = TARGETS[tk][:, origins]
    qa, qb = FC[tk][a], FC[tk][b]
    ok = np.isfinite(y) & np.isfinite(qa).all(-1) & np.isfinite(qb).all(-1) & sel[:, None]
    ca = np.where(ok, crps(np.nan_to_num(qa), np.nan_to_num(y)), np.nan)
    cb = np.where(ok, crps(np.nan_to_num(qb), np.nan_to_num(y)), np.nan)
    pa, pb = np.nanmean(ca, axis=1), np.nanmean(cb, axis=1)
    use = np.isfinite(pa) & np.isfinite(pb) & (pb > 0)
    r = pa[use] / pb[use]
    gm = float(np.exp(np.mean(np.log(np.clip(r, 1e-9, None))))) if use.any() else float("nan")
    w, l = int((r < 1).sum()), int((r > 1).sum())
    skill = 1 - np.nansum(ca) / np.nansum(cb) if np.nansum(cb) > 0 else float("nan")
    return {"ratio": gm, "w": w, "l": l, "p": sign_p(w, l), "skill": skill, "n_t": int(use.sum()), "n_pairs": int(ok.sum())}


def calib(tk, m):
    y = TARGETS[tk][:, origins]
    q = FC[tk][m]
    ok = np.isfinite(y) & np.isfinite(q).all(-1)
    cov = ((y >= q[..., ia[0.1]]) & (y <= q[..., ia[0.9]]))[ok].mean() if ok.any() else float("nan")
    exc = (y >= q[..., ia[0.9]])[ok].mean() if ok.any() else float("nan")
    return float(cov), float(exc)


def directional(m):
    y = R[:, origins]
    med = FC["T3_r"][m][..., ia[0.5]]
    ok = np.isfinite(y) & np.isfinite(med) & (med != 0) & (y != 0)
    hits = int((np.sign(med) == np.sign(y))[ok].sum())
    n = int(ok.sum())
    up = float((y[ok] > 0).mean()) if n else float("nan")  # deviation 2: what "always up" would score
    p = sign_p(hits, n - hits)
    ics = []
    for k in range(len(origins)):
        g = np.isfinite(y[:, k]) & np.isfinite(med[:, k])
        if g.sum() >= 10:
            ra = np.argsort(np.argsort(med[g, k]))
            rb = np.argsort(np.argsort(y[g, k]))
            ics.append(np.corrcoef(ra, rb)[0, 1])
    ics = np.array([x for x in ics if np.isfinite(x)])
    tstat = float(ics.mean() / ics.std(ddof=1) * math.sqrt(len(ics))) if len(ics) > 2 else float("nan")
    return hits, n, p, float(ics.mean()) if len(ics) else float("nan"), tstat, len(ics), up


allsel = np.ones(S, bool)
lines = [f"# Experiment 2 results ({args.window}{', TINY DRY RUN, random weights' if args.tiny else ''})", "",
         f"Generated {dt.datetime.now().isoformat(timespec='minutes')} by bench/timestral_exp2.py, implementing "
         f"bench/PREREG_EXP2.md (frozen sha256 {FROZEN['PREREG_EXP2.md#frozen'][:12]}...). Inputs hash-checked.", "",
         f"Universe: {S} tickers. Excluded: " + (", ".join(f"{k} ({v})" for k, v in sorted(excluded.items())) or "none") + ".",
         f"Origins: {K} ({cal[origins[0]]}..{cal[origins[-1]]}). Tickers with >= 1 linked peer: {int(has_peers.sum())}.",
         f"Run time: {time.perf_counter() - t_start:.0f}s on {args.threads} threads.", "", "## Gates", ""]
verdict = {}
for tk in TARGETS:
    b = BINDING[tk]
    g1 = compare(tk, "M0", b, allsel)
    g2 = compare(tk, "M1", "M0", allsel)
    g3 = compare(tk, "M2", "M0", has_peers)
    p1 = g1["ratio"] < 1 and g1["p"] < ALPHA_G1
    p2 = g2["ratio"] < 1 and g2["p"] < ALPHA_G23
    p3 = g3["ratio"] < 1 and g3["p"] < ALPHA_G23
    verdict[tk] = (p1, p2, p3)
    lines += [f"- {tk} G1 M0 vs {b}: ratio {g1['ratio']:.3f}, tickers {g1['w']}/{g1['l']} (p {g1['p']:.2g}), "
              f"pooled skill {g1['skill']:+.3f} -> {'PASS' if p1 else 'FAIL'}",
              f"- {tk} G2 news (M1 vs M0): ratio {g2['ratio']:.4f}, tickers {g2['w']}/{g2['l']} (p {g2['p']:.2g}), "
              f"pooled skill {g2['skill']:+.4f} -> {'PASS' if p2 else 'FAIL'}",
              f"- {tk} G3 links (M2 vs M0, {g3['n_t']} tickers with peers): ratio {g3['ratio']:.4f}, tickers {g3['w']}/{g3['l']} "
              f"(p {g3['p']:.2g}), pooled skill {g3['skill']:+.4f} -> {'PASS' if p3 else 'FAIL'}"]
lines += ["", "## All comparisons (paired CRPS ratio, geo mean across tickers; < 1 = first method better)", "",
          "| target | method | vs | ratio | tickers won/lost | sign p | pooled skill | ticker-days | 10-90 cov | y>=q90 |",
          "|---|---|---|---|---|---|---|---|---|---|"]
for tk in TARGETS:
    b = BINDING[tk]
    for m in [*VARIANTS, *[x for x in FC[tk] if x not in VARIANTS]]:
        for vs in ([b, "M0"] if m in VARIANTS and m != "M0" else [b]):
            if m == vs:
                continue
            sel = has_peers if (m in ("M2", "M3") and vs == "M0") else allsel
            c = compare(tk, m, vs, sel)
            point_m = m in ("naive", "ewma_point", "random_walk")
            cov, exc = (float("nan"), float("nan")) if point_m else calib(tk, m)
            lines.append(f"| {tk} | {m} | {vs} | {c['ratio']:.4f} | {c['w']}/{c['l']} | {c['p']:.2g} | {c['skill']:+.4f} | "
                         f"{c['n_pairs']} | {cov:.3f} | {exc:.3f} |")
lines += ["", "## T3 direction (signed return)", "",
          "| method | hit rate of sign(median) | always-up rate, same days (deviation 2) | n | binomial p vs 0.5 | mean daily IC | IC t-stat | days |",
          "|---|---|---|---|---|---|---|---|"]
for m in [*VARIANTS, "hist_sim250"]:
    h, n, p, ic, tstat, nd, up = directional(m)
    lines.append(f"| {m} | {h / n if n else float('nan'):.4f} | {up:.4f} | {n} | {p:.2g} | {ic:+.4f} | {tstat:+.2f} | {nd} |")
lines += ["", "Pre-registered expectation: T1 passes G1, T2 probably, T3 ties (hit rate ~50%, IC ~0). "
          "Nulls are reported with the same prominence as positives."]

out = os.path.join(HERE, "EXP2_RESULTS.md" if args.window == "holdout" else "EXP2_DEV.md")
open(out, "w").write("\n".join(lines) + "\n")
with open(os.path.join(DATA, f"exp2_pairs_{args.window}.csv"), "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["target", "method", "symbol", "date", "y", "q10", "median", "q90"])
    for tk, Y in TARGETS.items():
        for m, q in FC[tk].items():
            for i, s in enumerate(universe):
                for k, t in enumerate(origins):
                    if np.isfinite(Y[i, t]) and np.isfinite(q[i, k]).all():
                        w.writerow([tk, m, s, cal[t], round(float(Y[i, t]), 5), round(float(q[i, k, ia[0.1]]), 5),
                                    round(float(q[i, k, ia[0.5]]), 5), round(float(q[i, k, ia[0.9]]), 5)])
if args.window == "holdout":
    open(done_flag, "w").write(dt.datetime.now().isoformat(timespec="seconds"))
print("\n".join(lines))
