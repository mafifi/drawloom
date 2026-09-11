import { trace } from '@opentelemetry/api';

/** Small composition helper; OpenTelemetry remains the instrumentation API. */
export function observe<T>(stage: 'startup' | 'prepare' | 'recovery' | 'shutdown', work: () => Promise<T>): Promise<T> {
  return trace.getTracer('@drawloom/temporal-orchestration').startActiveSpan(`drawloom.orchestration.${stage}`, async span => {
    try { const result = await work(); span.setAttribute('drawloom.outcome', 'ok'); return result; }
    catch (error) { span.setAttribute('drawloom.outcome', 'error'); throw error; }
    finally { span.end(); }
  });
}
