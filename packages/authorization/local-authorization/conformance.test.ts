import { test, expect } from "vitest";
import { authorizationConformance } from "@drawloom/authorization/conformance";
import { createLocalAuthorizer } from "./src/index.js";
const request = (id: string) => ({
  subject: { type: "user", id: "owner", properties: {} },
  action: { name: "read" },
  resource: { type: "tool", id, properties: {} },
});
test("local rules run shared authorization conformance", async () => {
  let revoked = false;
  await authorizationConformance({
    authorizer: createLocalAuthorizer((r) =>
      r.resource.id === "offline"
        ? { kind: "failure", code: "unavailable" }
        : { decision: !revoked && r.resource.id === "allowed" },
    ),
    allow: request("allowed"),
    deny: request("denied"),
    unavailable: request("offline"),
    revoke: () => {
      revoked = true;
    },
  });
});
test("local rule throws and malformed responses stay structured", async () => {
  const options = { signal: new AbortController().signal, remainingMs: () => 2000 };
  expect(
    await createLocalAuthorizer(() => {
      throw Error("secret");
    }).authorize(request("allowed"), options),
  ).toEqual({ kind: "failure", code: "rejected" });
  const malformed = createLocalAuthorizer(() => ({ decision: "yes" }) as never);
  expect(await malformed.authorize(request("allowed"), options)).toEqual({
    kind: "failure",
    code: "malformed_result",
  });
});

test("cancellation during result validation prevents an affirmative local decision", async () => {
  const controller = new AbortController();
  const authorizer = createLocalAuthorizer(() => ({
    get decision() {
      controller.abort();
      return true;
    },
  }));
  expect(
    await authorizer.authorize(request("allowed"), {
      signal: controller.signal,
      remainingMs: () => 2000,
    }),
  ).toEqual({ kind: "failure", code: "cancelled" });
});

test("budget exhausted during result validation prevents an affirmative local decision", async () => {
  let remaining = 2000;
  const authorizer = createLocalAuthorizer(() => ({
    get decision() {
      remaining = 0;
      return true;
    },
  }));
  expect(
    await authorizer.authorize(request("allowed"), {
      signal: new AbortController().signal,
      remainingMs: () => remaining,
    }),
  ).toEqual({ kind: "failure", code: "budget_exhausted" });
});
