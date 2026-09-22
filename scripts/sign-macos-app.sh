#!/bin/sh
# Sign a built Drawloom.app for local verification under the hardened runtime.
#
# Order matters: every Mach-O payload the bundle ships must be signed before the
# bundle itself, or the outer signature seals unsigned nested code. Library
# validation is left ENABLED, so anything loaded at runtime must carry this same
# identity -- that is why the .dylib below is signed as well as the .node files;
# sqlite-vec is loaded through SQLite's extension loader rather than Node's.
#
# Release signing and notarization remain separate, deliberate steps.
set -eu
app="${1:?usage: sign-macos-app.sh <path to Drawloom.app> <signing identity>}"
identity="${2:?usage: sign-macos-app.sh <path to Drawloom.app> <signing identity>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
# Two sets, deliberately. The host runs Node, which JITs in-process and needs
# `allow-jit`. The UI shell is Rust and needs nothing: its WKWebView runs
# JavaScript in Apple's separate WebContent process. Signing both with one file
# extended a runtime exception to the process that owns the window.
host_entitlements="$root/apps/desktop/src-tauri/host-entitlements.plist"
shell_entitlements="$root/apps/desktop/src-tauri/Entitlements.plist"

find "$app/Contents/Resources" \( -name '*.node' -o -name '*.dylib' -o -name '*.so' \) |
  while IFS= read -r payload; do
    codesign --force --options runtime --entitlements "$host_entitlements" --sign "$identity" "$payload"
  done
codesign --force --options runtime --entitlements "$host_entitlements" --sign "$identity" \
  "$app/Contents/Resources/host/host/node"
# The bundle is signed LAST, and with the shell's own empty set.
codesign --force --options runtime --entitlements "$shell_entitlements" --sign "$identity" "$app"
codesign --verify --deep --strict "$app"
echo "Signed and verified: $app"
