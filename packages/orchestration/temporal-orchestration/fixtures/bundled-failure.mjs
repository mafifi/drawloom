import { StepFailure } from '@drawloom/orchestration';
export function fail(code) { throw new StepFailure(code); }
