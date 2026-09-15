/** Evaluation-only receipt and resource guard for bounded GGUF scale runs. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, statfs, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

const GiB = 1024 ** 3;
const maximumElapsedMs = 3 * 60 * 60 * 1000;
const stalledMs = 15 * 60 * 1000;

export interface ScaleRunIdentity {
  readonly corpus: { readonly version: string; readonly sha256: string; readonly records: number };
  readonly runtime: { readonly sha256: string };
  readonly model: { readonly sha256: string };
  readonly configuration: { readonly id: string; readonly fingerprint: string };
}
export interface ScaleRunResources {
  readonly diskFreeBytes: number;
  readonly availableMemoryBytes: number;
  readonly memoryPressure: "green" | "yellow" | "red";
  readonly swapUsedBytes: number;
  readonly childRssBytes: number;
}

export async function readScaleRunResources(
  root: string,
  childPid?: number,
): Promise<ScaleRunResources> {
  const disk = await statfs(root);
  const vm = execFileSync("/usr/bin/vm_stat", [], { encoding: "utf8" });
  const pageSize = Number(vm.match(/page size of (\d+) bytes/)?.[1] ?? 4096);
  const pages = (name: string) => Number(vm.match(new RegExp(`${name}:\\s+(\\d+)\\.`))?.[1] ?? 0);
  const availableMemoryBytes =
    (pages("Pages free") + pages("Pages inactive") + pages("Pages speculative")) * pageSize;
  const pressureLevel = Number(
    execFileSync("/usr/sbin/sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], {
      encoding: "utf8",
    }).trim(),
  );
  const swap = execFileSync("/usr/sbin/sysctl", ["-n", "vm.swapusage"], { encoding: "utf8" });
  const usedMiB = Number(swap.match(/used = ([0-9.]+)M/)?.[1] ?? 0);
  let childRssBytes = 0;
  if (childPid)
    try {
      childRssBytes =
        Number(
          execFileSync("/bin/ps", ["-o", "rss=", "-p", String(childPid)], {
            encoding: "utf8",
          }).trim(),
        ) * 1024;
    } catch {
      /* Child exit is handled by the worker. */
    }
  return {
    diskFreeBytes: Number(disk.bavail) * Number(disk.bsize),
    availableMemoryBytes,
    memoryPressure: pressureLevel >= 4 ? "red" : pressureLevel >= 2 ? "yellow" : "green",
    swapUsedBytes: usedMiB * 1024 ** 2,
    childRssBytes,
  };
}
type SegmentStatus = "running" | "cancelled" | "failed" | "completed";
interface Segment {
  readonly id: string;
  readonly startedAt: string;
  readonly startedProgress: number;
  status: SegmentStatus;
  completedProgress?: number;
  stoppedAt?: string;
  reason?: string;
}
interface StoredPhaseMeasurement {
  readonly elapsedMs: number;
  readonly cpuMicros: number;
  readonly startRssBytes: number;
  readonly peakRssBytes: number;
}
interface Receipt {
  readonly format: 1;
  readonly store: string;
  readonly identity: ScaleRunIdentity;
  ingestion?: {
    readonly measurement: StoredPhaseMeasurement;
    readonly completedAt: string;
  };
  readonly segments: Segment[];
}
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const MeasurementSchema = z.strictObject({
  elapsedMs: z.number().nonnegative(),
  cpuMicros: z.number().nonnegative(),
  startRssBytes: z.number().nonnegative(),
  peakRssBytes: z.number().nonnegative(),
});
const ReceiptSchema: z.ZodType<Receipt> = z.strictObject({
  format: z.literal(1),
  store: z.string().min(1),
  identity: z.strictObject({
    corpus: z.strictObject({
      version: z.string().min(1),
      sha256: Sha256,
      records: z.number().int().positive(),
    }),
    runtime: z.strictObject({ sha256: Sha256 }),
    model: z.strictObject({ sha256: Sha256 }),
    configuration: z.strictObject({ id: z.string().min(1), fingerprint: z.string().min(1) }),
  }),
  ingestion: z
    .strictObject({ measurement: MeasurementSchema, completedAt: z.iso.datetime() })
    .optional(),
  segments: z.array(
    z.strictObject({
      id: z.uuid(),
      startedAt: z.iso.datetime(),
      startedProgress: z.number().int().nonnegative(),
      status: z.enum(["running", "cancelled", "failed", "completed"]),
      completedProgress: z.number().int().nonnegative().optional(),
      stoppedAt: z.iso.datetime().optional(),
      reason: z.string().optional(),
    }),
  ),
});

const equalIdentity = (left: ScaleRunIdentity, right: ScaleRunIdentity) =>
  JSON.stringify(left) === JSON.stringify(right);

export async function openScaleRun(options: {
  readonly root: string;
  readonly identity: ScaleRunIdentity;
  readonly initialResources: ScaleRunResources;
  readonly resume?: boolean;
}) {
  if (options.initialResources.diskFreeBytes < 8 * GiB)
    throw Error("Scale run requires at least 8 GiB free disk at start");
  if (options.initialResources.availableMemoryBytes < 4 * GiB)
    throw Error("Scale run requires at least 4 GiB available memory at start");
  const root = resolve(options.root);
  const receiptPath = join(root, "scale-run-receipt.json");
  if (options.resume) {
    let existing: Receipt;
    try {
      existing = await readReceipt(receiptPath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        throw Error("Scale run receipt is missing; refusing unbound resume");
      throw Error("Scale run receipt is invalid; refusing resume", { cause: error });
    }
    if (existing.store !== root || !equalIdentity(existing.identity, options.identity))
      throw Error("Scale run identity mismatch; refusing resume");
    if (!existing.ingestion) throw Error("Scale run ingestion was not completed; refusing resume");
  } else {
    await mkdir(root);
    await saveReceipt(receiptPath, {
      format: 1,
      store: root,
      identity: options.identity,
      segments: [],
    });
  }
  const lockPath = join(root, "scale-run.lock");
  const lock = await open(lockPath, "wx").catch(() => {
    throw Error("Scale run already has an owned worker");
  });
  await lock.writeFile(`${process.pid}\n`);
  let current: Segment | undefined;
  let startedMs = 0;
  let lastProgress = 0;
  let lastProgressMs = 0;
  let growingSwapSamples = 0;
  let previousSwap = options.initialResources.swapUsedBytes;
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await lock.close();
    await rm(lockPath, { force: true });
  };
  return {
    async markIngestionComplete(measurement: StoredPhaseMeasurement) {
      const receipt = await readReceipt(receiptPath);
      receipt.ingestion = { measurement, completedAt: new Date().toISOString() };
      await saveReceipt(receiptPath, receipt);
    },
    async resumedIngestion() {
      return (await readReceipt(receiptPath)).ingestion?.measurement;
    },
    async resumedProgress() {
      return (await readReceipt(receiptPath)).segments.at(-1)?.completedProgress ?? 0;
    },
    async startSegment(progress: number, now = Date.now()) {
      if (current) throw Error("Scale run segment is already active");
      const receipt = await readReceipt(receiptPath);
      current = {
        id: randomUUID(),
        startedAt: new Date(now).toISOString(),
        startedProgress: progress,
        status: "running",
      };
      receipt.segments.push(current);
      startedMs = lastProgressMs = now;
      lastProgress = progress;
      await saveReceipt(receiptPath, receipt);
      return current.id;
    },
    guard(resources: ScaleRunResources, progress: number, now = Date.now()): string | undefined {
      if (!current) throw Error("Scale run segment is not active");
      if (now - startedMs >= maximumElapsedMs) return "three-hour execution cap reached";
      if (resources.diskFreeBytes < 4 * GiB) return "disk below 4 GiB";
      if (resources.memoryPressure === "red") return "memory pressure is red";
      if (resources.childRssBytes > 4 * GiB) return "child RSS exceeds 4 GiB";
      if (progress > lastProgress) {
        lastProgress = progress;
        lastProgressMs = now;
      } else if (now - lastProgressMs >= stalledMs) return "progress stalled for 15 minutes";
      growingSwapSamples = resources.swapUsedBytes > previousSwap ? growingSwapSamples + 1 : 0;
      previousSwap = resources.swapUsedBytes;
      if (growingSwapSamples >= 3) return "swap grew persistently";
      return undefined;
    },
    async stopSegment(
      status: Exclude<SegmentStatus, "running">,
      progress: number,
      reason?: string,
    ) {
      if (!current) throw Error("Scale run segment is not active");
      const receipt = await readReceipt(receiptPath);
      const segment = receipt.segments.at(-1);
      if (!segment || segment.status !== "running")
        throw Error("Scale run receipt lost active segment");
      segment.status = status;
      segment.completedProgress = progress;
      segment.stoppedAt = new Date().toISOString();
      if (reason) segment.reason = reason;
      await saveReceipt(receiptPath, receipt);
      current = undefined;
    },
    release,
  };
}

async function readReceipt(path: string): Promise<Receipt> {
  return ReceiptSchema.parse(JSON.parse(await readFile(path, "utf8")));
}
async function saveReceipt(path: string, receipt: Receipt) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}
