import { expect, test } from "bun:test";
import { compileModule } from "svelte/compiler";
Bun.plugin({
  name: "local-learning-vm-tests",
  setup(build) {
    build.onLoad({ filter: /local-knowledge-setup-view-model\.svelte\.ts$/ }, async ({ path }) => ({
      contents: compileModule(
        new Bun.Transpiler({ loader: "ts" }).transformSync(await Bun.file(path).text()),
        { filename: path, generate: "client" },
      ).js.code,
      loader: "js",
    }));
  },
});
const { createLocalKnowledgeSetupViewModel } = await import(
  "./local-knowledge-setup-view-model.svelte.js"
);
export const localStatus = () => ({
  availability: "ready",
  message: "Text search ready",
  models: [
    {
      id: "qwen3-embedding-0.6b-gguf",
      title: "Qwen",
      licence: "Apache-2.0",
      source: "https://example.invalid/model",
      modelDirectory: "/fixture/model",
      runtimeDirectory: "/fixture/runtime",
      prerequisites: "Apple Silicon",
      runtime: { package: "llama.cpp", version: "fixture", licence: "MIT" },
      weightsBytes: 10,
      runtimeBytes: 10,
      runtimeDownloadAvailable: false,
      state: "missing",
    },
  ],
  indexing: "unavailable",
  configuration: {
    embeddingModel: "qwen3-embedding-0.6b-gguf" as const,
    assessmentModel: "gpt-5.6-terra",
    assessmentTimeoutMs: 300000,
    maxAutomaticStartsPerDay: 6,
    maxAutomaticMillisecondsPerDay: 1800000,
  },
});
test("absent local setup supplies no installer and does not infer a failed learning service", async () => {
  const vm = createLocalKnowledgeSetupViewModel({ send: async () => ({ kind: "unavailable" }) });
  await vm.open();
  expect(vm.presentation.status).toBeUndefined();
  expect(vm.presentation.error).toBe("");
});
test("cancel supersedes a delayed download response and leaves local settings usable", async () => {
  let release!: (value: unknown) => void;
  const commands: string[] = [];
  const vm = createLocalKnowledgeSetupViewModel({
    send: async (command) => {
      commands.push(command.action);
      if (command.action === "download")
        return new Promise((resolve) => {
          release = resolve;
        });
      return { ...localStatus(), message: "Cancelled" };
    },
  });
  const downloading = vm.actions.download("qwen3-embedding-0.6b-gguf");
  await vm.actions.download("qwen3-embedding-0.6b-gguf");
  await vm.actions.cancelDownload("qwen3-embedding-0.6b-gguf");
  release({ ...localStatus(), message: "Obsolete success" });
  await downloading;
  expect(commands).toEqual(["download", "cancel_download"]);
  expect(vm.presentation.status?.message).toBe("Cancelled");
  expect(vm.presentation.pendingAction).toBeUndefined();
});

test("cleanup refusal stays visible without a success acknowledgement", async () => {
  const vm = createLocalKnowledgeSetupViewModel({
    send: async () => {
      throw Error("provider refused");
    },
  });
  await vm.actions.cleanupObsolete();
  expect(vm.presentation.error).toContain("safely");
  expect(vm.presentation.notice).toBe("");
});

for (const action of ["configure", "cleanup"] as const) {
  test(`${action} failure survives healthy background status refresh`, async () => {
    let refuse = true;
    const vm = createLocalKnowledgeSetupViewModel({
      send: async (command) => {
        if (command.action !== "status" && refuse) throw Error("Command refused");
        return localStatus();
      },
    });
    const run = () =>
      action === "configure"
        ? vm.actions.configure(localStatus().configuration)
        : vm.actions.cleanupObsolete();
    await run();
    const failure = vm.presentation.error;
    expect(failure).not.toBe("");
    await vm.actions.refresh();
    expect(vm.presentation.error).toBe(failure);
    refuse = false;
    await run();
    expect(vm.presentation.error).toBe("");
  });
}
for (const action of ["configure", "download"] as const) {
  test(`${action} settlement fences status reads begun during the command`, async () => {
    let releaseCommand!: (value: unknown) => void;
    let releaseStatus!: (value: unknown) => void;
    const vm = createLocalKnowledgeSetupViewModel({
      send: (command) =>
        new Promise((resolve) => {
          if (command.action === "status") releaseStatus = resolve;
          else releaseCommand = resolve;
        }),
    });
    const command =
      action === "configure"
        ? vm.actions.configure(localStatus().configuration)
        : vm.actions.download("qwen3-embedding-0.6b-gguf");
    const read = vm.actions.refresh();
    releaseCommand({ ...localStatus(), message: "New settled state" });
    await command;
    releaseStatus({ ...localStatus(), message: "Older pending state" });
    await read;
    expect(vm.presentation.status?.message).toBe("New settled state");
    expect(vm.presentation.pendingAction).toBeUndefined();
    expect(vm.presentation.statusPending).toBe(false);
  });
}

test("confirmed obsolete cleanup submits consent without accepting arbitrary file targets", async () => {
  const commands: unknown[] = [];
  const vm = createLocalKnowledgeSetupViewModel({
    send: async (command) => {
      commands.push(command);
      return { ...localStatus(), obsoleteRuntimePresent: false };
    },
  });
  await vm.actions.cleanupObsolete();
  expect(commands).toEqual([{ action: "cleanup_obsolete", consent: true }]);
  expect(vm.presentation.pendingAction).toBeUndefined();
  expect(vm.presentation.notice).toContain("no longer present");
});

test("opening knowledge does not download models or start assessments", async () => {
  const commands: unknown[] = [];
  const vm = createLocalKnowledgeSetupViewModel({
    send: async (command) => {
      commands.push(command);
      throw Error("Not configured");
    },
  });
  await vm.open();
  expect(commands).toEqual([{ action: "status" }]);
  expect(vm.presentation.error).toContain("Local setup is unavailable");
});

test("status remains readable while a download request is pending", async () => {
  let release!: (value: unknown) => void;
  let reads = 0;
  const vm = createLocalKnowledgeSetupViewModel({
    send: async (command) => {
      if (command.action === "download")
        return new Promise((resolve) => {
          release = resolve;
        });
      reads++;
      return localStatus();
    },
  });
  const downloading = vm.actions.download("qwen3-embedding-0.6b-gguf");
  await vm.actions.refresh();
  expect(reads).toBe(1);
  release(localStatus());
  await downloading;
});

test("download suppresses duplicates while cancel remains available and a settled cancellation can retry", async () => {
  const commands: unknown[] = [];
  let finishDownload!: (value: unknown) => void;
  let attempts = 0;
  const withModelState = (state: "cancelled" | "ready") => ({
    ...localStatus(),
    models: localStatus().models.map((model) => ({ ...model, state })),
  });
  const vm = createLocalKnowledgeSetupViewModel({
    send: async (command) => {
      commands.push(command);
      if (command.action === "download" && attempts++ === 0)
        return new Promise((resolve) => {
          finishDownload = resolve;
        });
      if (command.action === "cancel_download") return withModelState("cancelled");
      return withModelState("ready");
    },
  });
  const first = vm.actions.download("qwen3-embedding-0.6b-gguf");
  await vm.actions.download("qwen3-embedding-0.6b-gguf");
  expect(
    commands.filter((command) => (command as { action: string }).action === "download"),
  ).toHaveLength(1);
  const cancelling = vm.actions.cancelDownload("qwen3-embedding-0.6b-gguf");
  finishDownload(withModelState("cancelled"));
  await Promise.all([first, cancelling]);
  expect(vm.presentation.status?.models[0]?.state).toBe("cancelled");
  await vm.actions.download("qwen3-embedding-0.6b-gguf");
  expect(vm.presentation.status?.models[0]?.state).toBe("ready");
  expect(commands.map((command) => (command as { action: string }).action)).toEqual([
    "download",
    "cancel_download",
    "download",
  ]);
});

test("current-file download bytes pass through presentation without being replaced by total weights", async () => {
  const progress = {
    ...localStatus(),
    models: localStatus().models.map((model) => ({
      ...model,
      state: "downloading" as const,
      message: "Downloading tokenizer.json",
      receivedBytes: 2_097_152,
      expectedBytes: 8_388_608,
    })),
  };
  const vm = createLocalKnowledgeSetupViewModel({ send: async () => progress });
  await vm.open();
  expect(vm.presentation.status?.models[0]).toMatchObject({
    receivedBytes: 2_097_152,
    expectedBytes: 8_388_608,
    runtimeBytes: 10,
    runtimeDownloadAvailable: false,
    weightsBytes: 10,
    message: "Downloading tokenizer.json",
  });
});
