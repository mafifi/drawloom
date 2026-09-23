#!/bin/sh
# Sign a built Drawloom.app under the hardened runtime.
#
# Order matters: every Mach-O payload the bundle ships must be signed before the
# bundle itself, or the outer signature seals unsigned nested code. Library
# validation is left ENABLED, so anything loaded at runtime must carry this same
# identity -- sqlite-vec's dylib included, since SQLite's extension loader loads
# it rather than Node's.
#
# WHAT GETS SIGNED is decided by CONTENT, by `scripts/mach-o-payloads.mjs`, the
# same selector `verify-macos-app.mjs` checks against. It used to be a list of
# extensions (`*.node`, `*.dylib`, `*.so`), which silently skipped esbuild's
# extensionless `bin/esbuild`; Apple's notary service rejected the DMG for three
# copies of it. Nothing here names a file except the one that needs different
# entitlements.
#
# Every signature requests a secure timestamp explicitly. Notarisation requires
# one on every executable, and a release signature must not depend on a
# default. Signing therefore needs network access to Apple's timestamp server,
# and fails rather than producing an unnotarisable bundle without it.
#
# Notarisation and stapling remain separate, deliberate steps.
set -eu
app="${1:?usage: sign-macos-app.sh <path to Drawloom.app> <signing identity>}"
identity="${2:?usage: sign-macos-app.sh <path to Drawloom.app> <signing identity>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
# Two sets, deliberately. The host runs Node, which JITs in-process and needs
# `allow-jit`. The UI shell is Rust and needs nothing: its WKWebView runs
# JavaScript in Apple's separate WebContent process. Every other payload is a
# library the host loads, where entitlements are inert, so it gets none.
host_entitlements="$root/apps/desktop/src-tauri/host-entitlements.plist"
shell_entitlements="$root/apps/desktop/src-tauri/Entitlements.plist"
host_node="$app/Contents/Resources/host/host/node"

payloads="$(mktemp)"
trap 'rm -f "$payloads"' EXIT
node "$root/scripts/mach-o-payloads.mjs" "$app/Contents/Resources" | tr '\0' '\n' >"$payloads"
count="$(grep -c . "$payloads" || true)"
if [ "$count" -eq 0 ] || ! grep -qxF "$host_node" "$payloads"; then
  echo "Refusing to sign: found $count Mach-O payloads and the host runtime was not among them." >&2
  exit 1
fi

while IFS= read -r payload; do
  if [ "$payload" = "$host_node" ]; then
    codesign --force --options runtime --timestamp \
      --entitlements "$host_entitlements" --sign "$identity" "$payload"
  else
    codesign --force --options runtime --timestamp --sign "$identity" "$payload"
  fi
done <"$payloads"

# The bundle is signed LAST, and with the shell's own empty set.
codesign --force --options runtime --timestamp \
  --entitlements "$shell_entitlements" --sign "$identity" "$app"
# Necessary, not sufficient: this accepts ad-hoc nested code, which is how the
# rejected bundle passed locally. `pnpm run release:verify` checks what the
# notary service checks.
codesign --verify --deep --strict "$app"
echo "Signed $count Mach-O payloads, then the bundle: $app"
