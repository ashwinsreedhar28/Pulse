# Pulse on Runpod Serverless: what I built, what I measured

Ashwin Sreedhar, 2026-09-23. Draft. Numbers from bench/REPORT.md, raw rows in results*.csv and bench/quality.csv, 32-entry friction log in bench/friction_log.md.

## What I built

Pulse is a local-first macOS app (Electron, TypeScript, SQLite, ~50K lines) that ingests news feeds and SEC filings and scores each article for urgency. Scoring is keyword-first; ambiguous articles (score 3) go to an LLM for a 1 to 5 refinement. Today that call goes to Ollama on my M1 Pro, model mistral:7b.

I added Runpod Serverless as a third scoring backend behind the existing router, with the same input and output contract as the Ollama path, a 20 s timeout, and a health check that fires an async warm-up job and falls back to Ollama when no worker is live. The endpoint is worker-vllm v2.27.1 (vLLM 0.28.0) serving qwen/qwen3-8b in bf16, deployed from the Hub, scale-to-zero, max workers 1.

Benchmark harness: cold and warm latency across idle cycles, batched throughput at concurrency 8/32/64, and a 50-article quality comparison against Claude Haiku 4.5 as the reference, with Sonnet 4.6, local qwen3:8b, local mistral:7b, and the Runpod endpoint as the other columns.

In Pulse itself, the cold path works as designed: with the endpoint cold, score-3 articles went to Ollama with no stall and one warm-up job was queued. That warm-up then sat in the queue for 9+ minutes on a placement that never started, so I haven't yet seen Pulse write a Runpod-scored row.

Spend for the day: $0.77 of the $40.

## The numbers

Cold start, request enqueued to worker pickup, 8 clean samples: 171 to 311 s. Of that, 150 to 224 s is vLLM startup inside the container (download 17 to 38 s, torch.compile 24 to 43 s, CUDA graph capture 6 s on an RTX 4090 and A40 but 75 to 81 s on the cheaper 24 GB card), and 10 to 88 s is Runpod placing the worker before the container exists. Local Ollama's equivalent, loading the model after idle, is 8.5 s.

Warm, single request, 64 output tokens: 2.9 s on the $0.69/hr 24 GB tier (21 tok/s), 2.1 s on an A40 (31 tok/s), 1.24 s on an RTX 4090 (51 tok/s). Local M1 Pro: 3.0 s. Queue overhead on a warm worker is 15 to 35 ms.

Batched, one A40 at $1.22/hr, real 615-token prompt, 200 articles: 2.98 articles/s at concurrency 8, 5.5 articles/s at 32 and 64. That is $0.11 per 1,000 articles at c8 and $0.061 at c32. The ceiling at c64 is worker-vllm's MAX_CONCURRENCY default of 30, not the GPU; vLLM's KV cache was at 3% usage. All 800 batched responses parsed as JSON once max_tokens was 128 and the prompt asked for a one-sentence reason.

Parked workers: after a job, Runpod stops and removes the container within the 5 s idle timeout but keeps the worker slot on the host, unbilled. Three requests that arrived within 4 minutes of the last job got a 500 to 850 ms pickup. Two requests after a 5 minute idle paid a full restart (243 s, 258 s). Same worker ID each time, fresh container each time, weights re-downloaded each time. The clearest case: one 32B worker on one host, FlashBoot on, restarted 3 minutes after its last job and ran the full 178 s startup again (download, compile, graph capture) with no restore in the log. I'd like to know whether FlashBoot applies to worker-vllm endpoints at all.

Quality, 50 real score-3 articles, agreement with Haiku 4.5: Sonnet 4.6 within one point on 100%, urgent precision/recall 100%/67%, $2.09 per 1,000. Local qwen3:8b: within one on 90%, urgent P/R 58%/78%, free. Local mistral:7b, what Pulse ships: within one on 92% but urgent P/R 20%/11%, answers 3 on 26 of 50 articles. Haiku itself is $0.74 per 1,000 at these prompt sizes. Runpod qwen3-8b bf16 on the A40: within one on 90%, urgent P/R 64%/78%, identical scores sequential and at concurrency 8; warm 1.6 s p50 per call at real prompt sizes, $0.57 per 1,000 sequential and $0.13 at c8. bf16 and Q4 of the same model agree on 80% exact and 100% within one, so quantization moves scores about as much as the Sonnet-vs-Haiku gap does. The two Claude models disagree on 24% of articles, so exact-match gaps under that are noise.

Qwen3-32B-AWQ on the same tier: 2.10 articles/s at c32 uncached, $0.16 per 1,000, prefill-bound (1,600 prompt tok/s, 12 generated tok/s with 30 in flight). With prefix caching on (hit rate 90-93%): 8.20 articles/s, $0.041 per 1,000, cheaper per article than the uncached 8B. It did not score better: within one point of Haiku on 86% vs the 8B's 90%, urgent precision 42% vs 64%. On 9 urgent articles that is 2 or 3 articles, and Haiku and Sonnet disagree with each other on 24%, so the fair conclusion is that model size isn't the lever for this task; the prompt and inputs are. The 8B with prefix caching on (hit rate 93-97%) is the cheapest configuration I measured: 10.5 to 16.3 articles/s at concurrency 32 to 64, $0.021 to $0.032 per 1,000, against Haiku's $0.74. On the 8B, prefix caching showed no measurable effect: 3.06 articles/s at c8 with it on versus 2.98 and 2.94 with it off, same GPU class. The engine reported a 0.0% hit rate on the worker that had the setting, and I could not read its startup flags (no container log), so I can't say whether the toggle reached vLLM. Either way the call is decode-bound: prefill was about 0.2 s of a 1.5 s call.

## Friction

Full log has 32 entries. The ones that cost time:

- Placement hangs. 6 of 12 placements after 14:00 never produced a container: "image ready, initializing model files" in the system log, then nothing, for 17 to 26 minutes, while the console showed the worker as initializing or even running. One surfaced the cause: "error creating container: cant create container; network must exist", retried every 4 s. Seen on PRO 6000 MIG slices in US-PA-1 and US-WA-1, and on a whole 4090 in EUR-NO-1 and an A40 in EU-SE-1. Terminate was ignored on three of them; only a config change (new release) retired them. A queued job waits behind a hung worker indefinitely.
- The 24 GB tier is a pool (L4-class, RTX 3090-class, PRO 6000 MIG slices) with no way to pick or exclude a model, and the fallback tier is used for re-parking after eviction, not just for capacity. US-PA-1, where five hung workers landed, is not in the Data Centers filter list, so it cannot be excluded.
- The Hub form saved my lowercase model name; vLLM serves it case-sensitively; the overview page displays it normalized. One 311 s cold start produced a 404.
- The pricing page shows active-worker rates without saying so; the console shows flex rates. $0.49 vs $0.69.
- HF_TOKEN set from Secrets as {{ RUNPOD_SECRET_HF_TOKEN }} shows in the release diff but the next container still logged "unauthenticated requests to the HF Hub". Enable Prefix Caching shows true in its release and the engine reported a 0.0% hit rate. Two console settings whose effect I could not confirm from inside the container.
- "Max Parallel Loading Workers" is exposed in the console and ignored by vLLM 0.28.
- /health reports a parked worker (container already removed) as idle and ready. A request behind that report took 168 s. The health-gated warm-up I wrote on the strength of /health would never have fired.
- Container logs were empty in the console for one running worker, and the endpoint log export caps at 500 lines.

## Conclusions

1. For Pulse's workload the cost is wakes, not tokens. Batched scoring is $0.06 to $0.11 per 1,000 articles, but a cold start is about 3 minutes of worker time, $0.06 on the A40, which buys 500 to 1,000 articles. A 5-minute poll loop that wakes a cold endpoint every time would cost about $17/day; an always-on worker is $11.76/day. The serverless-shaped answer is to batch score-3 articles and wake the endpoint a few times a day, and Pulse's poll loop needs that change before Runpod replaces Ollama for it.

2. Placement reliability, not startup time, was the limiting factor today. When a worker starts, the numbers are good and consistent. Half the placements after 14:00 did not start, and the console gave no timeout, no reason, and no working terminate. A network volume would fix the re-download and pin the data center; it would not fix a host that cannot create a container.

Also from the quality run, unrelated to Runpod: mistral:7b is a near no-op as Pulse's refiner, and an empty geo-interest list is generating false urgents on general news. Both are Pulse bugs I would not have found without the harness.
