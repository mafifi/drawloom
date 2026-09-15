import { afterEach, expect, test } from "bun:test";
import { compileModule } from "svelte/compiler";
Bun.plugin({
  name: "orchestration-view-model-tests",
  setup(build) {
    build.onLoad({ filter: /orchestration-view-model\.svelte\.ts$/ }, async ({ path }) => ({
      contents: compileModule(
        new Bun.Transpiler({ loader: "ts" }).transformSync(await Bun.file(path).text()),
        { filename: path, generate: "client" },
      ).js.code,
      loader: "js",
    }));
  },
});
const { createOrchestrationViewModel } = await import("./orchestration-view-model.svelte.js");
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});
const owner = {
  installationId: "installation",
  title: "Public example",
  readiness: { status: "ready" as const },
};
const run = {
  runId: "run",
  identity: "request",
  workflow: "example",
  version: "1",
  status: "running",
  cancellationRequested: false,
  childRunIds: [],
  pendingInputs: ["review"],
  unresolvedEffects: [],
  steps: [],
  stepsTruncated: false,
};

for (const first of ["knowledge", "plugin"])
  test(`Activity retains both owners when ${first} is selected before discovery completes`, async () => {
    let releasePlugin!: (response: Response) => void,
      releaseKnowledge!: (response: Response) => void;
    const signals: AbortSignal[] = [];
    globalThis.fetch = (async (url, init) => {
      if (String(url).includes("/owners?")) {
        if (init?.signal) signals.push(init.signal);
        return new Promise<Response>((resolve) => {
          releasePlugin = resolve;
        });
      }
      if (String(url).includes("/knowledge-activity/owner?")) {
        if (init?.signal) signals.push(init.signal);
        return new Promise<Response>((resolve) => {
          releaseKnowledge = resolve;
        });
      }
      return Response.json({ runs: [] });
    }) as typeof fetch;
    const vm = createOrchestrationViewModel(),
      opening = vm.openActivity("project");
    const hostOwner = {
      title: "Knowledge maintenance",
      context: "Across all projects",
      readiness: { status: "ready" },
    };
    if (first === "knowledge") {
      releaseKnowledge(Response.json(hostOwner));
      for (let i = 0; i < 20 && !vm.knowledgeOwner; i++) await Promise.resolve();
      await vm.selectKnowledge();
      releasePlugin(Response.json([owner]));
    } else {
      releasePlugin(Response.json([owner]));
      for (let i = 0; i < 20 && !vm.owners.length; i++) await Promise.resolve();
      await vm.selectOwner(owner.installationId);
      releaseKnowledge(Response.json(hostOwner));
    }
    await opening;
    await vm.refresh();
    expect(vm.knowledgeOwner?.title).toBe("Knowledge maintenance");
    expect(vm.owners).toEqual([owner]);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
    expect(
      first === "knowledge" ? vm.knowledgeSelected : vm.installationId === owner.installationId,
    ).toBe(true);
  });

test("project navigation and close discard unfinished Activity discovery", async () => {
  const replies: Array<(response: Response) => void> = [];
  globalThis.fetch = Object.assign(
    async () =>
      new Promise<Response>((resolve) => {
        replies.push(resolve);
      }),
    { preconnect: original.preconnect },
  );
  const vm = createOrchestrationViewModel(),
    opening = vm.openActivity("old-project");
  vm.close();
  replies[0]!(Response.json([owner]));
  replies[1]!(
    Response.json({
      title: "Knowledge maintenance",
      context: "Across all projects",
      readiness: { status: "ready" },
    }),
  );
  await opening;
  expect(vm.knowledgeOwner).toBeUndefined();
  expect(vm.owners).toEqual([]);
});
test("late owner discovery cannot replace a newer project owner set", async () => {
  const replies: Array<(response: Response) => void> = [];
  globalThis.fetch = Object.assign(
    async () =>
      new Promise<Response>((resolve) => {
        replies.push(resolve);
      }),
    { preconnect: original.preconnect },
  );
  const vm = createOrchestrationViewModel(),
    old = vm.openActivity("old-project"),
    current = vm.openActivity("new-project");
  const host = {
    title: "Knowledge maintenance",
    context: "Across all projects",
    readiness: { status: "ready" },
  };
  replies[2]!(Response.json([{ ...owner, installationId: "new-plugin" }]));
  replies[3]!(Response.json(host));
  await current;
  replies[0]!(Response.json([owner]));
  replies[1]!(Response.json(host));
  await old;
  expect(vm.projectId).toBe("new-project");
  expect(vm.owners.map((item) => item.installationId)).toEqual(["new-plugin"]);
});

test("Activity discovers global maintenance without a project and cannot send host commands", async () => {
  const urls: string[] = [],
    methods: string[] = [];
  globalThis.fetch = (async (url, init) => {
    urls.push(String(url));
    methods.push(init?.method ?? "GET");
    if (String(url).includes("/owner?"))
      return Response.json({
        title: "Knowledge maintenance",
        context: "Across all projects",
        readiness: { status: "ready" },
      });
    if (String(url).includes("/steps?")) return Response.json({ steps: [], cursor: "steps-next" });
    return Response.json({
      runs: [{ ...run, displayStatus: "Needs attention", message: "The assessment is held." }],
      cursor: "next",
    });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel();
  await vm.openActivity("");
  expect(vm.knowledgeOwner?.title).toBe("Knowledge maintenance");
  await vm.selectKnowledge();
  expect(vm.runs).toHaveLength(1);
  await vm.cancel("run");
  await vm.respond("run", "review", "true");
  await vm.more();
  await vm.refresh();
  await vm.browseSteps("run");
  expect(methods.every((method) => method === "GET")).toBe(true);
  expect(urls.every((url) => !url.includes("projectId=") && !url.includes("installationId="))).toBe(
    true,
  );
  expect(urls.filter((url) => url.includes("cursor=next"))).toHaveLength(2);
  expect(vm.stepPage?.cursor).toBe("steps-next");
});
test("switching from maintenance to a plugin discards late host pages and restores only plugin commands", async () => {
  let release!: (response: Response) => void;
  const commands: unknown[] = [];
  globalThis.fetch = (async (url, init) => {
    if (init?.method === "POST") {
      commands.push(JSON.parse(String(init.body)));
      return Response.json({ ...run, cancellationRequested: true });
    }
    if (String(url).includes("/knowledge-activity/owner"))
      return Response.json({
        title: "Knowledge maintenance",
        context: "Across all projects",
        readiness: { status: "ready" },
      });
    if (String(url).includes("/knowledge-activity/runs"))
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    if (String(url).includes("/owners")) return Response.json([owner]);
    return Response.json({ runs: [run] });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel();
  await vm.openActivity("project");
  const reading = vm.selectKnowledge();
  await vm.selectOwner(owner.installationId);
  release(
    Response.json({
      runs: [{ ...run, runId: "host", displayStatus: "Needs attention", message: "" }],
    }),
  );
  await reading;
  expect(vm.knowledgeSelected).toBe(false);
  expect(vm.runs.map((item) => item.runId)).toEqual(["run"]);
  await vm.cancel("run");
  expect(commands).toEqual([
    { action: "cancel", projectId: "project", installationId: "installation", runId: "run" },
  ]);
});

test("lists by explicit project and retains failed-read feedback", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    return Response.json([owner]);
  }) as typeof fetch;
  const vm = createOrchestrationViewModel();
  await vm.open("project-a");
  expect(vm.owners).toEqual([owner]);
  expect(urls[0]).toContain("projectId=project-a");
  globalThis.fetch = Object.assign(async () => new Response(null, { status: 503 }), {
    preconnect: original.preconnect,
  });
  await vm.selectOwner(owner.installationId);
  expect(vm.error).toContain("unavailable");
  expect(vm.owners).toEqual([owner]);
});

test("navigation discards late pages and does not send cancellation", async () => {
  let release!: (response: Response) => void;
  const methods: string[] = [];
  globalThis.fetch = (async (url, init) => {
    methods.push(init?.method ?? "GET");
    if (String(url).includes("/owners")) return Response.json([owner]);
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel();
  await vm.open("a");
  const pending = vm.selectOwner(owner.installationId);
  await vm.open("b");
  release(Response.json({ runs: [run] }));
  await pending;
  expect(vm.runs).toEqual([]);
  expect(vm.projectId).toBe("b");
  expect(methods).not.toContain("POST");
});

test("input submission binds the exact displayed request and refreshes that run", async () => {
  const commands: unknown[] = [];
  globalThis.fetch = (async (url, init) => {
    if (init?.method === "POST") {
      commands.push(JSON.parse(String(init.body)));
      return Response.json({ ...run, status: "completed", pendingInputs: [] });
    }
    if (String(url).includes("/owners")) return Response.json([owner]);
    return Response.json({ runs: [run] });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel();
  await vm.open("a");
  await vm.selectOwner(owner.installationId);
  await vm.respond("run", "not-pending", "true");
  expect(commands).toHaveLength(0);
  await vm.respond("run", "review", "{bad");
  expect(commands).toHaveLength(0);
  await vm.respond("run", "review", '{"approved":true}');
  expect(commands).toEqual([
    {
      action: "respond",
      projectId: "a",
      installationId: "installation",
      runId: "run",
      requestId: "review",
      value: { approved: true },
    },
  ]);
  expect(vm.runs[0]?.status).toBe("completed");
});

test("a late command cannot overwrite another project and pending is action-specific", async () => {
  let release!: (response: Response) => void;
  let commandSignal: AbortSignal | null | undefined;
  globalThis.fetch = (async (url, init) => {
    if (init?.method === "POST") {
      commandSignal = init.signal;
      return new Promise<Response>((resolve, reject) => {
        release = resolve;
        init.signal?.addEventListener("abort", () => reject(Error("Request aborted")));
      });
    }
    if (String(url).includes("/owners")) return Response.json([owner]);
    return Response.json({ runs: [run] });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel();
  await vm.open("a");
  await vm.selectOwner(owner.installationId);
  const cancelling = vm.cancel("run");
  expect(vm.pendingAction).toEqual({ action: "cancel", runId: "run" });
  await vm.open("b");
  expect(commandSignal?.aborted ?? false).toBe(false);
  release(Response.json({ ...run, cancellationRequested: true }));
  await cancelling;
  expect(vm.runs).toEqual([]);
  expect(vm.pendingAction).toBeUndefined();
});

test("refresh stays on the chosen bounded page and does not overlap reads", async () => {
  const urls: string[] = [];
  let release!: (response: Response) => void;
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    if (String(url).includes("/owners")) return Response.json([owner]);
    if (!String(url).includes("cursor=")) return Response.json({ runs: [run], cursor: "page-two" });
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel();
  await vm.open("a");
  await vm.selectOwner(owner.installationId);
  const more = vm.more();
  expect(vm.loadingAction).toBe("more");
  await vm.refresh();
  expect(urls).toHaveLength(3);
  release(Response.json({ runs: [{ ...run, runId: "second" }] }));
  await more;
  const refresh = vm.refresh();
  expect(urls.at(-1)).toContain("cursor=page-two");
  release(Response.json({ runs: [{ ...run, runId: "second" }] }));
  await refresh;
  expect(vm.runs.map((item) => item.runId)).toEqual(["second"]);
});

test("cancellation interrupts a pending read and stale read cannot undo its result", async () => {
  let reads = 0,
    posts = 0;
  let release!: (response: Response) => void;
  globalThis.fetch = (async (url, init) => {
    if (init?.method === "POST") {
      posts++;
      return Response.json({ ...run, cancellationRequested: true });
    }
    if (String(url).includes("/owners")) return Response.json([owner]);
    if (++reads === 1) return Response.json({ runs: [run] });
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel();
  await vm.open("a");
  await vm.selectOwner(owner.installationId);
  const reading = vm.refresh();
  await vm.cancel("run");
  expect(posts).toBe(1);
  expect(vm.runs[0]?.cancellationRequested).toBe(true);
  release(Response.json({ runs: [run] }));
  await reading;
  expect(vm.runs[0]?.cancellationRequested).toBe(true);
  expect(vm.loading).toBe(false);
});

test("step browsing replaces bounded pages and ignores late pages after navigation", async () => {
  const urls: string[] = [];
  let release!: (response: Response) => void;
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    if (String(url).includes("/owners")) return Response.json([owner]);
    if (String(url).includes("/steps")) {
      if (String(url).includes("cursor="))
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return Response.json({
        steps: [{ stepId: "one", status: "completed", attempts: 1 }],
        cursor: "step-next",
      });
    }
    return Response.json({ runs: [{ ...run, stepsTruncated: true }] });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel();
  await vm.open("a");
  await vm.selectOwner(owner.installationId);
  await vm.browseSteps("run");
  expect(vm.stepPage?.steps.map((step) => step.stepId)).toEqual(["one"]);
  expect(urls.at(-1)).toContain("runId=run");
  expect(urls.at(-1)).toContain("limit=20");
  const more = vm.browseSteps("run", true);
  expect(vm.stepAction).toEqual({ runId: "run", kind: "more" });
  release(
    Response.json({
      steps: [{ stepId: "two", status: "completed", attempts: 2 }],
      cursor: "step-last",
    }),
  );
  await more;
  expect(vm.stepPage?.steps.map((step) => step.stepId)).toEqual(["two"]);
  const stale = vm.browseSteps("run", true);
  await vm.open("b");
  release(Response.json({ steps: [{ stepId: "stale", status: "completed", attempts: 1 }] }));
  await stale;
  expect(vm.stepPage).toBeUndefined();
});

test("server validation feedback is visible and leaves the input unresolved", async () => {
  globalThis.fetch = (async (url, init) => {
    if (init?.method === "POST")
      return Response.json(
        { error: "Input does not match this request. Correct the JSON and submit again." },
        { status: 400 },
      );
    if (String(url).includes("/owners")) return Response.json([owner]);
    return Response.json({ runs: [run] });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel();
  await vm.open("a");
  await vm.selectOwner(owner.installationId);
  await vm.respond("run", "review", "{}");
  expect(vm.error).toContain("Correct the JSON");
  expect(vm.runs[0]?.pendingInputs).toEqual(["review"]);
});

test("project summary reads bounded runs for each actual scoped owner without commands", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url, init) => {
    urls.push(String(url));
    if (String(url).includes("/owners"))
      return Response.json([owner, { ...owner, installationId: "second", title: "Second" }]);
    return Response.json({ runs: [run] });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel();
  await vm.openSummary("project-a");
  expect(vm.summaryRuns).toHaveLength(2);
  expect(
    urls
      .filter((url) => url.includes("/runs?"))
      .every((url) => url.includes("projectId=project-a") && url.includes("limit=3")),
  ).toBe(true);
});
