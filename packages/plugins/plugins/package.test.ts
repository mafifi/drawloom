import { test, expect } from "bun:test";
import { z } from "zod";
test("plugin presentation requires confined image asset declarations", () => {
  expect(
    DrawloomPackageExtensionSchema.safeParse({
      version: 1,
      presentation: {
        displayName: "Speech timing",
        icon: { light: "./assets/icon.svg", dark: "./assets/icon-dark.png" },
      },
    }).success,
  ).toBe(true);
  for (const light of [
    "../secret.png",
    "/absolute.png",
    "https://example.com/icon.png",
    "./assets/../../secret.png",
    "./assets/icon.html",
    "./assets\\icon.png",
  ])
    expect(
      DrawloomPackageExtensionSchema.safeParse({ version: 1, presentation: { icon: { light } } })
        .success,
    ).toBe(false);
});
test("settings declarations require unique pages, exact tools and an owned workbench", () => {
  const page = {
    id: "preferences",
    title: "Preferences",
    openingTool: { server: "setup", tool: "open" },
    allowedTools: ["open", "save"],
  };
  expect(DrawloomPackageExtensionSchema.safeParse({ version: 1, settings: [page] }).success).toBe(
    true,
  );
  for (const settings of [
    [page, page],
    [{ ...page, allowedTools: ["save"] }],
    [{ ...page, allowedTools: ["open", "open"] }],
    [{ ...page, workbenchId: "foreign" }],
  ])
    expect(DrawloomPackageExtensionSchema.safeParse({ version: 1, settings }).success).toBe(false);
});
import {
  PackageManifestSchema,
  PackageServerConfigSchema,
  DrawloomPackageExtensionSchema,
  PLUGIN_SCHEMA,
  DRAWLOOM_EXTENSION,
  DRAWLOOM_PACKAGE_EXTENSION_SCHEMA_ID,
  DrawloomPackageExtensionJsonSchema,
} from "./src/index.ts";
test("the versioned public extension schema has the canonical namespace and identity", () => {
  expect(DRAWLOOM_EXTENSION).toBe("org.drawloom");
  expect(DRAWLOOM_PACKAGE_EXTENSION_SCHEMA_ID).toBe(
    "https://drawloom.org/schemas/1.0.0/plugin-extension.schema.json",
  );
  expect(DrawloomPackageExtensionJsonSchema).toMatchObject({
    $id: DRAWLOOM_PACKAGE_EXTENSION_SCHEMA_ID,
    type: "object",
    properties: { version: { const: 1 } },
  });
  const published = z.fromJSONSchema(DrawloomPackageExtensionJsonSchema);
  expect(
    published.safeParse({ version: 1, backend: { entrypoint: "./org.drawloom/backend.mjs" } })
      .success,
  ).toBe(true);
  expect(
    published.safeParse({ version: 1, backend: { entrypoint: "./backend.mjs" } }).success,
  ).toBe(false);
});
test("optional dependencies describe tools, skills and only the existing orchestration capability", () => {
  expect(
    DrawloomPackageExtensionSchema.safeParse({
      version: 1,
      optional: [
        { kind: "tool", id: "package:media:media:inspect" },
        { kind: "skill", id: "package:editor:skill:edit" },
        { kind: "capability", id: "orchestration" },
      ],
    }).success,
  ).toBe(true);
  expect(
    DrawloomPackageExtensionSchema.safeParse({
      version: 1,
      optional: [{ kind: "capability", id: "host" }],
    }).success,
  ).toBe(false);
});
test("manifest schemas reject unsupported versions and invalid known metadata, retaining optional release strings", () => {
  expect(
    PackageManifestSchema.safeParse({ $schema: "https://example.com/schema", name: "sample" })
      .success,
  ).toBe(false);
  for (const metadata of [
    { author: { unknown: "x" } },
    { keywords: "wrong" },
    { name: "wrong--name" },
  ]) {
    expect(
      PackageManifestSchema.safeParse({ $schema: PLUGIN_SCHEMA, name: "sample", ...metadata })
        .success,
    ).toBe(false);
  }
  expect(
    PackageManifestSchema.parse({
      $schema: PLUGIN_SCHEMA,
      name: "sample",
      version: "",
      homepage: "not a URL",
    }).version,
  ).toBe("");
});
test("remote metadata rejects ambiguous headers and insecure or credential-bearing URLs at inspection", () => {
  for (const url of [
    "http://example.com/mcp",
    "https://user:secret@example.com",
    "https://example.com/#",
    "file:///path",
  ]) {
    expect(PackageServerConfigSchema.safeParse({ type: "streamable-http", url }).success).toBe(
      false,
    );
  }
  for (const headers of [
    { A: "a", a: "b" },
    { "bad name": "value" },
    { good: "line\nbreak" },
    { good: "not-a-header-😀" },
  ]) {
    expect(
      PackageServerConfigSchema.safeParse({
        type: "streamable-http",
        url: "https://example.com/mcp",
        headers,
      }).success,
    ).toBe(false);
  }
  for (const url of [
    "http://localhost/mcp",
    "http://127.8.0.1/mcp",
    "http://[::1]/mcp",
    "https://example.com",
  ]) {
    expect(PackageServerConfigSchema.safeParse({ type: "streamable-http", url }).success).toBe(
      true,
    );
  }
});
test("stdio rejects shell commands, reserved environment and closed-variant mixing", () => {
  for (const config of [
    { command: "bun run app" },
    { command: "/usr/bin/bun" },
    { command: "${PLUGIN_ROOT}/bin" },
    { command: "bun", url: "https://example.com" },
    { command: "bun", env: { PLUGIN_ROOT: "forged" } },
    { command: "bun", env: { DRAWLOOM_PLUGIN_CONFIG_DIR: "forged" } },
    { command: "bun", env: { drawloom_project_dir: "forged" } },
    { command: "bun", cwd: "/outside" },
  ]) {
    expect(PackageServerConfigSchema.safeParse({ type: "stdio", ...config }).success).toBe(false);
  }
});
test("Drawloom metadata accepts existing requirements and opening-tool references only in the physical namespace", () => {
  expect(
    DrawloomPackageExtensionSchema.safeParse({
      version: 1,
      backend: { entrypoint: "./org.drawloom/dist/backend.mjs" },
      requires: [{ kind: "capability", id: "orchestration" }],
      workbenches: [
        { id: "notes", title: "Notes", openingTool: { server: "backend", tool: "open" } },
      ],
    }).success,
  ).toBe(true);
  for (const entrypoint of [
    "./dist/backend.js",
    "../org.drawloom/backend.js",
    "/backend.js",
    "backend.ts",
    "https://example.com/backend.js",
  ]) {
    expect(
      DrawloomPackageExtensionSchema.safeParse({ version: 1, backend: { entrypoint } }).success,
    ).toBe(false);
  }
});

test("Drawloom metadata accepts only package-relative prebuilt JavaScript workflow modules", () => {
  expect(
    DrawloomPackageExtensionSchema.safeParse({
      version: 1,
      workflows: { entrypoint: "./org.drawloom/dist/workflows.js" },
    }).success,
  ).toBe(true);
  for (const entrypoint of [
    "./dist/workflows.js",
    "../org.drawloom/workflows.js",
    "/workflows.js",
    "workflows.ts",
    "https://example.com/workflows.js",
  ]) {
    expect(
      DrawloomPackageExtensionSchema.safeParse({ version: 1, workflows: { entrypoint } }).success,
    ).toBe(false);
  }
});
