import { afterEach, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isMachO, machOPayloads } from "./mach-o-payloads.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "drawloom-mach-o-"));
  roots.push(root);
  return root;
}
const header = (...words: number[]) => {
  const bytes = Buffer.alloc(64);
  words.forEach((word, index) => bytes.writeUInt32BE(word, index * 4));
  return bytes;
};

test("finds Mach-O by content, including files with no extension", () => {
  // The case that caused the notarisation rejection: esbuild ships its
  // platform binary as `bin/esbuild`, which an extension list never matched.
  const root = fixture();
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin/esbuild"), header(0xcffaedfe)); // 64-bit, little-endian
  writeFileSync(join(root, "addon.node"), header(0xcffaedfe));
  writeFileSync(join(root, "index.js"), "module.exports = {};\n");
  expect(machOPayloads(root).map((path) => path.slice(root.length + 1))).toEqual([
    "addon.node",
    "bin/esbuild",
  ]);
});

test("recognises every thin and fat Mach-O magic", () => {
  const root = fixture();
  for (const [name, magic] of [
    ["thin32-be", 0xfeedface],
    ["thin64-be", 0xfeedfacf],
    ["thin32-le", 0xcefaedfe],
    ["thin64-le", 0xcffaedfe],
  ] as const) {
    writeFileSync(join(root, name), header(magic));
    expect(isMachO(join(root, name)), name).toBe(true);
  }
  writeFileSync(join(root, "universal"), header(0xcafebabe, 2));
  expect(isMachO(join(root, "universal"))).toBe(true);
});

test("a Java class file shares the fat magic and is not Mach-O", () => {
  // 0xcafebabe followed by minor/major version: Java 8 is major 52.
  const root = fixture();
  writeFileSync(join(root, "Example.class"), header(0xcafebabe, 52));
  expect(isMachO(join(root, "Example.class"))).toBe(false);
});

test("short, empty and non-binary files are not payloads", () => {
  const root = fixture();
  writeFileSync(join(root, "empty"), "");
  writeFileSync(join(root, "short"), Buffer.from([0xcf, 0xfa]));
  writeFileSync(join(root, "text"), "#!/bin/sh\necho hi\n");
  expect(machOPayloads(root)).toEqual([]);
});

test("symlinks are not followed or reported", () => {
  // A link is not a payload. The sidecars are deployed with the hoisted linker
  // precisely so the bundle contains none, and the packaging check asserts it.
  const root = fixture();
  writeFileSync(join(root, "real"), header(0xcffaedfe));
  symlinkSync(join(root, "real"), join(root, "link"));
  expect(machOPayloads(root).map((path) => path.slice(root.length + 1))).toEqual(["real"]);
});
