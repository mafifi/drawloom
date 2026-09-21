import { expect, test } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeterministicLearningService } from "@drawloom/replacement-examples";
import { createDesktopApplication } from "./application.js";
import { DEFAULT_LOCAL_LEARNING_SCOPE } from "./learning-consent.js";

test("agent close failure is reported and retained across concurrent desktop closes", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-agent-shutdown-"));
  let closes = 0;
  const service = createDeterministicLearningService({
    subject: { type: "user", id: "shutdown-test", properties: {} },
    authorizer: { authorize: async () => ({ decision: true }) },
  });
  const app = await createDesktopApplication(join(root, "data"), {
    knowledge: { service, declaration: DEFAULT_LOCAL_LEARNING_SCOPE },
    codex: {
      connect: async (cwd) => ({
        request: async (method) => {
          if (method === "initialize") return { userAgent: "codex/0.153.4" };
          if (method === "model/list") return { data: [], nextCursor: null };
          if (method === "thread/start")
            return { thread: { id: "shutdown-native", cwd }, approvalsReviewer: "user" };
          if (method === "thread/read") return { thread: { cwd } };
          if (method === "thread/turns/list") return { data: [], nextCursor: null };
          if (method === "turn/start") return { turn: { id: "shutdown-turn" } };
          return {};
        },
        notify() {},
        respond() {},
        subscribe() {
          return () => {};
        },
        close: async () => {
          closes++;
          throw Error("Transport close failed");
        },
      }),
    },
  });
  try {
    const directory = join(root, "project");
    await mkdir(directory);
    await app.command({ kind: "add_project", directory });
    const created = await app.command({
      kind: "create_conversation",
      workbenchId: "text",
      provider: "codex",
    });
    await app.command({
      kind: "send",
      conversationId: created.selectedId,
      text: "Shutdown fixture",
      attachmentKeys: [],
      contextArtifactIds: [],
    });
    const first = app.close();
    const second = app.close();
    expect(second).toBe(first);
    const results = await Promise.allSettled([first, second]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(closes).toBe(1);
    await expect(app.historyChanges(created.selectedId)).rejects.toThrow(/closed/i);
    await expect(app.close()).rejects.toBeInstanceOf(AggregateError);
    expect(closes).toBe(1);
  } finally {
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("closed desktop rejects project mutations and restoration", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-closed-"));
  const app = await createDesktopApplication(join(root, "data"));
  try {
    const directory = join(root, "project");
    await mkdir(directory);
    await app.close();
    await expect(app.command({ kind: "add_project", directory })).rejects.toThrow(
      /closed|closing/i,
    );
    await expect(app.restore()).rejects.toThrow(/closed|closing/i);
    await expect(app.assets.put(new Uint8Array([65]), "text/plain")).rejects.toThrow(
      /closed|closing/i,
    );
    await expect(app.installations.add(directory)).rejects.toThrow(/closed|closing/i);
  } finally {
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("shutdown during native session startup closes the late transport without submitting", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-startup-shutdown-"));
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let closes = 0;
  let submissions = 0;
  const app = await createDesktopApplication(join(root, "data"), {
    codex: {
      connect: async (cwd) => {
        enter();
        await blocked;
        return {
          request: async (method) => {
            if (method === "initialize") return { userAgent: "codex/0.153.4" };
            if (method === "model/list") return { data: [], nextCursor: null };
            if (method === "thread/start")
              return { thread: { id: "late-native", cwd }, approvalsReviewer: "user" };
            if (method === "thread/read") return { thread: { cwd } };
            if (method === "thread/turns/list") return { data: [], nextCursor: null };
            if (method === "turn/start") {
              submissions++;
              return { turn: { id: "late-turn" } };
            }
            return {};
          },
          notify() {},
          respond() {},
          subscribe() {
            return () => {};
          },
          close: async () => {
            closes++;
          },
        };
      },
    },
  });
  try {
    const directory = join(root, "project");
    await mkdir(directory);
    await app.command({ kind: "add_project", directory });
    const conversation = await app.command({
      kind: "create_conversation",
      workbenchId: "text",
      provider: "codex",
    });
    const sending = app
      .command({
        kind: "send",
        conversationId: conversation.selectedId,
        text: "Never submit",
        attachmentKeys: [],
        contextArtifactIds: [],
      })
      .catch((error: unknown) => error);
    await entered;
    const closing = app.close();
    release();
    expect(await sending).toBeInstanceOf(Error);
    await closing;
    expect(submissions).toBe(0);
    expect(closes).toBe(1);
  } finally {
    release();
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("shutdown cancels admitted local setup and waits before closing learning", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-setup-shutdown-"));
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signal: AbortSignal | undefined;
  const calls: string[] = [];
  const service = createDeterministicLearningService({
    subject: { type: "user", id: "setup", properties: {} },
    authorizer: { authorize: async () => ({ decision: true }) },
  });
  const unexpected = async (): Promise<never> => {
    throw Error("Unexpected setup call");
  };
  const app = await createDesktopApplication(root, {
    knowledge: {
      declaration: DEFAULT_LOCAL_LEARNING_SCOPE,
      service: {
        ...service,
        close: async () => {
          calls.push("learning-close");
          await service.close();
        },
      },
      setup: {
        status: unexpected,
        configure: unexpected,
        cancelDownload: unexpected,
        cleanupObsoleteRuntime: unexpected,
        download: async (_model, operation) => {
          signal = operation?.signal;
          calls.push("download-start");
          enter();
          await blocked;
          calls.push("download-finish");
          throw Error("Download cancelled");
        },
      },
    },
  });
  try {
    const downloading = app
      .localLearningSetupCommand({
        action: "download",
        model: "qwen3-embedding-0.6b-gguf",
        consent: true,
      })
      .catch((error: unknown) => error);
    await Promise.race([
      entered,
      downloading.then((error) => {
        throw error;
      }),
    ]);
    const closing = app.close();
    const aborted = signal?.aborted;
    release();
    await downloading;
    await closing;
    expect(aborted).toBe(true);
    expect(calls).toEqual(["download-start", "download-finish", "learning-close"]);
  } finally {
    release();
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

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
