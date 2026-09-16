import assert from "node:assert/strict";
import { authorizationConformance } from "../packages/authorization/authorization/dist/conformance.js";
import { createLocalAuthorizer } from "../packages/authorization/local-authorization/dist/index.js";
import { createDeterministicAuthorizer } from "../packages/authorization/deterministic-authorization/dist/index.js";
import { createAuthorizationScheduler } from "../packages/authorization/authorization-scheduler/dist/index.js";

const request = (project) => ({
  subject: { type: "user", id: "owner", properties: { projects: ["a"] } },
  action: { name: "read" },
  resource: { type: "record", id: "one", properties: { project } },
});
const allow = request("a");
const deny = request("b");
const unavailable = { ...allow, context: { unavailable: true } };
for (const scheduled of [false, true]) {
  let revoked = false;
  const local = createLocalAuthorizer((r) =>
    r.context?.unavailable
      ? { kind: "failure", code: "unavailable" }
      : { decision: !revoked && r.resource.properties.project === "a" },
  );
  const deterministic = createDeterministicAuthorizer({ delayMs: 1 });
  for (const [provider, revoke] of [
    [
      local,
      () => {
        revoked = true;
      },
    ],
    [deterministic, () => deterministic.revoke("owner")],
  ]) {
    const scheduler = scheduled ? createAuthorizationScheduler(provider) : undefined;
    try {
      await authorizationConformance({
        authorizer: scheduler?.foreground ?? provider,
        allow,
        deny,
        unavailable,
        revoke,
      });
    } finally {
      scheduler?.shutdown();
    }
  }
}

const options = { signal: new AbortController().signal, remainingMs: () => 5000 };
let calls = 0;
const pending = [];
const scheduler = createAuthorizationScheduler({
  authorize: () => {
    calls++;
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  },
});
const foreground = Array.from({ length: 36 }, () => scheduler.foreground.authorize(allow, options));
const background = Array.from({ length: 12 }, () => scheduler.background.authorize(allow, options));
assert.equal(calls, 16);
assert.deepEqual(await scheduler.foreground.authorize(allow, options), {
  kind: "failure",
  code: "overflow",
});
assert.deepEqual(await scheduler.background.authorize(allow, options), {
  kind: "failure",
  code: "overflow",
});
scheduler.shutdown();
assert.ok((await Promise.all([...foreground, ...background])).every((r) => r.code === "shutdown"));
for (const deferred of pending) deferred.reject(Error("late rejection after shutdown"));
await new Promise((resolve) => setTimeout(resolve, 0));

let finish;
const timed = createAuthorizationScheduler({
  authorize: () =>
    new Promise((resolve) => {
      finish = resolve;
    }),
});
assert.deepEqual(await timed.foreground.authorize(allow, { ...options, remainingMs: () => 75 }), {
  kind: "failure",
  code: "budget_exhausted",
});
finish({ decision: true });
timed.shutdown();
console.log(
  "Node authorization: both providers and scheduled providers passed shared conformance; mixed pools, overflow, shutdown, late rejections and real deadline passed",
);
