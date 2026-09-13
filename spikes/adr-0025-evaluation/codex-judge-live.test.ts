import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("live launcher prepares a bounded six-turn plan without initiating Codex", async () => {
  const parent = await mkdtemp(join(tmpdir(), "drawloom-judge-plan-"));
  const extraPath = join(parent, "private-cases.json");
  const out = join(parent, "out");
  await writeFile(extraPath, JSON.stringify([
    { id: "../../outside-root", revision: "1", input: { editingRequest: "Shorten it.", source: "Long source." }, suppliedOutput: "Short source.", expected: { quality: "pass", defect: "none" }, evidence: [] },
    { id: "private-passage-02", revision: "1", input: { editingRequest: "Keep the fact.", source: "Eight." }, suppliedOutput: "Nine.", expected: { quality: "fail", defect: "changed-fact" }, evidence: [] },
  ]));
  const networkLog = join(parent, "network.jsonl");
  execFileSync("node", [
    "--experimental-strip-types",
    "--import", join(process.cwd(), "spikes/adr-0025-evaluation/observer.mjs"),
    "spikes/adr-0025-evaluation/codex-judge-live.ts",
    "--prepare-only",
    "--out", out,
    "--cases", "passage-02,passage-03,passage-04,passage-05",
    "--extra-cases", extraPath,
    "--model", "gpt-5.6-terra",
    "--effort", "low",
  ], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DRAWLOOM_EVAL_NETWORK_LOG: networkLog } });
  const plan = JSON.parse(await readFile(join(out, "launch-plan.json"), "utf8"));
  expect(plan).toMatchObject({
    model: "gpt-5.6-terra",
    effort: "low",
    judgingTurns: 6,
    concurrency: 1,
    retries: 0,
    publicCasesRun: ["passage-02", "passage-03", "passage-04", "passage-05"],
    publicCasesUnrun: ["passage-01", "passage-06"],
    extraCases: ["../../outside-root", "private-passage-02"],
    runtimeDirectories: ["case-01", "case-02", "case-03", "case-04", "case-05", "case-06"],
    network: { braintrustUpload: false, codexAppServer: true },
  });
  expect(plan.runtimeDirectories.every((path: string) => !path.includes("..") && !path.includes("outside-root"))).toBe(true);
  expect(await readFile(networkLog, "utf8")).toContain('"kind":"summary"');
});

test("lost thread/start identity is retained as uncertain without resubmission", async () => {
  const parent = await mkdtemp(join(tmpdir(), "drawloom-judge-lost-identity-"));
  const fakeBin = join(parent, "bin");
  const fakeCodex = join(fakeBin, "codex");
  const requestLog = join(parent, "requests.log");
  const extraPath = join(parent, "case.json");
  const out = join(parent, "out");
  const networkLog = join(parent, "network.jsonl");
  await mkdir(fakeBin);
  await writeFile(fakeCodex, `#!/usr/bin/env node
const fs = require("node:fs");
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  while (buffer.includes("\\n")) {
    const split = buffer.indexOf("\\n");
    const line = buffer.slice(0, split);
    buffer = buffer.slice(split + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    fs.appendFileSync(process.env.FAKE_CODEX_REQUEST_LOG, message.method + "\\n");
    if (message.method === "initialize") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { userAgent: "codex/fake" } }) + "\\n");
    } else if (message.method === "thread/start") {
      process.exit(7);
    }
  }
});
`);
  await chmod(fakeCodex, 0o755);
  await writeFile(extraPath, JSON.stringify([{
    id: "private-passage-lost",
    revision: "1",
    input: { editingRequest: "Shorten it.", source: "Long source." },
    suppliedOutput: "Short source.",
    expected: { quality: "pass", defect: "none" },
    evidence: [],
  }]));
  expect(() => execFileSync("node", [
    "--experimental-strip-types",
    "--import", join(process.cwd(), "spikes/adr-0025-evaluation/observer.mjs"),
    "spikes/adr-0025-evaluation/codex-judge-live.ts",
    "--out", out,
    "--extra-cases", extraPath,
    "--model", "gpt-5.6-terra",
    "--effort", "low",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      DRAWLOOM_EVAL_NETWORK_LOG: networkLog,
      FAKE_CODEX_REQUEST_LOG: requestLog,
    },
  })).toThrow();
  const requests = (await readFile(requestLog, "utf8")).trim().split("\n");
  expect(requests.filter(method => method === "thread/start")).toHaveLength(1);
  const recovery = JSON.parse(await readFile(join(out, "recovery.json"), "utf8"));
  const cleanup = JSON.parse(await readFile(join(out, "cleanup.json"), "utf8"));
  expect(recovery.tasks[0]).toMatchObject({ caseId: "private-passage-lost", threadStartAttempted: true });
  expect(cleanup.cleanup[0]).toMatchObject({
    kind: "failed",
    caseId: "private-passage-lost",
    reason: expect.stringContaining("no thread identity"),
  });
  expect(existsSync(recovery.runtimeRoot)).toBe(true);
});
