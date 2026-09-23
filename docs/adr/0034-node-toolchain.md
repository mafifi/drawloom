# ADR 0034: Run and ship Drawloom on Node

- **Status:** Accepted
- **Date:** 2026-09-21
- **Decision owners:** Drawloom maintainer
- **Supersedes:** [ADR 0003](0003-typescript-bun-and-portable-packages.md), its
  Bun toolchain and `bun` runtime class only. Its TypeScript, ESM, portability,
  dependency-catalog and lockstep-release decisions stand.

## Context

The desktop host is compiled with `bun build --compile`, which embeds Bun's
runtime in the shipped binary. Bun's MIT licence does not cover everything that
runtime bundles: the pinned release declares LGPL JavaScriptCore/WebKit and
LGPL-2.1 TinyCC.
[ADR 0026](0026-permissive-dependencies-and-local-gguf-embeddings.md) excludes
LGPL from components Drawloom distributes or installs, so the artifact cannot
ship as built. The JavaScript dependency gate did not establish clearance
because it inventories npm and Rust packages, not an embedded native runtime.

Running Bun as a development tool while shipping something else is not a stable
position either. Bun does not implement `node:sqlite`, so a repository that
ships Node and tests on Bun cannot run its own host tests: moving two packages
to `node:sqlite` during a migration proof broke 47 tests on import. The two
runtimes cannot both be satisfied without compatibility code in the product.

Drawloom has no users and nothing in production. There is no installed base to
preserve and no data to migrate.

## Decision

Node is the runtime Drawloom ships, develops against and tests on. Pin one exact
Node version for development, CI and the shipped runtime, and keep them equal.

The toolchain becomes: **pnpm** for dependencies and workspaces, **Vitest** for
tests, **esbuild** for JavaScript bundling, **Vite** for the application build,
and **Tauri** for desktop packaging. Each is used as intended.

`drawloom.runtime` loses `"bun"`, leaving `portable`, `node`, `cloudflare` and
`tauri`.

The host ships as an esbuild bundle executed by a pinned Node runtime inside the
application, replacing the single-file compiled binary. Its macOS entitlements
are derived from the shipped Node build's own requirements and verified under
hardened signing.

**No compatibility layer is written for either runtime.** Where a standard tool
cannot meet a requirement, the gap is documented and discussed rather than
worked around. The migration must reduce bespoke infrastructure, not replace it
with different bespoke infrastructure — `pnpm deploy` therefore replaces the
repository's hand-rolled dependency staging, and the schema converters written
for users who do not exist are deleted rather than ported.

## Alternatives considered

**A narrow LGPL distribution exception for Bun's runtime.** Drafted and
evaluated: satisfy LGPL by retaining the exact Bun, patched WebKit and TinyCC
sources, proving recipients can rebuild them, and distributing those materials
by a reviewed method. An investigation took this route far enough to price it,
and the price was the reason for the pivot:

- Pinned Bun `bun-v1.2.23` (`cf1367137da5775dc23cb57f0e4071776e1ff90f`) selects
  patched WebKit `69fa2714ab5f917c2d15501ff8cfdccfaea78882` and TinyCC
  `29985a3b59898861442fa3b43f663fc1af2591d7`.
- **Upstream's own licence instructions do not match its build system.** The
  pinned `LICENSE.md` describes `make jsc`; run against that exact checkout it
  fails with `No rule to make target 'jsc'`. The contributor guide documents a
  different CMake route instead. Publishing a rebuild procedure therefore means
  authoring and maintaining one upstream does not provide.
- The default WebKit setup downloads a prebuilt archive, so a build against
  defaults proves nothing about rebuilding WebKit; only `WEBKIT_LOCAL=ON` does.
- TinyCC needed its own inclusion and licence review. JavaScriptCore alone is
  not a complete bundled-runtime inventory.
- The investigation never reached a successful relink: WebKit source build and
  host recreation remained outstanding when it stopped.

Rejected because the obligation recurs for every released version and grows with
each runtime bump, and because discharging it means maintaining a rebuild recipe
upstream does not supply — where the migration is bounded and paid once.
Admitting LGPL into the one component every user executes would also contradict
ADR 0026's refusal of a GPL-with-exception dependency, which cost a working MLX
implementation.

**Shipping Bun as a separate sidecar rather than compiled in.** Would make LGPL
compliance nearly trivial, since a recipient could replace the file. Rejected:
ADR 0026 governs what Drawloom distributes, not how it links, so this does not
clear the policy.

**Shipping Node while retaining Bun for development.** Rejected on evidence.
Bun cannot load `node:sqlite`, so the test suite cannot exercise the shipping
runtime, and the repository would hold two runtimes together with the
compatibility code needed to satisfy both.

**Requiring a user-installed Node.** Smallest artifact and nothing to licence-
review, but it breaks the accessible local start in Principle 6 and pins the
product to whichever Node the user happens to have.

## Evidence

A migration proof on a branch established that the application runs on Node
before this decision was taken: the host bundles with esbuild and serves the
real application; the evaluation and conversation-history stores pass their
existing shared conformance suites against `node:sqlite`; `node:sqlite` loads
the `sqlite-vec` extension on the pinned version, which
`packages/knowledge/sqlite-knowledge` already relies on.

The same proof established the limits recorded above: Bun's missing
`node:sqlite`, the absence of a `maxRequestBodySize` equivalent, and the loss of
automatic content typing when `Bun.file` is replaced by a stream.

Proof is not delivery, and this record was accepted only once delivery was
verified. The full suite passes on Vitest with a separate real-Node lane; the
repository gates pass; `pnpm deploy` assembles the sidecars and a signed
`Drawloom.app` ran under the hardened runtime, serving the application and
shutting down cleanly; the Keychain addon, sqlite-vec's SQLite extension and
Temporal's native core-bridge all load inside that bundle; and real local
Temporal recovery passes, including whole-host process loss and dead-ownership
reclaim.

**Packaging and signing are a manual pre-release gate, not a continuous one.**
There is no macOS runner in `.github/workflows/`, so no CI job builds a `.app`,
signs it, or runs its acceptance checks; a green CI run says nothing about the
shipped artifact. The gate is `release:bundle`, `release:sign` and
`release:verify`, written down in
[the desktop guide](../../apps/desktop/README.md). This is the same shape as
audit finding F2 — a safeguard proved only by checks CI never ran — and is
recorded as an open finding rather than left to read as automated.

The acceptance run for a given build is recorded in
[knowledge/evidence/adr-0034-release-acceptance.md](../../knowledge/evidence/adr-0034-release-acceptance.md),
which ties one revision and one artifact to its toolchain, its checksums and
its result. The upstream and signed digests of the Node runtime are recorded
separately, because signing rewrites the Mach-O and the two are different
numbers for the same file.

**The signature described above is no longer valid**: a later documentation
pass edited README files inside the bundle, and anything written into a `.app`
after signing invalidates it. The cause was a process error, not a defect in
signing; the artifact awaits a rebuild and re-verification, and signing is now
recorded as the last mutation of the bundle. Notarisation and clean-machine
installation remain outstanding.

Two findings changed the shipped result. Tauri's resource copy does not preserve
symlinks, so sidecars deployed with pnpm's default linker arrived in the bundle
with no dependency closure while the application still started and served; they
are deployed with the hoisted linker and a packaging check now asserts it.
Entitlements were then reduced by testing rather than inheritance: signing every
Mach-O payload the bundle ships leaves `allow-jit` as the only requirement, so
library validation stays enabled and Node's `get-task-allow` never ships.

## Consequences

- One runtime to reason about. Tests execute what ships.
- The shipped artifact is a bundle plus a Node runtime rather than one file.
  That runtime must enter the licence inventory, which the current gate does not
  cover — the same blind spot recorded as audit finding F8.
- Five permissively licensed dependencies are adopted, two of them in the
  product, each requiring ADR 0026 review.
- Contributors change toolchain: `pnpm` for installs and scripts, `vitest` for
  tests. Existing guidance that instructs otherwise is corrected.
- `bun.lock` is replaced by `pnpm-lock.yaml`; the dependency catalog carries
  across unchanged because pnpm uses the same `catalog:` syntax.
- Retained spikes keep their Bun code as historical evidence. They are not built
  or run, and the ADRs that recorded why Bun was chosen remain intact.

## Editorial status note (22 September 2026)

This note records a current implementation status; it does not amend this
accepted decision, its rationale, or its historical release evidence. The F8
inventory consequence is now implemented: `KnownNodeRuntime` identifies the
distributed runtime, staging verifies the upstream runtime bytes and its notice,
and the final `bundle:host` step checks the staged artifact. The dependency-graph
gate, `check:licenses`, remains necessary but does not by itself inventory the
bytes that survive packaging. See the [F8 closeout in the pre-publication
audit](../plans/pre-publication-audit.md#f8-the-licence-inventory-cannot-see-compiled-in-runtimes-medium-addressed).

The [final native acceptance record](../../knowledge/evidence/adr-0034-final-native-acceptance.md)
identifies the later Developer ID-signed artifact, exact checksums, canonical and
clean-clone gates, and native pending-work recovery results. It preserves the
earlier artifact's history and distinguishes executed acceptance from the still
outstanding notarisation and clean-machine installation gates.
The [notarised release record](../../knowledge/evidence/adr-0034-notarised-release.md)
closes notarisation: build `d3ef2de` was accepted by Apple and installed on the
clean test Mac. It also records the defects the earlier artifacts exposed, and
the desktop-session checks still outstanding.
