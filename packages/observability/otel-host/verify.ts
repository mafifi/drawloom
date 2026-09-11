const cases: {name:string;run:()=>Promise<void>}[] = [];
const test = (name:string,run:()=>Promise<void>) => { cases.push({name,run}); };
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { context, trace, metrics } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { InMemoryMetricExporter, AggregationTemporality } from '@opentelemetry/sdk-metrics';
import { initializeObservability } from './src/index.ts';

test('disabled setup exports nothing and validates endpoint and bounds', async () => {
  const spans = new InMemorySpanExporter();
  const sdk = initializeObservability({ mode: 'disabled', serviceName: 'drawloom-test', exporters: {traces:spans} });
  trace.getTracer('test').startSpan('tool.execute').end();
  await sdk.flush();
  assert.equal(spans.getFinishedSpans().length, 0);
  await sdk.shutdown();
  for (const endpoint of ['https://example.com', 'http://localhost.evil:4318', 'http://user:pass@127.0.0.1:4318']) {
    assert.throws(() => initializeObservability({mode:'export',serviceName:'test',endpoint}));
  }
  assert.throws(() => initializeObservability({mode:'recording',serviceName:'test',maxQueueSize:0}));
});

test('supported orchestration stages retain safe names, state and receipt diagnostics', async () => {
  const spans = new InMemorySpanExporter();
  const sdk = initializeObservability({ mode: 'recording', serviceName: 'orchestration-test', exporters: { traces: spans } });
  const names = ['startup','prepare','start','task','recovery','state','shutdown'].map(name => `drawloom.orchestration.${name}`);
  try {
    for (const name of names) {
      const span = trace.getTracer('orchestration').startSpan(name);
      span.setAttribute('drawloom.workflow.state', 'waiting');
      span.setAttribute('drawloom.cache.hit', true);
      span.setAttribute('drawloom.outcome', 'ok');
      span.setAttribute('document', 'PRIVATE_MARKER');
      span.end();
    }
    await sdk.flush();
    assert.deepEqual(spans.getFinishedSpans().map(span => span.name), names);
    assert.ok(spans.getFinishedSpans().every(span => span.attributes['drawloom.workflow.state'] === 'waiting'));
    assert.equal(JSON.stringify(spans.getFinishedSpans()).includes('PRIVATE_MARKER'), false);
  } finally { await sdk.shutdown(); }
});

test('real SDK preserves concurrent parent and log context and removes accidental content', async () => {
  const spans = new InMemorySpanExporter();
  const records = new InMemoryLogRecordExporter();
  const points = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const sdk = initializeObservability({mode:'recording',serviceName:'drawloom-test', exporters:{traces:spans,logs:records,metrics:points}});
  assert.throws(() => initializeObservability({mode:'recording',serviceName:'other'}));
  try {
    const tracer = trace.getTracer('PRIVATE_MARKER');
    await Promise.all([1,2].map(async () => tracer.startActiveSpan('tool.invoke', async parent => {
      await new Promise(resolve => setTimeout(resolve, 2));
      await tracer.startActiveSpan('tool.execute', async child => {
        child.setAttribute('prompt','PRIVATE_MARKER');
        child.setAttribute('drawloom.outcome','ok');
        child.addEvent('PRIVATE_MARKER', {prompt:'PRIVATE_MARKER'});
        child.recordException(new Error('PRIVATE_MARKER'));
        child.setStatus({code:2,message:'PRIVATE_MARKER'});
        logs.getLogger('PRIVATE_MARKER').emit({eventName:'operation.completed',body:'PRIVATE_MARKER',context:context.active(),attributes:{'drawloom.outcome':'ok',secret:'PRIVATE_MARKER'}});
        child.end();
      });
      parent.end();
    })));
    tracer.startSpan('PRIVATE_MARKER', { links: [{ context: { traceId: 'PRIVATE_MARKER', spanId: 'PRIVATE_MARKER', traceFlags: 1 } }] }).end();
    const counter = metrics.getMeter('PRIVATE_MARKER').createCounter('operation.count', {description:'PRIVATE_MARKER'});
    counter.add(1, {prompt:'PRIVATE_MARKER','drawloom.outcome':'ok'});
    counter.add(1, {prompt:'PRIVATE_MARKER_OTHER','drawloom.outcome':'ok'});
    await sdk.flush();
    const finished = spans.getFinishedSpans();
    assert.equal(finished.length,5);
    for (const child of finished.filter(s=>s.name==='tool.execute')) {
      assert.ok(finished.some(p=>p.spanContext().spanId===child.parentSpanContext?.spanId && p.name==='tool.invoke'));
      assert.ok(records.getFinishedLogRecords().some(r=>r.spanContext?.spanId===child.spanContext().spanId));
    }
    assert.equal(records.getFinishedLogRecords().length,2);
    assert.ok(points.getMetrics().length>0);
    assert.equal(points.getMetrics()[0]?.scopeMetrics[0]?.metrics[0]?.dataPoints.length,1);
    assert.equal(JSON.stringify([finished,records.getFinishedLogRecords(),points.getMetrics()]).includes('PRIVATE_MARKER'),false);
    assert.equal(finished[0]?.resource.attributes['service.name'],'drawloom-test');
    assert.equal(sdk.diagnostics().recordedSpans,5);
  } finally { await sdk.shutdown(); }
});

test('metric overflow remains distinguishable from an empty dimension set', async () => {
  const points = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const sdk = initializeObservability({ mode: 'recording', serviceName: 'overflow-test', exporters: { metrics: points } });
  try {
    const counter = metrics.getMeter('test').createCounter('operation.count');
    counter.add(1);
    for (let status = 100; status < 230; status++) counter.add(1, { 'http.response.status_code': status });
    await sdk.flush();
    const all = points.getMetrics().flatMap(r => r.scopeMetrics.flatMap(s => s.metrics.flatMap(m => m.dataPoints)));
    assert.ok(all.some(p => p.attributes['otel.metric.overflow'] === true));
    assert.equal(all.filter(p => Object.keys(p.attributes).length === 0).length, 1);
  } finally { await sdk.shutdown(); }
});

test('mutated parent and log correlation contexts cannot carry content to exporters', async () => {
  const spans = new InMemorySpanExporter(), records = new InMemoryLogRecordExporter();
  const sdk = initializeObservability({ mode: 'recording', serviceName: 'context-test', exporters: { traces: spans, logs: records } });
  try {
    const parent = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 };
    const ctx = trace.setSpanContext(context.active(), parent);
    trace.getTracer('test').startSpan('tool.invoke', {}, ctx).end();
    logs.getLogger('test').emit({ context: ctx, eventName: 'operation.completed' });
    parent.traceId = 'PRIVATE_MARKER'; parent.spanId = 'PRIVATE_MARKER';
    await sdk.flush();
    assert.equal(JSON.stringify([spans.getFinishedSpans(), records.getFinishedLogRecords()]).includes('PRIVATE_MARKER'), false);
  } finally { await sdk.shutdown(); }
});

test('exporter outage is bounded and structured SDK metrics report queue losses', async () => {
  const sdk = initializeObservability({mode:'recording', serviceName:'outage-test',maxQueueSize:2,maxExportBatchSize:1,exportTimeoutMillis:15,shutdownTimeoutMillis:60,exporters:{traces:{export(){},shutdown:()=>new Promise(()=>{})}}});
  for(let i=0;i<20;i++) trace.getTracer('test').startSpan('tool.execute').end();
  const before = Date.now();
  await sdk.flush();
  await sdk.shutdown();
  assert.ok(Date.now()-before<500);
  assert.ok(sdk.diagnostics().exportFailures>0);
  assert.ok(sdk.diagnostics().deadlineExceeded>0);
  assert.equal(sdk.diagnostics().droppedRecords,17);
});

test('opt-in loopback exports all signals under the configured service', async () => {
  const requests: {path:string;body:string}[]=[];
  const server=createServer((request,response)=>{
    let body='';
    request.setEncoding('utf8');
    request.on('data',chunk=>{body+=chunk;});
    request.on('end',()=>{requests.push({path:request.url??'',body});response.writeHead(200,{'content-type':'application/json'});response.end('{}');});
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  assert.ok(address && typeof address==='object');
  const sdk=initializeObservability({mode:'export',serviceName:'local-export-test',endpoint:`http://127.0.0.1:${address.port}`});
  try {
    trace.getTracer('test').startActiveSpan('tool.execute',span=>{logs.getLogger('test').emit({eventName:'operation.completed',body:'PRIVATE_MARKER'});span.end();});
    metrics.getMeter('test').createCounter('operation.count').add(1);
    await sdk.flush();
    for(const path of ['/v1/traces','/v1/logs','/v1/metrics']) {
      const request=requests.find(r=>r.path===path);
      assert.ok(request,`missing ${path}`);
      assert.ok(request.body.includes('local-export-test'));
      assert.equal(request.body.includes('PRIVATE_MARKER'),false);
    }
    assert.equal(sdk.diagnostics().exportFailures,0);
  } finally {await sdk.shutdown();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

for (const scenario of cases) { await scenario.run(); console.log(`PASS ${scenario.name}`); }
