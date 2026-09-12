import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const PathSchema = z.string().min(1).max(1024).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  .refine((value) => !value.startsWith("-") && !value.startsWith("/") && !value.includes("//") && value.split("/").every((part) => part !== "." && part !== ".."));
const LimitsSchema = z.strictObject({
  maxFiles: z.number().int().min(1).max(200).default(200),
  maxFileBytes: z.number().int().min(1).max(64 * 1024).default(64 * 1024),
  maxBatchBytes: z.number().int().min(1024).max(512 * 1024).default(512 * 1024),
});
export const GitUpdateSchema = z.strictObject({
  id: PathSchema, revision: z.string().regex(/^[0-9a-f]{40,64}$/), previous: z.string().regex(/^[0-9a-f]{40,64}$/).nullable(),
  kind: z.literal("source"), state: z.enum(["active", "withdrawn"]), text: z.string(),
});
export type GitUpdate = z.infer<typeof GitUpdateSchema>;
export const GitBatchSchema = z.strictObject({ token: z.string().min(1).max(256), updates: z.array(GitUpdateSchema).max(200) });
export type GitBatch = z.infer<typeof GitBatchSchema>;

/** The bounded MCP result has one authoritative copy of the source text. */
export function gitBatchResult(batch: GitBatch) {
  return { content: [{ type: "text" as const, text: `${batch.updates.length} committed source updates.` }], structuredContent: batch };
}

const FileStateSchema = z.strictObject({ blob: z.string().regex(/^[0-9a-f]{40,64}$/).nullable(), revision: z.string().regex(/^[0-9a-f]{40,64}$/) });
const StateSchema = z.strictObject({
  version: z.literal(1), binding: z.string(), head: z.string().regex(/^[0-9a-f]{40,64}$/).nullable(),
  files: z.record(PathSchema, FileStateSchema),
  pending: z.strictObject({
    deliveryId: z.string().uuid(),
    head: z.string().regex(/^[0-9a-f]{40,64}$/), files: z.record(PathSchema, FileStateSchema),
    updates: z.array(GitUpdateSchema).max(200), offset: z.number().int().nonnegative(),
  }).optional(),
  acknowledgedTokens: z.array(z.string().min(1).max(256)).max(400).default([]),
});
type SourceState = z.infer<typeof StateSchema>;

export class GitKnowledgeSourceError extends Error {
  constructor(readonly code: "invalid_config" | "invalid_path" | "state_corrupt" | "configuration_changed" | "reconciliation_required" | "unsupported_file" | "file_too_large" | "batch_too_large" | "unknown_ack" | "writer_locked", message: string) {
    super(message); this.name = "GitKnowledgeSourceError";
  }
}
export type GitKnowledgeSourceOptions = {
  repository: string;
  paths: readonly string[];
  dataDirectory: string;
  limits?: Partial<z.input<typeof LimitsSchema>>;
};

function sourceError(code: GitKnowledgeSourceError["code"], message: string): never { throw new GitKnowledgeSourceError(code, message); }
function token(deliveryId: string, offset: number): string { return `${deliveryId}:${offset}`; }

/** Reads only configured committed blobs through git plumbing; it never opens the repository worktree. */
export class GitKnowledgeSource {
  readonly repository: string;
  readonly paths: readonly string[];
  readonly dataDirectory: string;
  readonly limits: z.infer<typeof LimitsSchema>;
  #queue: Promise<void> = Promise.resolve();

  constructor(options: GitKnowledgeSourceOptions) {
    try {
      const paths = z.array(PathSchema).min(1).max(200).parse(options.paths);
      if (new Set(paths).size !== paths.length) sourceError("invalid_path", "Configured paths must be unique");
      this.repository = z.string().min(1).parse(options.repository);
      this.dataDirectory = z.string().min(1).parse(options.dataDirectory);
      this.paths = paths;
      this.limits = LimitsSchema.parse(options.limits ?? {});
    } catch (error) {
      if (error instanceof GitKnowledgeSourceError) throw error;
      sourceError("invalid_config", "Invalid Git source configuration");
    }
  }

  #serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(async () => {
      await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
      const path = join(this.dataDirectory, "writer.lock");
      const lock = await open(path, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") sourceError("writer_locked", "Source writer is active or was interrupted. Confirm it has stopped before removing its writer.lock; retained state is unchanged.");
        throw error;
      });
      try {
        await lock.writeFile(JSON.stringify({ pid: process.pid }));
        await lock.sync();
        return await operation();
      } finally { await lock.close(); await unlink(path); await this.#syncDirectory(); }
    });
    this.#queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async #git(args: readonly string[], _binary = false): Promise<Buffer> {
    const cwd = await realpath(this.repository);
    return new Promise((resolve, reject) => {
      execFile("git", ["--no-lazy-fetch", "-c", "core.hooksPath=/dev/null", "-c", "protocol.allow=never", "--no-pager", "--literal-pathspecs", ...args], {
        cwd, encoding: "buffer", timeout: 5_000, maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH ?? "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "" },
      }, (error, stdout) => error ? reject(error) : resolve(stdout));
    });
  }

  async #binding(): Promise<string> {
    return JSON.stringify({ repository: await realpath(this.repository), paths: this.paths, limits: this.limits });
  }

  async #load(): Promise<SourceState> {
    const binding = await this.#binding();
    const path = join(this.dataDirectory, "state.json");
    try {
      const state = StateSchema.parse(JSON.parse(await readFile(path, "utf8")));
      if (state.binding !== binding) sourceError("configuration_changed", "Git source launch configuration changed");
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, binding, head: null, files: {}, acknowledgedTokens: [] };
      if (error instanceof GitKnowledgeSourceError) throw error;
      sourceError("state_corrupt", "Git source state is corrupt; recovery requires operator action");
    }
  }

  async #save(state: SourceState): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    const next = join(this.dataDirectory, "state.json.next");
    const handle = await open(next, "w", 0o600);
    try {
      await handle.writeFile(JSON.stringify(StateSchema.parse(state)), "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    await rename(next, join(this.dataDirectory, "state.json"));
    await this.#syncDirectory();
  }

  async #syncDirectory(): Promise<void> {
    const directory = await open(this.dataDirectory, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }

  async #head(): Promise<string> {
    const value = String(await this.#git(["rev-parse", "--verify", "HEAD^{commit}"])).trim();
    if (!/^[0-9a-f]{40,64}$/.test(value)) sourceError("unsupported_file", "Repository has no valid committed HEAD");
    return value;
  }

  async #isAncestor(older: string, newer: string): Promise<boolean> {
    try { await this.#git(["merge-base", "--is-ancestor", older, newer]); return true; }
    catch { return false; }
  }

  async #blobAt(head: string, path: string): Promise<string | null> {
    const output = String(await this.#git(["ls-tree", "-z", head, "--", path]));
    if (!output) return null;
    const match = /^(100644|100755) blob ([0-9a-f]{40,64})\t/.exec(output);
    if (!match) sourceError("unsupported_file", `Configured path is not an ordinary committed file: ${path}`);
    return match[2]!;
  }

  async #content(blob: string, path: string): Promise<string> {
    const size = Number(String(await this.#git(["cat-file", "-s", blob])).trim());
    if (!Number.isSafeInteger(size) || size < 0) sourceError("unsupported_file", `Cannot inspect committed file: ${path}`);
    if (size > this.limits.maxFileBytes) sourceError("file_too_large", `Configured committed file exceeds maxFileBytes: ${path}`);
    const bytes = Buffer.from(await this.#git(["cat-file", "blob", blob], true));
    if (bytes.includes(0)) sourceError("unsupported_file", `Configured committed file is binary: ${path}`);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { sourceError("unsupported_file", `Configured committed file is not UTF-8 text: ${path}`); }
  }

  async #buildPending(state: SourceState, head: string): Promise<NonNullable<SourceState["pending"]>> {
    const files = { ...state.files };
    const updates: GitUpdate[] = [];
    for (const path of this.paths) {
      const blob = await this.#blobAt(head, path);
      const previous = state.files[path];
      if ((previous?.blob ?? null) === blob) continue;
      const text = blob
        ? `Committed file ${path} at ${head}. This is source content, not a test execution result.\n${await this.#content(blob, path)}`
        : `Committed file ${path} at ${head} was removed. Prior content remains historical evidence.`;
      const update = GitUpdateSchema.parse({ id: path, revision: head, previous: previous?.revision ?? null, kind: "source", state: blob ? "active" : "withdrawn", text });
      if (Buffer.byteLength(JSON.stringify(update), "utf8") > this.limits.maxBatchBytes) sourceError("batch_too_large", `One configured update exceeds maxBatchBytes: ${path}`);
      updates.push(update);
      files[path] = { blob, revision: head };
    }
    return { deliveryId: randomUUID(), head, files, updates, offset: 0 };
  }

  #page(pending: NonNullable<SourceState["pending"]>): GitBatch {
    const updates: GitUpdate[] = [];
    for (const update of pending.updates.slice(pending.offset)) {
      if (updates.length >= this.limits.maxFiles) break;
      const candidate = { token: token(pending.deliveryId, pending.offset), updates: [...updates, update] };
      // Reserve space for the JSON-RPC envelope in addition to the complete result.
      if (Buffer.byteLength(JSON.stringify(gitBatchResult(candidate)), "utf8") + 128 > this.limits.maxBatchBytes) {
        if (!updates.length) sourceError("batch_too_large", "One source update exceeds the response byte limit");
        break;
      }
      updates.push(update);
    }
    return GitBatchSchema.parse({ token: token(pending.deliveryId, pending.offset), updates });
  }

  changes(): Promise<GitBatch> {
    return this.#serial(async () => {
      const state = await this.#load();
      if (state.pending) return this.#page(state.pending);
      const head = await this.#head();
      if (state.head && !(await this.#isAncestor(state.head, head))) sourceError("reconciliation_required", "Configured repository history changed; reconcile the delivery checkpoint explicitly");
      const pending = state.pending = await this.#buildPending(state, head);
      await this.#save(state);
      return this.#page(pending);
    });
  }

  acknowledge(batchToken: string): Promise<void> {
    return this.#serial(async () => {
      const state = await this.#load();
      if (state.acknowledgedTokens.includes(batchToken)) return;
      const pending = state.pending;
      if (!pending || batchToken !== token(pending.deliveryId, pending.offset)) sourceError("unknown_ack", "Unknown, stale, or cross-configuration acknowledgement");
      const page = this.#page(pending);
      pending.offset += page.updates.length;
      state.acknowledgedTokens = [...state.acknowledgedTokens, batchToken].slice(-400);
      if (pending.offset >= pending.updates.length) {
        state.head = pending.head; state.files = pending.files; delete state.pending;
      }
      await this.#save(state);
    });
  }
}
