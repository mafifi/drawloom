import { test, expect } from "bun:test";
import { toolConformance } from "@drawloom/tools/conformance";
import { createLocalToolGateway } from "../local-tools/src/index.js";
for (const [tool, message] of [
  ["invalid-output", "invalid output preserves one settled execution"],
  ["render-copy", "renderer cannot alter canonical value"],
  ["render-failure", "render failure preserves settlement"],
  ["handler-failure", "handler failure preserves uncertainty"],
  [
    "cancel-after-entry",
    "cancellation after entry cannot retry or claim rollback",
  ],
] as const) {
  test(`shared suite rejects broken ${tool} behavior`, async () => {
    await expect(
      toolConformance((options) => {
        const gateway = createLocalToolGateway(options);
        const invoke = gateway.invoke;
        return {
          ...gateway,
          async invoke(binding, name, args, signal) {
            const result = await invoke(binding, name, args, signal);
            if (name !== tool) return result;
            if (name === "invalid-output")
              return {
                ...result,
                outcome: {
                  status: "ok" as const,
                  value: "wrong",
                  text: "wrong",
                },
              };
            if (name === "render-copy")
              return {
                ...result,
                outcome: {
                  status: "ok" as const,
                  value: { text: "mutated" },
                  text: "presentation",
                },
              };
            if (result.outcome.status === "failed")
              return {
                ...result,
                outcome: {
                  ...result.outcome,
                  execution: "not_started" as const,
                },
              };
            return result;
          },
        };
      }),
    ).rejects.toThrow(message);
  });
}
