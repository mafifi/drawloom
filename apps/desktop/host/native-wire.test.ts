import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStdioTransport, createNodeJsonStore } from "@drawloom/node-host";
import { createCodexDriver } from "@drawloom/codex-agent";
import { createDesktopAssets, nativeRpcMessageByteLimit } from "./assets.js";

test("desktop real stdio captures a supported image above 4 MiB before completion and restores paged image history", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-native-wire-"));
  const assets = createDesktopAssets(join(root, "assets"));
  const script = `const bytes=Buffer.alloc(16*1024*1024); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  const item={id:'image',type:'imageGeneration',status:'completed',result:bytes.toString('base64')};
  const send=m=>process.stdout.write(JSON.stringify(m)+'\\n'); let buffer='';
  process.stdin.on('data',d=>{buffer+=d; let n; while((n=buffer.indexOf('\\n'))>=0){const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);if(!m.id)continue;
  let result={}; if(m.method==='initialize')result={userAgent:'fixture'}; if(m.method==='thread/start')result={thread:{id:'thread'}};
  if(m.method==='turn/start')result={turn:{id:'turn'}};
  if(m.method==='thread/turns/list')result={data:[{id:'turn'}],nextCursor:null};
  if(m.method==='thread/items/list'){if(m.params.limit!==1)throw Error('Image pages must be bounded');result={data:[{turnId:'turn',item}],nextCursor:null};}
  send({id:m.id,result});if(m.method==='turn/start'){send({method:'item/completed',params:{threadId:'thread',turnId:'turn',item}});send({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed'}}});}
  }});`;
  const driver = createCodexDriver({
    store: createNodeJsonStore(join(root, "state")),
    captureImage: assets.captureImage,
    connect: async () =>
      createStdioTransport({
        command: process.execPath,
        args: ["-e", script],
        maxMessageBytes: nativeRpcMessageByteLimit,
      }),
  });
  const opened = await driver.openSession({
    sessionId: "session",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error("open");
  const session = opened.value,
    events: { kind: string; operationId?: string }[] = [];
  let terminal!: () => void;
  const done = new Promise<void>((r) => (terminal = r));
  const drain = (async () => {
    for await (const event of session.signals()) {
      events.push(event);
      if (["operation.completed", "operation.failed"].includes(event.kind))
        terminal();
    }
  })();
  try {
    expect(
      (await session.execute({ operationId: "origin", text: "fixture" }))
        .status,
    ).toBe("ok");
    await done;
    expect(events.map((e) => e.kind)).toEqual([
      "operation.started",
      "artifact.available",
      "operation.completed",
    ]);
    expect(events.every((e) => e.operationId === "origin")).toBe(true);
    const history = await session.readHistory!();
    expect(history.status).toBe("ok");
    if (history.status === "ok")
      expect(history.value.entries[0]?.assets[0]?.size).toBe(16777216);
  } finally {
    await session.close();
    await drain;
  }
}, 15000);

test("desktop real stdio rejects an over-budget frame and closes without retry", async () => {
  const rpc = createStdioTransport({
    command: process.execPath,
    args: [
      "-e",
      `process.stdin.once('data',d=>{const m=JSON.parse(d);process.stdout.write(JSON.stringify({id:m.id,result:'x'.repeat(${nativeRpcMessageByteLimit})})+'\\n')})`,
    ],
    maxMessageBytes: nativeRpcMessageByteLimit,
  });
  try {
    await expect(rpc.request("oversized", {})).rejects.toThrow(
      "Transport unavailable",
    );
    await expect(rpc.request("again", {})).rejects.toThrow(
      "Transport unavailable",
    );
  } finally {
    await rpc.close();
  }
});
