import { test } from "bun:test";
import { contextPreparationConformance, createDeterministicContextPreparer } from "./src/conformance.js";

test("deterministic context preparer satisfies shared conformance", async () => {
  await contextPreparationConformance({
    preparer: createDeterministicContextPreparer(),
    readyRequest: "What did we learn?",
    emptyRequest: "nothing",
    unavailableRequest: "offline",
  });
});
