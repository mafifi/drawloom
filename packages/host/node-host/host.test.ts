import { test, expect } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("malformed matching RPC response settles before its request deadline", async () => {
  const rpc = createStdioTransport({
    command: process.execPath,
    args: [
      "-e",
      `process.stdin.once('data',d=>{const {id}=JSON.parse(d);process.stdout.write(JSON.stringify({id})+'\\n')});process.stdout.write(JSON.stringify({method:'ready'})+'\\n')`,
    ],
    requestTimeoutMs: 30,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve) => {
      rpc.subscribe(
        (message) => {
          if (message.method === "ready") resolve();
        },
        () => {},
      );
    });
    const outcome = await Promise.race([
      rpc.request("bad", {}).then(
        () => "resolved",
        () => "rejected",
      ),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve("pending"), 150);
      }),
    ]);
    expect(outcome).toBe("rejected");
  } finally {
    if (timer) clearTimeout(timer);
    await rpc.close();
  }
});
import { hostConformance } from "../host/src/conformance.js";
import {
  createNodeJsonStore,
  createNodeAssetStore,
  createStdioTransport,
  codexCommand,
} from "./src/index.js";
test("node host shared conformance", () =>
  hostConformance(async () => {
    const root = await mkdtemp(join(tmpdir(), "drawloom-host-"));
    return {
      store: createNodeJsonStore(join(root, "store")),
      assets: createNodeAssetStore(join(root, "assets")),
      transport: createStdioTransport({
        command: process.execPath,
        args: [
          "-e",
          `let b='';process.stdin.on('data',d=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){let m=JSON.parse(b.slice(0,i));b=b.slice(i+1);process.stdout.write(JSON.stringify({id:m.id,result:m.params})+'\\n')}})`,
        ],
      }),
      close: () => rm(root, { recursive: true, force: true }),
    };
  }));
test("asset symlinks cannot escape the selected root", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-assets-"));
  try {
    const assets = createNodeAssetStore(root);
    await symlink(tmpdir(), join(root, "outside"));
    await expect(
      assets.write("outside/escape.bin", new Uint8Array()),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("process timeout rejects pending requests with bounded failure", async () => {
  const rpc = createStdioTransport({
    command: process.execPath,
    args: ["-e", "setInterval(()=>{},1000)"],
    requestTimeoutMs: 10,
  });
  await expect(rpc.request("wait", {})).rejects.toThrow(
    "Transport unavailable",
  );
  await rpc.close();
});
test("Codex process launch disables ambient integrations", () => {
  const launch = codexCommand();
  expect(launch.args).toContain("mcp_servers={}");
  expect(launch.args).toContain("plugins={}");
  expect(launch.args).toContain("apps={}");
  expect(launch.args).toContain("memories");
});
