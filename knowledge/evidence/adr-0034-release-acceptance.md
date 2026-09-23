# ADR 0034 release acceptance

Recorded 22 September 2026 for
[ADR 0034](../../docs/adr/0034-node-toolchain.md). One revision, one artifact.

This is the manual pre-release gate described in
[the desktop guide](../../apps/desktop/README.md). No CI job produces or checks
this artifact; that gap is audit finding F9.

## Current-status supersession (22 September 2026)

This immutable record remains evidence for only the revision and artifact named
below. Its statements that F11's UI lane did not run and that F8 was a live
inventory blind spot describe that recorded run, not current guidance. The
[current F8 closeout](../../docs/plans/pre-publication-audit.md#f8-the-licence-inventory-cannot-see-compiled-in-runtimes-medium-addressed)
and [current F11 closeout](../../docs/plans/pre-publication-audit.md#f11-testui-has-been-broken-since-the-migration-high-closed)
record the later artifact-specific inventory gate and separate CI UI lane.

The [final native acceptance record](adr-0034-final-native-acceptance.md) now
identifies a later Developer ID-signed artifact and its executed recovery checks.
It does not backfill those results into this historical run. Notarisation and
clean-machine acceptance remain separate.

## Revision and toolchain

| | |
| --- | --- |
| Revision | `19b691929e4582dfbe1dcf6e3a04ffb8585553a2` on `feature/replaceable-capabilities` |
| Working tree | clean at build time |
| Node | v24.20.0 (pinned; `engines.node` asserted against the runtime manifest) |
| pnpm | 12.5.1 |
| Rust | 1.98.1 (pinned by `apps/desktop/src-tauri/rust-toolchain.toml`) |
| Xcode | 27.0 |
| Signing identity | Apple Development (Mostafa Afifi, 39JAG4SDVF) |

The signing identity is a development certificate, not the Developer ID. It
exercises the same hardened runtime and library validation; a distributable
build needs the Developer ID and notarisation, neither of which is done.

## Checksums, kept distinct

Signing rewrites the Mach-O, so an upstream digest and a signed digest are
different numbers for the same file and must never be compared to each other.

| Artifact | SHA-256 |
| --- | --- |
| Node runtime, **upstream** (checked before signing) | `9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a` |
| Node runtime, **as signed in the bundle** | `2badfaf5d0c9c23e0fde2a3fcbd782fbc395a34ba21d0f76049cd7a370d78eda` |
| `LICENSE.node` (not signed; digest stable) | `5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace` |
| Application executable, as signed | `102863168c3e1a0b5f16c1d0a403579babef0d377a904917e17261caecc94c13` |

## Result

`pnpm run release:verify` — **9/9**:

1. resources present — host, web and both sidecars
2. shipped Node runtime matches its manifest and ships its notice
3. sidecar closures survived the resource copy
4. **both packaged sidecars answer their protocols** — knowledge completes a
   framed request including the authorization exchange; orchestration bundles a
   workflow and reports a fingerprint. Run by the shipped `node` from inside the
   signed bundle.
5. signature is valid and hardened
6. **entitlements are the reviewed minimum, and scoped to the host** —
   `allow-jit` on the Node runtime, and NOT on the UI shell
7. native modules load under the hardened runtime — keychain, sqlite-vec, core-bridge
8. host serves and shuts down cleanly
9. restart and forced termination — state survives a graceful restart and a
   SIGKILL, and recovery reports nothing as running

Checks 2, 4, 6 and 9 did not exist before this work. The run was repeated
immediately on the same artifact and returned 9/9 again, which is how the
verifier is shown to leave the bundle unmodified — an earlier version of check 4
wrote inside the `.app` and broke its own signature.

## Not covered

- **The signing identity is a development certificate**, not the Developer ID.
  It exercises the same hardened runtime and library validation, so every check
  above is meaningful — but the artifact is NOT distributable and cannot be
  notarised. A release means re-signing with the Developer ID and re-running
  this because the certificate and distribution requirements change. Both the
  Apple Development and Developer ID certificates use Team ID `QJJ98A74J8`; this
  is not a signing-team change.
- **A4 is only partly established.** Check 9 kills the host and confirms state
  survives; it does not interrupt work in flight. The synthetic provider
  completes a turn faster than the check can observe, and forcing a pending
  approval needs an injected driver. No-duplicate-execution and
  unknown-rather-than-guessed recovery are proved by `test:temporal` against a
  real Temporal server. See audit finding F12.
- **The Tauri shell is never launched.** It opens a window and needs a session
  this check cannot assume. It spawns exactly this host from exactly this
  bundle, so state and recovery are covered and the GUI is not.
- **`test:ui` does not run at all** — broken since the migration, audit finding
  F11. The browser acceptance matrix is exercised nowhere.
- **The credential check proves the binding, not the absence of a fallback.**
  The keychain probe round-trips through `@napi-rs/keyring` directly, which has
  no fallback, so a rejected binding fails loudly. It does NOT go through
  `createPluginCredentialStore`, which CAN fall back to session storage — the
  failure mode recorded in `native-browser-permission-readiness.md`, where a
  Team ID mismatch was rejected by library validation and credentials silently
  degraded. A pre-migration test asserted `store.mode === "os"` for exactly
  this; it depended on the deleted Bun builder and was not ported. Worth adding
  when the Developer ID signing run happens, since that changes the certificate
  and distribution requirements, not the Team ID.
- Notarisation, and installation on a clean machine.
- Any CI equivalent of this gate (F9).
