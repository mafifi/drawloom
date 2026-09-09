import { test, expect } from "bun:test";
import { z } from "zod";
import { pluginConformance } from "../plugins/src/conformance.js";
import { definePlugin } from "../plugins/src/index.js";
import { createPluginRegistry } from "./src/index.js";
import {
  ArtifactSchema,
  CandidateSchema,
  ReviewSchema,
} from "../../workbench/workbench/src/index.js";
test("shared startup plugin conformance", () =>
  pluginConformance(createPluginRegistry));
test("tool and workbench dependencies fail closed", () => {
  const plugin = definePlugin({
    id: "x",
    version: "1.0.0",
    config: z.strictObject({}),
    requires: [{ kind: "tool", id: "missing" }],
    contribute: () => ({}),
  });
  expect(() => createPluginRegistry([{ plugin, config: {} }], [])).toThrow();
});
test("text and media artifact presentation uses one data boundary", () => {
  expect(
    ArtifactSchema.parse({
      id: "text",
      title: "Text",
      content: { kind: "text", text: "sample" },
    }).content.kind,
  ).toBe("text");
  expect(
    ArtifactSchema.parse({
      id: "image",
      title: "Image",
      content: {
        kind: "asset",
        asset: { key: "image.png", mediaType: "image/png", size: 40 },
      },
    }).content.kind,
  ).toBe("asset");
  expect(
    CandidateSchema.parse({
      id: "c",
      label: "Candidate",
      artifactIds: ["image"],
      status: "draft",
    }).artifactIds,
  ).toEqual(["image"]);
  expect(
    ReviewSchema.safeParse({
      id: "r",
      candidateId: "c",
      summary: "Review",
      findings: [],
      execute: "code",
    }).success,
  ).toBe(false);
});
