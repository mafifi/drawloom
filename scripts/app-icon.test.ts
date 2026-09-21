import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

test("the approved Drawloom is the shared app, website and repository mark", async () => {
  const artwork = "publishing/site/public/artwork/drawloom/mark.png";
  const bytes = await readFile(artwork);
  expect(bytes[25]).toBe(6);
  expect(await readFile("apps/desktop/src-tauri/icons/Drawloom.icon/Assets/mark.png")).toEqual(
    bytes,
  );
  expect(await readFile("README.md", "utf8")).toContain(artwork);
  const desktopPage = await readFile("apps/desktop/src/routes/+page.svelte", "utf8");
  expect(desktopPage).toContain("publishing/site/public/artwork/drawloom/mark.png");
  expect(desktopPage).toContain('rel="icon"');
  expect(await readFile("publishing/site/src/pages/index.astro", "utf8")).toContain(
    "/artwork/drawloom/mark.png",
  );
  for (const layout of ["Landing", "Journal"]) {
    expect(await readFile(`publishing/site/src/layouts/${layout}.astro`, "utf8")).toContain(
      "artwork/drawloom/mark.png",
    );
  }
});

test("native bundle wires Icon Composer artwork and its macOS compatibility icon", async () => {
  const root = new URL("../apps/desktop/src-tauri/", import.meta.url);
  const config = await JSON.parse(await readFile(new URL("tauri.conf.json", root), "utf8"));
  expect(config.bundle.icon).toContain("icons/Drawloom.icns");
  expect(config.bundle.resources["icons/Assets.car"]).toBe("Assets.car");
  expect(config.build.beforeBuildCommand).toContain("bundle:icon");
  const plist = await readFile(new URL("Info.plist", root), "utf8");
  expect(plist).toContain("<key>CFBundleIconName</key>");
  expect(plist).toContain("<string>Drawloom</string>");
  const fallback = await readFile(new URL("icons/Drawloom.icns", root));
  expect(new TextDecoder().decode(fallback.slice(0, 4))).toBe("icns");
  expect((await readFile(new URL("icons/Assets.car", root))).length).toBeGreaterThan(0);
});
