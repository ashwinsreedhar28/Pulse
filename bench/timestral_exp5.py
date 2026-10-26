"""Experiment 5: Timestral on PRICE LEVELS (100 * ln close), horizons 1-5, vs an EWMA random walk.
Implements bench/PREREG_EXP5.md; read it first. Differences are logged there under "Deviations".

    python bench/timestral_exp5.py --window dev
    python bench/timestral_exp5.py --window holdout            # once (bench/data/exp5_holdout.done)
    python bench/timestral_exp5.py --window dev --tiny --max-origins 3 --skip-hash
    python bench/timestral_exp5.py --window dev --device cuda
"""
import argparse
import csv
import datetime as dt
import hashlib
import math
import os
import statistics
import time
import warnings

import numpy as np

warnings.filterwarnings("ignore", category=RuntimeWarning)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
FROZEN = {
    "PREREG_EXP5.md#frozen": "624f321332e2a1b3001e263694d19503b2d7308dc450c360650467519cced98a",
    "data/prices_daily.csv": "3b7f9d591313a1e730676c2f345585ded2ca8681b26649df090f86b13914c1ba",
    "data/earnings_calendar.csv": "3d6391c22341954314c919ec637fac487a2369151e0cddb38e669b086754e91e",
    "data/gkg_daily_v2.csv": "2c8099907db399a8b2123bf223934567afa943cc155d49874644f1c673a9be85",
}
BENCH = {"SPY", "QQQ", "SMH", "SOXX", "VIX"}
MIN_DAYS_BEFORE = 250
HOLD_FROM, HOLD_TO = "2025-01-02", "2026-04-21"
DEV_FROM, DEV_TO = "2023-01-03", "2024-12-31"
HZ = 5
CONTEXT = 1024
ALPHA = 0.05 / 15

ap = argparse.ArgumentParser()
ap.add_argument("--window", choices=["dev", "holdout"], required=True)
ap.add_argument("--threads", type=int, default=8)
ap.add_argument("--device", default="cpu")
ap.add_argument("--tiny", action="store_true")
ap.add_argument("--max-origins", type=int, default=0)
ap.add_argument("--skip-hash", action="store_true")
args = ap.parse_args()


def sha(path, part=False):
    b = open(path, "rb").read()
    if part:
        b = b[: b.index(b"## Deviations")]
    return hashlib.sha256(b).hexdigest()


if args.window == "holdout" and (args.tiny or args.skip_hash or args.max_origins):
    raise SystemExit("holdout runs with the real models, full origins and hash checks only")
if not args.skip_hash:
    for key, want in FROZEN.items():
        rel, part = (key.split("#")[0], True) if "#" in key else (key, False)
        got = sha(os.path.join(HERE, rel), part)
        if got != want:
            raise SystemExit(f"frozen input changed: {key} sha256 {got} != {want}")
DONE = os.path.join(DATA, "exp5_holdout.done")
if args.window == "holdout" and os.path.exists(DONE):
    raise SystemExit(f"holdout already scored ({open(DONE).read().strip()}); prereg says once")

px = {}
for r in csv.DictReader(open(os.path.join(DATA, "prices_daily.csv"))):
    px.setdefault(r["symbol"], {})[r["date"]] = float(r["close"])
cal = sorted(d for d in px["SPY"] if d <= "2026-10-20")
T = len(cal)
ti = {d: i for i, d in enumerate(cal)}
dates = [dt.date.fromisoformat(d) for d in cal]

hold = [i for i, d in enumerate(cal) if HOLD_FROM <= d <= HOLD_TO][::5]
dev = [i for i, d in enumerate(cal) if DEV_FROM <= d <= DEV_TO][::5]
origins = [t for t in (hold if args.window == "holdout" else dev) if t + HZ - 1 < T]
if args.max_origins:
    origins = origins[: args.max_origins]

held_ref = sorted({r["symbol"] for r in csv.DictReader(open(os.path.join(DATA, "gkg_daily_v2.csv")))})
universe, excluded = [], {}
for s in held_ref:
    if s in BENCH:
        continue
    if s not in px:
        excluded[s] = "no Nasdaq history"
        continue
    n_before = sum(1 for d in px[s] if d < cal[hold[0]])
    if n_before >= MIN_DAYS_BEFORE:
        universe.append(s)
    else:
        excluded[s] = f"{n_before} trading days before the holdout"
S = len(universe)
si = {s: i for i, s in enumerate(universe)}

C = np.full((S, T), np.nan)
for s, i in si.items():
    for d, c in px[s].items():
        if d in ti:
            C[i, ti[d]] = c
LC = 100 * np.log(C)
R = np.full((S, T), np.nan)
R[:, 1:] = LC[:, 1:] - LC[:, :-1]
DOW = np.array([d.weekday() for d in dates], dtype=np.float64)

C3A = np.zeros((S, T))
C3B = np.zeros((S, T))
for r in csv.DictReader(open(os.path.join(DATA, "earnings_calendar.csv"))):
    s = r["symbol"]
    if s not in si:
        continue
    k = next((j for j in range(T) if cal[j] >= r["date"]), None) if r["date"] > cal[0] else None
    if k is None:
        continue
    C3A[si[s], k] = 1
    if k + 1 < T:
        C3A[si[s], k + 1] = 1
        if r["surprise_pct"] not in ("", None):
            C3B[si[s], k + 1] = abs(float(r["surprise_pct"]))

SIG2 = np.full((S, T), np.nan)
for i in range(S):
    fin = np.where(np.isfinite(R[i]))[0]
    if len(fin) < 61:
        continue
    SIG2[i, fin[59] + 1] = np.var(R[i, fin[:60]])
    for t in range(fin[59] + 2, T):
        x = R[i, t - 1]
        SIG2[i, t] = 0.94 * SIG2[i, t - 1] + 0.06 * x * x if np.isfinite(x) else SIG2[i, t - 1]

import torch  # noqa: E402
from timestral import TimestralForecaster  # noqa: E402

torch.set_num_threads(args.threads)
if args.tiny:
    from timestral import TimestralConfig, TimestralModel
    knots = (0.01, 0.05) + tuple(round(0.1 + 0.05 * i, 2) for i in range(17)) + (0.95, 0.99)
    torch.manual_seed(0)
    F28 = TimestralForecaster(TimestralModel(TimestralConfig(
        patch_size=8, d_model=32, num_heads=4, mlp_hidden_dim=64, block_schedule=("time", "time_variate"),
        quantile_knots=knots, block_size=4, context_length=4096)).eval())
    F209 = F28
else:
    F28 = TimestralForecaster.from_pretrained("mistralai/Timestral-28M", device=args.device)
    F209 = TimestralForecaster.from_pretrained("mistralai/Timestral-209M", device=args.device)
LEVELS = np.array([float(x) for x in F28.quantile_levels])
Q = len(LEVELS)
ia = {round(float(a), 2): i for i, a in enumerate(LEVELS)}
Z = np.array([statistics.NormalDist().inv_cdf(a) for a in LEVELS])
NOTES = []

ARMS = {"L28": ("log", F28), "R28": ("raw", F28), "L209": ("log", F209)}


def run(arm, t):
    kind, F = ARMS[arm]
    lo = max(0, t - CONTEXT)
    hi = t + HZ  # known covariates through t+HZ-1
    kw = {"categorical_known_covariates": np.broadcast_to(DOW[lo:hi], (S, hi - lo))[:, None, :].copy(),
          "known_covariates": np.stack([X[:, lo:hi] for X in (C3A, C3B)], axis=1)}
    Y = LC if kind == "log" else C
    try:
        q = F.forecast(Y[:, None, lo:t], prediction_length=HZ, **kw).quantiles.cpu().numpy()[:, 0, :, :]
    except ValueError as e:
        if "covariates" not in str(e) or F is F28:
            raise
        note = f"{arm} ran WITHOUT covariates: {e}"
        if note not in NOTES:
            NOTES.append(note)
        q = F.forecast(Y[:, None, lo:t], prediction_length=HZ).quantiles.cpu().numpy()[:, 0, :, :]
    if kind == "raw":
        q = 100 * np.log(np.clip(q, 1e-6, None))
    return q  # (S, HZ, Q)


def rw(t):
    base = LC[:, t - 1][:, None, None]
    sd = np.sqrt(SIG2[:, t])[:, None, None] * np.sqrt(np.arange(1, HZ + 1))[None, :, None]
    return base + sd * Z[None, None, :]


K = len(origins)
FC = {m: np.full((S, K, HZ, Q), np.nan) for m in list(ARMS) + ["rw*"]}
t_start = time.perf_counter()
for k, t in enumerate(origins):
    for m in ARMS:
        FC[m][:, k] = run(m, t)
    FC["rw*"][:, k] = rw(t)
    if k == 0:
        per = time.perf_counter() - t_start
        print(f"first origin {per:.1f}s; est. total {per * K / 60:.0f} min", flush=True)
    elif k % 10 == 0:
        print(f"  origin {k + 1}/{K}, {time.perf_counter() - t_start:.0f}s elapsed", flush=True)
YH = np.stack([LC[:, [t + h for t in origins]] for h in range(HZ)], axis=2)  # (S, K, HZ)
BASE = LC[:, [t - 1 for t in origins]]  # (S, K)


def crps(q, y):
    pin = np.where(y[..., None] < q, (1 - LEVELS) * (q - y[..., None]), LEVELS * (y[..., None] - q))
    return 2 * np.trapezoid(pin, LEVELS, axis=-1)


def sign_p(w, l):
    n = w + l
    if n == 0:
        return float("nan")
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(min(w, l) + 1)) / 2 ** n)


def compare(a, b, h):
    y = YH[:, :, h]
    qa, qb = FC[a][:, :, h], FC[b][:, :, h]
    ok = np.isfinite(y) & np.isfinite(qa).all(-1) & np.isfinite(qb).all(-1)
    ca = np.where(ok, crps(np.nan_to_num(qa), np.nan_to_num(y)), np.nan)
    cb = np.where(ok, crps(np.nan_to_num(qb), np.nan_to_num(y)), np.nan)
    pa, pb = np.nanmean(ca, axis=1), np.nanmean(cb, axis=1)
    use = np.isfinite(pa) & np.isfinite(pb) & (pb > 0)
    r = pa[use] / pb[use]
    gm = float(np.exp(np.mean(np.log(np.clip(r, 1e-9, None))))) if use.any() else float("nan")
    w, l = int((r < 1).sum()), int((r > 1).sum())
    return {"ratio": gm, "w": w, "l": l, "p": sign_p(w, l), "skill": 1 - np.nansum(ca) / np.nansum(cb), "n": int(ok.sum())}


def calib(m, h):
    y = YH[:, :, h]
    q = FC[m][:, :, h]
    ok = np.isfinite(y) & np.isfinite(q).all(-1)
    return (float(((y >= q[..., ia[0.1]]) & (y <= q[..., ia[0.9]]))[ok].mean()), float((y >= q[..., ia[0.9]])[ok].mean()))


def direction(m, h):
    y = YH[:, :, h] - BASE
    d = FC[m][:, :, h, ia[0.5]] - BASE
    ok = np.isfinite(y) & np.isfinite(d) & (d != 0) & (y != 0)
    n = int(ok.sum())
    hits = int((np.sign(d) == np.sign(y))[ok].sum())
    up = float((y[ok] > 0).mean()) if n else float("nan")
    # binomial p of hits against the always-up rate (two-sided, normal approx.)
    p_up = float(math.erfc(abs(hits - n * up) / math.sqrt(2 * n * up * (1 - up)))) if n and 0 < up < 1 else float("nan")
    ics = []
    for k in range(K):
        g = ok[:, k]
        if g.sum() >= 10:
            ics.append(np.corrcoef(np.argsort(np.argsort(d[g, k])), np.argsort(np.argsort(y[g, k])))[0, 1])
    ics = np.array([x for x in ics if np.isfinite(x)])
    tstat = float(ics.mean() / ics.std(ddof=1) * math.sqrt(len(ics))) if len(ics) > 2 else float("nan")
    return hits / n if n else float("nan"), up, n, p_up, float(ics.mean()) if len(ics) else float("nan"), tstat


lines = [f"# Experiment 5 results ({args.window}{', TINY DRY RUN, random weights' if args.tiny else ''})", "",
         f"Generated {dt.datetime.now().isoformat(timespec='minutes')} by bench/timestral_exp5.py, implementing "
         f"bench/PREREG_EXP5.md (frozen sha256 {FROZEN['PREREG_EXP5.md#frozen'][:12]}...). "
         + ("Inputs hash-checked." if not args.skip_hash else "HASH CHECKS SKIPPED (code check)."), "",
         f"Universe: {S} tickers. Excluded: " + ", ".join(f"{k} ({v})" for k, v in sorted(excluded.items())) + ".",
         f"Origins: {K} ({cal[origins[0]]}..{cal[origins[-1]]}). Device {args.device}. Run time {time.perf_counter() - t_start:.0f}s.", ""]
if NOTES:
    lines += ["## Notes", ""] + [f"- {n}" for n in NOTES] + [""]
lines += [f"## Gates (arm vs random walk, paired, per horizon; pass = ratio < 1 and sign p < {ALPHA:.4f})", ""]
for m in ARMS:
    for h in range(HZ):
        c = compare(m, "rw*", h)
        ok = c["ratio"] < 1 and c["p"] < ALPHA
        lines.append(f"- {m} h={h + 1}: ratio {c['ratio']:.4f}, tickers {c['w']}/{c['l']} (p {c['p']:.2g}), "
                     f"pooled skill {c['skill']:+.4f}, pairs {c['n']} -> {'PASS' if ok else 'FAIL'}")
lines += ["", "## Calibration (10-90 coverage / y>=q90)", "", "| method | " + " | ".join(f"h={h + 1}" for h in range(HZ)) + " |",
          "|---|" + "---|" * HZ]
for m in list(ARMS) + ["rw*"]:
    lines.append(f"| {m} | " + " | ".join("%.3f / %.3f" % calib(m, h) for h in range(HZ)) + " |")
lines += ["", "## Direction (reported, not gated; evidence only if p vs always-up < alpha)", "",
          "| method | h | hit rate | always-up | n | p vs always-up | mean daily IC | IC t |", "|---|---|---|---|---|---|---|---|"]
for m in ARMS:
    for h in range(HZ):
        hr, up, n, p, ic, ts = direction(m, h)
        lines.append(f"| {m} | {h + 1} | {hr:.4f} | {up:.4f} | {n} | {p:.2g} | {ic:+.4f} | {ts:+.2f} |")
lines += ["", "Pre-registered expectation: ties at every horizon. Nulls are reported with the same prominence as positives."]

out = os.path.join(HERE, "EXP5_RESULTS.md" if args.window == "holdout" else "EXP5_DEV.md")
open(out, "w").write("\n".join(lines) + "\n")
with open(os.path.join(DATA, f"exp5_pairs_{args.window}.csv"), "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["method", "symbol", "origin", "h", "y"] + [f"q{int(round(a * 100)):02d}" for a in LEVELS])
    for m, q in FC.items():
        for i, s in enumerate(universe):
            for k, t in enumerate(origins):
                for h in range(HZ):
                    if np.isfinite(YH[i, k, h]) and np.isfinite(q[i, k, h]).all():
                        w.writerow([m, s, cal[t], h + 1, round(float(YH[i, k, h]), 4)] + [round(float(x), 4) for x in q[i, k, h]])
if args.window == "holdout":
    open(DONE, "w").write(dt.datetime.now().isoformat(timespec="seconds"))
print("\n".join(lines))
