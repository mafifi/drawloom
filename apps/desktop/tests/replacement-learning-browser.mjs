import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
const { DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_UI_URL, DRAWLOOM_UI_EVIDENCE_DIR } = process.env;
if (!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_UI_URL || !DRAWLOOM_UI_EVIDENCE_DIR)
  throw Error("Provide Playwright, disposable fixture URL and evidence directory");
const local = process.env.DRAWLOOM_UI_LEARNING === "local";
await mkdir(DRAWLOOM_UI_EVIDENCE_DIR, { recursive: true });
const { chromium } = await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE,
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = new URL(DRAWLOOM_UI_URL);
  await page
    .context()
    .addCookies([
      { name: "drawloom_" + url.port, value: url.searchParams.get("token"), url: url.origin },
    ]);
  await page.goto(url.origin);
  assert.equal(new URL(page.url()).origin, url.origin);
  await page.getByRole("button", { name: "Knowledge", exact: true }).click();
  await page.getByRole("textbox", { name: "Search knowledge", exact: true }).fill("delivery");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  {
    await page
      .getByText("Confirm the delivery address before dispatch.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Inspect evidence", exact: true }).first().click();
    await page
      .getByRole("button", { name: "Export this page (OKF profile)", exact: true })
      .waitFor();
  }
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const sharing = page.getByRole("checkbox", {
    name: "Use knowledge in conversations",
    exact: true,
  });
  await sharing.waitFor();
  assert.equal(await sharing.isChecked(), false);
  if (local) await page.getByRole("heading", { name: "Search by meaning", exact: true }).waitFor();
  else {
    assert.equal(
      await page.getByRole("heading", { name: "Search by meaning", exact: true }).count(),
      0,
    );
    await page
      .getByText("Curation is not available with this learning service.", { exact: true })
      .waitFor();
  }
  await sharing.check();
  const save = page.getByRole("button", { name: "Save settings", exact: true }).first();
  await page.route("**/api/knowledge", async (route) => {
    if (route.request().postDataJSON()?.action === "preferences")
      return route.fulfill({ status: 503, body: "Synthetic save failure" });
    await route.continue();
  });
  await save.click();
  await page.getByRole("alert").first().waitFor();
  assert.equal(await sharing.isChecked(), true);
  await page.unroute("**/api/knowledge");
  await save.click();
  await page.getByRole("button", { name: "Allow this processing", exact: true }).waitFor();
  const request = async (command) =>
    page.evaluate(async (command) => {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      if (!response.ok) throw Error("Fixture status request failed");
      return response.json();
    }, command);
  assert.equal(
    (await request({ action: "status" })).consent.features.automaticContext.state,
    "consent_required",
  );
  await page.getByRole("button", { name: "Allow this processing", exact: true }).click();
  await page
    .getByRole("button", { name: "Allow this processing", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    (await request({ action: "status" })).consent.features.automaticContext.state,
    "enabled",
  );
  await page.reload();
  await page.getByRole("button", { name: "Knowledge", exact: true }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  assert.equal(await sharing.isChecked(), true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [theme, width, zoom] of [
    ["light", 1280, 1],
    ["dark", 1280, 1],
    ["dark", 390, 1],
    ["light", 1280, 2],
  ]) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate((zoom) => (document.documentElement.style.zoom = String(zoom)), zoom);
    await sharing.scrollIntoViewIfNeeded();
    await sharing.focus();
    assert.equal(await sharing.evaluate((el) => document.activeElement === el), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({
      path: `${DRAWLOOM_UI_EVIDENCE_DIR}/${local ? "local" : "alternative"}-${theme}-${width}-${zoom}x.png`,
    });
  }
  await sharing.focus();
  await page.keyboard.press("Space");
  assert.equal(await sharing.isChecked(), false);
  await save.click();
  await page.waitForFunction(() => document.querySelector("input") !== null);
  for (let i = 0; i < 50; i++) {
    if (
      (await request({ action: "status" })).consent.features.automaticContext.state === "disabled"
    )
      break;
    await page.waitForTimeout(20);
  }
  assert.equal(
    (await request({ action: "status" })).consent.features.automaticContext.state,
    "disabled",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      provider: local ? "local" : "public-deterministic",
      search: true,
      evidence: true,
      preferenceWithoutConsent: true,
      explicitScopeConfirmation: true,
      persistence: true,
      saveFailureRetainsDraft: true,
      keyboard: true,
      themes: true,
      narrow: true,
      zoom200: true,
      reducedMotion: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
