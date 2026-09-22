import { expect, test } from "vitest";
import { startupReadiness } from "./startup-readiness.js";

const url = `http://127.0.0.1:4488/bootstrap?token=${"a".repeat(64)}`;
test("native startup carries the host-selected installation; CLI remains a URL", () => {
  expect(JSON.parse(startupReadiness(url, "/installation with spaces", true))).toEqual({
    url,
    dataDirectory: "/installation with spaces",
  });
  expect(startupReadiness(url, "/installation with spaces", false)).toBe(url);
});
