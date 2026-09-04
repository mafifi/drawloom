import { z } from "zod";

// Only locally authored assertions may appear in the redacted live summary.
export class ProofFailure extends Error {}
export const describeFailure = (error: unknown): string =>
  error instanceof ProofFailure ? error.message
    : error instanceof z.ZodError ? "Boundary validation failed"
    : "Provider or runtime failure (details redacted)";

// Private proof control file, written only by the trusted live-test composition.
export const StateSchema = z.strictObject({
  entries: z.array(z.strictObject({
    threadId: z.string(), turnId: z.string(), operationId: z.string(),
    active: z.boolean(), allowedTools: z.array(z.string()),
  })),
});
export type RuntimeState = z.infer<typeof StateSchema>;
export const ObservationSchema = z.strictObject({
  operationId: z.string(), invocationId: z.string(),
  status: z.string(), evidence: z.string(), code: z.string().optional(),
  serverInstance: z.string(),
});
