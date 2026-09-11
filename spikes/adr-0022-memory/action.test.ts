import { test, expect } from 'bun:test';
import { assessPlans, type SavedPlan } from './action.js';
const plans: SavedPlan[] = [
  { phase: 'plan-baseline', mode: 'defer', sources: [], reason: 'No evidence.' },
  { phase: 'plan-defect', mode: 'compatibility', sources: ['alpha-defect'], reason: 'Preserves transparency.' },
  { phase: 'plan-irrelevant', mode: 'compatibility', sources: ['alpha-defect'], reason: 'Opaque-image success does not fix transparency.' },
  { phase: 'plan-fixed', mode: 'native', sources: ['alpha-fixed'], reason: 'Updated installed version passed transparency test.' },
];
test('action evaluator accepts the expected evidence-linked change with stable irrelevant control', () => {
  expect(assessPlans(plans)).toBe(true);
});
test('action evaluator rejects absent, duplicated, unchanged or irrelevant-supported actions', () => {
  expect(assessPlans(plans.slice(1))).toBe(false);
  expect(assessPlans([...plans, plans[3]!])).toBe(false);
  expect(assessPlans(plans.map(plan => plan.phase === 'plan-fixed' ? { ...plan, mode: 'compatibility' } : plan))).toBe(false);
  expect(assessPlans(plans.map(plan => plan.phase === 'plan-irrelevant' ? { ...plan, mode: 'native' } : plan))).toBe(false);
  expect(assessPlans(plans.map(plan => plan.phase === 'plan-fixed' ? { ...plan, sources: ['opaque-success'] } : plan))).toBe(false);
});
