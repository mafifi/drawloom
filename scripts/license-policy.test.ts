import { expect, test } from "vitest";
import { assessLicense, isReviewedMpl, selectedLicense } from "./license-policy.ts";

test("the Linux CI sqlite-vec binary uses the explicitly reviewed MIT alternative", () => {
  expect(selectedLicense("sqlite-vec-linux-x64@0.1.9")).toBe("MIT");
  expect(assessLicense("MIT OR Apache", selectedLicense("sqlite-vec-linux-x64@0.1.9")).kind).toBe(
    "allowed",
  );
  expect(selectedLicense("sqlite-vec-linux-x64@0.2.0")).toBeUndefined();
  expect(selectedLicense("unreviewed@0.1.9")).toBeUndefined();
});

test("MPL admission binds locked platform versions to the reviewed licence text", () => {
  const hash = "5eba353fe5076ac3432177f8ab1cf75e3afcd0584251e37c3bfead5f447d040e";
  expect(isReviewedMpl("lightningcss-linux-x64-gnu@1.33.0", hash)).toBe(true);
  expect(isReviewedMpl("lightningcss-darwin-arm64@1.33.0", hash)).toBe(true);
  expect(isReviewedMpl("lightningcss@1.33.0", "changed")).toBe(false);
  expect(isReviewedMpl("lightningcss@1.34.0", hash)).toBe(false);
  expect(isReviewedMpl("unreviewed@1.33.0", hash)).toBe(false);
});

test("product rejects copyleft including exceptions rather than relying on linking", () => {
  for (const license of [
    "GPL-3.0-only",
    "LGPL-3.0-or-later",
    "GPL-3.0-or-later WITH GCC-exception-3.1",
    "MIT AND GPL-3.0-only",
  ]) {
    expect(assessLicense(license).kind).toBe("blocked");
  }
});
test("MPL requires recorded review and cannot waive other copyleft", () => {
  expect(assessLicense("MPL-2.0").kind).toBe("review");
  expect(assessLicense("MPL-2.0", undefined, true).kind).toBe("allowed");
  expect(assessLicense("MIT AND MPL-2.0", undefined, true).kind).toBe("allowed");
  expect(assessLicense("MPL-2.0 OR GPL-3.0-only", "MPL-2.0", true).kind).toBe("allowed");
  expect(assessLicense("MPL-2.0 AND GPL-3.0-only", undefined, true).kind).toBe("blocked");
  expect(assessLicense("MPL-1.1", undefined, true).kind).not.toBe("allowed");
});
test("a dual licence needs an explicit permissible selection", () => {
  expect(assessLicense("MIT OR GPL-2.0-only").kind).toBe("review");
  expect(assessLicense("MIT OR GPL-2.0-only", "MIT").kind).toBe("allowed");
  expect(assessLicense("GPL-2.0-only", "MIT").kind).not.toBe("allowed");
});
test("unknown terms and malformed expressions fail closed", () => {
  for (const license of [
    null,
    "",
    "SEE LICENSE IN LICENSE",
    "Apache",
    "MIT AND",
    "(MIT OR GPL-2.0-only)",
  ]) {
    expect(assessLicense(license).kind).not.toBe("allowed");
  }
});
test("approved conjunctive terms retain both obligations", () => {
  expect(assessLicense("Apache-2.0 AND MIT").kind).toBe("allowed");
  expect(assessLicense("BSD-3-Clause").kind).toBe("allowed");
});
