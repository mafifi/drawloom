import { expect, test } from "vitest";
import { createWorkerAuthorizer } from "./src/worker-authorization.js";
import { createLocalKnowledgeClient } from "./src/client.js";
import { createDesktopAuthorization } from "../../../apps/desktop/host/authorization.js";
import type { RpcMessage, RpcTransport } from "@drawloom/host";
import { KnowledgeWorkerAuthorizationRequestSchema } from "@drawloom/knowledge";

const facts = {
  subject: {
    type: "user",
    id: "local-owner",
    properties: { locality: "device", scope: "global-knowledge" },
  },
  action: { name: "knowledge.search" },
  resource: {
    type: "knowledge-store",
    id: "local-global",
    properties: { locality: "device", scope: "global-knowledge" },
  },
};
const search = { query: "secret", mode: "lexical" as const, limit: 10, maxBytes: 10000 };
const scope = () => ({
  lifetime: crypto.randomUUID(),
  operationId: crypto.randomUUID(),
  remainingMs: 1000,
  params: {},
});

function transport() {
  let message!: (value: RpcMessage) => void, lost!: () => void, envelope!: ReturnType<typeof scope>;
  let resolve!: (value: unknown) => void;
  const replies: unknown[] = [];
  const notices: string[] = [];
  const rpc: RpcTransport = {
    request(method, params) {
      if (method === "knowledge.close") return Promise.resolve({});
      envelope = params as typeof envelope;
      return new Promise((done) => {
        resolve = done;
      });
    },
    notify(method) {
      notices.push(method);
    },
    respond(_id, result) {
      replies.push(result);
    },
    subscribe(receive, failure) {
      message = receive;
      lost = failure;
      return () => {};
    },
    async close() {},
  };
  return {
    rpc,
    replies,
    notices,
    message: (value: RpcMessage) => message(value),
    lost: () => lost(),
    resolve: (value: unknown) => resolve(value),
    envelope: () => envelope,
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("authority is captured before asynchronous host configuration loading", async () => {
  const fixture = transport(),
    host = createDesktopAuthorization();
  let finish!: (value: string) => void;
  const client = createLocalKnowledgeClient(fixture.rpc, host.knowledge(), {
    assessmentDestination: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = client.search(search);
  host.invalidate();
  finish("gpt-5.6-terra");
  const raced = await Promise.race([pending, tick().then(() => "still pending")]);
  expect(raced).toEqual({ kind: "failure", code: "cancelled" });
  await client.close();
  host.shutdown();
});

for (const mutation of [
  "lifetime",
  "operation",
  "duplicate",
  "malformed",
  "method",
  "subject",
] as const) {
  test(`host rejects ${mutation} reverse authority and settles its enclosing read`, async () => {
    const transportFixture = transport();
    const host = createDesktopAuthorization();
    const client = createLocalKnowledgeClient(transportFixture.rpc, host.knowledge());
    const pending = client.search(search);
    await tick();
    const admitted = transportFixture.envelope();
    const params = {
      lifetime: admitted.lifetime,
      operationId: admitted.operationId,
      decisionId: 1,
      request: facts,
    };
    if (mutation === "duplicate") {
      transportFixture.message({ id: "a", method: "knowledge.authorize", params });
      await tick();
    }
    const changed =
      mutation === "lifetime"
        ? { ...params, lifetime: crypto.randomUUID() }
        : mutation === "operation"
          ? { ...params, operationId: crypto.randomUUID() }
          : mutation === "malformed"
            ? { ...params, injected: true }
            : mutation === "subject"
              ? { ...params, request: { ...facts, subject: { ...facts.subject, id: "forged" } } }
              : params;
    transportFixture.message({
      id: "b",
      method: mutation === "method" ? "unexpected" : "knowledge.authorize",
      params: changed,
    });
    await tick();
    const reply = transportFixture.replies.at(-1) as { result?: unknown; code?: string };
    expect(reply.result ?? reply).toMatchObject({ kind: "failure", code: "invalid_facts" });
    // A rejected unrelated token cannot complete the real pending operation.
    if (mutation === "operation" || mutation === "subject")
      transportFixture.resolve({ kind: "failure", code: "invalid_facts" });
    expect(await pending).toEqual({ kind: "failure", code: "invalid_facts" });
    await client.close();
    host.shutdown();
  });
}

test("all client reads retain parent cancellation and transport loss settles pending work", async () => {
  for (const kind of ["cancel", "lost", "close"] as const) {
    const fixture = transport(),
      host = createDesktopAuthorization();
    const client = createLocalKnowledgeClient(fixture.rpc, host.knowledge());
    const controller = new AbortController();
    const pending = client.get(
      { type: "source", origin: "synthetic", id: "missing", revision: "r1" },
      { signal: controller.signal, remainingMs: () => 1000 },
    );
    await tick();
    if (kind === "cancel") controller.abort();
    else if (kind === "lost") fixture.lost();
    else await client.close();
    expect(await pending).toEqual({
      kind: "failure",
      code: kind === "cancel" ? "cancelled" : kind === "lost" ? "unavailable" : "shutdown",
    });
    fixture.resolve({ kind: "ok", record: {} });
    await client.close();
    host.shutdown();
  }
});

test("worker rejects mismatched, duplicate and unsolicited responses without adopting authority", async () => {
  let sent: { id: string; params: unknown } | undefined;
  const worker = createWorkerAuthorizer(async (message) => {
    sent = message as typeof sent;
  });
  const admitted = scope();
  const pending = worker.run(admitted, (_params, operation) =>
    worker.authorizer.authorize(facts, operation),
  );
  const request = KnowledgeWorkerAuthorizationRequestSchema.parse(sent!.params);
  expect(worker.response("unsolicited", { ...request, result: { decision: true } })).toBe(false);
  expect(
    worker.response(sent!.id, {
      lifetime: request.lifetime,
      operationId: crypto.randomUUID(),
      decisionId: request.decisionId,
      result: { decision: true },
    }),
  ).toBe(false);
  expect(await pending).toEqual({ kind: "failure", code: "malformed_result" });
  expect(worker.response(sent!.id, { ...request, result: { decision: true } })).toBe(false);
  await expect(worker.run(admitted, async () => true)).rejects.toThrow(
    "Invalid operation correlation",
  );
  worker.close();
});

test("worker unanswered, cancelled and shutdown decisions settle without late authority", async () => {
  for (const kind of ["timeout", "cancel", "shutdown"] as const) {
    const worker = createWorkerAuthorizer(async () => {});
    const admitted = { ...scope(), remainingMs: 25 };
    const pending = worker.run(admitted, (_params, operation) =>
      worker.authorizer.authorize(facts, operation),
    );
    if (kind === "cancel")
      worker.cancel({ lifetime: admitted.lifetime, operationId: admitted.operationId });
    if (kind === "shutdown") worker.close();
    expect(await pending).toMatchObject({
      kind: "failure",
      code:
        kind === "shutdown" ? "shutdown" : kind === "timeout" ? "budget_exhausted" : "cancelled",
    });
    worker.close();
  }
});
