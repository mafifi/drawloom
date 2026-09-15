import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";

const packageRoot = import.meta.dir;

export async function buildKnowledgeEvaluationPackage(): Promise<void> {
  const dist = resolve(packageRoot, "dist");
  const extension = resolve(packageRoot, "org.drawloom");
  await rm(dist, { recursive: true, force: true });
  await rm(extension, { recursive: true, force: true });
  const checked = Bun.spawn(
    ["bun", "x", "--no-install", "tsc", "-p", resolve(packageRoot, "tsconfig.json")],
    { cwd: packageRoot, stdout: "inherit", stderr: "inherit" },
  );
  if (await checked.exited) throw new Error("Knowledge evaluation TypeScript build failed");
  await mkdir(extension, { recursive: true });
  await Promise.all(
    ["backend.d.ts", "workflows.d.ts"].map((file) =>
      rename(resolve(dist, file), resolve(extension, file)),
    ),
  );
  const bundled = await Bun.build({
    entrypoints: [resolve(packageRoot, "src/index.ts")],
    outdir: dist,
    target: "node",
    format: "esm",
    naming: "[name].js",
    packages: "bundle",
  });
  if (!bundled.success)
    throw new AggregateError(
      bundled.logs,
      "Knowledge evaluation installed entrypoint build failed",
    );
  const backend = await Bun.build({
    entrypoints: [resolve(packageRoot, "src/backend.ts")],
    outdir: extension,
    target: "node",
    format: "esm",
    naming: "backend.js",
    packages: "bundle",
  });
  if (!backend.success)
    throw new AggregateError(backend.logs, "Knowledge evaluation backend build failed");
  const workflow = await Bun.build({
    entrypoints: [resolve(packageRoot, "src/workflows.ts")],
    outdir: extension,
    target: "browser",
    format: "esm",
    naming: "[name].js",
    packages: "bundle",
  });
  if (!workflow.success)
    throw new AggregateError(workflow.logs, "Knowledge evaluation portable workflow build failed");
  const built = await build({
    configFile: false,
    root: packageRoot,
    plugins: [tailwindcss(), svelte()],
    logLevel: "warn",
    build: {
      write: false,
      minify: true,
      cssCodeSplit: false,
      lib: { entry: resolve(packageRoot, "src/app/app.ts"), formats: ["es"] },
      rollupOptions: { output: { entryFileNames: "app.js", assetFileNames: "app.[ext]" } },
    },
  });
  if (!Array.isArray(built) && !("output" in built))
    throw new Error("Knowledge evaluation app build unexpectedly entered watch mode");
  const output = (Array.isArray(built) ? built : [built]).flatMap((item) => item.output);
  const chunk = output.find((item) => item.type === "chunk" && item.isEntry);
  const css = output.find((item) => item.type === "asset" && item.fileName.endsWith(".css"));
  if (!chunk || chunk.type !== "chunk" || !css || css.type !== "asset")
    throw new Error("Knowledge evaluation app bundle is incomplete");
  const stylesheet =
    typeof css.source === "string" ? css.source : new TextDecoder().decode(css.source);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style></head><body><script type="module">${chunk.code}</script></body></html>`;
  if (Buffer.byteLength(html) > 8 * 1024 * 1024)
    throw new Error("Knowledge evaluation app exceeds the MCP App resource bound");
  await writeFile(resolve(packageRoot, "app.html"), html);
}

if (import.meta.main) await buildKnowledgeEvaluationPackage();
