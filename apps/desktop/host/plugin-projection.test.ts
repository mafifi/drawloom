import { test, expect } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { projectPackageServer } from './plugin-projection.js';
import { createLocalToolGateway } from '@drawloom/local-tools';

test('standard server projection preserves wire names, app visibility, validation and grants', async () => {
  const server = new McpServer({ name: 'reference', version: '1' });
  let calls = 0;
  server.registerTool('edit', { inputSchema: { text: z.string() } }, async ({ text }) => {
    calls++; return { content: [{ type: 'text', text }, { type: 'resource_link', uri: 'reference://passage/1', name: 'Passage' }] };
  });
  server.registerTool('save', { inputSchema: {}, _meta: { ui: { visibility: ['app'] } } }, async () => { throw Error('App-only must not be exposed'); });
  const [a,b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await server.connect(a); await client.connect(b);
  try {
    const first = await projectPackageServer('first', 'reference', client);
    const second = await projectPackageServer('second', 'reference', client);
    expect(first.tools).toHaveLength(1);
    expect(first.tools[0]!.name).not.toBe(second.tools[0]!.name);
    expect(first.inventory).toHaveLength(2);
    let allowed = false;
    const gateway = createLocalToolGateway({ tools: first.tools, policy: () => allowed, nextInvocationId: () => crypto.randomUUID(), evidence: { record: async () => {} } });
    const binding = gateway.bind('operation'); const signal = new AbortController().signal;
    expect((await gateway.invoke(binding, first.tools[0]!.name, { text: 'hello' }, signal)).outcome.status).toBe('failed');
    expect(calls).toBe(0);
    allowed = true;
    expect((await gateway.invoke(binding, first.tools[0]!.name, { text: 7 }, signal)).outcome.status).toBe('failed');
    expect(calls).toBe(0);
    const result = await gateway.invoke(binding, first.tools[0]!.name, { text: 'hello' }, signal);
    expect(result.outcome.status).toBe('ok');
    if (result.outcome.status === 'ok') expect(result.outcome.content?.[1]?.type).toBe('resource_link');
    expect(calls).toBe(1);
  } finally { await client.close(); await server.close(); }
});

test('an MCP tool error remains a failed gateway invocation and recorded outcome', async () => {
  const server = new McpServer({ name: 'reference', version: '1' });
  server.registerTool('fail', { inputSchema: {} }, async () => ({ isError: true, content: [{ type: 'text', text: 'Cannot complete' }] }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await server.connect(a); await client.connect(b);
  try {
    const projection = await projectPackageServer('first', 'reference', client);
    const recorded: unknown[] = [];
    const gateway = createLocalToolGateway({ tools: projection.tools, policy: () => true,
      nextInvocationId: () => 'failed-invocation', evidence: { record: async record => { recorded.push(record); } } });
    const result = await gateway.invoke(gateway.bind('operation'), projection.tools[0]!.name, {}, new AbortController().signal);
    expect(result.outcome).toMatchObject({ status: 'failed', code: 'handler_failed' });
    expect(recorded[1]).toEqual({ kind: 'finished', result });
  } finally { await client.close(); await server.close(); }
});
