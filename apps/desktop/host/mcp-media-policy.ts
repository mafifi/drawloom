import { z } from 'zod';
import { ResourceOriginSchema } from '../src/lib/package-protocol.js';
/** Validate standard UI declarations. Shared permission is owned by media-policy.ts. */
export function mediaPolicy(raw:unknown):string[]{
  const policy=z.object({csp:z.record(z.string(),z.unknown()).optional(),permissions:z.record(z.string(),z.unknown()).optional()}).passthrough().parse(raw??{});
  if(Object.keys(policy.permissions??{}).length)throw Error('MCP permissions are unsupported');
  for(const [key,value] of Object.entries(policy.csp??{}))
    if(key!=='resourceDomains' && (!Array.isArray(value)||value.length))throw Error('MCP connection, frame and base permissions are unsupported');
  const domains=z.array(ResourceOriginSchema).max(32).parse(policy.csp?.resourceDomains??[]);
  return [...new Set(domains)];
}
