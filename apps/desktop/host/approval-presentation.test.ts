import { expect, test } from "bun:test";
import type { AgentResult } from "@drawloom/agent";
import type {
  ApprovalPresentationActions,
  ApprovalPresenter,
} from "@drawloom/agent/approval-presentation";
import { createApprovalPresentationHost } from "./approval-presentation.js";

function fixture(resolve?: () => Promise<AgentResult<void>>) {
  const surfaces: { actions: ApprovalPresentationActions; signal: AbortSignal }[] = [];
  let calls = 0;
  let stops = 0;
  let fail = false;
  let owned = true;
  const presenter: ApprovalPresenter = {
    present(_request, actions, { signal }) {
      surfaces.push({ actions, signal });
      if (fail) throw Error("Surface unavailable");
    },
  };
  const host = createApprovalPresentationHost({
    presenter,
    owns: (conversationId: string, operationId: string) =>
      owned && conversationId === "c1" && operationId === "op1",
    resolve: async () => {
      calls++;
      if (resolve) return resolve();
      return { status: "ok" as const, value: undefined };
    },
    stop: async () => {
      stops++;
      return { status: "ok" as const, value: undefined };
    },
  });
  const request = {
    conversationId: "c1",
    request: {
      approvalId: "a1",
      operationId: "op1",
      summary: "Allow this action?",
      options: [
        { optionId: "native-allow", label: "Allow once" },
        { optionId: "native-deny", label: "Decline" },
      ],
    },
  };
  return {
    host,
    request,
    surfaces,
    calls: () => calls,
    stops: () => stops,
    fail: (next: boolean) => {
      fail = next;
    },
    revoke: () => {
      owned = false;
    },
  };
}
test("unanswered and dismissed presentations do not resolve native approval", async () => {
  const f = fixture();
  f.host.admit(f.request);
  await Promise.resolve();
  expect(f.host.pending("c1")[0]?.surface).toBe("pending");
  expect(f.calls()).toBe(0);
  f.surfaces[0]!.actions.dismiss();
  expect(f.host.pending("c1")[0]?.surface).toBe("dismissed");
  expect(f.calls()).toBe(0);
  expect((await f.surfaces[0]!.actions.choose("native-allow")).status).toBe("rejected");
  expect((await f.surfaces[0]!.actions.stop()).status).toBe("ok");
  expect(f.stops()).toBe(1);
});

function pendingResolution() {
  let resolve!: (result: AgentResult<void>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<AgentResult<void>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
test("browser lifetime rotates and rejects every stale action including Stop", async () => {
  const f = fixture();
  f.host.admit(f.request);
  const old = f.host.pending("c1")[0]!.presentationId;
  f.host.dismiss("c1", "a1", old);
  f.host.represent("c1", "a1", old);
  const fresh = f.host.pending("c1")[0]!.presentationId;
  expect(fresh).not.toBe(old);
  expect(() => f.host.dismiss("c1", "a1", old)).toThrow();
  expect(() => f.host.represent("c1", "a1", old)).toThrow();
  expect((await f.host.choose("c1", "a1", "native-allow", old)).status).toBe("rejected");
  expect((await f.host.stop("c1", "a1", old)).status).toBe("rejected");
  expect(f.calls()).toBe(0);
  expect(f.stops()).toBe(0);
});
for (const resolved of [false, true]) {
  test(`native invalidation settles an unanswered provider wait (resolved=${resolved})`, async () => {
    const provider = pendingResolution();
    const f = fixture(() => provider.promise);
    f.host.admit(f.request);
    const wait = f.surfaces[0]!.actions.choose("native-allow");
    f.host.invalidate("c1", "a1", resolved);
    expect(
      await Promise.race([
        wait,
        new Promise((resolve) => setTimeout(() => resolve("blocked"), 50)),
      ]),
    ).toMatchObject({ status: resolved ? "ok" : "rejected" });
    provider.reject(Error("Observed late failure"));
    await Promise.resolve();
  });
}
const refused: AgentResult<void> = {
  status: "rejected",
  failure: { code: "provider_unavailable", message: "Unavailable" },
};
for (const failure of ["rejected", "thrown"] as const) {
  test(`pending choice excludes duplicates and ${failure} resolution permits current retry`, async () => {
    const pending = pendingResolution();
    let attempt = 0;
    const f = fixture(() =>
      ++attempt === 1 ? pending.promise : Promise.resolve({ status: "ok", value: undefined }),
    );
    f.host.admit(f.request);
    const surface = f.surfaces[0]!;
    const choosing = surface.actions.choose("native-allow");
    expect(f.host.pending("c1")[0]?.submitting).toBe(true);
    expect((await surface.actions.choose("native-deny")).status).toBe("rejected");
    expect(f.calls()).toBe(1);
    expect((await surface.actions.stop()).status).toBe("ok");
    expect(f.stops()).toBe(1);
    if (failure === "thrown") pending.reject(Error("Disconnected"));
    else pending.resolve(refused);
    expect((await choosing).status).toBe("rejected");
    expect(f.host.pending("c1")[0]?.submitting).toBe(false);
    expect((await surface.actions.choose("native-deny")).status).toBe("ok");
    expect(f.calls()).toBe(2);
    f.host.close();
  });
}
for (const outcome of ["ok", "rejected", "thrown"] as const) {
  test(`late ${outcome} settlement after invalidation cannot change a replacement surface`, async () => {
    const old = pendingResolution();
    const fresh = pendingResolution();
    let attempt = 0;
    const f = fixture(() => (++attempt === 1 ? old.promise : fresh.promise));
    f.host.admit(f.request);
    const stale = f.surfaces[0]!;
    const first = stale.actions.choose("native-allow");
    f.host.invalidate("c1", "a1");
    f.host.admit(f.request);
    const current = f.surfaces[1]!;
    const next = current.actions.choose("native-deny");
    if (outcome === "thrown") old.reject(Error("Late failure"));
    else old.resolve(outcome === "ok" ? { status: "ok", value: undefined } : refused);
    await first;
    stale.actions.dismiss();
    stale.actions.failed();
    expect(stale.signal.aborted).toBe(true);
    expect(current.signal.aborted).toBe(false);
    expect(f.host.pending("c1")[0]).toMatchObject({ surface: "pending", submitting: true });
    expect((await current.actions.choose("native-allow")).status).toBe("rejected");
    expect((await stale.actions.stop()).status).toBe("rejected");
    expect(f.calls()).toBe(2);
    fresh.resolve(refused);
    await next;
    expect(f.host.pending("c1")[0]?.submitting).toBe(false);
    f.host.close();
  });
}
test("failed presentation retries same request and invalidates old surface actions", async () => {
  const f = fixture();
  f.fail(true);
  f.host.admit(f.request);
  await Promise.resolve();
  expect(f.host.pending("c1")[0]?.surface).toBe("failed");
  expect((await f.surfaces[0]!.actions.choose("native-allow")).status).toBe("rejected");
  f.fail(false);
  f.host.represent("c1", "a1", f.host.pending("c1")[0]!.presentationId);
  expect(f.host.pending("c1")).toHaveLength(1);
  expect(f.surfaces[0]!.signal.aborted).toBe(true);
  expect((await f.surfaces[0]!.actions.choose("native-allow")).status).toBe("rejected");
  expect((await f.surfaces[1]!.actions.choose("invented")).status).toBe("rejected");
  expect((await f.surfaces[1]!.actions.choose("native-allow")).status).toBe("ok");
  expect((await f.surfaces[1]!.actions.choose("native-allow")).status).toBe("rejected");
  expect(f.calls()).toBe(1);
});
test("cross conversation, revoked ownership and native invalidation reject stale choices", async () => {
  const f = fixture();
  f.host.admit(f.request);
  expect(
    (await f.host.choose("c2", "a1", "native-allow", f.host.pending("c1")[0]!.presentationId))
      .status,
  ).toBe("rejected");
  f.revoke();
  expect((await f.surfaces[0]!.actions.choose("native-allow")).status).toBe("rejected");
  f.host.invalidate("c1");
  expect(f.surfaces[0]!.signal.aborted).toBe(true);
  expect(f.host.pending("c1")).toEqual([]);
  expect(f.calls()).toBe(0);
});
