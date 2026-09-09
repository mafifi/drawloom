import { z } from "zod";
import { AssetSchema } from "@drawloom/host";
const id = z.string().min(1);
export const WorkbenchSchema = z.strictObject({
  id,
  title: z.string().min(1),
  description: z.string(),
  tools: z.array(id),
  skills: z.array(id),
});
export type Workbench = z.infer<typeof WorkbenchSchema>;
export const ArtifactSchema = z.strictObject({
  id,
  operationId: id.optional(),
  title: z.string(),
  /** Explicit editing support; omission is read-only. */
  editable: z.boolean().optional(),
  content: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("text"), text: z.string() }),
    z.strictObject({ kind: z.literal("asset"), asset: AssetSchema }),
  ]),
});
export type Artifact = z.infer<typeof ArtifactSchema>;
export const CandidateSchema = z.strictObject({
  id,
  artifactIds: z.array(id),
  label: z.string(),
  status: z.enum(["draft", "in_review", "accepted", "rejected"]),
  comparisonKey: id.optional(),
  selectedForOutput: z.boolean().optional(),
  stale: z.boolean().optional(),
  reviewAction: z.strictObject({
    kind: z.literal("recovery"),
    label: z.string().min(1).max(160),
    description: z.string().min(1).max(4096),
  }).optional(),
});
export type Candidate = z.infer<typeof CandidateSchema>;
export const ReviewSchema = z.strictObject({
  id,
  candidateId: id,
  summary: z.string(),
  findings: z.array(
    z.strictObject({
      path: z.string(),
      summary: z.string(),
      severity: z.enum(["info", "warning", "error"]),
    }),
  ),
});
export type Review = z.infer<typeof ReviewSchema>;

/** UI authority is established by the host channel, never by a field here. */
export const OperatorCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("revise_document"), candidateId: id, artifactId: id, text: z.string().max(100000) }),
  z.strictObject({ kind: z.literal("select_candidate"), candidateId: id }),
  z.strictObject({ kind: z.literal("review_candidate"), candidateId: id,
    decision: z.enum(["accepted", "rejected"]), summary: z.string().max(4096) }),
  z.strictObject({ kind: z.literal("configure"), key: id, value: z.union([z.string().max(4096), z.number(), z.boolean()]) }),
  z.strictObject({ kind: z.literal("set_tool_grant"), toolName: id, allowed: z.boolean() }),
]);
export type OperatorCommand = z.infer<typeof OperatorCommandSchema>;
export const OperatorSnapshotSchema = z.strictObject({
  artifacts: z.array(ArtifactSchema), candidates: z.array(CandidateSchema),
  reviews: z.array(ReviewSchema), selectedCandidateId: id.optional(),
  readiness: z.enum(["ready", "configuration_required", "unavailable"]),
  summary: z.string().max(4096),
  /** Declarative non-secret fields only; credentials stay in trusted composition. */
  configuration: z.array(z.strictObject({ key: id, label: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]) })),
  grants: z.array(z.strictObject({ toolName: id, allowed: z.boolean() })),
  groups: z.array(z.strictObject({ id, title: z.string().min(1),
    artifactIds: z.array(id), candidateIds: z.array(id) })).optional(),
  spending: z.strictObject({ summary: z.string().min(1).max(4096) }).optional(),
}).superRefine((s, context) => {
  const artifacts = new Set(s.artifacts.map(a => a.id));
  const candidates = new Set(s.candidates.map(c => c.id));
  if (artifacts.size !== s.artifacts.length || candidates.size !== s.candidates.length ||
      new Set(s.groups?.map(g => g.id)).size !== (s.groups?.length ?? 0) ||
      s.candidates.some(c => c.artifactIds.some(id => !artifacts.has(id))) ||
      s.groups?.some(g => g.artifactIds.some(id => !artifacts.has(id)) || g.candidateIds.some(id => !candidates.has(id))) ||
      (s.selectedCandidateId && !candidates.has(s.selectedCandidateId))) {
    context.addIssue({ code: 'custom', message: 'Presentation identities must be unique and references must resolve' });
  }
});
export type OperatorSnapshot = z.infer<typeof OperatorSnapshotSchema>;
export const OperatorResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ok"), snapshot: OperatorSnapshotSchema }),
  z.strictObject({ status: z.literal("rejected"), code: z.enum(["invalid_command", "not_found", "not_ready", "conflict"]), message: z.string().max(512) }),
]);
export type OperatorResult = z.infer<typeof OperatorResultSchema>;
/**
 * Never register as an agent tool. No retries or implicit grants.
 * Mutations commit in call order; overlapping dispatch/intake must not lose accepted work.
 */
export interface OperatorController {
  /** Host-only exact-correlated intake. Operation + asset identity is idempotent; grants never change. */
  readonly observeArtifact?: (input: ArtifactIntake) => Promise<void>;
  snapshot(): Promise<OperatorSnapshot>;
  dispatch(command: OperatorCommand): Promise<OperatorResult>;
}
export const ArtifactIntakeSchema = z.strictObject({ operationId: id, asset: AssetSchema });
export type ArtifactIntake = z.infer<typeof ArtifactIntakeSchema>;
