# macOS release workflow

This is a maintainer-operated Developer ID release, outside the App Store.
It requires macOS, the pinned Node/pnpm toolchain, Xcode command-line tools,
an unlocked signing identity and a validated `notarytool` Keychain profile.
Passwords and private keys do not belong in arguments, source or receipts.

## Commands and guarantees

Build with `pnpm run release:bundle` after the canonical gate passes. Then:

```sh
pnpm run release:dmg \
  apps/desktop/src-tauri/target/release/bundle/macos/Drawloom.app \
  /absolute/release-directory/Drawloom-preview-arm64.dmg \
  'Developer ID Application: Your Name (TEAMID)'

pnpm run release:notarise submit /absolute/release-directory/Drawloom-preview-arm64.dmg your-keychain-profile
pnpm run release:notarise status /absolute/release-directory/Drawloom-preview-arm64.dmg your-keychain-profile
pnpm run release:notarise finish /absolute/release-directory/Drawloom-preview-arm64.dmg your-keychain-profile
```

`release:dmg` copies the app into a disposable directory, signs its native
payloads through the existing signing script, runs the full assembled-app
acceptance check, adds the Applications shortcut, creates a compressed image,
signs that image and verifies it. It never modifies the source app. Output must
be a new path: existing release artifacts are not overwritten. Failed partial
images require inspection or a new output name, not automatic reuse.

`submit` is the explicit network/upload boundary. Before invoking Apple's tool,
it exclusively creates `<dmg>.notary.json`, binding the image hash, profile and
attempt. Once a receipt exists it refuses another submission. Keep the image,
assembly record, acceptance log and notarisation sidecars together outside Git.
There is no automatic polling or retry loop.

`status` reads Apple's state using the recorded submission ID. `finish` requires
Accepted, retains Apple's log, staples the ticket, validates it, and checks the
image signature, integrity and Gatekeeper assessment. The receipt records both
the submitted and stapled image hashes. A green assembly check alone is not
notarisation; notarisation alone is not clean-machine installation proof.

## Interrupted or rejected submissions

Do not remove a receipt to make a retry possible. If upload fails ambiguously,
inspect `<receipt>.submit.json` and `xcrun notarytool history --keychain-profile
your-keychain-profile`. Confirm the exact artifact/submission, then recover its
ID in the receipt. Never infer it merely from the newest entry or filename.
If the image changed during interrupted stapling, compare the retained submitted
artifact and Apple's accepted record before repairing the receipt.

For Invalid, fetch the log with `xcrun notarytool log <submission-id>
--keychain-profile your-keychain-profile`. Fix the cause, create a new image
and retain the rejected image/receipt as evidence. The script does not resubmit
or waive failed checks.

After completion, mount the exact DMG read-only and verify its app, then test
installation, launch and update/data preservation on the clean test Mac.
Signing/notarisation are deliberate local release gates, not jobs in public CI.
