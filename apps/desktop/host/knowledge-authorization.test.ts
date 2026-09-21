import { expect, test } from "vitest";
import { createDesktopAuthorization } from "./authorization.js";

const operation = () => ({ signal: new AbortController().signal, remainingMs: () => 1000 });
const descriptor = (method = "knowledge.search", background = false) => ({
  operationId: crypto.randomUUID(),
  method,
  params: {},
  background,
  assessmentDestination: "gpt-5.6-terra",
});
const facts = (action = "knowledge.search") => ({
  subject: {
    type: "user",
    id: "local-owner",
    properties: { locality: "device", scope: "global-knowledge" },
  },
  action: { name: action },
  resource: {
    type: "knowledge-store",
    id: "local-global",
    properties: { locality: "device", scope: "global-knowledge" },
  },
});

test("knowledge leases retain local policy and reject unrelated disclosure or forged callers", async () => {
  const host = createDesktopAuthorization();
  const lease = host.knowledge().admit(descriptor(), operation());
  expect(await lease.authorizer.authorize(facts(), lease.operation)).toEqual({ decision: true });
  expect(await lease.authorizer.authorize(facts("knowledge.disclose"), lease.operation)).toEqual({
    kind: "failure",
    code: "invalid_facts",
  });
  expect(
    await lease.authorizer.authorize(
      { ...facts(), subject: { ...facts().subject, id: "someone-else" } },
      lease.operation,
    ),
  ).toEqual({ kind: "failure", code: "invalid_facts" });
  lease.dispose();
  host.shutdown();
});

test("knowledge invalidation cancels awaited decisions and refuses their late allow", async () => {
  let entered!: () => void, release!: (value: { decision: boolean }) => void;
  const entry = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const host = createDesktopAuthorization({
    authorize: () => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const admission = descriptor();
  const lease = host.knowledge().admit(admission, operation());
  const pending = lease.authorizer.authorize(facts(), lease.operation);
  await entry;
  host.invalidate(admission.operationId);
  expect(lease.isCurrent()).toBe(false);
  expect(lease.operation.signal.aborted).toBe(true);
  expect(await pending).toEqual({ kind: "failure", code: "cancelled" });
  release({ decision: true });
  lease.dispose();
  host.shutdown();
});

test("knowledge admission rejects a store or model destination outside the local binding", async () => {
  const host = createDesktopAuthorization({ authorize: async () => ({ decision: true }) });
  const lease = host.knowledge().admit(
    {
      ...descriptor("knowledge.get"),
      params: { type: "source", origin: "synthetic", id: "admitted", revision: "r1" },
    },
    operation(),
  );
  const other = {
    ...facts("knowledge.get"),
    resource: { ...facts().resource, type: "knowledge-store", id: "another-store" },
  };
  expect(await lease.authorizer.authorize(other, lease.operation)).toEqual({
    kind: "failure",
    code: "invalid_facts",
  });
  const assessment = host.knowledge().admit(descriptor("knowledge.assess", true), operation());
  expect(
    await assessment.authorizer.authorize(
      {
        ...facts("assess"),
        resource: {
          ...facts().resource,
          properties: { ...facts().resource.properties, destination: "unadmitted-model" },
        },
        context: { destination: "unadmitted-model" },
      },
      assessment.operation,
    ),
  ).toEqual({ kind: "failure", code: "invalid_facts" });
  lease.dispose();
  assessment.dispose();
  host.shutdown();
});

test("nested background reads share the host background pool without borrowing foreground", async () => {
  let entered = 0;
  const host = createDesktopAuthorization({
    authorize: () => {
      entered++;
      return new Promise(() => {});
    },
  });
  const background = host.knowledge().admit(descriptor("knowledge.search", true), operation());
  const foreground = host.knowledge().admit(descriptor(), operation());
  const pending = Array.from({ length: 12 }, () =>
    background.authorizer.authorize(facts(), background.operation),
  );
  expect(await background.authorizer.authorize(facts(), background.operation)).toEqual({
    kind: "failure",
    code: "overflow",
  });
  const front = Array.from({ length: 36 }, () =>
    foreground.authorizer.authorize(facts(), foreground.operation),
  );
  expect(await foreground.authorizer.authorize(facts(), foreground.operation)).toEqual({
    kind: "failure",
    code: "overflow",
  });
  expect(entered).toBe(16);
  host.shutdown();
  await Promise.all([...pending, ...front]);
  background.dispose();
  foreground.dispose();
});

test("disclosure binds complete destination and execution facts before entering policy", async () => {
  let calls = 0;
  const host = createDesktopAuthorization({
    authorize: async () => {
      calls++;
      return { decision: true };
    },
  });
  const binding = { executionId: "execution-a", conversationId: "conversation-a" };
  const destination = { type: "agent-provider", id: "codex", properties: {} };
  const lease = host.knowledge().admit(
    {
      ...descriptor("knowledge.prepare"),
      params: {
        request: "synthetic",
        binding,
        budget: { maxRecords: 8, maxBytes: 1024 },
      },
    },
    operation(),
  );
  const valid = {
    ...facts("knowledge.disclose"),
    resource: {
      type: "knowledge-record",
      id: "provider-owned-record",
      properties: {
        ...facts().resource.properties,
        destination,
      },
    },
    context: { destination, execution: binding },
  };
  try {
    for (const changed of [
      {
        ...valid,
        context: { ...valid.context, execution: { ...binding, executionId: "execution-b" } },
      },
      {
        ...valid,
        context: { ...valid.context, execution: { ...binding, conversationId: "conversation-b" } },
      },
      { ...valid, context: { ...valid.context, execution: { ...binding, role: "trusted" } } },
      { ...valid, context: { ...valid.context, destination: { ...destination, id: "other" } } },
      {
        ...valid,
        context: {
          ...valid.context,
          destination: { ...destination, properties: { trusted: true } },
        },
      },
      {
        ...valid,
        resource: {
          ...valid.resource,
          properties: {
            ...valid.resource.properties,
            destination: { ...destination, properties: { trusted: true } },
          },
        },
      },
    ])
      expect(await lease.authorizer.authorize(changed, lease.operation)).toEqual({
        kind: "failure",
        code: "invalid_facts",
      });
    expect(calls).toBe(0);
    expect(await lease.authorizer.authorize(valid, lease.operation)).toEqual({ decision: true });
    expect(calls).toBe(1);
  } finally {
    lease.dispose();
    host.shutdown();
  }
});
