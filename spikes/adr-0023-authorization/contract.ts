import { z } from 'zod';

// AuthZEN 1.0 envelope subset, not a new Drawloom capability contract.
const entity = z.object({ type: z.string(), id: z.string(), properties: z.record(z.string(), z.unknown()).optional() });
export const requestSchema = z.object({
  subject: entity,
  action: z.object({ name: z.string(), properties: z.record(z.string(), z.unknown()).optional() }),
  resource: entity,
  context: z.record(z.string(), z.unknown()).optional(),
});
export type Evaluation = z.infer<typeof requestSchema>;
export type Decision = { decision: boolean };
export type Engine = (request: Evaluation) => Promise<Decision>;

// Illustrative profile attributes supplied by the trusted host, not standardized labels.
export const subjectSchema = z.object({ tenant: z.string(), active: z.boolean(), clearance: z.number().int().min(0).max(2), compartments: z.array(z.string()) });
export const resourceSchema = z.object({ tenant: z.string(), active: z.boolean(), sensitivity: z.number().int().min(0).max(2), compartments: z.array(z.string()), expires: z.number().int().nonnegative(), remoteAllowed: z.boolean() });
export type Subject = z.infer<typeof subjectSchema>;
export type Labels = z.infer<typeof resourceSchema>;
