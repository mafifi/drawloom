import type { RpcTransport } from "@drawloom/host";
import { z } from "zod";
import { finishDisposableCodexThread } from "../../../scripts/codex-thread-cleanup.js";

export type LiveBudgetState = {
  firstSubmissionAt?: number;
  stopped?: string;
  uncertainThreadStarts?: number;
  persistenceError?: string;
  ownerStops?: LiveCleanupResult[];
  threads: string[];
  attempts: {
    role: string;
    method: string;
    threadId: string;
    submittedAt: number;
    outcome: "attempted" | "accepted" | "uncertain";
    turnId?: string;
  }[];
};
/** One test-run allowance, shared by every foreground/assessor connection. */
export function createLiveBudget(options: {
  persist(state: LiveBudgetState): void;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => () => void;
  onExpire?: () => Promise<void>;
  initial?: LiveBudgetState;
  ownerTimeoutMs?: number;
}) {
  const state: LiveBudgetState = options.initial
    ? structuredClone(options.initial)
    : { threads: [], attempts: [] };
  const now = options.now ?? Date.now;
  const schedule =
    options.schedule ??
    ((callback, delay) => {
      const timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    });
  let cancel: (() => void) | undefined;
  let expiry: Promise<void> | undefined;
  const pending = new Set<(reason: Error) => void>();
  const owners = new Map<string, RpcTransport>();
  const ownerTimeoutMs = Math.min(Math.max(options.ownerTimeoutMs ?? 5_000, 1), 5_000);
  const save = () => options.persist(structuredClone(state));
  async function interruptOwners(): Promise<LiveCleanupResult[]> {
    const results = await Promise.all(
      [...owners].map(async ([threadId, rpc]): Promise<LiveCleanupResult> => {
        let result: LiveCleanupResult;
        try {
          result = await bounded(async () => {
            // Known IDs reach the original writer immediately, even if status reads stall.
            const known = [
              ...new Set(
                state.attempts
                  .filter((a) => a.threadId === threadId && a.turnId)
                  .map((a) => a.turnId!),
              ),
            ];
            await Promise.allSettled(
              known.map((turnId) => rpc.request("turn/interrupt", { threadId, turnId })),
            );
            let observed = await readTurns(rpc, threadId);
            await Promise.all(
              observed.data
                .filter((turn) => turn.status === "inProgress")
                .map((turn) => rpc.request("turn/interrupt", { threadId, turnId: turn.id })),
            );
            observed = await readTurns(rpc, threadId);
            return terminalResult(threadId, observed, state.attempts);
          }, ownerTimeoutMs);
        } catch (error) {
          result = { threadId, outcome: "retained-uncertain", error: String(error) };
        }
        // An uncorrelated submission can be invisible behind an older completed turn.
        // Closing its writer fences any still-pending/late native work without guessing an ID.
        if (result.outcome !== "terminal") {
          try {
            await bounded(() => rpc.close(), ownerTimeoutMs);
            result.ownerClosed = true;
          } catch (error) {
            result.ownerClosed = false;
            result.error = String(error);
          }
        }
        return result;
      }),
    );
    state.ownerStops = results;
    try {
      save();
    } catch (error) {
      state.persistenceError = String(error);
    }
    return results;
  }
  const expire = () => {
    if (expiry) return;
    state.stopped = "deadline";
    for (const attempt of state.attempts)
      if (attempt.outcome === "attempted") attempt.outcome = "uncertain";
    // Interrupt even if the final evidence write has failed.
    try {
      save();
    } catch (error) {
      state.persistenceError = String(error);
    } finally {
      for (const reject of pending) reject(Error("Shared model deadline exceeded"));
      expiry = interruptOwners()
        .then(async () => {
          await options.onExpire?.();
        })
        .catch((error) => {
          state.persistenceError = String(error);
        });
    }
  };
  function assertRunning() {
    if (state.firstSubmissionAt !== undefined && now() - state.firstSubmissionAt >= 600_000)
      expire();
    if (state.stopped) throw Error(`Shared model ${state.stopped} reached`);
  }
  function assertOpen() {
    assertRunning();
    if (state.attempts.length >= 12) throw Error("Shared model allowance exhausted");
  }
  if (state.firstSubmissionAt !== undefined && !state.stopped)
    cancel = schedule(expire, Math.max(0, 600_000 - (now() - state.firstSubmissionAt)));
  return {
    state,
    assertOpen,
    assertRunning,
    interruptOwners,
    stop(reason: string) {
      state.stopped = reason;
      try {
        save();
      } catch (error) {
        state.persistenceError = String(error);
      }
    },
    waitForExpiry: async () => {
      await expiry;
    },
    dispose() {
      cancel?.();
    },
    wrap(rpc: RpcTransport, role: string): RpcTransport {
      return {
        ...rpc,
        async request(method, params) {
          if (method.includes("compact"))
            throw Error("Compaction is outside live acceptance allowance");
          if (method === "thread/start") {
            assertOpen();
            state.uncertainThreadStarts = (state.uncertainThreadStarts ?? 0) + 1;
            save();
            try {
              const result = await rpc.request(method, params);
              const parsed = z
                .object({ thread: z.object({ id: z.string().min(1) }) })
                .parse(result);
              if (!state.threads.includes(parsed.thread.id)) state.threads.push(parsed.thread.id);
              owners.set(parsed.thread.id, rpc);
              state.uncertainThreadStarts--;
              save();
              return result;
            } catch (error) {
              state.stopped = "uncertain-thread-start";
              save();
              throw error;
            }
          }
          if (method !== "turn/start" && method !== "turn/steer")
            return rpc.request(method, params);
          assertOpen();
          const p = z.object({ threadId: z.string().min(1) }).parse(params);
          if (!state.threads.includes(p.threadId))
            throw Error("Model submission requires an owned thread");
          const submittedAt = now();
          state.firstSubmissionAt ??= submittedAt;
          const attempt: LiveBudgetState["attempts"][number] = {
            role,
            method,
            threadId: p.threadId,
            submittedAt,
            outcome: "attempted",
          };
          state.attempts.push(attempt);
          // Synchronous durable write precedes native dispatch. Failure stops the run.
          try {
            save();
          } catch (error) {
            state.stopped = "receipt-write-failed";
            throw error;
          }
          owners.set(p.threadId, rpc);
          cancel ??= schedule(expire, Math.max(0, 600_000 - (now() - state.firstSubmissionAt)));
          let rejectPending: ((reason: Error) => void) | undefined;
          try {
            const deadline = new Promise<never>((_, reject) => {
              rejectPending = reject;
              pending.add(reject);
            });
            const result = await Promise.race([rpc.request(method, params), deadline]);
            const parsed = z.object({ turn: z.object({ id: z.string() }) }).safeParse(result);
            if (parsed.success) {
              attempt.turnId = parsed.data.turn.id;
              attempt.outcome = "accepted";
            } else attempt.outcome = "uncertain";
            save();
            return result;
          } catch (error) {
            attempt.outcome = "uncertain";
            save();
            throw error;
          } finally {
            if (rejectPending) pending.delete(rejectPending);
          }
        },
      };
    },
  };
}

const Turns = z.object({
  data: z.array(z.object({ id: z.string(), status: z.string() })).max(100),
  nextCursor: z.string().nullable(),
});
const terminal = new Set(["completed", "interrupted", "failed"]);
export type LiveCleanupResult = {
  threadId: string;
  outcome: "archived" | "retained-uncertain" | "terminal";
  turns?: { id: string; status: string }[];
  unresolvedAttempts?: number[];
  ownerClosed?: boolean;
  error?: string;
};

async function bounded<T>(action: () => Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Owner reconciliation deadline exceeded")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const readTurns = async (rpc: RpcTransport, threadId: string) =>
  Turns.parse(
    await rpc.request("thread/turns/list", {
      threadId,
      limit: 100,
      sortDirection: "desc",
      itemsView: "notLoaded",
    }),
  );
function terminalResult(
  threadId: string,
  observed: z.infer<typeof Turns>,
  attempts: readonly LiveBudgetState["attempts"][number][],
): LiveCleanupResult {
  const unresolvedAttempts = attempts.flatMap((attempt, index) =>
    attempt.threadId === threadId &&
    (!attempt.turnId ||
      !observed.data.some((turn) => turn.id === attempt.turnId && terminal.has(turn.status)))
      ? [index]
      : [],
  );
  return {
    threadId,
    turns: observed.data,
    unresolvedAttempts,
    outcome:
      !observed.nextCursor &&
      observed.data.every((turn) => terminal.has(turn.status)) &&
      !unresolvedAttempts.length
        ? "terminal"
        : "retained-uncertain",
  };
}

/** Recovery connections inspect only; interruption belongs to the original owner. */
async function inspectLiveThreads(
  threads: readonly string[],
  attempts: readonly LiveBudgetState["attempts"][number][],
  connect: () => Promise<RpcTransport>,
): Promise<LiveCleanupResult[]> {
  const results: LiveCleanupResult[] = [];
  for (const threadId of [...new Set(threads)]) {
    let rpc: RpcTransport | undefined;
    try {
      rpc = await connect();
      await rpc.request("initialize", {
        clientInfo: { name: "drawloom-live-interrupt", version: "0.0.0" },
        capabilities: { experimentalApi: true },
      });
      rpc.notify("initialized");
      results.push(terminalResult(threadId, await readTurns(rpc, threadId), attempts));
    } catch (error) {
      results.push({ threadId, outcome: "retained-uncertain", error: String(error) });
    } finally {
      try {
        await rpc?.close();
      } catch (error) {
        const result = results.at(-1)!;
        result.outcome = "retained-uncertain";
        result.error = String(error);
      }
    }
  }
  return results;
}

export async function cleanupLiveThreads(
  threads: readonly string[],
  options: {
    attempts?: readonly LiveBudgetState["attempts"][number][];
    interruptOwners?(): Promise<LiveCleanupResult[]>;
    connect(): Promise<RpcTransport>;
    save(results: LiveCleanupResult[]): void;
    closeOwners(): Promise<void>;
  },
): Promise<LiveCleanupResult[]> {
  let results = options.interruptOwners
    ? await options.interruptOwners()
    : await inspectLiveThreads(threads, options.attempts ?? [], options.connect);
  let saveFailure: unknown;
  try {
    options.save(results);
  } catch (error) {
    saveFailure = error;
  }
  try {
    await options.closeOwners();
  } catch (error) {
    for (const result of results) {
      result.outcome = "retained-uncertain";
      result.error = String(error);
    }
    options.save(results);
    return results;
  }
  if (saveFailure) throw saveFailure;
  // Native session creation can finish while application shutdown awaits its owners.
  // Read the live identity collection again only after every writer is closed.
  results = await inspectLiveThreads(threads, options.attempts ?? [], options.connect);
  options.save(results);
  for (const result of results) {
    if (result.outcome !== "terminal") continue;
    const finished = await finishDisposableCodexThread(result, {
      threadId: result.threadId,
      connect: options.connect,
    });
    result.outcome = finished.cleanup.kind === "archived" ? "archived" : "retained-uncertain";
    if (finished.cleanup.kind === "failed") result.error = finished.cleanup.reason;
    options.save(results);
  }
  return results;
}
