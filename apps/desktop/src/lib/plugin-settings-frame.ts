import { PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { SettingsMountSchema, type SettingsPage } from "./plugin-settings-protocol.js";
import {
  createPluginViewBridge,
  closePluginViewBridge,
  updatePluginViewTheme,
} from "./plugin-view-bridge.js";

/** Parent-owned mount routing. The isolated document can supply only tool parameters. */
export function attachSettingsFrame(
  frame: HTMLIFrameElement,
  page: SettingsPage,
  status: (value: "loading" | "ready" | "failed") => void,
) {
  const source = frame.contentWindow!;
  const appearance = matchMedia("(prefers-color-scheme: dark)");
  const theme = () => (appearance.matches ? ("dark" as const) : ("light" as const));
  const abort = new AbortController();
  let released = false;
  let loads = 0;
  status("loading");
  const opened = fetch("/api/settings/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installationId: page.installationId, pageId: page.pageId }),
  }).then(async (response) => {
    if (!response.ok) throw Error("Settings unavailable");
    return SettingsMountSchema.parse(await response.json()).mountId;
  });
  const release = () => {
    if (released) return;
    released = true;
    void opened
      .then((mountId) =>
        fetch("/api/settings/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({ mountId }),
        }),
      )
      .catch(() => {});
  };
  const bridge = createPluginViewBridge({
    theme: theme(),
    callTool: async (request) => {
      if (abort.signal.aborted) throw Error("Settings page closed");
      const mountId = await opened;
      const response = await fetch("/api/settings/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({ mountId, request }),
      });
      if (!response.ok) throw Error("Settings request failed; reopen to inspect current state");
      return CallToolResultSchema.parse(await response.json());
    },
  });
  const changeTheme = () => updatePluginViewTheme(bridge, abort.signal, theme());
  const readyTimer = setTimeout(() => {
    if (!abort.signal.aborted) {
      status("failed");
      abort.abort();
      release();
      void bridge.close();
    }
  }, 15000);
  bridge.oninitialized = () => {
    clearTimeout(readyTimer);
    if (!abort.signal.aborted) {
      status("ready");
      changeTheme();
    }
  };
  const loaded = () => {
    if (++loads > 1) {
      status("failed");
      abort.abort();
      release();
      void bridge.close();
    } else {
      changeTheme();
    }
  };
  frame.addEventListener("load", loaded);
  appearance.addEventListener("change", changeTheme);
  void opened
    .then(async (mountId) => {
      if (abort.signal.aborted) return;
      await bridge.connect(new PostMessageTransport(source, source));
      if (!abort.signal.aborted)
        frame.src = `/api/settings/page?mountId=${encodeURIComponent(mountId)}`;
    })
    .catch(() => {
      if (!abort.signal.aborted) status("failed");
      release();
    });
  return () => {
    clearTimeout(readyTimer);
    abort.abort();
    release();
    frame.removeEventListener("load", loaded);
    appearance.removeEventListener("change", changeTheme);
    void closePluginViewBridge(bridge);
  };
}
