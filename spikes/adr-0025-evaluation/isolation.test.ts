import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { isolatedEnvironment, runIsolated } from './isolation.mjs';

test('proof environment cannot inherit user tokens, proxy, or preload configuration', () => {
  const env = isolatedEnvironment('/temporary/proof', '/temporary/proof/network.jsonl');
  expect(env.PROMPTFOO_DISABLE_TELEMETRY).toBe('1');
  expect(env.PROMPTFOO_DISABLE_REMOTE_GENERATION).toBe('true');
  expect("OPENAI_API_KEY" in env).toBe(false);
  expect("BRAINTRUST_API_KEY" in env).toBe(false);
  expect("HTTP_PROXY" in env).toBe(false);
  expect("NODE_OPTIONS" in env).toBe(false);
  expect(env.PROMPTFOO_CONFIG_DIR).toStartWith('/temporary/proof/');
});

test.skipIf(process.platform !== 'darwin')('OS network denial blocks actual HTTP and socket probes; recorder captures attempts without payload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-eval-denial-'));
  let received = 0;
  const server = createServer((_req, res) => { received++; res.end('should not arrive'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Missing port');
    const result = await runIsolated({ root, args: ['-e', `
      const http = require('node:http'); const net = require('node:net');
      (async () => {
        const url = 'http://127.0.0.1:${address.port}/SYNTHETIC_SECRET';
        let denied = 0;
        try { await fetch(url, {signal: AbortSignal.timeout(2000)}); } catch { denied++; }
        await new Promise(resolve => { const req = http.get(url); req.on('error',()=>{denied++;resolve()}); });
        await new Promise(resolve => { const socket=net.connect(${address.port},'127.0.0.1'); socket.on('error',()=>{denied++;resolve()}); });
        console.log(JSON.stringify({denied}));
      })();`], timeoutMs: 8000 });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).denied).toBe(3);
    expect(received).toBe(0);
    expect(result.network.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.network)).not.toContain('SYNTHETIC_SECRET');
    expect(result.timedOut).toBe(false);
  } finally { server.close(); await rm(root, {recursive:true,force:true}); }
}, 12000);

test.skipIf(process.platform !== 'darwin')('bounded proof launcher terminates a hung child and reports timeout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-eval-deadline-'));
  try {
    const result = await runIsolated({root, args:['-e','setInterval(()=>{},1000)'], timeoutMs:100});
    expect(result.timedOut).toBe(true);
    expect(result.code).not.toBe(0);
  } finally { await rm(root,{recursive:true,force:true}); }
});
