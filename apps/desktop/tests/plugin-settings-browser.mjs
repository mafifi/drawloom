import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(process.env.DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.DRAWLOOM_BROWSER_EXECUTABLE
    ? { executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE }
    : {}),
});
const url = new URL(process.env.DRAWLOOM_SETTINGS_URL);
try {
  for (const [colorScheme, width] of [
    ["light", 1280],
    ["dark", 1280],
    ["dark", 390],
  ]) {
    const context = await browser.newContext({
      colorScheme,
      reducedMotion: "reduce",
      viewport: { width, height: 900 },
    });
    const errors = [];
    await context.addCookies([
      { name: "drawloom_" + url.port, value: url.searchParams.get("token"), url: url.origin },
    ]);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url.origin);
    if (width === 390) await page.getByRole("button", { name: "Toggle navigation" }).click();
    await page.getByRole("button", { name: "Settings and more" }).click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    if (width === 390) {
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Settings navigation" }).click();
    }
    const choice = page.getByRole("button", { name: "public-preferences", exact: true });
    await choice.focus();
    await page.keyboard.press("Enter");
    const frame = page.frameLocator('iframe[title="public-preferences: Preferences"]');
    await frame.getByRole("spinbutton", { name: "Starting value" }).fill("9");
    await frame.getByRole("button", { name: "Save preferences" }).click();
    await frame.getByRole("status").filter({ hasText: "Preferences saved" }).waitFor();
    if (width === 390) await page.getByRole("button", { name: "Settings navigation" }).click();
    await page.getByRole("button", { name: "General", exact: true }).click();
    if (width === 390) await page.getByRole("button", { name: "Settings navigation" }).click();
    await page.getByRole("button", { name: "public-preferences", exact: true }).click();
    await frame.getByRole("spinbutton", { name: "Starting value" }).waitFor();
    await page.waitForFunction(() => !document.body.textContent.includes("Opening settings…"));
    assert.equal(await frame.getByRole("spinbutton", { name: "Starting value" }).inputValue(), "9");
    await page.screenshot({ path: `/tmp/drawloom-settings-${colorScheme}-${width}.png` });
    await page.evaluate(() => (document.body.style.zoom = "200%"));
    assert.equal(await frame.getByRole("button", { name: "Save preferences" }).isVisible(), true);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "Settings browser: light/dark, 390px, keyboard open, save, close/reopen, reduced motion and 200% zoom passed",
  );
} finally {
  await browser.close();
}
