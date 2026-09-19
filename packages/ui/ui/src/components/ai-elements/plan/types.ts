import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import type { Collapsible as CollapsiblePrimitive } from "bits-ui";
export type PlanProps = CollapsiblePrimitive.RootProps & {
  isStreaming?: boolean;
  class?: string;
  children?: Snippet;
};
export type PlanPartProps = HTMLAttributes<HTMLDivElement> & {
  kind: "header" | "title" | "description" | "action" | "footer";
  children?: Snippet;
};
export type PlanContentProps = HTMLAttributes<HTMLDivElement> & { children?: Snippet };
export type PlanTriggerProps = CollapsiblePrimitive.TriggerProps & { children?: Snippet };
