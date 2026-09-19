import type { AgentSession, AgentGoalSnapshot } from "@drawloom/agent";
import type { DesktopSnapshot } from "../src/lib/protocol.js";
import { cleanup } from "./cleanup.js";
import { DesktopClosedError } from "./application-lifecycle.js";

export type DesktopSession = {
  session: AgentSession;
  signals: DesktopSnapshot["signals"];
  active?: string;
  goal?: AgentGoalSnapshot | null;
  goalError?: string;
  close(): Promise<void>;
};

export async function closeAgentSession(session: AgentSession) {
  const result = await session.close();
  if (result.status !== "ok") throw Error(result.failure.message);
}

/** Sole owner of foreground session startup, background readers and teardown. */
export function createDesktopSessions() {
  const live = new Map<string, DesktopSession>();
  const opening = new Map<string, Promise<DesktopSession>>();
  const pumps = new Set<Promise<void>>();
  const failures: unknown[] = [];
  let stopped = false;
  let closing: Promise<void> | undefined;
  const assertRunning = () => {
    if (stopped) throw new DesktopClosedError("closing");
  };
  return {
    get: (id: string) => live.get(id),
    values: () => live.values(),
    stopAdmission() {
      stopped = true;
    },
    connect(
      id: string,
      start: (own: (close: () => Promise<void>) => void) => Promise<DesktopSession>,
    ): Promise<DesktopSession> {
      if (stopped) return Promise.reject(new DesktopClosedError("closing"));
      const existing = live.get(id);
      if (existing) return Promise.resolve(existing);
      const pending = opening.get(id);
      if (pending) return pending;
      const resources: (() => Promise<void>)[] = [];
      const starting = Promise.resolve().then(async () => {
        let state: DesktopSession | undefined;
        try {
          assertRunning();
          state = await start((close) => {
            resources.unshift(close);
          });
          const invalidate = state.close;
          let retired: Promise<void> | undefined;
          state.close = () => (retired ??= cleanup([invalidate, ...resources]));
          assertRunning();
          live.set(id, state);
          return state;
        } catch (error) {
          try {
            await (state ? state.close() : cleanup(resources));
          } catch (rollback) {
            failures.push(rollback);
            throw new AggregateError([error, rollback], "Session startup and rollback failed");
          }
          throw error;
        } finally {
          opening.delete(id);
        }
      });
      opening.set(id, starting);
      return starting;
    },
    watch(
      id: string,
      state: DesktopSession,
      read: () => Promise<void>,
      unavailable: () => Promise<void>,
    ): Promise<void> {
      const retire = async () => {
        // A provider may end its stream cleanly on connection loss. Both
        // settlement paths retire the session; shutdown owns its own cleanup.
        if (stopped) return;
        try {
          await cleanup([
            () => state.close(),
            () => {
              if (live.get(id) === state) live.delete(id);
            },
            unavailable,
          ]);
        } catch (error) {
          failures.push(error);
        }
      };
      const pump = Promise.resolve().then(read).then(retire, retire);
      pumps.add(pump);
      // Both branches are observed; no discarded rejecting finally() promise.
      void pump.then(
        () => pumps.delete(pump),
        () => pumps.delete(pump),
      );
      return pump;
    },
    close(): Promise<void> {
      stopped = true;
      return (closing ??= (async () => {
        await Promise.allSettled([...opening.values()]);
        await cleanup([
          () => cleanup([...live.values()].map((state) => () => state.close())),
          () => cleanup([...pumps].map((pump) => () => pump)),
          () => {
            live.clear();
            if (failures.length) throw new AggregateError(failures, "Session recovery failed");
          },
        ]);
      })());
    },
  };
}
