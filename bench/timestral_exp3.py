"""Experiment 3: does news CONTENT (tone, earnings, news surprise, Jev headline materiality) improve
next-day log volume, |return| and return forecasts? Implements bench/PREREG_EXP3.md; read it first.
Anything that differs is logged there under "Deviations".

    python bench/timestral_exp3.py --window dev        # pipeline check, every 10th trading day of 2022
    python bench/timestral_exp3.py --window holdout    # the one scored run, every 5th day of 2023-2024
    python bench/timestral_exp3.py --window dev --tiny --max-origins 2   # code check, random weights

The first run builds C4 (news surprise: Experiment 1's model over every UTC day 2019-2024, ~1 h on an
M1 Pro) and caches it in bench/data/exp3_c4_cache.npz; it reads no prices. The holdout refuses to run
twice (bench/data/exp3_holdout.done). Inputs are hash-checked against the values frozen in the plan.
"""
import argparse
import csv
import datetime as dt
import hashlib
import math
import os
import re
import statistics
import sys
import time
import warnings

import numpy as np

warnings.filterwarnings("ignore", category=RuntimeWarning)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
FROZEN = {  # sha256 recorded at freeze (2026-10-21 ~11:55 ET)
    "PREREG_EXP3.md#frozen": "49548560a4eb442dc7a5b183f7c88123019fa17ef81dbe44da72afb21b0f7d31",
    "data/prices_daily.csv": "3b7f9d591313a1e730676c2f345585ded2ca8681b26649df090f86b13914c1ba",
    "data/gkg_daily_v2.csv": "2c8099907db399a8b2123bf223934567afa943cc155d49874644f1c673a9be85",
    "data/gkg_tone_daily.csv": "2029d1c3d7b9b2223b7e14d87f6383a435f6b3d3edcd2d22cbc2017c0aa2caef",
    "data/jev_titles.csv": "cfff89ffde0db449e7663901b4a13eb343851da5829ef061aa7de495c1306eac",
    "data/earnings_calendar.csv": "3d6391c22341954314c919ec637fac487a2369151e0cddb38e669b086754e91e",
}
BENCH = {"SPY", "QQQ", "SMH", "SOXX", "VIX"}
CONTEXT = 1024
MIN_DAYS_BEFORE = 250
ALPHA = 0.05 / 12
JEV_FROM, JEV_TO = "2021-01-01", "2024-12-31"
C4_FROM = dt.date(2019, 1, 1)

ap = argparse.ArgumentParser()
ap.add_argument("--window", choices=["dev", "holdout"], required=True)
ap.add_argument("--threads", type=int, default=8)
ap.add_argument("--tiny", action="store_true")
ap.add_argument("--max-origins", type=int, default=0)
ap.add_argument("--skip-hash", action="store_true", help="code checks on partial copies only; refused for holdout")
args = ap.parse_args()


def sha(path, part=False):
    b = open(path, "rb").read()
    if part:
        b = b[: b.index(b"## Deviations")]
    return hashlib.sha256(b).hexdigest()


if args.window == "holdout" and (args.tiny or args.skip_hash or args.max_origins):
    raise SystemExit("holdout runs with the real model, full origins and hash checks only")
if not args.skip_hash:
    for key, want in FROZEN.items():
        rel, part = (key.split("#")[0], True) if "#" in key else (key, False)
        got = sha(os.path.join(HERE, rel), part)
        if got != want:
            raise SystemExit(f"frozen input changed: {key} sha256 {got} != {want}")
DONE = os.path.join(DATA, "exp3_holdout.done")
if args.window == "holdout" and os.path.exists(DONE):
    raise SystemExit(f"holdout already scored ({open(DONE).read().strip()}); prereg says once")

# ---------------- prices, universe, calendar (as Experiment 2) ----------------
px = {}
for r in csv.DictReader(open(os.path.join(DATA, "prices_daily.csv"))):
    px.setdefault(r["symbol"], {})[r["date"]] = (float(r["close"]), float(r["volume"]) if r["volume"] else np.nan)
cal = sorted(d for d in px["SPY"] if d <= "2026-10-20")
T = len(cal)
ti = {d: i for i, d in enumerate(cal)}
dates = [dt.date.fromisoformat(d) for d in cal]

hold = [i for i, d in enumerate(cal) if "2023-01-03" <= d <= "2024-12-31"][::5]
dev = [i for i, d in enumerate(cal) if "2022-01-01" <= d <= "2022-12-31"][::10]
origins = hold if args.window == "holdout" else dev
if args.max_origins:
    origins = origins[: args.max_origins]
first = origins[0]

held_ref = sorted({r["symbol"] for r in csv.DictReader(open(os.path.join(DATA, "gkg_daily_v2.csv")))})
universe, excluded = [], {}
for s in held_ref:
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


def price_series(sym):
    c = np.full(T, np.nan)
    v = np.full(T, np.nan)
    for d, (cl, vol) in px.get(sym, {}).items():
        if d in ti:
            c[ti[d]], v[ti[d]] = cl, vol
    return c, v


C = np.stack([price_series(s)[0] for s in universe])
V = np.stack([price_series(s)[1] for s in universe])
R = np.full((S, T), np.nan)
R[:, 1:] = 100 * np.log(C[:, 1:] / C[:, :-1])
LNV = np.where(V > 0, np.log(V), np.nan)
ABSR = np.abs(R)
DOW = np.array([d.weekday() for d in dates], dtype=np.float64)
TARGETS = {"T1_lnV": LNV, "T2_absr": ABSR, "T3_r": R}


def window_days(t):
    """UTC days date(t-1) .. date(t)-1 (prereg look-ahead cutoff)."""
    out, d = [], dates[t - 1]
    while d < dates[t]:
        out.append(d.isoformat())
        d += dt.timedelta(days=1)
    return out


WIN = [None] + [window_days(t) for t in range(1, T)]

# ---------------- C1, C2: tone ----------------
tone = {}
for r in csv.DictReader(open(os.path.join(DATA, "gkg_tone_daily.csv"))):
    if r["symbol"] in si and r["tone"]:
        tone[(r["symbol"], r["day"])] = (int(r["n"]), float(r["tone"]), float(r["polarity"] or "nan"))
C1 = np.full((S, T), np.nan)
C2 = np.full((S, T), np.nan)
for s, i in si.items():
    for t in range(1, T):
        rows = [tone[(s, d)] for d in WIN[t] if (s, d) in tone]
        if rows:
            n = sum(x[0] for x in rows)
            C1[i, t] = sum(x[0] * x[1] for x in rows) / n
            C2[i, t] = sum(x[0] * x[2] for x in rows) / n
C1A = np.full((S, T), np.nan)
for t in range(1, T):
    w = C1[:, max(0, t - 60):t]
    ok = np.isfinite(w).sum(axis=1) >= 20
    mu, sd = np.nanmean(w, axis=1), np.nanstd(w, axis=1)
    C1A[:, t] = np.where(ok & (sd > 0), (C1[:, t] - mu) / np.where(sd > 0, sd, 1), np.nan)

# ---------------- C3: earnings window + |EPS surprise| ----------------
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

# ---------------- C5: Jev headline materiality ----------------
sys.path.insert(0, HERE)
from gdelt_pull import Q as NAME_TERMS  # noqa: E402

EXCH = r"(?:NASDAQ|NYSE|NYSEARCA|NYSEAMERICAN|AMEX|OTC|OTCMKTS)"
NAME_RE = {}
for s in universe:
    alts = [r"\b" + re.escape(t) + r"\b" for t in NAME_TERMS.get(s, [])]
    rx = re.compile("|".join(alts), re.I) if alts else None
    sym = re.compile(r"\b" + EXCH + r"\s*:\s*" + re.escape(s) + r"\b|\$" + re.escape(s) + r"\b")
    NAME_RE[s] = (rx, sym)


def names_company(s, title):
    rx, sym = NAME_RE[s]
    return bool((rx and rx.search(title)) or sym.search(title))


jev = {}  # (symbol, utc day) -> list of scores for company-named English headlines
jev_days = set()  # (symbol, day) with any title at all, for the 0-vs-NaN distinction
for r in csv.DictReader(open(os.path.join(DATA, "jev_titles.csv"))):
    s = r["symbol"]
    if s not in si:
        continue
    jev_days.add((s, r["day"]))
    if r["status"] == "ok" and r["score"] and names_company(s, r["title"]):
        jev.setdefault((s, r["day"]), []).append(int(r["score"]))
C5N = np.full((S, T), np.nan)
C5M = np.full((S, T), np.nan)
C5A = np.full((S, T), np.nan)
for s, i in si.items():
    for t in range(1, T):
        days = WIN[t]
        if not days or days[0] < JEV_FROM or days[-1] > JEV_TO:
            continue
        sc = [x for d in days for x in jev.get((s, d), [])]
        C5N[i, t] = sum(1 for x in sc if x >= 4)
        if sc:
            C5M[i, t] = max(sc)
            C5A[i, t] = sum(sc) / len(sc)

# ---------------- model ----------------
import torch  # noqa: E402
from timestral import TimestralForecaster  # noqa: E402

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


def cdf_at(q, y):
    """Forecast CDF at y from quantiles q at LEVELS (as newsVolumeMath.cdfAt)."""
    if not np.isfinite(y) or not np.isfinite(q).all():
        return np.nan
    if y < q[0]:
        return LEVELS[0]
    if y > q[-1]:
        return LEVELS[-1]
    tied = np.where(q == y)[0]
    if len(tied):
        return (LEVELS[tied[0]] + LEVELS[tied[-1]]) / 2
    j = int(np.searchsorted(q, y))
    return LEVELS[j - 1] + (y - q[j - 1]) / (q[j] - q[j - 1]) * (LEVELS[j] - LEVELS[j - 1])


# ---------------- C4: news surprise under Experiment 1's model ----------------
def build_c4():
    gk, norm = {}, {}
    for r in csv.DictReader(open(os.path.join(DATA, "gkg_daily_v2.csv"))):
        gk[(r["symbol"], r["date"])] = float(r["count"])
        if r["norm"] not in ("", "0"):
            norm[r["date"]] = float(r["norm"])
    d0 = min(dt.date.fromisoformat(d) for _, d in gk)
    d1 = dt.date(2024, 12, 31)
    udays = [d0 + dt.timedelta(days=k) for k in range((d1 - d0).days + 1)]
    ui = {d.isoformat(): k for k, d in enumerate(udays)}
    U = len(udays)
    Y = np.full((S, U), np.nan)
    for (s, d), c in gk.items():
        if s in si and d in ui:
            Y[si[s], ui[d]] = c
    nrm = np.array([norm.get(d.isoformat(), np.nan) for d in udays])
    for k in range(28, U):  # Experiment 1's missing-day rule: absent or partial-outage days are NaN
        w = nrm[k - 28:k]
        med = np.nanmedian(w) if np.isfinite(w).any() else np.nan
        if not np.isfinite(nrm[k]) or (np.isfinite(med) and nrm[k] < 0.5 * med):
            Y[:, k] = np.nan
    udow = np.array([d.weekday() for d in udays], dtype=np.float64)
    targets = [k for k, d in enumerate(udays) if d >= C4_FROM]
    QS = np.full((S, len(targets), Q), np.nan)
    t0 = time.perf_counter()
    for n, k in enumerate(targets):
        lo = max(0, k - CONTEXT)
        cat = np.broadcast_to(udow[lo:k + 1], (S, k + 1 - lo))[:, None, :].copy()
        QS[:, n] = F.forecast(Y[:, None, lo:k], prediction_length=1,
                              categorical_known_covariates=cat).quantiles.numpy()[:, 0, 0, :]
        if n in (0, 100) or n % 500 == 0:
            el = time.perf_counter() - t0
            print(f"  C4 {n + 1}/{len(targets)} UTC days, est. {el / (n + 1) * len(targets) / 60:.0f} min total", flush=True)
    return np.array([udays[k].isoformat() for k in targets]), QS, Y[:, targets]


CACHE = os.path.join(DATA, "exp3_c4_cache.npz" if not args.tiny else "exp3_c4_cache_TINY.npz")
if os.path.exists(CACHE):
    z = np.load(CACHE, allow_pickle=False)
    c4_days, c4_q, c4_y = z["days"], z["q"], z["y"]
else:
    print("building C4 (news surprise) cache: Experiment 1's model over every UTC day from 2019 ...", flush=True)
    c4_days, c4_q, c4_y = build_c4()
    np.savez(CACHE, days=c4_days, q=c4_q, y=c4_y)
c4_idx = {str(d): k for k, d in enumerate(c4_days)}
C4 = np.full((S, T), np.nan)
for t in range(1, T):
    ks = [c4_idx[d] for d in WIN[t] if d in c4_idx]
    if not ks:
        continue
    for i in range(S):
        good = [k for k in ks if np.isfinite(c4_y[i, k]) and np.isfinite(c4_q[i, k]).all()]
        if good:  # multi-day windows: sum of per-day quantiles (approximation stated in the prereg)
            C4[i, t] = cdf_at(np.sort(c4_q[i, good].sum(axis=0)), float(c4_y[i, good].sum()))

ARMS = {
    "M0": [],
    "MT": [C1, C1A, C2],
    "ME": [C3A, C3B],
    "MS": [C4],
    "MJ": [C5N, C5M, C5A],
}
ARMS["MC"] = ARMS["MT"] + ARMS["ME"] + ARMS["MS"] + ARMS["MJ"]


def timestral(Y, t, arm):
    lo = max(0, t - CONTEXT)
    kw = {"categorical_known_covariates": np.broadcast_to(DOW[lo:t + 1], (S, t + 1 - lo))[:, None, :].copy()}
    if ARMS[arm]:
        kw["known_covariates"] = np.stack([X[:, lo:t + 1] for X in ARMS[arm]], axis=1)
    return F.forecast(Y[:, None, lo:t], prediction_length=1, **kw).quantiles.numpy()[:, 0, 0, :]


def empirical(Y, t, n, min_n):
    w = Y[:, max(0, t - n):t]
    return np.stack([np.nanquantile(w[i], LEVELS) if np.isfinite(w[i]).sum() >= min_n else np.full(Q, np.nan)
                     for i in range(S)])


SIG2 = np.full((S, T), np.nan)  # EWMA(0.94), seeded with each ticker's first 60 finite returns (as Exp 2)
for i in range(S):
    fin = np.where(np.isfinite(R[i]))[0]
    if len(fin) < 61:
        continue
    SIG2[i, fin[59] + 1] = np.var(R[i, fin[:60]])
    for t in range(fin[59] + 2, T):
        x = R[i, t - 1]
        SIG2[i, t] = 0.94 * SIG2[i, t - 1] + 0.06 * x * x if np.isfinite(x) else SIG2[i, t - 1]


def baseline(tk, t):
    if tk == "T1_lnV":
        return "empirical60*", empirical(LNV, t, 60, 30)
    if tk == "T2_absr":
        return "empirical60*", empirical(ABSR, t, 60, 30)
    return "ewma_gauss*", np.sqrt(SIG2[:, t])[:, None] * Z[None, :]


K = len(origins)
FC = {tk: {} for tk in TARGETS}
t_start = time.perf_counter()
for tk, Y in TARGETS.items():
    for m in ARMS:
        FC[tk][m] = np.full((S, K, Q), np.nan)
    for k, t in enumerate(origins):
        for m in ARMS:
            FC[tk][m][:, k] = timestral(Y, t, m)
        b, q = baseline(tk, t)
        FC[tk].setdefault(b, np.full((S, K, Q), np.nan))[:, k] = q
        if k == 0 and tk == "T1_lnV":
            per = time.perf_counter() - t_start
            print(f"first origin {per:.1f}s for {len(ARMS)} arms; est. total {per * K * 3 / 60:.0f} min", flush=True)
    print(f"{tk}: done, {time.perf_counter() - t_start:.0f}s elapsed", flush=True)


# ---------------- scoring (as Experiment 2) ----------------
def crps(q, y):
    pin = np.where(y[..., None] < q, (1 - LEVELS) * (q - y[..., None]), LEVELS * (y[..., None] - q))
    return 2 * np.trapezoid(pin, LEVELS, axis=-1) if hasattr(np, "trapezoid") else 2 * np.trapz(pin, LEVELS, axis=-1)


def sign_p(w, l):
    n = w + l
    if n == 0:
        return float("nan")
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(min(w, l) + 1)) / 2 ** n)


def compare(tk, a, b):
    y = TARGETS[tk][:, origins]
    qa, qb = FC[tk][a], FC[tk][b]
    ok = np.isfinite(y) & np.isfinite(qa).all(-1) & np.isfinite(qb).all(-1)
    ca = np.where(ok, crps(np.nan_to_num(qa), np.nan_to_num(y)), np.nan)
    cb = np.where(ok, crps(np.nan_to_num(qb), np.nan_to_num(y)), np.nan)
    pa, pb = np.nanmean(ca, axis=1), np.nanmean(cb, axis=1)
    use = np.isfinite(pa) & np.isfinite(pb) & (pb > 0)
    r = pa[use] / pb[use]
    gm = float(np.exp(np.mean(np.log(np.clip(r, 1e-9, None))))) if use.any() else float("nan")
    w, l = int((r < 1).sum()), int((r > 1).sum())
    skill = 1 - np.nansum(ca) / np.nansum(cb) if np.nansum(cb) > 0 else float("nan")
    return {"ratio": gm, "w": w, "l": l, "p": sign_p(w, l), "skill": skill, "n_pairs": int(ok.sum())}


def calib(tk, m):
    y = TARGETS[tk][:, origins]
    q = FC[tk][m]
    ok = np.isfinite(y) & np.isfinite(q).all(-1)
    if not ok.any():
        return float("nan"), float("nan")
    return (float(((y >= q[..., ia[0.1]]) & (y <= q[..., ia[0.9]]))[ok].mean()),
            float((y >= q[..., ia[0.9]])[ok].mean()))


def directional(m):
    y = R[:, origins]
    med = FC["T3_r"][m][..., ia[0.5]]
    ok = np.isfinite(y) & np.isfinite(med) & (med != 0) & (y != 0)
    n = int(ok.sum())
    hits = int((np.sign(med) == np.sign(y))[ok].sum())
    up = float((y[ok] > 0).mean()) if n else float("nan")
    ics = []
    for k in range(len(origins)):
        g = np.isfinite(y[:, k]) & np.isfinite(med[:, k])
        if g.sum() >= 10:
            ics.append(np.corrcoef(np.argsort(np.argsort(med[g, k])), np.argsort(np.argsort(y[g, k])))[0, 1])
    ics = np.array([x for x in ics if np.isfinite(x)])
    tstat = float(ics.mean() / ics.std(ddof=1) * math.sqrt(len(ics))) if len(ics) > 2 else float("nan")
    return hits, n, sign_p(hits, n - hits), up, float(ics.mean()) if len(ics) else float("nan"), tstat, len(ics)


def coverage(X):
    v = X[:, origins]
    return f"{np.isfinite(v).mean():.0%}"


lines = [f"# Experiment 3 results ({args.window}{', TINY DRY RUN, random weights' if args.tiny else ''})", "",
         f"Generated {dt.datetime.now().isoformat(timespec='minutes')} by bench/timestral_exp3.py, implementing "
         f"bench/PREREG_EXP3.md (frozen sha256 {FROZEN['PREREG_EXP3.md#frozen'][:12]}...). "
         + ("Inputs hash-checked." if not args.skip_hash else "HASH CHECKS SKIPPED (code check)."), "",
         f"Universe: {S} tickers. Excluded: " + ", ".join(f"{k} ({v})" for k, v in sorted(excluded.items())) + ".",
         f"Origins: {K} ({cal[origins[0]]}..{cal[origins[-1]]}). Run time {time.perf_counter() - t_start:.0f}s.",
         "Covariate availability at the origins: " + ", ".join(
             f"{n} {coverage(X)}" for n, X in [("tone", C1), ("abn tone", C1A), ("polarity", C2),
                                                 ("news surprise", C4), ("Jev n>=4", C5N), ("Jev max", C5M)]),
         f"Earnings-window days among scored ticker-days: {C3A[:, origins].mean():.1%}.", "",
         "## Gates (arm vs M0, paired; pass = ratio < 1 and sign p < 0.0042)", ""]
for tk in TARGETS:
    for m in ["MT", "ME", "MS", "MJ"]:
        c = compare(tk, m, "M0")
        ok = c["ratio"] < 1 and c["p"] < ALPHA
        lines.append(f"- {tk} {m}: ratio {c['ratio']:.4f}, tickers {c['w']}/{c['l']} (p {c['p']:.2g}), "
                     f"pooled skill {c['skill']:+.4f} -> {'PASS' if ok else 'FAIL'}")
lines += ["", "## All comparisons", "",
          "| target | method | vs | ratio | tickers won/lost | sign p | pooled skill | ticker-days | 10-90 cov | y>=q90 |",
          "|---|---|---|---|---|---|---|---|---|---|"]
for tk in TARGETS:
    b = [x for x in FC[tk] if x not in ARMS][0]
    for m in ARMS:
        for vs in ([b] if m == "M0" else ["M0", b]):
            c = compare(tk, m, vs)
            cov, exc = calib(tk, m)
            lines.append(f"| {tk} | {m} | {vs} | {c['ratio']:.4f} | {c['w']}/{c['l']} | {c['p']:.2g} | "
                         f"{c['skill']:+.4f} | {c['n_pairs']} | {cov:.3f} | {exc:.3f} |")
lines += ["", "## T3 direction (signed return)", "",
          "| method | hit rate of sign(median) | always-up rate, same days | n | binomial p vs 0.5 | mean daily IC | IC t-stat | days |",
          "|---|---|---|---|---|---|---|---|"]
for m in ARMS:
    h, n, p, up, ic, tstat, nd = directional(m)
    lines.append(f"| {m} | {h / n if n else float('nan'):.4f} | {up:.4f} | {n} | {p:.2g} | {ic:+.4f} | {tstat:+.2f} | {nd} |")
lines += ["", "Pre-registered expectation: ME helps T1 and T2 clearly; MS helps T1; MT and MJ help T1/T2 a little "
          "if at all; T3 ties for every arm. Nulls are reported with the same prominence as positives."]

out = os.path.join(HERE, "EXP3_RESULTS.md" if args.window == "holdout" else "EXP3_DEV.md")
open(out, "w").write("\n".join(lines) + "\n")
with open(os.path.join(DATA, f"exp3_pairs_{args.window}.csv"), "w", newline="") as fh:
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
    open(DONE, "w").write(dt.datetime.now().isoformat(timespec="seconds"))
print("\n".join(lines))
