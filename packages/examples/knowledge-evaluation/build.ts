import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";
import { build as esbuild } from "esbuild";
import { spawnSync } from "node:child_process";

const packageRoot = import.meta.dirname;

export async function buildKnowledgeEvaluationPackage(): Promise<void> {
  const dist = resolve(packageRoot, "dist");
  const extension = resolve(packageRoot, "org.drawloom");
  await rm(dist, { recursive: true, force: true });
  await rm(extension, { recursive: true, force: true });
  // Resolved through pnpm so the binary is found whatever invoked this build.
  const checked = spawnSync("pnpm", ["exec", "tsc", "-p", resolve(packageRoot, "tsconfig.json")], {
    cwd: packageRoot,
    stdio: "inherit",
  });
  if (checked.status !== 0) throw new Error("Knowledge evaluation TypeScript build failed");
  await mkdir(extension, { recursive: true });
  await Promise.all(
    ["backend.d.ts", "workflows.d.ts"].map((file) =>
      rename(resolve(dist, file), resolve(extension, file)),
    ),
  );
  await esbuild({
    entryPoints: [resolve(packageRoot, "src/index.ts")],
    outfile: resolve(dist, "index.js"),
    bundle: true,
    platform: "node",
    format: "esm",
  });
  await esbuild({
    entryPoints: [resolve(packageRoot, "src/backend.ts")],
    outfile: resolve(extension, "backend.js"),
    bundle: true,
    platform: "node",
    format: "esm",
  });
  await esbuild({
    entryPoints: [resolve(packageRoot, "src/workflows.ts")],
    outfile: resolve(extension, "workflows.js"),
    bundle: true,
    platform: "browser",
    format: "esm",
  });
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
