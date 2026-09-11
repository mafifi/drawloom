import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rename, realpath } from 'node:fs/promises';
import { join } from 'node:path';

// Plugin-owned MCP result schema. No Drawloom runtime or memory import.
export const GitUpdate = z.strictObject({ id: z.string().max(100), revision: z.string(), previous: z.string().nullable(), kind: z.literal('source'), state: z.enum(['active', 'withdrawn']), text: z.string().max(2000) });
export const GitBatch = z.strictObject({ token: z.string(), updates: z.array(GitUpdate).max(60) });
const Files = z.record(z.string(), z.strictObject({ blob: z.string().nullable(), revision: z.string() }));
const State = z.strictObject({ binding: z.string(), head: z.string().nullable(), files: Files,
  pending: z.strictObject({ head: z.string(), files: Files, updates: z.array(GitUpdate) }).optional() });
export class GitSource {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly repository: string, readonly paths: string[], readonly directory: string) {
    z.array(z.string().min(1).max(100).regex(/^[A-Za-z0-9_./-]+$/).refine(p => !p.startsWith('/') && !p.startsWith('-') && p.split('/').every(s => s && s !== '.' && s !== '..'))).min(1).max(60).parse(paths);
    if (new Set(paths).size !== paths.length) throw Error('Duplicate selected path');
  }
  private git(...args: string[]) {
    return execFileSync('git', ['--no-pager', '--literal-pathspecs', ...args], { cwd: this.repository, env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0' }, encoding: 'utf8', maxBuffer: 256 * 1024, timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  private async state() {
    const binding = JSON.stringify([await realpath(this.repository), this.paths]);
    try { const state = State.parse(JSON.parse(await readFile(join(this.directory, 'git.json'), 'utf8'))); if (state.binding !== binding) throw Error('Git configuration changed; use separate plugin data'); return state; }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { binding, head: null, files: {} } as z.infer<typeof State>; throw error; }
  }
  private async save(state: z.infer<typeof State>) {
    await writeFile(join(this.directory, 'git.json.next'), JSON.stringify(State.parse(state)), { mode: 0o600 });
    await rename(join(this.directory, 'git.json.next'), join(this.directory, 'git.json'));
  }
  private serial<T>(work: () => Promise<T>) {
    const result = this.queue.then(work); this.queue = result.catch(() => {}); return result;
  }
  changes() { return this.serial(async () => {
    const state = await this.state();
    if (state.pending) return GitBatch.parse({ token: state.pending.head, updates: state.pending.updates });
    const head = this.git('rev-parse', '--verify', 'HEAD^{commit}').trim();
    if (!/^[a-f0-9]{40,64}$/.test(head)) throw Error('Invalid commit');
    if (state.head) this.git('merge-base', '--is-ancestor', state.head, head);
    const files = { ...state.files }, updates: z.infer<typeof GitUpdate>[] = [];
    for (const path of this.paths) {
      const entry = this.git('ls-tree', head, '--', path).trim();
      let blob: string | null = null;
      if (entry) { const match = /^(100644|100755) blob ([a-f0-9]+)\t/.exec(entry); if (!match) throw Error('Only ordinary committed files are supported'); blob = match[2]!; }
      const previous = state.files[path];
      if (previous ? previous.blob === blob : blob === null) continue;
      if (blob && Number(this.git('cat-file', '-s', blob).trim()) > 1600) throw Error('Selected file exceeds bounded evidence size');
      const content = blob ? this.git('cat-file', 'blob', blob) : 'File deleted from the selected committed tree; prior content is historical.';
      if (content.includes('\0')) throw Error('Binary evidence is unsupported');
      updates.push(GitUpdate.parse({ id: path, revision: head, previous: previous?.revision ?? null, kind: 'source', state: blob ? 'active' : 'withdrawn', text: `Committed file ${path} at ${head}. This is source content, not a test execution result.\n${content}` }));
      files[path] = { blob, revision: head };
    }
    state.pending = { head, files, updates }; await this.save(state);
    return GitBatch.parse({ token: head, updates });
  }); }
  acknowledge(token: string) { return this.serial(async () => {
    const state = await this.state();
    if (!state.pending && state.head === token) return;
    if (state.pending?.head !== token) throw Error('Unknown or stale delivery');
    state.head = state.pending.head; state.files = state.pending.files; delete state.pending; await this.save(state);
  }); }
}
