import { test, expect } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createNodeJsonStore } from "@drawloom/node-host";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "@drawloom/local-knowledge-runtime";
import type { RpcMessage, RpcTransport } from "@drawloom/host";
import type { ContextPreparationRequest, ContextPreparationResult } from "@drawloom/context";
import { createDesktopApplication } from "./application.js";
import { serveDesktop } from "./server.js";
import type { KnowledgeService } from "./knowledge-host.js";
import { KNOWLEDGE_RETRIEVAL_GUIDANCE } from "./knowledge-tools.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}
async function until(check: () => boolean | Promise<boolean>, timeout = 1500) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeout) throw Error("Condition did not settle");
    await new Promise((r) => setTimeout(r, 2));
  }
}
const ready: ContextPreparationResult = {
  kind: "ready",
  text: "Retained untrusted evidence",
  bytes: 27,
  references: [
    {
      ref: { type: "source", origin: "public", id: "guide", revision: "r1" },
      status: "active",
      inclusion: "body",
    },
  ],
};

async function fixture(
  schedulePreparationDeadline?: (expire: () => void, milliseconds: number) => () => void,
  retained?: { root: string; conversationId: string },
) {
  const root = retained?.root ?? (await mkdtemp(join(tmpdir(), "drawloom-http-preparation-")));
  const directory = join(root, "working");
  await mkdir(directory, { recursive: true });
  const calls: { method: string; params: any }[] = [];
  const preparations: ContextPreparationRequest[] = [];
  let receive: (message: RpcMessage) => void = () => {};
  let turn = 0,
    thread = 0;
  let preparation: (request: ContextPreparationRequest) => Promise<ContextPreparationResult> =
    async () => ready;
  let persist: (() => Promise<void>) | undefined;
  let configure: (() => Promise<void>) | undefined;
  const status = {
    availability: "ready" as const,
    message: "ready",
    configuration: { ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION, automaticContext: true },
    models: [
      {
        id: "qwen3-embedding-0.6b-gguf" as const,
        title: "Local",
        licence: "Apache-2.0",
        source: "local",
        modelDirectory: "/model",
        runtimeDirectory: "/runtime",
        prerequisites: "Metal",
        runtime: { package: "llama.cpp", version: "revision", licence: "MIT" },
        weightsBytes: 1,
        runtimeBytes: 1,
        runtimeDownloadAvailable: false,
        state: "missing" as const,
      },
    ],
    indexing: "unavailable" as const,
    maintenance: {
      state: "idle" as const,
      pendingUpdates: 0,
      message: "idle",
      automaticStartsToday: 0,
      automaticMillisecondsToday: 0,
    },
  };
  const service: KnowledgeService = {
    async status() {
      return structuredClone(status);
    },
    async configure(c) {
      await configure?.();
      status.configuration = c;
      return structuredClone(status);
    },
    async warmup() {
      return { kind: "unavailable" };
    },
    async prepare(r) {
      preparations.push(r);
      return preparation(r);
    },
    async search() {
      return { kind: "failure", code: "unavailable" };
    },
    async evidence() {
      return { kind: "failure", code: "unavailable" };
    },
    async export() {
      return { kind: "failure", code: "unavailable" };
    },
    async ingest() {
      return { kind: "accepted", revision: "r1" };
    },
    async download() {
      return status;
    },
    async cancelDownload() {
      return status;
    },
    async close() {},
  };
  const store = createNodeJsonStore(join(root, "provider-state"));
  const app = await createDesktopApplication(join(root, "data"), {
    knowledge: { service, ...(schedulePreparationDeadline ? { schedulePreparationDeadline } : {}) },
    codex: {
      store: {
        get: (key) => store.get(key),
        async set(key, value) {
          if (key.startsWith("codex-display:")) await persist?.();
          await store.set(key, value);
        },
      },
      async connect(cwd) {
        const native = `native-${++thread}`;
        const rpc: RpcTransport = {
          async request(method, params) {
            calls.push({ method, params });
            if (method === "initialize") return { userAgent: "codex/0.153.4" };
            if (method === "thread/start" || method === "thread/resume")
              return { thread: { id: native, cwd }, approvalsReviewer: "user" };
            if (method === "thread/read") return { thread: { cwd } };
            if (method === "thread/turns/list") return { data: [], nextCursor: null };
            if (method === "turn/start" || method === "turn/steer") {
              const p = params as { input: unknown[] };
              if (method === "turn/start") turn++;
              const turnId = `turn-${turn}`;
              const itemId = `item-${calls.length}`;
              setTimeout(
                () =>
                  receive({
                    method: "item/completed",
                    params: {
                      threadId: native,
                      turnId,
                      item: { id: itemId, type: "userMessage", content: p.input },
                    },
                  }),
                0,
              );
              return { turn: { id: turnId } };
            }
            return {};
          },
          notify() {},
          respond() {},
          subscribe(next) {
            receive = next;
            return () => {};
          },
          async close() {},
        };
        return rpc;
      },
    },
  });
  const admissions: string[] = [];
  const admitKnowledge = app.admitKnowledgeCommand.bind(app),
    admitCommand = app.admitCommand.bind(app);
  app.admitKnowledgeCommand = (raw) => {
    const admission = admitKnowledge(raw);
    admissions.push("knowledge");
    return admission;
  };
  app.admitCommand = async (raw) => {
    const admission = await admitCommand(raw);
    admissions.push("command");
    return admission;
  };
  const server = serveDesktop(app, resolve("apps/desktop/build"));
  const bootstrap = await fetch(server.url, { redirect: "manual" });
  const headers = {
    cookie: bootstrap.headers.get("set-cookie")!.split(";")[0]!,
    origin: server.origin,
    "Content-Type": "application/json",
  };
  const post = (path: string, command: unknown, authenticated = true) =>
    fetch(server.origin + path, {
      method: "POST",
      headers: authenticated ? headers : { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
  const command = async (value: unknown) => {
    const response = await post("/api/command", value);
    if (!response.ok) throw Error(await response.text());
    return response.json();
  };
  if (!retained) await command({ kind: "add_project", directory });
  const selected = await command(
    retained
      ? { kind: "select_conversation", conversationId: retained.conversationId }
      : { kind: "create_conversation", workbenchId: "text", provider: "codex" },
  );
  const conversationId = selected.selectedId as string;
  const grant = (
    allowed: boolean,
    toolName = "knowledge.search",
    target = conversationId,
    workbenchId = "text",
  ) => ({
    kind: "operator",
    conversationId: target,
    workbenchId,
    command: { kind: "set_tool_grant", toolName, allowed },
  });
  for (const name of ["knowledge.search", "knowledge.evidence"]) await command(grant(true, name));
  return {
    app,
    server,
    root,
    calls,
    preparations,
    admissions,
    conversationId,
    command,
    post,
    grant,
    status,
    send: (text: string) =>
      post("/api/command", {
        kind: "send",
        conversationId,
        text,
        attachmentKeys: [],
        contextArtifactIds: [],
      }),
    prepare(next: typeof preparation) {
      preparation = next;
    },
    persistence(next?: () => Promise<void>) {
      persist = next;
    },
    configuration(next?: () => Promise<void>) {
      configure = next;
    },
    unavailablePreparation() {
      delete service.prepare;
    },
    evidence(next: KnowledgeService["evidence"]) {
      service.evidence = next;
    },
    native(method: string, item?: unknown) {
      receive({
        method,
        params: { threadId: `native-${thread}`, turnId: `turn-${turn}`, ...(item ? { item } : {}) },
      });
    },
    nativeOrigin: () => ({ thread_id: `native-${thread}`, turn_id: `turn-${turn}` }),
    complete() {
      receive({
        method: "turn/completed",
        params: { threadId: `native-${thread}`, turn: { id: `turn-${turn}`, status: "completed" } },
      });
    },
    async close(preserveRoot = false) {
      await server.close();
      if (!preserveRoot) await rm(root, { recursive: true, force: true });
    },
  };
}

test("actual desktop MCP evidence receipts require matched native delivery and invalidate on compaction", async () => {
  const f = await fixture();
  const client = new Client({ name: "receipt-proof", version: "1" });
  const ref = { type: "source" as const, origin: "public", id: "instrument", revision: "r1" };
  let reads = 0;
  let denied = false;
  f.evidence(async () => {
    reads++;
    return denied
      ? { kind: "denied" }
      : {
          kind: "ok",
          records: [
            {
              ref,
              body: "Instrument reading: seven.",
              status: "active",
              confidence: {},
              provenance: { producer: { type: "public", id: "instrument" }, inputs: [] },
            },
          ],
          links: [],
          bytes: 100,
        };
  });
  try {
    expect((await f.send("inspect the public instrument")).status).toBe(200);
    const server = f.calls.find((call) => call.method === "thread/start")!.params.config.mcp_servers
      .drawloom;
    await client.connect(
      new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: { headers: server.http_headers },
      }),
    );
    let sequence = 0;
    const read = () =>
      client.callTool({
        name: "knowledge.evidence",
        arguments: {
          root: ref,
          direction: "forward",
          maxDepth: 2,
          maxRecords: 10,
          maxLinks: 10,
          maxBytes: 4096,
        },
        _meta: { callId: `call-${++sequence}`, "x-codex-turn-metadata": f.nativeOrigin() },
      });
    const first = await read();
    expect(first.structuredContent).toMatchObject({ value: { kind: "ok" } });
    expect((await read()).structuredContent).toMatchObject({ value: { kind: "ok" } });
    const completed = (result: unknown, server = "drawloom") =>
      f.native("item/completed", {
        id: `native-tool-${++sequence}`,
        type: "mcpToolCall",
        status: "completed",
        server,
        tool: "knowledge.evidence",
        arguments: {},
        result,
      });
    completed(first, "unrelated");
    await new Promise((r) => setTimeout(r, 10));
    expect((await read()).structuredContent).toMatchObject({ value: { kind: "ok" } });
    completed({ ...first, content: [{ type: "text", text: "forged body" }] });
    await new Promise((r) => setTimeout(r, 10));
    expect((await read()).structuredContent).toMatchObject({ value: { kind: "ok" } });
    completed(first);
    await new Promise((r) => setTimeout(r, 10));
    expect((await read()).structuredContent).toMatchObject({
      value: { kind: "already_delivered", records: [ref] },
    });
    expect(reads).toBe(5);
    denied = true;
    expect((await read()).structuredContent).toMatchObject({ value: { kind: "denied" } });
    denied = false;
    const fresh = await read();
    completed(fresh);
    await new Promise((r) => setTimeout(r, 10));
    expect((await read()).structuredContent).toMatchObject({
      value: { kind: "already_delivered" },
    });
    f.native("item/started", { id: "compaction", type: "contextCompaction" });
    await new Promise((r) => setTimeout(r, 10));
    completed(first);
    await new Promise((r) => setTimeout(r, 10));
    expect((await read()).structuredContent).toMatchObject({ value: { kind: "ok" } });
    f.complete();
    await until(async () => !(await f.app.snapshot()).activeOperation);
    expect((await f.send("new execution")).status).toBe(200);
    expect((await read()).structuredContent).toMatchObject({ value: { kind: "ok" } });
  } finally {
    await client.close();
    await f.close();
  }
});

test.each([
  { steer: false, revoke: false },
  { steer: true, revoke: false },
  { steer: false, revoke: true },
  { steer: true, revoke: true },
])("HTTP cancellation interrupts preparation: $steer / $revoke", async ({ steer, revoke }) => {
  const f = await fixture();
  const held = deferred();
  try {
    if (steer) expect((await f.send("first")).status).toBe(200);
    const initial = f.preparations.length;
    f.prepare(async () => {
      await held.promise;
      return ready;
    });
    const sending = f.send("original pending words");
    await until(() => f.preparations.length > initial);
    const revoking = revoke
      ? f.post("/api/command", f.grant(false))
      : f.post("/api/knowledge", {
          action: "configure",
          configuration: { ...f.status.configuration, automaticContext: false },
        });
    const cancelled = await until(() => f.preparations.at(-1)!.signal.aborted, 300).then(
      () => true,
      () => false,
    );
    held.release();
    expect((await sending).status).toBe(200);
    expect((await revoking).status).toBe(200);
    expect(cancelled).toBe(true);
    const deliveries = f.calls.filter(
      (c) => c.method === "turn/start" || c.method === "turn/steer",
    );
    expect(deliveries).toHaveLength(steer ? 2 : 1);
    expect(deliveries.at(-1)?.method).toBe(steer ? "turn/steer" : "turn/start");
    expect(JSON.stringify(deliveries.at(-1)?.params.input)).not.toContain(
      "Retained untrusted evidence",
    );
    await until(async () =>
      (await f.app.historyPage(f.conversationId)).entries.some(
        (e) => e.text === "original pending words",
      ),
    );
    const row = (await f.app.historyPage(f.conversationId)).entries.find(
      (e) => e.text === "original pending words",
    )!;
    expect(row.preparation).toMatchObject({ kind: "cancelled", references: [] });
    expect(row.preparation).not.toHaveProperty("receipt");
  } finally {
    held.release();
    await f.close();
  }
});

test.each([false, true])(
  "HTTP pending revoke protects queued sends with overlapping controls: %s",
  async (multiple) => {
    const f = await fixture(),
      held = deferred(),
      entered = deferred();
    try {
      f.persistence(async () => {
        entered.release();
        await held.promise;
      });
      const first = f.send("queued original A");
      await entered.promise;
      let admitted = f.admissions.length;
      const second = f.send("queued original B");
      await until(() => f.admissions.length > admitted);
      admitted = f.admissions.length;
      const revoke = f.post("/api/command", f.grant(false));
      await until(() => f.admissions.length > admitted);
      const extra: Promise<Response>[] = [];
      if (multiple) {
        for (const action of [
          () => f.post("/api/command", f.grant(true)),
          () => f.send("queued original C"),
          () => f.post("/api/command", f.grant(false)),
        ]) {
          admitted = f.admissions.length;
          extra.push(action());
          await until(() => f.admissions.length > admitted);
        }
      }
      f.persistence();
      held.release();
      for (const response of await Promise.all([first, second, revoke, ...extra]))
        expect(response.status).toBe(200);
      const deliveries = f.calls.filter(
        (c) => c.method === "turn/start" || c.method === "turn/steer",
      );
      expect(deliveries).toHaveLength(multiple ? 3 : 2);
      for (const [index, text] of (multiple
        ? ["queued original A", "queued original B", "queued original C"]
        : ["queued original A", "queued original B"]
      ).entries()) {
        expect(deliveries[index]?.params.input[0].text).toContain(text);
        expect(JSON.stringify(deliveries[index]?.params.input)).not.toContain(
          "Retained untrusted evidence",
        );
        await until(async () =>
          (await f.app.historyPage(f.conversationId)).entries.some((e) => e.text === text),
        );
        const rows = (await f.app.historyPage(f.conversationId)).entries.filter(
          (e) => e.text === text,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.preparation?.references).toEqual([]);
        expect(rows[0]?.preparation).not.toHaveProperty("receipt");
      }
      await f.command(f.grant(true));
      expect((await f.send("after settled grant")).status).toBe(200);
      expect(
        JSON.stringify(
          f.calls.filter((c) => c.method === "turn/start" || c.method === "turn/steer").at(-1)
            ?.params.input,
        ),
      ).toContain("Retained untrusted evidence");
    } finally {
      f.persistence();
      held.release();
      await f.close();
    }
  },
);

test.each([false, true])(
  "HTTP older configure completions cannot clear newer pending disables: %s",
  async (multiple) => {
    const f = await fixture(),
      held = deferred(),
      entered = deferred();
    try {
      f.configuration(async () => {
        entered.release();
        await held.promise;
      });
      const enabling = f.post("/api/knowledge", {
        action: "configure",
        configuration: { ...f.status.configuration, automaticContext: true },
      });
      await entered.promise;
      let admitted = f.admissions.length;
      const extra: Promise<Response>[] = [];
      if (multiple) {
        for (const automaticContext of [false, true]) {
          admitted = f.admissions.length;
          extra.push(
            f.post("/api/knowledge", {
              action: "configure",
              configuration: { ...f.status.configuration, automaticContext },
            }),
          );
          await until(() => f.admissions.length > admitted);
        }
        admitted = f.admissions.length;
      }
      const sending = f.send("original after old enable");
      await until(() => f.admissions.length > admitted);
      admitted = f.admissions.length;
      const disabling = f.post("/api/knowledge", {
        action: "configure",
        configuration: { ...f.status.configuration, automaticContext: false },
      });
      await until(() => f.admissions.length > admitted);
      f.configuration();
      held.release();
      for (const response of await Promise.all([enabling, sending, disabling, ...extra]))
        expect(response.status).toBe(200);
      const deliveries = f.calls.filter(
        (c) => c.method === "turn/start" || c.method === "turn/steer",
      );
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.params.input[0].text).toContain("original after old enable");
      expect(JSON.stringify(deliveries[0]?.params.input)).not.toContain(
        "Retained untrusted evidence",
      );
      await until(async () =>
        (await f.app.historyPage(f.conversationId)).entries.some(
          (e) => e.text === "original after old enable",
        ),
      );
      const rows = (await f.app.historyPage(f.conversationId)).entries.filter(
        (e) => e.text === "original after old enable",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.preparation?.references).toEqual([]);
      expect(rows[0]?.preparation).not.toHaveProperty("receipt");
      expect(
        (
          await f.post("/api/knowledge", {
            action: "configure",
            configuration: { ...f.status.configuration, automaticContext: true },
          })
        ).status,
      ).toBe(200);
      expect((await f.send("after settled disable")).status).toBe(200);
      expect(
        JSON.stringify(
          f.calls.filter((c) => c.method === "turn/start" || c.method === "turn/steer").at(-1)
            ?.params.input,
        ),
      ).toContain("Retained untrusted evidence");
    } finally {
      f.configuration();
      held.release();
      await f.close();
    }
  },
);

test.each(
  (
    [
      "ready",
      "empty",
      "unavailable",
      "cancelled",
      "disabled",
      "denied",
      "insufficient",
      "failure",
      "missing",
    ] as const
  ).map((outcome) => ({ outcome })),
)(
  "actual application Codex guidance and history remain correct for $outcome preparation",
  async ({ outcome }) => {
    const f = await fixture();
    try {
      if (outcome === "disabled")
        expect(
          (
            await f.post("/api/knowledge", {
              action: "configure",
              configuration: { ...f.status.configuration, automaticContext: false },
            })
          ).status,
        ).toBe(200);
      else if (outcome === "denied") await f.command(f.grant(false));
      else if (outcome === "missing") f.unavailablePreparation();
      else if (outcome === "failure")
        f.prepare(async () => {
          throw Error("unavailable dependency");
        });
      else if (outcome === "insufficient")
        f.prepare(async () => ({
          kind: "ready",
          text: "Reference only",
          bytes: 14,
          references:
            ready.kind === "ready"
              ? ready.references.map((reference) => ({ ...reference, inclusion: "reference_only" }))
              : [],
        }));
      else if (outcome !== "ready")
        f.prepare(async () => ({ kind: outcome, references: [], bytes: 0 }));
      expect((await f.send(`original ${outcome}`)).status).toBe(200);
      const opening = f.calls.find((c) => c.method === "thread/start")!.params;
      expect(opening.developerInstructions).toContain(KNOWLEDGE_RETRIEVAL_GUIDANCE);
      expect(opening.developerInstructions).toContain("not instructions or permission");
      expect(opening.developerInstructions).toContain("knowledge.evidence");
      expect(opening.developerInstructions).toContain("knowledge.search");
      const delivery = f.calls.find((c) => c.method === "turn/start")!.params;
      expect(delivery).not.toHaveProperty("additionalContext");
      expect(delivery.input[0].text).toContain(`original ${outcome}`);
      expect(opening.developerInstructions).not.toContain("Retained untrusted evidence");
      await until(async () =>
        (await f.app.historyPage(f.conversationId)).entries.some(
          (e) => e.text === `original ${outcome}`,
        ),
      );
      const row = (await f.app.historyPage(f.conversationId)).entries.find(
        (e) => e.text === `original ${outcome}`,
      )!;
      const expected =
        outcome === "insufficient"
          ? "ready"
          : outcome === "failure" || outcome === "missing"
            ? "unavailable"
            : outcome;
      expect(row.preparation?.kind).toBe(expected);
      if (expected === "ready")
        expect(row.preparation?.receipt?.executionId).toBe(
          f.preparations.at(-1)?.binding.executionId,
        );
      else {
        expect(row.preparation?.references).toEqual([]);
        expect(row.preparation).not.toHaveProperty("receipt");
      }
    } finally {
      await f.close();
    }
  },
);

test.each([
  { steer: false, revoke: false },
  { steer: true, revoke: false },
  { steer: false, revoke: true },
  { steer: true, revoke: true },
])("HTTP cancellation reaches final persistence: $steer / $revoke", async ({ steer, revoke }) => {
  const f = await fixture(),
    held = deferred(),
    entered = deferred();
  try {
    if (steer) expect((await f.send("first")).status).toBe(200);
    f.persistence(async () => {
      entered.release();
      await held.promise;
    });
    const sending = f.send("original at persistence");
    await entered.promise;
    const admitted = f.admissions.length;
    const revoking = revoke
      ? f.post("/api/command", f.grant(false))
      : f.post("/api/knowledge", {
          action: "configure",
          configuration: { ...f.status.configuration, automaticContext: false },
        });
    await until(() => f.admissions.length > admitted);
    f.persistence();
    held.release();
    expect((await sending).status).toBe(200);
    expect((await revoking).status).toBe(200);
    const deliveries = f.calls.filter(
      (c) => c.method === "turn/start" || c.method === "turn/steer",
    );
    expect(deliveries).toHaveLength(steer ? 2 : 1);
    expect(JSON.stringify(deliveries.at(-1)?.params.input)).not.toContain(
      "Retained untrusted evidence",
    );
    await until(async () =>
      (await f.app.historyPage(f.conversationId)).entries.some(
        (e) => e.text === "original at persistence",
      ),
    );
    const row = (await f.app.historyPage(f.conversationId)).entries.find(
      (e) => e.text === "original at persistence",
    )!;
    expect(row.preparation).toMatchObject({ kind: "cancelled", references: [] });
    expect(row.preparation).not.toHaveProperty("receipt");
  } finally {
    f.persistence();
    held.release();
    await f.close();
  }
});

test("HTTP cancellation rejects unauthenticated, malformed and wrong-target requests without aborting the selected send", async () => {
  const f = await fixture(),
    held = deferred();
  try {
    f.prepare(async () => {
      await held.promise;
      return ready;
    });
    const sending = f.send("keep this reference");
    await until(() => f.preparations.length === 1);
    expect((await f.post("/api/command", f.grant(false), false)).status).toBe(401);
    expect(
      (await f.post("/api/command", f.grant(false, "knowledge.search", "another-conversation")))
        .status,
    ).toBe(400);
    expect(
      (
        await f.post(
          "/api/command",
          f.grant(false, "knowledge.search", f.conversationId, "another-workbench"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.post("/api/knowledge", {
          action: "configure",
          configuration: { ...f.status.configuration, automaticContext: false },
          subject: "forged",
        })
      ).status,
    ).toBe(400);
    expect(f.preparations[0]?.signal.aborted).toBe(false);
    const admitted = f.admissions.length;
    const enabling = f.post("/api/command", f.grant(true));
    await until(() => f.admissions.length > admitted);
    expect(f.preparations[0]?.signal.aborted).toBe(false);
    held.release();
    expect((await sending).status).toBe(200);
    expect((await enabling).status).toBe(200);
    expect(JSON.stringify(f.calls.find((c) => c.method === "turn/start")?.params.input)).toContain(
      "Retained untrusted evidence",
    );
  } finally {
    held.release();
    await f.close();
  }
});

test("a completed native turn during preparation dispatches once using a fresh execution binding", async () => {
  const f = await fixture();
  const held = deferred();
  try {
    expect((await f.send("first")).status).toBe(200);
    const old = (await f.app.snapshot()).activeOperation!;
    f.prepare(async () => {
      await held.promise;
      return ready;
    });
    const sending = f.send("next original");
    await until(() => f.preparations.length === 2);
    f.complete();
    await until(async () => !(await f.app.snapshot()).activeOperation);
    held.release();
    expect((await sending).status).toBe(200);
    expect(f.preparations).toHaveLength(3);
    expect(f.preparations[1]?.binding.executionId).toBe(old);
    expect(f.preparations[2]?.binding.executionId).not.toBe(old);
    expect(f.calls.filter((c) => c.method === "turn/start")).toHaveLength(2);
    expect(f.calls.filter((c) => c.method === "turn/steer")).toHaveLength(0);
    await until(async () =>
      (await f.app.historyPage(f.conversationId)).entries.some((e) => e.text === "next original"),
    );
    expect(
      (await f.app.historyPage(f.conversationId)).entries.find((e) => e.text === "next original")
        ?.preparation?.receipt?.executionId,
    ).toBe(f.preparations[2]?.binding.executionId);
  } finally {
    held.release();
    await f.close();
  }
});

test("HTTP preparation uses the first five-second deadline, subsequent two seconds and a fresh-host reset", async () => {
  const timers: { milliseconds: number; expire(): void; cancelled: boolean }[] = [];
  const schedule = (expire: () => void, milliseconds: number) => {
    const timer = { milliseconds, expire, cancelled: false };
    timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };
  let retained: { root: string; conversationId: string } | undefined;
  for (const round of [0, 1]) {
    const f = await fixture(schedule, retained);
    let completed = false;
    const sending: Promise<Response | undefined>[] = [];
    try {
      f.prepare(async () => new Promise(() => {}));
      for (const milliseconds of round === 0 ? [5000, 2000] : [5000]) {
        const index = timers.length;
        const pending = f.send(`deadline ${round} ${index}`).catch(() => undefined);
        sending.push(pending);
        await until(() => f.preparations.length > (round === 0 ? index : 0));
        expect(timers[index]?.milliseconds).toBe(milliseconds);
        expect(
          f.calls.filter((c) => c.method === "turn/start" || c.method === "turn/steer"),
        ).toHaveLength(round === 0 ? index : 0);
        timers[index]!.expire();
        expect((await pending)?.status).toBe(200);
        expect(
          f.calls.find((c) => c.method === "thread/start" || c.method === "thread/resume")?.params
            .developerInstructions,
        ).toContain(KNOWLEDGE_RETRIEVAL_GUIDANCE);
        expect(timers[index]?.cancelled).toBe(true);
        await until(async () =>
          (await f.app.historyPage(f.conversationId)).entries.some(
            (e) => e.text === `deadline ${round} ${index}`,
          ),
        );
        expect(
          (await f.app.historyPage(f.conversationId)).entries.find(
            (e) => e.text === `deadline ${round} ${index}`,
          )?.preparation?.kind,
        ).toBe("timeout");
      }
      if (retained) expect(f.conversationId).toBe(retained.conversationId);
      retained = { root: f.root, conversationId: f.conversationId };
      completed = true;
    } finally {
      await f.close(round === 0 && completed);
      await Promise.all(sending);
    }
  }
});
