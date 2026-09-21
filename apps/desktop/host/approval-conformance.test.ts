import { expect, test } from "vitest";
import { approvalPresentationConformance } from "@drawloom/agent/approval-conformance";
import { approvalConformanceFixture } from "../tests/approval-conformance-fixture.js";

test("default fixture drives actual application snapshots, commands and native transport", async () => {
  const fixture = await approvalConformanceFixture("desktop");
  try {
    const native = await fixture.open();
    expect(native.request.options.map((option) => option.optionId)).toEqual([
      "option-0",
      "option-1",
    ]);
    expect(fixture.trace()).toEqual(
      expect.arrayContaining([
        "command:add_project",
        "command:send",
        "native:item/commandExecution/requestApproval",
        "snapshot",
      ]),
    );
    const surface = (await fixture.surface())!;
    await surface.actions.dismiss();
    expect(fixture.trace()).toContain("command:approval_surface");
    expect(await fixture.state()).toBe("dismissed");
  } finally {
    await fixture.close();
  }
});

for (const mode of ["desktop", "inbox"] as const) {
  test(`${mode} approval integration satisfies shared presentation conformance`, async () => {
    await approvalPresentationConformance((options) => approvalConformanceFixture(mode, options));
  }, 30000);
}
test("approval conformance rejects a presenter which automatically chooses", async () => {
  await expect(
    approvalPresentationConformance(() =>
      approvalConformanceFixture(
        "desktop",
        {},
        {
          present(input, actions) {
            void actions.choose(input.request.options[0]!.optionId);
          },
        },
      ),
    ),
  ).rejects.toThrow("without a user response");
});
