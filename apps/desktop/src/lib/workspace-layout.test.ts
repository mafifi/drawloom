import { expect, test } from "bun:test";
import { workspaceNeedsFullWidth } from "./workspace-layout.js";
test("panels use actual available space rather than the window breakpoint", () => {
  expect(workspaceNeedsFullWidth(970)).toBe(false);
  expect(workspaceNeedsFullWidth(730)).toBe(false);
  expect(workspaceNeedsFullWidth(699)).toBe(true);
  expect(workspaceNeedsFullWidth(390)).toBe(true);
});
