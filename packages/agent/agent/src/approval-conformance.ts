import type { AgentResult } from "./index.js";
import type {
  ApprovalPresentationActions,
  ApprovalPresentationRequest,
  ApprovalSurfaceState,
} from "./approval-presentation.js";

/** Test-only driver for a presentation integrated with its authority-owning host.
 * Native identities come from the actual adapter. Failure is injected at trusted
 * startup in a separate fixture, never through a new browser command. */
export interface ApprovalPresentationFixture {
  open(): Promise<ApprovalPresentationRequest>;
  surface(): Promise<
    | {
        input: ApprovalPresentationRequest;
        actions: Pick<ApprovalPresentationActions, "choose" | "stop"> & {
          dismiss(): void | Promise<void>;
        };
      }
    | undefined
  >;
  state(): Promise<ApprovalSurfaceState | undefined>;
  reopen(): Promise<void>;
  invalidate(): Promise<void>;
  chooseElsewhere(): Promise<AgentResult<void>>;
  resolutions(): readonly string[];
  stops(): number;
  close(): void | Promise<void>;
}
export interface ApprovalConformanceOptions {
  failPresentation?: boolean;
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}

/** Shared behavior through controls/callbacks and native signals. Hosts retain
 * authority; this suite does not establish rendered accessibility. */
export async function approvalPresentationConformance(
  create: (
    options: ApprovalConformanceOptions,
  ) => ApprovalPresentationFixture | Promise<ApprovalPresentationFixture>,
): Promise<void> {
  const fixture = await create({});
  try {
    const input = await fixture.open();
    const first = await fixture.surface();
    check(
      fixture.resolutions().length === 0,
      "presentation must not choose without a user response",
    );
    check(first, "approval has a surface");
    check(
      JSON.stringify(first.input) === JSON.stringify(input),
      "native request and option identities are preserved",
    );
    check((await fixture.state()) === "pending", "unanswered approval remains pending");
    check(
      (await fixture.chooseElsewhere()).status === "rejected",
      "other conversations cannot answer",
    );
    check(
      (await first.actions.choose("invented-option")).status === "rejected",
      "only native options can be selected",
    );
    check(fixture.resolutions().length === 0, "invalid choices never reach native resolution");
    await first.actions.dismiss();
    check((await fixture.state()) === "dismissed", "dismissal is distinct from waiting");
    check(fixture.resolutions().length === 0, "dismissal never resolves native approval");
    await fixture.reopen();
    const reopened = await fixture.surface();
    check(reopened, "dismissed request can be presented again");
    check(
      reopened.input.request.approvalId === input.request.approvalId,
      "re-presentation retains native request identity",
    );
    const firstOption = input.request.options[0]!.optionId;
    const lastOption = input.request.options.at(-1)!.optionId;
    check(
      (await first.actions.choose(firstOption)).status === "rejected",
      "replaced surface cannot choose",
    );
    check(
      (await first.actions.stop()).status === "rejected",
      "replaced surface cannot stop later work",
    );
    check(
      (await reopened.actions.choose(lastOption)).status === "ok",
      "native choice reaches host",
    );
    check(
      JSON.stringify(fixture.resolutions()) === JSON.stringify([lastOption]),
      "exact native choice is forwarded once",
    );
    check(
      (await reopened.actions.choose(firstOption)).status === "rejected",
      "duplicate responses are rejected",
    );
  } finally {
    await fixture.close();
  }

  const failing = await create({ failPresentation: true });
  try {
    const input = await failing.open();
    check((await failing.state()) === "failed", "failed presentation is not an unanswered surface");
    check(failing.resolutions().length === 0, "failed presentation never resolves native approval");
    await failing.reopen();
    const retried = await failing.surface();
    check(
      retried && (await failing.state()) === "pending",
      "failed presentation can retry the pending request",
    );
    check(
      retried.input.request.approvalId === input.request.approvalId,
      "failure recovery retains native request identity",
    );
    check(
      (await retried.actions.choose(input.request.options[0]!.optionId)).status === "ok",
      "recovered presentation forwards a native choice",
    );
  } finally {
    await failing.close();
  }

  const retired = await create({});
  try {
    const input = await retired.open();
    const surface = await retired.surface();
    check(surface, "pending request has a surface before native completion");
    await retired.invalidate();
    check((await retired.state()) === undefined, "native completion retires unanswered approval");
    check(
      (await surface.actions.choose(input.request.options[0]!.optionId)).status === "rejected",
      "retired request cannot resolve",
    );
    check(
      (await surface.actions.stop()).status === "rejected",
      "retired request cannot stop another operation",
    );
    check(
      retired.stops() === 0 && retired.resolutions().length === 0,
      "stale callbacks have no effects",
    );
  } finally {
    await retired.close();
  }

  const stopping = await create({});
  try {
    await stopping.open();
    const surface = await stopping.surface();
    check(surface, "unanswered approval has controls");
    check(
      (await surface.actions.stop()).status === "ok",
      "Stop remains available without answering",
    );
    check(
      stopping.stops() === 1 && stopping.resolutions().length === 0,
      "Stop is independent of approval resolution",
    );
  } finally {
    await stopping.close();
  }
}
