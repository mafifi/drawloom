import { resolve } from "node:path";
import { homedir } from "node:os";
import { createDesktopApplication } from "./application.js";
import { serveDesktop } from "./server.js";
import { selectDataDirectory } from "./data-directory.js";
import { initializeObservability } from "@drawloom/otel-host";
import { createTelemetryRelay } from "./telemetry-relay.js";
import { pickMacProjectDirectory } from "./folder-picker.js";
import { createProcessShutdown } from "./process-shutdown.js";
import { startupReadiness } from "./startup-readiness.js";
import { describeShutdownFailures } from "./shutdown-report.js";
import { userToolPath } from "./tool-path.js";
async function main() {
  // Before anything is spawned: every child, Codex included, inherits it.
  process.env.PATH = userToolPath(process.env.PATH, homedir());
  const selectedMode = process.env.DRAWLOOM_TELEMETRY ?? "disabled";
  if (!["disabled", "recording", "export"].includes(selectedMode))
    throw Error("Invalid telemetry mode");
  const mode = selectedMode as "disabled" | "recording" | "export";
  const telemetry = initializeObservability({
    mode,
    serviceName: "drawloom.desktop",
    safeSpanNames: (process.env.DRAWLOOM_TELEMETRY_SPANS ?? "").split(",").filter(Boolean),
    ...(process.env.DRAWLOOM_OTLP_ENDPOINT ? { endpoint: process.env.DRAWLOOM_OTLP_ENDPOINT } : {}),
  });
  const relay = createTelemetryRelay(mode, process.env.DRAWLOOM_OTLP_ENDPOINT);
  const root = await selectDataDirectory({
    home: homedir(),
    ...(process.env.DRAWLOOM_DATA_DIR !== undefined
      ? { override: process.env.DRAWLOOM_DATA_DIR }
      : {}),
  });
  console.error(`Drawloom data: ${root}`);
  const web = resolve(process.env.DRAWLOOM_WEB_ROOT ?? resolve(import.meta.dirname, "../build"));
  const knowledgeRuntime = process.env.DRAWLOOM_KNOWLEDGE_RUNTIME;
  const nightloomRuntime = process.env.DRAWLOOM_NIGHTLOOM_RUNTIME;
  const app = await createDesktopApplication(root, {
    experimentalPluginDiscovery: process.env.DRAWLOOM_EXPERIMENTAL_PLUGIN_DISCOVERY !== "0",
    mediaOrigins: (process.env.DRAWLOOM_MEDIA_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    ...(process.env.DRAWLOOM_EVALUATION_MODEL !== undefined
      ? { evaluation: { model: process.env.DRAWLOOM_EVALUATION_MODEL } }
      : {}),
    orchestration: {
      ...(process.env.DRAWLOOM_TEMPORAL_PATH
        ? { temporalPath: process.env.DRAWLOOM_TEMPORAL_PATH }
        : {}),
      ...(process.env.DRAWLOOM_NODE_PATH ? { nodePath: process.env.DRAWLOOM_NODE_PATH } : {}),
      ...(process.env.DRAWLOOM_ORCHESTRATION_RUNTIME
        ? { runtimeDirectory: process.env.DRAWLOOM_ORCHESTRATION_RUNTIME }
        : {}),
    },
    knowledge: {
      ...(process.env.DRAWLOOM_NODE_PATH ? { nodePath: process.env.DRAWLOOM_NODE_PATH } : {}),
      ...(knowledgeRuntime
        ? {
            // `pnpm deploy` writes the deployed package at the target root.
            runtimeEntrypoint: resolve(knowledgeRuntime, "dist/sidecar.js"),
            ...(nightloomRuntime ? { nightloomDirectory: nightloomRuntime } : {}),
          }
        : {}),
    },
  });
  await app.restore();
  const server = await serveDesktop(
    app,
    web,
    Number(process.env.DRAWLOOM_PORT ?? 0),
    relay,
    process.platform === "darwin" ? { pickDirectory: pickMacProjectDirectory } : {},
  );
  // The shell must not choose a second data directory: the host has already
  // applied the selection rules, and a divergence points the native browser
  // at a different installation than the one serving it.
  console.log(startupReadiness(server.url, root, process.env.DRAWLOOM_MANAGED === "1"));
  const stop = createProcessShutdown({
    closeApplication: () => server.close(),
    shutdownTelemetry: () => telemetry.shutdown(),
    reportFailure: (reasons) => {
      console.error(
        "Drawloom could not shut down cleanly. Some local work may need recovery; no automatic retry occurred.",
      );
      for (const line of describeShutdownFailures(reasons, {
        diagnostics: process.env.DRAWLOOM_DIAGNOSTICS === "1",
      }))
        console.error(line);
    },
  });
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => {
      void stop().then((code) => process.exit(code));
    });
  if (process.env.DRAWLOOM_MANAGED === "1") {
    process.stdin.resume();
    process.stdin.once("end", () => {
      void stop().then((code) => process.exit(code));
    });
  }
}
await main().catch(() => {
  console.error(
    "Drawloom could not start. Check the data directory and trusted configuration. If both default data locations exist, select one with DRAWLOOM_DATA_DIR. No data was moved.",
  );
  process.exit(1);
});
