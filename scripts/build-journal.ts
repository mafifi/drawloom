import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { DrawloomPackageExtensionJsonSchema } from "../packages/plugins/plugins/dist/package.js";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
/** Node signals child completion with an "exit" event; there is no awaitable `exited`. */
const exitCodeOf = async (child: ChildProcess): Promise<number> =>
  (await once(child, "exit"))[0] as number;

const root = resolve(import.meta.dirname, "..");
const output = resolve(process.env.JOURNAL_OUT_DIR || `${root}/publishing/site/dist`);
// Preview is an explicit command flag. An inherited preview environment cannot
// accidentally turn the default build into a draft publication.
const preview = process.argv.includes("--drafts");
const child = spawn("pnpm", ["exec", "astro", "build"], {
  cwd: `${root}/publishing/site`,
  env: { ...process.env, JOURNAL_DRAFTS: preview ? "1" : "0", JOURNAL_OUT_DIR: output },
  stdio: ["pipe", "inherit", "inherit"],
});
const status = await exitCodeOf(child);
if (status !== 0) process.exit(status);
// Publish the contract-owned schema; package loading never consults the website.
const schemaPath = resolve(output, "schemas/1.0.0/plugin-extension.schema.json");
mkdirSync(dirname(schemaPath), { recursive: true });
writeFileSync(schemaPath, JSON.stringify(DrawloomPackageExtensionJsonSchema, null, 2) + "\n");
// Stage only media actually referenced by emitted HTML, after Astro has cleaned
// its output. Draft render output never lives in Astro's public directory.
const generated = resolve(process.env.JOURNAL_MEDIA_DIR || `${root}/publishing/.generated/media`);
for (const file of readdirSync(output, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".html"))) {
  const html = readFileSync(resolve(output, file), "utf8");
  for (const match of html.matchAll(/(?:src|poster)="\/media\/([a-z0-9-]+\/[^"/]+)"/g)) {
    const relative = match[1]!;
    if (!/^[a-z0-9-]+\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(mp4|png|webp|jpg)$/.test(relative))
      throw new Error(`Invalid media reference: ${relative}`);
    const destination = resolve(output, "media", relative);
    mkdirSync(dirname(destination), { recursive: true });
    const [piece, name] = relative.split("/") as [string, string];
    const sourceAsset = resolve(root, "publishing", piece, "assets", name);
    copyFileSync(existsSync(sourceAsset) ? sourceAsset : resolve(generated, relative), destination);
  }
}
