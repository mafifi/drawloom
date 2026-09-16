import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeterministicLearningService } from "@drawloom/replacement-examples";
import { createDesktopApplication } from "./application.js";
import { DEFAULT_LOCAL_LEARNING_SCOPE } from "./learning-consent.js";

test("failed learning shutdown still closes history and concurrent closes do not repeat cleanup", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-shutdown-"));
  const service = createDeterministicLearningService({
    subject: { type: "user", id: "shutdown-test", properties: {} },
    authorizer: { authorize: async () => ({ decision: true }) },
  });
  const failure = new Error("Learning close failed");
  let closes = 0;
  const app = await createDesktopApplication(join(root, "data"), {
    knowledge: {
      declaration: DEFAULT_LOCAL_LEARNING_SCOPE,
      service: {
        ...service,
        close: async () => {
          closes++;
          await service.close();
          throw failure;
        },
      },
    },
  });
  try {
    const directory = join(root, "project");
    await mkdir(directory);
    await app.command({ kind: "add_project", directory });
    const created = await app.command({
      kind: "create_conversation",
      workbenchId: "text",
      provider: "synthetic",
    });
    await app.historyChanges(created.selectedId);
    const results = await Promise.allSettled([app.close(), app.close()]);
    // The database must be released despite an earlier provider failure.
    await expect(app.historyChanges(created.selectedId)).rejects.toThrow(/closed/i);
    expect(closes).toBe(1);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(AggregateError);
        expect(result.reason.errors).toContain(failure);
      }
    }
  } finally {
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
