Send Mon Sep 28, 9-11am PT, as a reply in Jeremy's thread ("Thanks for the intro to Charlotte"). Attach WRITEUP_2026-09-27.md (or link a doc of it). Before sending: commit bench/ + results*.csv in the Pulse repo; (write-up has no spend line; nothing to fill).

---

Hey Jeremy,

Cold-start results, with a twist. I put the HF cache and vLLM's compile caches on a network volume (EUR-IS-1, worker-vllm 2.27.2) and ran four cold starts across an A100 and an H100. All four came in at 138–144 s container-to-healthy with the weights re-downloaded and torch.compile run in full every time, and vLLM reported the checkpoint filesystem as OVERLAY even with HF_HOME on the volume. Afterwards the volume listed 0 objects over the S3 API, so /runpod-volume in those workers was never the attached volume. Logs and the listing are in the write-up. Is there a step I'm missing to get a volume mounted on Serverless, or is that a known issue?

The Qwen comparison held (8B beats 32B on cost and agreement), but the more interesting column is DeepSeek V4.1 Flash via API: same cost as my cheapest self-hosted config, $0.03 per 1k articles, 98% within a point of Haiku vs the 8B's 90%, and no cold start. Kimi K3 is Sonnet-level on quality but Sonnet-priced at OpenRouter list ($1.95 per 1k); curious what rate you're seeing for it.

Also measured: on the same warm worker, the /openai/v1 streaming route took ~770 ms to first token where runsync's whole round trip outside execution was ~300 ms, so the route adds about half a second. It also doesn't absorb a 100-stream burst: TTFT p50 64 s while per-token latency stayed at 8 ms. Details and the friction entries are in the attached.

Side note: the streaming numbers came from the load generator of something I've been building since Friday, a from-scratch inference engine (paged KV cache, continuous batching, CUDA graphs) that I've been benchmarking against vLLM on Runpod pods. It's on Serverless now too, and with the weights baked into the image a 7B cold-starts in about 25 s once the image is on the host. I'll send that separately.

Ashwin
