import { expect, test } from "vitest";
import { launchdDefaultPath, userToolPath } from "./tool-path.js";

const home = "/Users/person";
const all = () => true;

test("a Finder launch gains the user tool directories that exist, after the system ones", () => {
  const present = new Set(["/Users/person/.local/bin", "/usr/local/bin"]);
  expect(userToolPath(launchdDefaultPath, home, (path) => present.has(path))).toBe(
    `${launchdDefaultPath}:/Users/person/.local/bin:/usr/local/bin`,
  );
});

test("an inherited terminal PATH keeps its order and is not duplicated", () => {
  const terminal = "/opt/homebrew/bin:/Users/person/.local/bin:/usr/bin:/bin";
  expect(userToolPath(terminal, home, all)).toBe(`${terminal}:/usr/local/bin`);
});

test("a missing or empty PATH starts from launchd's default", () => {
  for (const path of [undefined, ""])
    expect(userToolPath(path, home, () => false)).toBe(launchdDefaultPath);
});

test("nothing is added ahead of a system directory", () => {
  const entries = userToolPath(launchdDefaultPath, home, all).split(":");
  expect(entries.slice(0, 4)).toEqual(launchdDefaultPath.split(":"));
});
