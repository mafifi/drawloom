import { z } from "zod";
const id = z.string().min(1);

/** Native-state presentation snapshot. Retention does not confer current control authority. */
export const DelegationSnapshotSchema = z
  .strictObject({
    id,
    parentId: id.nullable(),
    revision: id,
    originatingOperationId: id.optional(),
    operationId: id.optional(),
    label: z.string().min(1),
    status: z.enum([
      "starting",
      "running",
      "waiting",
      "completed",
      "failed",
      "interrupted",
      "unknown",
    ]),
    result: z.discriminatedUnion("state", [
      z.strictObject({ state: z.literal("available"), text: z.string() }),
      z.strictObject({ state: z.enum(["unavailable", "unknown"]) }),
    ]),
    controls: z.strictObject({
      interrupt: z.enum(["available", "pending", "unavailable", "unknown"]),
    }),
  })
  .refine((child) => child.id !== child.parentId, "A child cannot own itself");
