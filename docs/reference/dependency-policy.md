# Dependency and package policy

This is the reference for anyone adding a dependency or a new workspace
package: the package metadata and dependency rules decided by
[ADR 0003](../adr/0003-typescript-bun-and-portable-packages.md), whose toolchain
and `bun` runtime class are superseded by
[ADR 0034](../adr/0034-node-toolchain.md).

## Version authority

The root `package.json` is the only authority for external dependency version
ranges. Its workspace dependency catalog records shared external ranges, while
`pnpm-lock.yaml` records the exact resolved dependency graph.

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
- Put root-only development tools in the root `devDependencies` with a
  `catalog:` reference. Keep their version range in the root workspace catalog,
  like every other external dependency.
- Put exceptional transitive compatibility overrides in root `overrides` or
  `resolutions`; do not disguise them as catalog policy.

Run `pnpm install` after changing the root catalog and commit the resulting
`pnpm-lock.yaml` change.

The local embeddings package uses a JavaScript worker with a separately built
llama.cpp executable and Qwen GGUF model. The
[runtime and model manifest](../../packages/knowledge/local-embeddings/src/manifest.ts)
is the authority for their revisions, hashes and download availability; the
[runtime build script](../../scripts/build-llama-runtime.sh) pins the source used
to build the executable. Neither executable nor model weights are bundled with
the package. Do not duplicate those pins in root package metadata or resolve a
new version during setup. Runtime and model licence obligations still require
release review.

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
`composition`. Allowed runtime classes are `portable`, `node`,
`cloudflare`, and `tauri`.

Application workspaces are private composition roots. Publishable packages use
the root `drawloom.releaseVersion` until a later ADR adopts independent package
versions.

## Portability

A portable package may use standard ECMAScript and Web Platform APIs. It must
not import or expose ambient types or modules owned by Node.js, Cloudflare,
or Tauri. Host-specific behaviour crosses an explicit contract implemented by a
host-specific provider and selected at a composition root.

Passing in the Vitest suite proves behaviour against workspace source only. A
package adds and runs a target-specific verification lane before its manifest or
documentation claims Cloudflare or Tauri compatibility, and the real-Node lane
exercises built, packed and deployed files rather than source.

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
pnpm install --frozen-lockfile
pnpm run check:dependency-policy
pnpm run check:types
pnpm run test
pnpm run check:ci
```

`pnpm run check:ci` is the complete repository gate at the current foundation
stage.
