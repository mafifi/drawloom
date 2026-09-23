---
type: evidence
id: adr-0034-notarised-release
title: Node migration notarised release artifact
status: active
created: 2026-09-23
updated: 2026-09-23
---

# Node migration notarised release artifact

This record follows the [final native acceptance record](adr-0034-final-native-acceptance.md)
and closes its notarisation limit. It supports
[ADR 0034](../../docs/adr/0034-node-toolchain.md). Verified 23 September 2026.
The DMG was assembled and notarised with the
[macOS release workflow](../../docs/reference/macos-release.md).

## First notarisation attempt: rejected

Apple's notary service rejected the first DMG (build `c1491d5`, status Invalid).
The only cause was three copies of esbuild's extensionless `bin/esbuild`, which
had kept their upstream ad-hoc signature. The signer chose payloads by file
extension. `codesign --verify --deep --strict` accepts ad-hoc nested code, so
local verification had passed. Commit `3c6c646` selects payloads by Mach-O
content, checks every payload's team, hardened runtime and timestamp, and prunes
esbuild, which never executes. The rejected image and its receipts are retained
outside Git.

## Second artifact: accepted, then superseded

Build `3c6c646`: submission `847a84bc-275f-4a25-8d79-4da9d95ea4b0`, Accepted,
stapled SHA-256 `fbd361ba891c31bee9ca3d0ca23fb37d6290df50377897b96c8759daa6b0a96b`.
It is **not the release**. When opened from Finder or the Dock, the app gets
launchd's PATH (`/usr/bin:/bin:/usr/sbin:/sbin`). The host starts Codex by
name, and Codex installs outside that PATH, so this build could not start
Codex. Every earlier acceptance run launched the app from a shell, which hid the
fault. It was reproduced by launching this notarised app from an empty
environment: the host's PATH was launchd's default, and `codex` did not resolve.

## Release candidate: build `9734bf5`

`9734bf5` appends `~/.local/bin`, `/opt/homebrew/bin` and `/usr/local/bin`,
where they exist, to the host's PATH before it spawns anything.

| Item | Value |
| --- | --- |
| Source revision | `9734bf5` on `main` |
| Canonical gate | `pnpm run check:ci` exit 0 at that revision |
| Assembly acceptance | `release:dmg` 10/10 against the signed copy |
| Pre-notarisation image SHA-256 | `17effdcbec0e4d74c3dd6e0e3aec17b357fa6f504e95e1f87814406b57ccfc01` |
| Apple submission | `9ae9c7aa-9211-4ff2-afd6-858814f1b51d`, Accepted |
| Stapled image SHA-256 | `598b2ff2d131d6e4fb9fd1634c15c9bf84ac9cabd025e76d895d730899784dc4` |
| Gatekeeper (image) | accepted, Notarized Developer ID, team `QJJ98A74J8` |

On the build host, launching the signed image from an empty environment gave
every host child PATH entries for the user tool directories. Before this fix,
the same launch had given them none.

### Clean test Mac (macOS 27.0, build 26A428, arm64)

Earlier, build `3c6c646` was installed and exercised there over SSH. Assembled-app
acceptance passed 9/10 once it used the launcher's PATH. The remaining failure
was the keychain probe: the module loaded, but writing an item failed with
`User interaction is not allowed`, because the login keychain is locked in an
SSH session. That is an environment limit, not a product defect. The probe must
run from the logged-in desktop session.

The stapled `9734bf5` image was copied with matching hash and mounted
read-only. The previous app was stopped gracefully and replaced. Results:

- The installed app is byte-identical to the image, and deep strict signature
  verification passed.
- Gatekeeper: accepted, Notarized Developer ID.
- The app launched, and the host served on loopback.
- Host children received `/opt/homebrew/bin:/usr/local/bin` after the system
  directories. `~/.local/bin` did not exist on that machine, so it was
  correctly omitted.
- Existing installation state files were unchanged across the replacement.
  Only new SQLite journal files appeared.

## Explicit remaining limits

- The previous installation held no projects or conversations. The replacement
  therefore proves that an update leaves state intact, not that real
  conversations survive an update.
- Not yet run from the clean Mac's desktop session: a first launch from a
  quarantined download, a real Codex conversation from a Dock-launched app, a
  normal quit and relaunch with a conversation present, and the keychain probe.
  SSH copies carry no quarantine attribute, so they do not exercise
  Gatekeeper's first-launch path.
- The PATH fix covers Codex installed in the three directories above. A Codex
  installed elsewhere, for example by a Node version manager, is found only
  when Drawloom is started from a shell whose PATH contains it.
- Signing and notarisation remain manual release gates. There is still no macOS
  CI job.
