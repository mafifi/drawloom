import { expect, test } from "bun:test";
import { compileModule } from "svelte/compiler";

Bun.plugin({
  name: "goal-view-model-tests",
  setup(build) {
    build.onLoad({ filter: /goal-view-model\.svelte\.ts$/ }, async ({ path }) => ({
      contents: compileModule(
        new Bun.Transpiler({ loader: "ts" }).transformSync(await Bun.file(path).text()),
        { filename: path, generate: "client" },
      ).js.code,
      loader: "js",
    }));
  },
});

const { createGoalViewModel } = await import("./goal-view-model.svelte.js");

const snapshot = {
  revision: "goal:4",
  objective: "Finish the GoalBar",
  status: "active" as const,
  timeUsedSeconds: 125,
  tokensUsed: 240,
  tokenBudget: 1_000,
};

test("goal clock exposes a native anchor and only runs for an active goal", () => {
  const vm = createGoalViewModel(snapshot, "ready", async () => {});
  expect(vm.presentation).toMatchObject({ clock: { seconds: 125, running: true } });
  vm.actions.sync("", { ...snapshot, status: "paused", timeUsedSeconds: 128 }, "ready");
  expect(vm.presentation).toMatchObject({ clock: { seconds: 128, running: false } });
  vm.actions.sync("", { ...snapshot, status: "complete", timeUsedSeconds: 132 }, "ready");
  expect(vm.presentation).toMatchObject({ clock: { seconds: 132, running: false } });
});

test("a ready session without a goal exposes explicit creation and trims its objective", async () => {
  const commands: unknown[] = [];
  const vm = createGoalViewModel(null, "ready", async (action) => {
    commands.push(action);
  });
  expect(vm.presentation?.mode).toBe("create");
  vm.actions.beginEdit();
  vm.actions.setDraft("  Write the release notes  ");
  await vm.actions.save();
  expect(commands).toEqual([{ kind: "create", objective: "Write the release notes" }]);
  expect(vm.presentation?.pendingAction).toBeUndefined();
});

test("goal actions address the current revision and expose pending outside the leaf", async () => {
  let release!: () => void;
  const commands: unknown[] = [];
  const vm = createGoalViewModel(snapshot, "ready", async (action) => {
    commands.push(action);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const pausing = vm.actions.pause();
  expect(vm.presentation).toMatchObject({
    mode: "goal",
    statusLabel: "Active",
    timeUsedLabel: "2m 5s used",
    pendingAction: "pause",
  });
  await vm.actions.pause();
  expect(commands).toEqual([{ kind: "pause", revision: "goal:4" }]);
  release();
  await pausing;
  expect(vm.presentation?.pendingAction).toBeUndefined();
});

test("editing preserves a failed draft and reports the dispatch error inline", async () => {
  const vm = createGoalViewModel(snapshot, "ready", async () => {
    throw Error("Goal changed elsewhere");
  });
  vm.actions.beginEdit();
  vm.actions.setDraft("A replacement objective");
  await vm.actions.save();
  expect(vm.presentation).toMatchObject({
    mode: "goal",
    editing: true,
    draft: "A replacement objective",
    error: "Goal changed elsewhere",
  });
});

test("snapshot replacement cancels a stale edit and terminal goals expose no lifecycle mutation", () => {
  const vm = createGoalViewModel(snapshot, "ready", async () => {});
  vm.actions.beginEdit();
  vm.actions.setDraft("Stale draft");
  vm.actions.sync(
    "conversation-a",
    { ...snapshot, revision: "goal:5", status: "complete", objective: "Done" },
    "ready",
  );
  expect(vm.presentation).toMatchObject({
    mode: "goal",
    objective: "Done",
    editing: false,
    canPause: false,
    canResume: false,
  });
});

test("a completed goal can be cleared before creating its replacement", async () => {
  const commands: unknown[] = [];
  const vm = createGoalViewModel({ ...snapshot, status: "complete" }, "ready", async (action) => {
    commands.push(action);
  });
  await vm.actions.clear();
  expect(commands).toEqual([{ kind: "clear", revision: "goal:4" }]);
});

test("loading or unavailable goal support renders no controls", () => {
  const vm = createGoalViewModel(undefined, "loading", async () => {});
  expect(vm.presentation).toBeUndefined();
  vm.actions.sync("conversation-a", null, "unavailable");
  expect(vm.presentation).toBeUndefined();
});

test("changing conversation identity cancels a create draft even when both goals are absent", () => {
  const vm = createGoalViewModel(null, "ready", async () => {}, "conversation-a");
  vm.actions.beginEdit();
  vm.actions.setDraft("Belongs to A");
  vm.actions.sync("conversation-b", null, "ready");
  expect(vm.presentation).toMatchObject({ mode: "create", editing: false, draft: "" });
});
