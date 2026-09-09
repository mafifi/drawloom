import { test, expect } from "bun:test";
import { agentConformance } from "./src/conformance.js";
import { syntheticAgentFixture as fixture } from "../../../scripts/agent-conformance-fixtures.mjs";
test("shared suite rejects an exposed steering method that accepts a stale target", async () => {
  await expect(
    agentConformance(() => {
      const f = fixture();
      const open = f.driver.openSession;
      f.driver.openSession = async (input) => {
        const result = await open(input);
        if (result.status === "ok")
          return {
            status: "ok",
            value: {
              ...result.value,
              steer: async () => ({ status: "ok", value: undefined }),
            },
          };
        return result;
      };
      return f;
    }),
  ).rejects.toThrow("steer rejects stale target");
});
test("shared suite rejects an accepted operation with no message completion", async () => {
  await expect(
    agentConformance(() => {
      const f = fixture();
      const open = f.driver.openSession;
      f.driver.openSession = async (input) => {
        const result = await open(input);
        if (result.status === "ok") {
          const session = result.value;
          return {
            status: "ok",
            value: {
              ...session,
              signals() {
                const source = session.signals();
                let consumed = false;
                return {
                  [Symbol.asyncIterator]() {
                    if (consumed) throw Error("consumed");
                    consumed = true;
                    return (async function* () {
                      for await (const event of source)
                        if (!event.kind.startsWith("message.")) yield event;
                    })();
                  },
                };
              },
            },
          };
        }
        return result;
      };
      return f;
    }),
  ).rejects.toThrow("complete message snapshot");
});
