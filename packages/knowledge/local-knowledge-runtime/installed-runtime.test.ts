import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createManagedLocalKnowledgeClient } from "./src/client.js";
import { createDesktopAuthorization } from "../../../apps/desktop/host/authorization.js";
import { stageKnowledgeRuntime } from "../../../scripts/stage-knowledge-runtime.js";

test("installed worker entrypoint uses the same host authority without checkout links", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "drawloom-installed-authority-"));
  const authority = createDesktopAuthorization({
    authorize: async (request) => ({ decision: request.action.name === "knowledge.maintain" }),
  });
  const destination = join(temporary, "knowledge");
  let client: ReturnType<typeof createManagedLocalKnowledgeClient> | undefined;
  try {
    await stageKnowledgeRuntime({
      repositoryRoot: resolve(import.meta.dirname, "../../.."),
      destination,
    });
    client = createManagedLocalKnowledgeClient({
      root: join(temporary, "data"),
      workingDirectory: temporary,
      authority: authority.knowledge(),
      runtimeEntrypoint: join(
        destination,
        "node_modules/@drawloom/local-knowledge-runtime/dist/sidecar.js",
      ),
    });
    expect((await client.status()).availability).toBe("ready");
    expect(
      await client.get({ type: "source", origin: "synthetic", id: "absent", revision: "r1" }),
    ).toEqual({ kind: "denied" });
    expect(await client.warmup()).toEqual({ kind: "unavailable" });
  } finally {
    await client?.close();
    authority.shutdown();
    await rm(temporary, { recursive: true, force: true });
  }
}, 60_000);
