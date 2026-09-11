import { z } from 'zod';
import { ResourceOriginSchema } from './package-protocol.js';

/** Host policy metadata only: never file URLs, credentials or access tokens. */
export const MediaPolicySnapshotSchema = z.strictObject({
  revision: z.string().min(1),
  // Bound individual producer deliveries, not the installation's lifetime total.
  sources: z.array(z.strictObject({ origin: ResourceOriginSchema, sources: z.array(z.string().min(1).max(512)) })),
});
export type MediaPolicySnapshot = z.infer<typeof MediaPolicySnapshotSchema>;
