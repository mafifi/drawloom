import { test, expect } from "bun:test";
import { access, mkdir, mkdtemp, open, rename, rm, symlink, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RpcRequestError } from "@drawloom/host";
test('a project-bound store rejects root replacement before its first read',async()=>{
  const root=await mkdtemp(join(tmpdir(),'drawloom-bound-root-'));
  const working=join(root,'working');await mkdir(working);
  const facts=await stat(working,{bigint:true});
  const store=createNodeAssetStore(working,{device:String(facts.dev),inode:String(facts.ino)});
  await rename(working,join(root,'original'));await mkdir(working);await writeFile(join(working,'file.txt'),'replacement');
  try{await expect(store.open('file.txt')).rejects.toThrow('root changed');}finally{await rm(root,{recursive:true,force:true});}
});
test("RPC rejection retains only the protocol code and leaves transport usable", async () => {
  const rpc = createStdioTransport({
    command: process.execPath,
    args: ["-e", `let b='';process.stdin.on('data',d=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const m=JSON.parse(b.slice(0,i));b=b.slice(i+1);process.stdout.write(JSON.stringify(m.method==='ok'?{id:m.id,result:true}:{id:m.id,error:{code:m.params.code,message:'private provider text',data:{secret:'private data'}}})+'\\n')}})`],
  });
  try {
    for (const code of [-32601, -32602]) {
      const error = await rpc.request("reject", { code }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(RpcRequestError);
      expect(error).toMatchObject({ code, message: "Provider request rejected" });
      expect(JSON.stringify(error)).not.toContain("private");
      expect(error).not.toHaveProperty("cause");
    }
    expect(await rpc.request("ok", {})).toBe(true);
  } finally { await rpc.close(); }
});
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
test('asset readers reject symlink roots, symlink files and non-files', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'drawloom-asset-kinds-'));
  const target = join(parent, 'target');
  const rootLink = join(parent, 'root-link');
  try {
    await mkdir(target);
    await writeFile(join(target, 'outside.bin'), new Uint8Array([1]));
    await symlink(target, rootLink);
    await expect(createNodeAssetStore(rootLink).open('outside.bin')).rejects.toThrow();

    const root = join(parent, 'root');
    await mkdir(root);
    await symlink(join(target, 'outside.bin'), join(root, 'linked.bin'));
    await mkdir(join(root, 'directory.bin'));
    const assets = createNodeAssetStore(root);
    await expect(assets.open('linked.bin')).rejects.toThrow();
    await expect(assets.open('directory.bin')).rejects.toThrow();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
test('opening a missing asset root does not create it', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'drawloom-missing-asset-root-'));
  const root = join(parent, 'missing');
  try {
    await expect(createNodeAssetStore(root).open('file.bin')).rejects.toThrow();
    await expect(access(root)).rejects.toThrow();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
test('asset stores reject replacement of their validated root', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'drawloom-asset-root-'));
  const root = join(parent, 'root');
  const moved = join(parent, 'moved');
  try {
    const assets = createNodeAssetStore(root);
    await assets.write('before.bin', new Uint8Array([1]));
    await rename(root, moved);
    await mkdir(root);
    await writeFile(join(root, 'before.bin'), new Uint8Array([2]));
    await expect(assets.open('before.bin')).rejects.toThrow('Asset root changed');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
test('whole-buffer asset reads enforce the managed ceiling before allocation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-asset-read-limit-'));
  try {
    const file = await open(join(root, 'oversized.bin'), 'w');
    await file.truncate(256 * 1024 * 1024 + 1);
    await file.close();
    await expect(createNodeAssetStore(root).read('oversized.bin')).rejects.toThrow('Asset byte limit exceeded');
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
