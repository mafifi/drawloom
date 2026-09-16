import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDesktopApplication } from "./application.js";
import { serveDesktop } from "./server.js";

test("HTTP shutdown rejects queued commands without dispatch and shares cleanup", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-server-shutdown-"));
  const app = await createDesktopApplication(root);
  let enter!: () => void;
  let release!: () => void;
  let queued!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const admitted = new Promise<void>((resolve) => {
    queued = resolve;
  });
  let dispatches = 0;
  const server = serveDesktop(
    {
      ...app,
      async command(raw) {
        dispatches++;
        enter();
        await blocked;
        return app.command(raw);
      },
      async admitCommand(raw) {
        const release = await app.admitCommand(raw);
        if (dispatches) queued();
        return release;
      },
    },
    resolve("apps/desktop/build"),
  );
  try {
    const boot = await fetch(server.url, { redirect: "manual" });
    const headers = {
      cookie: boot.headers.get("set-cookie")!.split(";")[0]!,
      origin: server.origin,
      "content-type": "application/json",
    };
    const request = () =>
      fetch(server.origin + "/api/command", {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind: "create_conversation",
          workbenchId: "text",
          provider: "synthetic",
        }),
      });
    const first = request().catch(() => undefined);
    await entered;
    const second = request().catch(() => undefined);
    await admitted;
    const closing = server.close();
    expect(server.close()).toBe(closing);
    release();
    const responses = await Promise.all([first, second]);
    await closing;
    expect(dispatches).toBe(1);
    expect(responses[1]?.status).toBe(503);
  } finally {
    release();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("HTTP maps a closed application to unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-server-closed-"));
  const app = await createDesktopApplication(root);
  const server = serveDesktop(app, resolve("apps/desktop/build"));
  try {
    const boot = await fetch(server.url, { redirect: "manual" });
    const cookie = boot.headers.get("set-cookie")!.split(";")[0]!;
    await app.close();
    const response = await fetch(server.origin + "/api/state", { headers: { cookie } });
    expect(response.status).toBe(503);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("server shutdown aborts an admitted native folder picker", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-picker-shutdown-"));
  const app = await createDesktopApplication(root);
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let pickerSignal: AbortSignal | undefined;
  const server = serveDesktop(app, resolve("apps/desktop/build"), 0, undefined, {
    pickDirectory: async (signal) => {
      pickerSignal = signal;
      enter();
      await blocked;
      return undefined;
    },
  });
  try {
    const boot = await fetch(server.url, { redirect: "manual" });
    const cookie = boot.headers.get("set-cookie")!.split(";")[0]!;
    const request = fetch(server.origin + "/api/project-directory", {
      method: "POST",
      headers: { cookie, origin: server.origin, "content-type": "application/json" },
      body: "{}",
    });
    await entered;
    const closing = server.close();
    const aborted = pickerSignal?.aborted;
    release();
    await request;
    await closing;
    expect(aborted).toBe(true);
  } finally {
    release();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
