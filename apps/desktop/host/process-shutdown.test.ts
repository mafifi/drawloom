import { expect, test } from "vitest";
import { createProcessShutdown } from "./process-shutdown.js";

test("process shutdown still flushes telemetry after application close fails and returns failure", async () => {
  const events: string[] = [];
  const shutdown = createProcessShutdown({
    closeApplication: () => {
      events.push("application");
      throw Error("private application failure");
    },
    shutdownTelemetry: async () => {
      events.push("telemetry");
    },
    reportFailure: () => events.push("safe failure"),
  });
  expect(await shutdown()).toBe(1);
  expect(events).toEqual(["application", "telemetry", "safe failure"]);
});

test("concurrent process shutdown signals share one operation and telemetry failure is nonzero", async () => {
  let applications = 0;
  let telemetry = 0;
  let reports = 0;
  const shutdown = createProcessShutdown({
    closeApplication: async () => {
      applications++;
    },
    shutdownTelemetry: async () => {
      telemetry++;
      throw Error("private telemetry failure");
    },
    reportFailure: () => {
      reports++;
    },
  });
  const first = shutdown();
  const second = shutdown();
  expect(first).toBe(second);
  expect(await Promise.all([first, second, shutdown()])).toEqual([1, 1, 1]);
  expect({ applications, telemetry, reports }).toEqual({
    applications: 1,
    telemetry: 1,
    reports: 1,
  });
});

test("successful process shutdown returns zero", async () => {
  const shutdown = createProcessShutdown({
    closeApplication: async () => {},
    shutdownTelemetry: async () => {},
    reportFailure: () => {
      throw Error("must not report");
    },
  });
  expect(await shutdown()).toBe(0);
});
