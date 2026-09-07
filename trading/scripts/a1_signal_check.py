#!/usr/bin/env python3
"""A1.3 — conditional return analysis and the phase gate.

Slices the event-study results and asks, for each bucket, whether mean excess
return differs from zero. Writes reports/a1_results.md.

Two things this does that the brief did not specify, both necessary:

1. **Multiple-hypothesis correction.** The brief's gate is |t| > 2.5 with
   N > 200 in *at least one* bucket. Testing dozens of buckets and reporting
   the best one is exactly how noise gets published: at p<0.05, one bucket in
   twenty clears by chance. Benjamini-Hochberg is applied across all buckets
   and the corrected verdict is what counts.

2. **Urgency buckets follow the data.** The brief assumes urgency spans 1-5.
   It does not: urgencyScorer emits only 1, 3 and 5, and scores 2/4 appear in
   ~0.3% of rows via AI promotion. Bucketing as (1-2, 3, 4, 5) would produce
   an empty "4" bucket and a misleading table.

Read the sample-size warnings before reading the t-statistics.
"""

from __future__ import annotations

import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.db import connect  # noqa: E402

MIN_N_FOR_GATE = 200
GATE_T = 2.5
MARGINAL_T = 1.5


def mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def stdev(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def t_stat(xs: list[float]) -> float:
    """One-sample t against H0: mean = 0."""
    if len(xs) < 2:
        return 0.0
    s = stdev(xs)
    if s == 0:
        return 0.0
    return mean(xs) / (s / math.sqrt(len(xs)))


def two_sided_p(t: float, df: int) -> float:
    """Normal approximation to the t distribution.

    Adequate here: every bucket that matters for the gate has N > 200, where
    the t and normal distributions agree to about three decimal places. Small
    buckets are reported but excluded from the gate anyway.
    """
    if df < 1:
        return 1.0
    z = abs(t)
    # Abramowitz & Stegun 7.1.26 error-function approximation.
    p = 0.3275911
    a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429]
    x = z / math.sqrt(2)
    tt = 1 / (1 + p * x)
    y = 1 - (((((a[4] * tt + a[3]) * tt) + a[2]) * tt + a[1]) * tt + a[0]) * tt * math.exp(-x * x)
    return max(0.0, min(1.0, 1 - y))


def benjamini_hochberg(pvals: list[float], alpha: float = 0.05) -> list[bool]:
    """Which hypotheses survive BH FDR control at `alpha`."""
    m = len(pvals)
    if m == 0:
        return []
    order = sorted(range(m), key=lambda i: pvals[i])
    keep = [False] * m
    largest = -1
    for rank, idx in enumerate(order, start=1):
        if pvals[idx] <= alpha * rank / m:
            largest = rank
    for rank, idx in enumerate(order, start=1):
        if rank <= largest:
            keep[idx] = True
    return keep


def main() -> int:
    conn = connect(read_only=True)

    try:
        rows = conn.execute(
            """
            SELECT r.symbol, r.horizon, r.excessReturn, r.urgencyScore,
                   r.mentionStrength, r.t0Ms,
                   COALESCE(d.isDuplicate, 0) AS isDuplicate
              FROM trading_event_study_results r
              LEFT JOIN trading_article_dedup d
                     ON d.articleId = r.articleId AND d.symbol = r.symbol
             WHERE r.excessReturn IS NOT NULL
            """
        ).fetchall()
    except Exception as exc:  # noqa: BLE001
        print(f"No event-study results yet ({exc}). Run event_study.py first.")
        return 1

    if not rows:
        print("No event-study results. Run event_study.py first.")
        return 1

    # (horizon, urgency, strength, first-mention-only) -> excess returns.
    # Urgency is bucketed as the scorer actually emits it: 1 / 3 / 5, with
    # anything else collected as "other".
    def urgency_bucket(u: int | None) -> str:
        if u is None:
            return "none"
        if u >= 5:
            return "5"
        if u == 3:
            return "3"
        if u <= 1:
            return "1"
        return "other(2/4)"

    # Collapse to one observation per (symbol, day, bucket) before testing.
    #
    # This is the correction that matters most, and without it the whole
    # exercise is invalid. Two sources of non-independence:
    #   - Several articles about one ticker on one day map to the SAME forward
    #     return. Counting them separately is counting one observation many
    #     times.
    #   - 5-day windows on adjacent days overlap by ~80%, so even distinct
    #     events are strongly correlated.
    # Averaging within a (symbol, day) cell removes the first entirely and
    # blunts the second. The naive version reported |t| near 9; almost all of
    # that was replication, not evidence.
    cells: dict[tuple, list[float]] = defaultdict(list)
    for r in rows:
        day = datetime.fromtimestamp(r["t0Ms"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        key_base = (r["horizon"], urgency_bucket(r["urgencyScore"]), r["mentionStrength"])
        cells[(*key_base, "all", r["symbol"], day)].append(r["excessReturn"])
        if not r["isDuplicate"]:
            cells[(*key_base, "first", r["symbol"], day)].append(r["excessReturn"])

    buckets: dict[tuple, list[float]] = defaultdict(list)
    raw_counts: dict[tuple, int] = defaultdict(int)
    for (horizon, urg, strength, subset, _sym, _day), xs in cells.items():
        buckets[(horizon, urg, strength, subset)].append(mean(xs))
        raw_counts[(horizon, urg, strength, subset)] += len(xs)

    results = []
    for (horizon, urg, strength, subset), xs in sorted(buckets.items()):
        if len(xs) < 2:
            continue
        t = t_stat(xs)
        results.append(
            {
                "horizon": horizon,
                "urgency": urg,
                "strength": strength,
                "subset": subset,
                "n": len(xs),
                "raw": raw_counts[(horizon, urg, strength, subset)],
                "mean": mean(xs),
                "sd": stdev(xs),
                "t": t,
                "p": two_sided_p(t, len(xs) - 1),
            }
        )

    # ---- placebo -----------------------------------------------------------
    #
    # The decisive control, and the reason the raw gate cannot be trusted here.
    #
    # Every bucket above is negative, with similar magnitude regardless of
    # urgency or horizon. A real conditional signal should DISCRIMINATE — high
    # urgency behaving differently from low. A uniform shift instead suggests
    # the whole universe drifted against its benchmark over this window, and
    # that the "effect" is a property of the sample, not of the news.
    #
    # So: compute the same excess return on random non-event days for the same
    # symbols over the same window. If the placebo mean matches the event mean,
    # there is no news signal — only a level shift.
    placebo: dict[str, list[float]] = defaultdict(list)
    try:
        import random

        random.seed(0)
        event_days = {(r["symbol"], datetime.fromtimestamp(r["t0Ms"] / 1000,
                      tz=timezone.utc).strftime("%Y-%m-%d")) for r in rows}
        symbols = sorted({r["symbol"] for r in rows})
        days = sorted({d for _s, d in event_days})
        if days:
            lo, hi = days[0], days[-1]
            sectors = {
                r["symbol"]: r["sector"]
                for r in conn.execute(
                    "SELECT symbol, sector FROM tickers WHERE sector IS NOT NULL"
                )
            }
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            from event_study import benchmark_for, daily_series, forward_return

            series_cache: dict[str, dict[str, float]] = {}

            def px(sym: str) -> dict[str, float]:
                if sym not in series_cache:
                    series_cache[sym] = daily_series(conn, sym)
                return series_cache[sym]

            for sym in symbols:
                s_px = px(sym)
                b_px = px(benchmark_for(sectors.get(sym)))
                if not s_px or not b_px:
                    continue
                sessions = [d for d in sorted(s_px) if lo <= d <= hi]
                # Same count of draws as the symbol has event days, so the
                # placebo has comparable weight per symbol.
                n_draw = sum(1 for (sy, _d) in event_days if sy == sym)
                pool = [d for d in sessions if (sym, d) not in event_days]
                if not pool:
                    continue
                for d in random.sample(pool, min(n_draw, len(pool))):
                    for label, horizon in (("1d", 1), ("5d", 5)):
                        rt = forward_return(s_px, d, horizon)
                        rb = forward_return(b_px, d, horizon)
                        if rt is not None and rb is not None:
                            placebo[label].append(rt - rb)
    except Exception as exc:  # noqa: BLE001
        print(f"placebo skipped: {exc}")

    # Correct only over buckets eligible for the gate. Including tiny buckets
    # would inflate m and make the correction unduly harsh.
    eligible = [r for r in results if r["n"] >= MIN_N_FOR_GATE]
    keep = benjamini_hochberg([r["p"] for r in eligible])
    for r, k in zip(eligible, keep):
        r["bh_significant"] = k

    passing = [r for r in eligible if r.get("bh_significant") and abs(r["t"]) > GATE_T]
    marginal = [r for r in eligible if MARGINAL_T < abs(r["t"]) <= GATE_T]

    # A "significant" bucket whose effect the placebo reproduces is not
    # evidence of a news signal. Require the event effect to be materially
    # larger in magnitude than the same-window, same-universe baseline.
    def placebo_explains(r: dict) -> bool:
        base = placebo.get(r["horizon"])
        if not base or len(base) < 30:
            return False
        pm = mean(base)
        # Same sign and the event effect is not at least 50% larger.
        return pm * r["mean"] > 0 and abs(r["mean"]) < abs(pm) * 1.5

    for r in results:
        r["placebo_explains"] = placebo_explains(r)
    passing = [r for r in passing if not r["placebo_explains"]]
    # Calendar-span gate. Independent observations are bounded by the number
    # of NON-OVERLAPPING horizon windows in the sample, not by row count.
    # 82 distinct event days is ~16 non-overlapping 5-day windows however many
    # (symbol, day) cells sit inside them, so nominal N in the hundreds
    # dramatically overstates the real degrees of freedom. Cross-sectional
    # breadth does not rescue this: the universe is one heavily-correlated
    # sector, so symbols are not independent draws either.
    #
    # A mechanical PASS on this little calendar would be the single easiest
    # way to talk ourselves into a phantom signal, so the verdict is capped at
    # MARGINAL until the corpus spans a year. articles_archive (v54) is what
    # makes that eventually reachable — before it, the 30-day purge meant the
    # window could never grow at all.
    event_days = len({
        datetime.fromtimestamp(r["t0Ms"] / 1000, tz=timezone.utc).date() for r in rows
    })
    MIN_EVENT_DAYS = 250

    if passing and event_days < MIN_EVENT_DAYS:
        verdict = "MARGINAL (insufficient calendar span)"
    elif passing:
        verdict = "PASS"
    elif not eligible:
        verdict = "INSUFFICIENT DATA"
    elif marginal:
        verdict = "MARGINAL"
    else:
        verdict = "FAIL"

    out = Path(__file__).resolve().parents[1] / "reports"
    out.mkdir(exist_ok=True)
    path = out / "a1_results.md"

    lines = [
        "# Phase A1.3 — conditional return analysis",
        "",
        f"Generated {datetime.now(tz=timezone.utc).isoformat(timespec='seconds')}",
        "",
        f"**Verdict: {verdict}**",
        "",
        f"- raw (article, ticker, horizon) rows: {len(rows)}",
        f"- independent observations after (symbol, day) clustering: {sum(len(v) for v in buckets.values())}",
        f"- buckets: {len(results)} ({len(eligible)} with N >= {MIN_N_FOR_GATE})",
        f"- distinct event days: {event_days} "
        f"(~{event_days // 5} non-overlapping 5-day windows) — "
        f"{'BELOW' if event_days < MIN_EVENT_DAYS else 'meets'} "
        f"the {MIN_EVENT_DAYS}-day minimum",
        f"- gate: |t| > {GATE_T} and N > {MIN_N_FOR_GATE}, surviving Benjamini-Hochberg at 5%,",
        "  and NOT reproduced by the placebo",
        "",
        "## Placebo (random non-event days, same symbols, same window)",
        "",
        "| horizon | N | mean excess |",
        "|---|---|---|",
    ] + [
        f"| {h} | {len(v)} | {mean(v)*100:+.3f}% |" for h, v in sorted(placebo.items())
    ] + [
        "",
        "If a bucket's effect matches its placebo row in sign and magnitude, the",
        "effect belongs to the universe and window rather than to the news.",
        "",
    ]

    if not eligible:
        lines += [
            "## Not enough data yet",
            "",
            "No bucket reaches the minimum sample size, so no statistical claim is",
            "possible in either direction. This is expected: Pulse's 30-day article",
            "purge destroyed most of the history, and `articles_archive` (migration",
            "v54) only began accumulating recently. The corpus needs months to",
            "rebuild before this gate can be evaluated honestly.",
            "",
            "Treat every number below as descriptive, not evidential.",
            "",
        ]

    lines += [
        "## Buckets",
        "",
        "| horizon | urgency | mention | subset | N (clustered) | raw rows | mean excess | sd | t | p | BH sig |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in sorted(results, key=lambda x: -abs(x["t"])):
        flag = "yes" if r.get("bh_significant") else ("—" if r["n"] >= MIN_N_FOR_GATE else "n/a")
        warn = "" if r["n"] >= MIN_N_FOR_GATE else " ⚠"
        lines.append(
            f"| {r['horizon']} | {r['urgency']} | {r['strength']} | {r['subset']} | "
            f"{r['n']}{warn} | {r['raw']} | {r['mean']*100:+.3f}% | {r['sd']*100:.3f}% | "
            f"{r['t']:+.2f} | {r['p']:.3f} | {flag} |"
        )

    lines += [
        "",
        "⚠ = below the minimum sample size; excluded from the gate and from the",
        "multiple-testing correction.",
        "",
        "## Reading this",
        "",
        "- **Excess return** is ticker minus sector-ETF (SPY where sector is",
        "  unknown). Raw returns would largely measure beta, since news arrival",
        "  correlates with market-wide volatility.",
        "- **subset=first** restricts to first-mentions (A1.4). If novelty carries",
        "  the signal, first-mention t-statistics should exceed the `all` row for",
        "  the same bucket. If they don't, repeat coverage was inflating N rather",
        "  than adding information.",
        "- **Urgency buckets are 1 / 3 / 5**, not the brief's 1-2 / 3 / 4 / 5.",
        "  urgencyScorer only emits those three values; 2 and 4 arrive solely via",
        "  AI promotion and account for ~0.3% of scored articles.",
        "- **BH sig** is what matters. A raw |t| > 2.5 in one of dozens of buckets",
        "  is unremarkable — roughly one in twenty clears p<0.05 by chance alone.",
        "",
    ]

    path.write_text("\n".join(lines))
    print(f"verdict: {verdict}")
    print(f"observations: {len(rows)} · buckets: {len(results)} · eligible: {len(eligible)}")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
