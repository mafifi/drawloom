import { createStdioTransport, codexCommand } from "@drawloom/node-host";
import { observedRpc } from "./telemetry.js";
import { readCodexModels } from "@drawloom/codex-agent";
/** Read-only provider discovery; closes its process even on timeout. */
export async function desktopModels() {
  const rpc = observedRpc(
    createStdioTransport({ ...codexCommand(), maxMessageBytes: 1024 * 1024 }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await rpc.request("initialize", {
          clientInfo: { name: "drawloom-models", version: "0.0.0" },
          capabilities: {},
        });
        rpc.notify("initialized");
        return readCodexModels(rpc);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("Model discovery timed out")), 8000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await rpc.close();
  }
}
