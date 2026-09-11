import { test, expect } from 'bun:test';
import { createCodexDriver } from './src/index.js';
import type { JsonValue, RpcTransport } from '@drawloom/host';

test('fixed project cwd is sent natively and mismatched native continuity is not resumed', async () => {
  for (const previous of [false, true]) {
    const requests: {method:string;params:unknown}[]=[];
    const values=new Map<string,JsonValue>(previous ? [['codex:s',{threadId:'t',materialized:true}]] : []);
    const rpc:RpcTransport={async request(method,params){requests.push({method,params});
      if(method==='initialize')return {userAgent:'codex/0.153.4'};
      if(method==='thread/read')return {thread:{id:'t',cwd:'/other'}};
      if(method==='thread/start'||method==='thread/resume')return {thread:{id:'t',cwd:'/chosen'},approvalsReviewer:'user'};
      return {};},notify(){},respond(){},subscribe(){return ()=>{};},async close(){}};
    const driver=createCodexDriver({workingDirectory:'/chosen',connect:async()=>rpc,store:{get:async k=>values.get(k),set:async(k,v)=>{values.set(k,v);}}});
    const result=await driver.openSession({sessionId:'s',context:{text:''},tools:{id:'none',tools:[]}});
    if(previous){expect(result.status).toBe('rejected');expect(requests.some(r=>r.method==='thread/resume')).toBe(false);}
    else {expect(result.status).toBe('ok');expect(requests.find(r=>r.method==='thread/start')?.params).toMatchObject({cwd:'/chosen'});if(result.status==='ok')await result.value.close();}
  }
});
