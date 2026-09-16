import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import { relative, isAbsolute } from "node:path";
import { approvalPresentationConformance } from "@drawloom/agent/approval-conformance";
import { approvalConformanceFixture } from "../../apps/desktop/tests/approval-conformance-fixture.js";
import { localLearningConformance } from "../../apps/desktop/tests/learning-conformance-fixture.js";

const runtimeEntrypoint = await realpath(process.env.DRAWLOOM_CONFORMANCE_RUNTIME);
const runtimeRelative = relative(await realpath(process.cwd()), runtimeEntrypoint);
assert.ok(!runtimeRelative.startsWith("..") && !isAbsolute(runtimeRelative));
assert.ok(runtimeRelative.endsWith("@drawloom/local-knowledge-runtime/dist/sidecar.js"));
for (const mode of ["desktop", "inbox"])
  await approvalPresentationConformance((options) => approvalConformanceFixture(mode, { ...options, runtimeEntrypoint }));
await localLearningConformance(runtimeEntrypoint);
console.log("Installed desktop application: shared approval conformance passed via native RPC/default commands and inbox callbacks; default learning facade passed via installed Node worker");
