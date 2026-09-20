import { expect, test } from "bun:test";
import { createContinuationAdmission } from "./continuation-admission.js";
import * as admission from "./continuation-admission.js";
import { ownsSessionOperation } from "./desktop-sessions.js";
import type { JsonStore, JsonValue } from "@drawloom/host";

function receipts(): JsonStore {
  const values = new Map<string, JsonValue>();
  return {
    async get(key) {
      return values.get(key);
    },
    async set(key, value) {
      values.set(key, value);
    },
  };
}

test("session ownership includes only its admitted root and child executions", () => {
  const state: admission.ChildOperationState = {
    active: "parent",
    childOperations: new Map([["child", { executionId: "execution", operationId: "child-op" }]]),
  };
  expect(ownsSessionOperation(state, "parent")).toBe(true);
  expect(ownsSessionOperation(state, "child-op")).toBe(true);
  expect(ownsSessionOperation(state, "other-op")).toBe(false);
  expect(ownsSessionOperation(undefined, "parent")).toBe(false);
});

test("child admission preserves the parent's active operation and isolates concurrent children", async () => {
  expect("createChildAdmission" in admission).toBe(true);
  const state: admission.ChildOperationState = { active: "parent-operation" };
  const owner = admission.createChildAdmission({
    store: receipts(),
    conversationId: "conversation",
    running: () => true,
    state: () => state,
    verify: async () => {},
    begin: () => {},
  });
  const first = await owner.admit({
    childId: "one",
    parentId: null,
    executionId: "execution-one",
  });
  const second = await owner.admit({
    childId: "two",
    parentId: null,
    executionId: "execution-two",
  });
  expect(first.status).toBe("ok");
  expect(second.status).toBe("ok");
  expect(state.active).toBe("parent-operation");
  if (first.status !== "ok" || second.status !== "ok") throw Error();
  expect(first.value.operationId).not.toBe(second.value.operationId);
  expect(
    await owner.admit({
      childId: "one",
      parentId: null,
      executionId: "execution-one",
    }),
  ).toEqual(first);
  expect(
    (
      await owner.admit({
        childId: "one",
        parentId: null,
        executionId: "another-execution",
      })
    ).status,
  ).toBe("rejected");
  owner.retire(first.value.operationId);
  expect(
    (
      await owner.admit({
        childId: "one",
        parentId: null,
        executionId: "execution-one",
      })
    ).status,
  ).toBe("rejected");
  expect(state.childOperations?.get("two")?.operationId).toBe(second.value.operationId);
});

test("child admission cannot publish authority after shutdown during verification", async () => {
  expect("createChildAdmission" in admission).toBe(true);
  const state: admission.ChildOperationState = {};
  let running = true;
  let begun = false;
  const owner = admission.createChildAdmission({
    store: receipts(),
    conversationId: "conversation",
    running: () => running,
    state: () => state,
    verify: async () => {
      running = false;
    },
    begin: () => {
      begun = true;
    },
  });
  expect((await owner.admit({ childId: "one", parentId: null, executionId: "e" })).status).toBe(
    "rejected",
  );
  expect(begun).toBe(false);
  expect(state.childOperations?.size ?? 0).toBe(0);
});

test("child recovery reuses its execution receipt but verifies the current binding again", async () => {
  const store = receipts();
  const input = { childId: "child", parentId: null, executionId: "execution" };
  let verified = 0;
  const open = () => {
    const state: admission.ChildOperationState = {};
    return admission.createChildAdmission({
      store,
      conversationId: "conversation",
      state: () => state,
      running: () => true,
      verify: async () => {
        verified++;
      },
      begin: () => {},
    });
  };
  const original = await open().admit(input);
  expect(original.status).toBe("ok");
  expect(await open().admit(input)).toEqual(original);
  expect(verified).toBe(2);
});

test("native continuation receives new ownership only after source verification", async () => {
  const state: { active?: string } = {};
  const events: string[] = [];
  const admit = createContinuationAdmission({
    running: () => true,
    state: () => state,
    verify: async () => {
      events.push("verified");
    },
    begin: () => {
      events.push("begun");
    },
  });
  const result = await admit();
  expect(result.status).toBe("ok");
  expect(events).toEqual(["verified", "begun"]);
  expect(state.active).toBeDefined();
  expect((await admit()).status).toBe("rejected");
});
test("shutdown during verification prevents native continuation admission", async () => {
  const state: { active?: string } = {};
  let running = true;
  let begun = false;
  const result = await createContinuationAdmission({
    running: () => running,
    state: () => state,
    verify: async () => {
      running = false;
    },
    begin: () => {
      begun = true;
    },
  })();
  expect(result.status).toBe("rejected");
  expect(state.active).toBeUndefined();
  expect(begun).toBe(false);
});
