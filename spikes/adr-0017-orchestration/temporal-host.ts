import type { ChildProcess } from "node:child_process";
import { ApplicationFailure } from "@temporalio/common";
import { z } from "zod";

const BridgeResponse = z.union([
  z.strictObject({ value: z.json() }),
  z.strictObject({
    error: z.string(),
    code: z.enum(["retryable", "denied", "invalid", "unknown"]),
  }),
]);

/** Extracted runner/worker helpers; no service is started by importing this file. */
export async function callBridge(
  url: string,
  token: string,
  body: unknown,
  attempt: number,
): Promise<unknown> {
  let data: z.infer<typeof BridgeResponse>;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Unacknowledged bridge response");
    data = BridgeResponse.parse(await response.json());
  } catch {
    // The host may already have performed the effect. No receipt is proof of no effect.
    throw ApplicationFailure.create({
      message: "Bridge response unavailable or invalid; effect outcome unknown",
      type: "unknown",
      nonRetryable: true,
      details: [attempt],
    });
  }
  if ("error" in data)
    throw ApplicationFailure.create({
      message: data.error,
      type: data.code,
      nonRetryable: data.code !== "retryable",
      details: [attempt],
    });
  return data.value;
}

export async function stopChild(
  child: ChildProcess | undefined,
): Promise<void> {
  if (!child) return;
  const exited = () =>
    child.exitCode !== null ||
    child.signalCode !== null ||
    child.pid === undefined;
  if (exited()) return;
  await new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      child.removeListener("exit", finish);
      child.removeListener("error", finish);
      resolve();
    };
    child.once("exit", finish);
    child.once("error", finish);
    if (exited()) {
      finish();
      return;
    }
    timer = setTimeout(() => {
      if (exited()) finish();
      else child.kill("SIGKILL");
    }, 10000);
    child.kill("SIGTERM");
  });
}
