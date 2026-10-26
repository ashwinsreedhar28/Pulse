"""Experiment 4: model-side changes to Timestral (recalibration, context, target transform, multivariate,
ensembling, blending) and calendar covariates, for next-day log volume (T1) and |return| (T2).
Implements bench/PREREG_EXP4.md; read it first. Differences are logged there under "Deviations".

    python bench/timestral_exp4.py --window dev                       # 2023-2024 every 5th day; picks BL's w
    python bench/timestral_exp4.py --window holdout                   # the one scored run, 2025-01-02..2026-04-21
    python bench/timestral_exp4.py --window dev --tiny --max-origins 3 --skip-hash   # code check
    python bench/timestral_exp4.py --window dev --device cuda         # on a pod

Dev writes bench/data/exp4_bl_w.txt (the one tuned parameter); the holdout reads it and refuses to run
twice (bench/data/exp4_holdout.done). Pairs CSVs carry all 21 quantiles so post-processing can be
scored offline later.
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
FROZEN = {  # sha256 recorded at freeze (2026-10-21 ~16:30 ET)
    "PREREG_EXP4.md#frozen": "9e42f46edafeb60145ae175f8e8fecc8fbf88dabe0335504c10b25d0119564c9",
    "data/prices_daily.csv": "3b7f9d591313a1e730676c2f345585ded2ca8681b26649df090f86b13914c1ba",
    "data/earnings_calendar.csv": "3d6391c22341954314c919ec637fac487a2369151e0cddb38e669b086754e91e",
    "data/links_frozen.csv": "f94f97b7e039e3b6fc0aecfa2b500e6aeb79effdd0990f83311422c13134551c",
    "data/gkg_daily_v2.csv": "2c8099907db399a8b2123bf223934567afa943cc155d49874644f1c673a9be85",
    "data/macro_days.csv": "6cb80c84ec3c1c947e1ac80e0ea8165fe5a294653295643ed0533bb89b7ab1bb",
}
BENCH = {"SPY", "QQQ", "SMH", "SOXX", "VIX"}
MIN_DAYS_BEFORE = 250
HOLD_FROM, HOLD_TO = "2025-01-02", "2026-04-21"
DEV_FROM, DEV_TO = "2023-01-03", "2024-12-31"
N_GATES = 22
ALPHA = 0.05 / N_GATES
RC_GRID = np.round(np.arange(0.70, 2.0001, 0.05), 2)
RC_LOOKBACK = 24
BL_GRID = [0.25, 0.5, 0.75]
LG_EPS = 0.05

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
DONE = os.path.join(DATA, "exp4_holdout.done")
BLW = os.path.join(DATA, "exp4_bl_w.txt")
if args.window == "holdout":
    if os.path.exists(DONE):
        raise SystemExit(f"holdout already scored ({open(DONE).read().strip()}); prereg says once")
    if not os.path.exists(BLW):
        raise SystemExit("run --window dev first: it fixes BL's weight in data/exp4_bl_w.txt")

# ---------------- prices, universe, calendar ----------------
px = {}
for r in csv.DictReader(open(os.path.join(DATA, "prices_daily.csv"))):
    px.setdefault(r["symbol"], {})[r["date"]] = (
        float(r["close"]), float(r["volume"]) if r["volume"] else np.nan,
        float(r["high"]) if r["high"] else np.nan, float(r["low"]) if r["low"] else np.nan)
cal = sorted(d for d in px["SPY"] if d <= "2026-10-20")
T = len(cal)
ti = {d: i for i, d in enumerate(cal)}
dates = [dt.date.fromisoformat(d) for d in cal]
calset = set(dates)

hold = [i for i, d in enumerate(cal) if HOLD_FROM <= d <= HOLD_TO][::5]
dev = [i for i, d in enumerate(cal) if DEV_FROM <= d <= DEV_TO][::5]
origins = hold if args.window == "holdout" else dev
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


def series(sym):
    c, v, h, l = (np.full(T, np.nan) for _ in range(4))
    for d, (cl, vol, hi, lo) in px.get(sym, {}).items():
        if d in ti:
            c[ti[d]], v[ti[d]], h[ti[d]], l[ti[d]] = cl, vol, hi, lo
    return c, v, h, l


C, V, H, L = (np.stack(x) for x in zip(*(series(s) for s in universe)))
R = np.full((S, T), np.nan)
R[:, 1:] = 100 * np.log(C[:, 1:] / C[:, :-1])
LNV = np.where(V > 0, np.log(V), np.nan)
ABSR = np.abs(R)
PR = np.where((H > 0) & (L > 0) & (H >= L), np.log(H / L), np.nan)  # Parkinson range
DOW = np.array([d.weekday() for d in dates], dtype=np.float64)
TARGETS = {"T1_lnV": LNV, "T2_absr": ABSR}

# ---------------- earnings (own and linked) ----------------
earn_flag = {}  # symbol -> (T,) 2-day window flag, every symbol in the calendar
C3A = np.zeros((S, T))
C3B = np.zeros((S, T))
for r in csv.DictReader(open(os.path.join(DATA, "earnings_calendar.csv"))):
    s = r["symbol"]
    k = next((j for j in range(T) if cal[j] >= r["date"]), None) if r["date"] > cal[0] else None
    if k is None:
        continue
    f = earn_flag.setdefault(s, np.zeros(T))
    f[k] = 1
    if k + 1 < T:
        f[k + 1] = 1
    if s in si:
        C3A[si[s], k] = 1
        if k + 1 < T:
            C3A[si[s], k + 1] = 1
            if r["surprise_pct"] not in ("", None):
                C3B[si[s], k + 1] = abs(float(r["surprise_pct"]))
nbr = {}
for r in csv.DictReader(open(os.path.join(DATA, "links_frozen.csv"))):
    a, b = r["fromSymbol"], r["toSymbol"]
    nbr.setdefault(a, set()).add(b)
    nbr.setdefault(b, set()).add(a)
LE = np.zeros((S, T))
for s, i in si.items():
    for o in nbr.get(s, ()):
        if o != s and o in earn_flag:
            LE[i] += earn_flag[o]

# ---------------- calendar flags ----------------
def third_friday(d):
    return d.weekday() == 4 and 15 <= d.day <= 21


EXP = np.array([1.0 if third_friday(d) else 0.0 for d in dates])
WIT = np.array([1.0 if third_friday(d) and d.month in (3, 6, 9, 12) else 0.0 for d in dates])
RUS = np.array([1.0 if d.weekday() == 4 and d.month == 6 and d.day >= 24 else 0.0 for d in dates])


def weekday_holiday_between(a, b):
    d = a + dt.timedelta(days=1)
    while d < b:
        if d.weekday() < 5 and d not in calset:
            return True
        d += dt.timedelta(days=1)
    return False


HADJ = np.zeros(T)
for t in range(T):
    if (t > 0 and weekday_holiday_between(dates[t - 1], dates[t])) or \
       (t + 1 < T and weekday_holiday_between(dates[t], dates[t + 1])):
        HADJ[t] = 1
HALF = np.zeros(T)
for t, d in enumerate(dates):
    if (d.month == 7 and d.day == 3) or (d.month == 12 and d.day == 24):
        HALF[t] = 1
    if d.month == 11 and d.weekday() == 4 and 23 <= d.day <= 29 and (d - dt.timedelta(days=1)) not in calset:
        HALF[t] = 1
CALF = [np.broadcast_to(x, (S, T)).copy() for x in (EXP, WIT, RUS, HADJ, HALF)]

# ---------------- macro days ----------------
fomc_days = {r["date"] for r in csv.DictReader(open(os.path.join(DATA, "macro_days.csv"))) if r["kind"] == "fomc"}
FOMC = np.array([np.nan if d < "2019-01-01" else (1.0 if d in fomc_days else 0.0) for d in cal])
JOBS = np.zeros(T)
seen = set()
for t, d in enumerate(dates):
    ym = (d.year, d.month)
    if ym in seen:
        continue
    first_fri = dt.date(d.year, d.month, 1)
    while first_fri.weekday() != 4:
        first_fri += dt.timedelta(days=1)
    k = first_fri
    while k not in calset and k.month == d.month:
        k -= dt.timedelta(days=1)
    if k in calset:
        JOBS[ti[k.isoformat()]] = 1
    seen.add(ym)
MACF = [np.broadcast_to(x, (S, T)).copy() for x in (FOMC, JOBS)]

# ---------------- models ----------------
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

BASE_KNOWN = [C3A, C3B]
ARMS = {  # name -> (targets, spec); spec keys: ctx, known, past, mv, tf, model
    "M0":    (["T1_lnV", "T2_absr"], dict(ctx=1024, known=[])),
    "B":     (["T1_lnV", "T2_absr"], dict(ctx=1024, known=BASE_KNOWN)),
    "X256":  (["T1_lnV", "T2_absr"], dict(ctx=256, known=BASE_KNOWN)),
    "X2520": (["T1_lnV", "T2_absr"], dict(ctx=2520, known=BASE_KNOWN)),
    "MV":    (["T1_lnV", "T2_absr"], dict(ctx=1024, known=BASE_KNOWN, mv=["T1_lnV", "T2_absr"])),
    "MV3":   (["T1_lnV", "T2_absr"], dict(ctx=1024, known=BASE_KNOWN, mv=["T1_lnV", "T2_absr", "PR"])),
    "SQ":    (["T2_absr"], dict(ctx=1024, known=BASE_KNOWN, tf="sqrt")),
    "LG":    (["T2_absr"], dict(ctx=1024, known=BASE_KNOWN, tf="log")),
    "M209":  (["T2_absr"], dict(ctx=1024, known=BASE_KNOWN, model="209")),
    "PRc":   (["T1_lnV", "T2_absr"], dict(ctx=1024, known=BASE_KNOWN, past=[PR])),
    "LE":    (["T1_lnV", "T2_absr"], dict(ctx=1024, known=BASE_KNOWN + [LE])),
    "CAL":   (["T1_lnV", "T2_absr"], dict(ctx=1024, known=BASE_KNOWN + CALF)),
    "MAC":   (["T1_lnV", "T2_absr"], dict(ctx=1024, known=BASE_KNOWN + MACF)),
}
GATED = {"T1_lnV": ["RC", "X256", "X2520", "MV", "MV3", "PRc", "LE", "CAL", "MAC"],
         "T2_absr": ["RC", "X256", "X2520", "MV", "MV3", "SQ", "LG", "E209", "BL", "PRc", "LE", "CAL", "MAC"]}
assert sum(len(v) for v in GATED.values()) == N_GATES
MV_SRC = {"T1_lnV": LNV, "T2_absr": ABSR, "PR": PR}


TF_SRC = {"sqrt": {"T2_absr": np.sqrt(ABSR)}, "log": {"T2_absr": np.log(ABSR + LG_EPS)}}
NOTES = []


def inv(q, tf):
    if tf == "sqrt":
        return np.clip(q, 0, None) ** 2
    if tf == "log":
        return np.clip(np.exp(q) - LG_EPS, 0, None)
    return q


def run(spec, tk, t):
    """Quantiles (S, Q) for target tk at origin t under spec; for mv specs the dict of all variates."""
    ctx = spec.get("ctx", 1024)
    lo = max(0, t - ctx)
    F = F209 if spec.get("model") == "209" else F28
    kw = {"categorical_known_covariates": np.broadcast_to(DOW[lo:t + 1], (S, t + 1 - lo))[:, None, :].copy()}
    if spec.get("known"):
        kw["known_covariates"] = np.stack([X[:, lo:t + 1] for X in spec["known"]], axis=1)
    if spec.get("past"):
        kw["past_covariates"] = np.stack([X[:, lo:t] for X in spec["past"]], axis=1)
    if spec.get("mv"):
        Y = np.stack([MV_SRC[v][:, lo:t] for v in spec["mv"]], axis=1)
        q = F.forecast(Y, prediction_length=1, **kw).quantiles.cpu().numpy()[:, :, 0, :]
        return {v: q[:, j] for j, v in enumerate(spec["mv"])}
    Y = TF_SRC[spec.get("tf")][tk] if spec.get("tf") else TARGETS[tk]
    tf = spec.get("tf")
    try:
        q = F.forecast(Y[:, None, lo:t], prediction_length=1, **kw).quantiles.cpu().numpy()[:, 0, 0, :]
    except ValueError as e:  # a checkpoint not trained with covariates (209M?)
        if "covariates" not in str(e) or F is F28:
            raise
        note = "M209 ran WITHOUT covariates: " + str(e)
        if note not in NOTES:
            NOTES.append(note)
        kw = {}
        q = F.forecast(Y[:, None, lo:t], prediction_length=1).quantiles.cpu().numpy()[:, 0, 0, :]
    return inv(q, tf)


def empirical(Y, t, n=60, min_n=30):
    w = Y[:, max(0, t - n):t]
    return np.stack([np.nanquantile(w[i], LEVELS) if np.isfinite(w[i]).sum() >= min_n else np.full(Q, np.nan)
                     for i in range(S)])


K = len(origins)
FC = {tk: {} for tk in TARGETS}
for tk in TARGETS:
    for m, (tks, _) in ARMS.items():
        if tk in tks:
            FC[tk][m] = np.full((S, K, Q), np.nan)
    FC[tk]["empirical60*"] = np.full((S, K, Q), np.nan)
t_start = time.perf_counter()
for k, t in enumerate(origins):
    mv_cache = {}
    for m, (tks, spec) in ARMS.items():
        if spec.get("mv"):
            if m not in mv_cache:
                mv_cache[m] = run(spec, None, t)
            for tk in tks:
                FC[tk][m][:, k] = mv_cache[m][tk]
        else:
            for tk in tks:
                FC[tk][m][:, k] = run(spec, tk, t)
    for tk, Y in TARGETS.items():
        FC[tk]["empirical60*"][:, k] = empirical(Y, t)
    if k == 0:
        per = time.perf_counter() - t_start
        print(f"first origin {per:.1f}s; est. total {per * K / 60:.0f} min", flush=True)
    elif k % 10 == 0:
        print(f"  origin {k + 1}/{K}, {time.perf_counter() - t_start:.0f}s elapsed", flush=True)
print(f"forecasts done, {time.perf_counter() - t_start:.0f}s", flush=True)


# ---------------- scoring ----------------
def crps(q, y):
    pin = np.where(y[..., None] < q, (1 - LEVELS) * (q - y[..., None]), LEVELS * (y[..., None] - q))
    return 2 * np.trapezoid(pin, LEVELS, axis=-1)


def scale(q, s):
    med = q[..., ia[0.5]][..., None]
    return med + s * (q - med)


# RC: trailing recalibration of B, one pooled scale per target per origin
RC_S = {tk: np.full(K, np.nan) for tk in TARGETS}
for tk, Y in TARGETS.items():
    FC[tk]["RC"] = np.full((S, K, Q), np.nan)
    y = Y[:, origins]
    b = FC[tk]["B"]
    for k in range(RC_LOOKBACK, K):
        yy, qq = y[:, k - RC_LOOKBACK:k], b[:, k - RC_LOOKBACK:k]
        ok = np.isfinite(yy) & np.isfinite(qq).all(-1)
        if ok.sum() < 100:
            continue
        best = min(RC_GRID, key=lambda s: float(crps(scale(qq[ok], s), yy[ok]).mean()))
        RC_S[tk][k] = best
        FC[tk]["RC"][:, k] = scale(b[:, k], best)

# E209: quantile average of B and M209 on T2
FC["T2_absr"]["E209"] = (FC["T2_absr"]["B"] + FC["T2_absr"]["M209"]) / 2

# BL: pool of B and empirical60 on T2; w fixed on dev
def pool(w):
    return w * FC["T2_absr"]["B"] + (1 - w) * FC["T2_absr"]["empirical60*"]


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


bl_lines = []
if args.window == "dev":
    scores = {}
    for w in BL_GRID:
        FC["T2_absr"]["BL"] = pool(w)
        c = compare("T2_absr", "BL", "B")
        scores[w] = c["ratio"]
        bl_lines.append(f"- BL w={w}: ratio vs B {c['ratio']:.4f}, tickers {c['w']}/{c['l']} (p {c['p']:.2g})")
    BL_W = min(BL_GRID, key=lambda w: scores[w])
    if not args.tiny and not args.max_origins:
        open(BLW, "w").write(str(BL_W))
    bl_lines.append(f"- chosen w = {BL_W}{' (written to data/exp4_bl_w.txt)' if not args.tiny and not args.max_origins else ''}")
else:
    BL_W = float(open(BLW).read().strip())
    bl_lines.append(f"- BL w = {BL_W} (fixed on dev)")
FC["T2_absr"]["BL"] = pool(BL_W)

ORDER = ["M0", "B", "RC", "X256", "X2520", "MV", "MV3", "SQ", "LG", "M209", "E209", "BL", "PRc", "LE", "CAL", "MAC"]
lines = [f"# Experiment 4 results ({args.window}{', TINY DRY RUN, random weights' if args.tiny else ''})", "",
         f"Generated {dt.datetime.now().isoformat(timespec='minutes')} by bench/timestral_exp4.py, implementing "
         f"bench/PREREG_EXP4.md (frozen sha256 {FROZEN['PREREG_EXP4.md#frozen'][:12]}...). "
         + ("Inputs hash-checked." if not args.skip_hash else "HASH CHECKS SKIPPED (code check)."), "",
         f"Universe: {S} tickers. Excluded: " + ", ".join(f"{k} ({v})" for k, v in sorted(excluded.items())) + ".",
         f"Origins: {K} ({cal[origins[0]]}..{cal[origins[-1]]}). Device {args.device}. Run time {time.perf_counter() - t_start:.0f}s.",
         "Covariate rates at the origins: " + ", ".join(
             f"{n} {np.nanmean(X[:, origins]):.1%}" for n, X in
             [("earnings window", C3A), ("linked earnings>0", (LE > 0).astype(float)), ("expiry", CALF[0]),
              ("witching", CALF[1]), ("holiday-adj", CALF[3]), ("half-day", CALF[4]), ("FOMC", MACF[0]), ("jobs", MACF[1])]),
         "RC scale chosen per origin (median over origins): " + ", ".join(
             f"{tk} {np.nanmedian(RC_S[tk]):.2f}" for tk in TARGETS) + ".",
         "", "## BL weight", ""] + bl_lines + (["", "## Notes", ""] + [f"- {n}" for n in NOTES] if NOTES else []) + [
         "", f"## Gates (arm vs B, paired; pass = ratio < 1 and sign p < {ALPHA:.5f}, {N_GATES} gates)", ""]
for tk in TARGETS:
    for m in GATED[tk]:
        c = compare(tk, m, "B")
        ok = c["ratio"] < 1 and c["p"] < ALPHA
        lines.append(f"- {tk} {m}: ratio {c['ratio']:.4f}, tickers {c['w']}/{c['l']} (p {c['p']:.2g}), "
                     f"pooled skill {c['skill']:+.4f}, pairs {c['n_pairs']} -> {'PASS' if ok else 'FAIL'}")
lines += ["", "## All comparisons", "",
          "| target | method | vs | ratio | tickers won/lost | sign p | pooled skill | ticker-days | 10-90 cov | y>=q90 |",
          "|---|---|---|---|---|---|---|---|---|---|"]
for tk in TARGETS:
    for m in ORDER:
        if m not in FC[tk]:
            continue
        for vs in (["empirical60*"] if m == "B" else ["B"]):
            c = compare(tk, m, vs)
            cov, exc = calib(tk, m)
            lines.append(f"| {tk} | {m} | {vs} | {c['ratio']:.4f} | {c['w']}/{c['l']} | {c['p']:.2g} | "
                         f"{c['skill']:+.4f} | {c['n_pairs']} | {cov:.3f} | {exc:.3f} |")
lines += ["", "Pre-registered expectation: RC passes both targets; PRc and MV help T2; CAL and LE help T1; "
          "SQ/LG, E209, BL and context changes open; MAC small if at all. Nulls are reported with the same "
          "prominence as positives."]

out = os.path.join(HERE, "EXP4_RESULTS.md" if args.window == "holdout" else "EXP4_DEV.md")
open(out, "w").write("\n".join(lines) + "\n")
with open(os.path.join(DATA, f"exp4_pairs_{args.window}.csv"), "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["target", "method", "symbol", "date", "y"] + [f"q{int(round(a * 100)):02d}" for a in LEVELS])
    for tk, Y in TARGETS.items():
        for m, q in FC[tk].items():
            for i, s in enumerate(universe):
                for k, t in enumerate(origins):
                    if np.isfinite(Y[i, t]) and np.isfinite(q[i, k]).all():
                        w.writerow([tk, m, s, cal[t], round(float(Y[i, t]), 5)] + [round(float(x), 5) for x in q[i, k]])
if args.window == "holdout":
    open(DONE, "w").write(dt.datetime.now().isoformat(timespec="seconds"))
print("\n".join(lines))
