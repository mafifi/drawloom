"""Drawloom's offline, stdio-only MLX embedding worker."""
import importlib.metadata
import json
import os
import sys

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
import mlx.core as mx
from mlx_embeddings import load

MODEL_DIRECTORY, MODEL_REVISION = sys.argv[1:3]
if not mx.metal.is_available():
    raise RuntimeError("Metal GPU is unavailable; MLX has no silent CPU fallback")
mx.set_default_device(mx.gpu)
model, tokenizer = load(MODEL_DIRECTORY)
mx.synchronize()
versions = {name: importlib.metadata.version(name) for name in ["mlx-embeddings", "mlx", "transformers", "tokenizers"]}
print(json.dumps({"kind": "ready", "protocol": 1, "modelRevision": MODEL_REVISION, "dimensions": 1024, "device": "gpu", "versions": versions}), flush=True)

for line in sys.stdin:
    request_id = "unknown"
    try:
        message = json.loads(line)
        request_id = message["id"]
        request = message["request"]
        role, items = request["role"], request["items"]
        if message["kind"] != "embed" or role not in ("query", "document") or not 1 <= len(items) <= 50 or any(not isinstance(item, str) or not item for item in items):
            raise ValueError("invalid_request")
        prefix = "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:" if role == "query" else ""
        encoded = tokenizer([prefix + item for item in items], padding=True, truncation=False, return_tensors="np")
        tokens = mx.array(encoded["input_ids"])
        mask = mx.array(encoded["attention_mask"])
        if tokens.shape[1] > 2048 or tokens.size > 8192:
            raise ValueError("input_too_large")
        # mlx-embeddings' Qwen model performs last-token pooling and L2 normalization.
        output = model(tokens, attention_mask=mask).text_embeds
        mx.eval(output)
        mx.synchronize()
        print(json.dumps({"kind": "result", "id": request_id, "vectors": output.tolist()}, allow_nan=False), flush=True)
    except Exception as error:
        code = str(error) if str(error) in ("invalid_request", "input_too_large") else "inference_failed"
        print(json.dumps({"kind": "error", "id": request_id, "code": code}), flush=True)
