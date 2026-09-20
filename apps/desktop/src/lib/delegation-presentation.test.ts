import { expect, test } from "bun:test";
import { delegationPresentation } from "./delegation-presentation.js";
import type { AgentDelegation } from "@drawloom/agent";
const child: AgentDelegation = {
  id: "child",
  parentId: null,
  revision: "r",
  label: "Reviewer",
  status: "running",
  result: { state: "unknown" },
  controls: { interrupt: "available" },
};
test("retained native controls never become current control authority", () => {
  expect(delegationPresentation(child, undefined, false)).toMatchObject({
    interrupt: false,
    followUp: false,
    statusLabel: "Outcome unverified",
    expanded: true,
  });
  expect(delegationPresentation(child, child, true)).toMatchObject({
    interrupt: true,
    followUp: true,
    statusLabel: "Working",
  });
});
