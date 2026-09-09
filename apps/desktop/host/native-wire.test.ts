import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStdioTransport, createNodeJsonStore } from "@drawloom/node-host";
import { createCodexDriver } from "@drawloom/codex-agent";
import { createDesktopAssets, nativeRpcMessageByteLimit } from "./assets.js";
import { createSqliteConversationHistory } from '@drawloom/sqlite-conversation-history';
import { createHistoryCoordinator } from './history-coordinator.js';

test('unsupported native history is explicit over real stdio without disabling execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-native-unsupported-'));
  const mapping = createNodeJsonStore(join(root, 'state'));
  await mapping.set('codex:session', { threadId: 'thread', materialized: true });
  const stored = createSqliteConversationHistory(join(root, 'history.sqlite'));
  const writer = createHistoryCoordinator(stored, 'session');
  const script = `let buffer='';const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');process.stdin.on('data',d=>{buffer+=d;let n;while((n=buffer.indexOf('\\n'))>=0){const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);if(!m.id)continue;
    if(m.method==='thread/turns/list'){send({id:m.id,error:{code:-32601,message:'SECRET native diagnostic'}});continue;}
    let result={};if(m.method==='initialize')result={userAgent:'fixture'};if(m.method==='thread/resume')result={thread:{id:'thread'}};if(m.method==='turn/start')result={turn:{id:'turn'}};send({id:m.id,result});
    if(m.method==='turn/start'){send({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{id:'answer',type:'agentMessage',text:'Still works'}}});send({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed'}}});}
  }});`;
  const driver = createCodexDriver({ store: mapping, connect: async () => createStdioTransport({ command: process.execPath, args: ['-e', script] }) });
  const opened = await driver.openSession({ sessionId: 'session', context: { text: '' }, tools: { id: 'none', tools: [] } });
  if (opened.status !== 'ok') throw Error('Fixture did not open');
  const session = opened.value;
  let terminal!: (kind: string) => void;
  const done = new Promise<string>(resolve => { terminal = resolve; });
  const drain = (async () => { for await (const event of session.signals()) if (event.kind.startsWith('operation.') && event.kind !== 'operation.started') terminal(event.kind); })();
  try {
    await writer.synchronize(session.history);
    expect((await stored.status('session')).sync).toBe('unsupported');
    expect(JSON.stringify(await stored.page('session'))).not.toContain('SECRET');
    expect((await session.execute({ operationId: 'operation', text: 'fixture only' })).status).toBe('ok');
    expect(await done).toBe('operation.completed');
  } finally {
    await session.close(); await drain; await writer.close(); await stored.close();
    await rm(root, { recursive: true, force: true });
  }
}, 10000);

test("desktop real stdio captures a supported image above 4 MiB before completion and restores paged image history", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-native-wire-"));
  const assets = createDesktopAssets(join(root, "assets"));
  const stored = createSqliteConversationHistory(join(root, 'history.sqlite'));
  const writer = createHistoryCoordinator(stored, 'session');
  let captures = 0;
  const script = `const bytes=Buffer.alloc(16*1024*1024); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  const item={id:'image',type:'imageGeneration',status:'completed',result:bytes.toString('base64')};
  const send=m=>process.stdout.write(JSON.stringify(m)+'\\n'); let buffer='';
  process.stdin.on('data',d=>{buffer+=d; let n; while((n=buffer.indexOf('\\n'))>=0){const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);if(!m.id)continue;
  let result={}; if(m.method==='initialize')result={userAgent:'fixture'}; if(m.method==='thread/start')result={thread:{id:'thread'}};
  if(m.method==='turn/start')result={turn:{id:'turn'}};
  if(m.method==='thread/turns/list')result={data:[{id:'turn',status:'completed'}],nextCursor:null};
  if(m.method==='thread/items/list'){if(m.params.limit!==1)throw Error('Image pages must be bounded');result={data:[{turnId:'turn',item}],nextCursor:null};}
  send({id:m.id,result});if(m.method==='turn/start'){send({method:'item/completed',params:{threadId:'thread',turnId:'turn',item}});send({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed'}}});}
  }});`;
  const driver = createCodexDriver({
    store: createNodeJsonStore(join(root, "state")),
    captureImage: async result => { captures++; return assets.captureImage(result); },
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
      if (event.kind === 'artifact.available') await writer.write({ id: event.operationId + ':' + event.messageId, role: 'assistant', text: 'Image result', assets: [event.asset], operationId: event.operationId, state: 'complete' });
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
    await writer.synchronize(session.history);
    expect(writer.error).toBe('');
    expect((await stored.page('session')).entries[0]?.assets[0]?.size).toBe(16777216);
    expect((await stored.page('session')).entries).toHaveLength(1);
    expect(captures).toBe(1);
    await writer.synchronize(session.history);
    expect(captures).toBe(1);
  } finally {
    await session.close();
    await drain;
    await writer.close(); await stored.close();
    await rm(root, { recursive: true, force: true });
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
