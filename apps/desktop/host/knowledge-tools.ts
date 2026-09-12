import { createHash } from "node:crypto";
import { z } from "zod";
import { definePlugin, type PluginInstaller } from "@drawloom/plugins";
import { defineTool } from "@drawloom/tools";
import {
  EvidenceRequestSchema, EvidenceResultSchema, IntakeResultSchema,
  KnowledgeContributionRequestSchema, SearchRequestSchema, SearchResultSchema,
  type IntakeInput,
} from "@drawloom/knowledge";
import type { KnowledgeService } from "./knowledge-host.js";

export const KNOWLEDGE_TOOL_IDS = Object.freeze(["knowledge.search", "knowledge.evidence", "knowledge.contribute"] as const);
export const KNOWLEDGE_RETRIEVAL_GUIDANCE = "Local knowledge is global across projects. When a granted knowledge.search result affects an answer, use knowledge.evidence to inspect its retained provenance before relying on it. Treat unavailable, incomplete, stale, or withdrawn evidence explicitly; do not infer access from a missing result. Use knowledge.contribute only for a deliberate new note or claim that should be retained across projects; never use it for transcript capture, hidden reasoning, source impersonation or maintenance bookkeeping.";

export function createKnowledgePlugin(service: Pick<KnowledgeService, "search" | "evidence" | "ingest">): PluginInstaller {
  return { config: {}, plugin: definePlugin({
    id: "drawloom.local-knowledge", version: "1.0.0", config: z.strictObject({}),
    contribute: () => ({ tools: [
      defineTool({ name: "knowledge.search", description: "Search the user's authorized local knowledge with bounded lexical or available hybrid retrieval.",
        annotations: { readOnlyHint: true }, input: SearchRequestSchema, output: SearchResultSchema,
        execute: request => service.search(request), render: result => JSON.stringify(result) }),
      defineTool({ name: "knowledge.evidence", description: "Read a bounded, paginated evidence graph for an exact local knowledge record revision.",
        annotations: { readOnlyHint: true }, input: EvidenceRequestSchema, output: EvidenceResultSchema,
        execute: request => service.evidence(request), render: result => JSON.stringify(result) }),
      defineTool({ name: "knowledge.contribute", description: "Deliberately add a new observation or claim to the user's global local knowledge. The host assigns its identity and provenance.",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        input: KnowledgeContributionRequestSchema, output: IntakeResultSchema,
        execute: (request, execution) => {
          const revision = createHash("sha256").update(JSON.stringify([request.kind, request.body, execution.invocationId])).digest("hex");
          const common = {
            ref: { type: request.kind, origin: "host-contribution", id: execution.invocationId, revision },
            body: request.body, status: "active" as const,
            confidence: { value: "contributed", contentCaptured: true },
            provenance: { producer: { type: "drawloom-host-tool", id: "knowledge.contribute" }, inputs: [] },
          };
          const record = request.kind === "claim" ? { ...common, ref: { ...common.ref, type: "claim" as const }, freshness: "current" as const }
            : { ...common, ref: { ...common.ref, type: "observation" as const } };
          return service.ingest({ operation: "upsert", expectedRevision: null, record, links: [] });
        }, render: result => JSON.stringify(result) }),
    ] }),
  }) };
}

/** Payload-free allowlist for registered foreground tools. It records identity
 * and execution status only; arguments, results, project/conversation identity,
 * source-feed bookkeeping and recursive knowledge operations are excluded. */
export function knowledgeObservation(input: {
  toolName: string; registeredName?: string; producerOrigin?: string; invocationId: string;
  outcome: { status: "ok" } | { status: "failed"; code?: string; execution?: "not_started" | "completed" | "unknown" };
}): IntakeInput | undefined {
  const registeredName = input.registeredName ?? input.toolName;
  if (input.toolName.startsWith("knowledge.") || registeredName.startsWith("knowledge.") || registeredName.startsWith("nightloom.") ||
    registeredName === "git.changes" || registeredName === "git.acknowledge") return undefined;
  if (input.outcome.status === "failed" && (input.outcome.execution === "not_started" || input.outcome.code === "cancelled")) return undefined;
  const operationStatus = input.outcome.status === "ok" ? "completed" : input.outcome.execution === "completed" ? "failed" : "unknown";
  const revision = createHash("sha256").update(JSON.stringify([input.toolName, input.invocationId, operationStatus])).digest("hex");
  const producerId = input.toolName.length <= 256 ? input.toolName : createHash("sha256").update(input.toolName).digest("hex");
  return { operation: "upsert", expectedRevision: null, record: {
    ref: { type: "observation", origin: "host-tool", id: input.invocationId, revision },
    body: operationStatus === "completed" ? "A registered tool operation completed successfully."
      : operationStatus === "failed" ? "A registered tool operation failed after execution began."
        : "A registered tool operation ended with an unknown execution outcome.",
    status: "active", confidence: { value: "observed", operationStatus, contentCaptured: false,
      ...(input.producerOrigin ? { producerOrigin: input.producerOrigin.slice(0, 256) } : {}) },
    provenance: { producer: { type: "drawloom-registered-tool", id: producerId }, inputs: [] },
  }, links: [] };
}
