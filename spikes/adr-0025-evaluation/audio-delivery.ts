import type { AssetReader } from "@drawloom/host";
import type { Scorer } from "./contract.ts";
import { z } from "zod";

const requirements = z
  .strictObject({
    sampleRate: z.number().int().positive(),
    durationSeconds: z.number().positive(),
    toleranceSeconds: z.number().nonnegative(),
    minimumPeak: z.number().min(0).max(1),
    maximumPeak: z.number().min(0).max(1),
  })
  .refine((value) => value.minimumPeak <= value.maximumPeak);
const selectedOutput = z.strictObject({
  assetKey: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Consumer-specific canonical mono PCM16 preview checks, not a general WAV decoder. */
export function createPcmDeliveryScorer(
  openPermitted: (key: string) => Promise<AssetReader>,
): Scorer {
  return {
    id: "podcast-preview.delivery",
    revision: "1",
    async score({ output, expected, evidence, signal }) {
      signal.throwIfAborted();
      const { assetKey } = selectedOutput.parse(output),
        wanted = requirements.parse(expected);
      const reference = evidence.find((item) => item.assetKey === assetKey);
      if (!reference || reference.mediaType !== "audio/wav")
        throw Error("Selected audio reference required");
      // This callback must check the caller's permission; a selected reference is not a grant.
      const reader = await openPermitted(assetKey);
      try {
        if (
          reader.size !== reference.size ||
          reader.size < 44 ||
          reader.size > 1024 * 1024
        )
          throw Error("Unsupported preview size");
        const header = new Uint8Array(44);
        let offset = 0;
        for await (const chunk of reader.stream({
          start: 0,
          endExclusive: 44,
          signal,
        })) {
          header.set(chunk, offset);
          offset += chunk.length;
        }
        const h = new DataView(header.buffer),
          ascii = (start: number, end: number) =>
            String.fromCharCode(...header.subarray(start, end));
        if (
          offset !== 44 ||
          ascii(0, 4) !== "RIFF" ||
          ascii(8, 12) !== "WAVE" ||
          ascii(12, 16) !== "fmt " ||
          ascii(36, 40) !== "data" ||
          h.getUint32(16, true) !== 16 ||
          h.getUint16(20, true) !== 1 ||
          h.getUint16(22, true) !== 1 ||
          h.getUint16(34, true) !== 16 ||
          h.getUint32(4, true) !== reader.size - 8 ||
          h.getUint32(40, true) !== reader.size - 44 ||
          (reader.size - 44) % 2 !== 0
        )
          throw Error("Unsupported or malformed canonical PCM16 preview");
        const sampleRate = h.getUint32(24, true);
        if (
          sampleRate === 0 ||
          h.getUint32(28, true) !== sampleRate * 2 ||
          h.getUint16(32, true) !== 2
        )
          throw Error("Invalid PCM timing");
        let low: number | undefined,
          peak = 0,
          samples = 0;
        for await (const chunk of reader.stream({ start: 44, signal })) {
          signal.throwIfAborted();
          for (const byte of chunk) {
            if (low === undefined) low = byte;
            else {
              const raw = low | (byte << 8);
              peak = Math.max(
                peak,
                Math.abs(raw >= 32768 ? raw - 65536 : raw) / 32768,
              );
              samples++;
              low = undefined;
            }
          }
        }
        if (low !== undefined || samples * 2 !== reader.size - 44)
          throw Error("Incomplete PCM preview");
        const duration = samples / sampleRate;
        const passed =
          sampleRate === wanted.sampleRate &&
          Math.abs(duration - wanted.durationSeconds) <=
            wanted.toleranceSeconds &&
          peak >= wanted.minimumPeak &&
          peak <= wanted.maximumPeak;
        return {
          score: passed ? 1 : 0,
          explanation: `PCM preview: ${sampleRate} Hz; ${duration.toFixed(3)} s; peak ${peak.toFixed(4)}. Technical delivery only, not intelligibility or voice quality.`,
        };
      } finally {
        await reader.close();
      }
    },
  };
}
