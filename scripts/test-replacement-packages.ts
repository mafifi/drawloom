import { mkdtemp, rm, copyFile, writeFile, readFile, cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { discoverWorkspaceManifests, type WorkspaceManifestInput } from "./dependency-policy.ts";

/** One disposable installed closure. Public packages load built tarball exports;
 * desktop-only code is separately compiled outside the checkout, then runs in Bun. */
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
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    optionalDependencies: Record<string, string>;
  };
  const root = JSON.parse(await readFile(join(repository, "package.json"), "utf8")) as {
    workspaces: { catalog: Record<string, string> };
  };
  for (const name of [
    "@drawloom/replacement-examples",
    "@drawloom/default-context",
    "@drawloom/local-authorization",
    "@drawloom/deterministic-authorization",
    "@drawloom/authorization-scheduler",
    ...Object.keys(desktop.dependencies).filter((name) => name.startsWith("@drawloom/")),
  ])
    include(name);
  const dependencies: Record<string, string> = {};
  const externals = new Set<string>(["bun:*", ...Object.keys(desktop.optionalDependencies)]);
  for (const [name, workspace] of selected) {
    const archive = join(directory, name.replaceAll("/", "-") + ".tgz");
    const packed = Bun.spawnSync(["bun", "pm", "pack", "--filename", archive, "--quiet"], {
      cwd: dirname(resolve(repository, workspace.path)),
      stdout: "pipe",
      stderr: "pipe",
    });
    if (packed.exitCode !== 0)
      throw Error("Could not pack " + name + ": " + packed.stderr.toString());
    dependencies[name] = "file:" + archive;
    for (const dependency of Object.keys(workspace.manifest.dependencies ?? {}))
      if (!dependency.startsWith("@drawloom/")) externals.add(dependency);
  }
  for (const [name, version] of Object.entries({
    ...desktop.dependencies,
    "@modelcontextprotocol/sdk": desktop.devDependencies["@modelcontextprotocol/sdk"]!,
    "@modelcontextprotocol/ext-apps": desktop.devDependencies["@modelcontextprotocol/ext-apps"]!,
  })) {
    if (name.startsWith("@drawloom/")) continue;
    const pinned = version === "catalog:" ? root.workspaces.catalog[name] : version;
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
      overrides: dependencies,
    }),
  );
  const run = (command: string[], env?: Record<string, string | undefined>) => {
    const result = Bun.spawnSync(command, {
      cwd: directory,
      stdout: "pipe",
      stderr: "pipe",
      ...(env ? { env } : {}),
    });
    if (result.exitCode !== 0)
      throw Error(
        command.join(" ") +
          " failed:\n" +
          result.stdout.toString() +
          "\n" +
          result.stderr.toString(),
      );
    process.stdout.write(result.stdout);
  };
  run(["bun", "install", "--offline", "--ignore-scripts"]);
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
  // Node resolution selects public import/dist exports (not development bun/src
  // conditions). Bun-only application builtins stay external and execute under Bun.
  run([
    "bun",
    "build",
    "scripts/fixtures/replacement-application-consumer.mjs",
    "--target",
    "node",
    "--sourcemap=external",
    "--outdir",
    ".",
    "--entry-naming",
    "application-consumer.mjs",
    ...[...externals].flatMap((name) => ["--external", name]),
  ]);
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
  run(["bun", "application-consumer.mjs"], {
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
