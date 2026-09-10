// @ts-check
// Wire-specific test fixtures stay outside the exported contract suite.
import { z } from "zod";
import { createSyntheticDriver } from "@drawloom/synthetic-agent";
import {
  createCodexDriver,
  createCodexToolBridge,
} from "@drawloom/codex-agent";
import { createLocalToolGateway } from "@drawloom/local-tools";
import { defineTool } from "@drawloom/tools";
/** @returns {import('@drawloom/agent/conformance').AgentConformanceFixture} */
export function syntheticAgentFixture() {
  let context = "";
  /** @type {(value:string)=>void} */ let finish = () => {};
  return {
    driver: createSyntheticDriver((_text, supplied) => {
      context = supplied;
      return new Promise((resolve) => {
        finish = resolve;
      });
    }),
    contextText: () => context,
    async complete() {
      finish("hello");
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}
/** @returns {import('@drawloom/agent/conformance').AgentConformanceFixture} */
export function codexAgentFixture() {
  /** @type {(message:import('@drawloom/host').RpcMessage)=>void} */ let receive =
    () => {};
  let turn = "";
  let turns = 0;
  let context = "";
  let steering = "";
  let interruptions = 0;
  let allowed = false;
  let effects = 0;
  let sequence = 0;
  let rpcId = 0;
  /** @type {unknown[]} */ const responses = [];
  /** @type {Map<number,{kind:string,index:number}>} */ const callbacks =
    new Map();
  /** @type {Map<string,string>} */ const operations = new Map();
  const gateway = createLocalToolGateway({
    tools: [
      defineTool({
        name: "text.inspect",
        description: "Inspect text",
        input: z.strictObject({ text: z.string() }),
        output: z.string(),
        execute: ({ text }) => {
          effects++;
          return text;
        },
      }),
    ],
    policy: () => allowed,
    evidence: { async record() {} },
    nextInvocationId: () => String(++sequence),
  });
  const bridge = createCodexToolBridge(gateway);
  let advertised = structuredClone(gateway.exposure);
  /** @type {import('@drawloom/host').RpcTransport} */ const transport = {
    async request(method, params) {
      const p = z.record(z.string(), z.unknown()).parse(params);
      if (method === "initialize") return { userAgent: "codex/0.153.4" };
      if (method === "thread/start" || method === "thread/resume") {
        context = String(p.developerInstructions);
        return { thread: { id: "private-thread" }, approvalsReviewer: 'user' };
      }
      if (method === "turn/start") {
        context += " " + JSON.stringify(p.additionalContext);
        turn = "private-turn-" + ++turns;
        return { turn: { id: turn } };
      }
      if (method === "turn/steer") steering = JSON.stringify(p);
      if (method === "turn/interrupt") interruptions++;
      return {};
    },
    notify() {},
    respond(id, result) {
      const callback = callbacks.get(Number(id));
      if (!callback) throw Error("Unknown fixture callback");
      const reply = z.record(z.string(), z.unknown()).parse(result);
      responses.push({
        kind: callback.kind,
        index: callback.index,
        value:
          callback.kind === "approval"
            ? reply.decision
            : reply.action === "cancel"
              ? null
              : reply.content,
      });
    },
    subscribe(handler) {
      receive = handler;
      return () => {
        receive = () => {};
      };
    },
    async close() {
      receive = () => {};
    },
  };
  const driver = createCodexDriver({
    connect: async () => transport,
    store: {
      async get() {
        return undefined;
      },
      async set() {},
    },
    projection: (exposure) => {
      advertised = structuredClone(exposure);
      return {};
    },
    onTurnAccepted(thread, providerTurn, operation) {
      operations.set(operation, providerTurn);
      bridge.publish(thread, providerTurn, gateway.bind(operation));
    },
    onTurnFinished: (thread, providerTurn) =>
      bridge.retire(thread, providerTurn),
  });
  return {
    driver,
    contextText: () => context,
    async complete() {
      const params = { threadId: "private-thread", turnId: turn };
      receive({
        method: "item/agentMessage/delta",
        params: { ...params, itemId: "private-message", delta: "hel" },
      });
      receive({
        method: "item/agentMessage/delta",
        params: { ...params, itemId: "private-message", delta: "lo" },
      });
      receive({
        method: "item/completed",
        params: {
          ...params,
          item: {
            id: "private-message",
            type: "agentMessage",
            phase: "final_answer",
            text: "hello",
          },
        },
      });
      receive({
        method: "turn/completed",
        params: {
          threadId: "private-thread",
          turn: { id: turn, status: "completed" },
        },
      });
    },
    controls: {
      steeringText: () => steering,
      interruptCount: () => interruptions,
      async confirmInterruption() {
        receive({
          method: "turn/completed",
          params: {
            threadId: "private-thread",
            turn: { id: turn, status: "interrupted" },
          },
        });
      },
    },
    interactions: {
      responses: () => responses,
      async request() {
        for (const index of [0, 1]) {
          const id = ++rpcId;
          callbacks.set(id, { kind: "approval", index });
          receive({
            id,
            method: "item/commandExecution/requestApproval",
            params: {
              threadId: "private-thread",
              turnId: turn,
              reason: "Approval " + index,
              availableDecisions: ["decline", "acceptForSession"],
            },
          });
        }
        for (const index of [0, 1]) {
          const id = ++rpcId;
          callbacks.set(id, { kind: "input", index });
          receive({
            id,
            method: "mcpServer/elicitation/request",
            params: {
              threadId: "private-thread",
              turnId: turn,
              message: "Input " + index,
              requestedSchema: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
                additionalProperties: false,
              },
            },
          });
        }
      },
    },
    tools: {
      exposure: gateway.exposure,
      advertised: () => advertised,
      allow: (value) => {
        allowed = value;
      },
      effects: () => effects,
      async invoke(operationId) {
        const raw = await bridge.call(
          {
            callId: "call",
            "x-codex-turn-metadata": {
              thread_id: "private-thread",
              turn_id: operations.get(operationId),
            },
          },
          "text.inspect",
          { text: "hello" },
          new AbortController().signal,
        );
        const result = z
          .object({
            isError: z.boolean(),
            _meta: z.object({ operationId: z.string().optional() }).optional(),
          })
          .parse(raw);
        return {
          success: !result.isError,
          ...(result._meta?.operationId
            ? { operationId: result._meta.operationId }
            : {}),
        };
      },
    },
  };
}
