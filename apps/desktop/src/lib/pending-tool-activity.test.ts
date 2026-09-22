import { expect, test } from "vitest";
import { render } from "svelte/server";
import ToolActivity from "./ToolActivity.svelte";

test("retained pending evidence renders an uncertain non-retrying conversation status", () => {
  const html = render(ToolActivity, {
    props: {
      results: [],
      starts: [
        {
          kind: "started",
          invocationId: "invocation",
          operationId: "operation",
          tool: "example.effect",
        },
      ],
      toolLabels: [],
    },
  }).body;
  expect(html).toContain("Outcome uncertain");
  expect(html).toContain("will not retry it automatically");
  expect(html).not.toContain("Completed");
  expect(html).not.toContain("Failed");
});
