"""
Pulse Kokoro TTS worker.

Runs a small stdlib HTTP server that loads Kokoro-82M once on startup and
serves /tts requests from the Electron main process. Mirrors the contract of
reels_video_worker.py so the TypeScript side can reuse the health-poll +
kill-on-quit lifecycle.

Protocol:
  GET  /health              -> {"status": "ready" | "loading" | "failed", "error"?: str}
  POST /tts {text, voice?}  -> WAV bytes (Content-Type: audio/wav)
  POST /shutdown            -> process exits

Install deps:
  pip install kokoro soundfile numpy

Voices (American English):
  af_heart   - warm female, default for news narration
  am_adam    - neutral male
  bf_emma    - British female
  bm_george  - British male
"""

from __future__ import annotations

import io
import json
import os
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PULSE_KOKORO_PORT", "5112"))
DEFAULT_VOICE = os.environ.get("PULSE_KOKORO_VOICE", "am_michael")
# Kokoro voice ids are <lang>_<name>. 'a' = American, 'b' = British.
DEFAULT_LANG = "a" if DEFAULT_VOICE.startswith(("a", "af", "am")) else "b"

_state: dict = {"status": "loading", "pipeline": None, "error": None}
_state_lock = threading.Lock()
_tts_lock = threading.Lock()  # serialize generation; kokoro pipelines aren't thread-safe


def _lang_for_voice(voice: str) -> str:
    # Voice ids start with a gender letter (a/b). First char is the lang code.
    if not voice:
        return DEFAULT_LANG
    return voice[0]


def _load_pipeline() -> None:
    try:
        from kokoro import KPipeline  # type: ignore
        pipe = KPipeline(lang_code=DEFAULT_LANG)
        with _state_lock:
            _state["pipeline"] = pipe
            _state["status"] = "ready"
        print(f"[kokoro] ready (lang={DEFAULT_LANG}, voice={DEFAULT_VOICE})", flush=True)
    except Exception as exc:  # noqa: BLE001
        err = f"{type(exc).__name__}: {exc}"
        traceback.print_exc()
        with _state_lock:
            _state["status"] = "failed"
            _state["error"] = err


def _synthesize(text: str, voice: str) -> bytes:
    import numpy as np  # type: ignore
    import soundfile as sf  # type: ignore

    with _state_lock:
        pipe = _state["pipeline"]
    if pipe is None:
        raise RuntimeError("pipeline not loaded")

    # If the voice implies a different language than what the current pipeline
    # was created with, spin up a one-off pipeline for this request. This is
    # rare in practice since users stick with one locale.
    lang = _lang_for_voice(voice)
    if lang != DEFAULT_LANG:
        from kokoro import KPipeline  # type: ignore
        pipe = KPipeline(lang_code=lang)

    chunks: list = []
    with _tts_lock:
        # KPipeline yields (graphemes, phonemes, audio_tensor) tuples.
        for piece in pipe(text, voice=voice):
            audio = piece[2]
            if hasattr(audio, "numpy"):
                audio = audio.numpy()
            chunks.append(audio)
    if not chunks:
        raise RuntimeError("no audio generated")
    audio = np.concatenate(chunks)

    buf = io.BytesIO()
    # Kokoro outputs 24kHz mono float32. soundfile handles PCM_16 conversion.
    sf.write(buf, audio, 24000, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.read()


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
        if self.path != "/tts":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError as exc:
            self._json(400, {"error": f"bad json: {exc}"})
            return
        text = body.get("text")
        if not isinstance(text, str) or not text.strip():
            self._json(400, {"error": "text required"})
            return
        voice = body.get("voice")
        if not isinstance(voice, str) or not voice.strip():
            voice = DEFAULT_VOICE
        with _state_lock:
            if _state["status"] != "ready":
                self._json(503, {"error": _state["status"], "detail": _state["error"]})
                return
        try:
            wav = _synthesize(text, voice)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            self._json(500, {"error": str(exc)})
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav)))
        self.end_headers()
        self.wfile.write(wav)


def main() -> int:
    threading.Thread(target=_load_pipeline, daemon=True).start()
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[kokoro] listening on 127.0.0.1:{PORT}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
