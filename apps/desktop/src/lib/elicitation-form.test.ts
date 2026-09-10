import { test, expect } from 'bun:test';
import { elicitationContent } from './elicitation-form.js';
import type { ToolElicitationRequest } from '@drawloom/tools';

test('standard form fields retain scalar types, multiselect values and omitted optional fields', () => {
  const params: ToolElicitationRequest['params'] = { message: 'Stationery options', requestedSchema: { type: 'object', properties: {
    paper: { type: 'string', oneOf: [{ const: 'plain', title: 'Plain paper' }] }, copies: { type: 'integer' }, recycled: { type: 'boolean' },
    colours: { type: 'array', items: { type: 'string', enum: ['blue', 'red'] } }, note: { type: 'string' },
  }, required: ['paper', 'copies', 'recycled', 'colours'] } };
  const form = new FormData(); form.set('paper', 'plain'); form.set('copies', '2'); form.append('colours', 'blue'); form.append('colours', 'red'); form.set('note', '');
  expect(elicitationContent(params, form)).toEqual({ paper: 'plain', copies: 2, recycled: false, colours: ['blue', 'red'] });
  form.set('copies', 'not a number');
  expect(() => elicitationContent(params, form)).toThrow();
});
