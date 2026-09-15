import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
const { DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_UI_URL, DRAWLOOM_UI_EVIDENCE_DIR } = process.env;
if (!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_UI_URL || !DRAWLOOM_UI_EVIDENCE_DIR)
  throw Error(
    "Set Playwright path, disposable learning-controls host URL, and evidence directory.",
  );
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
  page.on("pageerror", (e) => errors.push(e.message));
  let historyEntry;
  page.on("response", async (response) => {
    if (new URL(response.url()).pathname === "/api/history" && response.ok()) {
      historyEntry = (await response.json()).entries.find((entry) => entry.preparation?.receipt);
    }
  });
  const url = new URL(process.env.DRAWLOOM_UI_URL);
  await page
    .context()
    .addCookies([
      { name: "drawloom_" + url.port, value: url.searchParams.get("token"), url: url.origin },
    ]);
  await page.goto(url.origin);
  await page.getByRole("button", { name: "Knowledge used · 1", exact: true }).click();
  await page.getByText("Reference only · full text was not sent", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Evidence 1", exact: true }).click();
  await page.getByText("Confirm the delivery address before dispatch.", { exact: true }).waitFor();
  await page.screenshot({ path: DRAWLOOM_UI_EVIDENCE_DIR + "/disclosure.png" });
  assert.ok(historyEntry, "Fixture history was observed");
  let changed = structuredClone(historyEntry);
  changed.preparation.references[0].ref.revision = "3";
  await page.route("**/api/history/changes?*", (route) =>
    route.fulfill({
      json: {
        entries: [changed],
        cursor: "ui-fixture-change",
        hasMore: false,
        status: { revision: 3, sync: "idle", hasOlder: false },
      },
    }),
  );
  await page.getByText("public-example · delivery-guidance · 3", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("Confirm the delivery address before dispatch.", { exact: true }).count(),
    0,
  );
  await page.route("**/api/knowledge", async (route) => {
    if (route.request().postDataJSON()?.action === "evidence")
      await route.fulfill({ json: { kind: "denied" } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Evidence 1", exact: true }).click();
  await page.getByRole("alert").waitFor();
  changed = structuredClone(changed);
  changed.preparation.references[0].ref.revision = "4";
  await page.getByText("public-example · delivery-guidance · 4", { exact: true }).waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.unroute("**/api/knowledge");
  let releaseEvidence;
  const held = new Promise((resolve) => {
    releaseEvidence = resolve;
  });
  let settleEvidenceRoute;
  const settledEvidenceRoute = new Promise((resolve) => {
    settleEvidenceRoute = resolve;
  });
  await page.route("**/api/knowledge", async (route) => {
    if (route.request().postDataJSON()?.action === "evidence") {
      await held;
      await route.fulfill({ json: { kind: "denied" } });
      settleEvidenceRoute();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Evidence 1", exact: true }).click();
  await page.getByRole("button", { name: "Loading", exact: true }).waitFor();
  const isEvidenceRequest = (request) => request.postDataJSON()?.action === "evidence";
  const failedEvidenceRequest = page.waitForEvent("requestfailed", {
    predicate: isEvidenceRequest,
  });
  changed = structuredClone(changed);
  changed.preparation.references[0].ref.revision = "5";
  await page.getByText("public-example · delivery-guidance · 5", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Loading", exact: true }).count(), 0);
  releaseEvidence();
  const [, failedRequest] = await Promise.all([settledEvidenceRoute, failedEvidenceRequest]);
  assert.ok(failedRequest.failure());
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.unroute("**/api/knowledge");
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.getByRole("button", { name: "Knowledge", exact: true }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  let capturePending = true;
  await page.route("**/api/knowledge", async (route) => {
    if (route.request().postDataJSON()?.action === "status") {
      const response = await route.fetch();
      const value = await response.json();
      await route.fulfill({
        response,
        json: {
          ...value,
          capture: capturePending
            ? {
                state: "pending",
                pendingObservations: null,
                message:
                  "Tool observations are waiting to be added to local knowledge. Recovery will not rerun the original tools. Reconnect or reopen Drawloom, then refresh status.",
              }
            : { state: "idle", pendingObservations: 0, message: "" },
        },
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await page
    .getByText("Tool observations are waiting to be added to local knowledge.", { exact: false })
    .waitFor();
  capturePending = false;
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await page
    .getByText("Tool observations are waiting to be added to local knowledge.", { exact: false })
    .waitFor({ state: "detached" });
  await page.unroute("**/api/knowledge");
  await page.waitForTimeout(300);
  let collectionFailed = true,
    curationState = "uncertain",
    refreshFails = false;
  const collectionMessage =
    "Repository collection is unavailable. Existing knowledge remains available.";
  const curationMessage =
    "The earlier assessment cannot be confirmed. No replacement assessment will start.";
  const captureMessage = "Tool observations are waiting for recovery.";
  await page.route("**/api/knowledge", async (route) => {
    if (route.request().postDataJSON()?.action === "status") {
      if (refreshFails) return route.fulfill({ status: 503, body: "Synthetic refresh failure" });
      const response = await route.fetch(),
        value = await response.json();
      return route.fulfill({
        response,
        json: {
          ...value,
          capture: { state: "pending", pendingObservations: null, message: captureMessage },
          source: {
            projectId: "fixture",
            enabled: true,
            state: collectionFailed ? "unavailable" : "ready",
            message: collectionMessage,
          },
          maintenance: { ...value.maintenance, state: curationState, message: curationMessage },
        },
      });
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await page.getByText(collectionMessage, { exact: true }).waitFor();
  assert.equal(await page.getByText(curationMessage, { exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Run now", exact: true }).isDisabled(), true);
  for (const tab of ["Search", "Sources", "Settings"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    assert.equal(await page.getByText(collectionMessage, { exact: true }).isVisible(), true);
    assert.equal(await page.getByText(curationMessage, { exact: true }).isVisible(), true);
    assert.equal(await page.getByText(captureMessage, { exact: true }).isVisible(), true);
  }
  assert.equal(await page.getByRole("button", { name: "Retry", exact: true }).count(), 0);
  refreshFails = true;
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await page
    .getByText("Knowledge is unavailable. Refresh status for setup details.", { exact: true })
    .waitFor();
  assert.equal(await page.getByText(collectionMessage, { exact: true }).isVisible(), true);
  refreshFails = false;
  curationState = "failed";
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  assert.equal(await page.getByText(curationMessage, { exact: true }).count(), 1);
  curationState = "uncertain";
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await page.screenshot({ path: `${DRAWLOOM_UI_EVIDENCE_DIR}/recovery-${theme}.png` });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Sources", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.getByText(collectionMessage, { exact: true }).isVisible(), true);
  await page.screenshot({ path: DRAWLOOM_UI_EVIDENCE_DIR + "/recovery-narrow.png" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => (document.documentElement.style.zoom = "2"));
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).zoom), "2");
  await page.screenshot({ path: DRAWLOOM_UI_EVIDENCE_DIR + "/recovery-zoom.png" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() => (document.documentElement.style.zoom = "1"));
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  collectionFailed = false;
  curationState = "idle";
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await page.getByText(collectionMessage, { exact: true }).waitFor({ state: "detached" });
  assert.equal(await page.getByText(captureMessage, { exact: true }).isVisible(), true);
  await page.unroute("**/api/knowledge");
  await page.reload();
  await page.getByRole("button", { name: "Knowledge", exact: true }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page.screenshot({ path: DRAWLOOM_UI_EVIDENCE_DIR + "/settings-initial.png" });
  const capture = page.getByRole("checkbox", {
    name: "Remember useful tool outcomes",
    exact: true,
  });
  const sharing = page.getByRole("checkbox", {
    name: "Use knowledge in conversations",
    exact: true,
  });
  await capture.waitFor();
  assert.equal(await capture.isChecked(), false);
  assert.equal(await sharing.isChecked(), false);
  await sharing.check();
  await page.waitForTimeout(2700);
  assert.equal(
    await page.getByRole("tab", { name: "Settings", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  const save = page.getByRole("button", { name: "Save settings", exact: true }).first();
  await page.route("**/api/knowledge", async (route) => {
    if (route.request().postDataJSON()?.action === "configure")
      await route.fulfill({ status: 503, body: "Synthetic save failure" });
    else await route.continue();
  });
  await save.click();
  await page.getByRole("alert").waitFor();
  assert.equal(await sharing.isChecked(), true);
  await page.unroute("**/api/knowledge");
  await save.click();
  for (let i = 0; i < 100 && !(await save.isDisabled()); i++) await page.waitForTimeout(20);
  assert.equal(await save.isDisabled(), true);
  await page.reload();
  await page.getByRole("button", { name: "Knowledge", exact: true }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  assert.equal(await sharing.isChecked(), true);
  assert.equal(await capture.isChecked(), false);
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${DRAWLOOM_UI_EVIDENCE_DIR}/settings-${theme}.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: DRAWLOOM_UI_EVIDENCE_DIR + "/settings-narrow.png" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await sharing.focus();
  await page.keyboard.press("Space");
  assert.equal(await sharing.isChecked(), false);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => (document.documentElement.style.zoom = "2"));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).zoom), "2");
  await page.screenshot({ path: DRAWLOOM_UI_EVIDENCE_DIR + "/settings-zoom.png" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() => (document.documentElement.style.zoom = "1"));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByRole("button", { name: "Knowledge maintenance", exact: true }).click();
  await page.getByText("Across all projects", { exact: true }).waitFor();
  const maintenanceRow = page.getByRole("button", {
    name: "Check knowledge Needs attention",
    exact: true,
  });
  await maintenanceRow.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Steps and attempts", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Cancel run", exact: true }).count(), 0);
  assert.equal(await page.getByText("Advanced input", { exact: true }).count(), 0);
  assert.equal(await page.getByText("RAW_EVIDENCE_SENTINEL", { exact: false }).count(), 0);
  assert.equal(await page.getByText("Assess evidence", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "Browse all steps", exact: true }).click();
  await page.getByRole("button", { name: "More steps", exact: true }).click();
  await page.getByText("Update knowledge", { exact: true }).waitFor();
  await page.getByRole("button", { name: "More runs", exact: true }).click();
  await page.getByRole("button", { name: "Latest runs", exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await page.screenshot({ path: `${DRAWLOOM_UI_EVIDENCE_DIR}/activity-${theme}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: DRAWLOOM_UI_EVIDENCE_DIR + "/activity-narrow.png" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => (document.documentElement.style.zoom = "2"));
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).zoom), "2");
  await page.screenshot({ path: DRAWLOOM_UI_EVIDENCE_DIR + "/activity-zoom.png" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() => (document.documentElement.style.zoom = "1"));
  await page.route("**/api/state*", async (route) => {
    const response = await route.fetch();
    if (response.status() === 204) return route.fulfill({ response });
    const state = await response.json();
    delete state.sections.selectedProjectId;
    state.removed = [...state.removed, "selectedProjectId"];
    await route.fulfill({ response, json: state });
  });
  await page.reload();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page
    .getByText("Follow knowledge maintenance across all projects.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Knowledge maintenance", exact: true }).click();
  await page
    .getByRole("button", { name: "Check knowledge Needs attention", exact: true })
    .waitFor();
  await page.screenshot({ path: DRAWLOOM_UI_EVIDENCE_DIR + "/activity-no-project.png" });
  let activityMode = "empty";
  const hostMethods = [];
  await page.route("**/api/knowledge-activity/runs?*", async (route) => {
    hostMethods.push(route.request().method());
    if (activityMode === "empty") return route.fulfill({ json: { runs: [] } });
    if (activityMode === "unavailable")
      return route.fulfill({
        status: 503,
        json: { error: "Knowledge maintenance activity is unavailable." },
      });
    const response = await route.fetch(),
      data = await response.json();
    return route.fulfill({
      response,
      json: {
        ...data,
        runs: data.runs.map((run) => ({
          ...run,
          status: "running",
          displayStatus: "Running",
          message: "",
        })),
      },
    });
  });
  await page.getByRole("button", { name: "Refresh workflows", exact: true }).click();
  await page.getByText("No knowledge maintenance runs yet.", { exact: true }).waitFor();
  activityMode = "unavailable";
  await page.getByRole("button", { name: "Refresh workflows", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Knowledge maintenance activity is unavailable." })
    .waitFor();
  activityMode = "running";
  await page.getByRole("button", { name: "Refresh workflows", exact: true }).click();
  await page.getByRole("button", { name: "Check knowledge Running", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Cancel run", exact: true }).count(), 0);
  assert.ok(hostMethods.every((method) => method === "GET"));
  await page.unroute("**/api/knowledge-activity/runs?*");
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
  assert.equal(
    await page
      .getByText(
        "Collection could not start. Choose a project with an installed Git source, then connect it.",
        { exact: true },
      )
      .isVisible(),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      confirmedDisclosure: true,
      referenceOnly: true,
      explicitEvidenceRead: true,
      changedIdentityClearsBodyErrorAndPending: true,
      pendingCaptureVisibleAndCleared: true,
      defaultsOff: true,
      saveFailureRetainsDraft: true,
      persistedSharing: true,
      captureIndependent: true,
      durableSourceAndCurationWarnings: true,
      refreshRecovery: true,
      sourceSetupFailureVisible: true,
      activityReadOnly: true,
      activityWithoutProject: true,
      activityEmptyFailureRunning: true,
      runAndStepPagination: true,
      keyboard: true,
      lightDarkNarrow: true,
      zoom200: true,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
