import { z } from "zod";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
export const SettingsTargetSchema = z.strictObject({
  installationId: z.string().uuid(),
  pageId: z.string().min(1).max(200),
});
export const SettingsMountSchema = z.strictObject({ mountId: z.string().uuid() });
export const SettingsRequestSchema = SettingsMountSchema.extend({
  request: CallToolRequestSchema.shape.params,
});
export const SettingsPagesSchema = z.array(
  z.strictObject({
    installationId: z.string().uuid(),
    pageId: z.string(),
    title: z.string(),
    ownerTitle: z.string(),
    workbenchId: z.string().optional(),
    status: z.enum(["available", "disabled", "unavailable"]),
  }),
);
export type SettingsPage = z.infer<typeof SettingsPagesSchema>[number];
