"""
Pulse image-generation worker.

Runs a minimal HTTP server loop (stdlib only) that loads an SDXL-Turbo pipeline
once on startup and serves /generate requests from the Electron main process.

Why MPS + diffusers instead of MLX:
  The `diffusers` PyTorch stack supports Apple's MPS backend out of the box and
  has first-class SDXL-Turbo weights on HuggingFace. mlx-examples has a cleaner
  Apple-native implementation but its SDXL support lags upstream and doesn't
  have the Turbo distillation. We use torch+MPS here — ~1-2 s per 512x512 image
  on an M1/M2/M3 with 16 GB unified RAM.

Protocol:
  GET /health                     -> {"status": "ready" | "loading"}
  POST /generate  {prompt, seed?} -> PNG bytes (Content-Type: image/png)
  POST /shutdown                  -> process exits

The Electron side spawns this as a subprocess, tears it down on app quit.
"""

from __future__ import annotations

import io
import json
import os
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Let MPS use full unified RAM instead of the default 50% hard cap, which is
# what was driving the 40-60s/step stalls — the model didn't fit, so every
# layer round-tripped through CPU memory. Setting to 0.0 lifts the cap.
os.environ.setdefault("PYTORCH_MPS_HIGH_WATERMARK_RATIO", "0.0")

MODEL_ID = os.environ.get("PULSE_SDXL_MODEL", "stabilityai/sdxl-turbo")
PORT = int(os.environ.get("PULSE_REELS_PORT", "7878"))
# 9:16 vertical for Reels. SDXL-Turbo expects multiples of 64; 576x1024 matches
# the renderer's 9:16 frame without letterboxing.
IMG_W = int(os.environ.get("PULSE_REELS_IMG_W", "576"))
IMG_H = int(os.environ.get("PULSE_REELS_IMG_H", "1024"))
# Bumped from 2 → 4 steps. At 4 SDXL-Turbo produces noticeably cleaner subjects
# and fewer smeared faces/hands, while still rendering in ~2-3s on MPS.
NUM_STEPS = int(os.environ.get("PULSE_REELS_STEPS", "4"))

_state = {"status": "loading", "pipe": None, "error": None}
_state_lock = threading.Lock()
# Serializes access to the shared diffusers pipeline. Euler-family schedulers
# stash `_step_index` on the scheduler instance itself, so two concurrent
# generate() calls step on each other and one crashes with
# "index N is out of bounds for dimension 0 with size N". The HTTP server is
# threaded, so we guard every generation with this lock.
_gen_lock = threading.Lock()


def _load_pipeline() -> None:
    try:
        import torch  # type: ignore
        from diffusers import AutoPipelineForText2Image  # type: ignore

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        dtype = torch.float16 if device == "mps" else torch.float32

        print(f"[worker] loading {MODEL_ID} on {device} ({dtype})", flush=True)
        pipe = AutoPipelineForText2Image.from_pretrained(
            MODEL_ID,
            torch_dtype=dtype,
            variant="fp16" if dtype == torch.float16 else None,
            use_safetensors=True,
        )
        pipe = pipe.to(device)
        # Turn off the safety checker — it gates unrelated content (e.g. any
        # photo with skin) and we're in a closed news-reader context. It also
        # adds ~2 s per image.
        if hasattr(pipe, "safety_checker"):
            pipe.safety_checker = None
        # On MPS, unified memory spills across the GPU/CPU boundary when the
        # whole SDXL UNet + VAE hold activations in one shot. Attention + VAE
        # slicing cut peak memory ~3× and drop per-step latency from ~40-60s
        # to ~1-3s on M1/M2/M3. No quality hit.
        if device == "mps":
            try:
                pipe.enable_attention_slicing("max")
            except Exception:  # noqa: BLE001
                pass
            try:
                pipe.enable_vae_slicing()
            except Exception:  # noqa: BLE001
                pass
            try:
                pipe.enable_vae_tiling()
            except Exception:  # noqa: BLE001
                pass
        # Quiet the per-step tqdm bar — we were piping it to the Electron log.
        try:
            pipe.set_progress_bar_config(disable=True)
        except Exception:  # noqa: BLE001
            pass
        with _state_lock:
            _state["pipe"] = pipe
            _state["status"] = "ready"
        print("[worker] ready", flush=True)
    except Exception as exc:  # noqa: BLE001
        err = f"{type(exc).__name__}: {exc}"
        traceback.print_exc()
        with _state_lock:
            _state["status"] = "failed"
            _state["error"] = err


def _generate(prompt: str, seed: int | None) -> bytes:
    import torch  # type: ignore
    with _state_lock:
        pipe = _state["pipe"]
    if pipe is None:
        raise RuntimeError("pipeline not loaded")

    # Serialize access to the shared pipeline. The scheduler keeps per-call
    # state on the instance (_step_index / _begin_index); if two requests
    # arrive concurrently the second one trips IndexError when sigmas is
    # indexed past the end. A single image is ~1-2s on MPS so queueing is fine.
    with _gen_lock:
        generator = None
        if seed is not None:
            device = "mps" if torch.backends.mps.is_available() else "cpu"
            generator = torch.Generator(device=device).manual_seed(seed)

        # Reset scheduler state defensively. Some diffusers versions don't
        # fully clear `_step_index` on `set_timesteps`, so a prior run that
        # was interrupted (e.g. by a torch error) can leave the scheduler
        # pointing past the end of `sigmas`.
        try:
            sched = pipe.scheduler
            if hasattr(sched, "_step_index"):
                sched._step_index = None
            if hasattr(sched, "_begin_index"):
                sched._begin_index = None
        except Exception:  # noqa: BLE001
            pass

        result = pipe(
            prompt=prompt,
            num_inference_steps=NUM_STEPS,
            guidance_scale=0.0,  # SDXL-Turbo requires CFG=0
            height=IMG_H,
            width=IMG_W,
            generator=generator,
        )
        image = result.images[0]
        buf = io.BytesIO()
        image.save(buf, format="JPEG", quality=85)
        # Free MPS workspace between beats — otherwise peak memory creeps up
        # over a 4-beat generation and later images are slower than the first.
        try:
            if torch.backends.mps.is_available():
                torch.mps.empty_cache()
        except Exception:  # noqa: BLE001
            pass
        return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:  # quieter
        return

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            with _state_lock:
                status = _state["status"]
                err = _state["error"]
            payload = {"status": status}
            if err:
                payload["error"] = err
            self._json(200, payload)
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/shutdown":
            self._json(200, {"status": "shutting-down"})
            threading.Thread(target=lambda: os._exit(0), daemon=True).start()
            return
        if self.path != "/generate":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError as exc:
            self._json(400, {"error": f"bad json: {exc}"})
            return
        prompt = body.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            self._json(400, {"error": "prompt required"})
            return
        seed = body.get("seed")
        with _state_lock:
            if _state["status"] != "ready":
                self._json(503, {"error": _state["status"], "detail": _state["error"]})
                return
        try:
            img = _generate(prompt, seed if isinstance(seed, int) else None)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            self._json(500, {"error": str(exc)})
            return
        try:
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(img)))
            self.end_headers()
            self.wfile.write(img)
        except (BrokenPipeError, ConnectionResetError):
            # Client gave up waiting (reel canceled / superseded). Image is
            # generated and cached by seed, so this is harmless.
            pass


def main() -> int:
    threading.Thread(target=_load_pipeline, daemon=True).start()
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[worker] listening on 127.0.0.1:{PORT}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
