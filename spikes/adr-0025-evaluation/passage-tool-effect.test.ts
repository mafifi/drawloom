import { expect, test } from "bun:test";
import { z } from "zod";
import { createCodexDriver, createCodexToolBridge } from "@drawloom/codex-agent";
import type { AgentSessionSignal } from "@drawloom/agent";
import type { RpcMessage, RpcTransport } from "@drawloom/host";
import { createLocalToolGateway } from "@drawloom/local-tools";
import { defineTool, type ToolBinding } from "@drawloom/tools";
import { mcpReviewConfiguration } from "../../apps/desktop/host/composition.ts";
import { createBraintrustRunner } from "./braintrust.ts";
import {
  passageAuthorityScorer,
  passageEffectScorer,
  passageToolSelectionScorer,
  type PassageEffectOutput,
} from "./passage-tool-effect.ts";

type Scenario = "approved" | "denied" | "revoked" | "mismatched" | "stale";

function harness() {
  let receive: (message: RpcMessage) => void = () => {};
  let replies: { id: string | number; result: unknown }[] = [];
  let calls = 0;
  let text = "The west gate opens at eight.";
  let binding: ToolBinding | undefined;
  let grant = true;
  const transport: RpcTransport = {
    async request(method) {
      if (method === "initialize") return { userAgent: "codex/0.153.4" };
      if (method === "thread/start") return { thread: { id: "effect-thread" }, approvalsReviewer: "user" };
      if (method === "turn/start") return { turn: { id: "effect-turn" } };
      return {};
    },
    notify() {},
    respond(id, result) { replies.push({ id, result }); },
    subscribe(next) { receive = next; return () => { receive = () => {}; }; },
    async close() {},
  };
  const gateway = createLocalToolGateway({
    tools: [defineTool({
      name: "passage.revise",
      description: "Replace one synthetic passage without accepting it.",
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      input: z.strictObject({ sourceRevision: z.literal("revision-1"), replacement: z.string() }),
      output: z.strictObject({ text: z.string(), accepted: z.literal(false) }),
      execute: ({ replacement }) => { calls += 1; text = replacement; return { text, accepted: false as const }; },
    })],
    policy: () => grant,
    evidence: { async record() {} },
    nextInvocationId: () => crypto.randomUUID(),
  });
  const bridge = createCodexToolBridge(gateway);
  const driver = createCodexDriver({
    connect: async () => transport,
    store: { async get() { return undefined; }, async set() {} },
    projection: exposure => ({ drawloom: { url: "http://127.0.0.1:1/mcp", ...mcpReviewConfiguration(exposure) } }),
    onTurnAccepted(thread, turn, operation) { binding = gateway.bind(operation); bridge.publish(thread, turn, binding); },
    onTurnFinished(thread, turn) { bridge.retire(thread, turn); },
  });
  return {
    driver,
    bridge,
    emit(message: RpcMessage) { receive(message); },
    get binding() { return binding; },
    get calls() { return calls; },
    get text() { return text; },
    get replies() { return replies; },
    revoke() { grant = false; if (binding) gateway.revoke(binding); },
  };
}

function approval(id: number, replacement: string): RpcMessage {
  return { id, method: "mcpServer/elicitation/request", params: {
    threadId: "effect-thread",
    turnId: "effect-turn",
    serverName: "drawloom",
    mode: "form",
    message: "Allow the synthetic passage revision?",
    requestedSchema: { type: "object", properties: {} },
    _meta: { codex_approval_kind: "mcp_tool_call", tool_title: "Revise passage", tool_params: { sourceRevision: "revision-1", replacement } },
  } };
}

async function runScenario(scenario: Scenario): Promise<PassageEffectOutput> {
  const f = harness();
  const opened = await f.driver.openSession({
    sessionId: crypto.randomUUID(),
    context: { text: "Only the synthetic passage tool is available." },
    tools: { id: "effect-tools", tools: [{
      name: "passage.revise", description: "Replace one synthetic passage without accepting it.",
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      inputSchema: { type: "object" }, outputSchema: { type: "object" },
    }] },
  });
  if (opened.status !== "ok") throw Error(opened.failure.message);
  const session = opened.value;
  const iterator = session.signals()[Symbol.asyncIterator]();
  const next = async () => (await iterator.next()).value as AgentSessionSignal;
  const terminal = async () => {
    while (true) {
      const event = await next();
      if (event.kind.startsWith("operation.") && event.kind !== "operation.started") return event;
    }
  };
  const replacement = "At eight, the west gate opens.";
  try {
    expect((await session.execute({ operationId: scenario, text: "Revise the passage." })).status).toBe("ok");
    expect((await next()).kind).toBe("operation.started");
    f.emit(approval(17, replacement));
    const requested = await next();
    if (requested.kind !== "approval.requested") throw Error("No native review request");
    if (scenario === "mismatched") {
      f.emit(approval(17, "The east gate opens at nine."));
      expect((await terminal()).kind).toBe("operation.failed");
      expect((await session.resolveApproval({ approvalId: requested.request.approvalId, optionId: "approve" })).status).toBe("rejected");
    } else if (scenario === "stale") {
      f.emit({ method: "turn/completed", params: { threadId: "effect-thread", turn: { id: "effect-turn", status: "completed" } } });
      expect((await terminal()).kind).toBe("operation.completed");
      expect((await session.resolveApproval({ approvalId: requested.request.approvalId, optionId: "approve" })).status).toBe("rejected");
    } else {
      const optionId = scenario === "denied" ? "deny" : "approve";
      expect((await session.resolveApproval({ approvalId: requested.request.approvalId, optionId })).status).toBe("ok");
      if (scenario === "revoked") f.revoke();
      if (scenario !== "denied") {
        if (!f.binding) throw Error("No operation binding");
        await f.bridge.call(
          { callId: "call", "x-codex-turn-metadata": { thread_id: "effect-thread", turn_id: "effect-turn" } },
          "passage.revise",
          { sourceRevision: "revision-1", replacement },
          new AbortController().signal,
        );
      }
      f.emit({ method: "turn/completed", params: { threadId: "effect-thread", turn: { id: "effect-turn", status: "completed" } } });
      expect((await terminal()).kind).toBe("operation.completed");
    }
    return {
      selectedTool: "passage.revise",
      scenario,
      before: "The west gate opens at eight.",
      after: f.text,
      requestedReplacement: replacement,
      handlerCalls: f.calls,
      accepted: false,
    };
  } finally {
    if (f.binding) f.revoke();
    await session.close();
  }
}

test("native approval, denial, revocation and invalidated approvals retain separate tool, authority and effect findings", async () => {
  const outputs = await Promise.all(["approved", "denied", "revoked", "mismatched", "stale"].map(value => runScenario(value as Scenario)));
  expect(outputs.map(output => output.handlerCalls)).toEqual([1, 0, 0, 0, 0]);
  expect(outputs[0]?.after).toBe("At eight, the west gate opens.");
  expect(outputs.slice(1).every(output => output.after === output.before)).toBe(true);

  const response = await createBraintrustRunner().run({
    experimentId: "scripted-passage-effects",
    mode: "assess-existing",
    cases: outputs.map((output, index) => ({
      id: `opaque-${index + 1}`,
      revision: "1",
      input: { editingRequest: "Revise the passage.", source: output.before },
      suppliedOutput: output,
      evidence: [],
    })),
    scorers: [passageToolSelectionScorer, passageAuthorityScorer, passageEffectScorer],
    repetitions: 1,
    concurrency: 1,
  });
  for (const result of response.results) {
    expect(result.findings.map(finding => finding.scorerId)).toEqual([
      "passage-tool-selection",
      "passage-native-authority",
      "passage-effect",
    ]);
    expect(result.findings[0]?.score).toBe(1);
    expect(result.findings[1]?.score).toBe(1);
  }
  expect(response.results[0]?.findings[2]?.score).toBe(1);
  expect(response.results.slice(1).every(result => result.findings[2]?.score === undefined)).toBe(true);
});
