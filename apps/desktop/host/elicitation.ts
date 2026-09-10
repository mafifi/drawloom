import { ToolElicitationRequestSchema, ToolElicitationResultSchema, type ToolElicitationHandler, type ToolElicitationRequest, type ToolElicitationResult } from '@drawloom/tools';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { JsonValueSchema } from '@drawloom/host';

/** Transient host presentation. The owning invocation, never the selected tab, determines routing. */
export function createElicitationPresenter(ownerFor: (operationId: string) => string | undefined) {
  const pending = new Map<string, { conversationId: string; request: ToolElicitationRequest; finish: (result: ToolElicitationResult) => void }>();
  const request: ToolElicitationHandler = (raw, signal) => {
    const input = ToolElicitationRequestSchema.parse(raw);
    const conversationId = ownerFor(input.operationId);
    if (!conversationId || signal.aborted) return Promise.resolve({ action: 'cancel' });
    if (pending.has(input.requestId)) return Promise.reject(Error('Duplicate elicitation identity'));
    return new Promise(resolve => {
      const cancel = () => finish({ action: 'cancel' });
      const finish = (result: ToolElicitationResult) => {
        pending.delete(input.requestId);
        signal.removeEventListener('abort', cancel);
        resolve(result);
      };
      pending.set(input.requestId, { conversationId, request: input, finish });
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
  };
  return { request,
    pending: (conversationId: string) => [...pending.values()].filter(p => p.conversationId === conversationId).map(p => structuredClone(p.request)),
    resolve(conversationId: string, requestId: string, raw: unknown) {
      const entry = pending.get(requestId);
      if (!entry || entry.conversationId !== conversationId || ownerFor(entry.request.operationId) !== conversationId)
        throw Error('Elicitation is unavailable for this conversation');
      const result = ToolElicitationResultSchema.parse(raw);
      if (result.action === 'accept') {
        const schema = JsonValueSchema.parse(entry.request.params.requestedSchema);
        if (!schema || typeof schema !== 'object' || Array.isArray(schema) || !result.content ||
          !new AjvJsonSchemaValidator().getValidator({ ...schema, type: 'object' })(result.content).valid)
          throw Error('Response does not match the requested form');
      }
      entry.finish(result.action === 'accept' ? result : { action: result.action });
    },
  };
}
