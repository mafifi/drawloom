import { readFileSync } from 'node:fs';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { newEnforcer, newModelFromString } from 'casbin';
import { z } from 'zod';
import { requestSchema, subjectSchema, resourceSchema, type Engine, type Evaluation } from './contract.ts';

function attributes(input: Evaluation) {
  const request = requestSchema.parse(input);
  if (request.subject.type !== 'user' || request.resource.type !== 'knowledge') throw new Error('Unsupported entity');
  return { subject: subjectSchema.parse(request.subject.properties), resource: resourceSchema.parse(request.resource.properties), now: z.number().int().nonnegative().parse(request.context?.now) };
}

export async function cedarEngine(): Promise<Engine> {
  const schema = readFileSync(new URL('./schema.cedarschema', import.meta.url), 'utf8');
  const policies = { staticPolicies: readFileSync(new URL('./policy.cedar', import.meta.url), 'utf8') };
  const validation = cedar.validate({ schema, policies });
  if (validation.type !== 'success' || validation.validationErrors.length) throw new Error(`Invalid Cedar policy: ${JSON.stringify(validation)}`);
  return async request => {
    let parsed: ReturnType<typeof attributes>;
    try { parsed = attributes(request); } catch { return { decision: false }; }
    const principal = { type: 'User', id: request.subject.id };
    const resource = { type: 'Knowledge', id: request.resource.id };
    const result = cedar.isAuthorized({ principal, resource, action: { type: 'Action', id: request.action.name }, context: { now: parsed.now }, schema, policies,
      entities: [{ uid: principal, attrs: parsed.subject, parents: [] }, { uid: resource, attrs: parsed.resource, parents: [] }] });
    // Evaluation errors never become permission, even if another policy permits.
    return { decision: result.type === 'success' && result.response.decision === 'allow' && result.response.diagnostics.errors.length === 0 };
  };
}

export async function casbinEngine(): Promise<Engine> {
  const engine = await newEnforcer(newModelFromString(readFileSync(new URL('./model.conf', import.meta.url), 'utf8')));
  engine.addFunction('containsAll', (held: unknown, needed: unknown) => {
    const available = z.array(z.string()).parse(held); return z.array(z.string()).parse(needed).every(item => available.includes(item));
  });
  return async request => {
    let parsed: ReturnType<typeof attributes>;
    try { parsed = attributes(request); } catch { return { decision: false }; }
    return { decision: await engine.enforce(parsed.subject, parsed.resource, request.action.name, { now: parsed.now }) };
  };
}
