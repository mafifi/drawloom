import { AssetSchema, type AssetLibrary, type JsonStore, type AssetStore, type RpcTransport } from "./index.js";

async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of chunks) {
    if (chunk.byteLength > 64 * 1024) throw Error('Asset stream chunk exceeded 64 KiB');
    parts.push(chunk);
    size += chunk.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

async function* chunks(...parts: number[][]): AsyncIterable<Uint8Array> {
  for (const part of parts) yield new Uint8Array(part);
}

export async function assetLibraryConformance(factory: () => Promise<AssetLibrary>): Promise<void> {
  const library = await factory();
  const asset = AssetSchema.parse(await library.put(new Uint8Array([1, 2, 3]), 'image/png'));
  if (asset.size !== 3 || asset.mediaType !== 'image/png') throw Error('Asset metadata mismatch');
  if ((await library.read(asset.key)).join(',') !== '1,2,3') throw Error('Asset bytes mismatch');
  const streamed = AssetSchema.parse(await library.putStream(chunks([1, 2], [3]), 'image/png'));
  if (streamed.key !== asset.key) throw Error('Repeated content must retain one identity');
  const reader = await library.open(streamed.key);
  try {
    if (reader.size !== 3) throw Error('Asset reader size mismatch');
    if ((await collect(reader.stream({ endExclusive: 1 }))).join(',') !== '1')
      throw Error('Asset prefix range mismatch');
    if ((await collect(reader.stream({ start: 1, endExclusive: 3 }))).join(',') !== '2,3')
      throw Error('Asset range mismatch');
    if ((await collect(reader.stream({ start: 3, endExclusive: 3 }))).byteLength !== 0)
      throw Error('Asset empty range mismatch');
  } finally {
    await reader.close();
    await reader.close();
  }
  const controller = new AbortController();
  let cancelled = false;
  async function* cancelledChunks() {
    yield new Uint8Array([4]);
    controller.abort();
    yield new Uint8Array([5]);
  }
  try { await library.putStream(cancelledChunks(), 'image/png', { signal: controller.signal }); }
  catch { cancelled = true; }
  if (!cancelled) throw Error('Cancelled asset upload must reject');
  let emptyRejected = false;
  try { await library.putStream(chunks([]), 'image/png'); } catch { emptyRejected = true; }
  if (!emptyRejected) throw Error('Empty asset upload must reject');
  let rejected = false;
  try { await library.read('../outside'); } catch { rejected = true; }
  if (!rejected) throw Error('Asset traversal must reject');
}
export async function hostConformance(
  factory: () => Promise<{
    store: JsonStore;
    assets: AssetStore;
    transport: RpcTransport;
    close(): Promise<void>;
  }>,
): Promise<void> {
  const fixture = await factory();
  const check = (condition: unknown, message: string) => {
    if (!condition) throw Error(message);
  };
  try {
    check((await fixture.store.get("missing")) === undefined, "missing value");
    await fixture.store.set("record", { value: 7 });
    check(
      JSON.stringify(await fixture.store.get("record")) === '{"value":7}',
      "JSON round trip",
    );
    await fixture.store.set("record", { value: 8 });
    check(
      JSON.stringify(await fixture.store.get("record")) === '{"value":8}',
      "replace value",
    );
    const assets = fixture.assets;
    await assets.write("sample.bin", new Uint8Array([0, 4, 255]));
    check(
      (await assets.read("sample.bin")).join(",") === "0,4,255",
      "asset bytes",
    );
    const reader = await assets.open('sample.bin');
    check(reader.size === 3, 'asset reader size');
    check((await collect(reader.stream({ start: 1, endExclusive: 3 }))).join(',') === '4,255', 'asset exact range');
    for (const options of [
      { start: -1 },
      { start: 2, endExclusive: 1 },
      { endExclusive: 4 },
      { start: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      let invalidRange = false;
      try { await collect(reader.stream(options)); } catch { invalidRange = true; }
      check(invalidRange, 'asset range validation');
    }
    await reader.close();
    await reader.close();

    const original = new Uint8Array(70 * 1024).fill(7);
    await assets.write('stable.bin', original);
    const stable = await assets.open('stable.bin');
    await assets.write('stable.bin', new Uint8Array([9]));
    const stableBytes = await collect(stable.stream());
    check(stableBytes.byteLength === original.byteLength && stableBytes.every(byte => byte === 7), 'open asset identity');
    await stable.close();

    const partial = await assets.open('stable.bin');
    const iterator = partial.stream()[Symbol.asyncIterator]();
    check((await iterator.next()).value?.byteLength === 1, 'partial asset iteration');
    await partial.close();
    let closedRead = false;
    try { await iterator.next(); } catch { closedRead = true; }
    check(closedRead, 'premature asset close');

    await assets.write('cancel.bin', original);
    const cancellable = await assets.open('cancel.bin');
    const abort = new AbortController();
    const cancelledIterator = cancellable.stream({ signal: abort.signal })[Symbol.asyncIterator]();
    check((await cancelledIterator.next()).value?.byteLength === 64 * 1024, 'bounded asset chunk');
    abort.abort();
    let cancelled = false;
    try { await cancelledIterator.next(); } catch { cancelled = true; }
    check(cancelled, 'cancelled asset read');
    await cancellable.close();

    await assets.write('atomic.bin', new Uint8Array([1, 2, 3]));
    async function* failedWrite() {
      yield new Uint8Array([8]);
      throw Error('Synthetic stream failure');
    }
    let writeFailed = false;
    try { await assets.writeStream('atomic.bin', failedWrite(), { maxBytes: 8 }); }
    catch { writeFailed = true; }
    check(writeFailed, 'failed streamed write');
    check((await assets.read('atomic.bin')).join(',') === '1,2,3', 'atomic write preservation');
    const writeAbort = new AbortController();
    async function* cancelledWrite() {
      yield new Uint8Array([8]);
      writeAbort.abort();
      yield new Uint8Array([9]);
    }
    let writeCancelled = false;
    try { await assets.writeStream('atomic.bin', cancelledWrite(), { maxBytes: 8, signal: writeAbort.signal }); }
    catch { writeCancelled = true; }
    check(writeCancelled, 'cancelled streamed write');
    check((await assets.read('atomic.bin')).join(',') === '1,2,3', 'cancelled write preservation');
    let oversized = false;
    try { await assets.writeStream('bounded.bin', chunks([1, 2], [3]), { maxBytes: 2 }); }
    catch { oversized = true; }
    check(oversized, 'streamed write byte ceiling');
    await assets.writeStream('bounded.bin', chunks([1, 2], [3]), { maxBytes: 3 });
    check((await assets.read('bounded.bin')).join(',') === '1,2,3', 'streamed write exact ceiling');
    let rejected = false;
    try {
      await assets.open("../outside");
    } catch {
      rejected = true;
    }
    check(rejected, "asset traversal");
    check(
      JSON.stringify(
        await fixture.transport.request("echo", { value: "safe" }),
      ) === '{"value":"safe"}',
      "RPC correlation",
    );
    await fixture.transport.close();
    await fixture.transport.close();
  } finally {
    await fixture.close();
  }
}
