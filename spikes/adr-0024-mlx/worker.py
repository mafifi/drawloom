"""Opt-in local inference experiment. External libraries/weights are not bundled."""
import time
STARTED = time.perf_counter()
import sys
import json
import resource
import importlib.metadata
import mlx.core as mx
from mlx_embeddings import load

if not mx.metal.is_available():
    raise RuntimeError("Metal GPU is unavailable; no silent CPU fallback")
mx.set_default_device(mx.gpu)
model, tokenizer = load(sys.argv[1])
mx.synchronize()
startup_ms = (time.perf_counter() - STARTED) * 1000
counts = {"document": 0, "query": 0}
elapsed = {"document": 0.0, "query": 0.0}

def stats():
    usage = resource.getrusage(resource.RUSAGE_SELF)
    return {
        "device": str(mx.default_device()), "metal_available": mx.metal.is_available(),
        "startup_ms": startup_ms, "counts": counts, "inference_ms": elapsed,
        "peak_rss_bytes": usage.ru_maxrss, "cpu_seconds": usage.ru_utime + usage.ru_stime,
        "mlx_peak_allocated_bytes": mx.get_peak_memory(),
        "versions": {name: importlib.metadata.version(name) for name in
                     ["mlx", "mlx-metal", "mlx-embeddings", "transformers", "tokenizers"]},
    }

print(json.dumps({"ready": stats()}), flush=True)
for line in sys.stdin:
    try:
        request = json.loads(line)
        if request.get("command") == "stats":
            print(json.dumps({"stats": stats()}), flush=True)
            continue
        role = request["role"]
        texts = request["texts"]
        if role not in counts or not 1 <= len(texts) <= 100:
            raise ValueError("Invalid batch")
        started = time.perf_counter()
        prefix = "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:" if role == "query" else ""
        encoded = tokenizer([prefix + text for text in texts], padding=True,
                            truncation=False, return_tensors="np")
        tokens = mx.array(encoded["input_ids"])
        mask = mx.array(encoded["attention_mask"])
        if tokens.shape[1] > 2048 or tokens.size > 8192:
            raise ValueError("Token budget exceeded")
        output = model(tokens, attention_mask=mask).text_embeds
        # Explicit evaluation/synchronization: timings must include GPU completion.
        mx.eval(output)
        mx.synchronize()
        vectors = output.tolist()
        elapsed[role] += (time.perf_counter() - started) * 1000
        counts[role] += len(texts)
        print(json.dumps({"vectors": vectors}), flush=True)
    except Exception as error:
        print(json.dumps({"error": str(error)}), flush=True)
