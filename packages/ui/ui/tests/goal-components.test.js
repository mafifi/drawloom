import { beforeAll, describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { createRawSnippet } from "svelte";
import { render } from "svelte/server";

let Plan;
let Task;
let GoalBar;
let ComposerStrip;
const children = (text) => createRawSnippet(() => ({ render: () => text }));

beforeAll(async () => {
  ({ Plan, Task, GoalBar, ComposerStrip } = await import("@drawloom/ui"));
});

describe("goal presentation boundary", () => {
  test("task details reuse upstream exports beneath the Plan surface", () => {
    for (const name of ["Root", "Trigger", "Content", "Item", "ItemFile"])
      expect(Task[name]).toBeTypeOf("function");
    const html = render(Task.Item, {
      props: { children: children("Inspect the contract"), "aria-label": "Pending task" },
    }).body;
    expect(html).toContain("Inspect the contract");
    expect(html).toContain('aria-label="Pending task"');
  });
  test("the attached strip is a shared composition, not goal-specific geometry", () => {
    for (const label of ["Goal", "Queued messages"]) {
      const html = render(ComposerStrip, {
        props: { label, children: children("Consumer-owned content") },
      }).body;
      expect(html).toContain('class="composer-attached-strip"');
      expect(html).toContain(`aria-label="${label}"`);
      expect(html).toContain("Consumer-owned content");
    }
  });
  test("plan exposes the upstream collapsible composition with consumer content", () => {
    for (const name of [
      "Root",
      "Header",
      "Title",
      "Description",
      "Action",
      "Trigger",
      "Content",
      "Footer",
    ])
      expect(Plan[name]).toBeTypeOf("function");
    const html = render(Plan.Root, {
      props: {
        open: true,
        "aria-label": "Execution plan",
        children: children("Inspect the contract"),
      },
    }).body;
    expect(html).toContain('data-slot="plan"');
    expect(html).toContain('aria-label="Execution plan"');
    expect(html).toContain("Inspect the contract");
  });

  const actions = {
    setDraft() {},
    beginEdit() {},
    cancelEdit() {},
    async save() {},
    async pause() {},
    async resume() {},
    async clear() {},
  };
  const labels = {
    objective: "Goal objective",
    create: "Create goal",
    edit: "Edit goal",
    save: "Save goal",
    cancel: "Cancel edit",
    pause: "Pause goal",
    resume: "Resume goal",
    clear: "Clear goal",
  };

  test("goal bar renders injected goal state and keeps operation state controlled", () => {
    const html = render(GoalBar, {
      props: {
        presentation: {
          mode: "goal",
          objective: "Ship the durable goal surface",
          status: "usage_limited",
          statusLabel: "Usage limited",
          timeUsedLabel: "12m used",
          editing: false,
          draft: "Ship the durable goal surface",
          pendingAction: "pause",
          canPause: true,
          canResume: false,
          labels,
        },
        actions,
      },
    }).body;
    expect(html).toContain("Usage limited");
    expect(html).toContain("Ship the durable goal surface");
    expect(html).toContain("12m used");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Pause goal");
    expect(html).toContain('aria-label="Goal objective: Ship the durable goal surface"');
  });

  test("goal bar is absent until creation is explicitly requested", () => {
    const html = render(GoalBar, {
      props: { presentation: { mode: "create", editing: false, draft: "", labels }, actions },
    }).body;
    expect(html).not.toContain('aria-label="Goal"');
    expect(html).not.toContain("Create goal");
  });

  test("complete goals remain readable and can be cleared before creating another", () => {
    const html = render(GoalBar, {
      props: {
        presentation: {
          mode: "goal",
          objective: "Finished",
          status: "complete",
          statusLabel: "Complete",
          editing: false,
          draft: "Finished",
          canPause: false,
          canResume: false,
          labels,
        },
        actions,
      },
    }).body;
    expect(html).toContain("Finished");
    expect(html).not.toContain(">Edit goal<");
    expect(html).toContain("Clear goal");
  });

  test("a disconnected goal stays readable while every mutation is disabled", () => {
    const html = render(GoalBar, {
      props: {
        presentation: {
          mode: "goal",
          objective: "Retain this objective",
          status: "active",
          statusLabel: "Active",
          timeUsedLabel: "42s used",
          editing: false,
          draft: "Retain this objective",
          canPause: false,
          canResume: false,
          disabled: true,
          labels,
        },
        actions,
      },
    }).body;
    expect(html).toContain("Retain this objective");
    expect(html).toContain("42s used");
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Edit goal"/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Clear goal"/);
  });
});
