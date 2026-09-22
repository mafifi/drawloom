import { z } from "zod";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  McpUiMessageResultSchema,
  type McpUiMessageRequest,
  type McpUiUpdateModelContextRequest,
} from "@modelcontextprotocol/ext-apps";
import { telemetryFetch } from "./telemetry.js";

const OpenedSchema = z.object({
  mountId: z.string().uuid(),
  mediaRevision: z.string().min(1),
});

export type PluginViewTarget = { readonly viewId: string; readonly conversationId: string };
export type PluginViewOpened = z.infer<typeof OpenedSchema>;

/**
 * Every request a hosted plugin view makes, and the schemas its answers must
 * satisfy.
 *
 * This lived inside `PluginViewFrame.svelte`: three `fetch` calls and two
 * schema parses in a component that had no test of any kind, and which
 * `check:ui-policy` reported as clean because it never looked inside `.svelte`
 * for service access. The frame keeps what is genuinely DOM-bound — the
 * iframe, its load counting, theme media queries and the outro transition —
 * and owns none of the protocol.
 *
 * The mount is opened once and every later call awaits it, so a close or an
 * interaction can never race ahead of the mount it refers to.
 */
export function createPluginViewSession(options: {
  readonly target: PluginViewTarget;
  readonly signal: AbortSignal;
  readonly fetch?: typeof globalThis.fetch;
}) {
  const request = options.fetch ?? telemetryFetch;
  const { target, signal } = options;
  const active = () => {
    if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  };
  const post = async (path: string, body: unknown, init?: RequestInit) => {
    const response = await request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...init,
    });
    if (!response.ok) throw Error(`Request to ${path} failed`);
    return response.json();
  };

  const opened: Promise<PluginViewOpened> = post("/api/view-session", {
    ...target,
    action: "open",
  }).then((value) => OpenedSchema.parse(value));
  let released = false;

  return {
    /** Resolves once the host has a mount for this view. */
    opened,
    /**
     * Released with `keepalive` so the request survives the page going away,
     * and it deliberately swallows its own failure: a close that cannot be
     * delivered must not surface as an unhandled rejection during teardown.
     * It is never given the abort signal — aborting is what triggers it.
     */
    release(): void {
      // The frame's outro and onMount cleanup can both release the same mount.
      // Only the first path may dispatch a close, even if opening resolves late.
      if (released) return;
      released = true;
      void opened
        .then(({ mountId }) =>
          post("/api/view-session", { ...target, mountId, action: "close" }, { keepalive: true }),
        )
        .catch(() => {});
    },
    async interact(
      value: McpUiMessageRequest | McpUiUpdateModelContextRequest,
    ): Promise<z.infer<typeof McpUiMessageResultSchema>> {
      const { mountId } = await opened;
      active();
      return McpUiMessageResultSchema.parse(
        await post("/api/view-interaction", { ...target, mountId, request: value }, { signal }),
      );
    },
    async callTool(value: unknown): Promise<z.infer<typeof CallToolResultSchema>> {
      active();
      return CallToolResultSchema.parse(
        await post("/api/view-request", { ...target, request: value }, { signal }),
      );
    },
  };
}

export type PluginViewSession = ReturnType<typeof createPluginViewSession>;
