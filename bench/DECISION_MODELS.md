# Decision models on Pulse's urgency scoring: Jev vs Clef-flash vs Typical

Oct 13, 2026. Same harness as the Sept LLM comparison (`bench/quality.py`), same 50 frozen articles (25 finance, 25 general), same reference: `claude-haiku-4-5-20251001`'s score on each article. Task: urgency 1–5; "urgent" = score ≥ 4, Pulse's notification threshold (9 of the 50 are urgent per Haiku). Rows, probabilities and timings are in `bench/quality.csv`; the table is `bench/quality_summary.md`.

## Results (against Haiku, n = 50)

| model | decoder | exact | within 1 | MAE | urgent P | urgent R | p50 ms | p99 ms | $/1,000 |
|---|---|---|---|---|---|---|---|---|---|
| Jev 1.13.0 (TypeSafe API) | argmax | 70% | 98% | 0.32 | 60% | 33% | 233 | 1278 | $0.03 |
| Jev 1.13.0 | expected | **76%** | 94% | **0.30** | 100% | 22% | 233 | 1278 | $0.03 |
| Clef-flash (Workers AI) | argmax | 46% | **100%** | 0.54 | 80% | 44% | 481 | 1961 | $0.05 |
| Clef-flash | expected | 40% | 98% | 0.62 | 75% | 33% | 481 | 1961 | $0.05 |
| Typical-medium (self-hosted, RTX 4090) | argmax | 58% | 90% | 0.54 | 50% | **100%** | 512 | 1728 | ~$0.11¹ |
| Typical-medium | expected | 32% | 90% | 0.78 | 86% | 67% | 512 | 1728 | ~$0.11¹ |
| *qwen3-8b bf16 on Runpod Serverless (Sept)* | text | 46% | 90% | 0.64 | 64% | 78% | 1611 | 2195 | $0.57 |
| *claude-sonnet-4-6 (Sept)* | text | 76% | 100% | 0.24 | 100% | 67% | 1788 | 3327 | $2.09 |

¹ 0.59 s of GPU time per call, sequential and unbatched, at a $0.69/hr 4090; the SDK has no batch API, so this is an upper bound.

What it says:

- **Jev is the closest to Haiku on the score itself** — 76% exact, MAE 0.30, level with Sonnet — at 233 ms and $0.03 per 1,000. But it under-calls urgency: of the 9 articles Haiku rated ≥ 4, Jev's expected-value decoder flags 2 (both correct); argmax flags 5, 3 of them correct.
- **Typical is the opposite operating point.** Argmax catches all 9 urgent articles and flags 9 false alarms (precision 50%). It also never produced a 1 or a 3 in 50 calls — its score head's mass sits on positions 2 and 4 — so its exact agreement is mostly "2 when Haiku said 1–3".
- **Clef-flash is never more than one point off Haiku** (within-1 = 100%) but exact agreement is 46%, same as the 8B LLM; it misses 5 of 9 urgent.
- All three beat the qwen3-8b Serverless row on MAE and latency (3–7× faster; 5–19× cheaper per call than that row's per-GPU-hour Serverless cost).
- For Pulse's actual use (should this article trigger a notification?) none of the three matches Haiku: Jev misses urgent news, Typical doubles the alerts. If the cost of a missed alert dominates, Typical; if false alarms do, Jev; Haiku stays the reference.

## Abstain

Typical is the only one of the three with an abstain signal (`p_null`, a separate head outside the option softmax). On this task it never fires: the maximum `p_null` across the 50 articles is 0.00014. That's expected — every article has *some* urgency, so "none of the levels apply" is never true on a forced 1–5 scale. Abstain would matter on a task with a real out-of-scope class (support triage, intent detection); it isn't evidence either way here. Jev and Clef have no abstain; the usual workaround is adding an `other` option or thresholding confidence, neither of which was done here.

## Method

- Wire format: all three take the SystemOne `{state, questions}` body with one `score` question whose criteria are the five levels `"1".."5"` (bare, so the decision models get exactly the level definitions the LLM rows got, i.e. none). `instructions` = the same scorer brief the LLMs received as a system prompt (finance: the 75-ticker holdings list and criteria; general: the topics criteria), minus the "respond in JSON" sentence. `state` = `Headline: …\nSummary: …`, byte-identical to the LLM runs.
- Jev and Clef-flash took that body as is (Clef via Workers AI's run route for `@cf/cloudflare/clef-flash`). Typical has no `instructions` field — its question is a short suffix after a prefilled state — and with the 730-token brief passed as the question it returned the same distribution for every article. So for Typical the brief is prepended to the state and the question is one line ("Given the brief above, how urgent is this news item?"). This is the one place the three inputs differ; it's recorded per row (`extra.shape`).
- Decoders: `argmax` = the level with the highest probability; `expected` = round(Σ level × p). Both are shown because they disagree on which model looks best. The LLM rows emit an integer directly.
- A `--levels described` variant (one-line gloss per level) was probed on Typical and did not change the flat-distribution problem; it was not run on the full set.
- Latency is client-side wall time from a Mac in Indiana: Jev and Clef include the WAN hop, Typical includes Runpod's HTTP proxy to the pod. Cold starts and model load are excluded.
- n = 50 and the reference is Haiku, not human labels: "correct" means "agrees with Haiku". The exact-agreement differences between Jev (76%) and Sonnet (76%) are not distinguishable; the urgent-recall differences (22% vs 100%) are, but with 9 positives one article moves recall by 11 points, and Jev-EV's 100% precision is 2 flagged articles.
- The 50 articles are not a random sample of Pulse's feed. The fixture takes articles Pulse's keyword scorer rated exactly 3 (the ambiguous middle, which is what the AI refinement pass sees), with a summary of at least 80 characters, from the 30 days before Sept 23, split 25 finance / 25 general. Easy 1s and 5s are under-represented by design.
- Two choices were made after looking at these same articles: Typical's input shape (brief in the state) was picked after the first 3-article probe came back flat, and the expected-value decoder was added after seeing Typical's full-set score distribution. Nothing was tuned per model beyond that, but there is no held-out set, so treat the decoder comparison as descriptive. The expected-value decoder also assumes the five levels are equally spaced.
- With 50 calls the p99 column is effectively the slowest retained call. No call in the three decision-model runs was excluded as an outlier. $/1,000 is from list prices (Jev: TypeSafe's $0.042/M; Clef: $0.09/M as listed on OpenRouter, same as Cloudflare's), not billed amounts.
- Versions: `jev-1.13.0` pinned; Clef-flash as served on Workers AI on Oct 13; `typical-ai` 0.1.1 with `OzLabs/typical-medium` (`best.pt`), transformers 5.19.0, torch 2.14.1+cu126, bf16.

## Reproduce

Branch `bench/decision-backends` in github.com/ashwinsreedhar28/Pulse. `python bench/quality.py run --backend {jev,clef,typical} --model …` with `TYPESAFE_API_KEY`, `CF_ACCOUNT_ID`+`CF_API_TOKEN`, or `TYPICAL_URL` pointing at `bench/typical_shim.py` on a GPU pod; then `python bench/quality.py report`.
