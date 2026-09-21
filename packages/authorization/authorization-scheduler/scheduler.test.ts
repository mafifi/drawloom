import { test, expect } from "vitest";
import type {
  Authorizer,
  AuthorizationResult,
  AuthorizationFailureCode,
  AuthZenRequest,
} from "@drawloom/authorization";
import { createAuthorizationScheduler, type AuthorizationClock } from "./src/index.js";

class Clock implements AuthorizationClock {
  time = 0;
  timers = new Set<{ at: number; fn: () => void }>();
  now = () => this.time;
  schedule = (fn: () => void, ms: number) => {
    const timer = { at: this.time + ms, fn };
    this.timers.add(timer);
    return () => {
      this.timers.delete(timer);
    };
  };
  advance(ms: number) {
    this.time += ms;
    for (const t of [...this.timers])
      if (t.at <= this.time) {
        this.timers.delete(t);
        t.fn();
      }
  }
}
const request = (id = "one"): AuthZenRequest => ({
  subject: { type: "user", id: "owner", properties: {} },
  action: { name: "read" },
  resource: { type: "record", id, properties: {} },
});
const options = (remainingMs = () => 5000, signal = new AbortController().signal) => ({
  remainingMs,
  signal,
});
const failure = (code: AuthorizationFailureCode): AuthorizationResult => ({
  kind: "failure",
  code,
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function fixture() {
  const clock = new Clock();
  const started: string[] = [];
  const pending: { resolve: (r: AuthorizationResult) => void; reject: (e: unknown) => void }[] = [];
  const provider: Authorizer = {
    authorize: (r) => {
      started.push(r.resource.id);
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
  };
  return { clock, started, pending, scheduler: createAuthorizationScheduler(provider, clock) };
}

test("isolated mixed pools retain exact limits, overflow and FIFO", async () => {
  const f = fixture();
  const foreground = Array.from({ length: 36 }, (_, i) =>
    f.scheduler.foreground.authorize(request(`f${i}`), options()),
  );
  const background = Array.from({ length: 12 }, (_, i) =>
    f.scheduler.background.authorize(request(`b${i}`), options()),
  );
  expect(f.started).toEqual([
    ...Array.from({ length: 12 }, (_, i) => `f${i}`),
    ...Array.from({ length: 4 }, (_, i) => `b${i}`),
  ]);
  expect(await f.scheduler.foreground.authorize(request(), options())).toEqual(failure("overflow"));
  expect(await f.scheduler.background.authorize(request(), options())).toEqual(failure("overflow"));
  f.pending[0]!.resolve({ decision: true });
  f.pending[12]!.resolve({ decision: false });
  await flush();
  expect(f.started.slice(-2)).toEqual(["f12", "b4"]);
  f.scheduler.shutdown();
  await Promise.all([...foreground, ...background]);
});

test("cancelled and expired queued entries free waiting capacity without dispatch", async () => {
  const f = fixture();
  const all = Array.from({ length: 12 }, () =>
    f.scheduler.foreground.authorize(request(), options()),
  );
  const abort = new AbortController();
  const cancelled = f.scheduler.foreground.authorize(
    request("cancel"),
    options(() => 1000, abort.signal),
  );
  const expired = f.scheduler.foreground.authorize(
    request("expire"),
    options(() => 100),
  );
  abort.abort();
  expect(await cancelled).toEqual(failure("cancelled"));
  f.clock.advance(100);
  expect(await expired).toEqual(failure("budget_exhausted"));
  const next = f.scheduler.foreground.authorize(request("next"), options());
  f.pending[0]!.resolve({ decision: true });
  await flush();
  expect(f.started.at(-1)).toBe("next");
  f.scheduler.shutdown();
  await Promise.all([...all, next]);
  expect(f.clock.timers.size).toBe(0);
});

test("admission and dispatch require 50ms and snapshot queued facts", async () => {
  const f = fixture();
  for (const budget of [
    () => 49,
    () => -1,
    () => NaN,
    () => Infinity,
    () => {
      throw Error();
    },
  ])
    expect(await f.scheduler.foreground.authorize(request(), options(budget))).toEqual(
      failure("budget_exhausted"),
    );
  const active = Array.from({ length: 12 }, () =>
    f.scheduler.foreground.authorize(request(), options()),
  );
  let remaining = 70;
  const short = f.scheduler.foreground.authorize(
    request("short"),
    options(() => remaining),
  );
  const mutable = request("original");
  const snapshot = f.scheduler.foreground.authorize(mutable, options());
  mutable.resource.id = "changed";
  remaining = 49;
  f.pending[0]!.resolve({ decision: true });
  await flush();
  expect(await short).toEqual(failure("budget_exhausted"));
  expect(f.started.at(-1)).toBe("original");
  f.scheduler.shutdown();
  await Promise.all([...active, snapshot]);
});

test("timeouts and cancellation retain active slots until underlying settlement", async () => {
  const f = fixture();
  const active = Array.from({ length: 12 }, () =>
    f.scheduler.foreground.authorize(request(), options()),
  );
  f.clock.advance(2000);
  expect(await Promise.all(active)).toEqual(
    Array.from({ length: 12 }, () => failure("budget_exhausted")),
  );
  const queued = f.scheduler.foreground.authorize(request("waiting"), options());
  expect(f.started.length).toBe(12);
  f.pending[0]!.reject(Error("late rejection"));
  await flush();
  expect(f.started.at(-1)).toBe("waiting");
  f.scheduler.shutdown();
  expect(await queued).toEqual(failure("shutdown"));
  f.pending.at(-1)!.reject(Error("after shutdown"));
  await flush();
  expect(await f.scheduler.foreground.authorize(request(), options())).toEqual(failure("shutdown"));
});

test("validation and failures never become decisions", async () => {
  for (const [provider, expected] of [
    [{ authorize: async () => ({ decision: "yes" }) }, "malformed_result"],
    [
      {
        authorize: async () => {
          throw Error("private payload");
        },
      },
      "rejected",
    ],
    [
      {
        authorize: () => {
          throw Error();
        },
      },
      "rejected",
    ],
    [{ authorize: async () => failure("unavailable") }, "unavailable"],
  ] as const) {
    const scheduler = createAuthorizationScheduler(provider as unknown as Authorizer);
    expect(await scheduler.foreground.authorize(request(), options())).toEqual(failure(expected));
    scheduler.shutdown();
  }
  const f = fixture();
  const invalid = request();
  invalid.subject.id = "";
  expect(await f.scheduler.foreground.authorize(invalid, options())).toEqual(
    failure("invalid_facts"),
  );
  const abort = new AbortController();
  abort.abort();
  expect(
    await f.scheduler.foreground.authorize(
      request(),
      options(() => 5000, abort.signal),
    ),
  ).toEqual(failure("cancelled"));
  expect(f.started.length).toBe(0);
  f.scheduler.shutdown();
});

test("late rejection after deadline remains budget exhaustion even before timer delivery", async () => {
  const f = fixture();
  const result = f.scheduler.foreground.authorize(
    request(),
    options(() => 50),
  );
  expect(f.started.length).toBe(1);
  f.clock.time = 51;
  f.pending[0]!.reject(Error("late"));
  expect(await result).toEqual(failure("budget_exhausted"));
  f.scheduler.shutdown();
});

test("active cancellation retains slots, frees queued cancellation capacity, and never borrows", async () => {
  const f = fixture();
  const abort = new AbortController();
  const active = Array.from({ length: 4 }, () =>
    f.scheduler.background.authorize(
      request(),
      options(() => 5000, abort.signal),
    ),
  );
  const waitingAbort = new AbortController();
  const waiting = Array.from({ length: 8 }, () =>
    f.scheduler.background.authorize(
      request(),
      options(() => 5000, waitingAbort.signal),
    ),
  );
  abort.abort();
  expect(await Promise.all(active)).toEqual(Array.from({ length: 4 }, () => failure("cancelled")));
  expect(await f.scheduler.background.authorize(request(), options())).toEqual(failure("overflow"));
  waitingAbort.abort();
  await Promise.all(waiting);
  const fresh = f.scheduler.background.authorize(request("fresh"), options());
  expect(f.started.length).toBe(4);
  f.pending[0]!.resolve({ decision: true });
  await flush();
  expect(f.started.at(-1)).toBe("fresh");
  f.scheduler.shutdown();
  await fresh;
});

test("queue time reduces provider budget and dispatch under 50ms skips evaluation", async () => {
  const f = fixture();
  const active = Array.from({ length: 12 }, () =>
    f.scheduler.foreground.authorize(request(), options()),
  );
  const queued = f.scheduler.foreground.authorize(
    request("short"),
    options(() => 100),
  );
  f.clock.advance(51);
  f.pending[0]!.resolve({ decision: true });
  await flush();
  expect(await queued).toEqual(failure("budget_exhausted"));
  expect(f.started.length).toBe(12);
  f.scheduler.shutdown();
  await Promise.all(active);
  const clock = new Clock();
  const budgets: number[] = [];
  const scheduler = createAuthorizationScheduler(
    {
      authorize: async (_r, o) => {
        budgets.push(o.remainingMs());
        return { decision: true };
      },
    },
    clock,
  );
  expect(
    await scheduler.foreground.authorize(
      request(),
      options(() => 80),
    ),
  ).toEqual({ decision: true });
  expect(budgets).toEqual([80]);
  scheduler.shutdown();
});

test("nested caller mutation cannot alter the immutable admission snapshot", async () => {
  const clock = new Clock();
  let snapshot: AuthZenRequest | undefined;
  let complete!: (r: AuthorizationResult) => void;
  const scheduler = createAuthorizationScheduler(
    {
      authorize: (r) => {
        snapshot = r;
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    },
    clock,
  );
  const facts = request();
  facts.resource.properties.tags = ["original"];
  const pending = scheduler.foreground.authorize(facts, options());
  (facts.resource.properties.tags as string[])[0] = "changed";
  expect(snapshot!.resource.properties.tags).toEqual(["original"]);
  expect(Object.isFrozen(snapshot!.resource.properties.tags)).toBe(true);
  complete({ decision: true });
  expect(await pending).toEqual({ decision: true });
  scheduler.shutdown();
});

test("result validation consumes deadline before publishing an affirmative decision", async () => {
  const clock = new Clock();
  const scheduler = createAuthorizationScheduler(
    {
      authorize: async () => ({
        get decision() {
          clock.time = 2001;
          return true;
        },
      }),
    },
    clock,
  );
  expect(await scheduler.foreground.authorize(request(), options())).toEqual(
    failure("budget_exhausted"),
  );
  scheduler.shutdown();
});

test("shutdown during result validation retains settlement precedence", async () => {
  const clock = new Clock();
  const scheduler = createAuthorizationScheduler(
    {
      authorize: async () => ({
        get decision() {
          scheduler.shutdown();
          clock.time = 2001;
          return true;
        },
      }),
    },
    clock,
  );
  expect(await scheduler.foreground.authorize(request(), options())).toEqual(failure("shutdown"));
});
