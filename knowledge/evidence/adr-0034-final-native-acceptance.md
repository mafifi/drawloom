---
type: evidence
id: adr-0034-final-native-acceptance
title: Node migration final native acceptance
status: active
created: 2026-09-22
updated: 2026-09-22
---

# Node migration final native acceptance

This record supersedes the current-status limitations of the [earlier artifact
record](adr-0034-release-acceptance.md), not its historical results. It supports
[ADR 0034](../../docs/adr/0034-node-toolchain.md). It is build-host acceptance,
not notarisation, clean-machine acceptance or a general claim of release readiness.

## One source revision and one signed artifact

Application source: `4fae98fda3fb9719e75c81e25766378b6a40ed42`, on
`feature/replaceable-capabilities`. The normal Icon Composer build regenerated
`Assets.car`; its source was unchanged and its exact output digest is below.
That generated output and this evidence are retained in a subsequent checkpoint
commit. No application implementation changed after the recorded build.

The artifact is `apps/desktop/src-tauri/target/release/bundle/macos/Drawloom.app`,
built by `pnpm run release:bundle`, then signed with Developer ID Application,
team `QJJ98A74J8`, timestamp **22 September 2026, 22:44:36** local time.
Signing was the last bundle mutation. Deep strict signature verification passed
again after native acceptance. The retained ZIP contains this signed app;
it is not a DMG or a notarised release.

| Tool | Version |
| --- | --- |
| Node | 24.20.0, darwin arm64 |
| pnpm | 12.5.1 |
| Rust | 1.98.1, repository-pinned toolchain |
| Tauri CLI | 2.11.4 |
| Xcode | 27.0 (27A266a) |
| Build-host macOS | 27.0 |
| Temporal CLI / server | 1.3.0 / 1.27.1 |

| Payload | SHA-256 |
| --- | --- |
| Upstream Node, checked before signing | `9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a` |
| Signed Node | `8422b08ab4a00313d4eb2fbcb5e946dd715c7af60776bceec0f803fa7547d1d6` |
| Signed native executable | `95f9638e98f039bd6b1b8918aa5223136dd49cf0fc9fbd558d2d92db68c2bf5a` |
| Bundled host main.mjs | `df15f113cf869d407167101ed100702aecea6b6e62503823526b71a885155c94` |
| LICENSE.node | `5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace` |
| Generated Assets.car | `c57f00fd2e2b23edd9b2844cf0f24bb55f5019e39b6725c6eee1e49e12306f19` |
| Drawloom-4fae98f-signed.zip | `2a9633fd53069e88ef41a433bfecaea2474997cb6a9ac5451e3812a57dfb6077` |

A subsequent **pre-notarisation** `Drawloom-0.0.0-preview-arm64.dmg` was built
from the same sealed app with an Applications shortcut and signed with the same
Developer ID. Its SHA-256 is
`ba473ff79da5d9f19202e0e95ffb773e29390320884bd048a76333a8f3eaf45e`.
Image checksum and signature verification passed. After mounting read-only,
the packaged app's executable hashes matched the table and `release:verify`
passed **9/9 from the mounted image**. The image was then unmounted. This proves
the DMG assembly on the build host, not notarisation, Gatekeeper acceptance on a
clean machine or the eventual stapled image's checksum.

Upstream and signed Node hashes intentionally differ. Packaging checked the
upstream bytes and licence notice before signing; the signed hashes identify
the executed artifact. The host has only `allow-jit`; the Rust UI shell has no
runtime exception. Library validation remains enabled.

## Executed gates

- Actual repository `check:ci`: passed, including **1607 Vitest tests passed,
  eight default skips**, Node tests and packed consumer/replacement checks.
- A new, untouched clone checked out the exact source SHA before its first
  frozen install and actual `check:ci`: passed with the same counts.
- Native Rust formatting, tests and checking: passed, **31/31**, zero ignored.
- Explicit knowledge-evaluation opt-in: **3/3**, including mounted browser and
  packed installed real-Temporal recovery. A stale RGB-only test expectation
  first failed against the OKLCH theme. The corrected test compares resolved
  semantic colours in both modes and its deliberate wrong-colour negative
  control failed before the restored test passed.
- Separate enforced browser suite: **3/3**. Core real Temporal: **7/7**.
  Evaluation recovery: **1/1**. Learning: **8/8** real-Temporal tests and the
  dedicated Vitest test covering all twelve journeys. These ran at `7ce76d7`;
  the only subsequent source change before `4fae98f` was the opt-in theme test.
- Bundled Temporal client against the final app's orchestration resources:
  **1/1**. This tests the packaged runtime independently of the native UI.
- Private consumer preparation, frozen install and canonical gate against the
  final public snapshot: **264 passed, two optional skips**, zero failures.
  Private content and detailed business fixtures remain outside this repository.

The final `release:verify` passed **9/9**: resource presence; shipped runtime and
notice; copied dependency closures; substantive knowledge authorization/RPC and
orchestration/Nightloom bundling; hardened signature; scoped entitlements; native
module loading; serving/clean shutdown; and host restart/forced termination.
The verifier is not substituted for native application testing below.

## Native pending-work recovery

The [native recovery fixture](../../apps/desktop/tests/native-recovery-runbook.md)
uses the real signed Tauri shell and bundled host, with a deterministic stdio
provider and an installed loopback MCP tool. It is **not a real Codex/model run**.

Each disposable project submitted one request through the native composer.
The UI showed a pending provider approval while the MCP effect remained in
flight. The corresponding native operation identity was captured before
termination. Reopening did not send another request.

| Case | Result |
| --- | --- |
| Native UI quit and reopen | Passed; clean exit, original history retained, unfinished effect shown as uncertain, old approval absent |
| Exact shell PID SIGKILL and reopen | Passed; no duplicate request/effect, uncertain outcome retained |
| Exact host PID SIGKILL, close shell and reopen | Passed; stale approval, Stop and Working controls removed after disconnect; uncertain tool activity remained visible and survived reopening |

All cases retained exactly one turn-start attempt, one admitted turn and one MCP
invocation, with no effect completion and no approval decision. Independent
read-only checks before and after each case verified selected conversation,
fixed project binding/directory, installation configuration, the exact tool
grant and a working-file checksum. Every recorded test process and controller
was stopped and its cleanup verified. Receipts remain with the disposable runs.

This closes the previously observed stale-approval and missing uncertain-history
defects for these exercised paths. Disconnected feedback still repeats
"Load failed" in multiple UI regions; this record does not claim that every
error-presentation detail has been polished.

Real Temporal interruption/recovery is established separately by its executed
suites; do not infer real Codex continuation from the deterministic native fixture.

## Credentials and existing installation

A separate synthetic OAuth-registration probe exercised the **actual signed-host
credential factory**, not only the keyring addon. Four independent host processes
verified OS storage mode, write/read, read after restart, deletion, and absence
after another restart. Each host exited cleanly and the synthetic registration
was removed. No real login, token exchange or refresh is claimed.

The existing local installation was backed up and the copy compared before its
final restart. The native app opened it at the existing port, retained its
project and conversations, and reopened the approved workbench viewer. Retained
video playback/pause and advancing narration playback were observed; portrait
and progressive review sections remained available. A second normal quit and
reopen succeeded without test data/runtime overrides. No user agent request,
new media generation or history reset occurred. This is technical playback
verification, not editorial or clinical acceptance.

## Explicit remaining limits

- Superseded for notarisation by the [notarised release record](adr-0034-notarised-release.md).
  Apple notarisation credentials were not configured at this checkpoint.
  Notarisation, stapling, final DMG acceptance and Mac-mini clean-machine installation
  remain subsequent gates. A Developer ID signature alone does not complete them.
- Native Codex live-review/model lanes were not run. Default OS credential and
  evaluation skips are not silently counted as passes; the distinct executed
  opt-in/factory evidence is recorded above.
- Installed GGUF/model-download qualification and private new-video/model-setup
  cases remain unrun. No download or paid-generation consent is inferred.
- This is macOS arm64 build-host evidence, not verification on every supported
  OS version or another architecture. The manual artifact gate still has no
  equivalent macOS CI job.
- Browser permission/network isolation evidence remains in its own records;
  these recovery tests do not claim a fresh exhaustive browser security audit.
