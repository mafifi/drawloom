import { expect, test } from "vitest";
import { z } from "zod";
import { createLocalToolGateway } from "@drawloom/local-tools";
import { defineTool, type ToolResult } from "@drawloom/tools";
import type { JsonValue } from "@drawloom/host";
import { createDesktopAuthorization } from "./authorization.js";
import { createWorkflowAuthority } from "./workflow-authority.js";
import { createWorkflowToolScope } from "./workflow-tools.js";

for (const decision of [1, 2]) {
  for (const completion of ["sibling", "owner", "run-revocation"] as const) {
    test(`${completion} completion during decision ${decision} only invalidates relevant workflow authority`, async () => {
      let entered!: () => void;
      let release!: () => void;
      const entry = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let decisions = 0,
        effects = 0;
      const host = createDesktopAuthorization({
        authorize: async () => {
          if (++decisions === decision) {
            entered();
            await gate;
          }
          return { decision: true };
        },
      });
      const authority = createWorkflowAuthority();
      const data = new Map<string, JsonValue>();
      const scope = createWorkflowToolScope({
        authority,
        projectId: "project",
        installationId: "installation",
        workbenchIds: ["workbench"],
        grants: new Map(),
        refreshGrants: async () => {},
        store: {
          get: async (key) => data.get(key),
          set: async (key, value) => {
            data.set(key, value);
          },
        },
      });
      const gateway = scope.wrap(
        createLocalToolGateway({
          authorization: host.tools({
            owns: scope.owns,
            facts: scope.facts,
            background: () => true,
          }),
          tools: [
            defineTool({
              name: "effect",
              description: "effect",
              input: z.string(),
              output: z.string(),
              execute: (text) => {
                effects++;
                return text;
              },
            }),
          ],
          nextInvocationId: () => "invocation",
          evidence: { record: scope.record },
        }),
      );
      let invocation!: Promise<ToolResult>;
      let ownerIsActive!: () => boolean;
      const wrapped = authority.wrap(
        { projectId: "project", installationId: "installation" },
        [
          {
            id: "task",
            version: "1",
            async run(input, context) {
              if (input === "sibling") return {};
              ownerIsActive = authority.capture();
              invocation = gateway.invoke(
                gateway.bind(context.runId),
                "effect",
                "value",
                context.signal,
              );
              if (completion === "owner") {
                await entry;
                return {};
              }
              return invocation;
            },
          },
        ],
        async () => {},
      );
      const context = {
        runId: "same-run",
        stepId: "step-b",
        attemptId: "attempt-b",
        attempt: 1,
        taskVersion: "1",
        signal: new AbortController().signal,
      };
      try {
        const running = wrapped[0]!.run("owner", context);
        await entry;
        if (completion === "owner") {
          await running;
          expect(ownerIsActive()).toBe(false);
        } else {
          await wrapped[0]!.run("sibling", {
            ...context,
            stepId: "step-a",
            attemptId: "attempt-a",
          });
          expect(ownerIsActive()).toBe(true);
          if (completion === "run-revocation") host.invalidate(context.runId);
        }
        release();
        const result = await invocation;
        await running;
        if (completion === "sibling") {
          expect(result.outcome.status).toBe("ok");
          expect(effects).toBe(1);
        } else {
          expect(result.outcome).toMatchObject({ status: "failed", execution: "not_started" });
          expect(effects).toBe(0);
        }
      } finally {
        release();
        host.shutdown();
      }
    });
  }
}
