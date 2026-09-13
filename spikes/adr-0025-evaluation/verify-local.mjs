import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir, platform, arch, cpus, totalmem } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIsolated } from './isolation.mjs';
import { dependencyFootprint } from './footprint.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out')) throw Error('Usage: verify-local.mjs [--out NEW_DIRECTORY]');
const directory = dirname(fileURLToPath(import.meta.url));
const root = args[1] ? resolve(args[1]) : await mkdtemp(join(tmpdir(),'drawloom-evaluation-'));
if (args[1]) await mkdir(root,{mode:0o700}); // Refuse overwriting a previous run.
const report = {
  generatedAt:new Date().toISOString(),
  referenceMachine:{platform:platform(),architecture:arch(),cpu:cpus()[0]?.model,logicalCPUs:cpus().length,memoryBytes:totalmem(),node:process.version},
  isolation:'macOS sandbox-exec deny network*, clean environment; Node channels record overlapping attempts without content',
  imports:[], adapters:[], dependencies:[], sourceHashes:{},
};
for (const name of (await readdir(directory)).filter(name => /\.(?:ts|mjs|json)$/.test(name)).sort()) {
  report.sourceHashes[name] = createHash('sha256').update(await readFile(join(directory,name))).digest('hex');
}
for (const name of ['promptfoo','braintrust','autoevals']) {
  const measured = await runIsolated({root:join(root,`import-${name}`),args:['--input-type=module','-e',
    `const start=performance.now();await import(${JSON.stringify(name)});console.log(JSON.stringify({importMs:performance.now()-start,cpu:process.cpuUsage(),maxRSSKiB:process.resourceUsage().maxRSS}));`],timeoutMs:30000});
  report.imports.push({name,code:measured.code,timedOut:measured.timedOut,processMs:measured.elapsedMs,
    detail:measured.code===0 ? JSON.parse(measured.stdout) : null,network:measured.network});
  report.dependencies.push(dependencyFootprint(name));
}
for (const adapter of ['promptfoo','braintrust']) {
  report.dependencies.push(dependencyFootprint([adapter,'autoevals']));
  const adapterRoot = join(root,adapter), out = join(adapterRoot,'report.json');
  const measured = await runIsolated({root:adapterRoot,args:['--experimental-strip-types',join(directory,'run.ts'),
    '--adapter',adapter,'--out',out,'--repetitions','30'],timeoutMs:120000});
  // Full process diagnostics remain local, never automatically copied to evidence.
  await writeFile(join(adapterRoot,'process.log'),measured.stdout+'\n'+measured.stderr,{mode:0o600});
  let proof;
  try { proof = JSON.parse(await readFile(out,'utf8')); }
  catch { proof = {status:'no_valid_report'}; }
  const verified = measured.code === 0 && !measured.timedOut && !measured.outputLimit
    && proof.adapter === adapter && Array.isArray(proof.failures) && proof.failures.length === 0
    && Array.isArray(proof.checks) && proof.checks.length > 0 && proof.checks.every(check => check.passed === true)
    && proof.warm?.repetitions === 30;
  report.adapters.push({adapter,verified,code:measured.code,timedOut:measured.timedOut,outputLimit:measured.outputLimit,
    processMs:measured.elapsedMs,stdoutBytes:Buffer.byteLength(measured.stdout),stderrBytes:Buffer.byteLength(measured.stderr),
    network:measured.network,proof});
}
await writeFile(join(root,'measurements.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({root,adapters:report.adapters.map(({adapter,code,timedOut})=>({adapter,code,timedOut})),
  results:'measurements.json',status:report.adapters.every(a=>a.verified)?'pass':'incomplete'},null,2));
if (report.adapters.some(a=>!a.verified) || report.imports.some(p=>p.code!==0||p.timedOut)) process.exitCode=1;
