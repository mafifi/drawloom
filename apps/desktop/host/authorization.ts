import {
  AuthZenRequestSchema,
  type Authorizer,
  type AuthZenRequest,
} from "@drawloom/authorization";
import { type KnowledgeWorkerAuthority, type KnowledgeWorkerAdmission } from "@drawloom/knowledge";
import type { ToolAuthorization } from "@drawloom/tools";
import { createAuthorizationScheduler } from "@drawloom/authorization-scheduler";
import { createLocalAuthorizer } from "@drawloom/local-authorization";
import { ContextPreparationRequestSchema } from "@drawloom/context";
import { isDeepStrictEqual } from "node:util";

/** Trusted startup selection and lifecycle; never part of browser commands. */
export function createDesktopAuthorization(selected?: Authorizer) {
  const scheduler = createAuthorizationScheduler(
    selected ??
      createLocalAuthorizer((request) => ({
        decision:
          (request.action.name === "invoke" &&
            request.resource.type === "tool" &&
            request.subject.properties.granted === true) ||
          (request.subject.type === "user" &&
            request.subject.id === "local-owner" &&
            (request.resource.properties.scope === "global-knowledge" ||
              (request.resource.type === "embedding-destination" &&
                request.resource.properties.local === true))),
      })),
  );
  let generation = 0;
  let sequence = 0;
  const operationGenerations = new Map<string, number>();
  let closed = false;
  const knowledgeLeases = new Map<string, Set<AbortController>>();
  const invalidate = (operationId?: string) => {
    if (operationId) operationGenerations.set(operationId, ++sequence);
    else {
      generation = ++sequence;
      operationGenerations.clear();
    }
    for (const [id, leases] of knowledgeLeases)
      if (!operationId || operationId === id)
        for (const lease of leases) lease.abort(closed ? "shutdown" : "cancelled");
  };
  const generationFor = (operationId: string) =>
    operationGenerations.get(operationId) ?? generation;
  return {
    foreground: scheduler.foreground,
    background: scheduler.background,
    invalidate,
    /** Task3 supplies effective-consent/binding checks here; invalidation aborts pending leases. */
    knowledge(
      options: { current?(admission: KnowledgeWorkerAdmission): boolean } = {},
    ): KnowledgeWorkerAuthority {
      return {
        invalidate: () => invalidate(),
        admit(admission, parent) {
          const binding =
            admission.method === "knowledge.prepare" &&
            admission.params &&
            typeof admission.params === "object"
              ? Reflect.get(admission.params, "binding")
              : undefined;
          const scopeId =
            binding && typeof binding.executionId === "string"
              ? binding.executionId
              : admission.operationId;
          const expected = generationFor(scopeId);
          const controller = new AbortController();
          let disposed = false;
          const isCurrent = () =>
            !closed &&
            !disposed &&
            !controller.signal.aborted &&
            generationFor(scopeId) === expected &&
            (options.current?.(admission) ?? true);
          const cancel = () => controller.abort();
          parent.signal.addEventListener("abort", cancel, { once: true });
          if (parent.signal.aborted) cancel();
          const leases = knowledgeLeases.get(scopeId) ?? new Set<AbortController>();
          leases.add(controller);
          knowledgeLeases.set(scopeId, leases);
          const operation = { signal: controller.signal, remainingMs: parent.remainingMs };
          return {
            operation,
            isCurrent,
            authorizer: {
              async authorize(value, evaluation) {
                if (closed) return { kind: "failure", code: "shutdown" };
                if (!isCurrent()) return { kind: "failure", code: "cancelled" };
                const parsed = AuthZenRequestSchema.safeParse(value);
                if (!parsed.success || !knowledgeFactsMatch(admission, parsed.data))
                  return { kind: "failure", code: "invalid_facts" };
                const result = await (admission.background || backgroundMethod(admission.method)
                  ? scheduler.background
                  : scheduler.foreground
                ).authorize(parsed.data, {
                  signal: AbortSignal.any([operation.signal, evaluation.signal]),
                  remainingMs: () => Math.min(operation.remainingMs(), evaluation.remainingMs()),
                });
                if (closed) return { kind: "failure", code: "shutdown" };
                if (!isCurrent()) return { kind: "failure", code: "cancelled" };
                return result;
              },
            },
            dispose() {
              if (disposed) return;
              disposed = true;
              controller.abort();
              parent.signal.removeEventListener("abort", cancel);
              leases.delete(controller);
              if (!leases.size) knowledgeLeases.delete(scopeId);
            },
          };
        },
      };
    },
    tools(options: {
      owns(operationId: string): boolean;
      facts(operationId: string, tool: string): AuthZenRequest;
      background(): boolean;
      remainingMs?(operationId: string): number;
    }): ToolAuthorization {
      return {
        authorizer: {
          authorize: (request, evaluation) =>
            (options.background() ? scheduler.background : scheduler.foreground).authorize(
              request,
              evaluation,
            ),
        },
        authority: {
          resolve: (operationId, tool) =>
            !closed && options.owns(operationId)
              ? {
                  generation: generationFor(operationId),
                  request: options.facts(operationId, tool),
                }
              : undefined,
          isCurrent: (operationId, expected) =>
            !closed && generationFor(operationId) === expected && options.owns(operationId),
          remainingMs: (operationId) =>
            options.remainingMs?.(operationId) ?? Number.MAX_SAFE_INTEGER,
        },
      };
    },
    shutdown() {
      if (closed) return;
      closed = true;
      invalidate();
      scheduler.shutdown();
    },
  };
}

function backgroundMethod(method: string) {
  return (
    method.startsWith("knowledge.maintenance.") ||
    [
      "knowledge.assess",
      "knowledge.reconcile",
      "knowledge.cancel-assessment",
      "knowledge.index",
    ].includes(method)
  );
}
const actions: Record<string, readonly string[]> = {
  "knowledge.search": ["knowledge.search", "knowledge.get", "knowledge.maintain", "embed"],
  "knowledge.get": ["knowledge.get"],
  "knowledge.expand": ["knowledge.expand"],
  "knowledge.evidence": ["knowledge.evidence"],
  "knowledge.export": ["knowledge.export"],
  "knowledge.ingest": ["knowledge.ingest"],
  "knowledge.prepare": [
    "knowledge.search",
    "knowledge.get",
    "knowledge.maintain",
    "embed",
    "knowledge.disclose",
  ],
  "knowledge.assess": ["assess"],
  "knowledge.reconcile": ["assess.reconcile", "assess"],
  "knowledge.cancel-assessment": ["assess.cancel"],
  "knowledge.index": ["knowledge.index", "knowledge.get", "knowledge.maintain", "embed"],
};
function knowledgeFactsMatch(admission: KnowledgeWorkerAdmission, request: AuthZenRequest) {
  const { subject, action, resource, context } = request;
  if (
    subject.type !== "user" ||
    subject.id !== "local-owner" ||
    subject.properties.locality !== "device" ||
    subject.properties.scope !== "global-knowledge" ||
    Object.keys(subject.properties).length !== 2
  )
    return false;
  const permitted =
    actions[admission.method] ??
    (admission.method.startsWith("knowledge.maintenance.") ||
    [
      "knowledge.status",
      "knowledge.configure",
      "knowledge.download",
      "knowledge.cancel-download",
      "knowledge.cleanup-obsolete-runtime",
    ].includes(admission.method)
      ? ["knowledge.maintain"]
      : []);
  if (!permitted.includes(action.name)) return false;
  if (action.name === "embed")
    return (
      resource.type === "embedding-destination" &&
      resource.properties.local === true &&
      resource.id === "local:qwen3-embedding-0.6b-gguf"
    );
  if (
    !["knowledge-store", "knowledge-record"].includes(resource.type) ||
    resource.properties.locality !== "device" ||
    resource.properties.scope !== "global-knowledge"
  )
    return false;
  if (resource.type === "knowledge-store" && resource.id !== "local-global") return false;
  if (resource.properties.action !== undefined && resource.properties.action !== action.name)
    return false;
  if (action.name.startsWith("assess"))
    return (
      context?.destination === admission.assessmentDestination &&
      resource.properties.destination === admission.assessmentDestination
    );
  if (action.name === "knowledge.disclose") {
    const preparation = ContextPreparationRequestSchema.safeParse(admission.params);
    const destination = { type: "agent-provider", id: "codex", properties: {} };
    return (
      preparation.success &&
      isDeepStrictEqual(context?.execution, preparation.data.binding) &&
      isDeepStrictEqual(context?.destination, destination) &&
      isDeepStrictEqual(resource.properties.destination, destination)
    );
  }
  return resource.properties.destination === undefined && context?.destination === undefined;
}
