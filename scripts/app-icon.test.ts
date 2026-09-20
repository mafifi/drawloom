import { expect, test } from "bun:test";

test("the approved Drawloom is the shared app, website and repository mark", async () => {
  const artwork = "publishing/site/public/artwork/drawloom/mark.png";
  const bytes = await Bun.file(artwork).bytes();
  expect(bytes[25]).toBe(6);
  expect(
    await Bun.file("apps/desktop/src-tauri/icons/Drawloom.icon/Assets/mark.png").bytes(),
  ).toEqual(bytes);
  expect(await Bun.file("README.md").text()).toContain(artwork);
  const desktopPage = await Bun.file("apps/desktop/src/routes/+page.svelte").text();
  expect(desktopPage).toContain("publishing/site/public/artwork/drawloom/mark.png");
  expect(desktopPage).toContain('rel="icon"');
  expect(await Bun.file("publishing/site/src/pages/index.astro").text()).toContain(
    "/artwork/drawloom/mark.png",
  );
  for (const layout of ["Landing", "Journal"]) {
    expect(await Bun.file(`publishing/site/src/layouts/${layout}.astro`).text()).toContain(
      "artwork/drawloom/mark.png",
    );
  }
});

test("native bundle wires Icon Composer artwork and its macOS compatibility icon", async () => {
  const root = new URL("../apps/desktop/src-tauri/", import.meta.url);
  const config = await Bun.file(new URL("tauri.conf.json", root)).json();
  expect(config.bundle.icon).toContain("icons/Drawloom.icns");
  expect(config.bundle.resources["icons/Assets.car"]).toBe("Assets.car");
  expect(config.build.beforeBuildCommand).toContain("bundle:icon");
  const plist = await Bun.file(new URL("Info.plist", root)).text();
  expect(plist).toContain("<key>CFBundleIconName</key>");
  expect(plist).toContain("<string>Drawloom</string>");
  const fallback = await Bun.file(new URL("icons/Drawloom.icns", root)).bytes();
  expect(new TextDecoder().decode(fallback.slice(0, 4))).toBe("icns");
  expect((await Bun.file(new URL("icons/Assets.car", root)).bytes()).length).toBeGreaterThan(0);
});
