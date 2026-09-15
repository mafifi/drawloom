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
  const pluginOwner = {
    installationId: "public-fixture",
    title: "Project documents",
    readiness: { status: "ready" },
  };
  const hostOwner = {
    title: "Knowledge maintenance",
    context: "Across all projects",
    readiness: { status: "ready" },
  };
  for (const first of ["knowledge", "plugin"]) {
    let releaseSlow;
    const slow = new Promise((resolve) => {
      releaseSlow = resolve;
    });
    await page.route("**/api/orchestration/owners?*", async (route) => {
      if (first === "knowledge") await slow;
      await route.fulfill({ json: [pluginOwner] });
    });
    await page.route("**/api/knowledge-activity/owner*", async (route) => {
      if (first === "plugin") await slow;
      await route.fulfill({ json: hostOwner });
    });
    await page.route("**/api/orchestration/runs?*", (route) =>
      route.fulfill({ json: { runs: [] } }),
    );
    await page.goto(url.origin);
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await page
      .getByRole("button", {
        name: first === "knowledge" ? hostOwner.title : pluginOwner.title,
        exact: true,
      })
      .click();
    releaseSlow();
    await page
      .getByRole("button", {
        name: first === "knowledge" ? pluginOwner.title : hostOwner.title,
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: "Refresh workflows", exact: true }).click();
    await page.getByRole("button", { name: hostOwner.title, exact: true }).waitFor();
    await page.getByRole("button", { name: pluginOwner.title, exact: true }).waitFor();
    await page.screenshot({ path: `${DRAWLOOM_UI_EVIDENCE_DIR}/discovery-${first}-first.png` });
    await page.unroute("**/api/orchestration/owners?*");
    await page.unroute("**/api/knowledge-activity/owner*");
    await page.unroute("**/api/orchestration/runs?*");
  }
  await page.getByRole("button", { name: "Knowledge", exact: true }).click();
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await page.getByRole("button", { name: "Connect project source", exact: true }).click();
  await page
    .getByText(
      "Collection could not start. Choose a project with an installed Git source, then connect it.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  const warning = page.getByText("Installed Git source is unavailable.", { exact: true });
  await warning.waitFor();
  await page.getByRole("button", { name: "Pause maintenance", exact: true }).click();
  await page.getByRole("checkbox", { name: "Remember useful tool outcomes", exact: true }).check();
  await page.getByRole("button", { name: "Save settings", exact: true }).first().click();
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  for (const tab of ["Search", "Sources", "Settings"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    assert.equal(await warning.isVisible(), true);
    assert.equal(await warning.count(), 1);
  }
  await page.screenshot({
    path: `${DRAWLOOM_UI_EVIDENCE_DIR}/setup-warning-after-pause-and-save.png`,
  });
  // Both clear paths are driven by confirmed host presentation, not by a local action timer.
  for (const clear of ["success", "stop"]) {
    let cleared = false;
    await page.route("**/api/knowledge", async (route) => {
      const command = route.request().postDataJSON();
      if (command.action === "source") cleared = true;
      const response = await route.fetch();
      const statusResponse =
        command.action === "source"
          ? await page.request.post(url.origin + "/api/knowledge", {
              headers: { origin: url.origin },
              data: { action: "status" },
            })
          : response;
      const value = await statusResponse.json();
      delete value.sourceWarning;
      if (!cleared) value.sourceWarning = "Installed Git source is unavailable.";
      value.source = {
        projectId: "synthetic",
        enabled: !cleared || clear === "success",
        state: !cleared ? "unavailable" : clear === "success" ? "ready" : "stopped",
        message: !cleared ? "Installed Git source is unavailable." : "",
      };
      await route.fulfill({ status: 200, json: value });
    });
    await page.getByRole("button", { name: "Refresh status", exact: true }).click();
    await warning.waitFor();
    assert.equal(await warning.count(), 1);
    await page.getByRole("tab", { name: "Sources", exact: true }).click();
    await page
      .getByRole("button", {
        name: clear === "success" ? "Connect project source" : "Stop collection",
        exact: true,
      })
      .click();
    await warning.waitFor({ state: "detached" });
    await page.unroute("**/api/knowledge");
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      knowledgeFirstSelectionRetainsPlugin: true,
      pluginFirstSelectionRetainsKnowledge: true,
      setupWarningSurvivesPauseSaveAndRefresh: true,
      tabContinuity: true,
      configuredWarningDeduplicated: true,
      authoritativeSuccessAndStopClearWarning: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
