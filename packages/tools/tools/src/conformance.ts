import { z } from "zod";
import {
  defineTool,
  type ToolDefinition,
  type ToolGateway,
  type ToolPolicy,
  type ToolEvidenceSink,
} from "./index.js";
export async function toolConformance(
  factory: (options: {
    tools: readonly ToolDefinition[];
    policy: ToolPolicy;
    evidence: ToolEvidenceSink;
    nextInvocationId: () => string;
  }) => ToolGateway,
): Promise<void> {
  const check = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  let count = 0;
  let allowed = true;
  let mode = "normal";
  let gateway: ToolGateway;
  const evidence: ToolEvidenceSink = {
    async record(e) {
      if (mode === "start_fail" && e.kind === "started") throw Error();
      if (mode === "outcome_fail" && e.kind === "finished") throw Error();
      if (mode === "revoke" && e.kind === "started") gateway.revoke(binding);
    },
  };
  const tool = defineTool({
    name: "text.count",
    description: "Count characters",
    annotations: {
      title: "Character count",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    input: z.strictObject({ text: z.string() }),
    output: z.strictObject({ count: z.number().int().nonnegative() }),
    execute: ({ text }) => {
      count++;
      return { count: text.length };
    },
  });
  let id = 0;
  gateway = factory({
    tools: [tool],
    policy: () => allowed,
    evidence,
    nextInvocationId: () => String(++id),
  });
  check(
    JSON.stringify(gateway.exposure.tools[0]?.annotations) ===
      '{"title":"Character count","readOnlyHint":true,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}',
    "tool annotations round trip through exposure",
  );
  const binding = gateway.bind("operation-a");
  const signal = new AbortController().signal;
  const ok = await gateway.invoke(
    binding,
    "text.count",
    { text: "hello" },
    signal,
  );
  check(
    ok.outcome.status === "ok" &&
      JSON.stringify(ok.outcome.value) === '{"count":5}',
    "canonical result",
  );
  check(count === 1, "one dispatch");
  const invalid = await gateway.invoke(
    binding,
    "text.count",
    { text: 7 },
    signal,
  );
  check(
    invalid.outcome.status === "failed" &&
      invalid.outcome.code === "invalid_input" &&
      count === 1,
    "invalid input dispatch",
  );
  allowed = false;
  const denied = await gateway.invoke(
    binding,
    "text.count",
    { text: "a" },
    signal,
  );
  check(
    denied.outcome.status === "failed" &&
      denied.outcome.code === "denied" &&
      count === 1,
    "read-only hint does not grant a denied invocation",
  );
  allowed = true;
  mode = "start_fail";
  const start = await gateway.invoke(
    binding,
    "text.count",
    { text: "a" },
    signal,
  );
  check(
    start.evidence === "start_failed" && count === 1,
    "unacknowledged dispatch",
  );
  mode = "outcome_fail";
  const end = await gateway.invoke(
    binding,
    "text.count",
    { text: "a" },
    signal,
  );
  check(
    end.evidence === "outcome_failed" &&
      end.outcome.status === "ok" &&
      count === 2,
    "outcome knowledge",
  );
  mode = "revoke";
  const revoked = await gateway.invoke(
    binding,
    "text.count",
    { text: "a" },
    signal,
  );
  check(
    revoked.outcome.status === "failed" &&
      revoked.outcome.code === "denied" &&
      count === 2,
    "read-only hint does not preserve a revoked grant",
  );
  mode = "normal";
  const other = gateway.bind("operation-b");
  const old = await gateway.invoke(
    binding,
    "text.count",
    { text: "a" },
    signal,
  );
  check(
    old.outcome.status === "failed" &&
      old.operationId === "operation-a" &&
      count === 2,
    "origin retargeted",
  );
  const abort = new AbortController();
  abort.abort();
  const cancelled = await gateway.invoke(
    other,
    "text.count",
    { text: "a" },
    abort.signal,
  );
  check(
    cancelled.outcome.status === "failed" &&
      cancelled.outcome.execution === "not_started" &&
      count === 2,
    "preabort dispatch",
  );
  const forged = await gateway.invoke(
    {} as typeof binding,
    "text.count",
    { text: "a" },
    signal,
  );
  check(
    forged.outcome.status === "failed" &&
      forged.outcome.code === "denied" &&
      count === 2,
    "forged binding",
  );

  // These post-dispatch invariants belong to the contract, not one provider.
  let effects = 0;
  let finish: ((value: string) => void) | undefined;
  let entered: (() => void) | undefined;
  const entry = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const cancellation = new AbortController();
  const extraTools = [
    defineTool({
      name: "invalid-output",
      description: "Invalid output",
      input: z.string(),
      output: z.string(),
      execute: () => {
        effects++;
        return 7 as unknown as string;
      },
    }),
    defineTool({
      name: "render-copy",
      description: "Renderer isolation",
      input: z.string(),
      output: z.strictObject({ text: z.string() }),
      execute: (text) => ({ text }),
      render: (value) => {
        value.text = "mutated";
        return "presentation";
      },
    }),
    defineTool({
      name: "render-failure",
      description: "Renderer failure",
      input: z.string(),
      output: z.string(),
      execute: (text) => {
        effects++;
        return text;
      },
      render: () => {
        throw Error("protected renderer error");
      },
    }),
    defineTool({
      name: "handler-failure",
      description: "Handler failure",
      input: z.string(),
      output: z.string(),
      execute: () => {
        effects++;
        throw Error("protected handler error");
      },
    }),
    defineTool({
      name: "cancel-after-entry",
      description: "Cooperative cancellation",
      input: z.string(),
      output: z.string(),
      execute: (_text, { signal }) => {
        effects++;
        check(
          signal === cancellation.signal,
          "handler receives cancellation signal",
        );
        entered?.();
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
    }),
  ];
  let invocation = 0;
  const extra = factory({
    tools: extraTools,
    policy: () => true,
    evidence: { async record() {} },
    nextInvocationId: () => `extra-${++invocation}`,
  });
  const authority = extra.bind("effects");
  const output = await extra.invoke(
    authority,
    "invalid-output",
    "text",
    signal,
  );
  check(
    output.outcome.status === "failed" &&
      output.outcome.code === "invalid_output" &&
      output.outcome.execution === "completed" &&
      effects === 1,
    "invalid output preserves one settled execution",
  );
  const render = await extra.invoke(
    authority,
    "render-copy",
    "original",
    signal,
  );
  check(
    render.outcome.status === "ok" &&
      JSON.stringify(render.outcome.value) === '{"text":"original"}' &&
      render.outcome.text === "presentation",
    "renderer cannot alter canonical value",
  );
  const renderFailure = await extra.invoke(
    authority,
    "render-failure",
    "text",
    signal,
  );
  check(
    renderFailure.outcome.status === "failed" &&
      renderFailure.outcome.code === "render_failed" &&
      renderFailure.outcome.execution === "completed" &&
      effects === 2,
    "render failure preserves settlement",
  );
  const handlerFailure = await extra.invoke(
    authority,
    "handler-failure",
    "text",
    signal,
  );
  check(
    handlerFailure.outcome.status === "failed" &&
      handlerFailure.outcome.code === "handler_failed" &&
      handlerFailure.outcome.execution === "unknown" &&
      effects === 3,
    "handler failure preserves uncertainty",
  );
  let settled = false;
  const pending = extra
    .invoke(authority, "cancel-after-entry", "text", cancellation.signal)
    .then((result) => {
      settled = true;
      return result;
    });
  await entry;
  cancellation.abort();
  await Promise.resolve();
  check(!settled, "cancellation must wait for handler settlement");
  finish?.("done");
  const after = await pending;
  check(
    after.outcome.status === "failed" &&
      after.outcome.code === "cancelled" &&
      after.outcome.execution === "completed" &&
      effects === 4,
    "cancellation after entry cannot retry or claim rollback",
  );
}
