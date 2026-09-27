Send Mon Sep 28, 9-11am PT, as a reply in Jeremy's thread ("Thanks for the intro to Charlotte"). Attach WRITEUP_2026-09-27.md (or link a doc of it). Before sending: commit bench/ + results*.csv in the Pulse repo; fill or drop the spend line in the write-up.

---

Hey Jeremy,

Cold-start results, with a twist. I put the HF cache and vLLM's compile caches on a network volume (EUR-IS-1, worker-vllm 2.27.2) and ran four cold starts across an A100 and an H100. All four came in at 138–144 s container-to-healthy with the weights re-downloaded and torch.compile run in full every time, and vLLM reported the checkpoint filesystem as OVERLAY even with HF_HOME on the volume. Afterwards the volume listed 0 objects over the S3 API, so /runpod-volume in those workers was never the attached volume. Logs and the listing are in the write-up. Is that a known state for Serverless in that DC?

The Qwen comparison held (8B beats 32B on cost and agreement), but the more interesting column is DeepSeek V4.1 Flash via API: same cost as my cheapest self-hosted config, $0.03 per 1k articles, 98% within a point of Haiku vs the 8B's 90%, and no cold start. Kimi K3 is Sonnet-level on quality but Sonnet-priced at OpenRouter list ($1.95 per 1k); curious what rate you're seeing for it.

Also measured: the /openai/v1 route adds ~0.7 s to first token over runsync on the same worker, and it doesn't absorb a 100-stream burst (TTFT p50 64 s while the GPU sat at 8 ms TPOT). Details and the friction entries are in the attached.

Ashwin
