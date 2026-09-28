Sent Mon Sep 28, 2026 ~1:47 PM ET, reply in Jeremy's thread (after pagedserve v0.9.4 and the README fix 2301410). Promised: model-cache-off cold-start rerun + before/after this week.

---

Hi Jeremy,

Thanks for running that down with the FDE! I'll turn off the model cache, rerun the cold starts, and send you the before/after this week. Very cool that you run Kimi internally, makes sense there's no rate.

The engine is here: github.com/ashwinsreedhar28/pagedserve. It's LLM serving written from scratch: paged KV cache, continuous batching, CUDA graphs, and Triton kernels. On my A100 throughput benchmark it reaches 99% of vLLM on a 7B and parity on a 0.5B; the README walks through the fix-by-fix path from 23%.

I also put it on Serverless. With 7B weights baked into the image, I'm seeing 12-16 s container-start-to-healthy and ~25 s end to end when the image is already on the host; a fresh host is ~95 s because of the 25 GB image pull. For comparison, worker-vllm's 8B was 138-144 s container-to-healthy in my runs, including ~15 s of weight download and ~33 s of torch.compile.

I used the engine as a controlled load generator for some Serverless testing too, so there's a section in the README with those results and the raw JSON. Happy to write any of that up more formally if it's useful to the Serverless team.

If you're up for it, I'd love to walk you through the engine on a quick call sometime this week or next.

Best,
Ashwin
