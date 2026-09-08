import { readFile } from "node:fs/promises";
import { join } from "node:path";
import publicBoundaryPolicy from "./public-boundary-policy.json";

export const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export type DependencySection = (typeof dependencySections)[number];

export const packageRoles = [
  "contract",
  "provider",
  "consumer",
  "runtime",
  "composition",
] as const;

export const runtimeClasses = [
  "portable",
  "bun",
  "node",
  "cloudflare",
  "tauri",
] as const;

export interface DependencyPolicyException {
  workspace: string;
  section: DependencySection;
  dependency: string;
  spec: string;
  reason: string;
}

export interface DrawloomPackageMetadata {
  role?: string;
  runtime?: string;
}

export interface PackageManifest {
  name?: string;
  version?: string;
  private?: boolean;
  type?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  drawloom?: DrawloomPackageMetadata;
}

export interface RootManifest extends PackageManifest {
  packageManager?: string;
  workspaces?: {
    packages?: string[];
    catalog?: Record<string, string>;
    catalogs?: Record<string, Record<string, string>>;
  };
  drawloom?: DrawloomPackageMetadata & {
    releaseVersion?: string;
    dependencyPolicy?: {
      exceptions?: DependencyPolicyException[];
    };
  };
}

export interface WorkspaceManifestInput {
  path: string;
  manifest: PackageManifest;
}

export interface PolicyViolation {
  workspace: string;
  field: string;
  message: string;
}

const violation = (
  workspace: string,
  field: string,
  message: string,
): PolicyViolation => ({ field, message, workspace });

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isAllowedValue = <T extends string>(
  values: readonly T[],
  value: unknown,
): value is T => typeof value === "string" && values.includes(value as T);

const exceptionKey = (
  workspace: string,
  section: DependencySection,
  dependency: string,
  spec: string,
): string => `${workspace}\u0000${section}\u0000${dependency}\u0000${spec}`;

const catalogContains = (
  root: RootManifest,
  dependency: string,
  spec: string,
): boolean => {
  const catalogName = spec.slice("catalog:".length);
  if (catalogName === "") {
    return isNonEmptyString(root.workspaces?.catalog?.[dependency]);
  }

  return isNonEmptyString(
    root.workspaces?.catalogs?.[catalogName]?.[dependency],
  );
};

const isForbiddenCatalogSpec = (spec: string): boolean => {
  const normalized = spec.trim().toLowerCase();
  return (
    normalized === "*" ||
    normalized === "latest" ||
    normalized.startsWith("catalog:") ||
    normalized.startsWith("workspace:") ||
    normalized.startsWith("git") ||
    normalized.startsWith("http:") ||
    normalized.startsWith("https:") ||
    normalized.startsWith("file:") ||
    normalized.startsWith("link:")
  );
};

export const validateDependencyPolicy = (
  root: RootManifest,
  workspaces: WorkspaceManifestInput[],
): PolicyViolation[] => {
  const violations: PolicyViolation[] = [];
  const rootPath = "package.json";

  // Run before dependency exceptions: publication boundaries are not version
  // policy exceptions. A private:true manifest is still public source here.
  const privatePackage = new RegExp(publicBoundaryPolicy.privatePackagePattern);
  const checkPrivateDependencies = (
    path: string,
    section: string,
    dependencies: Record<string, string>,
  ) => {
    for (const [name, spec] of Object.entries(dependencies)) {
      if (
        privatePackage.test(name) ||
        privatePackage.test(spec.replace(/^npm:/, ""))
      ) {
        violations.push(
          violation(
            path,
            `${section}.${name}`,
            "Public Drawloom must not depend on known private product or plugin packages.",
          ),
        );
      }
    }
  };
  for (const { path, manifest } of [
    { path: rootPath, manifest: root },
    ...workspaces,
  ]) {
    for (const section of dependencySections) {
      checkPrivateDependencies(path, section, manifest[section] ?? {});
    }
  }
  checkPrivateDependencies(
    rootPath,
    "workspaces.catalog",
    root.workspaces?.catalog ?? {},
  );
  for (const [name, catalog] of Object.entries(
    root.workspaces?.catalogs ?? {},
  )) {
    checkPrivateDependencies(rootPath, `workspaces.catalogs.${name}`, catalog);
  }

  if (root.private !== true) {
    violations.push(
      violation(rootPath, "private", "The root workspace must be private."),
    );
  }
  if (root.type !== "module") {
    violations.push(
      violation(rootPath, "type", 'The root workspace must use type "module".'),
    );
  }
  if (!root.packageManager?.startsWith("bun@")) {
    violations.push(
      violation(
        rootPath,
        "packageManager",
        "The root workspace must pin Bun with packageManager.",
      ),
    );
  }
  if (!Array.isArray(root.workspaces?.packages)) {
    violations.push(
      violation(
        rootPath,
        "workspaces.packages",
        "The root workspace must declare package globs.",
      ),
    );
  }
  if (root.workspaces?.catalog === undefined) {
    violations.push(
      violation(
        rootPath,
        "workspaces.catalog",
        "The root workspace must declare the default dependency catalog.",
      ),
    );
  }

  for (const [dependency, spec] of Object.entries(
    root.workspaces?.catalog ?? {},
  )) {
    if (!isNonEmptyString(spec) || isForbiddenCatalogSpec(spec)) {
      violations.push(
        violation(
          rootPath,
          `workspaces.catalog.${dependency}`,
          "Catalog entries must use bounded registry-compatible version ranges.",
        ),
      );
    }
  }

  for (const [catalogName, catalog] of Object.entries(
    root.workspaces?.catalogs ?? {},
  )) {
    for (const [dependency, spec] of Object.entries(catalog)) {
      if (!isNonEmptyString(spec) || isForbiddenCatalogSpec(spec)) {
        violations.push(
          violation(
            rootPath,
            `workspaces.catalogs.${catalogName}.${dependency}`,
            "Catalog entries must use bounded registry-compatible version ranges.",
          ),
        );
      }
    }
  }

  const releaseVersion = root.drawloom?.releaseVersion;
  if (!isNonEmptyString(releaseVersion)) {
    violations.push(
      violation(
        rootPath,
        "drawloom.releaseVersion",
        "The root workspace must declare the lockstep release version.",
      ),
    );
  }

  const exceptions = root.drawloom?.dependencyPolicy?.exceptions ?? [];
  const exceptionKeys = new Set<string>();
  for (const [index, item] of exceptions.entries()) {
    if (
      !isNonEmptyString(item.workspace) ||
      !dependencySections.includes(item.section) ||
      !isNonEmptyString(item.dependency) ||
      !isNonEmptyString(item.spec) ||
      !isNonEmptyString(item.reason)
    ) {
      violations.push(
        violation(
          rootPath,
          `drawloom.dependencyPolicy.exceptions.${index}`,
          "Every dependency exception requires workspace, section, dependency, spec, and reason.",
        ),
      );
      continue;
    }
    exceptionKeys.add(
      exceptionKey(item.workspace, item.section, item.dependency, item.spec),
    );
  }

  const usedExceptions = new Set<string>();
  const internalNames = new Set(
    workspaces.map(({ manifest }) => manifest.name).filter(isNonEmptyString),
  );

  const seenNames = new Map<string, string>();
  for (const { path, manifest } of workspaces) {
    if (!isNonEmptyString(manifest.name)) {
      violations.push(
        violation(path, "name", "Every workspace must declare a package name."),
      );
    } else {
      const existing = seenNames.get(manifest.name);
      if (existing !== undefined) {
        violations.push(
          violation(
            path,
            "name",
            `Package name ${manifest.name} is already declared by ${existing}.`,
          ),
        );
      } else {
        seenNames.set(manifest.name, path);
      }
    }

    if (manifest.type !== "module") {
      violations.push(
        violation(path, "type", 'Every workspace must use type "module".'),
      );
    }
    if (!isAllowedValue(packageRoles, manifest.drawloom?.role)) {
      violations.push(
        violation(
          path,
          "drawloom.role",
          `Package role must be one of: ${packageRoles.join(", ")}.`,
        ),
      );
    }
    if (!isAllowedValue(runtimeClasses, manifest.drawloom?.runtime)) {
      violations.push(
        violation(
          path,
          "drawloom.runtime",
          `Runtime class must be one of: ${runtimeClasses.join(", ")}.`,
        ),
      );
    }

    if (path.startsWith("apps/")) {
      if (manifest.private !== true) {
        violations.push(
          violation(path, "private", "Application workspaces must be private."),
        );
      }
      if (manifest.drawloom?.role !== "composition") {
        violations.push(
          violation(
            path,
            "drawloom.role",
            "Application workspaces must be composition roots.",
          ),
        );
      }
    }

    if (manifest.private !== true && manifest.version !== releaseVersion) {
      violations.push(
        violation(
          path,
          "version",
          `Publishable packages must use lockstep version ${releaseVersion ?? "<missing>"}.`,
        ),
      );
    }

    for (const section of dependencySections) {
      for (const [dependency, spec] of Object.entries(
        manifest[section] ?? {},
      )) {
        const key = exceptionKey(path, section, dependency, spec);
        if (exceptionKeys.has(key)) {
          usedExceptions.add(key);
          continue;
        }

        const field = `${section}.${dependency}`;
        if (internalNames.has(dependency)) {
          if (spec !== "workspace:*") {
            violations.push(
              violation(
                path,
                field,
                "Internal dependencies must use workspace:*.",
              ),
            );
          }
          continue;
        }

        if (!spec.startsWith("catalog:")) {
          violations.push(
            violation(
              path,
              field,
              "External dependencies must use a root catalog reference.",
            ),
          );
          continue;
        }

        if (!catalogContains(root, dependency, spec)) {
          violations.push(
            violation(
              path,
              field,
              `Dependency ${dependency} is missing from the referenced root catalog.`,
            ),
          );
        }
      }
    }
  }

  for (const item of exceptions) {
    const key = exceptionKey(
      item.workspace,
      item.section,
      item.dependency,
      item.spec,
    );
    if (exceptionKeys.has(key) && !usedExceptions.has(key)) {
      violations.push(
        violation(
          rootPath,
          "drawloom.dependencyPolicy.exceptions",
          `Dependency exception for ${item.workspace} ${item.dependency} is unused.`,
        ),
      );
    }
  }

  return violations;
};

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

export const discoverWorkspaceManifests = async (
  rootDirectory: string,
  patterns: string[],
): Promise<WorkspaceManifestInput[]> => {
  const manifests: WorkspaceManifestInput[] = [];
  const seenPaths = new Set<string>();

  for (const pattern of patterns) {
    if (pattern.startsWith("/") || pattern.split("/").includes("..")) {
      throw new Error(
        `Unsafe workspace pattern ${pattern}; patterns must remain inside the repository.`,
      );
    }

    const glob = new Bun.Glob(`${pattern}/package.json`);
    for await (const relativePath of glob.scan({
      cwd: rootDirectory,
      onlyFiles: true,
    })) {
      if (seenPaths.has(relativePath)) {
        continue;
      }
      seenPaths.add(relativePath);
      const manifest = await readJson<PackageManifest>(
        join(rootDirectory, relativePath),
      );
      manifests.push({ manifest, path: relativePath });
    }
  }

  return manifests.sort((left, right) => left.path.localeCompare(right.path));
};
