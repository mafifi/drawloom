import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { LOCAL_TEMPORAL_NODE_VERSION } from "../packages/orchestration/temporal-orchestration/src/runtime-version.ts";
import { text as readText } from "node:stream/consumers";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
/** Node signals child completion with an "exit" event; there is no awaitable `exited`. */
const exitCodeOf = async (child: ChildProcess): Promise<number> =>
  (await once(child, "exit"))[0] as number;

test("publication is callable only after the same-commit CI dependency succeeds", () => {
  const ci = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
  const publication = parse(readFileSync(".github/workflows/publishing.yml", "utf8"));
  expect(Object.keys(publication.on)).toEqual(["workflow_call"]);
  expect(ci.jobs.publish.needs).toEqual(["check", "learning-integration"]);
  expect(ci.jobs.publish.uses).toBe("./.github/workflows/publishing.yml");
  expect(ci.jobs.publish.if).toContain("github.ref == 'refs/heads/main'");
  expect(ci.jobs.publish.if).toContain("needs.check.outputs.publish == 'true'");
  expect(ci.jobs.check.outputs.publish).toBe("${{ steps.publication.outputs.publish }}");
  const ciRuns = ci.jobs.check.steps.map((step: { run?: string }) => step.run).filter(Boolean);
  expect(ciRuns.filter((run: string) => run === "pnpm run check:ci")).toHaveLength(1);
  const learningRuns = ci.jobs["learning-integration"].steps
    .map((step: { run?: string }) => step.run)
    .filter(Boolean);
  const learningNode = ci.jobs["learning-integration"].steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("actions/setup-node"),
  );
  expect(learningNode.with["node-version"]).toBe(LOCAL_TEMPORAL_NODE_VERSION);
  expect(learningRuns).toContain("pnpm run test:temporal");
  expect(learningRuns).toContain("pnpm run test:orchestration:learning");
  expect(
    learningRuns.some((run: string) => /check:ci|journal:build|journal:render/.test(run)),
  ).toBe(false);
  const publishRuns = publication.jobs.build.steps
    .map((step: { run?: string }) => step.run)
    .filter(Boolean);
  expect(publishRuns).not.toContain("pnpm run check:ci");
  expect(publishRuns).toContain("pnpm run journal:render:article");
  expect(publishRuns).toContain("pnpm run journal:build");
  expect(publication.jobs.deploy.needs).toBe("build");
  expect(
    publication.jobs.build.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("actions/upload-pages-artifact"),
    ).with.path,
  ).toBe("publishing/site/dist");
});

test("moving published content out of scope still selects publication to remove the old page", () => {
  const ci = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
  const scope = ci.jobs.check.steps.find((step: { id?: string }) => step.id === "publication").run;
  const root = mkdtempSync(join(tmpdir(), "drawloom-publishing-scope-"));
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  try {
    git("init", "-q");
    mkdirSync(join(root, "publishing"));
    mkdirSync(join(root, "docs"));
    mkdirSync(join(root, "scripts"));
    writeFileSync(
      join(root, "scripts/publishing-scope.ts"),
      readFileSync("scripts/publishing-scope.ts"),
    );
    writeFileSync(join(root, "publishing/article.md"), "A published article.\n");
    git("add", ".");
    git("commit", "-qm", "public fixture");
    const before = git("rev-parse", "HEAD");
    renameSync(join(root, "publishing/article.md"), join(root, "docs/article.md"));
    git("add", "-A");
    git("commit", "-qm", "remove publication");
    git("remote", "add", "origin", root);
    const output = join(root, "output");
    execFileSync("bash", ["-e", "-o", "pipefail", "-c", scope], {
      cwd: root,
      env: {
        ...process.env,
        BEFORE: before,
        GITHUB_SHA: git("rev-parse", "HEAD"),
        GITHUB_EVENT_NAME: "push",
        GITHUB_OUTPUT: output,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(readFileSync(output, "utf8")).toBe("publish=true\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.each([
  { paths: ["README.md", "knowledge/evidence/result.md"], expected: "false" },
  { paths: ["publishing/site/src/pages/index.astro"], expected: "true" },
  { paths: ["packages/plugins/plugins/src/package.ts"], expected: "true" },
  { paths: ["scripts/build-journal.ts", "pnpm-lock.yaml"], expected: "true" },
  { paths: [".github/workflows/ci.yml"], expected: "true" },
  { paths: ["scripts/publishing-scope.ts"], expected: "true" },
  { paths: ["unrelated/publishing/file.ts"], expected: "false" },
])("publication scope selects $paths -> $expected", async ({ paths, expected }) => {
  const child = spawn(process.execPath, ["scripts/publishing-scope.ts"]);
  child.stdin!.end(paths.join("\0"));
  const [exit, stdout, stderr] = await Promise.all([
    exitCodeOf(child),
    readText(child.stdout!),
    readText(child.stderr!),
  ]);
  expect(exit, stderr).toBe(0);
  expect(stdout).toBe(`publish=${expected}\n`);
});
