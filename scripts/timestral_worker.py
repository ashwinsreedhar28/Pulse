"""Pulse worker for news-volume data (BigQuery) and Timestral forecasts. JSON lines over stdio.

Request:  {"id": 1, "op": "ping"}
          {"id": 2, "op": "gkg_daily", "patterns": {"NVDA": "\\bnvidia\\b"}, "start": "2026-10-18",
           "end": "2026-10-21", "max_bytes": 5000000000}          # end exclusive, UTC days
          {"id": 3, "op": "forecast", "model": "28M", "series": {"NVDA": [512, null, 640]},
           "dow": [0, 1, 2, 3], "horizon": 1, "threads": 4}       # null = missing day; dow covers T + horizon
Response: {"id": 1, "ok": true, "result": {...}}  or  {"id": 1, "ok": false, "error": "..."}
Logs go to stderr. Requests run one at a time.

Python env: ~/.venvs/timestral or PULSE_TIMESTRAL_PYTHON; see scripts/timestral_requirements.txt.
BigQuery auth: Application Default Credentials (`gcloud auth application-default login` plus a quota
project). The project comes from PULSE_BQ_PROJECT or the gcloud default. maximum_bytes_billed is a hard
cap per query, so a bad request fails instead of scanning (and billing) past it.
"""
import json
import os
import sys
import time
import traceback

# Same query as bench/gkg_daily.sql, parameterized. Dense output: every (symbol, day GDELT has docs),
# zero when no doc matched. A day GDELT has no docs for is absent (outage), never zero.
GKG_SQL = r"""
WITH q AS (SELECT s.symbol, s.re FROM UNNEST(@q) AS s),
g AS (
  SELECT DATE(PARSE_TIMESTAMP('%Y%m%d%H%M%S', CAST(`DATE` AS STRING))) AS day,
         LOWER(Organizations) AS orgs
  FROM `gdelt-bq.gdeltv2.gkg_partitioned`
  WHERE _PARTITIONTIME >= TIMESTAMP_SUB(TIMESTAMP(@start), INTERVAL 1 DAY)
    AND _PARTITIONTIME < TIMESTAMP_ADD(TIMESTAMP(@end), INTERVAL 1 DAY)
),
norm AS (SELECT day, COUNT(*) AS norm FROM g WHERE day >= @start AND day < @end GROUP BY day),
cand AS (SELECT day, orgs FROM g WHERE day >= @start AND day < @end AND REGEXP_CONTAINS(orgs, @combined)),
hits AS (
  SELECT q.symbol, cand.day, COUNT(*) AS n
  FROM cand CROSS JOIN q
  WHERE REGEXP_CONTAINS(cand.orgs, q.re)
  GROUP BY 1, 2
)
SELECT q.symbol, FORMAT_DATE('%Y-%m-%d', norm.day) AS day, IFNULL(hits.n, 0) AS count, norm.norm
FROM norm CROSS JOIN q
LEFT JOIN hits ON hits.symbol = q.symbol AND hits.day = norm.day
"""


def ping(_req):
    out = {"python": sys.version.split()[0], "pid": os.getpid()}
    for mod in ("google.cloud.bigquery", "timestral", "torch"):
        try:
            m = __import__(mod, fromlist=["__version__"])
            out[mod] = getattr(m, "__version__", "ok")
        except Exception as e:  # report, don't fail: each op needs a different subset
            out[mod] = f"missing ({type(e).__name__})"
    return out


def gkg_daily(req):
    from google.cloud import bigquery

    pats = req["patterns"]
    if not pats:
        return {"rows": [], "bytes_processed": 0}
    syms = sorted(pats)
    struct = [bigquery.StructQueryParameter(None,
                                            bigquery.ScalarQueryParameter("symbol", "STRING", s),
                                            bigquery.ScalarQueryParameter("re", "STRING", pats[s])) for s in syms]
    cfg = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("q", "STRUCT", struct),
            bigquery.ScalarQueryParameter("combined", "STRING", "|".join(pats[s] for s in syms)),
            bigquery.ScalarQueryParameter("start", "DATE", req["start"]),
            bigquery.ScalarQueryParameter("end", "DATE", req["end"]),
        ],
        maximum_bytes_billed=int(req.get("max_bytes", 5_000_000_000)),
    )
    client = bigquery.Client(project=os.environ.get("PULSE_BQ_PROJECT") or None)
    job = client.query(GKG_SQL, job_config=cfg)
    rows = [[r["symbol"], r["day"], int(r["count"]), int(r["norm"])] for r in job.result()]
    return {"rows": rows, "bytes_processed": job.total_bytes_processed, "bytes_billed": job.total_bytes_billed,
            "project": client.project}


_MODELS = {}


def forecast(req):
    """Timestral quantile forecast, the configuration bench/timestral_newsflow.py validated: raw daily
    counts, missing days as NaN, day of week as a known-future categorical, symmetric averaging on."""
    import numpy as np
    import torch
    from timestral import TimestralForecaster

    name = req.get("model", "28M")
    torch.set_num_threads(int(req.get("threads", 4)))
    f = _MODELS.get(name)
    if f is None:
        f = _MODELS[name] = TimestralForecaster.from_pretrained(f"mistralai/Timestral-{name}")
    syms = sorted(req["series"])
    if not syms:
        return {"model": name, "levels": [float(x) for x in f.quantile_levels], "quantiles": {}, "ms": 0}
    ctx = np.array([[np.nan if v is None else float(v) for v in req["series"][s]] for s in syms])
    horizon = int(req.get("horizon", 1))
    # dow: one list shared by every series, or {key: list} when rows are different windows
    # (e.g. the per-ticker backcast, where each row ends on a different day).
    if isinstance(req["dow"], dict):
        dow = np.array([req["dow"][s] for s in syms], dtype=np.float64)
    else:
        dow = np.broadcast_to(np.asarray(req["dow"], dtype=np.float64), (len(syms), len(req["dow"])))
    if dow.shape[1] != ctx.shape[1] + horizon:
        raise ValueError(f"dow has {dow.shape[1]} entries, expected {ctx.shape[1] + horizon}")
    t0 = time.perf_counter()
    fc = f.forecast(ctx[:, None, :], prediction_length=horizon, categorical_known_covariates=dow[:, None, :].copy())
    q = fc.quantiles.numpy()[:, 0, :, :]  # (B, horizon, Q)
    return {"model": name, "levels": [round(float(x), 4) for x in f.quantile_levels],
            "quantiles": {s: q[i].round(3).tolist() for i, s in enumerate(syms)},
            "ms": round((time.perf_counter() - t0) * 1000)}


def forecast_cov(req):
    """Timestral forecast with known-future numeric covariates, the configuration Experiment 3
    validated for prices (earnings window + |EPS surprise| as known covariates, day of week as a
    categorical). series: {key: [T values]}, known: {key: [[T+H], ...]} (same covariate count per key),
    dow: {key: [T+H]} or one list. Shorter series are left-padded with NaN (missing) to the longest."""
    import numpy as np
    import torch
    from timestral import TimestralForecaster

    name = req.get("model", "28M")
    torch.set_num_threads(int(req.get("threads", 4)))
    f = _MODELS.get(name)
    if f is None:
        f = _MODELS[name] = TimestralForecaster.from_pretrained(f"mistralai/Timestral-{name}")
    keys = sorted(req["series"])
    levels = [round(float(x), 4) for x in f.quantile_levels]
    if not keys:
        return {"model": name, "levels": levels, "quantiles": {}, "ms": 0}
    horizon = int(req.get("horizon", 1))
    T = max(len(req["series"][k]) for k in keys)

    def pad(v, n):
        v = [np.nan if x is None else float(x) for x in v]
        return [np.nan] * (n - len(v)) + v

    ctx = np.array([pad(req["series"][k], T) for k in keys])
    dow_req = req["dow"]
    dow = np.array([pad(dow_req[k] if isinstance(dow_req, dict) else dow_req, T + horizon) for k in keys])
    dow = np.where(np.isnan(dow), 0.0, dow)  # categorical codes can't be NaN; padded days are masked anyway
    kw = {"categorical_known_covariates": dow[:, None, :].copy()}
    known = req.get("known") or {}
    if known:
        nc = len(known[keys[0]])
        kw["known_covariates"] = np.array([[pad(known[k][c], T + horizon) for c in range(nc)] for k in keys])
    t0 = time.perf_counter()
    fc = f.forecast(ctx[:, None, :], prediction_length=horizon, **kw)
    q = fc.quantiles.numpy()[:, 0, :, :]
    return {"model": name, "levels": levels,
            "quantiles": {k: q[i].round(5).tolist() for i, k in enumerate(keys)},
            "ms": round((time.perf_counter() - t0) * 1000)}


OPS = {"ping": ping, "gkg_daily": gkg_daily, "forecast": forecast, "forecast_cov": forecast_cov}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = {}
        try:
            req = json.loads(line)
            op = OPS.get(req.get("op"))
            if op is None:
                raise ValueError(f"unknown op {req.get('op')!r}")
            out = {"id": req.get("id"), "ok": True, "result": op(req)}
        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            out = {"id": req.get("id") if isinstance(req, dict) else None, "ok": False,
                   "error": f"{type(e).__name__}: {e}"}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
