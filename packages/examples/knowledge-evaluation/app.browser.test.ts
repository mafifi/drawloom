import { afterEach, expect, test } from "bun:test";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type Server } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";
import {
  DefinitionSummarySchema,
  EvaluationCaseSchema,
  EvaluationResultRecordSchema,
  EvaluationResultViewSchema,
  EvaluationRunSchema,
  ResultSummarySchema,
  ScorerCheckpointSchema,
} from "@drawloom/evaluation";

const temporary: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function chromiumExecutable(): Promise<string | undefined> {
  const configured = process.env.DRAWLOOM_CHROMIUM_EXECUTABLE;
  if (configured && (await exists(configured))) return configured;
  const preferred = chromium.executablePath();
  if (await exists(preferred)) return preferred;
  const cache =
    process.platform === "darwin"
      ? join(homedir(), "Library", "Caches", "ms-playwright")
      : join(homedir(), ".cache", "ms-playwright");
  if (!(await exists(cache))) return undefined;
  const releases = (await readdir(cache))
    .filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort()
    .reverse();
  for (const release of releases) {
    const platform =
      process.platform === "darwin"
        ? "chrome-headless-shell-mac-arm64"
        : "chrome-headless-shell-linux";
    const candidate = join(
      cache,
      release,
      platform,
      process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell",
    );
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

test.skipIf(process.env.DRAWLOOM_BROWSER_TEST !== "1")(
  "mounted workbench replaces loading state after stable-presentation async notifications",
  async () => {
    const executablePath = await chromiumExecutable();
    if (!executablePath)
      throw new Error(
        "A local Chromium executable is required for the mounted Svelte regression test",
      );
    const root = await mkdtemp(join(import.meta.dir, ".app-browser-"));
    temporary.push(root);
    await writeFile(
      join(root, "index.html"),
      '<!doctype html><html><body><script type="module" src="/main.ts"></script></body></html>',
    );
    await writeFile(
      join(root, "main.ts"),
      `
    import "@drawloom/ui/styles.css";
    import { mount } from "svelte";
    import { createEvaluationViewModel } from "@drawloom/evaluation-presentation";
    import AppView from ${JSON.stringify(join(import.meta.dir, "src", "app", "App.svelte"))};

    let release;
    const loaded = new Promise(resolve => { release = resolve; });
    globalThis.releaseEvaluation = release;
    const client = {
      readiness: async () => { await loaded; return { status: "ready" }; },
      listDefinitions: async () => { await loaded; return {
        items: [{ ref: { id: "mounted-check", revision: "r1" }, name: "Mounted saved check", mode: "assess_existing", caseCount: 1, scorerCount: 1 }],
        hasMore: false,
      }; },
      listRuns: async () => { await loaded; return { items: [], hasMore: false }; },
    };
    const viewModel = createEvaluationViewModel({ client });
    mount(AppView, { target: document.body, props: { viewModel } });
  `,
    );
    await build({
      configFile: false,
      root,
      cacheDir: join(root, ".vite-cache"),
      plugins: [tailwindcss(), svelte()],
      logLevel: "silent",
      build: { outDir: "dist" },
    });
    const server = createHttpServer(async (request, response) => {
      try {
        const pathname = request.url === "/" ? "/index.html" : (request.url ?? "/index.html");
        const file = join(root, "dist", pathname.slice(1));
        response.setHeader(
          "content-type",
          pathname.endsWith(".js")
            ? "text/javascript"
            : pathname.endsWith(".css")
              ? "text/css"
              : "text/html",
        );
        response.end(await readFile(file));
      } catch {
        response.statusCode = 404;
        response.end();
      }
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Mounted Svelte regression server did not expose a local URL");
    const url = `http://127.0.0.1:${address.port}`;

    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const page = await browser.newPage();
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto(url);
      const loading = page.getByText("Loading saved checks", { exact: true });
      await loading.waitFor();
      await page.evaluate(() =>
        (globalThis as typeof globalThis & { releaseEvaluation(): void }).releaseEvaluation(),
      );
      const savedCheck = page.getByRole("button", { name: /Mounted saved check/ });
      await savedCheck.waitFor({ timeout: 3_000 });
      expect(await loading.count()).toBe(0);
      expect(await page.getByText("No saved runs are available.").count()).toBe(1);
      await savedCheck.click();
      expect(await page.getByRole("button", { name: "Start check" }).isEnabled()).toBe(true);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
        "rgb(255, 255, 255)",
      );
      await page.emulateMedia({ colorScheme: "dark" });
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
        "rgb(24, 24, 24)",
      );
    } finally {
      await browser.close();
    }
  },
  30_000,
);

test.skipIf(process.env.DRAWLOOM_BROWSER_TEST !== "1")(
  "mounted workbench renders every contract-valid versioned finding and duplicate evidence identity",
  async () => {
    const executablePath = await chromiumExecutable();
    if (!executablePath)
      throw new Error(
        "A local Chromium executable is required for the mounted Svelte regression test",
      );

    const references = [
      { id: "source", source: "fixture", uri: "asset://source/one", revision: "r1" },
      { id: "source", source: "fixture", uri: "asset://source/two", revision: "r2" },
    ];
    const selectedCase = EvaluationCaseSchema.parse({
      id: "case",
      revision: "r1",
      input: { prompt: "same" },
      expected: { answer: "same" },
      references,
    });
    const run = EvaluationRunSchema.parse({
      schemaVersion: 1,
      id: "run",
      requestId: "request",
      definition: { id: "check", revision: "r1" },
      settings: { repetitions: 1, concurrency: 1 },
      createdAtMs: 1,
    });
    const result = EvaluationResultRecordSchema.parse({
      schemaVersion: 1,
      id: "result",
      runId: run.id,
      caseId: selectedCase.id,
      caseRevision: selectedCase.revision,
      trial: 0,
      status: "completed",
      scorerInvocationIds: ["score-a", "score-b", "score-c"],
      startedAtMs: 1,
      completedAtMs: 2,
    });
    const summary = ResultSummarySchema.parse({ ...result, findingCount: 3 });
    const checkpoints = [
      ScorerCheckpointSchema.parse({
        schemaVersion: 1,
        invocationId: "score-a",
        runId: run.id,
        caseId: selectedCase.id,
        caseRevision: selectedCase.revision,
        trial: 0,
        scorer: { id: "criterion", revision: "r:1" },
        outcome: "succeeded",
        findings: [
          { id: "shared", name: "Revision r:1 shared", outcome: "scored", score: 1, references },
        ],
        startedAtMs: 1,
        completedAtMs: 2,
      }),
      ScorerCheckpointSchema.parse({
        schemaVersion: 1,
        invocationId: "score-b",
        runId: run.id,
        caseId: selectedCase.id,
        caseRevision: selectedCase.revision,
        trial: 0,
        scorer: { id: "criterion", revision: "r:2" },
        outcome: "succeeded",
        findings: [
          {
            id: "shared",
            name: "Revision r:2 shared",
            outcome: "scored",
            score: 1,
            references: [],
          },
        ],
        startedAtMs: 1,
        completedAtMs: 2,
      }),
      ScorerCheckpointSchema.parse({
        schemaVersion: 1,
        invocationId: "score-c",
        runId: run.id,
        caseId: selectedCase.id,
        caseRevision: selectedCase.revision,
        trial: 0,
        scorer: { id: "criterion", revision: "r" },
        outcome: "succeeded",
        findings: [
          {
            id: "2:shared",
            name: "Delimiter-safe finding",
            outcome: "scored",
            score: 1,
            references: [],
          },
        ],
        startedAtMs: 1,
        completedAtMs: 2,
      }),
    ];
    const detail = EvaluationResultViewSchema.parse({
      result,
      scorers: checkpoints,
      findings: checkpoints.flatMap((checkpoint) => checkpoint.findings),
    });
    const definition = DefinitionSummarySchema.parse({
      ref: run.definition,
      name: "Versioned check",
      mode: "assess_existing",
      caseCount: 1,
      scorerCount: 3,
    });
    const comparison = {
      kind: "comparable",
      findings: checkpoints.map((checkpoint) => {
        const finding = checkpoint.findings[0];
        if (!finding)
          throw new Error("Mounted comparison fixture requires one finding per scorer checkpoint");
        return {
          scorer: checkpoint.scorer,
          findingId: finding.id,
          name: finding.name,
          current: { outcome: "scored", score: 1 },
          baseline: { outcome: "scored", score: 0 },
        };
      }),
    };

    const root = await mkdtemp(join(import.meta.dir, ".app-browser-"));
    temporary.push(root);
    await writeFile(
      join(root, "index.html"),
      '<!doctype html><html><body><script type="module" src="/main.ts"></script></body></html>',
    );
    await writeFile(
      join(root, "main.ts"),
      `
    import "@drawloom/ui/styles.css";
    import { mount } from "svelte";
    import { evaluationCopy } from "@drawloom/evaluation-presentation";
    import { EvaluationWorkbench } from "@drawloom/ui";

    const fixture = ${JSON.stringify({ definition, run, summary, selectedCase, detail, comparison })};
    const presentation = {
      copy: evaluationCopy,
      definitions: [fixture.definition], runs: [fixture.run], results: [fixture.summary],
      selectedDefinition: fixture.definition, selectedRun: fixture.run, selectedResult: fixture.summary,
      selectedHeader: undefined, selectedCase: fixture.selectedCase, startReadiness: { status: "ready" },
      execution: { kind: "completed", evaluationRunId: fixture.run.id, orchestrationRunId: "orchestration" },
      detail: fixture.detail, selectedTarget: undefined, selectedScorer: undefined, baseline: undefined,
      baselineResultId: "baseline", comparison: fixture.comparison, feedback: [],
      feedbackDraft: { attribution: "", correction: "" },
      definitionsLoading: false, runsLoading: false, resultLoading: false, targetLoading: false,
      scorerLoading: false, feedbackLoading: false, startPending: false, cancelPending: false,
      feedbackPending: false, hasMoreDefinitions: false, hasMoreRuns: false, hasMoreResults: false,
      error: "", detailError: "", feedbackError: "",
    };
    const actions = new Proxy({}, { get: () => () => {} });
    mount(EvaluationWorkbench, { target: document.body, props: { presentation, actions } });
  `,
    );
    await build({
      configFile: false,
      root,
      cacheDir: join(root, ".vite-cache"),
      plugins: [tailwindcss(), svelte({ compilerOptions: { dev: true } })],
      logLevel: "silent",
      build: { outDir: "dist" },
    });
    const server = createHttpServer(async (request, response) => {
      try {
        const pathname = request.url === "/" ? "/index.html" : (request.url ?? "/index.html");
        const file = join(root, "dist", pathname.slice(1));
        response.setHeader(
          "content-type",
          pathname.endsWith(".js")
            ? "text/javascript"
            : pathname.endsWith(".css")
              ? "text/css"
              : "text/html",
        );
        response.end(await readFile(file));
      } catch {
        response.statusCode = 404;
        response.end();
      }
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Mounted Svelte regression server did not expose a local URL");

    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.waitForTimeout(100);
      expect(errors).toEqual([]);
      expect(await page.getByText("Revision r:1 shared", { exact: true }).count()).toBe(1);
      expect(await page.getByText("Revision r:2 shared", { exact: true }).count()).toBe(1);
      expect(await page.getByText("Delimiter-safe finding", { exact: true }).count()).toBe(1);
      expect(await page.getByText("Revision r:1 shared: scored · 1", { exact: true }).count()).toBe(
        1,
      );
      expect(await page.getByText("Revision r:2 shared: scored · 1", { exact: true }).count()).toBe(
        1,
      );
      expect(
        await page.getByText("Delimiter-safe finding: scored · 1", { exact: true }).count(),
      ).toBe(1);
      expect(
        await page.getByText("fixture: asset://source/one @ r1", { exact: true }).count(),
      ).toBeGreaterThan(0);
      expect(
        await page.getByText("fixture: asset://source/two @ r2", { exact: true }).count(),
      ).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  },
  30_000,
);
