"""Timestral interface check (Pulse Timestral plan, step 1). Run natively on macOS, not in a VM.

Synthetic stand-in for experiment 1: 75 series of daily article counts with a weekday effect
and earnings-day spikes. Exercises every input the newsflow backtest will use:
  context (B,1,T) counts | past_covariates (B,1,T) "count >= 4" analog
  known_covariates (B,1,T+1) earnings flag | categorical_known_covariates (B,1,T+1) day of week
--tiny runs the package's random test-size model (no HF download) to dry-run the call shapes.
"""
import argparse
import os
import time

import numpy as np
import torch
from timestral import TimestralForecaster

ap = argparse.ArgumentParser()
ap.add_argument("--models", default="28M,209M")
ap.add_argument("--threads", default="1,4,8")
ap.add_argument("--tiny", action="store_true")
args = ap.parse_args()


def load(size):
    if not args.tiny:
        return TimestralForecaster.from_pretrained(f"mistralai/Timestral-{size}")
    from timestral import TimestralConfig, TimestralModel
    knots = tuple(round(float(x), 2) for x in [0.01, 0.05] + list(np.arange(0.1, 0.91, 0.05)) + [0.95, 0.99])
    cfg = TimestralConfig(patch_size=8, d_model=32, num_heads=4, mlp_hidden_dim=64,
                          block_schedule=("time", "time_variate"), quantile_knots=knots,
                          block_size=4, context_length=512)
    torch.manual_seed(0)
    return TimestralForecaster(TimestralModel(cfg).eval())


rng = np.random.default_rng(0)
B, T, H = 75, 180, 1
dow = np.arange(T + H) % 7                                        # 0-4 weekday, 5-6 weekend
earn = np.zeros((B, T + H))
np.put_along_axis(earn, rng.integers(0, T, (B, 3)), 1, axis=1)
earn[0, T] = 1                                                    # series 0: earnings on the forecast day
lam = (2 + 5 * (dow < 5))[None, :] * (1 + 3 * earn)
y = rng.poisson(lam).astype(np.float64)
y[5, :60] = np.nan                                                # short-history ticker: leading NaNs
hi = rng.binomial(np.nan_to_num(y).astype(int), 0.15).astype(np.float64)

ctx = y[:, None, :T]
cov = dict(past_covariates=hi[:, None, :T],
           known_covariates=earn[:, None, :],
           categorical_known_covariates=np.broadcast_to(dow, (B, T + H))[:, None, :].astype(np.float64))

print(f"cpu_count={os.cpu_count()} torch={torch.__version__} default_threads={torch.get_num_threads()}")
for size in args.models.split(","):
    t0 = time.perf_counter()
    f = load(size)
    n_params = sum(p.numel() for p in f.model.parameters())
    print(f"\n== {size}: load {time.perf_counter() - t0:.1f}s, params {n_params / 1e6:.1f}M, "
          f"patch {f.patch_size}, max_context {f.max_context}, "
          f"covariates={f.supports_covariates} known_future={f.supports_known_covariates}")
    print(f"quantile_levels ({len(f.quantile_levels)}): {f.quantile_levels}")
    use = cov if f.supports_known_covariates else {k: v for k, v in cov.items() if "known" not in k}
    if use is not cov:
        print("WARNING: checkpoint rejects known-future covariates; running past-only")

    fc = f.forecast(ctx, prediction_length=H, **use)
    q = fc.quantiles.numpy()
    assert q.shape == (B, 1, H, len(f.quantile_levels)), q.shape
    assert np.isfinite(q).all() and (np.diff(q, axis=-1) >= -1e-5).all() and (q >= 0).all()
    q90 = fc.quantile(0.9).numpy()[:, 0, 0]
    print(f"quantiles {q.shape} finite, monotone, >=0 | median[0:3]={fc.median.numpy()[:3, 0, 0].round(2)} "
          f"q90[0:3]={q90[:3].round(2)} | short-history series 5 median={fc.median.numpy()[5, 0, 0]:.2f}")

    if f.supports_known_covariates:
        off = {**use, "known_covariates": earn[:, None, :].copy()}
        off["known_covariates"][0, 0, T] = 0
        m_on = fc.median.numpy()[0, 0, 0]
        m_off = f.forecast(ctx, prediction_length=H, **off).median.numpy()[0, 0, 0]
        print(f"earnings flag on forecast day, series 0: median {m_on:.2f} (flag=1) vs {m_off:.2f} (flag=0)")
    m_none = f.forecast(ctx, prediction_length=H).median.numpy()[:, 0, 0]
    print(f"mean |median(cov) - median(no cov)| over 75 series: {np.abs(fc.median.numpy()[:, 0, 0] - m_none).mean():.3f}")

    for n in [int(x) for x in args.threads.split(",")]:
        torch.set_num_threads(n)
        row = []
        for b, sym in [(1, True), (1, False), (B, True)]:
            kw = {k: v[:b] for k, v in use.items()}
            f.forecast(ctx[:b], prediction_length=H, symmetric_averaging=sym, **kw)  # warmup
            ts = []
            for _ in range(5):
                t0 = time.perf_counter()
                f.forecast(ctx[:b], prediction_length=H, symmetric_averaging=sym, **kw)
                ts.append(time.perf_counter() - t0)
            row.append(f"B={b} sym={sym}: {1e3 * np.median(ts):.0f} ms")
        print(f"threads={n}: " + " | ".join(row))
