#!/usr/bin/env node
/**
 * Deliberate, packaging-time size prune for a `pnpm deploy --prod` output of
 * @drawloom/temporal-orchestration.
 *
 * WHY THIS EXISTS
 * ----------------
 * `pnpm deploy --prod` for @drawloom/temporal-orchestration currently produces a
 * ~675 MB tree. Two size drivers are dead weight for a shipped, single-target
 * macOS build, and neither can be removed by editing the library's own
 * package.json (it is a published library and legitimately declares what a
 * *general* consumer needs):
 *
 * 1. `@temporalio/core-bridge/releases/*` ships prebuilt native addons for
 *    FIVE platform/arch targets inside the files of ONE npm package.
 *    `pnpm deploy --cpu/--os/--libc` filters optionalDependencies entries; it
 *    cannot reach into files bundled inside a single package. core-bridge's
 *    own loader (`@temporalio/core-bridge/index.js`, `getPrebuiltPath()`)
 *    computes `releases/<arch>-<platform>/index.node` from
 *    `os.arch()`/`os.platform()` at require time and only ever touches that
 *    one path. A macOS arm64 build needs only `aarch64-apple-darwin`.
 *
 *    pnpm's virtual store additionally materializes an ORPHANED SECOND COPY
 *    of the entire core-bridge package (all five platforms again) under its
 *    content-hashed nested layout (`.pnpm/@temporalio/core-bridge/<version>/
 *    <hash>/node_modules/...`), separate from the hoisted flat copy
 *    (`.pnpm/@temporalio+core-bridge@<version>/node_modules/...`) that
 *    `.pnpm/node_modules/@temporalio/core-bridge` actually symlinks to.
 *    Verified by inode comparison: the two copies are independent files, not
 *    hardlinks, so both cost real disk space, and nothing in the tree
 *    symlinks into the nested copy — it is unreachable dead storage. This
 *    script prunes both copies wherever it finds them, not just the
 *    hoisted one.
 *
 * 2. `@swc/core-*` (native binaries only, not the small `@swc/core` JS
 *    wrapper), `@img/sharp-*`, `sharp`, `svgo`, `csso`, `lightningcss`
 *    (+ its native binary), `postcss`, `clean-css`, `cssnano`,
 *    `html-minifier-terser`, `imagemin`, `@minify-html/node`,
 *    `@napi-rs/image`, `@swc/css`, `@swc/html`, `uglify-js`, `esbuild`
 *    (+ its native binary) are optional
 *    peer dependencies of `minimizer-webpack-plugin`, which is webpack
 *    5.111's own default `optimization.minimizer`. `@temporalio/worker`'s
 *    workflow bundler (`@temporalio/worker/lib/workflow/bundler.js`) always
 *    builds its webpack config with `mode: "development"`, which defaults
 *    `optimization.minimize` to `false`; our sidecar's `webpackConfigHook`
 *    (src/sidecar.ts) never overrides that. Webpack only invokes a minimizer
 *    when `minimize` is true, so none of `minimizer-webpack-plugin`'s
 *    backends (each lazily `require()`d only when selected, see
 *    `minimizer-webpack-plugin/dist/utils.js`) ever runs. They were pulled
 *    into the deploy only because pnpm-workspace.yaml sets
 *    `autoInstallPeers: true`, which materializes every optional peer of
 *    every dependency, not because the sidecar loads them.
 *
 *    Separately, `@drawloom/temporal-orchestration`'s own containment check
 *    (`src/index.ts`, `prepareOwner`) rejects any workflow entrypoint whose
 *    path does not end in `.js`/`.cjs`/`.mjs`, so the bundler's `test: /\.ts$/`
 *    swc-loader rule can never match a real workflow module in production —
 *    reinforcing that the `@swc/core` native transform path is not
 *    reachable either. (The tiny `@swc/core` JS wrapper itself, ~0.1 MB, is
 *    left installed since `swc-loader`'s module-rule construction resolves
 *    it structurally; only its heavy native `@swc/core-*` platform binaries,
 *    which are genuinely never `require()`d, are pruned.)
 *
 *    This was verified empirically, not just by reading source: a real
 *    "bundle" invocation of the deployed, copied-away `dist/sidecar.js` was
 *    run under a `Module._load` trace; zero requires touched any of the
 *    packages this script removes.
 *
 * WHAT THIS IS
 * ------------
 * An explicit, reproducible, documented packaging step — run it after
 * `pnpm deploy --prod` and before the tree is copied into the app bundle.
 * It is NOT a general dependency-pruning tool and it does not hand-edit
 * anything inside a single dependency's own files; it removes whole,
 * clearly-identified optional package directories from node_modules/.pnpm
 * by name (in whichever of pnpm's on-disk layouts they appear — flat
 * hoisted, or nested content-hashed) and, for core-bridge only, prunes the
 * per-platform `releases/*` subdirectories that a single kept package still
 * doesn't need.
 *
 * IF THE BUILD TARGET CHANGES
 * ----------------------------
 * `--core-bridge-target` selects which `@temporalio/core-bridge/releases/*`
 * directory survives (default: derived from the running Node's
 * `process.platform`/`process.arch`, i.e. correct when run natively on the
 * machine class you are packaging for). A CROSS-BUILD (e.g. producing a
 * Windows or Intel-mac artifact on Apple Silicon CI) MUST pass the target
 * triple explicitly and MUST run this script once per target artifact — a
 * single pruned tree can only ever serve the one target triple it kept.
 * Running this script twice against the same deploy with two different
 * targets will leave only the second target's binary.
 *
 * The minifier-backend prune list has no target dependency: it is safe for
 * every platform, because it follows from `mode: "development"` and the
 * `.js`/`.cjs`/`.mjs`-only entrypoint containment check, both of which are
 * platform-independent behavior of this sidecar.
 *
 * USAGE
 *   node scripts/prune-orchestration-sidecar-runtime.mjs <deployedTreeDir> [--core-bridge-target=aarch64-apple-darwin] [--dry-run]
 */
import { readdir, rm, lstat, realpath, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import os from "node:os";

const ARCH_ALIAS = { x64: "x86_64", arm64: "aarch64" };
const PLATFORM_ALIAS = {
  darwin: "apple-darwin",
  linux: "unknown-linux-gnu",
  win32: "pc-windows-msvc",
};

/** Package "leaf paths" (as they appear under a node_modules/ directory,
 * scoped packages written as "@scope/name") that are optional peers of
 * webpack's default minimizer plugin and are never require()d by this
 * sidecar (see file header for the evidence). Only heavy native binaries are
 * listed for @swc; the small JS wrapper packages are left alone. */
const DEAD_MINIFIER_PEER_LEAVES = [
  "@swc/core-darwin-arm64",
  "@swc/core-darwin-x64",
  "@swc/core-linux-arm64-gnu",
  "@swc/core-linux-x64-gnu",
  "@swc/core-win32-x64-msvc",
  "@swc/css",
  "@swc/html",
  "@img/sharp-darwin-arm64",
  "@img/sharp-darwin-x64",
  "@img/sharp-libvips-darwin-arm64",
  "@img/sharp-libvips-darwin-x64",
  "@img/sharp-linux-arm64",
  "@img/sharp-linux-x64",
  "@img/sharp-win32-x64",
  "sharp",
  "svgo",
  "csso",
  "lightningcss-darwin-arm64",
  "lightningcss-darwin-x64",
  "lightningcss",
  "postcss",
  "clean-css",
  "cssnano",
  "html-minifier-terser",
  "imagemin",
  "@minify-html/node",
  "@napi-rs/image",
  "uglify-js",
  // esbuild is one more optional minifier backend of the same plugin, and is
  // never run for the same reason. It was missing from this list, which is how
  // the orchestration sidecar shipped three copies of an extensionless
  // `bin/esbuild` executable that the notary service rejected. Not shipping an
  // executable that never runs beats signing it.
  "esbuild",
  "@esbuild/darwin-arm64",
  "@esbuild/darwin-x64",
];

function parseArgs(argv) {
  const positionals = [];
  let coreBridgeTarget;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--core-bridge-target="))
      coreBridgeTarget = arg.slice("--core-bridge-target=".length);
    else positionals.push(arg);
  }
  if (positionals.length !== 1)
    throw new Error(
      "Usage: prune-orchestration-sidecar-runtime.mjs <deployedTreeDir> [--core-bridge-target=<triple>] [--dry-run]",
    );
  if (!coreBridgeTarget) {
    const arch = ARCH_ALIAS[os.arch()];
    const platform = PLATFORM_ALIAS[os.platform()];
    if (!arch || !platform)
      throw new Error(
        `Cannot infer a core-bridge target for ${os.arch()}/${os.platform()}; pass --core-bridge-target explicitly`,
      );
    coreBridgeTarget = `${arch}-${platform}`;
  }
  return { deployDir: resolve(positionals[0]), coreBridgeTarget, dryRun };
}

async function sizeOf(path) {
  let total = 0;
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) total += await sizeOf(full);
    else {
      try {
        total += (await lstat(full)).size;
      } catch {
        /* ignore races */
      }
    }
  }
  return total;
}

/**
 * Recursively walks a directory tree (never following symlinks — pnpm's
 * store is a dense symlink farm and following them would revisit the same
 * real content many times over and risks cycles) and calls `visit` with
 * every REAL directory found, depth-first, children before parents, so a
 * caller can safely delete matches without invalidating the remaining walk.
 */
async function walkRealDirectories(root, visit, depth = 0) {
  if (depth > 24) return; // guard against unexpected pathological nesting
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const full = join(root, entry.name);
    await walkRealDirectories(full, visit, depth + 1);
  }
  await visit(root);
}

function endsWithLeaf(path, leafSegments) {
  const parts = path.split(sep);
  if (parts.length < leafSegments.length) return false;
  return leafSegments.every(
    (segment, index) => parts[parts.length - leafSegments.length + index] === segment,
  );
}

async function removeIfExists(path, dryRun, removed) {
  try {
    await realpath(path);
  } catch {
    return; // does not exist (already removed as part of a parent match); nothing to do
  }
  const bytes = await sizeOf(path);
  removed.push({ path, bytes });
  if (!dryRun) await rm(path, { recursive: true, force: true });
}

async function pruneCoreBridgeReleases(deployDir, keepTarget, dryRun, removed) {
  // Walk node_modules itself: the hoisted linker places packages directly
  // there with no .pnpm virtual store, while the default linker nests them
  // under .pnpm. Walking the parent covers both.
  const modulesDir = join(deployDir, "node_modules");
  const coreBridgeDirs = [];
  await walkRealDirectories(modulesDir, async (dir) => {
    if (endsWithLeaf(dir, ["@temporalio", "core-bridge"])) coreBridgeDirs.push(dir);
  });
  for (const coreBridgeDir of coreBridgeDirs) {
    const releasesDir = join(coreBridgeDir, "releases");
    let targets;
    try {
      targets = await readdir(releasesDir);
    } catch {
      continue;
    }
    // Refuse to prune unless the target being kept is actually present. Without
    // this, a wrong or misspelled triple silently removes every platform and
    // produces a bundle whose native addon cannot load at runtime.
    if (!targets.includes(keepTarget))
      throw new Error(
        `core-bridge target ${keepTarget} is not present in ${releasesDir}; ` +
          `available: ${targets.join(", ")}. Refusing to prune every platform.`,
      );
    for (const target of targets) {
      if (target === keepTarget) continue;
      await removeIfExists(join(releasesDir, target), dryRun, removed);
    }
  }
}

/** Some matched packages contain their own internally-named subdirectory
 * (e.g. svgo/lib/svgo) that also matches a leaf pattern. Only the outermost
 * match in any such chain needs removing — drop matches that are nested
 * inside another match, so size accounting isn't double-counted. */
function keepOutermostMatches(paths) {
  const sorted = [...paths].sort((a, b) => a.length - b.length);
  const kept = [];
  for (const path of sorted) {
    if (!kept.some((ancestor) => path === ancestor || path.startsWith(`${ancestor}${sep}`)))
      kept.push(path);
  }
  return kept;
}

async function pruneDeadMinifierPeers(deployDir, dryRun, removed) {
  const modulesDir = join(deployDir, "node_modules");
  const matches = [];
  await walkRealDirectories(modulesDir, async (dir) => {
    for (const leaf of DEAD_MINIFIER_PEER_LEAVES) {
      const leafSegments = leaf.split("/");
      if (endsWithLeaf(dir, leafSegments)) {
        matches.push(dir);
        break;
      }
    }
  });
  for (const match of keepOutermostMatches(matches)) await removeIfExists(match, dryRun, removed);
}

/**
 * pnpm's virtual store is a symlink farm: removing a real package directory
 * leaves links elsewhere in the store pointing at nothing. Those dangling
 * links are not merely untidy — any consumer that walks the tree and resolves
 * links (Tauri's resource collector, `cp -RL`, tar) fails on them. Sweep them
 * after pruning so the tree is internally consistent.
 */
async function removeDanglingSymlinks(root, dryRun, removed) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isSymbolicLink()) {
      try {
        await stat(full); // resolves the link; throws when the target is gone
      } catch {
        removed.push({ path: full, bytes: 0 });
        if (!dryRun) await rm(full, { force: true });
      }
    } else if (entry.isDirectory()) {
      await removeDanglingSymlinks(full, dryRun, removed);
    }
  }
}

async function main() {
  const { deployDir, coreBridgeTarget, dryRun } = parseArgs(process.argv.slice(2));
  await realpath(deployDir); // fail fast if the deploy tree does not exist
  const removed = [];
  await pruneCoreBridgeReleases(deployDir, coreBridgeTarget, dryRun, removed);
  await pruneDeadMinifierPeers(deployDir, dryRun, removed);
  const dangling = [];
  await removeDanglingSymlinks(join(deployDir, "node_modules"), dryRun, dangling);
  if (dangling.length)
    console.log(
      `${dryRun ? "would remove" : "removed"} ${dangling.length} dangling symlink(s) left by the prune`,
    );
  const totalBytes = removed.reduce((sum, entry) => sum + entry.bytes, 0);
  for (const entry of removed.sort((a, b) => b.bytes - a.bytes))
    console.log(
      `${dryRun ? "[dry-run] would remove" : "removed"} ${(entry.bytes / 1_000_000).toFixed(1)} MB  ${entry.path}`,
    );
  console.log(
    `\n${dryRun ? "Would free" : "Freed"} ${(totalBytes / 1_000_000).toFixed(1)} MB total (core-bridge target kept: ${coreBridgeTarget})`,
  );
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
