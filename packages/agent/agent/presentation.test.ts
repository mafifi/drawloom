import { expect, test } from "vitest";
import { DiscoveryEntrySchema } from "./src/index.js";

test("discovery retains presentation separately from identity and rejects active icon URLs", () => {
  const entry = {
    id: "opaque",
    origin: "provider",
    kind: "plugin",
    name: "technical-name",
    description: "",
    scope: "session",
    availability: "available",
    selectable: true,
  };
  const presentation = {
    displayName: "Friendly name",
    icon: { light: "data:image/png;base64,aGVsbG8=" },
  };
  expect(DiscoveryEntrySchema.safeParse({ ...entry, presentation }).success).toBe(true);
  for (const light of [
    "file:///secret",
    "javascript:alert(1)",
    "https://tracking.example/logo.png",
    "data:text/html;base64,aGVsbG8=",
  ])
    expect(
      DiscoveryEntrySchema.safeParse({ ...entry, presentation: { icon: { light } } }).success,
    ).toBe(false);
});
