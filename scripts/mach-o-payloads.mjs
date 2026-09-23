#!/usr/bin/env node
/**
 * Every Mach-O file under a directory, identified by CONTENT, not by name.
 *
 * The one authoritative answer to "what in this bundle must be signed", shared
 * by `sign-macos-app.sh` and `verify-macos-app.mjs` so the two cannot disagree.
 *
 * WHY BY CONTENT
 * --------------
 * Signing used to select payloads by extension -- `*.node`, `*.dylib`, `*.so`.
 * esbuild's platform binary is `bin/esbuild`: no extension. It kept npm's
 * upstream ad-hoc signature, local verification passed because
 * `codesign --verify --deep --strict` accepts ad-hoc nested code, and Apple's
 * notary service rejected the DMG: three copies of that one binary, each "not
 * signed with a valid Developer ID certificate", without "a secure timestamp",
 * and without "the hardened runtime enabled". Any extensionless executable a
 * future dependency ships would have failed the same way. A name list only
 * covers the names someone thought of.
 *
 * Usage: node scripts/mach-o-payloads.mjs <directory>   (NUL-separated paths)
 */
import { openSync, readSync, closeSync, readdirSync } from "node:fs";
import { join } from "node:path";

const THIN = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe]);
// Fat (universal) headers. 0xcafebabe is also the Java class-file magic; the
// word after it disambiguates: a fat header's architecture count is small,
// while a class file's minor/major version is at least 45 (Java 1.1).
const FAT = new Set([0xcafebabe, 0xbebafeca]);
const MAX_FAT_ARCHITECTURES = 30;

export function isMachO(path) {
  let descriptor;
  try {
    descriptor = openSync(path, "r");
  } catch {
    return false;
  }
  try {
    const header = Buffer.alloc(8);
    if (readSync(descriptor, header, 0, 8, 0) < 8) return false;
    const magic = header.readUInt32BE(0);
    if (THIN.has(magic)) return true;
    if (!FAT.has(magic)) return false;
    const count = magic === 0xcafebabe ? header.readUInt32BE(4) : header.readUInt32LE(4);
    return count > 0 && count <= MAX_FAT_ARCHITECTURES;
  } finally {
    closeSync(descriptor);
  }
}

/** Regular files only. Symlinks are not followed: a link is not a payload, and
 * the sidecars are deployed with the hoisted linker precisely so there are none. */
export function machOPayloads(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && isMachO(path)) found.push(path);
    }
  };
  walk(root);
  return found.sort();
}

if (import.meta.main) {
  const root = process.argv[2];
  if (!root) {
    console.error("Usage: node scripts/mach-o-payloads.mjs <directory>");
    process.exit(2);
  }
  process.stdout.write(
    machOPayloads(root)
      .map((path) => `${path}\0`)
      .join(""),
  );
}
