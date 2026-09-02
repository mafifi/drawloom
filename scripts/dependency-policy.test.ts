import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  discoverWorkspaceManifests,
  type RootManifest,
  type WorkspaceManifestInput,
  validateDependencyPolicy,
} from "./dependency-policy.ts";

const root = (overrides: Partial<RootManifest> = {}): RootManifest => ({
  name: "drawloom",
  version: "0.0.0",
  private: true,
  type: "module",
  packageManager: "bun@1.2.23",
  workspaces: {
    packages: ["apps/*", "packages/*/*"],
    catalog: {
      zod: "4.4.3",
    },
  },
  drawloom: {
    releaseVersion: "0.0.0",
    dependencyPolicy: {
      exceptions: [],
    },
  },
  ...overrides,
});

const contract = (
  overrides: Partial<WorkspaceManifestInput["manifest"]> = {},
): WorkspaceManifestInput => ({
  path: "packages/example/example/package.json",
  manifest: {
    name: "@drawloom/example",
    version: "0.0.0",
    type: "module",
    dependencies: {
      zod: "catalog:",
    },
    drawloom: {
      role: "contract",
      runtime: "portable",
    },
    ...overrides,
  },
});

describe("validateDependencyPolicy", () => {
  test("accepts catalog external dependencies and workspace internal dependencies", () => {
    const workspaces: WorkspaceManifestInput[] = [
      contract(),
      {
        path: "packages/example/local/package.json",
        manifest: {
          name: "@drawloom/example-local",
          version: "0.0.0",
          type: "module",
          dependencies: {
            "@drawloom/example": "workspace:*",
          },
          drawloom: {
            role: "provider",
            runtime: "node",
          },
        },
      },
    ];

    expect(validateDependencyPolicy(root(), workspaces)).toEqual([]);
  });

  test.each(["^4.4.3", "*", "latest", "git+https://example.com/zod.git"])(
    "rejects direct external dependency spec %s",
    (spec) => {
      const violations = validateDependencyPolicy(
        root(),
        [contract({ dependencies: { zod: spec } })],
      );

      expect(violations).toContainEqual(
        expect.objectContaining({
          field: "dependencies.zod",
          workspace: "packages/example/example/package.json",
        }),
      );
    },
  );

  test("rejects a catalog reference without a root catalog entry", () => {
    const violations = validateDependencyPolicy(
      root({
        workspaces: {
          packages: ["apps/*", "packages/*/*"],
          catalog: {},
        },
      }),
      [contract()],
    );

    expect(violations).toContainEqual(
      expect.objectContaining({
        field: "dependencies.zod",
        message: expect.stringContaining("root catalog"),
      }),
    );
  });

  test("accepts a dependency from a named root catalog", () => {
    const manifest = contract({ dependencies: { zod: "catalog:legacy" } });
    const violations = validateDependencyPolicy(
      root({
        workspaces: {
          packages: ["apps/*", "packages/*/*"],
          catalog: {},
          catalogs: {
            legacy: { zod: "3.25.76" },
          },
        },
      }),
      [manifest],
    );

    expect(violations).toEqual([]);
  });

  test("rejects an internal dependency without workspace:*", () => {
    const violations = validateDependencyPolicy(root(), [
      contract(),
      {
        path: "packages/example/local/package.json",
        manifest: {
          name: "@drawloom/example-local",
          version: "0.0.0",
          type: "module",
          dependencies: {
            "@drawloom/example": "catalog:",
          },
          drawloom: {
            role: "provider",
            runtime: "node",
          },
        },
      },
    ]);

    expect(violations).toContainEqual(
      expect.objectContaining({
        field: "dependencies.@drawloom/example",
        message: expect.stringContaining("workspace:*"),
      }),
    );
  });

  test("rejects missing package role and runtime metadata", () => {
    const missingMetadata = contract();
    delete missingMetadata.manifest.drawloom;
    const violations = validateDependencyPolicy(root(), [missingMetadata]);

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "drawloom.role" }),
        expect.objectContaining({ field: "drawloom.runtime" }),
      ]),
    );
  });

  test("rejects divergent versions for publishable packages", () => {
    const violations = validateDependencyPolicy(
      root(),
      [contract({ version: "0.1.0" })],
    );

    expect(violations).toContainEqual(
      expect.objectContaining({
        field: "version",
        message: expect.stringContaining("0.0.0"),
      }),
    );
  });

  test("allows a documented exact dependency exception", () => {
    const violations = validateDependencyPolicy(
      root({
        drawloom: {
          releaseVersion: "0.0.0",
          dependencyPolicy: {
            exceptions: [
              {
                workspace: "packages/example/example/package.json",
                section: "dependencies",
                dependency: "zod",
                spec: "^4.4.3",
                reason: "Upstream compatibility fixture requires a range.",
              },
            ],
          },
        },
      }),
      [contract({ dependencies: { zod: "^4.4.3" } })],
    );

    expect(violations).toEqual([]);
  });

  test("rejects a documented exception after it becomes unused", () => {
    const violations = validateDependencyPolicy(
      root({
        drawloom: {
          releaseVersion: "0.0.0",
          dependencyPolicy: {
            exceptions: [
              {
                workspace: "packages/example/example/package.json",
                section: "dependencies",
                dependency: "zod",
                spec: "^4.4.3",
                reason: "Temporary upstream compatibility requirement.",
              },
            ],
          },
        },
      }),
      [contract()],
    );

    expect(violations).toContainEqual(
      expect.objectContaining({
        field: "drawloom.dependencyPolicy.exceptions",
        message: expect.stringContaining("unused"),
      }),
    );
  });
});

describe("discoverWorkspaceManifests", () => {
  test("discovers the nested capability package layout", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "drawloom-policy-"));

    try {
      const packageDirectory = join(
        rootDirectory,
        "packages",
        "example",
        "contract",
      );
      await mkdir(packageDirectory, { recursive: true });
      await writeFile(
        join(packageDirectory, "package.json"),
        JSON.stringify({ name: "@drawloom/example" }),
      );

      const manifests = await discoverWorkspaceManifests(rootDirectory, [
        "packages/*/*",
      ]);

      expect(manifests).toEqual([
        {
          path: "packages/example/contract/package.json",
          manifest: { name: "@drawloom/example" },
        },
      ]);
    } finally {
      await rm(rootDirectory, { force: true, recursive: true });
    }
  });
});
