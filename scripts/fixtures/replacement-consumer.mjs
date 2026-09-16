import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, isAbsolute } from "node:path";
import { contextAssemblyConformance } from "@drawloom/context/assembly-conformance";
import { createDefaultContextAssembler } from "@drawloom/default-context";
import {
  createDeterministicLearningService,
  createSectionedContextAssembler,
} from "@drawloom/replacement-examples";
import { learningConformance } from "@drawloom/knowledge/learning-conformance";
import { authorizationConformance } from "@drawloom/authorization/conformance";
import { createLocalAuthorizer } from "@drawloom/local-authorization";
import { createDeterministicAuthorizer } from "@drawloom/deterministic-authorization";
import { createAuthorizationScheduler } from "@drawloom/authorization-scheduler";

for (const name of [
  "@drawloom/context/assembly-conformance",
  "@drawloom/default-context",
  "@drawloom/replacement-examples",
  "@drawloom/knowledge/learning-conformance",
  "@drawloom/authorization/conformance",
  "@drawloom/local-authorization",
  "@drawloom/deterministic-authorization",
  "@drawloom/authorization-scheduler",
  "@drawloom/agent/approval-conformance",
]) {
  const path = await realpath(fileURLToPath(import.meta.resolve(name)));
  const within = relative(await realpath(process.cwd()), path);
  assert.ok(!within.startsWith("..") && !isAbsolute(within), `${name} escaped disposable installed consumer`);
  assert.ok(path.includes("/dist/"), `${name} did not load a built export`);
}
await contextAssemblyConformance(createDefaultContextAssembler);
await contextAssemblyConformance(createSectionedContextAssembler);
const contribution = {
  operation: "upsert",
  expectedRevision: null,
  links: [],
  record: {
    ref: { type: "source", origin: "packed-example", id: "note", revision: "1" },
    status: "active",
    body: "Packed blue notebooks are available.",
    confidence: { value: "observed", source: "synthetic" },
    provenance: { producer: { type: "example", id: "packed-fixture" }, inputs: [] },
  },
};
const learning = createDeterministicLearningService({
  subject: { type: "person", id: "packed-reader", properties: {} },
  authorizer: { async authorize() { return { decision: true }; } },
});
try {
  await learningConformance({
    service: learning,
    contribution,
    search: { query: "notebooks", mode: "lexical", limit: 10, maxBytes: 8192 },
    evidence: { root: contribution.record.ref, direction: "forward", maxDepth: 2,
      maxRecords: 10, maxLinks: 10, maxBytes: 8192 },
    export: { refs: [contribution.record.ref], format: "okf", maxBytes: 8192 },
  });
} finally {
  await learning.close();
}
const allow = { subject: { type: "person", id: "one", properties: { projects: ["public"] } },
  action: { name: "read" }, resource: { type: "record", id: "one", properties: { project: "public" } } };
const deny = { ...allow, resource: { ...allow.resource, properties: { project: "other" } } };
const unavailable = { ...allow, context: { unavailable: true } };
for (const kind of ["local", "deterministic"]) {
  let revoked = false;
  const deterministic = createDeterministicAuthorizer();
  const selected = kind === "deterministic" ? deterministic : createLocalAuthorizer((request) =>
    request.context?.unavailable ? { kind: "failure", code: "unavailable" } :
      { decision: !revoked && request.resource.properties.project === "public" });
  const scheduler = createAuthorizationScheduler(selected);
  try {
    await authorizationConformance({ authorizer: scheduler.foreground, allow, deny, unavailable,
      revoke() { revoked = true; deterministic.revoke("one"); } });
  } finally { scheduler.shutdown(); }
}
console.log("Packed Node replacements: context, contrasting learning, authorization passed; approval public dist export resolved (application conformance runs separately under Bun)");
