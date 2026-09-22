# ADR 0034 release acceptance

Recorded 22 September 2026 for
[ADR 0034](../../docs/adr/0034-node-toolchain.md). One revision, one artifact.

This is the manual pre-release gate described in
[the desktop guide](../../apps/desktop/README.md). No CI job produces or checks
this artifact; that gap is audit finding F9.

## Revision and toolchain

| | |
| --- | --- |
| Revision | `d9ae2166c567a0d97b80aa5c3cd716153058c001` on `node-migration` |
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
| Node runtime, **as signed in the bundle** | `621cb078d69f460dd85432c0420a57bd64036ab04bbae3bc1a322e7669eb1993` |
| `LICENSE.node` (not signed; digest stable) | `5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace` |
| Application executable, as signed | `6a94252c5021f5422e0538779aa86db091a6d5c6cbcca59dc78d6826cc3952ec` |

## Result

`pnpm run release:verify` — **8/8**:

1. resources present — host, web and both sidecars
2. shipped Node runtime matches its manifest and ships its notice
3. sidecar closures survived the resource copy
4. signature is valid and hardened
5. entitlements are the reviewed minimum — `allow-jit` only
6. native modules load under the hardened runtime — keychain, sqlite-vec, core-bridge
7. host serves and shuts down cleanly
8. restart and forced termination — state preserved; a killed operation
   recovers without claiming completion

Checks 2 and 8 did not exist before this record. Check 2 exists because
`bundle:host` shipped the Node runtime without its licence notice. Check 8
exists because graceful shutdown was the only lifecycle being proved.

## Not covered

- The Tauri shell is not launched. It opens a window and needs a session this
  check cannot assume; it spawns exactly this host from exactly this bundle,
  so state and recovery are covered and the GUI is not.
- Notarisation.
- Installation on a clean machine.
- Any CI equivalent (F9).
