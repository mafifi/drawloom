# ADR 0003: Adopt TypeScript, Bun, and portable packages

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decision owners:** Drawloom maintainers

## Context

ADR 0001 selected TypeScript as Drawloom's initial implementation language but
left the package manager, build system, runtime support, and release model for a
later decision. Those choices must be explicit before the repository defines
its first capability contract.

Drawloom needs fast local iteration and one dependency graph while its
abstractions are still changing. It also needs public packages that can be used
outside the repository. The expected deployment environments include Bun,
Node.js, and resource-constrained provider runtimes such as Cloudflare Workers.
Future user interfaces will use SvelteKit, and a future local application will
use Tauri.

These environments are not interchangeable. Bun can be the repository
toolchain without becoming an ambient dependency of portable contracts.
Likewise, support for low-cost provider deployments must not make a provider's
SDK or runtime types part of the core architecture.

The existing private projects monorepo centralises external dependency versions
at its root, uses workspace references for internal packages, and relies on one
lockfile. Drawloom retains that single-authority model but must make it safe for
public package publication and enforce it mechanically from the beginning.

## Decision

### Use TypeScript and ESM as the product baseline

TypeScript is the default language for Drawloom contracts, runtime code,
providers, composition roots, command-line tools, and user interfaces.

- Repository TypeScript uses strict checking through a shared root
  configuration.
- Package boundaries use explicit exports.
- Published packages provide standard ESM JavaScript and TypeScript
  declarations. Uncompiled TypeScript may be an additional Bun-specific export,
  but it must not be the only public entry point.
- CommonJS output and dual-package support are not foundation requirements.
- Public types must not depend on generated or ambient types owned by a specific
  provider runtime.

### Use Bun as the canonical repository toolchain

Bun is the sole package manager, workspace manager, script runner, and primary
test runner for the initial repository.

- The root manifest pins the supported Bun version through `packageManager`.
- The repository commits `bun.lock`, and frozen lockfile installation is the CI
  default.
- Canonical development and verification commands run from the repository root.
- Additional task orchestration or build tools require a demonstrated need;
  they are not introduced merely to anticipate repository scale.

Using Bun for repository work does not imply that published portable packages
may import `bun:*` modules or require the `Bun` global.

### Separate portable packages from host integrations

Contract packages and the portable runtime kernel use standard ECMAScript and
Web Platform APIs wherever the platform supplies the required behaviour.
Capabilities that are not portable, including process execution, filesystem
access, durable persistence, clocks, cryptography, and provider bindings, cross
explicit contract boundaries.

Packages declare their runtime class and do not claim universal portability:

- `portable` packages support Bun and the declared Node.js support range, and
  are tested in a Workers-compatible runtime when they claim Cloudflare
  support;
- `bun`, `node`, `cloudflare`, or `tauri` packages may use APIs owned by that
  host, but must not leak those types through provider-independent contracts;
- composition roots select host-specific implementations and are the only
  packages that may assemble a deployment around them.

Node.js is a supported consumer runtime from the first public package release.
Its minimum version is declared in package metadata and exercised in CI. Bun
remains the repository's development runtime.

Cloudflare is a first-class deployment target for relevant portable packages,
providers, and SvelteKit applications. It is not the architecture's centre, and
not every capability must fit within a Workers execution model.

### Centralise external dependency versions with Bun catalogs

The root `package.json` is the only authority for external dependency version
ranges.

- Shared external versions live in the root Bun workspace catalog.
- Workspace manifests reference external dependencies with `catalog:` or an
  explicitly named catalog.
- Workspace manifests reference internal packages with `workspace:*` unless a
  stricter relationship is required by a later release decision.
- Root-only development tools declare their versions in the root manifest.
- Direct external versions, `*`, `latest`, URL dependencies, and Git
  dependencies in workspace manifests are rejected unless an explicit,
  documented exception permits them.
- Root-level overrides and resolutions are exceptional compatibility controls,
  not an alternative dependency catalog.
- `bun.lock` owns exact resolved versions; the catalog owns the requested
  version ranges.

Package and dependency metadata must be validated before publication. Packed
artifacts contain ordinary registry-compatible version ranges rather than
workspace or catalog protocols.

### Release public packages in lockstep initially

All publishable Drawloom packages share one version and are released from one
repository release during the foundation and pre-1.0 stages. Consumers may
install only the packages they need; lockstep versioning does not require an
umbrella package.

Independent package versioning requires a new ADR after real release cadence
and compatibility evidence show that its additional coordination cost is
worthwhile.

### Standardise the application boundaries

SvelteKit is the default framework for Drawloom user interfaces. Hosted
applications may use a Cloudflare composition and deployment adapter without
making SvelteKit or Cloudflare dependencies of the runtime kernel.

Tauri is the default shell for a future local desktop application. Rust is
permitted only inside the Tauri-owned native shell and command boundary. Core
contracts and product capability logic remain TypeScript unless a later ADR
establishes a narrower Rust-owned subsystem from concrete evidence.

### Enforce the decision in guidance and automation

Follow-up implementation must add:

- concise dependency and portability invariants to the root and package-local
  `AGENTS.md` files;
- current dependency-policy reference documentation;
- a repository check that validates manifests, catalog references, internal
  workspace references, runtime declarations, and lockstep package versions;
- CI checks for strict TypeScript, Bun tests, and dependency policy immediately;
  Node compatibility, claimed Workers compatibility, and packed publication
  artifacts are added when the first corresponding package makes those checks
  meaningful.

The repository must not describe these checks as enforced before their
implementations and CI wiring exist.

## Implementation

This decision is implemented at acceptance by the root Bun manifest and
lockfile, strict shared TypeScript configuration, workspace package metadata,
the dependency-policy validator and tests, the `apps/` composition-root guide,
and the GitHub Actions repository gate.

The workspace patterns reserve `apps/*` and `packages/*/*`, matching the
capability-first layout in ADR 0001. They intentionally discover zero product
workspaces at acceptance: the repository does not create empty capability or
application packages before their contracts and product surfaces are decided.

The current CI gate verifies every claim the repository can exercise at this
stage. Target-runtime and packed-artifact lanes become mandatory in the same
change that introduces a package making those compatibility or publication
claims.

## Consequences

- Contributors use one fast toolchain, dependency graph, and lockfile.
- External dependency upgrades occur once at the root instead of drifting
  across packages.
- Public package manifests retain bounded compatibility ranges when Bun
  resolves catalog and workspace protocols during packaging.
- Portable packages cannot use convenient host globals without crossing an
  explicit capability boundary.
- Runtime compatibility claims require more than passing the Bun test suite;
  they require target-specific verification.
- Lockstep releases simplify compatibility while contracts are unstable but
  may publish unchanged packages more often.
- Tauri introduces a contained Rust toolchain when the desktop application is
  created, without making Rust a second core implementation language.

## Alternatives considered

### Use Node.js and npm or pnpm as the repository toolchain

This would provide a conservative compatibility baseline, but it would give up
the preferred Bun development workflow without removing the need to test
Cloudflare and other hosts separately.

### Publish Bun-specific TypeScript source only

This would reduce initial build configuration but make Bun an unnecessary
consumer requirement and conflict with Node.js support.

### Copy the private monorepo's external `*` convention literally

Using `*` keeps workspace manifests short but would publish unbounded external
dependency compatibility. Bun catalogs preserve root version authority and are
resolved to normal version ranges when packages are packed.

### Declare versions independently in each workspace

This is conventional for independently maintained packages but creates
avoidable drift and upgrade work while Drawloom intentionally operates as one
repository and release train.

### Version every package independently

Independent versions reduce unnecessary releases for unchanged packages, but
they introduce compatibility matrices and release coordination before package
boundaries or consumer demand are established.

### Introduce a Rust runtime core immediately

Rust could provide strong performance and isolation properties, but it would
add language, packaging, and interoperation boundaries before profiling or
security evidence identifies a subsystem that needs them.
