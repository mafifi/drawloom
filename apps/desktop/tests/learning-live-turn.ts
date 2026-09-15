import type { RpcMessage } from '@drawloom/host';
import { z } from 'zod';

type LiveCommand = { kind: 'select_conversation'; conversationId: string } | {
  kind: 'send'; conversationId: string; text: string; attachmentKeys: string[]; contextArtifactIds: string[];
};
export type LiveSubmission = { role: string; method: string; params: unknown; response?: unknown };
export type LiveNativeMessage = { role: string; message: RpcMessage };

/** Acceptance-only: a selected UI snapshot is not completion for a target turn. */
export async function sendLiveTurn(input: {
  conversationId: string;
  text: string;
  label: string;
  command(command: LiveCommand): Promise<unknown>;
  submissions: readonly LiveSubmission[];
  messages: readonly LiveNativeMessage[];
  until(check: () => Promise<boolean>, label: string): Promise<void>;
}): Promise<{ threadId: string; turnId: string; messages: LiveNativeMessage[] }> {
  await input.command({ kind: 'select_conversation', conversationId: input.conversationId });
  const submissionOffset = input.submissions.length, messageOffset = input.messages.length;
  await input.command({ kind: 'send', conversationId: input.conversationId, text: input.text, attachmentKeys: [], contextArtifactIds: [] });
  const submitted = z.array(z.object({ params: z.object({ threadId: z.string().min(1) }), response: z.object({ turn: z.object({ id: z.string().min(1) }) }) })).length(1)
    .parse(input.submissions.slice(submissionOffset).filter(value => value.role === 'foreground' && value.method === 'turn/start'))[0]!;
  const threadId = submitted.params.threadId, turnId = submitted.response.turn.id;
  const matching = () => input.messages.slice(messageOffset).filter(({ role, message }) => {
    if (role !== 'foreground') return false;
    const value = z.object({ threadId: z.string(), turnId: z.string().optional(), turn: z.object({ id: z.string() }).optional() }).safeParse(message.params);
    return value.success && value.data.threadId === threadId &&
      (message.method === 'turn/completed' ? value.data.turn?.id === turnId : value.data.turnId === turnId);
  });
  await input.until(async () => matching().some(({ message }) => message.method === 'turn/completed' &&
    z.object({ turn: z.object({ status: z.enum(['completed', 'failed', 'interrupted']) }) }).safeParse(message.params).success), input.label);
  return { threadId, turnId, messages: matching() };
}
