import { expect, test } from "bun:test";
import { GitKnowledgeSource, GitBatchSchema, gitBatchResult } from "./src/source.js";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function git(directory: string, args: readonly string[]) {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: directory, encoding: "utf8" }).trim();
}
function repository() {
  const root = mkdtempSync(join(tmpdir(), "drawloom-git-source-"));
  const repo = join(root, "repo"); const data = join(root, "data");
  execFileSync("git", ["init", repo], { encoding: "utf8" });
  git(repo, ["config", "user.email", "public@example.test"]);
  git(repo, ["config", "user.name", "Public Test"]);
  return { root, repo, data };
}
function commit(repo: string, path: string, text?: string) {
  if (text === undefined) git(repo, ["rm", "--", path]);
  else { writeFileSync(join(repo, path), text); git(repo, ["add", "--", path]); }
  git(repo, ["commit", "-m", "public fixture"]);
  return git(repo, ["rev-parse", "HEAD"]);
}

test("Git source exposes a replayable committed-file feed", async () => {
  expect(GitKnowledgeSource).toBeFunction();
});

test("unchanged acknowledged polls never hide a later commit", async () => {
  const fixture = repository();
  try {
    commit(fixture.repo, "notes.txt", "first\n");
    const options = { repository: fixture.repo, paths: ["notes.txt"], dataDirectory: fixture.data };
    const source = new GitKnowledgeSource(options);
    const first = await source.changes(); await source.acknowledge(first.token);
    const unchanged = await source.changes(); await source.acknowledge(unchanged.token);
    const revision = commit(fixture.repo, "notes.txt", "changed\n");
    expect((await new GitKnowledgeSource(options).changes()).updates[0]?.revision).toBe(revision);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("acknowledgement tokens cannot cross configured sources", async () => {
  const fixture = repository();
  try {
    commit(fixture.repo, "one.txt", "one\n"); commit(fixture.repo, "two.txt", "two\n");
    const one = new GitKnowledgeSource({ repository: fixture.repo, paths: ["one.txt"], dataDirectory: fixture.data });
    const two = new GitKnowledgeSource({ repository: fixture.repo, paths: ["two.txt"], dataDirectory: join(fixture.root, "other") });
    const first = await one.changes(); const second = await two.changes();
    await expect(two.acknowledge(first.token)).rejects.toMatchObject({ code: "unknown_ack" });
    expect(await two.changes()).toEqual(second);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("bounds the complete MCP result and applies the file page limit", async () => {
  const fixture = repository();
  try {
    commit(fixture.repo, "one.txt", '"\\'.repeat(50));
    commit(fixture.repo, "two.txt", '"\\'.repeat(50));
    const source = new GitKnowledgeSource({ repository: fixture.repo, paths: ["one.txt", "two.txt"], dataDirectory: fixture.data, limits: { maxFiles: 1, maxBatchBytes: 1024 } });
    const page = await source.changes();
    expect(page.updates).toHaveLength(1);
    expect(Buffer.byteLength(JSON.stringify(gitBatchResult(page)), "utf8")).toBeLessThanOrEqual(1024);
    await source.acknowledge(page.token);
    expect((await source.changes()).updates).toHaveLength(1);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("a missing promisor object never invokes a repository-configured transport", async () => {
  const fixture = repository();
  try {
    commit(fixture.repo, "notes.txt", "local-only source\n");
    const blob = git(fixture.repo, ["rev-parse", "HEAD:notes.txt"]);
    const marker = join(fixture.root, "transport-ran");
    const helper = join(fixture.root, "transport-helper");
    writeFileSync(helper, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 });
    git(fixture.repo, ["config", "remote.origin.promisor", "true"]);
    git(fixture.repo, ["config", "remote.origin.url", `ext::${helper}`]);
    git(fixture.repo, ["config", "protocol.ext.allow", "always"]);
    rmSync(join(fixture.repo, ".git", "objects", blob.slice(0, 2), blob.slice(2)));
    const source = new GitKnowledgeSource({ repository: fixture.repo, paths: ["notes.txt"], dataDirectory: fixture.data });
    await expect(source.changes()).rejects.toBeDefined();
    expect(existsSync(marker)).toBe(false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("a concurrent writer is rejected without replacing its state", async () => {
  const fixture = repository();
  try {
    commit(fixture.repo, "notes.txt", "source\n");
    mkdirSync(fixture.data);
    writeFileSync(join(fixture.data, "writer.lock"), "held by another writer");
    const source = new GitKnowledgeSource({ repository: fixture.repo, paths: ["notes.txt"], dataDirectory: fixture.data });
    await expect(source.changes()).rejects.toMatchObject({ code: "writer_locked" });
    expect(existsSync(join(fixture.data, "state.json"))).toBe(false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("replays a stable committed page until acknowledged and preserves revisions", async () => {
  const fixture = repository();
  try {
    const firstRevision = commit(fixture.repo, "notes.txt", "first public note\n");
    const source = new GitKnowledgeSource({ repository: fixture.repo, paths: ["notes.txt"], dataDirectory: fixture.data });
    const first = await source.changes();
    expect(first.updates).toHaveLength(1);
    expect(first.updates[0]).toMatchObject({ id: "notes.txt", revision: firstRevision, previous: null, state: "active" });
    const changedRevision = commit(fixture.repo, "notes.txt", "second public note\n");
    expect(await source.changes()).toEqual(first);
    await source.acknowledge(first.token);
    await source.acknowledge(first.token);
    const restarted = new GitKnowledgeSource({ repository: fixture.repo, paths: ["notes.txt"], dataDirectory: fixture.data });
    const changed = await restarted.changes();
    expect(changed.updates[0]).toMatchObject({ revision: changedRevision, previous: firstRevision, state: "active" });
    await restarted.acknowledge(changed.token);
    const withdrawnRevision = commit(fixture.repo, "notes.txt");
    const withdrawn = await restarted.changes();
    expect(withdrawn.updates[0]).toMatchObject({ revision: withdrawnRevision, previous: changedRevision, state: "withdrawn" });
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("ignores working-tree changes and rejects unsafe configured committed files", async () => {
  const fixture = repository();
  try {
    commit(fixture.repo, "notes.txt", "committed public note\n");
    const hookMarker = join(fixture.root, "hook-ran");
    writeFileSync(join(fixture.repo, ".git/hooks/post-checkout"), "#!/bin/sh\ntouch '" + hookMarker + "'\n", { mode: 0o755 });
    const source = new GitKnowledgeSource({ repository: fixture.repo, paths: ["notes.txt"], dataDirectory: fixture.data });
    const initial = await source.changes(); await source.acknowledge(initial.token);
    writeFileSync(join(fixture.repo, "notes.txt"), "uncommitted private-looking text\n");
    const noChange = await source.changes();
    expect(noChange.updates).toEqual([]);
    expect(existsSync(hookMarker)).toBe(false);
    await source.acknowledge(noChange.token);
    symlinkSync("notes.txt", join(fixture.repo, "linked.txt"));
    git(fixture.repo, ["add", "linked.txt"]);
    git(fixture.repo, ["commit", "-m", "public symlink fixture"]);
    const linked = new GitKnowledgeSource({ repository: fixture.repo, paths: ["linked.txt"], dataDirectory: join(fixture.root, "other-data") });
    await expect(linked.changes()).rejects.toMatchObject({ code: "unsupported_file" });
    expect(() => new GitKnowledgeSource({ repository: fixture.repo, paths: ["../escape"], dataDirectory: fixture.data })).toThrow();
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("a generic MCP client can poll and acknowledge the packed server outside this checkout", async () => {
  const fixture = repository();
  const packed = mkdtempSync(join(tmpdir(), "drawloom-git-packed-"));
  let client: Client | undefined;
  try {
    commit(fixture.repo, "notes.txt", "portable public fixture\n");
    execFileSync("bun", ["run", "--cwd", "packages/plugins/git-knowledge-source", "build"], { cwd: process.cwd(), encoding: "utf8" });
    cpSync(join(process.cwd(), "packages/plugins/git-knowledge-source/dist/server.mjs"), join(packed, "server.mjs"));
    const transport = new StdioClientTransport({
      command: "node",
      args: [join(packed, "server.mjs")],
      env: { GIT_SOURCE_REPOSITORY: fixture.repo, GIT_SOURCE_PATHS: JSON.stringify(["notes.txt"]), PLUGIN_DATA: fixture.data },
      stderr: "pipe",
    });
    client = new Client({ name: "generic-public-test", version: "0.0.0" });
    await client.connect(transport);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["git.changes", "git.acknowledge"]);
    const first = await client.callTool({ name: "git.changes", arguments: {} });
    const batch = GitBatchSchema.parse(first.structuredContent);
    expect(batch.updates).toHaveLength(1);
    await client.callTool({ name: "git.acknowledge", arguments: { token: batch.token } });
    const second = await client.callTool({ name: "git.changes", arguments: {} });
    const unchanged = GitBatchSchema.parse(second.structuredContent);
    expect(unchanged.updates).toEqual([]);
    await client.callTool({ name: "git.acknowledge", arguments: { token: unchanged.token } });
    const nextRevision = commit(fixture.repo, "notes.txt", "updated portable fixture\n");
    const changed = GitBatchSchema.parse((await client.callTool({ name: "git.changes", arguments: {} })).structuredContent);
    expect(changed.updates[0]?.revision).toBe(nextRevision);
    await client.callTool({ name: "git.acknowledge", arguments: { token: changed.token } });
    commit(fixture.repo, "notes.txt");
    const withdrawn = GitBatchSchema.parse((await client.callTool({ name: "git.changes", arguments: {} })).structuredContent);
    expect(withdrawn.updates[0]?.state).toBe("withdrawn");
  } finally {
    await client?.close();
    rmSync(packed, { recursive: true, force: true });
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a restarted durable consumer deduplicates a replayed multi-update page before acknowledgement", async () => {
  const fixture = repository();
  const packed = mkdtempSync(join(tmpdir(), "drawloom-git-durable-packed-"));
  const consumerState = join(fixture.root, "durable-consumer.json");
  let firstClient: Client | undefined;
  let restartedClient: Client | undefined;
  try {
    writeFileSync(join(fixture.repo, "one.txt"), "first public source\n");
    writeFileSync(join(fixture.repo, "two.txt"), "second public source\n");
    git(fixture.repo, ["add", "one.txt", "two.txt"]);
    git(fixture.repo, ["commit", "-m", "initial public source batch"]);
    execFileSync("bun", ["run", "--cwd", "packages/plugins/git-knowledge-source", "build"], { cwd: process.cwd(), encoding: "utf8" });
    cpSync(join(process.cwd(), "packages/plugins/git-knowledge-source/dist/server.mjs"), join(packed, "server.mjs"));
    const launch = () => new StdioClientTransport({
      command: "node",
      args: [join(packed, "server.mjs")],
      env: { GIT_SOURCE_REPOSITORY: fixture.repo, GIT_SOURCE_PATHS: JSON.stringify(["one.txt", "two.txt"]), PLUGIN_DATA: fixture.data },
      stderr: "pipe",
    });
    firstClient = new Client({ name: "durable-public-consumer", version: "0.0.0" });
    await firstClient.connect(launch());
    const first = GitBatchSchema.parse((await firstClient.callTool({ name: "git.changes", arguments: {} })).structuredContent);
    expect(first.updates).toHaveLength(2);
    const received = new Map<string, { id: string; revision: string }>();
    const firstUpdate = first.updates[0]!;
    received.set(`${firstUpdate.id}:${firstUpdate.revision}`, { id: firstUpdate.id, revision: firstUpdate.revision });
    writeFileSync(consumerState, JSON.stringify([...received.values()]));
    await firstClient.close(); firstClient = undefined;

    restartedClient = new Client({ name: "durable-public-consumer", version: "0.0.0" });
    await restartedClient.connect(launch());
    const replayed = GitBatchSchema.parse((await restartedClient.callTool({ name: "git.changes", arguments: {} })).structuredContent);
    expect(replayed).toEqual(first);
    for (const update of replayed.updates) {
      const key = `${update.id}:${update.revision}`;
      if (!received.has(key)) received.set(key, { id: update.id, revision: update.revision });
    }
    writeFileSync(consumerState, JSON.stringify([...received.values()]));
    expect(JSON.parse(readFileSync(consumerState, "utf8"))).toHaveLength(2);
    await restartedClient.callTool({ name: "git.acknowledge", arguments: { token: replayed.token } });

    writeFileSync(join(fixture.repo, "one.txt"), "final public source\n");
    git(fixture.repo, ["rm", "--", "two.txt"]);
    git(fixture.repo, ["add", "one.txt"]);
    git(fixture.repo, ["commit", "-m", "final public update and withdrawal"]);
    const finalRevision = git(fixture.repo, ["rev-parse", "HEAD"]);
    const final = GitBatchSchema.parse((await restartedClient.callTool({ name: "git.changes", arguments: {} })).structuredContent);
    expect(final.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "one.txt", revision: finalRevision, state: "active" }),
      expect.objectContaining({ id: "two.txt", state: "withdrawn" }),
    ]));
  } finally {
    await firstClient?.close();
    await restartedClient?.close();
    rmSync(packed, { recursive: true, force: true });
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("reports force-push reconciliation and never treats corrupt private state as empty", async () => {
  const fixture = repository();
  try {
    const first = commit(fixture.repo, "notes.txt", "first\n");
    const source = new GitKnowledgeSource({ repository: fixture.repo, paths: ["notes.txt"], dataDirectory: fixture.data });
    const initial = await source.changes(); await source.acknowledge(initial.token);
    commit(fixture.repo, "notes.txt", "second\n");
    const second = await source.changes(); await source.acknowledge(second.token);
    git(fixture.repo, ["reset", "--hard", first]);
    await expect(source.changes()).rejects.toMatchObject({ code: "reconciliation_required" });
    writeFileSync(join(fixture.data, "state.json"), "{not json");
    const restarted = new GitKnowledgeSource({ repository: fixture.repo, paths: ["notes.txt"], dataDirectory: fixture.data });
    await expect(restarted.changes()).rejects.toMatchObject({ code: "state_corrupt" });
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("rejects binary and oversized committed content rather than truncating it", async () => {
  const fixture = repository();
  try {
    commit(fixture.repo, "binary.txt", "placeholder\n");
    writeFileSync(join(fixture.repo, "binary.txt"), Buffer.from([0x61, 0, 0x62]));
    git(fixture.repo, ["add", "binary.txt"]); git(fixture.repo, ["commit", "-m", "public binary fixture"]);
    const binary = new GitKnowledgeSource({ repository: fixture.repo, paths: ["binary.txt"], dataDirectory: fixture.data });
    await expect(binary.changes()).rejects.toMatchObject({ code: "unsupported_file" });
    commit(fixture.repo, "large.txt", "0123456789\n");
    const large = new GitKnowledgeSource({ repository: fixture.repo, paths: ["large.txt"], dataDirectory: join(fixture.root, "other-data"), limits: { maxFileBytes: 8 } });
    await expect(large.changes()).rejects.toMatchObject({ code: "file_too_large" });
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("holds a response-bounded page stable and advances only after its acknowledgement", async () => {
  const fixture = repository();
  try {
    const text = "x".repeat(400);
    commit(fixture.repo, "one.txt", text);
    writeFileSync(join(fixture.repo, "two.txt"), text);
    git(fixture.repo, ["add", "two.txt"]); git(fixture.repo, ["commit", "-m", "second public file"]);
    const source = new GitKnowledgeSource({
      repository: fixture.repo, paths: ["one.txt", "two.txt"], dataDirectory: fixture.data,
      limits: { maxFileBytes: 1024, maxBatchBytes: 1024 },
    });
    const first = await source.changes();
    expect(first.updates).toHaveLength(1);
    expect(await source.changes()).toEqual(first);
    await source.acknowledge(first.token);
    const second = await source.changes();
    expect(second.updates).toHaveLength(1);
    expect(second.token).not.toEqual(first.token);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
