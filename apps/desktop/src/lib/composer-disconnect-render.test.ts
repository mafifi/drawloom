import { expect, test } from "vitest";
import { render } from "svelte/server";
import Composer from "./Composer.svelte";
import type { ComposerActions, ComposerPresentation } from "./composer-view.js";

test("disconnected composer keeps its draft editable while live actions are disabled", () => {
  const presentation = {
    draft: "Retained draft",
    canEditDraft: true,
    canExecute: false,
    canSend: false,
    busy: false,
    error: "Local host unavailable",
    attachments: [],
    importing: false,
    delegationReferences: [],
    conversation: { id: "conversation", workbenchId: "text", provider: "codex", reviewer: "human" },
    conversationContextIds: [],
    selectedDiscoveries: [],
    contextIds: [],
    selectedResources: [],
    pickerOpen: false,
    pickerActiveId: "",
    contextOpen: false,
    forkRequested: false,
    state: {
      activeContext: "",
      controls: { steer: false, interrupt: false, reviewerModes: ["human"] },
      selectedId: "conversation",
      conversations: [],
    },
    contextLabels: [],
    conversationLabels: [],
    resources: { native: [], nativeMatchCount: 0, views: [], cards: [] },
    picker: {
      open: false,
      kind: "add",
      query: "",
      activeId: "",
      draftLength: 14,
      options: [],
      status: "",
    },
  } as unknown as ComposerPresentation;
  const actions = new Proxy({}, { get: () => () => {} }) as ComposerActions;
  const html = render(Composer, { props: { presentation, actions, onCreateGoal() {} } }).body;
  expect(html).toMatch(/<textarea[^>]*id="message-draft"(?![^>]*disabled)/);
  for (const label of ["Add to message", "Execution review", "Model", "Send message"])
    expect(html).toMatch(new RegExp(`<button[^>]*disabled[^>]*aria-label="${label}"`));
  expect(html).toMatch(/<input[^>]*aria-label="Choose attachments"[^>]*disabled/);
});
