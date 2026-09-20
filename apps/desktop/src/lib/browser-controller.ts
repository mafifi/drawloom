import {
  DesktopBrowserSnapshotSchema,
  type DesktopBrowser,
  type DesktopBrowserAction,
  type DesktopBrowserSnapshot,
} from "@drawloom/desktop-host";

export type BrowserAction = DesktopBrowserAction;
export type BrowserTabCommand = "back" | "forward" | "reload" | "stop" | "external";
export interface BrowserTransport {
  execute(action: BrowserAction): Promise<unknown>;
  subscribe(listener: (value: unknown) => void, onError?: () => void): Promise<() => void>;
}
const unavailable: DesktopBrowserSnapshot = {
  available: false,
  reason: "Open the native Drawloom app to browse websites here.",
  tabs: [],
  requests: [],
  permissions: [],
};
export class BrowserController {
  snapshot = unavailable;
  selectedId = "";
  error = "";
  pending = "";
  pendingKey = "";
  private unsubscribe?: () => void;
  private stopped = false;
  private generation = 0;
  constructor(
    private readonly transport: BrowserTransport | undefined,
    private readonly changed: () => void,
  ) {}
  private accept(value: unknown) {
    this.snapshot = DesktopBrowserSnapshotSchema.parse(value);
    this.changed();
  }
  async start() {
    if (!this.transport) return;
    const generation = ++this.generation;
    this.stopped = false;
    try {
      const unsubscribe = await this.transport.subscribe(
        (value) => {
          if (this.stopped || generation !== this.generation) return;
          try {
            this.accept(value);
          } catch {
            this.error = "Browser state could not be read. Close and reopen the native app.";
            this.changed();
          }
        },
        () => {
          if (!this.stopped) {
            this.error = "Browser state could not be read. Close and reopen the native app.";
            this.changed();
          }
        },
      );
      if (this.stopped || generation !== this.generation) {
        unsubscribe();
        return;
      }
      this.unsubscribe = unsubscribe;
      await this.command({ kind: "read" });
    } catch {
      this.error = "The native browser connection is unavailable.";
      this.changed();
    }
  }
  dispose() {
    this.stopped = true;
    this.generation++;
    this.unsubscribe?.();
  }
  async command(action: BrowserAction): Promise<boolean> {
    if (!this.transport) {
      this.error = unavailable.reason!;
      this.changed();
      return false;
    }
    if (this.pending) return false;
    const generation = this.generation;
    this.pending = action.kind;
    this.pendingKey =
      action.kind === "forget"
        ? `forget:${action.origin}:${action.permission}`
        : action.kind === "close"
          ? `close:${action.tabId}`
          : action.kind === "decide"
            ? String(action.choice)
            : action.kind;
    this.error = "";
    this.changed();
    try {
      const value = await this.transport.execute(action);
      if (this.stopped || generation !== this.generation) return false;
      this.accept(value);
      return true;
    } catch {
      this.error = "The browser action could not be completed. No retry occurred.";
      return false;
    } finally {
      this.pending = "";
      this.pendingKey = "";
      this.changed();
    }
  }
  async open(conversationId: string) {
    const known = new Set(this.snapshot.tabs.map((tab) => tab.id));
    if (await this.command({ kind: "open", conversationId })) {
      this.selectedId =
        this.snapshot.tabs.find(
          (tab) => tab.conversationId === conversationId && !known.has(tab.id),
        )?.id ?? "";
      this.changed();
    }
  }
  select(tabId: string) {
    this.selectedId = tabId;
    this.changed();
  }
  async close(tabId: string): Promise<boolean> {
    const tab = this.snapshot.tabs.find((tab) => tab.id === tabId);
    if (!tab) return false;
    const siblings = this.snapshot.tabs.filter(
      (item) => item.conversationId === tab.conversationId,
    );
    const index = siblings.findIndex((item) => item.id === tabId);
    if (!(await this.command({ kind: "close", tabId }))) return false;
    if (this.selectedId === tabId) {
      const neighbour = siblings[index + 1] ?? siblings[index - 1];
      this.selectedId =
        neighbour && this.snapshot.tabs.some((item) => item.id === neighbour.id)
          ? neighbour.id
          : "";
      this.changed();
    }
    return true;
  }
  async navigate(value: string) {
    try {
      const url = new URL(value.includes(":") ? value.trim() : `https://${value.trim()}`);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
        throw new Error();
      await this.command({ kind: "navigate", tabId: this.selectedId, url: url.href });
    } catch {
      this.error = "Enter an HTTP or HTTPS address without credentials.";
      this.changed();
    }
  }
  async place(
    tabId: string,
    bounds: { x: number; y: number; width: number; height: number },
    visible: boolean,
  ) {
    if (!this.transport || !this.snapshot.tabs.some((tab) => tab.id === tabId)) return;
    try {
      await this.transport.execute({ kind: "place", tabId, bounds, visible });
    } catch {
      if (!this.snapshot.tabs.some((tab) => tab.id === tabId)) return;
      this.error = "The native browser panel could not be positioned.";
      this.changed();
    }
  }
}

/** Tauri's supported global API is installed only in the native application. */
interface NativeBrowserBridge {
  core: { invoke(command: string, args: { action: DesktopBrowserAction }): Promise<unknown> };
  event: {
    listen(event: string, callback: (event: { payload: unknown }) => void): Promise<() => void>;
  };
}
export function nativeBrowserTransport(): DesktopBrowser | undefined {
  if (typeof window === "undefined") return undefined;
  const native = (
    window as unknown as {
      __TAURI__?: NativeBrowserBridge;
    }
  ).__TAURI__;
  return native ? browserTransportFromBridge(native) : undefined;
}

/** Parse the host boundary once; the same adapter is exercised by scripted conformance. */
export function browserTransportFromBridge(native: NativeBrowserBridge): DesktopBrowser {
  return {
    execute: async (action) =>
      DesktopBrowserSnapshotSchema.parse(await native.core.invoke("browser_command", { action })),
    subscribe: (listener, onError) =>
      native.event.listen("drawloom-browser-changed", (event) => {
        const parsed = DesktopBrowserSnapshotSchema.safeParse(event.payload);
        if (parsed.success) listener(parsed.data);
        else onError?.();
      }),
  };
}
