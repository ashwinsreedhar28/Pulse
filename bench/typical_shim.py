#!/usr/bin/env python3
"""Typical (Oz Labs) behind a SystemOne-shaped HTTP endpoint, for bench/quality.py.

Typical ships as a Python SDK only (`pip install typical-ai`, import name `typical_ai`), so this is the
smallest HTTP contract that lets the same `call_systemone` adapter score it.
Only the `score` question type is implemented; the answer carries `p_null`
(Typical's separate abstain head) as an extension field.

On a Runpod GPU pod (4090 is plenty for typical-medium, ~8 GB bf16):
  pip install typical-ai fastapi uvicorn
  TYPICAL_MODEL=OzLabs/typical-medium python typical_shim.py          # port 8000
then on the Mac:
  export TYPICAL_URL=https://<podid>-8000.proxy.runpod.net
  python bench/quality.py run --backend typical --model OzLabs/typical-medium --limit 3

The SDK call below follows the public write-up (`score(state, question, levels)`
-> {level: p}, p_null, expected). If the installed SDK's signature differs,
fix `score_one` here; nothing else needs to change.
"""
import os, time
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn

MODEL = os.environ.get("TYPICAL_MODEL", "OzLabs/typical-medium")
# Typical prefills `state` and reads the question + options as a short suffix. Handing it
# the 730-token scorer brief as the question returned the same distribution for every
# article (probe, Oct 13), so by default the brief is prepended to the state and the
# question is one line. TYPICAL_SHAPE=question_is_instructions restores the Jev/Clef shape.
SHAPE = os.environ.get("TYPICAL_SHAPE", "instructions_in_state")
SHORT_QUESTION = "Given the brief above, how urgent is this news item?"
app = FastAPI()
_model = None


def model():
    global _model
    if _model is None:
        from typical_ai import Typical
        t0 = time.perf_counter()
        _model = Typical.from_pretrained(MODEL, device="auto")
        print(f"loaded {MODEL} in {time.perf_counter() - t0:.1f}s", flush=True)
    return _model


def score_one(state, instructions, levels):
    out = model().score(state, instructions, levels)
    # Normalise whatever the SDK returns into (probs in level order, p_null, expected).
    if isinstance(out, dict):
        dist, p_null, expected = out, out.get("p_null"), out.get("expected")
    else:  # object with attributes
        dist = getattr(out, "probabilities", None) or getattr(out, "distribution", None) or {}
        p_null, expected = getattr(out, "p_null", None), getattr(out, "expected", None)
    probs = [float(dist.get(lv, 0.0)) for lv in levels]
    return probs, p_null, expected


@app.get("/health")
def health():
    return {"model": MODEL, "loaded": _model is not None}


@app.post("/v1/systemone")
async def systemone(req: Request):
    body = await req.json()
    state = body.get("state")
    if not isinstance(state, str):
        state = str(state)
    answers = {}
    for name, q in (body.get("questions") or {}).items():
        if q.get("type") != "score":
            return JSONResponse({"error": f"question {name}: only type=score is implemented"}, 400)
        levels = [lv if isinstance(lv, str) else lv.get("label") for lv in q["criteria"]]
        instructions = q.get("instructions", "")
        if SHAPE == "instructions_in_state" and instructions:
            probs, p_null, expected = score_one(instructions + "\n\n" + state, SHORT_QUESTION, levels)
        else:
            probs, p_null, expected = score_one(state, instructions, levels)
        if expected is None:
            expected = sum(i * p for i, p in enumerate(probs))
        answers[name] = {"type": "score", "score": float(expected),
                         "legend": {str(i): lv for i, lv in enumerate(levels)},
                         "probabilities": probs, "confidence": max(probs) if probs else None,
                         "p_null": float(p_null) if p_null is not None else None, "shape": SHAPE}
    return {"model": MODEL, "answers": answers, "usage": {"input_tokens": None, "output_tokens": 0}}


if __name__ == "__main__":
    model()  # load before serving so the first request's wall time is scoring, not loading
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
