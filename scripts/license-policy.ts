/** Deliberately narrow admission policy, not a general SPDX or legal parser. */
const approved = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
]);
// Upstream v0.1.9 LICENSE-MIT and Linux npm metadata reviewed on 2026-09-14.
// Exact versions only; optional platforms not inspected here remain subject to review.
const selections: Readonly<Record<string, string>> = {
  "sqlite-vec@0.1.9": "MIT",
  "sqlite-vec-darwin-arm64@0.1.9": "MIT",
  "sqlite-vec-linux-x64@0.1.9": "MIT",
};
export function selectedLicense(identity: string): string | undefined {
  return selections[identity];
}
// Exact locked variants, not a licence-wide or future-version exemption.
const reviewedMpl = new Set(
  [
    "lightningcss",
    "lightningcss-android-arm64",
    "lightningcss-darwin-arm64",
    "lightningcss-darwin-x64",
    "lightningcss-freebsd-x64",
    "lightningcss-linux-arm-gnueabihf",
    "lightningcss-linux-arm64-gnu",
    "lightningcss-linux-arm64-musl",
    "lightningcss-linux-x64-gnu",
    "lightningcss-linux-x64-musl",
    "lightningcss-win32-arm64-msvc",
    "lightningcss-win32-x64-msvc",
  ].map((name) => `${name}@1.33.0`),
);
export function isReviewedMpl(identity: string, textSha256: string): boolean {
  return (
    reviewedMpl.has(identity) &&
    textSha256 === "5eba353fe5076ac3432177f8ab1cf75e3afcd0584251e37c3bfead5f447d040e"
  );
}
export interface LicenseAssessment {
  kind: "allowed" | "blocked" | "review";
  reason: string;
}
export function assessLicense(
  expression: unknown,
  selected?: string,
  reviewedMpl = false,
): LicenseAssessment {
  if (typeof expression !== "string" || !expression.trim())
    return { kind: "review", reason: "Missing licence evidence" };
  const value = expression.trim();
  if (value.includes(" OR ")) {
    // Complex parenthesized expressions require human review, never substring matching.
    const choices = value.split(" OR ");
    if (!selected || !choices.includes(selected) || /[()]/.test(value))
      return { kind: "review", reason: "Record an exact permissible alternative" };
    return assessLicense(selected, undefined, reviewedMpl);
  }
  if (selected && selected !== value)
    return { kind: "review", reason: "Selection is not an offered alternative" };
  if (/\b(?:A?GPL|LGPL|EPL|CDDL|EUPL|OSL)-/.test(value))
    return {
      kind: "blocked",
      reason: "Unapproved copyleft is excluded from product dependencies, including exceptions",
    };
  return value
    .split(" AND ")
    .every((term) => approved.has(term) || (term === "MPL-2.0" && reviewedMpl))
    ? { kind: "allowed", reason: "Approved terms; preserve all attribution obligations" }
    : { kind: "review", reason: "Unknown or unsupported licence expression" };
}
