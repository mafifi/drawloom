import { mkdtemp, rm, copyFile, writeFile, readFile, cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { discoverWorkspaceManifests, type WorkspaceManifestInput } from "./dependency-policy.ts";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { build as esbuild } from "esbuild";

/** One disposable installed closure. Public packages load built tarball exports;
 * desktop-only code is separately compiled outside the checkout, then runs on Node. */
const repository = process.cwd();
const directory = await mkdtemp(join(tmpdir(), "drawloom-replacement-consumer-"));
try {
  const workspaces = await discoverWorkspaceManifests(repository, ["packages/*/*"]);
  const byName = new Map(workspaces.map((workspace) => [workspace.manifest.name, workspace]));
  const selected = new Map<string, WorkspaceManifestInput>();
  function include(name: string) {
    if (selected.has(name)) return;
    const workspace = byName.get(name);
    if (!workspace || workspace.manifest.private) throw Error("Public package missing: " + name);
    selected.set(name, workspace);
    for (const dependency of Object.keys(workspace.manifest.dependencies ?? {}))
      if (dependency.startsWith("@drawloom/")) include(dependency);
  }
  const desktop = JSON.parse(
    await readFile(join(repository, "apps/desktop/package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  // The desktop application is a binary distribution: its host is bundled, so
  // the packages it composes are declared as build inputs, and only unbundlable
  // natives remain runtime dependencies. This check is about what a consumer
  // installs from published tarballs, so it reads both sections.
  const desktopComposed: Record<string, string> = {
    ...(desktop.dependencies ?? {}),
    ...desktop.devDependencies,
  };
  // The dependency catalog moved to pnpm-workspace.yaml.
  const { catalog } = parseYaml(
    await readFile(join(repository, "pnpm-workspace.yaml"), "utf8"),
  ) as { catalog: Record<string, string> };
  for (const name of [
    "@drawloom/replacement-examples",
    "@drawloom/default-context",
    "@drawloom/local-authorization",
    "@drawloom/deterministic-authorization",
    "@drawloom/authorization-scheduler",
    ...Object.keys(desktopComposed).filter((name) => name.startsWith("@drawloom/")),
  ])
    include(name);
  const dependencies: Record<string, string> = {};
  const externals = new Set<string>(Object.keys(desktop.optionalDependencies ?? {}));
  for (const [name, workspace] of selected) {
    const archive = join(directory, name.replaceAll("/", "-") + ".tgz");
    const packed = spawnSync("pnpm", ["pack", "--out", archive], {
      cwd: dirname(resolve(repository, workspace.path)),
    });
    if (packed.status !== 0)
      throw Error("Could not pack " + name + ": " + packed.stderr.toString());
    dependencies[name] = "file:" + archive;
    for (const dependency of Object.keys(workspace.manifest.dependencies ?? {}))
      if (!dependency.startsWith("@drawloom/")) externals.add(dependency);
  }
  for (const [name, version] of Object.entries({
    ...desktopComposed,
    "@modelcontextprotocol/sdk": desktop.devDependencies["@modelcontextprotocol/sdk"]!,
    "@modelcontextprotocol/ext-apps": desktop.devDependencies["@modelcontextprotocol/ext-apps"]!,
  })) {
    if (name.startsWith("@drawloom/")) continue;
    const pinned = version === "catalog:" ? catalog[name] : version;
    if (!pinned) throw Error("Missing pinned desktop dependency: " + name);
    dependencies[name] = pinned;
    externals.add(name);
  }
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies,
    }),
  );
  // Transitive @drawloom requirements must resolve to the packed tarballs too,
  // never the registry. pnpm reads overrides from pnpm-workspace.yaml, and the
  // file also makes this directory a self-contained pnpm project.
  await writeFile(
    join(directory, "pnpm-workspace.yaml"),
    "packages: []\noverrides:\n" +
      Object.entries(dependencies)
        .map(([name, specifier]) => `  "${name}": "${specifier}"`)
        .join("\n") +
      "\n",
  );
  const run = (command: string[], env?: Record<string, string | undefined>) => {
    const [executable, ...args] = command;
    if (!executable) throw Error("A command requires an executable");
    const result = spawnSync(executable, args, {
      cwd: directory,
      ...(env ? { env } : {}),
    });
    if (result.status !== 0)
      throw Error(
        command.join(" ") +
          " failed:\n" +
          result.stdout.toString() +
          "\n" +
          result.stderr.toString(),
      );
    process.stdout.write(result.stdout);
  };
  // This fixture's bundle sits at the root of the installation and imports its
  // external packages directly, so those packages must resolve from the
  // bundle's own location. Hoisting is one arrangement that achieves that, not
  // a requirement of bundles in general: placing the bundle inside the package
  // whose dependencies it needs works equally well, and is what the desktop
  // host does. Hoisting is used here only to keep this fixture a flat, single
  // disposable directory, and says nothing about the shipped layout.
  run(["pnpm", "install", "--ignore-scripts", "--no-lockfile", "--node-linker=hoisted"]);
  await copyFile(
    join(repository, "scripts/fixtures/replacement-consumer.mjs"),
    join(directory, "consumer.mjs"),
  );
  run(["node", "consumer.mjs"]);

  // Copy only the public application's own files. No workspace node_modules, package
  // sources, tsconfig aliases or checkout manifests are available to this build.
  for (const subtree of ["apps/desktop/host", "apps/desktop/src/lib"]) {
    await mkdir(dirname(join(directory, subtree)), { recursive: true });
    await cp(join(repository, subtree), join(directory, subtree), { recursive: true });
  }
  for (const file of [
    "apps/desktop/tests/approval-conformance-fixture.ts",
    "apps/desktop/tests/learning-conformance-fixture.ts",
    "apps/desktop/tests/knowledge-authority-fixture.ts",
    "scripts/fixtures/replacement-application-consumer.mjs",
  ]) {
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await copyFile(join(repository, file), join(directory, file));
  }
  // Without the `drawloom-source` condition, resolution must select the published
  // import/dist exports. The source map below proves it did.
  await esbuild({
    entryPoints: [join(directory, "scripts/fixtures/replacement-application-consumer.mjs")],
    outfile: join(directory, "application-consumer.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    sourcemap: "external",
    external: [...externals],
    absWorkingDir: directory,
  });
  const map = JSON.parse(
    await readFile(join(directory, "application-consumer.mjs.map"), "utf8"),
  ) as { sources: string[] };
  const publicSources = map.sources.filter((source) => source.includes("/@drawloom/"));
  if (
    !publicSources.length ||
    publicSources.some((source) => !source.includes("/dist/") || source.includes(repository))
  )
    throw Error("Application build did not exclusively use installed public dist exports");
  if (map.sources.some((source) => source.includes(repository) || source.includes("/packages/")))
    throw Error("Application build escaped the installed dependency closure");
  const runtimeEntrypoint = join(
    directory,
    "node_modules/@drawloom/local-knowledge-runtime/dist/sidecar.js",
  );
  run(["node", "application-consumer.mjs"], {
    ...process.env,
    DRAWLOOM_CONFORMANCE_RUNTIME: runtimeEntrypoint,
  });
  console.log(
    "Installed application artifact used " +
      publicSources.length +
      " public dist modules; rendering remains the separate built-browser matrix.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
