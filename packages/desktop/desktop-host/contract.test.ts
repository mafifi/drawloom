import { expect, test } from 'bun:test';
import { z } from 'zod';
import { registerTaskHandler } from '@drawloom/orchestration';
import * as desktopHost from './src/index.ts';
import type {
  PluginBackend,
  PluginBackendContext,
} from './src/index.ts';

test('orchestration readiness is a strict bounded desktop-host report', () => {
  expect(typeof (desktopHost as Record<string, unknown>).OrchestrationReadinessSchema).toBe('object');
  expect(desktopHost.OrchestrationReadinessSchema.parse({
    status: 'unavailable', code: 'service_missing', message: 'Local service is unavailable',
  })).toEqual({ status: 'unavailable', code: 'service_missing', message: 'Local service is unavailable' });
  expect(desktopHost.OrchestrationReadinessSchema.safeParse({ status: 'failed' }).success).toBe(false);
  expect(desktopHost.OrchestrationReadinessSchema.safeParse({ status: 'ready', extra: true }).success).toBe(false);
  expect(desktopHost.OrchestrationReadinessSchema.safeParse({ status: 'unavailable', message: 'x'.repeat(513) }).success).toBe(false);
});

test('plugin backends return typed task handlers and receive optional orchestration availability', async () => {
  const task = { id: 'frame', version: '1', input: z.string(), output: z.number() };
  const handler = registerTaskHandler(task, { run: (input) => input.length });
  const backend: PluginBackend = {
    taskHandlers: [handler],
    dispose: async () => {},
  };
  const context = {
    installationId: 'installed', packageRoot: '/package', dataDirectory: '/data', configuration: {},
    capabilities: {
      orchestrationReadiness: async () => ({ status: 'ready' as const }),
    },
    dependencies: [{ kind: 'capability' as const, id: 'orchestration' as const, available: true }],
  } satisfies PluginBackendContext;
  expect(backend.taskHandlers?.[0]?.id).toBe('frame');
  expect((await context.capabilities.orchestrationReadiness()).status).toBe('ready');
  expect(context.dependencies[0]).toEqual({ kind: 'capability', id: 'orchestration', available: true });
});
