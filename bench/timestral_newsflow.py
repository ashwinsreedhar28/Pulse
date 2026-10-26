"""Experiment 1 backtest: next-day news volume per held ticker (Timestral plan, option 3: GDELT).

Run natively on the Mac (Timestral + cached HF weights):
    python bench/timestral_newsflow.py                         # 28M + 209M, 60 origins, 1024-day context
    python bench/timestral_newsflow.py --models 28M --origins 20   # quick pass
Data: bench/data/gdelt_daily.csv from gdelt_pull.py (UTC days, all languages, 2017-01-01 on).

Design
- Paired one-step-ahead rolling origin over the last --origins calendar days. Every method is scored
  on the same (ticker, day) pairs; a pair is used only if the target, t-7, and >= 14 of the prior 28
  days are present.
- Missing days: dates GDELT did not return, plus partial-outage days whose `norm` (all articles GDELT
  saw that day) is < 50% of its trailing 28-day median. Both are NaN for every ticker.
- Methods: Timestral (day of week as a known-future categorical; NaN context passed through),
  seasonal naive (t-7), 7-day mean, empirical quantiles of the prior 28 days.
- CRPS: 2 * integral of the pinball loss over the 21 Timestral levels (trapezoid, 0.01..0.99). Point
  forecasts are scored by the same formula with all quantiles equal, so every method is on one scale.
- Aggregates: per-ticker CRPS ratio vs seasonal naive (geometric mean, win count, two-sided sign
  test), pooled skill 1 - sum CRPS / sum CRPS_SN, MASE of the median (scale = in-sample mean
  |y_t - y_t-7| over the context before the first origin), 10-90 coverage, q90 exceedance rate.
  Reported for all tickers and split by coverage (mean >= 5 articles/day in the 90 days before the
  first origin).
- Gate (plan): Timestral beats seasonal naive on CRPS.
- Gold check: gold-5 articles (bench/gold.json + articles_300.json) mapped to (ticker, UTC day); for
  those inside the window, how many were flagged y >= q90.
"""
import argparse
import csv
import datetime as dt
import json
import math
import os
import time

import warnings

import numpy as np

warnings.filterwarnings("ignore", category=RuntimeWarning)  # nanmean over all-NaN rows

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--data", default=os.path.join(HERE, "data", "gdelt_daily.csv"))
ap.add_argument("--models", default="28M,209M")
ap.add_argument("--origins", type=int, default=120, help="historical origins, --stride days apart")
ap.add_argument("--stride", type=int, default=5, help="5 is coprime with 7, so origins rotate weekdays")
ap.add_argument("--recent", type=int, default=60, help="plus every day of the last N (gold window)")
ap.add_argument("--context", type=int, default=1024)
ap.add_argument("--threads", type=int, default=8)
ap.add_argument("--covered", type=float, default=5.0, help="articles/day threshold for the covered segment")
ap.add_argument("--out", default=os.path.join(HERE, "NEWSFLOW_RESULTS.md"))
ap.add_argument("--tiny", action="store_true", help="random test-size model, no HF (dry run)")
args = ap.parse_args()

# ---------------- data ----------------
rows = list(csv.DictReader(open(args.data)))
syms = sorted({r["symbol"] for r in rows})
d0 = min(dt.date.fromisoformat(r["date"]) for r in rows)
d1 = max(dt.date.fromisoformat(r["date"]) for r in rows)
dates = [d0 + dt.timedelta(days=i) for i in range((d1 - d0).days + 1)]
di = {d: i for i, d in enumerate(dates)}
si = {s: i for i, s in enumerate(syms)}
Y = np.full((len(syms), len(dates)), np.nan)
norm = np.full(len(dates), np.nan)
for r in rows:
    t = di[dt.date.fromisoformat(r["date"])]
    Y[si[r["symbol"]], t] = float(r["count"])
    if r["norm"] not in ("", "0"):
        norm[t] = float(r["norm"])
partial = np.zeros(len(dates), bool)
for t in range(28, len(dates)):
    med = np.nanmedian(norm[t - 28:t]) if np.isfinite(norm[t - 28:t]).any() else np.nan
    partial[t] = np.isfinite(norm[t]) and np.isfinite(med) and norm[t] < 0.5 * med
Y[:, partial] = np.nan
missing_days = int((~np.isfinite(norm)).sum() + partial.sum())
dow = np.array([d.weekday() for d in dates], dtype=np.float64)
S, T = Y.shape
origins = sorted(set(range(T - args.recent, T)) | set(range(T - 1 - args.stride * (args.origins - 1), T, args.stride)))
origins = [t for t in origins if t >= 28]
first = origins[0]

# ---------------- metrics ----------------
LEVELS = None  # set from the first model; baselines reuse it


def crps(q, y):
    """q (..., Q) quantiles at LEVELS, y (...) -> CRPS via trapezoid over pinball losses."""
    a = np.asarray(LEVELS)
    pin = np.where(y[..., None] < q, (1 - a) * (q - y[..., None]), a * (y[..., None] - q))
    return 2 * np.trapezoid(pin, a, axis=-1) if hasattr(np, "trapezoid") else 2 * np.trapz(pin, a, axis=-1)


def snaive(t):
    """Same weekday last week; over an outage, the nearest finite same weekday within 4 weeks."""
    out = np.full(S, np.nan)
    for lag in (7, 14, 21, 28):
        v = Y[:, t - lag]
        out = np.where(np.isfinite(out), out, v)
    return out


def valid_pair(s, t):
    w = Y[s, t - 28:t]
    return np.isfinite(Y[s, t]) and np.isfinite(w).sum() >= 14


def baselines(t):
    a = np.asarray(LEVELS)
    sn = snaive(t)
    m7 = np.nanmean(np.where(np.isfinite(Y[:, t - 7:t]), Y[:, t - 7:t], np.nan), axis=1)
    emp = np.stack([np.nanquantile(Y[s, t - 28:t], a) if np.isfinite(Y[s, t - 28:t]).sum() >= 14
                    else np.full(len(a), np.nan) for s in range(S)])
    return {"seasonal_naive": np.repeat(sn[:, None], len(a), 1),
            "mean_7d": np.repeat(m7[:, None], len(a), 1),
            "empirical_28d": emp}


# ---------------- models ----------------
import torch
from timestral import TimestralForecaster

torch.set_num_threads(args.threads)


def load(size):
    if not args.tiny:
        return TimestralForecaster.from_pretrained(f"mistralai/Timestral-{size}")
    from timestral import TimestralConfig, TimestralModel
    knots = (0.01, 0.05) + tuple(round(0.1 + 0.05 * i, 2) for i in range(17)) + (0.95, 0.99)
    cfg = TimestralConfig(patch_size=8, d_model=32, num_heads=4, mlp_hidden_dim=64,
                          block_schedule=("time", "time_variate"), quantile_knots=knots,
                          block_size=4, context_length=4096)
    torch.manual_seed(0)
    return TimestralForecaster(TimestralModel(cfg).eval())


forecasts = {}  # method -> (S, len(origins), Q)
timing = {}
for size in args.models.split(","):
    f = load(size)
    if LEVELS is None:
        LEVELS = tuple(float(x) for x in f.quantile_levels)
    name = f"timestral_{size}"
    out = np.full((S, len(origins), len(LEVELS)), np.nan)
    t0 = time.perf_counter()
    for k, t in enumerate(origins):
        lo = max(0, t - args.context)
        ctx = Y[:, None, lo:t]
        cat = np.broadcast_to(dow[lo:t + 1], (S, t + 1 - lo))[:, None, :].copy()
        fc = f.forecast(ctx, prediction_length=1, categorical_known_covariates=cat)
        out[:, k, :] = fc.quantiles.numpy()[:, 0, 0, :]
        if k == 0:
            print(f"{name}: first origin {time.perf_counter() - t0:.1f}s, est. total "
                  f"{(time.perf_counter() - t0) * len(origins) / 60:.1f} min", flush=True)
    timing[name] = time.perf_counter() - t0
    forecasts[name] = out
    print(f"{name}: {timing[name]:.0f}s for {len(origins)} origins x {S} tickers", flush=True)

for k, t in enumerate(origins):
    for m, q in baselines(t).items():
        forecasts.setdefault(m, np.full((S, len(origins), len(LEVELS)), np.nan))[:, k, :] = q

# ---------------- scoring ----------------
mask = np.array([[valid_pair(s, t) for t in origins] for s in range(S)])
for m in forecasts:
    mask &= np.isfinite(forecasts[m]).all(-1)
yv = Y[:, origins]
ia = {round(a, 2): i for i, a in enumerate(LEVELS)}
CR = {m: np.where(mask, crps(np.nan_to_num(q), np.nan_to_num(yv)), np.nan) for m, q in forecasts.items()}
lvl_ctx = Y[:, max(0, first - 365):first]
covered = np.nanmean(lvl_ctx, axis=1) >= args.covered
sc_ctx = Y[:, max(0, first - args.context):first]
scale = np.nanmean(np.abs(sc_ctx[:, 7:] - sc_ctx[:, :-7]), axis=1)


def sign_p(w, l):
    n = w + l
    if n == 0:
        return float("nan")
    k = min(w, l)
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)


def summarize(sel):
    base = CR["seasonal_naive"]
    lines = []
    for m, q in forecasts.items():
        c = CR[m]
        per = np.nanmean(np.where(sel[:, None], c, np.nan), axis=1)
        per_b = np.nanmean(np.where(sel[:, None], base, np.nan), axis=1)
        ok = sel & np.isfinite(per) & np.isfinite(per_b) & (per_b > 0)
        r = per[ok] / per_b[ok]
        gm = float(np.exp(np.mean(np.log(np.clip(r, 1e-6, None))))) if ok.any() else float("nan")
        wins, losses = int((r < 1).sum()), int((r > 1).sum())
        pm = mask & sel[:, None]
        d = (c - base)[pm]
        pw, pl = int((d < 0).sum()), int((d > 0).sum())
        skill = 1 - np.nansum(c[pm]) / np.nansum(base[pm]) if np.nansum(base[pm]) > 0 else float("nan")
        med = q[..., ia[0.5]]
        mase_t = np.nanmean(np.where(pm, np.abs(med - yv), np.nan), axis=1)[ok] / scale[ok]
        mase = float(np.exp(np.nanmean(np.log(np.clip(mase_t[np.isfinite(mase_t) & (mase_t > 0)], 1e-6, None)))))
        point = m in ("seasonal_naive", "mean_7d")
        inside = np.where(point, np.nan, (yv >= q[..., ia[0.1]]) & (yv <= q[..., ia[0.9]]))
        exc = np.where(point, np.nan, yv >= q[..., ia[0.9]])
        lines.append((m, gm, wins, losses, sign_p(wins, losses), skill, pw, pl, sign_p(pw, pl), mase,
                      float(np.mean(inside[pm])) if pm.any() else float("nan"),
                      float(np.mean(exc[pm])) if pm.any() else float("nan")))
    return lines, int(sel.sum()), int((mask & sel[:, None]).sum())


def table(title, sel):
    lines, nt, npairs = summarize(sel)
    out = [f"### {title} ({nt} tickers, {npairs} ticker-days)", "",
           "| method | CRPS ratio vs SN (geo mean) | tickers won/lost | sign p | pooled skill vs SN | "
           "ticker-days won/lost | sign p | MASE (median) | 10-90 coverage | y >= q90 rate |",
           "|---|---|---|---|---|---|---|---|---|---|"]
    for m, gm, w, l, p, sk, pw, pl, pp, mase, cov, exc in lines:
        out.append(f"| {m} | {gm:.3f} | {w}/{l} | {p:.2g} | {sk:+.3f} | {pw}/{pl} | {pp:.2g} | {mase:.3f} | "
                   f"{cov:.3f} | {exc:.3f} |")
    return out


# gold-5 surge recall
gold_lines = []
gp, ap_ = os.path.join(HERE, "gold.json"), os.path.join(HERE, "articles_300.json")
if os.path.exists(gp) and os.path.exists(ap_):
    labels = json.load(open(gp))["labels"]
    arts = json.load(open(ap_))
    arts = arts if isinstance(arts, list) else arts.get("articles", [])
    by_id = {str(a["id"]): a for a in arts}
    pairs = set()
    for aid, lab in labels.items():
        a = by_id.get(str(aid))
        if lab.get("score") == 5 and a and a.get("publishedAt"):
            day = dt.datetime.fromtimestamp(a["publishedAt"] / 1000, dt.timezone.utc).date()
            for s in a.get("tickers", []):
                if s in si and day in di and di[day] in origins:
                    pairs.add((s, day))
    n5 = sum(1 for lab in labels.values() if lab.get("score") == 5)
    gold_lines = [f"Gold-5 articles: {n5}; (ticker, UTC day) pairs inside the window: {len(pairs)}.", ""]
    for m, q in forecasts.items():
        if m in ("seasonal_naive", "mean_7d"):
            continue  # point forecast: q90 == point, so 'y >= q90' fires ~half the time; not a surge flag
        hits = sum(1 for s, day in pairs if mask[si[s], origins.index(di[day])]
                   and Y[si[s], di[day]] >= q[si[s], origins.index(di[day]), ia[0.9]])
        scored = sum(1 for s, day in pairs if mask[si[s], origins.index(di[day])])
        gold_lines.append(f"- {m}: flagged {hits}/{scored} scored gold-5 days (y >= q90)")

# ---------------- report ----------------
tim = [m for m in forecasts if m.startswith("timestral")]
res_all = summarize(np.ones(S, bool))[0]
verdict = []
for m, gm, w, l, p, sk, *_ in res_all:
    if m in tim:
        verdict.append(f"- {m}: CRPS ratio {gm:.3f} vs seasonal naive, pooled skill {sk:+.3f}, "
                       f"tickers {w}/{l} (sign p {p:.2g}) -> {'PASS' if gm < 1 and sk > 0 else 'FAIL'}")
emp = {m: gm for m, gm, *_ in res_all}
for m in tim:  # the binding comparison: Timestral vs empirical 28-day quantiles, paired
    a, b = CR[m], CR["empirical_28d"]
    pa, pb = np.nanmean(a, axis=1), np.nanmean(b, axis=1)
    ok = np.isfinite(pa) & np.isfinite(pb) & (pb > 0)
    r = pa[ok] / pb[ok]
    gm = float(np.exp(np.mean(np.log(np.clip(r, 1e-6, None)))))
    w, l = int((r < 1).sum()), int((r > 1).sum())
    d = (a - b)[mask]
    sk = 1 - np.nansum(a[mask]) / np.nansum(b[mask])
    verdict.append(f"- {m} vs empirical_28d (paired): CRPS ratio {gm:.3f}, tickers {w}/{l} (sign p {sign_p(w, l):.2g}), "
                   f"pooled skill {sk:+.3f}, ticker-days {int((d < 0).sum())}/{int((d > 0).sum())} -> "
                   f"{'PASS' if gm < 1 and sk > 0 else 'FAIL'}")
report = [
    "# Experiment 1: next-day news volume (GDELT)", "",
    f"Generated {dt.datetime.now().isoformat(timespec='minutes')} by bench/timestral_newsflow.py"
    f"{' (TINY DRY RUN, random weights)' if args.tiny else ''}.", "",
    f"Data: {args.data} | {S} tickers | {dates[0]}..{dates[-1]} UTC days | all languages | "
    f"{missing_days} missing/partial-outage days set to NaN.",
    f"Origins: {len(origins)} ({dates[origins[0]]}..{dates[origins[-1]]}: every {args.stride} days plus "
    f"every day of the last {args.recent}), one step ahead, "
    f"context <= {args.context} days, covariate: day of week (known-future categorical). "
    f"No earnings/holiday covariates (no history before 2026 in pulse.db).",
    f"Timing (M1 Pro, {args.threads} threads): " + ", ".join(f"{m} {s:.0f}s" for m, s in timing.items()), "",
    "## Gate: Timestral beats seasonal naive (plan) and empirical 28-day quantiles (binding) on CRPS", "", *verdict,
    f"- empirical_28d vs seasonal naive, for reference: ratio {emp.get('empirical_28d', float('nan')):.3f}.", "",
    *table("All tickers", np.ones(S, bool)), "",
    *table(f"Covered (>= {args.covered:g} articles/day, 365 days before the first origin)", covered), "",
    *table(f"Sparse (< {args.covered:g} articles/day)", ~covered), "",
    "## Surge flag vs gold", "", *gold_lines, "",
    "CRPS ratio < 1 and pooled skill > 0 mean better than seasonal naive. 10-90 coverage should be "
    "near 0.80 and the q90 exceedance rate near 0.10 for calibrated quantiles.",
]
open(args.out, "w").write("\n".join(report) + "\n")
with open(os.path.join(HERE, "data", "newsflow_pairs.csv"), "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["symbol", "date", "method", "y", "q10", "median", "q90", "crps"])
    for s in range(S):
        for k, t in enumerate(origins):
            if not mask[s, k]:
                continue
            for m, q in forecasts.items():
                w.writerow([syms[s], dates[t], m, Y[s, t], round(q[s, k, ia[0.1]], 3),
                            round(q[s, k, ia[0.5]], 3), round(q[s, k, ia[0.9]], 3), round(CR[m][s, k], 4)])
print("\n".join(report))
