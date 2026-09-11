import { z } from 'zod';
import { JsonValueSchema } from '@drawloom/host';
export const ResourceOriginSchema = z.string().max(2048).refine(value => {
  try { const url=new URL(value);return !value.includes('*') && !url.username && !url.password && url.origin===value &&
    (url.protocol==='https:' || url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)); }
  catch {return false;}
},'Use an exact HTTPS media origin, without a path or wildcard');
export const PackageInspectionSchema = z.strictObject({
  root: z.string(), name: z.string(), version: z.string().optional(),
  backend: z.boolean(), skills: z.array(z.string()),
  servers: z.array(z.strictObject({ name: z.string(), transport: z.string() })),
  diagnostics: z.array(z.string()),
});
export const PackageSettingsSchema = z.strictObject({
  approvedResourceOrigins: z.array(ResourceOriginSchema).max(32).optional(),
  enabled: z.boolean(), trustedBackend: z.boolean(), servers: z.array(z.string()).max(100),
  configuration: z.record(z.string(), JsonValueSchema).optional(),
});
export const PackageActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('inspect'), root: z.string().min(1).max(4096) }),
  z.strictObject({ action: z.literal('add'), root: z.string().min(1).max(4096) }),
  z.strictObject({ action: z.literal('configure'), id: z.string().uuid(), settings: PackageSettingsSchema }),
]);
export const InstalledPackagesSchema = z.array(z.strictObject({
  approvedResourceOrigins: z.array(ResourceOriginSchema).default([]),
  id: z.string().uuid(), root: z.string(), name: z.string(), enabled: z.boolean(), trustedBackend: z.boolean(),
  servers: z.array(z.string()), pendingRestart: z.boolean(), status: z.string(), diagnostics: z.array(z.string()),
  availableServers: z.array(z.strictObject({ name: z.string(), transport: z.string() })).default([]),
  connections: z.array(z.strictObject({ name: z.string(), status: z.string(), transport: z.string(), code: z.string().optional() })),
}));
export type PackageAction = z.infer<typeof PackageActionSchema>;
export const PackageOAuthActionSchema = z.discriminatedUnion('action', [z.strictObject({
  action: z.enum(['status', 'connect', 'cancel', 'reconnect', 'disconnect']), id: z.string().uuid(), server: z.string().min(1),
}), z.strictObject({ action: z.literal('configure-client'), id: z.string().uuid(), server: z.string().min(1),
  registrationFile: z.string().min(1).max(4096),
})]);
export const PackageOAuthStatusSchema = z.strictObject({
  state: z.string(), credentialMode: z.enum(['os', 'session']), issuer: z.string().optional(), code: z.string().optional(),
  authorizationUrl: z.string().url().optional(), restartRequired: z.boolean().optional(),
});
