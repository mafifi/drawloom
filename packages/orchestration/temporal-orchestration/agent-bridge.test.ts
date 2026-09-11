import { test, expect } from "bun:test";
import { createAgentBridge } from "./src/agent-bridge.js";
import { createSyntheticDriver } from "@drawloom/synthetic-agent";
import type { Json } from "@drawloom/orchestration";
import { codexAgentFixture } from "../../../scripts/agent-conformance-fixtures.mjs";
import { agentTasks, matchTaskHandlers, type RegisteredTaskHandler } from '@drawloom/orchestration';
import { dispatchAgentTask } from './src/agent-task-host.js';
import { createReceiptDispatcher } from './src/receipts.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('local shutdown is not native cancellation; explicit run cancellation still reaches owned agents', async () => {
  for (const explicit of [false, true]) {
    const root = await mkdtemp(join(tmpdir(), 'drawloom-agent-pause-'));
    const data = new Map<string, Json>();
    const bridge = createAgentBridge('owner/run', createSyntheticDriver(() => new Promise(() => {})), {
      get: async key => data.get(key), set: async (key, value) => { data.set(key, value); },
    }, { context:{text:''}, tools:{id:'none',tools:[]} });
    let cancellations = 0;
    const observedBridge = { ...bridge, requestCancellation: async () => { cancellations++; return bridge.requestCancellation(); } };
    const tasks = [agentTasks.create, agentTasks.submit];
    const handlers: RegisteredTaskHandler[] = tasks.map(task => ({ id:task.id, version:task.version, run: (input, context) => dispatchAgentTask(observedBridge, task.id, input, context) }));
    const dispatcher = createReceiptDispatcher(root, 'owner', matchTaskHandlers({ workflows:[], tasks }, handlers));
    const request = (task:string, stepId:string, input:Json) => ({ task, version:'1',runId:'owner/run',stepId:'owner/run/'+stepId,input,attempt:1,maxAttempts:1 });
    try {
      const session = await dispatcher.dispatch(request('agent.create','create','session'));
      await dispatcher.dispatch(request('agent.submit','submit',{ sessionId:session, operation:{operationId:'operation',text:'synthetic'} }));
      if (explicit) dispatcher.cancel('owner/run');
      else await dispatcher.close();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(cancellations > 0).toBe(explicit);
    } finally { await dispatcher.close(); await bridge.close(); await rm(root, {recursive:true,force:true}); }
  }
});

test("owned agent receipt survives lost submission response without repeat and preserves native approval authority", async () => {
  const fixture = codexAgentFixture();
  const data = new Map<string, Json>();
  const store = { get: async (key: string) => data.get(key), set: async (key: string, value: Json) => { data.set(key, value); } };
  let executions = 0;
  const driver = {
    driverId: fixture.driver.driverId,
    async openSession(input: Parameters<typeof fixture.driver.openSession>[0]) {
      const opened = await fixture.driver.openSession(input);
      if (opened.status !== "ok") return opened;
      return { status: "ok" as const, value: { ...opened.value, async execute(operation: Parameters<typeof opened.value.execute>[0]) { executions++; await opened.value.execute(operation); throw Error("Lost response"); } } };
    },
  };
  const authority = { context: { text: "" }, tools: fixture.tools!.exposure };
  const bridge = createAgentBridge("owned", driver, store, authority);
  try {
    const session = await bridge.create("one");
    expect((await bridge.submit(session, { operationId: "operation", text: "synthetic" })).status).toBe("unknown");
    expect((await bridge.submit(session, { operationId: "operation", text: "synthetic" })).status).toBe("unknown");
    expect(executions).toBe(1);
    const reopened = createAgentBridge("owned", driver, store, authority);
    expect((await reopened.inspect(session, "operation")).status).toBe("unknown");
    await expect(reopened.create("one")).rejects.toThrow("cannot reattach");
    await fixture.interactions!.request();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const approval = bridge.interactions(session).approvals[0]!;
    await bridge.resolveApproval(session, { approvalId: approval.approvalId, optionId: approval.options[0]!.optionId });
    expect((await fixture.tools!.invoke("operation")).success).toBe(false);
    await fixture.complete();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await bridge.inspect(session, "operation")).status).toBe("completed");
    expect((await createAgentBridge("owned", driver, store, authority).inspect(session, "operation")).status).toBe("completed");
  } finally { await bridge.close(); }
});
test("owned sequential sessions deduplicate opens and reject conflicting operations and foreign sessions", async () => {
  const data = new Map<string, Json>();
  let complete!: (value: string) => void;
  const bridge = createAgentBridge("scope", createSyntheticDriver(() => new Promise((resolve) => { complete = resolve; })), { get: async (key) => data.get(key), set: async (key, value) => { data.set(key, value); } }, { context: { text: "" }, tools: { id: "none", tools: [] } });
  try {
    const [one, duplicate] = await Promise.all([bridge.create("session"), bridge.create("session")]);
    expect(one).toBe(duplicate);
    await bridge.submit(one, { operationId: "one", text: "first" });
    await expect(bridge.submit(one, { operationId: "one", text: "conflict" })).rejects.toThrow();
    await expect(bridge.submit(one, { operationId: "two", text: "concurrent" })).rejects.toThrow();
    complete("private response stays native");
    expect((await bridge.result(one, "one")).status).toBe("completed");
    await bridge.submit(one, { operationId: "two", text: "followup" });
    complete("done");
    expect((await bridge.result(one, "two")).status).toBe("completed");
    await expect(bridge.inspect("other", "one")).rejects.toThrow();
    expect(JSON.stringify([...data.values()])).not.toContain("private response");
  } finally { await bridge.close(); }
});
