import { z } from "zod";
import type { RpcTransport } from "@drawloom/host";

const ThreadId = z.string().min(1).max(256);

export type CodexThreadCleanup =
  | { kind: "not_owned" }
  | { kind: "archived"; threadId: string }
  | { kind: "failed"; threadId: string; reason: string };

/**
 * Finish a disposable proof without changing its primary evidence. Callers must
 * pass only a thread identity obtained from their own thread/start response or
 * their exact durable receipt. An absent identity is deliberately a no-op.
 */
export async function finishDisposableCodexThread<T>(
  primary: T,
  options: { threadId?: string; connect(): Promise<RpcTransport>; timeoutMs?: number },
): Promise<{ primary: T; cleanup: CodexThreadCleanup }> {
  if (options.threadId === undefined) return { primary, cleanup: { kind: "not_owned" } };
  const threadId = ThreadId.parse(options.threadId);
  let rpc: RpcTransport | undefined;
  let failure: string | undefined;
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 5_000, 1), 30_000);
  const bounded = async <V>(operation: Promise<V>): Promise<V> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<V>((_, reject) => {
          timer = setTimeout(() => reject(Error("Disposable thread cleanup timed out")), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  try {
    const opening = options.connect();
    try {
      rpc = await bounded(opening);
    } catch (cause) {
      void opening.then((late) => bounded(late.close())).catch(() => undefined);
      throw cause;
    }
    await bounded(
      rpc.request("initialize", {
        clientInfo: { name: "drawloom-disposable-proof-cleanup", version: "0.0.0" },
        capabilities: { experimentalApi: true },
      }),
    );
    rpc.notify("initialized");
    await bounded(rpc.request("thread/archive", { threadId }));
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : String(cause);
  } finally {
    try {
      if (rpc) await bounded(rpc.close());
    } catch (cause) {
      failure ??= cause instanceof Error ? cause.message : String(cause);
    }
  }
  return {
    primary,
    cleanup:
      failure === undefined
        ? { kind: "archived", threadId }
        : { kind: "failed", threadId, reason: failure },
  };
}
