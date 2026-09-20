import { expect, test } from "bun:test";
import { createConversationForks } from "./conversation-forks.js";
import { ConversationSchema } from "../src/lib/protocol.js";
import type { JsonValue } from "@drawloom/host";

function fixture() {
  const values = new Map<string, JsonValue>();
  const calls: string[] = [];
  const source = ConversationSchema.parse({
    id: "source",
    title: "Original",
    projectId: "project",
    workbenchId: "text",
    provider: "codex",
  });
  let registered = false;
  let failRegistration = false;
  let unknown = false;
  let rejected = false;
  const forks = createConversationForks({
    store: {
      get: async (key) => values.get(key),
      set: async (key, value) => {
        values.set(key, value);
      },
    },
    source: async () => source,
    ready: async () => ({
      create: async (input) => {
        calls.push("native");
        if (rejected)
          return {
            status: "rejected",
            failure: { code: "invalid_state", message: "No completed history" },
          };
        return { status: "ok", value: { ...input, state: unknown ? "unknown" : "created" } };
      },
      read: async () => ({ status: "ok", value: null }),
    }),
    copyHistory: async () => {
      calls.push("history");
    },
    register: async (conversation) => {
      expect(conversation.projectId).toBe("project");
      expect(conversation.forkedFromId).toBe("source");
      calls.push("register");
      if (failRegistration) throw Error("Storage unavailable");
      registered = true;
    },
  });
  return {
    forks,
    calls,
    registered: () => registered,
    reject: (value: boolean) => {
      rejected = value;
    },
    registrationFailure: (value: boolean) => {
      failRegistration = value;
    },
    unknown: () => {
      unknown = true;
    },
  };
}

test("fork registration shares the project and copies retained history without submitting a turn", async () => {
  const f = fixture();
  const first = await f.forks.create("source", "request");
  expect(first).toMatchObject({ state: "created" });
  expect(f.calls).toEqual(["history", "native", "register"]);
  expect(f.registered()).toBe(true);
  await f.forks.create("source", "request");
  expect(f.calls.filter((call) => call === "native")).toHaveLength(1);
});

test("confirmed fork registration recovers without another native creation", async () => {
  const f = fixture();
  f.registrationFailure(true);
  await expect(f.forks.create("source", "request")).rejects.toThrow("Storage unavailable");
  f.registrationFailure(false);
  expect(await f.forks.create("source", "request")).toMatchObject({ state: "created" });
  expect(f.calls.filter((call) => call === "native")).toHaveLength(1);
});

test("an uncertain native fork fences new request identities as well as duplicate clicks", async () => {
  const f = fixture();
  f.unknown();
  const first = await f.forks.create("source", "request");
  expect(first).toMatchObject({ state: "unknown" });
  expect(await f.forks.create("source", "different-click")).toEqual(first);
  expect(f.calls.filter((call) => call === "native")).toHaveLength(1);
  expect(f.registered()).toBe(false);
});

test("a confirmed pre-submission rejection permits a later explicit attempt, not an automatic retry", async () => {
  const f = fixture();
  f.reject(true);
  await expect(f.forks.create("source", "request")).rejects.toThrow("No completed history");
  expect(f.calls.filter((call) => call === "native")).toHaveLength(1);
  f.reject(false);
  expect(await f.forks.create("source", "later-click")).toMatchObject({
    state: "created",
    requestId: "request",
  });
  expect(f.calls.filter((call) => call === "native")).toHaveLength(2);
});
