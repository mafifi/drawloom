import { test,expect } from 'bun:test';
import { mediaPolicy } from './mcp-media-policy.js';
test('MCP resource declarations are validated without a second approval or extra permissions',()=>{
  const declaration={csp:{resourceDomains:['https://media.example']}};
  expect(mediaPolicy(declaration)).toEqual(['https://media.example']);
  expect(()=>mediaPolicy({csp:{connectDomains:['https://media.example']}})).toThrow();
  expect(()=>mediaPolicy({permissions:{camera:{}}})).toThrow();
  for(const domain of ['*','https://*.example','https://user:pass@example','https://example/path',"https://example; script-src *"])
    expect(()=>mediaPolicy({csp:{resourceDomains:[domain]}})).toThrow();
});
