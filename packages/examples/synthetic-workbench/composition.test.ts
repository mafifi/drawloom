import { test, expect } from "bun:test";
import { createSyntheticWorkbench } from "./src/index.js";
test("registration alone never grants synthetic tool execution", async () => {
  const workbench = createSyntheticWorkbench({ record: async () => {} });
  const binding = workbench.gateway.bind("a");
  const signal = new AbortController().signal;
  expect(
    (
      await workbench.gateway.invoke(
        binding,
        "text.word_count",
        { text: "one two" },
        signal,
      )
    ).outcome,
  ).toMatchObject({ code: "denied" });
  workbench.grant("a");
  expect(
    (
      await workbench.gateway.invoke(
        binding,
        "text.word_count",
        { text: "one two" },
        signal,
      )
    ).outcome,
  ).toMatchObject({ status: "ok", value: { count: 2 } });
  workbench.revoke("a");
  expect(
    (
      await workbench.gateway.invoke(
        binding,
        "text.word_count",
        { text: "one two" },
        signal,
      )
    ).outcome,
  ).toMatchObject({ code: "denied" });
});
