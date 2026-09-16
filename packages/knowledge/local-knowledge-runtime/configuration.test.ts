import { expect, test } from "bun:test";
import { RpcRequestError, type RpcTransport } from "@drawloom/host";
import { createDesktopAuthorization } from "../../../apps/desktop/host/authorization.js";
import { createLocalKnowledgeClient, DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "./src/client.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const assessment = {
  requestId: "synthetic",
  payloadFingerprint: "synthetic",
  evidence: {
    roots: [
      {
        unitId: "unit",
        root: { type: "source" as const, origin: "synthetic", id: "source", revision: "r1" },
      },
    ],
    records: [],
    links: [],
    complete: true,
  },
};

test("cancelled configuration fences a still-settling write and reconciles host persisted state", async () => {
  let persisted = { ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION };
  let release!: () => void;
  let dispatched!: () => void;
  const entered = new Promise<void>((resolve) => {
    dispatched = resolve;
  });
  const host = createDesktopAuthorization();
  const authority = host.knowledge();
  const admissions: string[] = [];
  const client = createLocalKnowledgeClient(
    {
      async request(method) {
        if (method === "knowledge.configure") {
          dispatched();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          persisted = { ...persisted, assessmentModel: "synthetic-next" };
          throw new RpcRequestError(-32000); // applied write, failed post-write status
        }
        if (method === "knowledge.assess")
          return {
            kind: "failure",
            code: "rejected",
            requestId: "synthetic",
            payloadFingerprint: "synthetic",
          };
        return {};
      },
      notify() {},
      respond() {},
      subscribe() {
        return () => {};
      },
      async close() {},
    } satisfies RpcTransport,
    {
      ...authority,
      admit(admission, operation) {
        const lease = authority.admit(admission, operation);
        if (admission.method === "knowledge.assess") {
          // Destination is loaded after admission; observe it at dispatch/current check.
          const current = lease.isCurrent;
          lease.isCurrent = () => {
            admissions.push(admission.assessmentDestination);
            return current();
          };
        }
        return lease;
      },
    },
    { readConfiguration: async () => persisted },
  );
  const old = authority.admit(
    {
      operationId: crypto.randomUUID(),
      method: "knowledge.assess",
      params: assessment,
      background: true,
      assessmentDestination: persisted.assessmentModel,
    },
    { signal: new AbortController().signal, remainingMs: () => 5000 },
  );
  const controller = new AbortController();
  try {
    const pending = client
      .configure(
        { ...persisted, assessmentModel: "synthetic-next" },
        { signal: controller.signal, remainingMs: () => 5000 },
      )
      .catch(() => "rejected");
    await entered;
    expect(old.isCurrent()).toBe(false);
    controller.abort();
    expect(await Promise.race([pending, tick().then(() => "still pending")])).toBe("rejected");
    expect(await client.assess(assessment)).toMatchObject({ kind: "failure", code: "unavailable" });
    expect(admissions).not.toContain("gpt-5.6-terra");
    release();
    await tick();
    expect(await client.assess(assessment)).toMatchObject({ kind: "failure", code: "rejected" });
    expect(admissions).toContain("synthetic-next");
  } finally {
    release?.();
    old.dispose();
    await client.close();
    host.shutdown();
  }
});

for (const failure of ["transport", "store"] as const)
  test(`configuration remains unavailable after unresolved ${failure} failure`, async () => {
    let reads = 0,
      calls = 0;
    const host = createDesktopAuthorization();
    const client = createLocalKnowledgeClient(
      {
        async request(method) {
          if (method === "knowledge.close") return {};
          calls++;
          if (failure === "transport") throw Error("transport lost");
          throw new RpcRequestError(-32000);
        },
        notify() {},
        respond() {},
        subscribe() {
          return () => {};
        },
        async close() {},
      },
      host.knowledge(),
      {
        readConfiguration: async () => {
          reads++;
          if (failure === "store" && reads >= 3) throw Error("storage unavailable");
          return DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION;
        },
      },
    );
    try {
      await expect(
        client.configure({ ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION, assessmentModel: "changed" }),
      ).rejects.toThrow();
      expect(await client.assess(assessment)).toMatchObject({
        kind: "failure",
        code: "unavailable",
      });
      expect(calls).toBe(1);
      // No read-after-loss can turn a still-settling write into a completed one.
      expect(reads).toBe(failure === "transport" ? 2 : 3);
    } finally {
      await client.close();
      host.shutdown();
    }
  });

test("identical persisted configuration refresh preserves existing authority", async () => {
  const host = createDesktopAuthorization();
  const authority = host.knowledge();
  let invalidations = 0;
  const client = createLocalKnowledgeClient(
    {
      async request() {
        throw new RpcRequestError(-32000);
      },
      notify() {},
      respond() {},
      subscribe() {
        return () => {};
      },
      async close() {},
    },
    {
      ...authority,
      invalidate() {
        invalidations++;
        authority.invalidate();
      },
    },
    {
      readConfiguration: async () => DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION,
    },
  );
  const old = authority.admit(
    {
      operationId: crypto.randomUUID(),
      method: "knowledge.assess",
      params: assessment,
      background: true,
      assessmentDestination: "gpt-5.6-terra",
    },
    { signal: new AbortController().signal, remainingMs: () => 5000 },
  );
  try {
    await expect(client.configure(DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION)).rejects.toThrow();
    expect(old.isCurrent()).toBe(true);
    expect(invalidations).toBe(0);
    // The completed refresh releases serialization even when post-write status fails.
    await expect(client.configure(DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION)).rejects.toThrow();
    expect(invalidations).toBe(0);
  } finally {
    old.dispose();
    await client.close().catch(() => {});
    host.shutdown();
  }
});

test("cancellation remains responsive while trusted configuration is being read", async () => {
  const host = createDesktopAuthorization();
  let requests = 0;
  const client = createLocalKnowledgeClient(
    {
      async request() {
        requests++;
        return {};
      },
      notify() {},
      respond() {},
      subscribe() {
        return () => {};
      },
      async close() {},
    },
    host.knowledge(),
    { readConfiguration: () => new Promise(() => {}) },
  );
  const controller = new AbortController();
  try {
    const pending = client
      .configure(DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION, {
        signal: controller.signal,
        remainingMs: () => 1000,
      })
      .catch(() => "cancelled");
    controller.abort();
    expect(await Promise.race([pending, tick().then(() => "still pending")])).toBe("cancelled");
    expect(requests).toBe(0);
  } finally {
    await client.close();
    host.shutdown();
  }
});
