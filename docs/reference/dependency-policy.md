# Dependency and package policy

This document is the current reference for the package metadata and dependency
rules decided by [ADR 0003](../adr/0003-typescript-bun-and-portable-packages.md).

## Version authority

The root `package.json` is the only authority for external dependency version
ranges. Its Bun workspace catalog records shared external ranges, while
`bun.lock` records the exact resolved dependency graph.

Workspace manifests declare usage without repeating version ranges:

```json
{
  "dependencies": {
    "zod": "catalog:",
    "@drawloom/example": "workspace:*"
  }
}
```

- Use `catalog:` for an external dependency in the default root catalog.
- Use `catalog:<name>` only when the root defines a named catalog with a clear
  lifecycle, such as a separately coordinated testing toolchain.
- Use `workspace:*` for another Drawloom workspace package.
- Do not use direct semver ranges, `*`, `latest`, URLs, Git repositories,
  `file:`, or `link:` in a workspace manifest by default.
- Put root-only development tools in the root `devDependencies` with their
  versions declared there.
- Put exceptional transitive compatibility overrides in root `overrides` or
  `resolutions`; do not disguise them as catalog policy.

Run `bun install` after changing the root catalog and commit the resulting
`bun.lock` change.

The root `drawloom.externalRuntimes` entry explicitly designates the MLX Python
requirements and hash-locked dependency file under ADR 0024. This is a
non-JavaScript runtime, installed independently after user consent; Bun cannot
resolve Python wheels. That designated lock is the version authority for the
isolated environment. Do not add ad-hoc pip dependencies, resolve `latest` during
setup or bundle the environment/weights into application packages. The JavaScript
catalog rule is unchanged. Runtime licence notices remain applicable.

## Package metadata

Each workspace manifest declares its architectural role and runtime:

```json
{
  "name": "@drawloom/example",
  "version": "0.0.0",
  "type": "module",
  "drawloom": {
    "role": "contract",
    "runtime": "portable"
  }
}
```

Allowed roles are `contract`, `provider`, `consumer`, `runtime`, and
`composition`. Allowed runtime classes are `portable`, `bun`, `node`,
`cloudflare`, and `tauri`.

Application workspaces are private composition roots. Publishable packages use
the root `drawloom.releaseVersion` until a later ADR adopts independent package
versions.

## Portability

A portable package may use standard ECMAScript and Web Platform APIs. It must
not import or expose ambient types or modules owned by Bun, Node.js, Cloudflare,
or Tauri. Host-specific behaviour crosses an explicit contract implemented by a
host-specific provider and selected at a composition root.

Passing tests under Bun proves Bun behaviour only. A package adds and runs a
target-specific verification lane before its manifest or documentation claims
Node.js, Cloudflare, or Tauri compatibility.

## Exceptions

An exception is narrow, reviewable, and recorded at the root. It identifies the
exact workspace path, dependency section, package, version specification, and
reason:

```json
{
  "workspace": "packages/example/example/package.json",
  "section": "dependencies",
  "dependency": "upstream-fixture",
  "spec": "^1.2.3",
  "reason": "The upstream compatibility fixture must exercise this range."
}
```

Add exceptions to `drawloom.dependencyPolicy.exceptions` in the root manifest.
The dependency-policy check rejects malformed and unused exceptions so they do
not become permanent escape hatches.

## Canonical commands

```sh
bun install --frozen-lockfile
bun run check:dependency-policy
bun run check:types
bun run test
bun run check:ci
```

`bun run check:ci` is the complete repository gate at the current foundation
stage.
