import type { ToolResult } from '@drawloom/tools';

export type ToolOutcomePresentation = Readonly<{
  label: string;
  state: 'completed' | 'denied' | 'cancelled' | 'failed' | 'uncertain';
  statusLabel: string;
  description: string;
}>;

export function presentToolOutcome(result: ToolResult): ToolOutcomePresentation {
  if (result.outcome.status === 'ok') {
    return {
      label: 'Tool activity',
      state: 'completed',
      statusLabel: 'Completed',
      description: 'Execution completed and its outcome was recorded. This is not acceptance or publication.',
    };
  }
  if (result.outcome.execution === 'unknown' || result.evidence === 'outcome_failed') {
    return { label: 'Tool activity', state: 'uncertain', statusLabel: 'Outcome uncertain', description: 'The final execution outcome could not be confirmed. Drawloom will not retry it automatically.' };
  }
  if (result.outcome.code === 'denied' && result.outcome.execution === 'not_started') {
    return { label: 'Tool activity', state: 'denied', statusLabel: 'Denied', description: 'Execution was denied and did not start.' };
  }
  if (result.outcome.code === 'cancelled' && result.outcome.execution === 'not_started') {
    return { label: 'Tool activity', state: 'cancelled', statusLabel: 'Cancelled', description: 'Execution was cancelled.' };
  }
  return {
    label: 'Tool activity',
    state: 'failed',
    statusLabel: 'Failed',
    description: result.outcome.execution === 'completed'
      ? 'Execution completed, but its result could not be used.'
      : 'Execution did not complete.',
  };
}
