Send: same day as a reply if Jeremy asks about the engine after the Monday email; otherwise Thu Oct 1 as its own message in his thread. Before sending: release pagedserve v0.9.4 (KV-budget fix in both images), confirm the README's 7B Serverless row says 2,176 tok/s, rotate the Runpod + OpenRouter keys.

---

Hey Jeremy,

The engine I mentioned: github.com/ashwinsreedhar28/pagedserve. From-scratch LLM serving (paged KV cache, continuous batching, CUDA graphs, Triton kernels), 99% of vLLM on a 7B and parity on a 0.5B on an A100, with the fix-by-fix figure in the README.

The part relevant to you is that I deployed it on Serverless and measured the platform with it, since the engine is the same in every run:

- 7B cold start with the weights baked into the image: ~25 s on a host that has the image (12–16 s of it my worker booting), ~95 s on a fresh host (25 GB pull). worker-vllm's 8B was 138–144 s on the same GPU class, most of it the weight download plus torch.compile.
- FlashBoot resumed 1 of 6 terminated workers (0.85 s, no boot); the other five paid a full boot. Matches what I saw with worker-vllm last week.
- Queue endpoints: each yield pays a platform round trip (~9 tok/s per stream until yields are coalesced), the gateway's stream fetch can return HTTP 429 inside a 200, and jobs whose streams were refused kept running to completion with no client attached.
- Load-balancer endpoints admit ~4 requests per worker at the default request count; at 200 the same 4090 did 11k tok/s on the 0.5B and 2.2k on the 7B.
- `throttled` in /health turned out to mean the slot's host GPU was held by another tenant; Runpod re-homed the slot during the wait.

All of it is in the README's Serverless section with the JSON. If any of this is useful to whoever owns Serverless, happy to write it up properly or open issues.

Ashwin
