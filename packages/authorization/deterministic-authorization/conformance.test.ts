import { test, expect } from "bun:test";
import { authorizationConformance } from "@drawloom/authorization/conformance";
import { createDeterministicAuthorizer } from "./src/index.js";
const request = (project: string, context?: { unavailable: boolean }) => ({
  subject: { type: "user", id: "member", properties: { projects: ["a"] } },
  action: { name: "read" },
  resource: { type: "record", id: "one", properties: { project } },
  ...(context ? { context } : {}),
});
test("contrasting attribute rules run shared authorization conformance", async () => {
  const authorizer = createDeterministicAuthorizer();
  await authorizationConformance({
    authorizer,
    allow: request("a"),
    deny: request("b"),
    unavailable: request("a", { unavailable: true }),
    revoke: () => authorizer.revoke("member"),
  });
});
test("delayed decisions observe revocation and cancellation", async () => {
  const authorizer = createDeterministicAuthorizer({ delayMs: 10 });
  const options = { signal: new AbortController().signal, remainingMs: () => 2000 };
  const pending = authorizer.authorize(request("a"), options);
  authorizer.revoke("member");
  expect(await pending).toEqual({ decision: false });
  const controller = new AbortController();
  const cancelled = authorizer.authorize(request("a"), { ...options, signal: controller.signal });
  controller.abort();
  expect(await cancelled).toEqual({ kind: "failure", code: "cancelled" });
  authorizer.setAvailable(false);
  expect(await authorizer.authorize(request("a"), options)).toEqual({
    kind: "failure",
    code: "unavailable",
  });
});
