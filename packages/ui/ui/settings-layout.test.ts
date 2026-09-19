import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("shared settings composition responds to its frame, not the desktop viewport", () => {
  const css = readFileSync(new URL("./src/styles.css", import.meta.url), "utf8");
  for (const name of ["settings-group", "settings-surface", "settings-row", "settings-stack"]) {
    expect(css).toContain(`.${name}`);
  }
  expect(css).toContain("container-type: inline-size");
  expect(css).toContain("@container (max-width: 520px)");
});
