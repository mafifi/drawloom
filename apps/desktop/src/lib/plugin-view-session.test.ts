import { expect, test } from "vitest";
import { createPluginViewSession } from "./plugin-view-session.js";

const target = { viewId: "view", conversationId: "conversation" };
const mountId = "00000000-0000-4000-8000-000000000000";

function transport(handlers: Record<string, (body: unknown, init: RequestInit) => unknown>) {
  const calls: { path: string; body: unknown; keepalive?: boolean; signal?: AbortSignal }[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body, keepalive: init?.keepalive, signal: init?.signal ?? undefined });
    const handler = handlers[path];
    if (!handler) return new Response("no", { status: 404 });
    const value = await handler(body, init ?? {});
    return value instanceof Response ? value : Response.json(value);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

test("opening parses the mount and carries the target", async () => {
  const { fetch, calls } = transport({
    "/api/view-session": () => ({ mountId, mediaRevision: "r1" }),
  });
  const session = createPluginViewSession({
    target,
    signal: new AbortController().signal,
    fetch,
  });
  expect(await session.opened).toEqual({ mountId, mediaRevision: "r1" });
  expect(calls[0]?.body).toEqual({ ...target, action: "open" });
});

test("a malformed open is an error rather than an unusable mount", async () => {
  const { fetch } = transport({ "/api/view-session": () => ({ mountId: "not-a-uuid" }) });
  const session = createPluginViewSession({
    target,
    signal: new AbortController().signal,
    fetch,
  });
  await expect(session.opened).rejects.toThrow();
});

test("interaction waits for the mount and never sends a stale identifier", async () => {
  let release: ((value: unknown) => void) | undefined;
  const { fetch, calls } = transport({
    "/api/view-session": () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    "/api/view-interaction": () => ({ content: [] }),
  });
  const session = createPluginViewSession({
    target,
    signal: new AbortController().signal,
    fetch,
  });
  const pending = session.interact({ method: "ui/message", params: {} } as never);
  // Nothing may be sent to the interaction route before the mount resolves.
  expect(calls.map((call) => call.path)).toEqual(["/api/view-session"]);
  release?.({ mountId, mediaRevision: "r1" });
  await pending;
  expect(calls[1]?.path).toBe("/api/view-interaction");
  expect((calls[1]?.body as { mountId: string }).mountId).toBe(mountId);
});

test("a failed interaction reports rather than returning an empty result", async () => {
  const { fetch } = transport({
    "/api/view-session": () => ({ mountId, mediaRevision: "r1" }),
    "/api/view-interaction": () => new Response("no", { status: 500 }),
  });
  const session = createPluginViewSession({
    target,
    signal: new AbortController().signal,
    fetch,
  });
  await expect(session.interact({ method: "ui/message", params: {} } as never)).rejects.toThrow();
});

test("release closes the mount with keepalive and swallows its own failure", async () => {
  // Teardown runs while the page is going away. A close that cannot be
  // delivered must not surface as an unhandled rejection.
  const { fetch, calls } = transport({
    "/api/view-session": (body) =>
      (body as { action: string }).action === "open"
        ? { mountId, mediaRevision: "r1" }
        : new Response("no", { status: 503 }),
  });
  const session = createPluginViewSession({
    target,
    signal: new AbortController().signal,
    fetch,
  });
  await session.opened;
  session.release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const close = calls.find((call) => (call.body as { action?: string })?.action === "close");
  expect(close, "a close was sent").toBeDefined();
  expect(close?.keepalive, "close survives the page going away").toBe(true);
  expect((close?.body as { mountId: string }).mountId).toBe(mountId);
});

test("release still closes a mount that resolved after teardown began", async () => {
  let release: ((value: unknown) => void) | undefined;
  const { fetch, calls } = transport({
    "/api/view-session": (body) =>
      (body as { action: string }).action === "open"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : { ok: true },
  });
  const session = createPluginViewSession({
    target,
    signal: new AbortController().signal,
    fetch,
  });
  session.release();
  release?.({ mountId, mediaRevision: "r1" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(
    calls.some((call) => (call.body as { action?: string })?.action === "close"),
    "a mount that opens during teardown is still released",
  ).toBe(true);
});

test("interaction and tool calls carry the abort signal, close does not", async () => {
  const abort = new AbortController();
  const { fetch, calls } = transport({
    "/api/view-session": () => ({ mountId, mediaRevision: "r1" }),
    "/api/view-interaction": () => ({ content: [] }),
    "/api/view-request": () => ({ content: [] }),
  });
  const session = createPluginViewSession({ target, signal: abort.signal, fetch });
  await session.interact({ method: "ui/message", params: {} } as never);
  await session.callTool({ name: "tool", arguments: {} });
  session.release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const byPath = (path: string) => calls.find((call) => call.path === path && call.signal);
  expect(byPath("/api/view-interaction")?.signal).toBe(abort.signal);
  expect(byPath("/api/view-request")?.signal).toBe(abort.signal);
  const close = calls.find((call) => (call.body as { action?: string })?.action === "close");
  expect(close?.signal, "aborting is what triggers the close; it must not cancel it").toBe(
    undefined,
  );
});
