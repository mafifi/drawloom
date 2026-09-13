// Independently generated public PCM fixtures, not narration or private media.
export const previewRequirements = {
  sampleRate: 16000,
  durationSeconds: 1,
  toleranceSeconds: 0.002,
  minimumPeak: 0.01,
  maximumPeak: 0.95,
};
export function pcmFixture(amplitude: number, samples: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples * 2),
    view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++)
    view.setInt16(
      44 + 2 * i,
      Math.round(Math.sin((2 * Math.PI * 250 * i) / 16000) * amplitude * 32767),
      true,
    );
  return bytes;
}
