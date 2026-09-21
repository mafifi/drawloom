import { expect, test } from "vitest";
import { mkdtemp, rm, readdir, readlink, realpath, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createManagedLocalKnowledgeClient } from "./src/client.js";
import { createDesktopAuthorization } from "../../../apps/desktop/host/authorization.js";

/** Every link in an installed tree must stay inside it. */
async function escapingLinks(root: string): Promise<string[]> {
  const base = await realpath(root);
  const escaping: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = resolve(dirname(path), await readlink(path));
        const resolved = await realpath(target).catch(() => target);
        if (resolved !== base && !resolved.startsWith(base + sep)) escaping.push(path);
      } else if (entry.isDirectory()) {
        await walk(path);
      }
    }
  };
  await walk(base);
  return escaping;
}

test("installed worker entrypoint uses the same host authority without checkout links", async () => {
  const repositoryRoot = resolve(import.meta.dirname, "../../..");
  // Deployed inside the repository: pnpm rewrites the patched-dependency path
  // relative to the deploy target, which cannot cross filesystem roots.
  const destination = await mkdtemp(join(repositoryRoot, ".deploy", "installed-authority-"));
  const temporary = await mkdtemp(join(tmpdir(), "drawloom-installed-authority-"));
  const authority = createDesktopAuthorization({
    authorize: async (request) => ({ decision: request.action.name === "knowledge.maintain" }),
  });
  let client: ReturnType<typeof createManagedLocalKnowledgeClient> | undefined;
  try {
    execFileSync(
      "pnpm",
      ["--filter", "@drawloom/local-knowledge-runtime", "deploy", "--prod", destination],
      { cwd: repositoryRoot, stdio: "pipe" },
    );
    // The point of this check: the installation must be self-contained, with no
    // path back into the checkout it was built from.
    expect(await escapingLinks(destination)).toEqual([]);
    const entrypoint = join(destination, "dist/sidecar.js");
    expect((await stat(entrypoint)).isFile()).toBe(true);
    client = createManagedLocalKnowledgeClient({
      root: join(temporary, "data"),
      workingDirectory: temporary,
      authority: authority.knowledge(),
      runtimeEntrypoint: entrypoint,
    });
    expect((await client.status()).availability).toBe("ready");
    expect(
      await client.get({ type: "source", origin: "synthetic", id: "absent", revision: "r1" }),
    ).toEqual({ kind: "denied" });
    expect(await client.warmup()).toEqual({ kind: "unavailable" });
  } finally {
    await client?.close();
    authority.shutdown();
    await rm(temporary, { recursive: true, force: true });
    await rm(destination, { recursive: true, force: true });
  }
}, 120_000);
