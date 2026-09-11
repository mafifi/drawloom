import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
export const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
export const workflowFingerprint = (code: string, dependencies: readonly (readonly [string, string])[]): string =>
  digest(JSON.stringify({ executable: digest(code), dependencies: [...dependencies].sort(([a], [b]) => a.localeCompare(b)) }));
export async function readJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")) as unknown; }
  catch (error) { if (isMissing(error)) return undefined; throw error; }
}
export function isMissing(error: unknown): boolean { return error instanceof Error && "code" in error && error.code === "ENOENT"; }
/** Flush the file before publication, then flush its containing directory. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  const json = JSON.stringify(z.json().parse(value));
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try { await file.writeFile(json); await file.sync(); } finally { await file.close(); }
  try {
    await rename(temporary, path);
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await unlink(temporary).catch((error: unknown) => { if (!isMissing(error)) throw error; }); }
}
export function jsonStore(directory: string) {
  return {
    async get(key: string) { const value = await readJson(join(directory, `${digest(key)}.json`)); return value === undefined ? undefined : z.json().parse(value); },
    async set(key: string, value: z.infer<ReturnType<typeof z.json>>) { await writeJson(join(directory, `${digest(key)}.json`), value); },
  };
}
