import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createNodeAssetStore } from "@drawloom/node-host";
import { createPcmDeliveryScorer } from "./audio-delivery.ts";
import { pcmFixture, previewRequirements } from "./audio-fixtures.ts";

test("audio delivery distinguishes headroom and timing regressions without changing stored bytes", async () => {
  const store = createNodeAssetStore(
    await mkdtemp(join(tmpdir(), "drawloom-audio-eval-")),
  );
  const allowed = new Set<string>();
  const scorer = createPcmDeliveryScorer(async (key) => {
    if (!allowed.has(key)) throw Error("Reference not permitted");
    return store.open(key);
  });
  for (const [amplitude, samples, want] of [
    [0.2, 16000, 1],
    [1, 16000, 0],
    [0.2, 8000, 0],
    [0, 16000, 0],
  ] as const) {
    const bytes = pcmFixture(amplitude, samples),
      key = createHash("sha256").update(bytes).digest("hex");
    await store.write(key, bytes);
    allowed.add(key);
    const result = await scorer.score({
      input: {},
      output: { assetKey: key },
      expected: previewRequirements,
      evidence: [{ assetKey: key, mediaType: "audio/wav", size: bytes.length }],
      signal: new AbortController().signal,
    });
    expect(result.score).toBe(want);
    expect(await store.read(key)).toEqual(bytes);
  }
});

test("unpermitted audio references and cancellation do not open assets", async () => {
  let opens = 0;
  const scorer = createPcmDeliveryScorer(async () => {
    opens++;
    throw Error("not called");
  });
  const args = {
    input: {},
    output: { assetKey: "0".repeat(64) },
    expected: previewRequirements,
    evidence: [],
    signal: new AbortController().signal,
  };
  await expect(scorer.score(args)).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(
    scorer.score({
      ...args,
      evidence: [{ assetKey: "0".repeat(64), mediaType: "audio/wav", size: 32044 }],
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(opens).toBe(0);
});

test("malformed media and interrupted reads close the opened reader", async () => {
  for (const mode of ["malformed", "interrupted"] as const) {
    const bytes = pcmFixture(0.2, 16000);
    if (mode === "malformed") bytes[0] = 0;
    let closes = 0;
    const controller = new AbortController();
    const scorer = createPcmDeliveryScorer(async () => ({
      size: bytes.length,
      async close() {
        closes++;
      },
      stream(options) {
        return {
          async *[Symbol.asyncIterator]() {
            if (mode === "interrupted" && options?.start === 44)
              controller.abort();
            yield bytes.subarray(
              options?.start ?? 0,
              options?.endExclusive ?? bytes.length,
            );
          },
        };
      },
    }));
    await expect(
      scorer.score({
        input: {},
        output: { assetKey: "0".repeat(64) },
        expected: previewRequirements,
        evidence: [
          {
            assetKey: "0".repeat(64),
            mediaType: "audio/wav",
            size: bytes.length,
          },
        ],
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(closes).toBe(1);
  }
});
