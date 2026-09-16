import { z } from "zod";
import {
  AuthZenRequestSchema,
  AuthorizationResultSchema,
  type AuthorizationFailureCode,
} from "@drawloom/authorization";
import {
  ToolExposureSchema,
  ToolResultSchema,
  ToolContentSchema,
  type ToolBinding,
  type ToolDefinition,
  type ToolEvidenceSink,
  type ToolGateway,
  type ToolAuthorization,
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
    ? (error.issues[0]?.path ?? []).map((p) => (typeof p === "symbol" ? "?" : p))
    : [];
}
export function createLocalToolGateway(options: {
  tools: readonly ToolDefinition[];
  authorization: ToolAuthorization;
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
          ...(annotations !== undefined ? { annotations: structuredClone(annotations) } : {}),
          inputSchema: structuredClone(inputSchema),
          outputSchema: structuredClone(outputSchema),
        }),
      ),
    }),
  );
  const bindings = new WeakMap<ToolBinding, { operationId: string; active: boolean }>();
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
      if (issuedIds.has(invocationId)) throw Error("Duplicate invocation identity");
      issuedIds.add(invocationId);
      const base = {
        invocationId,
        ...(origin ? { operationId: origin.operationId } : {}),
      };
      const failure = (
        code: Exclude<
          Extract<ToolResult["outcome"], { status: "failed" }>["code"],
          "authorization_failed"
        >,
        execution: "not_started" | "completed" | "unknown",
        invalidPath?: (string | number)[],
      ): ToolResult["outcome"] => ({
        status: "failed",
        code,
        execution,
        ...(invalidPath ? { path: invalidPath } : {}),
      });
      const authorizationFailure = (code: AuthorizationFailureCode): ToolResult["outcome"] => ({
        status: "failed",
        code: "authorization_failed",
        authorizationFailure: code,
        execution: "not_started",
      });
      const { authority, authorizer } = options.authorization;
      let generation: number | undefined;
      const current = () =>
        !!origin?.active &&
        generation !== undefined &&
        authority.isCurrent(origin.operationId, generation);
      const authorized = async (): Promise<ToolResult["outcome"] | undefined> => {
        if (!origin?.active) return failure("denied", "not_started");
        let facts;
        try {
          facts = authority.resolve(origin.operationId, name);
          if (!facts) return failure("denied", "not_started");
          generation ??= facts.generation;
          if (facts.generation !== generation || !current())
            return failure("denied", "not_started");
        } catch {
          return authorizationFailure("invalid_facts");
        }
        const request = AuthZenRequestSchema.safeParse(facts.request);
        if (!request.success) return authorizationFailure("invalid_facts");
        if (signal.aborted) return failure("cancelled", "not_started");
        let result;
        try {
          result = AuthorizationResultSchema.safeParse(
            await authorizer.authorize(request.data, {
              signal,
              remainingMs: () => authority.remainingMs(origin.operationId),
            }),
          );
        } catch {
          return authorizationFailure("rejected");
        }
        // Validate again after provider settlement and result parsing, before publishing allow.
        if (!result.success) return authorizationFailure("malformed_result");
        if ("kind" in result.data) return authorizationFailure(result.data.code);
        if (!current()) return failure("denied", "not_started");
        if (signal.aborted) return failure("cancelled", "not_started");
        return result.data.decision ? undefined : failure("denied", "not_started");
      };
      let outcome: ToolResult["outcome"] | undefined = await authorized();
      let parsed: unknown;
      const tool = catalogue.get(name);
      if (outcome) {
        /* Authorization always precedes unknown-tool disclosure. */
      } else if (!tool) outcome = failure("unknown_tool", "not_started");
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
      if (!outcome) outcome = await authorized();
      if (!outcome && !current()) outcome = failure("denied", "not_started");
      if (!outcome && signal.aborted) outcome = failure("cancelled", "not_started");
      if (!outcome && tool && origin) {
        let raw: unknown;
        try {
          raw = await tool.execute(parsed, {
            ...base,
            operationId: origin.operationId,
            signal,
          });
        } catch {
          outcome = failure(signal.aborted ? "cancelled" : "handler_failed", "unknown");
        }
        if (!outcome && signal.aborted) outcome = failure("cancelled", "completed");
        if (!outcome) {
          try {
            const value = tool.parseOutput(raw);
            try {
              const text = z.string().parse(tool.render(structuredClone(value)));
              const content = tool.renderContent
                ? ToolContentSchema.parse(tool.renderContent(structuredClone(value)))
                : undefined;
              outcome = { status: "ok", value, text, ...(content ? { content } : {}) };
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
