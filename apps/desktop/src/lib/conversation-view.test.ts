import { expect, test, vi } from "vitest";
import type { DesktopViewModel } from "./view-model.svelte.js";
import { conversationActions, conversationPresentation } from "./conversation-view.js";
import { composerActions } from "./composer-view.js";

function fixture() {
  const request = {
    requestId: "request-one",
    operationId: "operation",
    params: {
      mode: "form",
      message: "Choose",
      requestedSchema: { type: "object", properties: {} },
    },
  };
  return {
    conversation: {
      id: "conversation-a",
      workbenchId: "workbench-a",
      projectId: "project-a",
      provider: "synthetic",
    },
    conversationProject: {
      id: "project-a",
      name: "Project",
      directory: "/project",
      available: true,
    },
    selectedProject: undefined,
    history: {
      entries: [
        {
          id: "message",
          position: [1, 0],
          role: "user",
          origin: { kind: "user" },
          text: "Hello",
          assets: [],
          state: "complete",
        },
      ],
      anchorId: "message",
      loading: false,
      loadingEarlier: false,
      atLatest: true,
      hasOlder: false,
      error: "",
    },
    busy: false,
    pendingCommand: undefined,
    canCreate: true,
    canSend: true,
    creationSource: undefined,
    detailsOpen: false,
    artifact: undefined,
    candidate: undefined,
    approvals: [],
    error: "",
    state: {
      selectedId: "conversation-a",
      activity: [],
      pendingTools: [],
      toolLabels: [],
      projects: [],
      workbenches: [],
      activeOperation: undefined,
      modes: ["default"],
      views: [
        {
          id: "view-a",
          workbenchId: "workbench-a",
          title: "Workbench view",
          entrypoint: "ui://example/view.html",
          pluginId: "plugin",
        },
      ],
      elicitations: [request],
      signals: [],
      goal: { supported: false },
    },
    goalCommand: vi.fn(),
    elicitationChoice: vi.fn(),
    chooseElicitation: vi.fn(),
    submitElicitation: vi.fn(),
    command: vi.fn(async () => true),
  } as unknown as DesktopViewModel;
}

test("conversation projection preserves history anchor, workbench, activity and elicitation ownership", () => {
  const vm = fixture();
  const projected = conversationPresentation(vm);
  expect(projected.nodes.map((node) => node.id)).toEqual(["message"]);
  expect(projected.turns.map((turn) => turn.id)).toEqual(["message"]);
  expect(projected.history.anchorId).toBe("message");
  expect(projected.workbenchView?.id).toBe("view-a");
  expect(projected.activity.size).toBe(0);
  expect(projected.elicitations[0]?.request.requestId).toBe("request-one");
  expect(projected.conversationProject?.directory).toBe("/project");
});

test("reopened retained tool starts are projected beside their operation without inventing an outcome", () => {
  const vm = fixture();
  vm.history.entries[0] = { ...vm.history.entries[0]!, operationId: "operation" };
  vm.state!.pendingTools = [
    { kind: "started", invocationId: "invocation", operationId: "operation", tool: "effect" },
  ];
  const projected = conversationPresentation(vm);
  expect(projected.pendingActivity.get("message")).toEqual([
    { kind: "started", invocationId: "invocation", operationId: "operation", tool: "effect" },
  ]);
});

test("a retained terminal result supersedes the same pending invocation exactly once", () => {
  const vm = fixture();
  vm.history.entries[0] = { ...vm.history.entries[0]!, operationId: "operation" };
  vm.state!.pendingTools = [
    { kind: "started", invocationId: "invocation", operationId: "operation", tool: "effect" },
  ];
  vm.state!.activity = [
    {
      invocationId: "invocation",
      operationId: "operation",
      evidence: "recorded",
      outcome: { status: "ok", value: null, text: "done" },
    },
  ];
  const projected = conversationPresentation(vm);
  expect(projected.pendingActivity.get("message")).toBeUndefined();
  expect(projected.activity.get("message")).toHaveLength(1);
});

test("disconnected goal disclosure retains its objective and accounting while actions are unavailable", () => {
  const vm = fixture();
  vm.state!.goal = {
    supported: false,
    snapshot: {
      revision: "goal:1",
      objective: "Preserve the objective",
      status: "active",
      timeUsedSeconds: 42,
      tokensUsed: 100,
    },
  };
  const projected = conversationPresentation(vm);
  expect(projected.goal).toMatchObject({
    actionsAvailable: false,
    readiness: "ready",
    snapshot: { objective: "Preserve the objective", timeUsedSeconds: 42, tokensUsed: 100 },
  });
});

test("action projections resolve the live conversation at call time after a switch", async () => {
  const vm = fixture();
  const conversation = conversationActions(vm);
  const composer = composerActions(vm);
  (
    vm as unknown as { conversation: { id: string }; state: { selectedId: string } }
  ).conversation.id = "conversation-b";
  (vm as unknown as { state: { selectedId: string } }).state.selectedId = "conversation-b";
  await composer.setModel({ model: "current" });
  await composer.setReviewer("human");
  await conversation.cancelInput("request-one");
  expect(vi.mocked(vm.command).mock.calls.map((call) => call[0])).toEqual([
    { kind: "set_model", conversationId: "conversation-b", selection: { model: "current" } },
    { kind: "set_reviewer", conversationId: "conversation-b", reviewer: "human" },
    {
      kind: "input",
      conversationId: "conversation-b",
      resolution: { requestId: "request-one", action: "cancel" },
    },
  ]);
});
