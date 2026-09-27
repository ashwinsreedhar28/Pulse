# Pulse on Runpod Serverless: running report

Last updated 2026-09-23 16:52 EDT. Raw data: `results.csv` (repo root, written by `bench/coldstart.py`), worker logs and script output in `bench/logs/`.

## Setup

- Endpoint `4ib59mjp0vgaao`, queue-based, deployed from Hub template worker-vllm v2.27.1 (vLLM 0.28.0, serverless worker 1.12.0)
- GPU tiers: "24 GB" $0.69/hr flex (runs 1-5: model not captured, 21 tok/s is consistent with an L4; then PRO 6000 MIG 24GB slices in US-PA-1/US-WA-1 that never started, friction #17/#19); "24 GB PRO" $1.10/hr flex (run 6: RTX 4090, US-NC-1). Priority flipped to 24 GB PRO first at 14:41. Per-placement log: logs/gpu_per_cycle.txt
- Model `qwen/qwen3-8b` (served name is lowercase, see friction #4), bf16, `MAX_MODEL_LEN` 4096, GPU mem util 0.95, prefix caching off, no network volume, no HF token
- Workers: active 0, max 1 (raised to 2 at 14:45 to get past a ghost worker). Idle timeout 5 s; workers park unbilled well past it
- Prompt: Pulse's finance urgency-scoring system prompt with 3 tickers + one headline/summary, 140 prompt tokens (the real Pulse prompt carries 75 active tickers, ~600 tokens, per CC's read of the watchlist; cost model below is 4x low for token-priced backends until the harness measures it), `max_tokens` 64, temperature 0, `chat_template_kwargs.enable_thinking=false` via worker-vllm's generic route proxy
- Spend: $0.11 at 13:59; $0.18 at 14:48; $0.77 at 16:47 (balance $39.23) after 12 bench runs + CC's 2 Runpod batches. Idle time past the 5 s timeout and the ~60 min of hung workers were not billed

## Numbers

| Metric | Value | Source |
|---|---|---|
| Cold start 1 (first ever; image pull; request 404'd) | 311.2 s delayTime | results.csv row 1, run1 log |
| Cold start 2 (image cached on host) | 233.9 s delayTime | results.csv row 2, run2 log |
| Cold start 3 (endpoint throttled, placement retried) | 310.5 s delayTime | run 4, run4 log |
| Runpod-side placement before container start | ~10 s (run 2), ~82 s (run 4) | delayTime minus (pickup - first container log) |
| Container start to vLLM healthy | 220/224 s on the L4-class (runs 2, 4); 170 s on the RTX 4090 (run 6 c1); 151 s on the A40 (run 7) | worker logs; the gap is CUDA graph capture: 75-81 s with stalls on the L4-class vs 6 s (4090) and 9 s (A40) |
| Cold start 7, A40, Canada, host had weights pre-staged | 177.5 s (26 s placement + 151 s startup) | run 7 |
| Cold start 8, A40, fresh | 171.1 s | run 8 warm-up |
| Batched throughput, 1 A40, concurrency 8, 615-token prompts, 128 max_tokens | 2.98 articles/s; exec p50 1,573 ms; 200/200 parsed; 27 completion tokens/article | run 8 |
| Batched cost per 1,000 articles, A40 $1.22/hr | c8: $0.114 (run 8), $0.115 (run 9 replicate); c32: $0.061, 5.53 articles/s (run 10); c64: $0.061, 5.56 articles/s with delay p50 5.1 s = queued behind worker MAX_CONCURRENCY 30 (run 11). Ceiling at default worker config: ~5.5 articles/s per A40 | runs 8-11 |
| Prefix caching effect, c8 | ENABLE_PREFIX_CACHING=true in release #8, worker 75bvekk819begd on it: 3.06 articles/s, exec p50 1,906 ms (run 12) vs 2.98 / 2.94 articles/s, 1,573 / 1,833 ms with it off (runs 8, 9). No measurable effect. Engine reported 0.0% hit rate, so whether the flag reached vLLM is unconfirmed (friction #34) | run 12 |
| Cost of one wake (cold start ~3 min of worker time) | ~$0.06 on the A40 tier, i.e. ~500 batched articles' worth | derived |
| Warm delayTime | 15-35 ms, p50 18 | all warm rows, both GPUs |
| Warm executionTime, 24 GB tier ($0.69/hr, L4-class by throughput) | 2,843-2,956 ms, p50 2,893; 21 tok/s | 19 warm rows |
| Warm executionTime, RTX 4090 ($1.10/hr, US-NC-1) | 1,194-1,332 ms, p50 1,261; 51 tok/s | 15 warm rows, run 6 cycles 0-2 |
| Warm wall from Mac | 3,002-3,397 ms (24 GB tier), 1,315-2,092 ms (4090) | |
| Local M1 Pro 16 GB, Ollama qwen3:8b Q4_K_M, same prompt, 62 tokens | 2,965 ms total, 22.9 tok/s; cold (model load) 11,440 ms | curl, 14:22 |
| Cold start 4, placement-blocked (queued 14:42 behind hung MIG workers, 4090 placed ~14:48) | 476.7 s delayTime | run 6 cycle 0 |
| Cold start 5, 4090, includes a rollout | 258.0 s | run 6 cycle 1 |
| Cold start 6, 4090, clean (parked worker evicted during 5 min idle) | 243.0 s | run 6 cycle 2 |
| 4090-tier parked-worker hits after 5 min idle | 0 of 2 (run 6 stopped after cycle 2; cycle 3 never placed, friction #25) | run 6 |
| Placement failures (worker never produced a container) | 6 of 12 placements after 14:00: 4 MIG (US-PA-1, US-WA-1), 1 whole 4090 (EUR-NO-1); plus 1 4090 (US-CA-2) gone within a minute | logs/gpu_per_cycle.txt |
| Completion tokens per call | 64 of 64, finish_reason=length | run 4; JSON reason field truncated |
| Thinking mode | off (response starts with JSON) | run 4 text column |
| Parked-worker hits | run 3 (558 ms, 4 min idle), run 5 cycle 0 (502 ms, ~2 min idle, first exec 6,559 ms then 2,900) | see "Parked workers" |
| Cold-start attempts that never produced a worker | 4 MIG placements, 14:13-14:47, ~35 min lost | friction #17, #19, #20 |

### Parked workers (what FlashBoot looks like from outside)

Idle timeout is 5 s. After run 2 the worker stayed listed as idle/ready for 4+ min unbilled and answered run 3 in 558 ms with no startup log. Before run 4 the console showed a worker "initializing" with no request, then "throttled, no capacity". Reading: Runpod re-parks an idle worker on the host after jobs; if the host GPU is taken, the endpoint goes throttled and the next request pays a full start plus placement retry (run 4: 82 s of placement before the container even started). The 10-cycle test measures how often the parked worker survives a 5 min idle. Run 5 was abandoned after cycle 0 (four failed MIG placements); run 6 restarted on the 24 GB PRO tier at 14:42 with 9 cycles.

### vLLM startup breakdown (run 2 / run 4, 220 s / 224 s container start to healthy)

| Phase | s |
|---|---|
| Pre-flight, imports, engine init to "Loading model" | 47 |
| Weight download, 15.26 GiB from HF, unauthenticated | 28.4 / 30.5 (38.2 in run 1) |
| Load weights to GPU | 1.3 |
| torch.compile | 24.0 / 24.8 |
| FlashInfer autotune | 27.8 / 27.1 |
| CUDA graph capture, 51 piecewise + 35 full, two stalls | 75 / 81 |
| Server start, health, fitness checks (2.0 s) | ~17 |

The download is 13% of startup. Compile + autotune + graph capture is 58%. A network volume that also holds `VLLM_CACHE_ROOT` is the phase 2 experiment; a volume that only holds weights saves at most 28 s.

## Qwen3-32B-AWQ (endpoint 29fqxvabtskzb8, RTX A6000, 48 GB tier $1.22/hr)

| Metric | Value |
|---|---|
| Container start to healthy | 202 s (download 18 GiB 31.5 s; torch.compile 58.6 s; graph capture 19 s) |
| Warm single request, 64 tokens | exec 2,307-2,442 ms, ~27 tok/s |
| c8 | 1.77 articles/s, exec p50 3,928 ms, $0.191 per 1,000 |
| c32 | 2.10 articles/s, exec p50 12,029 ms, $0.161 per 1,000; prefill-bound (~1,300 prompt tok/s, 56 generated tok/s) |
| Format | ```json fences on the 3-ticker prompt (friction #38); 200/200 parsed with the one-sentence instruction |

32B is prefill-bound at concurrency where 8B was decode-bound. Prefix caching ON (verified: --enable-prefix-caching, hit rate 90-93%): c32 = 8.20 articles/s, exec p50 1,949 ms, **$0.041 per 1,000**, 3.9x the uncached 2.10 articles/s and cheaper per article than the uncached 8B ($0.061). HF_TOKEN halved the download (15.2 s vs 31.5 s).

Quality (CC, same 50-article fixture, prefix caching on): vs Haiku exact 38%, within-1 86%, urgent P/R 42/56% (flags 12 urgent vs Haiku's 9), vs 8B bf16 46% / 90% / 64 / 78%. 32B vs 8B: 46% exact, 94% within-1. Warm sequential p50 1,710 ms, $0.59 per 1,000; c8 168 articles/min, $0.12 per 1,000. Scores identical sequential vs c8 (50/50). Spend $0.098 incl. a 186 s cold first call behind /health idle 1, ready 1 (third instance, friction #33). Reading: 4x parameters did not improve agreement; differences are 2-3 articles on 9 urgent and the Haiku-vs-Sonnet reference gap is 24%, so model size is not the lever on this task at this sample size.

## Qwen3-8B with prefix caching (verified hit rate 93-97%), A40-class 48 GB tier $1.22/hr

| Run | Articles/s | exec p50 | $ per 1,000 |
|---|---|---|---|
| c32 | 12.84 | 1,055 ms | 0.026 |
| c32 replicate | 10.48 (some requests queued, delay p95 5.1 s) | 953 ms | 0.032 |
| c64 against the worker cap of 30 (MAX_CONCURRENCY change not yet applied) | 14.47 (199/200; 1 client-side DNS failure on the Mac) | 1,018 ms | 0.023 |
| c64 replicate, cap 64 set but not confirmed on the serving container | 16.26 | 1,007 ms | 0.021 |

Cheapest configuration measured: 8B + prefix caching, $0.021-0.032 per 1,000 articles (10.5-16.3 articles/s), 2x the uncached 8B, cheaper than cached 32B ($0.041), 23-32x cheaper than Haiku, on the model with better agreement.

## Cost model (to fill in)

- Sequential, 24 GB tier: 2.9 s/article x $0.69/3600 = $0.00056/article, $0.56 per 1,000. 4090 tier: 1.24 s x $1.10/3600 = $0.00038/article, $0.38 per 1,000. Faster GPU is cheaper per article despite the higher rate. Excludes cold start.
- Batched, measured on one A40: c8 = 2.98 articles/s, $0.114 per 1,000 (runs 8, 9); c32 = 5.53 articles/s, $0.061 per 1,000 (run 10); c64 = same, the worker's MAX_CONCURRENCY 30 caps it (run 11). Per-request time at c8 is decode-bound (27 tokens at ~31 tok/s), so prefix caching can save at most the ~0.2 s of prefill per request; concurrency is the lever.
- Quality harness (CC, bench/quality_summary.md, 50 articles, Haiku 4.5 as reference): Sonnet 4.6 within-1 100%, urgent P/R 100/67%, $2.09 per 1,000; Ollama qwen3:8b Q4 within-1 90%, P/R 58/78%, local; Ollama mistral:7b (what Pulse ships) within-1 92% but urgent P/R 20/11%, answers 3 on 26 of 50, effectively a no-op refiner; Haiku $0.74 per 1,000 at the real 520-token mean prompt (860 finance, 180 general). Local qwen3:8b, clean rerun: decode 24.6 tok/s, prefill ~0.4 s (Ollama caches the shared system-prompt prefix), ~1.5 s per call; the earlier 3.7 s figure was measured under contention.
- Runpod column (CC, worker 75bvekk819begd, A40, prefix caching on, verified): vs Haiku exact 46%, within-1 90%, urgent P/R 64/78%, identical sequential vs c8; warm sequential p50 1,611 ms, p99 2,195 ms, $0.57 per 1,000; c8 152 articles/min, $0.13 per 1,000; one cold call 168 s behind a /health report of idle 1, ready 1 (friction #33). bf16 vs Q4 of the same model: 80% exact, 100% within-1. Spend $0.09.
- Wake cost dominates at Pulse's cadence: a 5-minute poll that wakes a cold endpoint pays ~3 min x $1.22/hr = $0.06 per wake, ~500 articles' worth of batched scoring. 288 wakes/day would be ~$17/day; an always-on worker is $11.76/day at the active rate; batching score-3 articles into fewer wakes (hourly = 24 wakes, ~$1.50/day) is the only serverless-shaped answer.
- Claude Haiku 4.5 at ~600 in / ~64 out per article (real prompt, 75 tickers): fill in from the Anthropic price list at run time. Prefix caching on the Runpod side (vLLM Enable Prefix Caching) would skip most of that 600-token prefill per call; test on/off in the harness.
- DeepSeek V4.1 Flash via OpenRouter ($0.10/M in, $0.50/M out listed 2026-09-23; CC records the live rate at run time). Runpod's console offers DeepSeek only as self-host weights (friction #1); phase 4 estimate: 288 GB PRO at $10.65/hr, 10-20 min cold start = $1.80-3.50 before the first token.

## Open questions

1. Resolved: thinking is off. max_tokens 128 + the one-sentence suffix gives 200/200 parseable JSON at 27 completion tokens (run 8); coldstart.py keeps 64 for comparable latency.
2. Resolved: idle timeout is 5 s, but workers park unbilled past it. Script v3 uses fixed idle intervals.
3. Why `throttled: 1` on /health before any request? (Likely Runpod pre-parking a worker on a host with no free GPU; consistent with the parked-worker model.)
4. Resolved: the early workers were never confirmed as 3090s. 21 tok/s matches an L4, which is in the 24 GB tier. The tier label is the only thing the console shows before placement (friction #15).
5. Why do placements hang at "image ready, initializing model files"? Seen on 4 MIG slices (US-PA-1, US-WA-1) and 1 whole RTX 4090 (EUR-NO-1); one surfaced "cant create container; network must exist". Not MIG, not one DC. Hypothesis: unauthenticated HF download in the staging step (#9), rate-limited hosts stall with no timeout. Test: HF_TOKEN via Secrets. Ask Jeremy.
6. Zero active geo interests in this Pulse instance, so every general-domain article is scored with "none listed" (CC). Writeup line, not a Runpod finding.

## Next steps

See conversation; mirrored here as they're done.
