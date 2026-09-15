import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopApplication } from "../host/application.js";
import { createLearningApplicationFixture } from "./learning-journey-lifecycle.js";

function ownedPids(root: string) {
  return execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line.includes("sidecar.js") && line.includes(root))
    .map((line) => Number(line.trim().split(/\s+/, 1)[0]));
}
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("rejected desktop construction closes its already running knowledge sidecar", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-learning-setup-rejection-"));
  const fixture = createLearningApplicationFixture();
  let emergencyClose: (() => Promise<void>) | undefined;
  let pids: number[] = [];
  try {
    await mkdir(join(root, "data/history.sqlite"), { recursive: true });
    await expect(
      fixture.open({ root: join(root, "knowledge"), workingDirectory: root }, async (client) => {
        emergencyClose = () => client.close();
        await client.status();
        pids = ownedPids(root);
        expect(pids).toHaveLength(1);
        return createDesktopApplication(join(root, "data"), { knowledge: { service: client } });
      }),
    ).rejects.toThrow("Conversation history database could not be opened");
    expect(pids.some(alive)).toBe(false);
    await fixture.close();
  } finally {
    await emergencyClose?.();
    await rm(root, { recursive: true, force: true });
  }
});

test("fixture cleanup rejects while its owned client cannot close and retains the handle for recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-learning-cleanup-rejection-"));
  const fixture = createLearningApplicationFixture();
  let permitClose = false;
  let emergencyClose: (() => Promise<void>) | undefined;
  let pids: number[] = [];
  try {
    await expect(
      fixture.open({ root: join(root, "knowledge"), workingDirectory: root }, async (client) => {
        emergencyClose = client.close.bind(client);
        client.close = async () => {
          if (!permitClose) throw Error("Controlled cleanup failure");
          await emergencyClose!();
        };
        await client.status();
        pids = ownedPids(root);
        expect(pids).toHaveLength(1);
        throw Error("Controlled application construction failure");
      }),
    ).rejects.toThrow();
    await expect(fixture.close()).rejects.toThrow();
    expect(pids.some(alive)).toBe(true);
    permitClose = true;
    await fixture.close();
    expect(pids.some(alive)).toBe(false);
  } finally {
    await emergencyClose?.();
    await rm(root, { recursive: true, force: true });
  }
});
