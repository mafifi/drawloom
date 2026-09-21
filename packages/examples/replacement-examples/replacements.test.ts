import { expect, test } from "vitest";
import { contextAssemblyConformance } from "@drawloom/context/assembly-conformance";
import { createSectionedContextAssembler, createInboxApprovalPresenter } from "./src/index.js";

for (const finish of ["abort", "dismiss", "failed"] as const) {
  test(`captured inbox actions are inert after ${finish}`, async () => {
    const presenter = createInboxApprovalPresenter();
    const controller = new AbortController();
    const calls: string[] = [];
    presenter.present(
      {
        conversationId: "c1",
        request: {
          approvalId: "a1",
          operationId: "op1",
          summary: "Review",
          options: [{ optionId: "native-allow", label: "Allow" }],
        },
      },
      {
        async choose(option) {
          calls.push(option);
          return { status: "ok", value: undefined };
        },
        async stop() {
          calls.push("stop");
          return { status: "ok", value: undefined };
        },
        dismiss() {
          calls.push("dismiss");
        },
        failed() {
          calls.push("failed");
        },
      },
      { signal: controller.signal },
    );
    const captured = presenter.pending()[0]!;
    if (finish === "abort") controller.abort();
    else captured.actions[finish]();
    expect(presenter.pending()).toEqual([]);
    expect((await captured.actions.choose("native-allow")).status).toBe("rejected");
    expect((await captured.actions.stop()).status).toBe("rejected");
    captured.actions.dismiss();
    captured.actions.failed();
    expect(calls).toEqual(finish === "abort" ? [] : [finish]);
  });
}

test("alternative sectioned assembler passes shared conformance", () =>
  contextAssemblyConformance(createSectionedContextAssembler));
test("alternative session assembly honors cancellation during input validation", async () => {
  const controller = new AbortController();
  const result = await createSectionedContextAssembler().session(
    {
      get instructions() {
        controller.abort();
        return [];
      },
      skills: [],
      guidance: [],
    },
    { signal: controller.signal },
  );
  expect(result).toEqual({ kind: "failure", code: "cancelled" });
});
test("alternative approval inbox never chooses an option merely by showing a request", async () => {
  const presenter = createInboxApprovalPresenter();
  const controller = new AbortController();
  let selected = "";
  let dismissed = false;
  presenter.present(
    {
      conversationId: "conversation",
      request: {
        approvalId: "approval",
        operationId: "operation",
        summary: "Review action",
        options: [{ optionId: "native-option", label: "Native option" }],
      },
    },
    {
      async choose(option) {
        selected = option;
        return { status: "ok", value: undefined };
      },
      dismiss() {
        dismissed = true;
      },
      failed() {},
      async stop() {
        return { status: "ok", value: undefined };
      },
    },
    { signal: controller.signal },
  );
  expect(presenter.pending()).toHaveLength(1);
  expect(selected).toBe("");
  const surface = presenter.pending()[0]!;
  await surface.actions.choose("native-option");
  expect(selected).toBe("native-option");
  surface.actions.dismiss();
  expect(dismissed).toBe(true);
  controller.abort();
  expect(presenter.pending()).toHaveLength(0);
});
