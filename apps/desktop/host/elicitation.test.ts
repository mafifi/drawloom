import { test, expect } from 'bun:test';
import type { ToolElicitationRequest } from '@drawloom/tools';
import { createElicitationPresenter } from './elicitation.js';

const request: ToolElicitationRequest = { requestId: 'form-one', source: 'package:one:stationery', invocationId: 'call-one', operationId: 'operation',
  params: { mode: 'form', message: 'Choose paper', requestedSchema: { type: 'object', properties: { paper: { type: 'string', enum: ['plain', 'lined'] } }, required: ['paper'] } } };
test('form answers validate and bind to original conversation, with decline distinct from cancel', async () => {
  const presenter = createElicitationPresenter(() => 'conversation-one');
  const pending = presenter.request(request, new AbortController().signal);
  expect(presenter.pending('conversation-two')).toEqual([]);
  expect(presenter.pending('conversation-one')).toEqual([request]);
  expect(() => presenter.resolve('conversation-two', 'form-one', { action: 'accept', content: { paper: 'plain' } })).toThrow();
  expect(() => presenter.resolve('conversation-one', 'form-one', { action: 'accept', content: { paper: 'wrong' } })).toThrow();
  presenter.resolve('conversation-one', 'form-one', { action: 'decline' });
  expect(await pending).toEqual({ action: 'decline' });
  expect(presenter.pending('conversation-one')).toEqual([]);
  expect(() => presenter.resolve('conversation-one', 'form-one', { action: 'cancel' })).toThrow();
});
test('cancellation removes the form and stale operation answers cannot resolve it', async () => {
  let owner: string | undefined = 'conversation-one';
  const presenter = createElicitationPresenter(() => owner);
  const abort = new AbortController();
  const pending = presenter.request(request, abort.signal);
  owner = undefined;
  expect(() => presenter.resolve('conversation-one', 'form-one', { action: 'accept', content: { paper: 'plain' } })).toThrow();
  abort.abort();
  expect(await pending).toEqual({ action: 'cancel' });
  expect(presenter.pending('conversation-one')).toEqual([]);
  expect(() => presenter.resolve('conversation-one', 'form-one', { action: 'accept', content: { paper: 'plain' } })).toThrow();
});
