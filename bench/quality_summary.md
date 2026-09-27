# Quality harness summary

Generated 2026-09-27T21:24:38+00:00. Reference: `claude-haiku-4-5-20251001`, 50 scored articles. Source: `bench/quality.csv`, `bench/quality_batches.csv`.

Agreement is against the reference model's score on the same article. "Urgent" is score >= 4, Pulse's notification threshold; precision/recall treat the reference as truth. Parse failures are excluded from agreement and reported separately.

| backend | model | label | c | n | parse ok | exact | within 1 | MAE | urgent P | urgent R | fin exact | gen exact | wall p50 ms | wall p99 ms | in tok | out tok | $/1,000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| claude | claude-haiku-4-5-20251001 |  | 1 | 50 | 50/50 | 100% | 100% | 0.00 | 100% | 100% | 100% | 100% | 1127 | 2486 | 520 | 44 | $0.74 |
| claude | claude-sonnet-4-6 |  | 1 | 50 | 50/50 | 76% | 100% | 0.24 | 100% | 67% | 72% | 80% | 1788 | 3327 | 521 | 35 | $2.09 |
| ollama | mistral:7b |  | 1 | 50 | 50/50 | 28% | 92% | 0.80 | 20% | 11% | 40% | 16% | 1465 | 6583 | 507 | 28 | $0 marginal |
| ollama | qwen3:8b |  | 1 | 50 | 50/50 | 38% | 90% | 0.72 | 58% | 78% | 56% | 20% | 1555 | 10364 | 460 | 25 | $0 marginal |
| openrouter | deepseek/deepseek-v4.1-flash |  | 1 | 50 | 16/50 | 75% | 94% | 0.31 | 50% | 100% | 71% | 78% | 1575 | 12715 | 465 | 121 | $0.09 |
| openrouter | deepseek/deepseek-v4.1-flash | reasoning-off | 1 | 50 | 50/50 | 52% | 98% | 0.50 | 75% | 67% | 56% | 48% | 979 | 4806 | 440 | 28 | $0.03 |
| openrouter | moonshotai/kimi-k3 |  | 1 | 50 | 23/50 | 83% | 100% | 0.17 | 100% | 100% | 85% | 80% | 1350 | 5654 | 583 | 77 | - |
| openrouter | moonshotai/kimi-k3 | reasoning-off | 1 | 50 | 50/50 | 76% | 98% | 0.26 | 82% | 100% | 84% | 68% | 1408 | 5327 | 463 | 35 | $1.95 | (excluded 2 call(s) >10x median: [16413, 16818] ms, $0.0021)
| runpod | qwen/qwen3-32b-awq | q32awq-prefix | 1 | 50 | 50/50 | 38% | 86% | 0.76 | 42% | 56% | 48% | 28% | 1710 | 2277 | 456 | 27 | $0.59 | (excluded 1 call(s) >10x median: [186288] ms, $0.0631)
| runpod | qwen/qwen3-32b-awq | q32awq-prefix | 8 | 50 | 50/50 | 38% | 86% | 0.76 | 42% | 56% | 48% | 28% | 2096 | 6869 | 456 | 27 | $0.12 |
| runpod | qwen/qwen3-8b | prefixcache-on | 1 | 50 | 50/50 | 46% | 90% | 0.64 | 64% | 78% | 64% | 28% | 1611 | 2195 | 456 | 26 | $0.57 | (excluded 1 call(s) >10x median: [168219] ms, $0.0570)
| runpod | qwen/qwen3-8b | prefixcache-on | 8 | 50 | 50/50 | 46% | 90% | 0.64 | 64% | 78% | 64% | 28% | 2235 | 7005 | 456 | 26 | $0.13 |

## Local timing split (Ollama)

Prefill is `prompt_eval_duration`, decode is `eval_duration`, both from Ollama's response. `≈` marks rows recorded before prefill was captured directly (total - load - eval). Medians; tok/s are per-call medians. Ollama reuses the KV cache for a matching prompt prefix across requests, so a shared system prompt is prefilled once per model load; if prefill barely moves between the finance and general rows despite the token gap, that cache is why. Prefill tok/s below counts all prompt tokens, cached or not.

| model | domain | n | in tok | prefill p50 ms | decode p50 ms | prefill share | prefill tok/s | decode tok/s | max load ms |
|---|---|---|---|---|---|---|---|---|---|
| mistral:7b | all | 50 | 526 | 391 | 1002 | 28% | 651 | 26.7 | 2252 |
| mistral:7b | finance | 25 | 805 | 401 | 1131 | 26% | 2020 | 26.5 | 2252 |
| mistral:7b | general | 25 | 177 | 308 | 957 | 24% | 561 | 26.9 | 59 |
| qwen3:8b | all | 50 | 476 | 401 | 1015 | 28% | 637 | 24.7 | 6312 |
| qwen3:8b | finance | 25 | 713 | 407 | 1060 | 28% | 1752 | 24.6 | 6312 |
| qwen3:8b | general | 25 | 179 | 395 | 965 | 29% | 489 | 24.9 | 291 |

Reference urgent (>=4) articles: 9 of 50.

Notes:
- Ollama rows run at temperature 0; Pulse's production Ollama scoring sends no temperature (Ollama default), so production is sampled, not greedy.
- Ollama models are Q4_K_M; the Runpod model is bf16. Same weights, different quantization.
- Runpod $/1,000 uses measured wall time at the GPU hourly rate given per run (sequential rows) or the batch wall time (concurrent runs). Cold starts appear as excluded outliers above and are costed separately in REPORT.md.
- Token prices come from the rate flags on each run (see rate_source in the CSV).

## Batches

| batch | backend | model | label | gpu | worker | c | n | ok | parse ok | wall ms | served model | workers before | est $ | note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5335d1cd | ollama | qwen3:8b |  |  |  | 1 | 50 | 50 | 50 | 184888 |  |  |  |  |
| 63c51015 | ollama | mistral:7b |  |  |  | 1 | 50 | 50 | 50 | 98563 |  |  |  |  |
| 5e3d5f75 | claude | claude-haiku-4-5-20251001 |  |  |  | 1 | 50 | 50 | 50 | 59943 |  |  | 0.036969 |  |
| 6267ceb2 | claude | claude-sonnet-4-6 |  |  |  | 1 | 50 | 50 | 50 | 91994 |  |  | 0.104397 |  |
| 4277b657 | ollama | qwen3:8b |  |  |  | 1 | 50 | 50 | 50 | 88324 |  |  |  |  |
| da13f3ee | ollama | mistral:7b |  |  |  | 1 | 50 | 50 | 50 | 81272 |  |  |  |  |
| 48326694 | runpod | qwen/qwen3-8b | prefixcache-on | A40 | 75bvekk819begd | 1 | 50 | 50 | 50 | 251071 | qwen/qwen3-8b | {"idle": 1, "initializing": 0, "ready": 1, "running": 0, "throttled": 0, "unhealthy": 0} | 0.085085 | engine reported Prefix cache hit rate 0.0% during the batch; flag application unconfirmed |
| bd5bda1c | runpod | qwen/qwen3-8b | prefixcache-on | A40 | 75bvekk819begd | 8 | 50 | 50 | 50 | 19767 | qwen/qwen3-8b | {"idle": 0, "initializing": 0, "ready": 0, "running": 1, "throttled": 0, "unhealthy": 0} | 0.006699 | engine reported Prefix cache hit rate 0.0% during the batch; flag application unconfirmed |
| 4aba2695 | runpod | qwen/qwen3-32b-awq | q32awq-prefix | RTX A6000 | kij4m5wjnzi9in | 1 | 50 | 50 | 50 | 272018 | qwen/qwen3-32b-awq | {"idle": 1, "initializing": 0, "ready": 1, "running": 0, "throttled": 0, "unhealthy": 0} | 0.092184 | prefix caching on and verified: engine hit rate 90-93%; endpoint idle timeout was 5 s at batch time |
| a4a6642e | runpod | qwen/qwen3-32b-awq | q32awq-prefix | RTX A6000 | kij4m5wjnzi9in | 8 | 50 | 50 | 50 | 17826 | qwen/qwen3-32b-awq | {"idle": 0, "initializing": 0, "ready": 0, "running": 1, "throttled": 0, "unhealthy": 0} | 0.006041 | prefix caching on and verified: engine hit rate 90-93%; endpoint idle timeout was 5 s at batch time |
| ee57a1ea | openrouter | deepseek/deepseek-v4.1-flash |  |  |  | 1 | 50 | 50 | 16 | 97465 | deepseek/deepseek-v4.1-flash |  | 0.004441 |  |
| f8c01662 | openrouter | moonshotai/kimi-k3 |  |  |  | 1 | 50 | 33 | 23 | 67851 | moonshotai/kimi-k3 |  | 0.095865 |  |
| ecd7d2ad | openrouter | deepseek/deepseek-v4.1-flash | reasoning-off |  |  | 1 | 50 | 50 | 50 | 52533 | deepseek/deepseek-v4.1-flash |  | 0.001607 |  |
| 9a0ac311 | openrouter | moonshotai/kimi-k3 | reasoning-off |  |  | 1 | 50 | 50 | 50 | 160376 | moonshotai/kimi-k3 |  | 0.095736 |  |
