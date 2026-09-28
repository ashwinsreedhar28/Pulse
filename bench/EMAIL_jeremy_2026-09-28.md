Send Mon Sep 28, 9-11am PT, as a reply in Jeremy's thread ("Thanks for the intro to Charlotte"). Write-up is the Google Doc linked in the body; share it with Jeremy (viewer) before sending. Before sending: commit bench/ + results*.csv in the Pulse repo; (write-up has no spend line; nothing to fill).

---

Hey Jeremy,

Hope you had a good weekend! Here are the cold-start results you asked about, with a twist. I put the HF cache and vLLM's compile caches on a network volume (EUR-IS-1, worker-vllm 2.27.2) and ran four cold starts across an A100 and an H100. All four came in at 138–144 s container-to-healthy with the weights re-downloaded and torch.compile run in full every time. vLLM also reported the checkpoint filesystem as OVERLAY even with HF_HOME on the volume. Afterwards the volume listed 0 objects over the S3 API, so /runpod-volume in those workers appears not to have been the attached volume. Logs and the listing are in the write-up. Is there a step I'm missing to get a volume mounted on Serverless, or is that a known issue?

The Qwen comparison held (in these configs, 8B beats 32B on cost and agreement), but the more interesting column is DeepSeek V4.1 Flash via API: $0.03 per 1k articles, near the high end of the $0.021–0.032 range of my batched self-hosted config, 98% within a point of Haiku vs the 8B's 90%, and no cold start. Kimi K3 matched Sonnet closely on exact/within-1 agreement but was Sonnet-priced at the OpenRouter rates I tested ($1.95 per 1k); curious what rate you're seeing for it.

Also measured: on the same warm worker, the /openai/v1 streaming path showed ~400–500 ms more time to first token than runsync spent outside execution. And with one worker at MAX_CONCURRENCY=64, a 100-stream burst pushed TTFT p50 to 64 s while per-token latency stayed at 8 ms. Full numbers and setup are in the write-up: https://docs.google.com/document/d/1tAwhTOWoH6erZlaPVf5tFOanjTycJ08sr1ZLwYT0Kho/edit

Side note: the streaming load generator came from a from-scratch inference engine I've been building and benchmarking against vLLM. It's on Serverless too; with the weights baked into the image and the image already cached on the host, a 7B goes container-to-healthy in 12–16 s. I'll send that separately.

Ashwin
