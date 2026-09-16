import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const { DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_UI_URL } = process.env;
if (!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_UI_URL)
  throw Error(
    "Launch learning-controls-host.ts with DRAWLOOM_UI_LEARNING=local DRAWLOOM_UI_MANUAL_REPEAT=1 and provide its URL and installed Playwright path.",
  );
const { chromium } = await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(10000);
  const url = new URL(DRAWLOOM_UI_URL);
  await page
    .context()
    .addCookies([
      { name: "drawloom_" + url.port, value: url.searchParams.get("token"), url: url.origin },
    ]);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url.origin);
  await page.getByRole("button", { name: "Knowledge", exact: true }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const run = page.getByRole("button", { name: "Run now", exact: true });
  await run.click();
  await page.getByRole("button", { name: "Allow this processing", exact: true }).click();
  const runOnce = async (touch) => {
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Run now",
      );
      return button && !button.disabled;
    });
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/knowledge") &&
        response.request().postDataJSON()?.action === "run",
    );
    if (touch) await run.tap();
    else {
      await run.focus();
      await page.keyboard.press("Enter");
    }
    const result = await (await response).json();
    assert.equal(result.kind, "started");
    await page.getByText("Curation started.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Refresh status", exact: true }).click();
    return result.runId;
  };
  const first = await runOnce(false);
  const statusResponse = await page.request.post(url.origin + "/api/knowledge", {
    headers: { origin: url.origin },
    data: { action: "status" },
  });
  const status = await statusResponse.json();
  assert.equal(status.curation.state, "idle");
  assert.equal(status.curation.active, true);
  assert.equal(status.curation.paused, false);
  assert.equal(status.consent.features.automaticCuration.preferred, false);
  // This assertion catches durable terminal ownership disabling the actual View.
  assert.equal(await run.isEnabled(), true);
  const second = await runOnce(true);
  assert.notEqual(second, first);
  for (const state of ["running", "uncertain", "unavailable", "paused"]) {
    await page.route("**/api/knowledge", async (route) => {
      if (route.request().postDataJSON()?.action !== "status") return route.continue();
      return route.fulfill({
        json: { ...status, curation: { ...status.curation, state, paused: state === "paused" } },
      });
    });
    const response = page.waitForResponse((response) => response.url().endsWith("/api/knowledge"));
    await page.getByRole("button", { name: "Refresh status", exact: true }).click();
    await response;
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].find(
          (button) => button.textContent.trim() === "Run now",
        )?.disabled,
    );
    assert.equal(await run.isDisabled(), true);
    await page.unroute("**/api/knowledge");
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      manualRuns: [first, second],
      automaticCuration: false,
      terminalOwnershipRetained: true,
      keyboardAndTouch: true,
      protectedStates: ["running", "uncertain", "unavailable", "paused"],
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
