import { AssetSchema, type AssetLibrary, type JsonStore, type AssetStore, type RpcTransport } from "./index.js";
export async function assetLibraryConformance(factory: () => Promise<AssetLibrary>): Promise<void> {
  const library = await factory();
  const asset = AssetSchema.parse(await library.put(new Uint8Array([1, 2, 3]), 'image/png'));
  if (asset.size !== 3 || asset.mediaType !== 'image/png') throw Error('Asset metadata mismatch');
  if ((await library.read(asset.key)).join(',') !== '1,2,3') throw Error('Asset bytes mismatch');
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
    await fixture.assets.write("sample.bin", new Uint8Array([0, 4, 255]));
    check(
      (await fixture.assets.read("sample.bin")).join(",") === "0,4,255",
      "asset bytes",
    );
    let rejected = false;
    try {
      await fixture.assets.read("../outside");
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
