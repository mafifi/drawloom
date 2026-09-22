import { expect, test } from "vitest";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathContainmentConformance } from "@drawloom/host/conformance";
import { containsPath } from "./path-containment.ts";

test("the shared containment helper conforms to the contract's meaning", () => {
  expect(() => pathContainmentConformance(containsPath)).not.toThrow();
});

test("the conformance suite rejects each implementation this repository had diverged to", () => {
  // Without this, the suite could be vacuous and nobody would notice. Each of
  // these was a real implementation in the tree.
  const diverged: Readonly<Record<string, (parent: string, child: string) => boolean>> = {
    // local-embeddings/setup.ts: refuses `..draft` and `b..`.
    includesDotDotSlash: (parent, child) => {
      const between = relative(resolve(parent), resolve(child));
      return between === "" || (!between.startsWith("..") && !between.includes("../"));
    },
    // temporal-orchestration: refuses `..draft`.
    startsWithDotDot: (parent, child) => {
      const delta = relative(parent, child);
      return delta === "" || (!delta.startsWith("..") && !isAbsolute(delta));
    },
    // The classic mistake: a textual prefix is not containment.
    textualPrefix: (parent, child) => child.startsWith(parent),
  };
  for (const [name, implementation] of Object.entries(diverged))
    expect(() => pathContainmentConformance(implementation), name).toThrow();
});

test("containment is lexical: the root is inside itself and symlinks are not its business", () => {
  // Pinned here because callers depend on these two answers and layer their own
  // policy on top; changing either silently changes every caller.
  expect(containsPath("/a", "/a")).toBe(true);
  expect(containsPath(`/a${sep}b`, `/a${sep}b`)).toBe(true);
});
