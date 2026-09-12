import { writeFileSync } from 'node:fs';
import { cedarEngine, casbinEngine } from './engines.ts';
import type { Evaluation } from './contract.ts';

const request: Evaluation = { subject: { type: 'user', id: 'owner', properties: { tenant: 'local', active: true, clearance: 2, compartments: ['clinic'] } }, action: { name: 'read' }, resource: { type: 'knowledge', id: 'claim', properties: { tenant: 'local', active: true, sensitivity: 2, compartments: ['clinic'], expires: 200, remoteAllowed: false } }, context: { now: 100 } };
const results = [];
for (const [name, create] of [['cedar', cedarEngine], ['casbin', casbinEngine]] as const) {
  const start = performance.now(); const engine = await create(); const initializationMs = performance.now() - start;
  const cases = [];
  for (const [label, mutate, expected] of [
    ['allowed', (_r: Evaluation) => {}, true],
    ['insufficient-clearance', (r: Evaluation) => { r.subject.properties!.clearance = 0; }, false],
    ['expired', (r: Evaluation) => { r.context = { now: 200 }; }, false],
    ['remote-processing-denied', (r: Evaluation) => { r.action.name = 'export_model'; }, false],
  ] as const) {
    const input = structuredClone(request); mutate(input);
    const response = await engine(input);
    if (response.decision !== expected) throw new Error(`${name} ${label} unexpected decision`);
    cases.push({ label, request: input, response });
  }
  for (let i = 0; i < 20; i++) await engine(request);
  const timings = []; const cpu = process.cpuUsage();
  for (let i = 0; i < 100; i++) { const before = performance.now(); if (!(await engine(request)).decision) throw new Error('Unexpected denial'); timings.push(performance.now() - before); }
  timings.sort((a,b) => a-b);
  results.push({ engine: name, initializationMs, repetitions: 100, medianMs: timings[49], p95Ms: timings[94], cpuMicroseconds: process.cpuUsage(cpu), sampledRssBytes: process.memoryUsage().rss, cases });
}
const receipt = { observedAt: new Date().toISOString(), runtime: process.versions, scope: 'Synthetic single-evaluation profile; both engines loaded in one process. Initialization excludes imports. No network, full AuthZEN conformance, throughput or enterprise benchmark claim.', results };
const output = process.argv[2];
if (output) writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
