import { lstat, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { build as viteBuild } from "vite";
import { buildKnowledgeInspection } from "./knowledge-inspection.ts";
import { inspectionOpeningTool, inspectionServerName, inspectionWorkbenchId } from "./inspection-contract.ts";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(moduleDirectory, "inspection");

async function bundle(entrypoint: string, outdir: string, naming: string) {
  const result = await Bun.build({ entrypoints: [entrypoint], outdir, naming, target: "node", format: "esm", minify: true });
  if (!result.success) throw Error(result.logs.map(log => log.message).join("\n") || `Could not bundle ${naming}`);
}

export async function buildInspectionPackage(packageRoot: string): Promise<{ packageRoot: string; resultCount: number }> {
  if (!isAbsolute(packageRoot)) throw Error("Inspection package output must be an absolute path");
  try { await lstat(packageRoot); throw Error("Inspection package output already exists"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const parent = dirname(packageRoot);
  const staging = await mkdtemp(join(parent, ".drawloom-inspection-build-"));
  try {
    const viteOut = join(staging, "browser");
    await viteBuild({
      configFile: false,
      root: sourceRoot,
      plugins: [tailwindcss(), svelte()],
      logLevel: "error",
      build: {
        outDir: viteOut,
        emptyOutDir: false,
        minify: true,
        cssCodeSplit: false,
        lib: { entry: join(sourceRoot, "app.ts"), formats: ["es"], fileName: () => "app.js" },
      },
    });
    const browserFiles = await readdir(viteOut);
    const javascript = (await readFile(join(viteOut, "app.js"), "utf8")).replace(/<\/script/gi, "<\\/script");
    const cssName = browserFiles.find(file => file.endsWith(".css"));
    if (!cssName) throw Error("Compiled inspection app did not emit shared UI styles");
    const css = (await readFile(join(viteOut, cssName), "utf8")).replace(/<\/style/gi, "<\\/style");
    const reducedMotion = "@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}";
    await writeFile(join(staging, "app.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><style>${css}\n${reducedMotion}</style></head><body><script type="module">${javascript}</script></body></html>`, "utf8");
    await rm(viteOut, { recursive: true, force: true });

    await bundle(resolve(moduleDirectory, "inspection-server.ts"), staging, "server.mjs");
    await bundle(join(sourceRoot, "backend.ts"), join(staging, "org.drawloom"), "backend.mjs");
    const document = await buildKnowledgeInspection();
    await writeFile(join(staging, "inspection.json"), `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await writeFile(join(staging, "mcp.json"), `${JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { [inspectionServerName]: { type: "stdio", command: "node", args: ["${PLUGIN_ROOT}/server.mjs"] } },
    }, null, 2)}\n`, "utf8");
    await writeFile(join(staging, "plugin.json"), `${JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "drawloom-knowledge-inspection",
      description: "Retained ADR 0025 knowledge evaluation inspection proof.",
      extensions: { "org.drawloom": {
        version: 1,
        backend: { entrypoint: "./org.drawloom/backend.mjs" },
        workbenches: [{ id: inspectionWorkbenchId, title: "Evaluation findings", openingTool: { server: inspectionServerName, tool: inspectionOpeningTool } }],
      } },
    }, null, 2)}\n`, "utf8");
    await rename(staging, packageRoot);
    return { packageRoot, resultCount: document.results.length };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const index = process.argv.indexOf("--out");
  const out = index >= 0 ? process.argv[index + 1] : undefined;
  if (!out) throw Error("Usage: bun inspection-build.ts --out /absolute/new/package-folder");
  process.stdout.write(`${JSON.stringify(await buildInspectionPackage(out))}\n`);
}
