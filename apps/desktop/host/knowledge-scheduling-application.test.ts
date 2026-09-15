import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "@drawloom/local-knowledge-runtime";
import { createDesktopApplication } from "./application.js";
import type { KnowledgeService } from "./knowledge-host.js";
import type { NightloomKnowledgeService } from "./knowledge-nightloom.js";
import {
  createKnowledgeActivityFixture,
  syntheticNightloomMethods,
} from "../tests/knowledge-activity-fixture.js";

test("ordinary application restore owns one consent-gated tick and stops it before manager and service close", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-scheduling-app-"));
  const fixture = createKnowledgeActivityFixture();
  const closed: string[] = [];
  fixture.manager.close = async () => {
    closed.push("manager");
  };
  let configuration = { ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION };
  let callback: (() => Promise<void>) | undefined;
  let release: (() => void) | undefined;
  let statusReadStarted: (() => void) | undefined;
  let hold: Promise<void> | undefined;
  const service: KnowledgeService & NightloomKnowledgeService = {
    ...syntheticNightloomMethods,
    async maintenanceStatus() {
      return { kind: "ok", pendingUnits: 50, checkpoint: "public" };
    },
    async status() {
      statusReadStarted?.();
      await hold;
      return {
        availability: "ready",
        message: "",
        configuration,
        models: [
          {
            id: "qwen3-embedding-0.6b-gguf",
            title: "Public fixture",
            licence: "Apache-2.0",
            source: "https://example.invalid/fixture",
            modelDirectory: "/public/model",
            runtimeDirectory: "/public/runtime",
            prerequisites: "Fixture",
            runtime: { package: "llama.cpp", version: "fixture", licence: "MIT" },
            weightsBytes: 1,
            runtimeBytes: 1,
            runtimeDownloadAvailable: false,
            state: "missing",
          },
        ],
        indexing: "unavailable",
        maintenance: {
          state: "idle",
          pendingUpdates: 50,
          message: "",
          automaticStartsToday: 0,
          automaticMillisecondsToday: 0,
        },
      };
    },
    async configure(value) {
      configuration = value;
      return this.status();
    },
    async search() {
      return { kind: "failure", code: "unavailable" };
    },
    async evidence() {
      return { kind: "failure", code: "unavailable" };
    },
    async export() {
      return { kind: "failure", code: "unavailable" };
    },
    async ingest() {
      return { kind: "denied" };
    },
    async download() {
      throw Error("No downloads");
    },
    async cancelDownload() {
      return this.status();
    },
    async close() {
      closed.push("service");
    },
  };
  const app = await createDesktopApplication(root, {
    knowledge: {
      service,
      scheduleNightloomTick(tick) {
        expect(callback).toBeUndefined();
        callback = tick;
        return () => {
          callback = undefined;
        };
      },
    },
    orchestration: { manager: async () => fixture.manager },
  });
  const fire = async () => {
    const tick = callback!;
    callback = undefined;
    await tick();
  };
  try {
    await app.restore();
    await app.restore();
    await fire();
    expect(fixture.calls.started).toBe(0);
    await app.knowledgeCommand({
      action: "configure",
      configuration: { ...configuration, automaticCuration: true },
    });
    await fire();
    expect(fixture.calls.started).toBe(1);
    configuration = { ...configuration, automaticCuration: false };
    await fire();
    expect(fixture.calls.started).toBe(1);
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const readStarted = new Promise<void>((resolve) => {
      statusReadStarted = resolve;
    });
    const pending = fire();
    await readStarted;
    const closing = app.close();
    await Promise.resolve();
    expect(closed).toEqual([]);
    release!();
    await pending;
    await closing;
    expect(closed).toEqual(["manager", "service"]);
    expect(callback).toBeUndefined();
  } finally {
    release?.();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
