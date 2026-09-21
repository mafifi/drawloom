import { expect, test } from "vitest";
import { createDesktopSessions } from "./desktop-sessions.js";
import type { AgentSession } from "@drawloom/agent";

test("an ended signal stream retires its session before the next connection", async () => {
  const sessions = createDesktopSessions();
  let closed = 0;
  let unavailable = 0;
  const start = async () => ({
    session: {} as AgentSession,
    signals: [],
    close: async () => {
      closed++;
    },
  });
  const first = await sessions.connect("one", start);
  await sessions.watch(
    "one",
    first,
    async () => {},
    async () => {
      unavailable++;
    },
  );
  expect(sessions.get("one")).toBeUndefined();
  expect(closed).toBe(1);
  expect(unavailable).toBe(1);
  expect(await sessions.connect("one", start)).not.toBe(first);
  await sessions.close();
  expect(closed).toBe(2);
});

test("session startup shares ownership and rolls back resources after failure", async () => {
  const sessions = createDesktopSessions();
  const released: string[] = [];
  let fail!: () => void;
  const blocked = new Promise<void>((resolve) => {
    fail = resolve;
  });
  const first = sessions.connect("one", async (own) => {
    own(async () => {
      released.push("transport");
    });
    await blocked;
    throw Error("startup failed");
  });
  const second = sessions.connect("one", async () => {
    throw Error("duplicate startup");
  });
  expect(first).toBe(second);
  fail();
  await expect(first).rejects.toThrow("startup failed");
  expect(released).toEqual(["transport"]);
  expect(sessions.get("one")).toBeUndefined();
  await sessions.close();
  expect(released).toEqual(["transport"]);
});

test("shutdown owns a normally ending reader without reporting connection loss", async () => {
  const sessions = createDesktopSessions();
  let finish!: () => void;
  const reading = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let closed = 0;
  let unavailable = 0;
  const state = await sessions.connect("one", async () => ({
    session: {} as AgentSession,
    signals: [],
    close: async () => {
      closed++;
      finish();
    },
  }));
  const pump = sessions.watch(
    "one",
    state,
    () => reading,
    async () => {
      unavailable++;
    },
  );
  await sessions.close();
  await pump;
  expect(closed).toBe(1);
  expect(unavailable).toBe(0);
});

test("shutdown retires a resource returned by interrupted startup without publishing it", async () => {
  const sessions = createDesktopSessions();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let closed = 0;
  const starting = sessions.connect("one", async (own) => {
    await blocked;
    own(async () => {
      closed++;
    });
    return { session: {} as AgentSession, signals: [], close: async () => {} };
  });
  const outcome = starting.catch((error: unknown) => error);
  await Promise.resolve();
  const closing = sessions.close();
  release();
  expect(await outcome).toBeInstanceOf(Error);
  await closing;
  expect(closed).toBe(1);
  expect(sessions.get("one")).toBeUndefined();
});

test("signal failure still removes the session and records unavailable history when cleanup fails", async () => {
  const sessions = createDesktopSessions();
  let closed = 0;
  let recovered = 0;
  const state = await sessions.connect("one", async (own) => {
    own(async () => {
      closed++;
      throw Error("cleanup failed");
    });
    return { session: {} as AgentSession, signals: [], close: async () => {} };
  });
  await sessions.watch(
    "one",
    state,
    async () => {
      throw Error("signal failed");
    },
    async () => {
      recovered++;
    },
  );
  expect(sessions.get("one")).toBeUndefined();
  expect(recovered).toBe(1);
  await expect(sessions.close()).rejects.toBeInstanceOf(AggregateError);
  expect(closed).toBe(1);
});
