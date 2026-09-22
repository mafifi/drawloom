import { expect, test } from "vitest";
import { pluginSettingsTitle } from "./settings-navigation.js";

test("settings titles remove repeated owner names but retain distinct page context", () => {
  expect(pluginSettingsTitle({ ownerTitle: "Example", title: "example" })).toBe("example");
  expect(pluginSettingsTitle({ ownerTitle: "Example", title: "Connection" })).toBe(
    "Example · Connection",
  );
});
