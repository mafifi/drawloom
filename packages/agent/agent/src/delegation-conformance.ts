import {
  AgentDelegationSchema,
  AgentForkReceiptSchema,
  type AgentDelegations,
  type AgentForks,
} from "./delegation.js";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}

/** Isolated completed source fixture; the supplied target identity is unused. */
export async function agentForkConformance(capability: AgentForks | undefined) {
  if (!capability) return;
  const input = { requestId: "conformance-fork", sessionId: "conformance-target" };
  const missing = await capability.read(input.requestId);
  check(missing.status === "ok" && missing.value === null, "an unknown receipt is absent");
  const created = await capability.create(input);
  check(created.status === "ok", "completed fixture can fork");
  const receipt = AgentForkReceiptSchema.parse(created.value);
  check(
    receipt.requestId === input.requestId &&
      receipt.sessionId === input.sessionId &&
      receipt.state === "created",
    "fork retains exact request and session identity",
  );
  for (const result of [await capability.create(input), await capability.read(input.requestId)]) {
    check(
      result.status === "ok" && JSON.stringify(result.value) === JSON.stringify(receipt),
      "repeated creation and reads recover one receipt",
    );
  }
  check(
    (await capability.create({ ...input, sessionId: "different-target" })).status === "rejected",
    "request identity cannot be rebound to another target",
  );
}

/** Read-only discovery fixture: at least one unloaded child, no interruptible work. */
export async function agentDelegationConformance(capability: AgentDelegations | undefined) {
  if (!capability) return;
  const result = await capability.list();
  check(result.status === "ok" && result.value.length > 0, "fixture must expose a native child");
  const identities = new Set<string>();
  for (const value of result.value) {
    const child = AgentDelegationSchema.parse(value);
    check(!identities.has(child.id), "child identities must be unique");
    identities.add(child.id);
    const inspected = await capability.read(child.id);
    check(
      inspected.status === "ok" && inspected.value.id === child.id,
      "read retains child identity",
    );
    check(child.controls.interrupt !== "available", "fixture must not own interruptible work");
    const interrupted = await capability.interrupt({
      id: child.id,
      revision: child.revision,
    });
    check(interrupted.status === "rejected", "unknown or unavailable control cannot be executed");
    const stale = await capability.interrupt({
      id: child.id,
      revision: "obsolete",
    });
    check(stale.status === "rejected", "stale control cannot be executed");
  }
  const unrelated = await capability.read("not-a-discovered-child");
  check(unrelated.status === "rejected", "read cannot turn an arbitrary identifier into a child");
}
