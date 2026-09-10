import { test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';

for (const runtime of ['bun','node']) {
  test(`OTel host real context, privacy, loopback export and outage on ${runtime}`,()=>{
    const result = spawnSync(runtime==='bun'?process.execPath:'node',[runtime==='bun'?'run':'--experimental-strip-types',new URL('./verify.ts',import.meta.url).pathname],{encoding:'utf8',timeout:10000});
    expect(result.status,`${result.stdout}\n${result.stderr}`).toBe(0);
  });
}
