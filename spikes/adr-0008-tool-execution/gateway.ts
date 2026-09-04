import { z } from "zod";
import { ResultSchema, type GatewayFactory, type Outcome, type ToolSpec } from "./contract.ts";

const failed = (code: Extract<Outcome, { status: "failed" }>["code"],
  execution: "not_started" | "completed" | "unknown"): Outcome => ({ status: "failed", code, execution });
const invalid = (code: "invalid_input" | "invalid_output", error: unknown): Outcome => ({
  status: "failed", code, execution: code === "invalid_input" ? "not_started" : "completed",
  path: error instanceof z.ZodError
    ? (error.issues[0]?.path ?? []).filter((part): part is string | number => typeof part !== "symbol") : [],
});

export const createGateway: GatewayFactory = ({ tools, allowed, record }) => {
  const catalogue = new Map<string, ToolSpec>();
  for (const tool of tools) {
    if (catalogue.has(tool.name)) throw new Error("Duplicate tool name");
    catalogue.set(tool.name, tool);
  }
  return {
    catalogue: () => [...catalogue.values()].map(({ name, description, inputSchema, outputSchema }) =>
      ({ name, description, inputSchema: structuredClone(inputSchema), outputSchema: structuredClone(outputSchema) })),
    invoke: async (binding, name, args, signal) => {
      const invocationId = crypto.randomUUID();
      const operationId = binding.operationId;
      const tool = catalogue.get(name);
      let parsed: unknown;
      let outcome: Outcome | undefined;
      if (!tool) outcome = failed("unknown_tool", "not_started");
      else {
        try { parsed = tool.parseInput(args); }
        catch (error) { outcome = invalid("invalid_input", error); }
      }
      const permitted = () => {
        try { return allowed(binding, name); }
        catch { return false; }
      };
      if (!outcome && !permitted()) outcome = failed("denied", "not_started");
      if (!outcome && signal.aborted) outcome = failed("cancelled", "not_started");
      try { await record({ kind: "started", invocationId, operationId, tool: name }); }
      catch {
        return ResultSchema.parse({ invocationId, outcome: outcome ?? failed("evidence_unavailable", "not_started"), evidence: "start_failed" });
      }
      if (!outcome && !permitted()) outcome = failed("denied", "not_started");
      if (!outcome && signal.aborted) outcome = failed("cancelled", "not_started");
      if (!outcome && tool) {
        let returned: unknown;
        try {
          returned = await tool.execute(parsed, Object.freeze({ invocationId, operationId, signal }));
        } catch {
          outcome = failed(signal.aborted ? "cancelled" : "execution_failed", "unknown");
        }
        if (!outcome && signal.aborted) outcome = failed("cancelled", "completed");
        if (!outcome) {
          try {
            const value = tool.parseOutput(returned);
            try {
              const text = z.string().parse(tool.render(value));
              outcome = { status: "succeeded", value, text };
            } catch { outcome = failed("presentation_failed", "completed"); }
          } catch (error) { outcome = invalid("invalid_output", error); }
        }
      }
      if (!outcome) throw new Error("Invocation did not settle");
      let evidence: "recorded" | "outcome_failed" = "recorded";
      try { await record({ kind: "finished", invocationId, operationId, tool: name, outcome: structuredClone(outcome) }); }
      catch { evidence = "outcome_failed"; }
      return ResultSchema.parse({ invocationId, outcome, evidence });
    },
  };
};
