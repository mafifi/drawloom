import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
const { DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_UI_URL, DRAWLOOM_UI_EVIDENCE_DIR } = process.env;
if (!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_UI_URL || !DRAWLOOM_UI_EVIDENCE_DIR)
  throw Error("Set installed Playwright path, disposable host URL and evidence directory.");
await mkdir(DRAWLOOM_UI_EVIDENCE_DIR, { recursive: true });
const { chromium } = await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = new URL(DRAWLOOM_UI_URL);
  await context.addCookies([
    { name: "drawloom_" + url.port, value: url.searchParams.get("token"), url: url.origin },
  ]);
  const reset = await page.request.post(url.origin + "/api/knowledge", {
    headers: { origin: url.origin },
    data: { action: "pause", paused: false },
  });
  assert.equal(reset.ok(), true);
  let outcome = "uncertain",
    rejectNext = false,
    releasePause;
  const commands = [];
  const message =
    "The earlier assessment outcome remains unresolved. No replacement assessment will start.";
  await page.route("**/api/knowledge", async (route) => {
    const command = route.request().postDataJSON();
    if (command.action === "pause") {
      commands.push(command.paused);
      if (rejectNext) {
        rejectNext = false;
        await route.fulfill({ status: 503, json: { error: "Pause choice could not be saved." } });
        return;
      }
      await new Promise((resolve) => {
        releasePause = resolve;
      });
    }
    // Real fixture host persists Pause/Resume. Only the external outcome is synthetic.
    const response = await route.fetch();
    const value = await response.json();
    if (value.maintenance) value.maintenance = { ...value.maintenance, state: outcome, message };
    await route.fulfill({ response, json: value });
  });
  await page.goto(url.origin);
  await page.getByRole("button", { name: "Knowledge", exact: true }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const warning = page.getByText(message, { exact: true });
  const report = [];
  for (const phase of ["uncertain", "failed", "unavailable"]) {
    outcome = phase;
    await page.getByRole("button", { name: "Refresh status", exact: true }).click();
    await warning.waitFor();
    for (const paused of [true, false]) {
      const control = page.getByRole("button", {
        name: paused ? "Pause maintenance" : "Resume maintenance",
        exact: true,
      });
      await control.waitFor();
      const before = commands.length;
      if (paused) {
        await control.focus();
        await page.keyboard.press("Enter");
      } else await control.tap();
      const pending = page
        .getByRole("region", { name: "Keep knowledge up to date", exact: true })
        .locator('button[aria-busy="true"]');
      await pending.waitFor();
      assert.equal(await pending.isDisabled(), true);
      await page.keyboard.press("Enter");
      assert.equal(commands.length, before + 1);
      assert.equal(commands.at(-1), paused);
      releasePause();
      await page
        .getByRole("button", {
          name: paused ? "Resume maintenance" : "Pause maintenance",
          exact: true,
        })
        .waitFor();
      assert.equal(await warning.isVisible(), true);
      if (paused || phase !== "failed")
        assert.equal(
          await page.getByRole("button", { name: "Run now", exact: true }).isDisabled(),
          true,
        );
    }
    report.push(phase);
  }
  rejectNext = true;
  await page.getByRole("button", { name: "Pause maintenance", exact: true }).click();
  await page
    .getByText("Knowledge is unavailable. Refresh status for setup details.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Pause maintenance", exact: true }).isEnabled(),
    true,
  );
  assert.equal(await warning.isVisible(), true);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const control = page.getByRole("button", { name: "Pause maintenance", exact: true });
    await control.scrollIntoViewIfNeeded();
    assert.equal(await control.isVisible(), true);
    assert.equal(await warning.isVisible(), true);
    await page.screenshot({
      path: `${DRAWLOOM_UI_EVIDENCE_DIR}/pause-${theme}-390px-200percent.png`,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      phases: report,
      realHostPausePersistence: true,
      warningPreserved: true,
      pendingBlocksDuplicates: true,
      keyboardAndTouch: true,
      rejectionPreservesChoice: true,
      narrowZoomReducedMotionThemes: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
