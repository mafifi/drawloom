import { describe, expect, test } from 'bun:test';
import { cedarEngine, casbinEngine } from './engines.ts';
import type { Evaluation } from './contract.ts';

export function example(): Evaluation {
  return { subject: { type: 'user', id: 'owner', properties: { tenant: 'local', active: true, clearance: 2, compartments: ['clinic'] } }, action: { name: 'read' }, resource: { type: 'knowledge', id: 'claim', properties: { tenant: 'local', active: true, sensitivity: 2, compartments: ['clinic'], expires: 200, remoteAllowed: false } }, context: { now: 100, project: 'project-a' } };
}

for (const [name, create] of [['cedar', cedarEngine], ['casbin', casbinEngine]] as const) {
  describe(name, () => {
    test('allows an entitled local owner without treating project as an access boundary', async () => {
      const engine = await create();
      const request = example();
      expect(await engine(request)).toEqual({ decision: true });
      request.context = { now: 100, project: 'project-b' };
      expect(await engine(request)).toEqual({ decision: true });
    });
    test.each(['inactive-user', 'other-tenant', 'low-clearance', 'missing-compartment', 'withdrawn', 'expired', 'remote-export', 'unknown-action', 'missing-label', 'bad-time'])('denies %s', async reason => {
      const engine = await create();
      const request = example();
      const s = request.subject.properties!; const r = request.resource.properties!;
      if (reason === 'inactive-user') s.active = false;
      if (reason === 'other-tenant') s.tenant = 'other';
      if (reason === 'low-clearance') s.clearance = 0;
      if (reason === 'missing-compartment') s.compartments = [];
      if (reason === 'withdrawn') r.active = false;
      if (reason === 'expired') request.context = { now: 200 };
      if (reason === 'remote-export') request.action.name = 'export_model';
      if (reason === 'unknown-action') request.action.name = 'publish';
      if (reason === 'missing-label') delete r.sensitivity;
      if (reason === 'bad-time') request.context = { now: 'yesterday' };
      expect(await engine(request)).toEqual({ decision: false });
    });
    test('explicit remote permission permits export without weakening read restrictions', async () => {
      const engine = await create(); const request = example();
      request.action.name = 'export_model'; request.resource.properties!.remoteAllowed = true;
      expect(await engine(request)).toEqual({ decision: true });
      request.subject.properties!.compartments = [];
      expect(await engine(request)).toEqual({ decision: false });
    });
  });
}
