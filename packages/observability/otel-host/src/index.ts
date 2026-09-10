import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { LogRecordExporter } from '@opentelemetry/sdk-logs';
import type { PushMetricExporter, MetricData } from '@opentelemetry/sdk-metrics';
import { context, trace, metrics, propagation, isSpanContextValid, type Attributes } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import { BatchLogRecordProcessor, LoggerProvider, type ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

export interface ObservabilityOptions {
  mode: 'disabled' | 'recording' | 'export';
  serviceName: string;
  endpoint?: string;
  maxQueueSize?: number;
  maxExportBatchSize?: number;
  exportTimeoutMillis?: number;
  shutdownTimeoutMillis?: number;
  /** Trusted composition-owned vocabulary; never populate from user content. */
  safeSpanNames?: readonly string[];
  exporters?: { traces?: SpanExporter; logs?: LogRecordExporter; metrics?: PushMetricExporter };
}
export interface ObservabilityDiagnostics {
  recordedSpans: number;
  recordedLogs: number;
  exportFailures: number;
  deadlineExceeded: number;
  /** Queue-full losses at the last SDK metric collection; null before collection. */
  droppedRecords: number | null;
}
export interface Observability {
  flush(): Promise<void>;
  shutdown(): Promise<void>;
  diagnostics(): ObservabilityDiagnostics;
}
const spanNames = new Set(['ui.request','http.request','host.command','host.discovery','host.connect','host.package.inspect','host.package.connect','host.package.activate','host.package.close','host.resource.read','host.history.page','host.history.changes','host.asset.read','host.asset.write','agent.operation','agent.request','agent.submit','agent.approval.wait','tool.invoke','tool.execute','mcp.request','mcp.elicitation.wait','workflow.activity','workflow.wait','workflow.resume']);
const outcomes = new Set(['ok','error','denied','cancelled','unknown','timeout','cache_hit']);
const events = new Set(['operation.completed','operation.failed','telemetry.dropped']);
const metricNames = new Set(['operation.duration','operation.count','telemetry.dropped']);
const lossMetricNames = new Set(['otel.sdk.processor.span.processed','otel.sdk.processor.log.processed']);
const rpcMethods = new Set(['initialize','tools/list','tools/call','resources/list','resources/read','prompts/list','prompts/get','ping','elicitation/create','thread/start','thread/resume','thread/read','thread/turns/list','turn/start','turn/steer','turn/interrupt','skills/list','app/list','mcpServerStatus/list','plugin/list','mcpServer/resource/read','mcpServer/oauth/login','other']);
const routes = new Set(['/api/command','/api/observability','/api/events','/api/assets/:id','/health','/api/discovery','/api/discovery/authenticate','/api/discovery/resource/read','/api/resource/read','/api/resources','/api/resource/open','/api/history','/api/history/changes','/api/view-session','/api/view-request','/api/view-interaction','/api/import','/api/packages','/api/packages/oauth']);
let active = false;

function attributes(input: Record<string, unknown>, metric = false): Attributes {
  const output: Attributes = {};
  for (const [key,value] of Object.entries(input)) {
    if (metric && key === 'otel.metric.overflow' && value === true) output[key] = true;
    else if (key === 'drawloom.outcome' && typeof value === 'string' && outcomes.has(value)) output[key] = value;
    else if (key === 'drawloom.operation.name' && typeof value === 'string' && spanNames.has(value)) output[key] = value;
    else if(metric && key === 'error.type' && value === 'queue_full') output[key]=value;
    else if (key === 'drawloom.cache.hit' && typeof value === 'boolean') output[key] = value;
    else if (!metric && key === 'drawloom.record.count' && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1e9) output[key] = value;
    else if (key === 'http.response.status_code' && typeof value === 'number' && Number.isInteger(value) && value >=100 && value<=599) output[key] = value;
    else if (key === 'http.request.method' && typeof value === 'string' && ['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD'].includes(value)) output[key] = value;
    else if (key === 'rpc.method' && typeof value === 'string' && rpcMethods.has(value)) output[key] = value;
    else if (key === 'http.route' && typeof value === 'string' && routes.has(value)) output[key] = value;
    else if (!metric && key === 'drawloom.attempt' && typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100) output[key] = value;
    else if (!metric && ['drawloom.operation.id','drawloom.invocation.id','drawloom.run.id','drawloom.step.id','drawloom.plugin.id'].includes(key) && typeof value === 'string' && /^(?:[a-f0-9]{16,64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(value)) output[key] = value;
  }
  return output;
}

export function initializeObservability(options: ObservabilityOptions): Observability {
  if (!['disabled','recording','export'].includes(options.mode)) throw new Error('Invalid observability mode');
  if (!/^[a-z][a-z0-9.-]{0,63}$/.test(options.serviceName)) throw new Error('Invalid observability service name');
  const bound = (value: number | undefined, fallback: number, max: number) => {
    const selected = value ?? fallback;
    if (!Number.isInteger(selected) || selected < 1 || selected > max) throw new Error('Invalid observability bound');
    return selected;
  };
  const maxQueueSize = bound(options.maxQueueSize,2048,65536);
  const maxExportBatchSize = bound(options.maxExportBatchSize,Math.min(512,maxQueueSize),maxQueueSize);
  const exportTimeoutMillis = bound(options.exportTimeoutMillis,1000,30000);
  const shutdownTimeoutMillis = bound(options.shutdownTimeoutMillis,2000,30000);
  let endpoint: URL | undefined;
  if(options.endpoint !== undefined) {
    try { endpoint = new URL(options.endpoint); } catch { throw new Error('Invalid observability endpoint'); }
    if (endpoint.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('Observability requires a loopback HTTP base endpoint');
  }
  if(options.mode === 'export' && !endpoint) throw new Error('Export requires an explicit endpoint');
  if(options.mode === 'export' && options.exporters) throw new Error('Custom exporters are only available in recording mode');
  const safeNames = new Set(spanNames);
  if ((options.safeSpanNames?.length ?? 0)>128) throw new Error('Too many safe span names');
  for(const name of options.safeSpanNames ?? []) {
    if(!/^[a-z][a-z0-9_.-]{0,79}$/.test(name)) throw new Error('Invalid safe span name');
    safeNames.add(name);
  }
  const counts: ObservabilityDiagnostics = {recordedSpans:0,recordedLogs:0,exportFailures:0,deadlineExceeded:0,droppedRecords:null};
  if(active) throw new Error('Observability is already initialized');
  if(options.mode === 'disabled') return {flush:async()=>{},shutdown:async()=>{},diagnostics:()=>({...counts})};
  const resource = resourceFromAttributes({'service.name':options.serviceName});
  const scopeFor = (name:string) => ({name:['drawloom.desktop','drawloom.mcp','@opentelemetry/sdk-trace','@opentelemetry/sdk-logs'].includes(name)?name:'drawloom'});
  const safeSpan = (span: ReadableSpan): ReadableSpan => ({
    name:safeNames.has(span.name)?span.name:'operation',kind:span.kind,
    spanContext:()=>({traceId:span.spanContext().traceId,spanId:span.spanContext().spanId,traceFlags:span.spanContext().traceFlags}),
    ...(span.parentSpanContext && isSpanContextValid(span.parentSpanContext) ? {parentSpanContext:{traceId:span.parentSpanContext.traceId,spanId:span.parentSpanContext.spanId,traceFlags:span.parentSpanContext.traceFlags & 1}}:{}),
    startTime:span.startTime,endTime:span.endTime,duration:span.duration,ended:span.ended,
    status:{code:span.status.code},attributes:attributes(span.attributes),
    events:span.events.filter(e=>events.has(e.name)).map(e=>({name:e.name,time:e.time,attributes:attributes(e.attributes??{})})),
    links:span.links.filter(link => isSpanContextValid(link.context)).map(link=>({context:{traceId:link.context.traceId,spanId:link.context.spanId,traceFlags:link.context.traceFlags},attributes:attributes(link.attributes??{})})),
    resource,instrumentationScope:scopeFor(span.instrumentationScope.name),droppedAttributesCount:span.droppedAttributesCount,droppedEventsCount:span.droppedEventsCount,droppedLinksCount:span.droppedLinksCount,
  });
  const safeLog = (log: ReadableLogRecord): ReadableLogRecord => ({
    hrTime:log.hrTime,hrTimeObserved:log.hrTimeObserved,
    ...(log.spanContext && isSpanContextValid(log.spanContext)?{spanContext:{traceId:log.spanContext.traceId,spanId:log.spanContext.spanId,traceFlags:log.spanContext.traceFlags & 1}}:{}),
    ...(log.severityNumber!==undefined?{severityNumber:log.severityNumber}:{}),
    eventName:log.eventName && events.has(log.eventName)?log.eventName:'operation',
    body:log.eventName && events.has(log.eventName)?log.eventName:'operation',
    resource,instrumentationScope:scopeFor(log.instrumentationScope.name),attributes:attributes(log.attributes),droppedAttributesCount:log.droppedAttributesCount,
  });
  const bounded = async (work:()=>Promise<void>,limit=shutdownTimeoutMillis) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.resolve().then(work).catch(()=>{counts.exportFailures++;}),
      new Promise<void>(resolve=>{timer=setTimeout(()=>{counts.deadlineExceeded++;resolve();},limit);}),
    ]);
    clearTimeout(timer);
  };
  const exporting = <T>(send:(data:T,callback:(result:ExportResult)=>void)=>void,data:T,callback:(result:ExportResult)=>void) => {
    let complete=false;
    const finish=(result:ExportResult)=>{
      if(complete)return;
      complete=true;clearTimeout(timer);
      if(result.code!==ExportResultCode.SUCCESS)counts.exportFailures++;
      callback(result.code===ExportResultCode.SUCCESS?{code:result.code}:{code:result.code,error:new Error('Telemetry export failed')});
    };
    const timer=setTimeout(()=>{counts.deadlineExceeded++;finish({code:ExportResultCode.FAILED});},exportTimeoutMillis);
    try { send(data,finish); } catch { finish({code:ExportResultCode.FAILED}); }
  };
  // Exporters are constructed only on the opt-in export path. No automatic resource
  // detection, environment exporter selection or console diagnostics are enabled.
  // Recording without a supplied exporter exercises the SDK without retaining
  // an unbounded in-memory archive. Tests can supply standard memory exporters.
  const sink = {export:(_data:unknown,callback:(result:ExportResult)=>void)=>callback({code:ExportResultCode.SUCCESS}),shutdown:async()=>{},forceFlush:async()=>{}};
  const traces: SpanExporter = options.exporters?.traces ?? (options.mode==='export' ? new OTLPTraceExporter({url:new URL('v1/traces',endpoint).href,timeoutMillis:exportTimeoutMillis}) : sink);
  const logExporter: LogRecordExporter = options.exporters?.logs ?? (options.mode==='export' ? new OTLPLogExporter({url:new URL('v1/logs',endpoint).href,timeoutMillis:exportTimeoutMillis}) : sink);
  const metricExporter: PushMetricExporter = options.exporters?.metrics ?? (options.mode==='export' ? new OTLPMetricExporter({url:new URL('v1/metrics',endpoint).href,timeoutMillis:exportTimeoutMillis}) : sink);
  const meterProvider = new MeterProvider({resource,views:[{instrumentName:'*',aggregationCardinalityLimit:128,attributesProcessors:[{process:input=>attributes(input,true)}]}],readers:[new PeriodicExportingMetricReader({exportIntervalMillis:60000,exportTimeoutMillis:exportTimeoutMillis+10,exporter:{
    export:(data,callback)=>{
      // Standard SDK self-observation reports queue_full as structured data.
      // Cumulative totals are a snapshot, independent of external exporter success.
      counts.droppedRecords=0;
      for(const scope of data.scopeMetrics) for(const metric of scope.metrics) {
        if(!['@opentelemetry/sdk-trace','@opentelemetry/sdk-logs'].includes(scope.scope.name))continue;
        if(!lossMetricNames.has(metric.descriptor.name))continue;
        for(const point of metric.dataPoints) if(point.attributes['error.type']==='queue_full' && typeof point.value==='number') counts.droppedRecords+=point.value;
      }
      exporting(metricExporter.export.bind(metricExporter),{resource,scopeMetrics:data.scopeMetrics.map(s=>({scope:scopeFor(s.scope.name),metrics:s.metrics.filter(m=>metricNames.has(m.descriptor.name)||lossMetricNames.has(m.descriptor.name)).map(m=>{
        const sanitized: MetricData = {...structuredClone(m),descriptor:{...m.descriptor,description:'',unit:m.descriptor.name==='operation.duration'?'ms':'1'}};
        for(const point of sanitized.dataPoints) Object.assign(point,{attributes:attributes(point.attributes,true)});
        return sanitized;
      })}))},callback);
    },
    forceFlush:()=>bounded(()=>metricExporter.forceFlush()),shutdown:()=>bounded(()=>metricExporter.shutdown()),
  }})]});
  const batch = new BatchSpanProcessor({exporter:{export:(data,callback)=>exporting(traces.export.bind(traces),data.filter(s => isSpanContextValid(s.spanContext())).map(safeSpan),callback),shutdown:()=>bounded(()=>traces.shutdown())},maxQueueSize,maxExportBatchSize,exportTimeoutMillis:exportTimeoutMillis+10,scheduledDelayMillis:1000,selfObsMeterProvider:meterProvider});
  const tracerProvider = new NodeTracerProvider({resource,spanLimits:{attributeCountLimit:16,attributeValueLengthLimit:80,eventCountLimit:8,linkCountLimit:8},spanProcessors:[{onStart:(span,ctx)=>batch.onStart(span,ctx),onEnd:span=>{counts.recordedSpans++;batch.onEnd(span);},forceFlush:()=>batch.forceFlush(),shutdown:()=>batch.shutdown()}]});
  const logBatch = new BatchLogRecordProcessor({exporter:{export:(data,callback)=>exporting(logExporter.export.bind(logExporter),data.map(safeLog),callback),forceFlush:()=>bounded(()=>logExporter.forceFlush()),shutdown:()=>bounded(()=>logExporter.shutdown())},maxQueueSize,maxExportBatchSize,exportTimeoutMillis:exportTimeoutMillis+10,scheduledDelayMillis:1000,selfObsMeterProvider:meterProvider});
  const loggerProvider = new LoggerProvider({resource,logRecordLimits:{attributeCountLimit:16,attributeValueLengthLimit:80},processors:[{onEmit:log=>{counts.recordedLogs++;logBatch.onEmit(log);},forceFlush:()=>logBatch.forceFlush(),shutdown:()=>logBatch.shutdown()}]});
  active=true;
  tracerProvider.register();
  logs.setGlobalLoggerProvider(loggerProvider);
  metrics.setGlobalMeterProvider(meterProvider);
  let stopped=false;
  return {
    diagnostics:()=>({...counts}),
    flush:()=>stopped?Promise.resolve():bounded(async()=>{await Promise.all([tracerProvider.forceFlush(),loggerProvider.forceFlush(),meterProvider.forceFlush()]);}),
    shutdown:async()=>{
      if(stopped)return;
      stopped=true;
      await bounded(async()=>{await Promise.all([tracerProvider.shutdown(),loggerProvider.shutdown(),meterProvider.shutdown()]);});
      trace.disable();logs.disable();metrics.disable();context.disable();propagation.disable();active=false;
    },
  };
}
