import {
  AgentSessionSignalSchema,
  DiscoverySnapshotSchema,
  type AgentDriver,
  type AgentSession,
  type AgentSessionSignal,
} from "./index.js";
import type { ToolExposure } from "@drawloom/tools";

/** Provider fixtures translate these scenarios through their real private wire mapping.
 * complete emits "hello" (deltas when supported), followed by provider completion.
 * Interaction fixtures issue two approvals (decline / acceptForSession) and two
 * schema-validated {text:string} inputs. Their responses report actual callbacks.
 */
export type AgentConformanceFixture = {
  driver: AgentDriver;
  complete(): Promise<void>;
  contextText(): string;
  controls?: {
    steeringText(): string;
    interruptCount(): number;
    confirmInterruption(): Promise<void>;
  };
  interactions?: {
    request(): Promise<void>;
    responses(): unknown[];
  };
  tools?: {
    exposure: ToolExposure;
    advertised(): ToolExposure;
    allow(value: boolean): void;
    invoke(
      operationId: string,
    ): Promise<{ success: boolean; operationId?: string }>;
    effects(): number;
  };
};
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
/** Optional discovery never silently accepts unknown selections, on any provider. */
export async function agentDiscoveryConformance(driver: AgentDriver): Promise<void> {
  const opened=await driver.openSession({sessionId:'discovery-conformance',context:{text:''},tools:{id:'none',tools:[]}});
  check(opened.status==='ok','discovery session opens');
  const session=opened.value;session.signals();
  try {
    check((await session.execute({operationId:'unknown-selection',text:'',selections:[{id:'unknown',revision:'unknown'}]})).status==='rejected','unsupported or unknown selection rejected');
    check((await session.execute({operationId:'forged-selection',text:'',selections:[{id:'unknown',revision:'unknown',path:'/untrusted/SKILL.md'}]} as unknown as Parameters<AgentSession['execute']>[0])).status==='rejected','selection cannot supply native path');
    if(session.discovery) {
      const first=await session.discovery.list();check(first.status==='ok','discovery reports category status');
      DiscoverySnapshotSchema.parse(first.value);
      const second=await session.discovery.list();check(second.status==='ok'&&second.value.revision===first.value.revision,'discovery caches revision');
      session.discovery.invalidate();
      const fresh=await session.discovery.list();check(fresh.status==='ok'&&fresh.value.revision!==first.value.revision,'invalidation produces new revision');
    }
  } finally {await session.close();}
  if(session.discovery)check((await session.discovery.list()).status==='rejected','closed discovery rejected');
}
function observer(session: AgentSession) {
  const stream = session.signals();
  const iterator = stream[Symbol.asyncIterator]();
  let sameIterator = false;
  let rejected = false;
  try {
    sameIterator = stream[Symbol.asyncIterator]() === iterator;
  } catch {
    rejected = true;
  }
  check(
    rejected || sameIterator,
    "second iteration must not create another waiter",
  );
  rejected = false;
  try {
    session.signals();
  } catch {
    rejected = true;
  }
  check(rejected, "second signal subscription");
  const events: AgentSessionSignal[] = [];
  return {
    events,
    async next() {
      const next = await iterator.next();
      check(!next.done, "stream ended before expected signal");
      const event = AgentSessionSignalSchema.parse(next.value);
      events.push(event);
      return event;
    },
    async drain() {
      while (true) {
        const next = await iterator.next();
        if (next.done) return;
        events.push(AgentSessionSignalSchema.parse(next.value));
      }
    },
  };
}
async function interactions(
  fixture: AgentConformanceFixture,
  session: AgentSession,
  read: ReturnType<typeof observer>,
) {
  if (!fixture.interactions) return;
  await fixture.interactions.request();
  const pending = await Promise.all([
    read.next(),
    read.next(),
    read.next(),
    read.next(),
  ]);
  const approvals = pending.filter((e) => e.kind === "approval.requested");
  const inputs = pending.filter((e) => e.kind === "input.requested");
  check(
    approvals.length === 2 && inputs.length === 2,
    "multiple independent interactions",
  );
  check(
    [...approvals, ...inputs].every(
      (event) => event.request.operationId === "a",
    ),
    "interactions remain attached to their originating operation",
  );
  const first = approvals[0]!.request;
  const second = approvals[1]!.request;
  check(first.approvalId !== second.approvalId, "unique approval IDs");
  check(
    JSON.stringify(second.options.map((o) => o.label)) ===
      '["decline","acceptForSession"]',
    "lossless advertised choices",
  );
  check(
    (
      await session.resolveApproval({
        approvalId: second.approvalId,
        optionId: "invented",
      })
    ).status === "rejected",
    "invented approval choice",
  );
  check(
    (
      await session.resolveApproval({
        approvalId: second.approvalId,
        optionId: second.options[1]!.optionId,
      })
    ).status === "ok",
    "second approval resolution",
  );
  check(
    ((event) =>
      event.kind === "approval.resolved" &&
      event.approvalId === second.approvalId &&
      event.optionId === second.options[1]!.optionId)(await read.next()),
    "approval resolution signal",
  );
  check(
    (
      await session.resolveApproval({
        approvalId: first.approvalId,
        optionId: first.options[0]!.optionId,
      })
    ).status === "ok",
    "first approval resolution",
  );
  check(
    ((event) =>
      event.kind === "approval.resolved" &&
      event.approvalId === first.approvalId &&
      event.optionId === first.options[0]!.optionId)(await read.next()),
    "approval resolution order",
  );
  check(
    (
      await session.resolveApproval({
        approvalId: first.approvalId,
        optionId: first.options[0]!.optionId,
      })
    ).status === "rejected",
    "approval cannot resolve twice",
  );
  const inputFirst = inputs[0]!.request;
  const inputSecond = inputs[1]!.request;
  check(
    inputFirst.requestId !== inputSecond.requestId &&
      inputSecond.responseSchema !== undefined,
    "input identity and schema",
  );
  check(
    (
      await session.respondToInput({
        requestId: inputSecond.requestId,
        action: "submit",
        value: { text: 3 },
      })
    ).status === "rejected",
    "invalid input response",
  );
  check(
    (
      await session.respondToInput({
        requestId: inputSecond.requestId,
        action: "submit",
        value: { text: "hello" },
      })
    ).status === "ok",
    "second input resolution",
  );
  check(
    ((event) =>
      event.kind === "input.resolved" &&
      event.requestId === inputSecond.requestId)(await read.next()),
    "input resolution signal",
  );
  check(
    (
      await session.respondToInput({
        requestId: inputFirst.requestId,
        action: "cancel",
      })
    ).status === "ok",
    "input cancellation",
  );
  check(
    ((event) =>
      event.kind === "input.resolved" &&
      event.requestId === inputFirst.requestId)(await read.next()),
    "input cancellation signal",
  );
  check(
    (
      await session.respondToInput({
        requestId: inputFirst.requestId,
        action: "cancel",
      })
    ).status === "rejected",
    "input cannot resolve twice",
  );
  check(
    JSON.stringify(fixture.interactions.responses()) ===
      JSON.stringify([
        { kind: "approval", index: 1, value: "acceptForSession" },
        { kind: "approval", index: 0, value: "decline" },
        { kind: "input", index: 1, value: { text: "hello" } },
        { kind: "input", index: 0, value: null },
      ]),
    "resolutions target exact originating callbacks",
  );
  if (fixture.tools) {
    const denied = await fixture.tools.invoke("a");
    check(!denied.success, "input and approval must not grant tool authority");
  }
  await fixture.interactions.request();
  const stale = await Promise.all([
    read.next(),
    read.next(),
    read.next(),
    read.next(),
  ]);
  return stale;
}
export async function agentConformance(
  factory: () => AgentConformanceFixture | Promise<AgentConformanceFixture>,
): Promise<void> {
  const fixture = await factory();
  await agentDiscoveryConformance(fixture.driver);
  const exposure = structuredClone(
    fixture.tools?.exposure ?? { id: "empty", tools: [] },
  );
  const initialExposure = JSON.stringify(exposure);
  const opened = await fixture.driver.openSession({
    sessionId: "session-a",
    context: { text: "context sentinel" },
    tools: exposure,
  });
  check(opened.status === "ok", "open");
  const session = opened.value;
  try {
    check(
      (await session.execute({ operationId: "unobserved", text: "x" }))
        .status === "rejected",
      "execution without observer",
    );
    const read = observer(session);
    check(Array.isArray(session.reviewerModes) && session.reviewerModes.includes('human'), 'explicit human reviewer support');
    if (!session.reviewerModes.includes('delegated')) {
      check((await session.execute({ operationId: 'unsupported-review', text: 'work', reviewer: 'delegated' })).status === 'rejected', 'unsupported reviewer must not silently downgrade');
    }
    const firstSignal = read.next();
    const accepting = session.execute({
      operationId: "a",
      text: "hello",
      additionalContext: { text: "fresh sentinel" },
    });
    check(
      (await session.execute({ operationId: "overlap", text: "x" })).status ===
        "rejected",
      "overlap while starting",
    );
    check((await accepting).status === "ok", "acceptance");
    check(
      (await firstSignal).kind === "operation.started",
      "waiting consumer receives started",
    );
    check(
      (await session.execute({ operationId: "other", text: "x" })).status ===
        "rejected",
      "overlap while active",
    );
    check(
      fixture.contextText().includes("context sentinel") &&
        fixture.contextText().includes("fresh sentinel"),
      "session and fresh context consumption",
    );
    if (session.steer) {
      check(
        (await session.steer({ operationId: "stale", text: "x" })).status ===
          "rejected",
        "steer rejects stale target",
      );
      check(fixture.controls, "exposed controls require their fixture");
      check(
        (
          await session.steer({
            operationId: "a",
            text: "steering sentinel",
            additionalContext: { text: "steering context" },
          })
        ).status === "ok",
        "steer accepted",
      );
      check(
        fixture.controls.steeringText().includes("steering sentinel") &&
          fixture.controls.steeringText().includes("steering context"),
        "steering text and context consumption",
      );
    }
    if (fixture.tools) {
      exposure.tools.length = 0;
      check(
        JSON.stringify(fixture.tools.advertised()) === initialExposure,
        "advertised exposure is immutable after open",
      );
      fixture.tools.allow(true);
      const call = await fixture.tools.invoke("a");
      check(
        call.success &&
          call.operationId === "a" &&
          fixture.tools.effects() === 1,
        "tool call bound to originating operation",
      );
      fixture.tools.allow(false);
      check(
        !(await fixture.tools.invoke("a")).success &&
          fixture.tools.effects() === 1,
        "live authority revocation",
      );
    }
    const stale = await interactions(fixture, session, read);
    await fixture.complete();
    let terminal: AgentSessionSignal;
    do {
      terminal = await read.next();
    } while (!terminal.kind.startsWith("operation."));
    check(terminal.kind === "operation.completed", "completion after messages");
    const completed = read.events.filter((e) => e.kind === "message.completed");
    check(
      completed.length === 1 && completed[0]!.text === "hello",
      "complete message snapshot",
    );
    const deltas = read.events.filter((e) => e.kind === "message.delta");
    if (deltas.length)
      check(
        deltas.every((e) => e.messageId === completed[0]!.messageId) &&
          deltas.map((e) => e.delta).join("") === "hello",
        "ordered deltas assemble to snapshot",
      );
    check(
      read.events.findIndex((e) => e.kind === "message.completed") >
        read.events.map((e) => e.kind === "message.delta").lastIndexOf(true),
      "no deltas after message completion",
    );
    for (const pending of stale ?? []) {
      if (pending.kind === "approval.requested")
        check(
          (
            await session.resolveApproval({
              approvalId: pending.request.approvalId,
              optionId: pending.request.options[0]!.optionId,
            })
          ).status === "rejected",
          "terminal invalidates pending approval",
        );
      if (pending.kind === "input.requested")
        check(
          (
            await session.respondToInput({
              requestId: pending.request.requestId,
              action: "cancel",
            })
          ).status === "rejected",
          "terminal invalidates pending input",
        );
    }
    if (fixture.tools) {
      fixture.tools.allow(true);
      check(
        (await session.execute({ operationId: "b", text: "hello" })).status ===
          "ok",
        "next operation",
      );
      check(
        (await read.next()).kind === "operation.started",
        "next operation started",
      );
      const delayed = await fixture.tools.invoke("a");
      check(
        !delayed.success && fixture.tools.effects() === 1,
        "old operation cannot borrow next authority",
      );
      const current = await fixture.tools.invoke("b");
      check(
        current.success &&
          current.operationId === "b" &&
          fixture.tools.effects() === 2,
        "new operation has only its own authority",
      );
      check(
        JSON.stringify(fixture.tools.advertised()) === initialExposure,
        "catalogue stable across authority changes",
      );
      await fixture.complete();
      do {
        terminal = await read.next();
      } while (!terminal.kind.startsWith("operation."));
      check(terminal.kind === "operation.completed", "next operation complete");
    }
    await session.close();
    await session.close();
    await read.drain();
    check(
      read.events.filter(
        (e) =>
          e.kind.startsWith("operation.") && e.kind !== "operation.started",
      ).length === (fixture.tools ? 2 : 1),
      "exact terminal count and no replay",
    );
    check(
      (
        await session.resolveApproval({
          approvalId: "stale",
          optionId: "allow",
        })
      ).status === "rejected",
      "stale approval",
    );
    check(
      (await session.respondToInput({ requestId: "stale", action: "cancel" }))
        .status === "rejected",
      "stale input",
    );
    check(
      !AgentSessionSignalSchema.safeParse({
        kind: "operation.completed",
        operationId: "a",
        threadId: "private",
      }).success,
      "strict safe signals",
    );
  } finally {
    await session.close();
  }
  const second = await factory();
  const openedSecond = await second.driver.openSession({
    sessionId: "closing",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  check(openedSecond.status === "ok", "second open");
  const s = openedSecond.value;
  const read = observer(s);
  try {
    await s.execute({ operationId: "active", text: "work" });
    await read.next();
    if (s.interrupt) {
      check(second.controls, "interrupt requires its fixture");
      check(
        (await s.interrupt("stale")).status === "rejected",
        "interrupt rejects stale target",
      );
      const first = s.interrupt("active");
      const concurrent = s.interrupt("active");
      check(
        (await first).status === "ok" &&
          (await concurrent).status === "ok" &&
          second.controls.interruptCount() === 1,
        "concurrent interruption shares provider command",
      );
      check(
        (await s.execute({ operationId: "premature", text: "x" })).status ===
          "rejected",
        "interrupt submission does not finish operation",
      );
      await second.controls.confirmInterruption();
      check(
        (await read.next()).kind === "operation.interrupted",
        "provider confirms interruption",
      );
      check(
        (await s.interrupt("active")).status === "ok" &&
          second.controls.interruptCount() === 1,
        "confirmed interruption is idempotent",
      );
      if (s.steer)
        check(
          (await s.steer({ operationId: "active", text: "stale" })).status ===
            "rejected",
          "terminal steer rejected",
        );
      await s.execute({ operationId: "close-active", text: "work" });
      await read.next();
    }
    const pendingAtClose: AgentSessionSignal[] = [];
    if (second.interactions) {
      await second.interactions.request();
      pendingAtClose.push(
        ...(await Promise.all([
          read.next(),
          read.next(),
          read.next(),
          read.next(),
        ])),
      );
    }
    const waiting = read.next();
    await s.close();
    check(
      (await waiting).kind === "operation.interrupted",
      "pending reader sees close terminal",
    );
    await read.drain();
    for (const event of pendingAtClose) {
      if (event.kind === "approval.requested")
        check(
          (
            await s.resolveApproval({
              approvalId: event.request.approvalId,
              optionId: event.request.options[0]!.optionId,
            })
          ).status === "rejected",
          "close invalidates pending approval",
        );
      if (event.kind === "input.requested")
        check(
          (
            await s.respondToInput({
              requestId: event.request.requestId,
              action: "cancel",
            })
          ).status === "rejected",
          "close invalidates pending input",
        );
    }
    await second.complete();
  } finally {
    await s.close();
  }
}
