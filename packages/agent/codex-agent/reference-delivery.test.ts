import { test, expect } from "vitest";
import { createCodexDriver } from "./src/index.js";
import type { JsonValue, RpcTransport, RpcMessage } from "@drawloom/host";

test("start and steer references recover original display after reopen without local rows", async () => {
  const values = new Map<string, JsonValue>();
  const sent: string[] = [];
  let failPersistence = false;
  let failStart = false;
  let pausePersistence: (() => Promise<void>) | undefined;
  let pauseValidation: (() => Promise<void>) | undefined;
  let receive: (value: RpcMessage) => void = () => {};
  const events: unknown[] = [];
  const rpc: RpcTransport = {
    async request(method, raw) {
      const p = raw as { input?: { type: string; text?: string }[] };
      if (method === "initialize") return { userAgent: "codex/0.153.4" };
      if (method === "thread/start" || method === "thread/resume")
        return { thread: { id: "native" }, approvalsReviewer: "user" };
      if (method === "turn/start" || method === "turn/steer") {
        sent.push(
          p
            .input!.filter((i) => i.type === "text")
            .map((i) => i.text)
            .join("\n"),
        );
        expect(raw).not.toHaveProperty("additionalContext");
        if (failStart) throw Error("uncertain wire response");
        return { turn: { id: "turn" } };
      }
      if (method === "thread/turns/list")
        return { data: [{ id: "turn", status: "completed" }], nextCursor: null };
      if (method === "thread/items/list")
        return {
          data: [
            {
              turnId: "turn",
              item: {
                id: "item",
                type: "userMessage",
                content: [{ type: "text", text: sent.at(-1) }],
              },
            },
          ],
          nextCursor: null,
        };
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
  const driver = createCodexDriver({
    connect: async () => rpc,
    imageInput: async () => {
      await pauseValidation?.();
      return "/controlled/image.png";
    },
    store: {
      async get(k) {
        return values.get(k);
      },
      async set(k, v) {
        if (failPersistence) throw Error("disk full");
        if (k.startsWith("codex-display:")) await pausePersistence?.();
        values.set(k, v);
      },
    },
  });
  const open = async (sessionId = "local") => {
    const result = await driver.openSession({
      sessionId,
      context: { text: "" },
      tools: { id: "none", tools: [] },
    });
    if (result.status !== "ok") throw Error("open");
    void (async () => {
      for await (const event of result.value.signals()) events.push(event);
    })();
    return result.value;
  };
  let session = await open();
  const references = {
    kind: "ready" as const,
    text: "Untrusted reference: keep evidence",
    bytes: 34,
    references: [],
  };
  expect(
    await session.execute({
      operationId: "execution",
      text: "actual input",
      originalDisplayText: "original",
      references,
    }),
  ).toMatchObject({ status: "ok" });
  expect(
    await session.steer?.({
      operationId: "execution",
      text: "actual input",
      originalDisplayText: "original",
      references,
    }),
  ).toMatchObject({ status: "ok" });
  expect(sent).toHaveLength(2);
  expect(sent[0]).toContain("Untrusted reference");
  expect(sent[0]).not.toBe(sent[1]);
  receive({
    method: "item/completed",
    params: {
      threadId: "native",
      turnId: "turn",
      item: { id: "live-item", type: "userMessage", content: [{ type: "text", text: sent[0] }] },
    },
  });
  for (let i = 0; i < 100 && events.length < 2; i++) await new Promise((r) => setTimeout(r, 1));
  expect(events).toContainEqual(
    expect.objectContaining({ kind: "message.completed", role: "user", text: "original" }),
  );
  await session.close();
  session = await open();
  const context = { get: async () => undefined, checkpoint: async () => undefined };
  const history = await session.history!.read(context, { direction: "latest", limit: 10 });
  expect(history.entries[0]).toMatchObject({
    role: "user",
    text: "original",
    preparation: { kind: "ready", references: [], receipt: { executionId: "execution" } },
  });
  sent.push("ordinary <drawloom-reference id=unknown> marker text");
  expect(
    (await session.history!.read(context, { direction: "latest", limit: 10 })).entries[0]?.text,
  ).toBe(sent.at(-1));
  failPersistence = true;
  expect(
    await session.execute({
      operationId: "failed",
      text: "next",
      originalDisplayText: "next",
      references,
    }),
  ).toMatchObject({ status: "rejected" });
  expect(sent).toHaveLength(3);
  await session.close();
  failPersistence = false;
  failStart = true;
  session = await open("uncertain");
  expect(
    await session.execute({
      operationId: "unknown-delivery",
      text: "wire",
      originalDisplayText: "uncertain original",
      references,
    }),
  ).toMatchObject({ status: "rejected" });
  await session.close();
  session = await open("uncertain");
  expect(
    (await session.history!.read(context, { direction: "latest", limit: 10 })).entries[0]?.text,
  ).toBe("uncertain original");
  await session.close();
  failStart = false;
  session = await open("closing");
  let release!: () => void, entered!: () => void;
  const persisted = new Promise<void>((r) => {
    entered = r;
  });
  pausePersistence = () => {
    entered();
    return new Promise<void>((r) => {
      release = r;
    });
  };
  const before = sent.length;
  const pending = session.execute({
    operationId: "closing-operation",
    text: "request",
    references,
  });
  await persisted;
  await session.close();
  release();
  expect(await pending).toMatchObject({ status: "rejected" });
  expect(sent).toHaveLength(before);
  pausePersistence = undefined;
  session = await open("revoked-at-wire");
  for (const steer of [false, true]) {
    let releaseReference!: () => void, enteredReference!: () => void;
    const enteredWrite = new Promise<void>((r) => {
      enteredReference = r;
    });
    pausePersistence = () => {
      enteredReference();
      return new Promise<void>((r) => {
        releaseReference = r;
      });
    };
    const revocation = new AbortController();
    const operation = {
      operationId: "revoked-operation",
      text: "manual original input",
      originalDisplayText: "original",
      references,
      referenceSignal: revocation.signal,
    };
    const sending = steer ? session.steer!(operation) : session.execute(operation);
    await enteredWrite;
    revocation.abort();
    pausePersistence = undefined;
    releaseReference();
    expect(await sending).toMatchObject({ status: "ok" });
    expect(sent.at(-1)).toContain("manual original input");
    expect(sent.at(-1)).not.toContain("Untrusted reference");
    expect(
      (await session.history!.read(context, { direction: "latest", limit: 10 })).entries[0],
    ).toMatchObject({ text: "original", preparation: { kind: "cancelled", references: [] } });
    expect(
      (await session.history!.read(context, { direction: "latest", limit: 10 })).entries[0]
        ?.preparation,
    ).not.toHaveProperty("receipt");
  }
  await session.close();
  session = await open("revoked-during-validation");
  for (const steer of [false, true]) {
    let releaseValidation!: () => void, enteredValidation!: () => void;
    const enteredImage = new Promise<void>((r) => {
      enteredValidation = r;
    });
    pauseValidation = () => {
      enteredValidation();
      return new Promise<void>((r) => {
        releaseValidation = r;
      });
    };
    const revocation = new AbortController();
    const operation = {
      operationId: "validation-operation",
      text: "image request",
      references,
      referenceSignal: revocation.signal,
      attachments: [{ key: "image", mediaType: "image/png", size: 1 }],
    };
    const sending = steer ? session.steer!(operation) : session.execute(operation);
    await enteredImage;
    revocation.abort();
    pauseValidation = undefined;
    releaseValidation();
    expect(await sending).toMatchObject({ status: "ok" });
    expect(sent.at(-1)).not.toContain("Untrusted reference");
  }
  await session.close();
});
