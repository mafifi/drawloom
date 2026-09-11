import { test, expect } from 'bun:test';
import type { AssetReader } from '@drawloom/host';
import { fileResponse } from './file-response.js';
function fixture(size = 10_000_000) {
  let read = 0, closed = 0;
  const reader: AssetReader = { size, async *stream({start=0,endExclusive=size}={}) {
    for (let i=start;i<endExclusive;i+=65536) {const n=Math.min(65536,endExclusive-i);read+=n;yield new Uint8Array(n).fill(7);}
  }, async close(){closed++;} };
  return {reader,get read(){return read;},get closed(){return closed;}};
}
test('single and suffix HTTP ranges read only requested bytes and close the handle',async()=>{
  for(const [range,length,contentRange] of [['bytes=100-199',100,'bytes 100-199/10000000'],['bytes=-64',64,'bytes 9999936-9999999/10000000']] as const){
    const f=fixture();const response=await fileResponse(new Request('http://localhost/file',{headers:{range}}),f.reader,{mediaType:'video/mp4',immutable:false});
    expect(response.status).toBe(206);expect(response.headers.get('content-range')).toBe(contentRange);
    expect((await response.arrayBuffer()).byteLength).toBe(length);expect(f.read).toBe(length);expect(f.closed).toBe(1);
  }
});
test('HEAD and unsatisfiable ranges read no bytes and disclose truthful size',async()=>{
  for(const range of ['bytes=10000000-','bytes=3-2','bytes=0-1,3-4']){
    const f=fixture();const r=await fileResponse(new Request('http://localhost/file',{headers:{range}}),f.reader,{mediaType:'video/mp4',immutable:false});
    expect(r.status).toBe(416);expect(r.headers.get('content-range')).toBe('bytes */10000000');expect(f.read).toBe(0);expect(f.closed).toBe(1);
  }
  const f=fixture();const r=await fileResponse(new Request('http://localhost/file',{method:'HEAD'}),f.reader,{mediaType:'video/mp4',immutable:false});
  expect(r.headers.get('content-length')).toBe('10000000');expect(await r.text()).toBe('');expect(f.read).toBe(0);expect(f.closed).toBe(1);
});
test('cancelling a response bounds read-ahead and releases the file',async()=>{
  const f=fixture();const r=await fileResponse(new Request('http://localhost/file'),f.reader,{mediaType:'video/mp4',immutable:false});
  const stream=r.body!.getReader();await stream.read();await stream.cancel();expect(f.read).toBeLessThanOrEqual(65536);expect(f.closed).toBe(1);
});
test('a disconnected HTTP request closes its abandoned body without an unhandled stream error',async()=>{
  const f=fixture();const abort=new AbortController();
  const r=await fileResponse(new Request('http://localhost/file',{signal:abort.signal}),f.reader,{mediaType:'video/mp4',immutable:false});
  const body=r.body!.getReader();await body.read();abort.abort();
  expect(await body.read()).toEqual({done:true,value:undefined});
  expect(f.read).toBe(65536);expect(f.closed).toBe(1);
});
