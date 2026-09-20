import type { MentionOption } from "@drawloom/ui";

/** One action catalogue for slash and plus. Views only dispatch selected actions. */
export function composerActions(capabilities: {
  goal: boolean;
  plan: boolean;
  delegate: boolean;
  fork: boolean;
  active: boolean;
  busy: boolean;
  browser?: boolean;
}): MentionOption[] {
  const entries: MentionOption[] = [];
  const add = (id: string, title: string, description: string, disabled = capabilities.busy) =>
    entries.push({
      id: `action:${id}`,
      title,
      description,
      group: "Actions",
      kind: "action",
      disabled,
    });
  if (capabilities.goal) add("goal", "Create goal", "Set an objective to keep pursuing");
  if (capabilities.plan)
    add(
      "plan",
      "Plan mode",
      "Discuss an approach before implementation",
      capabilities.busy || capabilities.active,
    );
  if (capabilities.fork)
    add(
      "fork",
      "Fork conversation",
      "Independent conversation; project files remain shared",
      capabilities.busy || capabilities.active,
    );
  if (capabilities.browser)
    add("browser", "Open browser", "View a website alongside this conversation", false);
  return entries;
}

export function delegationDraft(draft: string, child?: { id: string; label: string }): string {
  const request = child
    ? `Please follow up with ${child.label}: `
    : "Please delegate the following task using your native delegation tools: ";
  return draft.endsWith(request) ? draft : draft ? `${draft}\n\n${request}` : request;
}
