# Shipped Node runtime determination

Determined 22 September 2026 for
[ADR 0034](../docs/adr/0034-node-toolchain.md), which replaced a compiled
single-file host with an esbuild bundle executed by a pinned Node runtime.

Drawloom **distributes** that runtime inside `Drawloom.app`, so it is a native
artifact under [ADR 0026](../docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md),
not a development tool. The migration itself was caused by an embedded runtime
whose bundled terms nobody had recorded; this record exists so the replacement
does not repeat that.

## Artifact

| Property | Value |
| --- | --- |
| Identity | `node-darwin-arm64` |
| Version | 24.20.0 (official prebuilt release build) |
| Declared licence | MIT (Node itself) |
| Binary SHA256 (upstream, pre-signing) | `9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a` |
| `LICENSE` SHA256 | `5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace` |

The authority is
[`apps/desktop/host/node-runtime.ts#KnownNodeRuntime`](../apps/desktop/host/node-runtime.ts).
`scripts/stage-node-runtime.ts` re-derives the version, architecture and both
digests from the files packaging has just copied, and fails rather than carrying
a mismatch forward. `engines.node` is asserted against the same manifest, so a
version bump that misses this record cannot reach a release.

**The signed artifact has a different digest.** Signing rewrites the Mach-O, so
the value above is the upstream binary only. The signed bundle's checksum belongs
in the release evidence for that build; comparing a signed bundle against this
digest will always fail, and conflating the two makes the check useless.

## Copyleft in Node's LICENSE, and why it does not apply

Node's `LICENSE` is an aggregate: MIT for Node, followed by the terms of
everything Node bundles. Two sections quote the GNU General Public License, so a
reader scanning for "GPL" will find hits. They cover, by the file headings in the
text itself:

- `aclocal.m4` (only for ICU4C) — the `pkg.m4` pkg-config macros
- `config.guess` (only for ICU4C)

Both are **build-time autoconf files for ICU4C** and carry the standard Autoconf
exception, which the text states and then confirms applies:

> As a special exception to the GNU General Public License, if you distribute
> this file as part of a program that contains a configuration script generated
> by Autoconf, you may include it under the same distribution terms that you use
> for the rest of that program.

Neither file is compiled or linked into the `node` executable, and neither is
distributed by Drawloom: only the built binary and this notice ship. No GPL or
LGPL component is linked into the runtime Drawloom distributes, so ADR 0026's
exclusion is not engaged.

## Notice obligation

Because the aggregate text carries the terms of everything Node bundles, it must
ship rather than be summarised. It is copied beside the binary as
`LICENSE.node`, and `scripts/verify-macos-app.mjs` fails the release if it is
absent or its digest does not match.

`bundle:host` previously copied the executable alone. The notice was missing from
the bundle until this record was written — recorded here so the omission is part
of the history rather than quietly corrected.
