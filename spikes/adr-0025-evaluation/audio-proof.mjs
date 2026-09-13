import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runIsolated } from "./isolation.mjs";
const root = await mkdtemp(join(tmpdir(), "drawloom-audio-assessment-"));
const run = await runIsolated({
  root,
  args: [
    "--experimental-strip-types",
    join(dirname(fileURLToPath(import.meta.url)), "audio-run.ts"),
    root,
  ],
});
await writeFile(join(root, "process.log"), run.stdout + "\n" + run.stderr, {
  mode: 0o600,
});
let report;
try {
  report = JSON.parse(await readFile(join(root, "report.json"), "utf8"));
} catch {
  report = { missingReport: true };
}
const verified =
  run.code === 0 &&
  !run.timedOut &&
  !run.outputLimit &&
  report.checks &&
  Object.values(report.checks).every((v) => v === true);
await writeFile(
  join(root, "evidence.json"),
  JSON.stringify(
    {
      verified,
      code: run.code,
      timedOut: run.timedOut,
      network: run.network,
      report,
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    { root, verified, checks: report.checks, network: run.network },
    null,
    2,
  ),
);
if (!verified) process.exitCode = 1;
