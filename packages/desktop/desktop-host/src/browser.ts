import { z } from "zod";

const id = z.string().min(1).max(256);
export const BrowserOriginSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && url.origin === value;
    } catch {
      return false;
    }
  }, "Expected an HTTP(S) origin without credentials, path or query");
export const BrowserPermissionSchema = z.enum(["camera", "microphone"]);
export const BrowserPermissionChoiceSchema = z.enum(["allow_once", "allow", "block", "dismiss"]);
export const BrowserPermissionRequestSchema = z.strictObject({
  id,
  tabId: id,
  documentId: id,
  origin: BrowserOriginSchema,
  topOrigin: BrowserOriginSchema,
  permissions: z.array(BrowserPermissionSchema).min(1).max(2),
});
export const BrowserPermissionSettingSchema = z.strictObject({
  origin: BrowserOriginSchema,
  permission: BrowserPermissionSchema,
  decision: z.enum(["allow", "block"]),
});
export const BrowserTabSchema = z.strictObject({
  id,
  conversationId: id,
  title: z.string().max(512),
  url: z.string().max(8192),
  status: z.enum(["unloaded", "blank", "loading", "ready", "failed"]),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  error: z.string().max(1024).optional(),
});
export const DesktopBrowserSnapshotSchema = z.strictObject({
  available: z.boolean(),
  reason: z.string().optional(),
  tabs: z.array(BrowserTabSchema),
  requests: z.array(BrowserPermissionRequestSchema),
  permissions: z.array(BrowserPermissionSettingSchema),
});
export type BrowserTab = z.infer<typeof BrowserTabSchema>;
export type DesktopBrowserSnapshot = z.infer<typeof DesktopBrowserSnapshotSchema>;
export type BrowserPermissionChoice = z.infer<typeof BrowserPermissionChoiceSchema>;
export type BrowserPermissionSetting = z.infer<typeof BrowserPermissionSettingSchema>;
export type BrowserPermissionRequest = z.infer<typeof BrowserPermissionRequestSchema>;

/** Host-only capability. Deliberately absent from PluginBackendCapabilities. */
export type DesktopBrowserAction =
  | { kind: "read" }
  | { kind: "open"; conversationId: string }
  | { kind: "navigate"; tabId: string; url: string }
  | { kind: "back" | "forward" | "reload" | "stop" | "close" | "external"; tabId: string }
  | {
      kind: "place";
      tabId: string;
      bounds: { x: number; y: number; width: number; height: number };
      visible: boolean;
    }
  | { kind: "decide"; requestId: string; choice: BrowserPermissionChoice }
  | { kind: "forget"; origin: string; permission: BrowserPermissionSetting["permission"] };

/** Commands return authoritative complete snapshots; failures must not be retried implicitly. */
export interface DesktopBrowser {
  execute(action: DesktopBrowserAction): Promise<DesktopBrowserSnapshot>;
  subscribe(
    listener: (snapshot: DesktopBrowserSnapshot) => void,
    onError?: () => void,
  ): Promise<() => void>;
}
