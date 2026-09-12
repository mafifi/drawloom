import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createManagedLocalKnowledgeClient } from "@drawloom/local-knowledge-runtime";
import { SearchResultSchema } from "@drawloom/knowledge";
import { createDesktopApplication } from "./application.js";
import { createInstallationStore } from "./plugin-installations.js";

function git(directory: string, args: readonly string[]) {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: directory, encoding: "utf8" }).trim();
}

test("an installed standard Git package keeps revisions and withdrawals current in managed SQLite across restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-desktop-git-knowledge-"));
  const repository = join(root, "public-repository");
  const data = join(root, "desktop-data");
  const packageRoot = join(root, "installed-git-knowledge-source");
  let app: Awaited<ReturnType<typeof createDesktopApplication>> | undefined;
  try {
    await mkdir(repository, { recursive: true });
    git(root, ["init", repository]);
    git(repository, ["config", "user.email", "public@example.test"]);
    git(repository, ["config", "user.name", "Public Fixture"]);
    await writeFile(join(repository, "notes.txt"), "Committed integration phrase: copper lantern protocol.\n");
    git(repository, ["add", "notes.txt"]); git(repository, ["commit", "-m", "public fixture"]);

    const standard = join(process.cwd(), "packages", "plugins", "git-knowledge-source");
    await cp(join(standard, "dist"), join(packageRoot, "dist"), { recursive: true });
    await cp(join(standard, "plugin.json"), join(packageRoot, "plugin.json"));
    const mcp = JSON.parse(await readFile(join(standard, "mcp.json"), "utf8")) as { mcpServers: Record<string, { env?: Record<string, string> }> };
    mcp.mcpServers["git-knowledge-source"]!.env = {
      GIT_SOURCE_REPOSITORY: repository,
      GIT_SOURCE_PATHS: JSON.stringify(["notes.txt"]),
    };
    await writeFile(join(packageRoot, "mcp.json"), JSON.stringify(mcp));

    const installations = await createInstallationStore(createNodeJsonStore(join(data, "state")));
    const installationId = await installations.add(packageRoot);
    await installations.configure(installationId, { enabled: true, trustedBackend: false, servers: ["git-knowledge-source"], configuration: {} });
    let knowledge: ReturnType<typeof createManagedLocalKnowledgeClient> | undefined;
    const open = () => {
      const service = createManagedLocalKnowledgeClient({ root: join(data, "knowledge"), workingDirectory: repository });
      knowledge = service;
      return createDesktopApplication(data, { knowledge: { service } });
    };
    app = await open();
    await app.command({ kind: "add_project", directory: repository });
    await app.knowledgeCommand({ action: "source", enabled: true });
    const search = async (query: string) => SearchResultSchema.parse(await app!.knowledgeCommand({ action: "search", request: {
      query, mode: "best_available", limit: 10, maxBytes: 65_536,
    } }));
    const first = await search("copper lantern protocol");
    expect(first.kind).toBe("ok"); if (first.kind !== "ok") throw Error("expected lexical source");
    const firstRef = first.items[0]!.record.ref;
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ record: { ref: { type: "source", id: "notes.txt" } } });
    expect(first.items[0]!.record.body).toContain("Committed integration phrase: copper lantern protocol.");

    const claimRef = { type: "claim" as const, origin: "integration-test", id: "derived", revision: "r1" };
    expect((await knowledge!.ingest({ operation: "upsert", expectedRevision: null, record: {
      ref: claimRef, body: "Derived claim from the installed Git source.", status: "active", freshness: "current",
      confidence: { value: "test" }, provenance: { producer: { type: "integration", id: "fixture" }, inputs: [firstRef] },
    }, links: [{ from: claimRef, to: firstRef, relation: "support" }] })).kind).toBe("accepted");

    await writeFile(join(repository, "notes.txt"), "Updated integration phrase: emerald observatory policy.\n");
    git(repository, ["add", "notes.txt"]); git(repository, ["commit", "-m", "public revision"]);
    const revisedCommit = git(repository, ["rev-parse", "HEAD"]);
    await app.knowledgeCommand({ action: "source", enabled: true });
    const old = await search("copper lantern protocol");
    expect(old.kind).toBe("ok"); if (old.kind === "ok") expect(old.items).toHaveLength(0);
    const revised = await search("emerald observatory policy");
    expect(revised.kind).toBe("ok"); if (revised.kind !== "ok") throw Error("expected revised source");
    expect(revised.items).toHaveLength(1);
    expect(revised.items[0]!.record.ref).toMatchObject({ type: "source", origin: firstRef.origin, id: firstRef.id, revision: revisedCommit });
    expect(revised.items[0]!.record.ref.revision).not.toBe(firstRef.revision);
    const historic = await knowledge!.get(firstRef);
    expect(historic.kind).toBe("ok");
    expect(historic.kind === "ok" && historic.record?.body).toContain("Committed integration phrase: copper lantern protocol.");
    const staleClaim = await knowledge!.get(claimRef);
    if (staleClaim.kind !== "ok" || staleClaim.record?.ref.type !== "claim" || !("freshness" in staleClaim.record)) throw Error("expected retained claim");
    expect(staleClaim.record.freshness).toBe("stale");

    git(repository, ["rm", "notes.txt"]); git(repository, ["commit", "-m", "public withdrawal"]);
    await app.knowledgeCommand({ action: "source", enabled: true });
    const withdrawn = await search("emerald observatory policy");
    expect(withdrawn.kind).toBe("ok"); if (withdrawn.kind === "ok") expect(withdrawn.items).toHaveLength(0);

    await app.close(); app = await open(); await app.restore();
    const restarted = await search("emerald observatory policy");
    expect(restarted.kind).toBe("ok"); if (restarted.kind !== "ok") throw Error("expected restarted lexical source");
    expect(restarted.items).toHaveLength(0);
  } finally { await app?.close(); await rm(root, { recursive: true, force: true }); }
}, 30_000);
