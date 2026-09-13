import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const profile = '(version 1)(allow default)(deny network*)';

export function isolatedEnvironment(root, networkLog) {
  // Construct from an allowlist: never spread the user's environment.
  return {
    PATH: '/usr/bin:/bin',
    HOME: root,
    TMPDIR: join(root, 'tmp'),
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_CACHE_HOME: join(root, 'cache'),
    CI: '1',
    DO_NOT_TRACK: '1',
    OTEL_SDK_DISABLED: 'true',
    PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
    PROMPTFOO_CONFIG_DIR: join(root, 'promptfoo'),
    PROMPTFOO_CACHE_PATH: join(root, 'cache'),
    DRAWLOOM_EVAL_NETWORK_LOG: networkLog,
  };
}

export function nodeExecutable() {
  return process.versions.bun
    ? execFileSync('/usr/bin/which', ['node'], {encoding:'utf8'}).trim()
    : process.execPath;
}

export async function runIsolated({root, args, timeoutMs = 120000, cwd = process.cwd()}) {
  if (process.platform !== 'darwin') throw Error('OS network-denied proof currently requires macOS');
  if (!isAbsolute(root) || root === '/') throw Error('Dedicated absolute proof root required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000)
    throw Error('Proof timeout must be bounded to ten minutes');
  for (const name of ['', 'tmp', 'config', 'cache', 'promptfoo'])
    await mkdir(join(root, name), {recursive:true, mode:0o700});
  const networkLog = join(root, 'network.jsonl');
  const started = performance.now();
  const child = spawn('/usr/bin/sandbox-exec', [
    '-p', profile, nodeExecutable(), '--import', join(directory, 'observer.mjs'), ...args,
  ], {cwd, env:isolatedEnvironment(root, networkLog), detached:true, stdio:['ignore','pipe','pipe']});
  let stdout = '', stderr = '', timedOut = false, outputLimit = false;
  let bytes = 0, forceTimer;
  function stop() {
    if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
    forceTimer ??= setTimeout(() => {
      if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    }, 1000);
  }
  const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
  function collect(target, chunk) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) { outputLimit = true; stop(); return; }
    if (target === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
  }
  child.stdout.on('data', chunk => collect('stdout',chunk));
  child.stderr.on('data', chunk => collect('stderr',chunk));
  let code, signal;
  try {
    ({code,signal} = await new Promise((resolve,reject) => {
      child.once('error', reject);
      child.once('close', (code,signal) => resolve({code,signal}));
    }));
  } finally { clearTimeout(timer); clearTimeout(forceTimer); }
  let network = [];
  try { network = (await readFile(networkLog,'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return {code,signal,timedOut,outputLimit,stdout,stderr,network,elapsedMs:performance.now()-started};
}
