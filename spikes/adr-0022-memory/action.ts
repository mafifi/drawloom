import { z } from 'zod';
export const Plan = z.strictObject({ mode: z.enum(['native', 'compatibility', 'defer']), sources: z.array(z.string()).max(100), reason: z.string().min(1).max(2000) });
export type SavedPlan = z.infer<typeof Plan> & { phase: string };
// Evaluation only. Neither the plan handler nor the model sees these answers.
export function assessPlans(plans: SavedPlan[]) {
  if (plans.length !== 4) return false;
  const expected = [
    ['plan-baseline', 'defer', undefined],
    ['plan-defect', 'compatibility', 'alpha-defect'],
    ['plan-irrelevant', 'compatibility', 'alpha-defect'],
    ['plan-fixed', 'native', 'alpha-fixed'],
  ] as const;
  return expected.every(([phase, mode, source]) => {
    const matches = plans.filter(plan => plan.phase === phase);
    return matches.length === 1 && matches[0]!.mode === mode &&
      (source === undefined ? matches[0]!.sources.length === 0 : matches[0]!.sources.includes(source));
  });
}
