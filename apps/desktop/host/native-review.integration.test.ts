import { expect, test } from 'bun:test';
import { z } from 'zod';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexDriver, createCodexToolBridge } from '@drawloom/codex-agent';
import { createLocalToolGateway } from '@drawloom/local-tools';
import { defineTool, type ToolBinding } from '@drawloom/tools';
import { codexCommand, createStdioTransport, createNodeJsonStore, createMcpToolServer } from '@drawloom/node-host';
import { mcpReviewConfiguration } from './composition.js';

// Explicit opt-in: this uses the operator's signed-in Codex and model allowance.
// Only synthetic in-memory text is edited; no file/media/business tool is exposed.
for (const mode of ['approve', 'deny', 'delegated', 'revoked'] as const) {
  test.skipIf(process.env.DRAWLOOM_LIVE_NATIVE_REVIEW !== '1')(`live native ${mode} gates the existing MCP gateway`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'drawloom-native-review-'));
    let calls = 0, grant = true, text = 'Original synthetic passage';
    const observed: string[] = [];
    let binding: ToolBinding | undefined;
    const gateway = createLocalToolGateway({
      tools: [defineTool({ name: 'text.revise', description: 'Replace an in-memory synthetic test passage. No external effects or business acceptance.', annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        input: z.strictObject({ text: z.string() }), output: z.strictObject({ text: z.string() }),
        execute: args => { calls++; text = args.text; observed.push('handler'); return { text }; },
      })],
      policy: () => grant, nextInvocationId: () => crypto.randomUUID(), evidence: { async record() {} },
    });
    const bridge = createCodexToolBridge(gateway);
    const mcp = await createMcpToolServer({ exposure: gateway.exposure, invoke: (meta, name, args, signal) => bridge.call(meta, name, args, signal) });
    const driver = createCodexDriver({ store: createNodeJsonStore(join(root, 'state')),
      connect: async () => {
        const rpc = createStdioTransport({ ...codexCommand(), cwd: root });
        const request = rpc.request.bind(rpc);
        rpc.request = async (method, params) => {
          const result = await request(method, params);
          if (method === 'thread/start') {
            const { thread } = z.object({ thread: z.object({ id: z.string() }) }).parse(result);
            const status = await request('mcpServerStatus/list', { threadId: thread.id });
            const servers = z.object({ data: z.array(z.object({ name: z.string(), tools: z.record(z.string(), z.unknown()) })) }).parse(status);
            expect(Object.keys(servers.data.find(server => server.name === 'drawloom')?.tools ?? {})).toContain('text.revise');
          }
          return result;
        };
        return rpc;
      },
      projection: exposure => ({ drawloom: { url: mcp.url, http_headers: { Authorization: `Bearer ${mcp.token}` }, ...mcpReviewConfiguration(exposure) } }),
      onTurnAccepted: (thread, turn, operation) => { binding = gateway.bind(operation); bridge.publish(thread, turn, binding); },
      onTurnFinished: (thread, turn) => bridge.retire(thread, turn),
    });
    const opened = await driver.openSession({ sessionId: 'native-review-test', context: { text: 'Use the drawloom MCP text.revise tool for this test. Tool discovery/search is allowed if necessary to find it. Do not use filesystem, shell or unrelated tools. A denial must not be retried.' }, tools: gateway.exposure });
    if (opened.status !== 'ok') { await mcp.close(); await rm(root, { recursive: true, force: true }); throw Error(opened.failure.message); }
    const session = opened.value;
    let terminal!: () => void;
    const done = new Promise<void>(resolve => { terminal = resolve; });
    let approvals = 0;
    const pump = (async () => {
      for await (const event of session.signals()) {
        if (event.kind === 'approval.requested') {
          approvals++; observed.push('human-request'); expect(calls).toBe(0);
          if (mode === 'delegated') throw Error('Delegated review unexpectedly requested human approval');
          if (mode === 'revoked') grant = false;
          const choice = event.request.options.find(option => option.label === (mode === 'deny' ? 'Deny' : 'Approve once'));
          if (!choice) throw Error('Native decision missing');
          expect((await session.resolveApproval({ approvalId: event.request.approvalId, optionId: choice.optionId })).status).toBe('ok');
          observed.push(mode === 'deny' ? 'human-denied' : 'human-approved');
        }
        if (event.kind === 'provider.observation' && event.name === 'approval-review') observed.push(event.summary ?? 'review');
        if (event.kind.startsWith('operation.') && event.kind !== 'operation.started') { observed.push(event.kind); terminal(); }
      }
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      expect((await session.execute({ operationId: 'edit', reviewer: mode === 'delegated' ? 'delegated' : 'human', text: 'Discover the drawloom MCP tool text.revise if needed, then call it exactly once with {"text":"Revised synthetic passage"}. This edits only a disposable in-memory test value and is authorised. No unrelated tools. If denied, stop without retrying. Then briefly report the result.' })).status).toBe('ok');
      await Promise.race([done, pump.then(() => { throw Error('Stream closed before completion'); }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Native review did not finish')), 150000); })]);
      console.log(JSON.stringify({ mode, calls, approvals, observed }));
      expect(observed.at(-1)).toBe('operation.completed');
      if (mode === 'approve' || mode === 'delegated') { expect(calls).toBe(1); expect(text).toBe('Revised synthetic passage'); }
      else { expect(calls).toBe(0); expect(text).toBe('Original synthetic passage'); }
      if (mode === 'delegated') {
        expect(approvals).toBe(0);
        const reviewed = observed.findIndex(value => value.startsWith('Automatic review approved'));
        expect(reviewed).toBeGreaterThanOrEqual(0); expect(reviewed).toBeLessThan(observed.indexOf('handler'));
      } else expect(approvals).toBe(1);
    } finally {
      clearTimeout(timer);
      if (binding) gateway.revoke(binding);
      try { await session.close(); await pump; }
      finally { await mcp.close(); await rm(root, { recursive: true, force: true }); }
    }
  }, 170000);
}
