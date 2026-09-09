import { test, expect } from 'bun:test';
import { OperatorSnapshotSchema } from './src/index.js';

for (const kind of ['text', 'asset'] as const) test(`declarative ${kind} presentation resolves groups and distinct review authority`, () => {
  const content = kind === 'text' ? { kind, text: 'Independent public document' } : { kind, asset: { key: 'public-sample', mediaType: 'video/mp4', size: 20 } };
  const value = { artifacts: [{ id: 'overview', title: 'Overview', content: { kind: 'text', text: 'No candidate required' } }, { id: 'output', title: 'Output', editable: kind === 'text', content }], candidates: [{ id: 'candidate', artifactIds: ['output'], label: 'Output', status: 'accepted', comparisonKey: 'family-a', selectedForOutput: true }], groups: [{ id: 'inspection', title: 'Inspection', artifactIds: ['overview'], candidateIds: ['candidate'] }], reviews: [], readiness: 'ready', summary: '', configuration: [], grants: [], spending: { summary: 'Estimates only; actual billing unavailable.' } };
  expect(OperatorSnapshotSchema.safeParse(value).success).toBe(true);
  expect(OperatorSnapshotSchema.safeParse({ ...value, groups: [{ id: 'bad', title: 'Bad', artifactIds: ['missing'], candidateIds: [] }] }).success).toBe(false);
  expect(OperatorSnapshotSchema.safeParse({ ...value, candidates: [{ ...value.candidates[0], reviewAction: { kind: 'recovery', label: 'Record local reconciliation', description: 'Record identity only. No provider call or content acceptance.' } }] }).success).toBe(true);
  expect(OperatorSnapshotSchema.safeParse({ ...value, spending: { summary: 'safe', execute: 'javascript' } }).success).toBe(false);
});
