import { z } from "zod";
import {
  ToolExposureSchema,
  ToolResultSchema,
  type ToolBinding,
  type ToolDefinition,
  type ToolEvidenceSink,
  type ToolGateway,
  type ToolPolicy,
  type ToolResult,
} from "@drawloom/tools";
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function path(error: unknown): (string | number)[] {
  return error instanceof z.ZodError
    ? (error.issues[0]?.path ?? []).map((p) =>
        typeof p === "symbol" ? "?" : p,
      )
    : [];
}
export function createLocalToolGateway(options: {
  tools: readonly ToolDefinition[];
  policy: ToolPolicy;
  evidence: ToolEvidenceSink;
  nextInvocationId: () => string;
  exposureId?: string;
}): ToolGateway {
  const catalogue = new Map<string, ToolDefinition>();
  for (const tool of options.tools) {
    if (catalogue.has(tool.name)) throw Error("Duplicate tool identity");
    catalogue.set(tool.name, tool);
  }
  const exposure = freeze(
    ToolExposureSchema.parse({
      id: options.exposureId ?? "local",
      tools: [...catalogue.values()].map(
        ({ name, description, annotations, inputSchema, outputSchema }) => ({
          name,
          description,
          ...(annotations !== undefined
            ? { annotations: structuredClone(annotations) }
            : {}),
          inputSchema: structuredClone(inputSchema),
          outputSchema: structuredClone(outputSchema),
        }),
      ),
    }),
  );
  const bindings = new WeakMap<
    ToolBinding,
    { operationId: string; active: boolean }
  >();
  const issuedIds = new Set<string>();
  return {
    exposure,
    bind(operationId) {
      z.string().min(1).parse(operationId);
      const binding = Object.freeze({}) as ToolBinding;
      bindings.set(binding, { operationId, active: true });
      return binding;
    },
    revoke(binding) {
      const state = bindings.get(binding);
      if (state) state.active = false;
    },
    async invoke(binding, name, args, signal) {
      const origin = bindings.get(binding);
      const invocationId = z.string().min(1).parse(options.nextInvocationId());
      if (issuedIds.has(invocationId))
        throw Error("Duplicate invocation identity");
      issuedIds.add(invocationId);
      const base = {
        invocationId,
        ...(origin ? { operationId: origin.operationId } : {}),
      };
      const failure = (
        code: Extract<ToolResult["outcome"], { status: "failed" }>["code"],
        execution: "not_started" | "completed" | "unknown",
        invalidPath?: (string | number)[],
      ): ToolResult["outcome"] => ({
        status: "failed",
        code,
        execution,
        ...(invalidPath ? { path: invalidPath } : {}),
      });
      const authorized = () => {
        try {
          return !!origin?.active && options.policy(origin.operationId, name);
        } catch {
          return false;
        }
      };
      let outcome: ToolResult["outcome"] | undefined;
      let parsed: unknown;
      const tool = catalogue.get(name);
      if (!authorized()) outcome = failure("denied", "not_started");
      else if (!tool) outcome = failure("unknown_tool", "not_started");
      else if (signal.aborted) outcome = failure("cancelled", "not_started");
      else
        try {
          parsed = tool.parseInput(args);
        } catch (error) {
          outcome = failure("invalid_input", "not_started", path(error));
        }
      try {
        await options.evidence.record({ kind: "started", ...base, tool: name });
      } catch {
        return ToolResultSchema.parse({
          ...base,
          evidence: "start_failed",
          outcome: failure("evidence_failed", "not_started"),
        });
      }
      if (!outcome && !authorized()) outcome = failure("denied", "not_started");
      if (!outcome && signal.aborted)
        outcome = failure("cancelled", "not_started");
      if (!outcome && tool && origin) {
        let raw: unknown;
        try {
          raw = await tool.execute(parsed, {
            ...base,
            operationId: origin.operationId,
            signal,
          });
        } catch {
          outcome = failure(
            signal.aborted ? "cancelled" : "handler_failed",
            "unknown",
          );
        }
        if (!outcome && signal.aborted)
          outcome = failure("cancelled", "completed");
        if (!outcome) {
          try {
            const value = tool.parseOutput(raw);
            try {
              const text = z
                .string()
                .parse(tool.render(structuredClone(value)));
              outcome = { status: "ok", value, text };
            } catch {
              outcome = failure("render_failed", "completed");
            }
          } catch (error) {
            outcome = failure("invalid_output", "completed", path(error));
          }
        }
      }
      const result = ToolResultSchema.parse({
        ...base,
        evidence: "recorded",
        outcome: outcome ?? failure("denied", "not_started"),
      });
      try {
        await options.evidence.record({
          kind: "finished",
          result: structuredClone(result),
        });
      } catch {
        return { ...result, evidence: "outcome_failed" };
      }
      return result;
    },
  };
}
