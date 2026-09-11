import type { AssetReader } from '@drawloom/host';
import { trace, SpanStatusCode } from '@opentelemetry/api';

/** HTTP semantics over one opened handle; does not resolve paths or buffer files. */
export async function fileResponse(request: Request, reader: AssetReader, options: {
  mediaType: string; immutable: boolean; disposition?: string; headers?: Record<string,string>;
}): Promise<Response> {
  const span = trace.getTracer('drawloom.desktop').startSpan('host.file.deliver', {attributes:{'drawloom.file.cached':options.immutable,'drawloom.outcome':'ok'}});
  let bytes = 0, closed = false;
  const close = async () => { if (closed) return; closed = true;
    try { await reader.close(); } finally {span.setAttribute('drawloom.file.bytes',bytes);span.end();}
  };
  const headers = new Headers(options.headers);
  headers.set('Content-Type', options.mediaType);
  headers.set('Content-Disposition', options.disposition ?? 'inline');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('Content-Security-Policy',"sandbox; default-src 'none'; style-src 'unsafe-inline'");
  headers.set('Cache-Control', options.immutable ? 'private, max-age=31536000, immutable' : 'no-store');
  headers.set('Accept-Ranges','bytes');
  let start = 0, endExclusive = reader.size, status = 200;
  const range = request.method === 'HEAD' ? null : request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      if (!match[1]) { const suffix=Number(match[2]); start=Math.max(0,reader.size-suffix); if (!Number.isSafeInteger(suffix) || suffix<=0) start=reader.size; }
      else {start=Number(match[1]);endExclusive=match[2] ? Math.min(Number(match[2])+1,reader.size) : reader.size;}
    } else start=reader.size;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(endExclusive) || start<0 || start>=endExclusive) {
      headers.set('Content-Range',`bytes */${reader.size}`); headers.set('Content-Length','0');
      await close(); return new Response(null,{status:416,headers});
    }
    status=206;headers.set('Content-Range',`bytes ${start}-${endExclusive-1}/${reader.size}`);
  }
  headers.set('Content-Length',String(endExclusive-start));
  if (request.method==='HEAD' || endExclusive===start) {await close();return new Response(null,{status,headers});}
  const lifetime = new AbortController();
  const signal=AbortSignal.any([request.signal,lifetime.signal]);
  const iterator=reader.stream({start,endExclusive,signal})[Symbol.asyncIterator]();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const abort = () => {
    // The HTTP peer has already disconnected. Erroring its abandoned stream
    // produces an unhandled rejection in Bun 1.2.23. Close it and stop reads;
    // the peer's cancelled request is still a failed/truncated HTTP transfer.
    span.setAttribute('drawloom.outcome','cancelled');
    controller.close();
    void close().catch(() => {});
  };
  const body = new ReadableStream<Uint8Array>({
    start(value) {controller=value;signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();},
    async pull(value) {
      try { const next=await iterator.next();
        if (closed) return;
        if(next.done){signal.removeEventListener('abort',abort);await close();value.close();}
        else {bytes+=next.value.byteLength;value.enqueue(next.value);
          if(bytes===endExclusive-start){signal.removeEventListener('abort',abort);await close();value.close();await iterator.return?.();}
        }
      } catch(error) {signal.removeEventListener('abort',abort);if(closed)return;span.setAttribute('drawloom.outcome','error');span.setStatus({code:SpanStatusCode.ERROR});await close();value.error(error);}
    },
    async cancel() {signal.removeEventListener('abort',abort);lifetime.abort();span.setAttribute('drawloom.outcome','cancelled');await close();await iterator.return?.();},
  },{highWaterMark:0});
  return new Response(body,{status,headers});
}
