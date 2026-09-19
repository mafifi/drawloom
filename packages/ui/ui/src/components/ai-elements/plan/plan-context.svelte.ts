import { getContext, setContext } from "svelte";
const key = Symbol("plan-context");
export type PlanContext = { readonly isStreaming: boolean };
export const setPlanContext = (value: PlanContext) => setContext(key, value);
export function getPlanContext() {
  const value = getContext<PlanContext>(key);
  if (!value) throw new Error("Plan components must be used within Plan");
  return value;
}
