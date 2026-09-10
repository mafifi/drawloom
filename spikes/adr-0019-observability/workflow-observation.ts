import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { trace, isSpanContextValid, SpanStatusCode, type SpanContext } from '@opentelemetry/api';
import { StepFailure, type TaskContext } from '../adr-0017-orchestration/contract.ts';
import { z } from 'zod';
const identity = (value: string) => createHash('sha256').update(value).digest('hex');
const maxLinks = 1024;
const saved = z.array(z.tuple([z.string().regex(/^[a-f0-9]{64}$/), z.object({ traceId: z.string(), spanId: z.string(), traceFlags: z.number().int() })])).max(maxLinks);
/** Proof-only correlation. No workflow state, inputs or execution receipts live here. */
export async function createWorkflowObservation(file: string, options: { writeSnapshot?: (snapshot: string) => Promise<void>; flushTimeoutMillis?: number } = {}) {
  const flushTimeoutMillis = options.flushTimeoutMillis ?? 1000;
  if (!Number.isInteger(flushTimeoutMillis) || flushTimeoutMillis < 1 || flushTimeoutMillis > 10000) throw new Error('Invalid diagnostic flush deadline');
  const links = new Map<string, SpanContext>();
  try { for (const [key, value] of saved.parse(JSON.parse(await readFile(file, 'utf8')))) if (isSpanContextValid(value)) links.set(key, value); } catch { /* Missing diagnostic correlation never replays work. */ }
  const writeSnapshot = options.writeSnapshot ?? ((snapshot: string) => writeFile(file, snapshot, { mode: 0o600 }));
  let writes: Promise<void> | undefined;
  let dirty = false, persisted = true;
  const remember = (key: string, value: SpanContext) => {
    if (!isSpanContextValid(value)) return;
    links.delete(key);
    links.set(key, { traceId: value.traceId, spanId: value.spanId, traceFlags: value.traceFlags & 1 });
    while (links.size > maxLinks) links.delete(links.keys().next().value!);
    dirty = true;
    if (writes) return;
    // One active write plus the latest bounded map. Updates during a slow write
    // coalesce; diagnostic I/O never joins the task's completion or retry path.
    writes = (async () => {
      try {
        while (dirty) {
          dirty = false;
          const snapshot = JSON.stringify([...links]);
          try { await Promise.resolve().then(() => writeSnapshot(snapshot)); persisted = true; }
          catch { persisted = false; }
        }
      } finally { writes = undefined; }
    })();
  };
  return {
    /** Explicit proof checkpoint only. False does not change workflow outcomes. */
    async flush(): Promise<boolean> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => { while (writes) await writes; return persisted; })(),
          new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), flushTimeoutMillis); }),
        ]);
      } finally { clearTimeout(timer); }
    },
    async activity<T>(task: TaskContext, fn: () => Promise<T>): Promise<T> {
      const key = identity(task.runId + ':' + task.stepId), previous = links.get(key);
      return trace.getTracer('drawloom.workflow-proof').startActiveSpan('workflow.activity', { attributes: { 'drawloom.run.id': identity(task.runId), 'drawloom.step.id': identity(task.stepId), 'drawloom.attempt': task.attempt }, ...(previous ? { links: [{ context: previous }] } : {}) }, async span => {
        try { return await fn(); }
        catch (error) {
          const outcome = error instanceof StepFailure && error.code === 'denied' ? 'denied' : error instanceof StepFailure && error.code === 'unknown' ? 'unknown' : 'error';
          span.setAttribute('drawloom.outcome', outcome);
          if (outcome === 'error') span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        }
        finally { span.end(); remember(key, span.spanContext()); }
      });
    },
    async mark(run: string, name: 'workflow.wait' | 'workflow.resume') {
      const key = identity(run), previous = links.get(key);
      const span = trace.getTracer('drawloom.workflow-proof').startSpan(name, { attributes: { 'drawloom.run.id': key }, ...(previous ? { links: [{ context: previous }] } : {}) });
      span.end(); remember(key, span.spanContext());
    },
  };
}
