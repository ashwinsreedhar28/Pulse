Send: Tue Sep 29, 2026 around midday ET, reply in Jeremy's thread (fold in if he replies to the Sep 28 pagedserve email first). GPT-reviewed and approved. Write-up section 1b is already in the shared Google Doc.

---

Hi Jeremy,

Reran the cold starts with the model cache off, and your FDE was right: the volume mounts now (vLLM sees FUSE instead of the container overlay), and the weights and compile artifacts persist between workers.

Container start to healthy on an A100:
- Before (volume not mounted): 138-144 s
- Cache hit (2 runs): 114 s both times

The compile cache does what it should: torch.compile goes from ~33 s to ~1 s. The weights go the other way: reading the 15 GB checkpoint off the volume took ~30 s, vs ~18 s total to download the weights and load them from local disk, since vLLM doesn't prefetch from FUSE. So roughly 27 s faster overall in these runs.

The bigger number was placement: with the endpoint pinned to the volume's datacenter, both cache-hit starts waited for an 80 GB card, ~3.5 and ~11 min, before the container started. For this scale-to-zero setup, that was the larger risk. Next I'd try vLLM's prefetch load strategy, or bake the weights into the image. I added all of this to the write-up as section 1b.

Also, the credits have been huge. I've always loved building but never had the hardware to go this deep on inference, and this past week I finally got to.

Best,
Ashwin
