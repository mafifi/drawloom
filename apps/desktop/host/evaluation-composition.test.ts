import { expect, test } from "vitest";
import { createEvaluationAssessmentResolver } from "./evaluation-composition.js";
import type { EvaluationAssessmentProvider } from "@drawloom/evaluation";

test("default evaluation assessment is lazy and shared while explicit models remain owner-scoped", async () => {
  const created: {
    dataDirectory: string;
    scope: { installationId: string; projectId: string };
    workingDirectory: string;
    model?: string;
  }[] = [];
  const create = async (options: {
    dataDirectory: string;
    scope: { installationId: string; projectId: string };
    workingDirectory: string;
    model?: string;
  }) => {
    created.push(options);
    return { assess: async () => ({}) } as unknown as EvaluationAssessmentProvider;
  };
  const shared = createEvaluationAssessmentResolver({ create });
  expect(created).toHaveLength(0);
  const first = await shared("one", "project-a", "/a");
  const second = await shared("two", "project-b", "/b");
  expect(first).toBe(second);
  expect(created).toEqual([
    {
      dataDirectory: "",
      scope: { installationId: "one", projectId: "project-a" },
      workingDirectory: "/a",
    },
  ]);

  const scoped = createEvaluationAssessmentResolver({ model: "reviewer", create });
  const third = await scoped("one", "project-a", "/a");
  const fourth = await scoped("two", "project-b", "/b");
  expect(third).not.toBe(fourth);
  expect(created.slice(1)).toEqual([
    {
      dataDirectory: "",
      scope: { installationId: "one", projectId: "project-a" },
      workingDirectory: "/a",
      model: "reviewer",
    },
    {
      dataDirectory: "",
      scope: { installationId: "two", projectId: "project-b" },
      workingDirectory: "/b",
      model: "reviewer",
    },
  ]);
});

test("a supplied evaluation assessment is reused without constructing a provider", async () => {
  const supplied = { assess: async () => ({}) } as unknown as EvaluationAssessmentProvider;
  let creates = 0;
  const resolve = createEvaluationAssessmentResolver({
    assessment: supplied,
    create: async () => {
      creates++;
      return supplied;
    },
  });
  expect(await resolve("one", "project", "/project")).toBe(supplied);
  expect(creates).toBe(0);
});
