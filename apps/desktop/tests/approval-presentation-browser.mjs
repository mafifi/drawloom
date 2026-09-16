// Built shared View/real ViewModel with synthetic native snapshots. Host/native wiring
// is exercised independently by approval-application.test.ts; no live model here.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_UI_URL, DRAWLOOM_UI_EVIDENCE_DIR } = process.env;
if (!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_UI_URL || !DRAWLOOM_UI_EVIDENCE_DIR)
  throw Error("Supply installed browser runtime, disposable host URL and evidence directory.");
await mkdir(DRAWLOOM_UI_EVIDENCE_DIR, { recursive: true });
const { chromium } = await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE,
});
const url = new URL(DRAWLOOM_UI_URL);
try {
  for (const [colorScheme, width, zoom] of [
    ["light", 1280, 1],
    ["dark", 1280, 1],
    ["dark", 390, 1],
    ["light", 1280, 2],
  ]) {
    const context = await browser.newContext({
      colorScheme,
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
      hasTouch: true,
    });
    await context.addCookies([
      { name: "drawloom_" + url.port, value: url.searchParams.get("token"), url: url.origin },
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [],
      commands = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let releaseApproval, releaseStop;
    try {
      const initial = await (await context.request.get(url.origin + "/api/state")).json();
      const snapshot = initial.sections;
      snapshot.activeOperation = "public-operation";
      snapshot.controls.interrupt = true;
      snapshot.approvals = [
        {
          presentationId: "surface-0",
          conversationId: snapshot.selectedId,
          request: {
            approvalId: "public-approval",
            operationId: "public-operation",
            summary: "Allow this synthetic action?",
            options: [
              { optionId: "native-once", label: "Allow once" },
              { optionId: "native-decline", label: "Decline" },
            ],
          },
          surface: "pending",
          submitting: false,
          presentation: "desktop",
        },
      ];
      let revision = 0,
        retries = 0,
        lifetime = 0;
      await page.route("**/api/state*", (route) =>
        route.fulfill({
          json: {
            kind: "snapshot",
            token: `approval-${++revision}`,
            sections: snapshot,
            removed: [],
          },
        }),
      );
      await page.route("**/api/command", async (route) => {
        const command = route.request().postDataJSON();
        commands.push(command);
        assert.equal(command.conversationId, snapshot.selectedId);
        if (command.kind === "approval" || command.kind === "approval_surface")
          assert.equal(command.presentationId, snapshot.approvals[0].presentationId);
        if (command.kind === "approval_surface") {
          assert.equal(command.approvalId, "public-approval");
          if (command.action === "stop") {
            await new Promise((resolve) => {
              releaseStop = resolve;
            });
          } else {
            snapshot.approvals[0].surface =
              command.action === "dismiss" ? "dismissed" : ++retries === 1 ? "failed" : "pending";
            if (command.action === "reopen")
              snapshot.approvals[0].presentationId = `surface-${++lifetime}`;
          }
        } else if (command.kind === "approval") {
          assert.deepEqual(command.resolution, {
            approvalId: "public-approval",
            optionId: "native-once",
          });
          const late = structuredClone(snapshot);
          await new Promise((resolve) => {
            releaseApproval = resolve;
          });
          await route.fulfill({ json: late });
          return;
        } else if (command.kind === "select_conversation") {
          /* Continuation while old response remains pending. */
        } else throw Error("Unexpected approval command");
        await route.fulfill({ json: snapshot });
      });
      await page.goto(url.origin);
      if (zoom !== 1)
        await page.evaluate((value) => {
          document.documentElement.style.zoom = String(value);
        }, zoom);
      const card = page.locator(".interaction").filter({ hasText: "Execution approval" });
      await card.getByRole("button", { name: "Allow once", exact: true }).waitFor();
      const close = card.getByRole("button", { name: "Close approval", exact: true });
      await close.focus();
      await page.keyboard.press("Enter");
      const reopen = card.getByRole("button", { name: "Reopen approval", exact: true });
      await reopen.waitFor();
      assert.equal(await reopen.evaluate((button) => button === document.activeElement), true);
      await page.keyboard.press("Enter");
      const retry = card.getByRole("button", { name: "Show again", exact: true });
      await retry.waitFor();
      await retry.tap();
      await card.getByRole("button", { name: "Allow once", exact: true }).waitFor();
      await page.screenshot({
        path: `${DRAWLOOM_UI_EVIDENCE_DIR}/approval-${colorScheme}-${width}-${zoom}x.png`,
        fullPage: true,
      });
      // Initial card Stop must identify itself as pending, including on touch.
      await card.getByRole("button", { name: "Stop", exact: true }).tap();
      await card.locator('button[aria-busy="true"]').waitFor();
      assert.equal(
        await card.getByRole("button", { name: "Stopping", exact: true }).getAttribute("aria-busy"),
        "true",
      );
      await page.screenshot({
        path: `${DRAWLOOM_UI_EVIDENCE_DIR}/stop-${colorScheme}-${width}-${zoom}x.png`,
        fullPage: true,
      });
      releaseStop();
      await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'));
      await card.getByRole("button", { name: "Allow once", exact: true }).click();
      await card.locator('button[aria-busy="true"]').waitFor();
      assert.equal(
        await card.getByRole("button", { name: "Decline", exact: true }).isDisabled(),
        true,
      );
      await card.getByRole("button", { name: "Stop", exact: true }).click();
      await card.getByRole("button", { name: "Stopping", exact: true }).waitFor();
      releaseStop();
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll('button[aria-busy="true"]')].some((button) =>
            button.textContent.includes("Stop"),
          ),
      );
      snapshot.approvals = [];
      delete snapshot.activeOperation;
      await card.waitFor({ state: "hidden" });
      const navigation = page.locator(".sidebar-conversation-row").getByRole("button", {
        name: snapshot.conversations.find((c) => c.id === snapshot.selectedId).title,
        exact: true,
      });
      if (!(await navigation.isVisible()))
        await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
      await navigation.click();
      await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'));
      assert.equal(commands.at(-1).kind, "select_conversation");
      releaseApproval();
      await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'));
      assert.equal(await card.count(), 0);
      assert.deepEqual(
        commands.map((command) => command.kind),
        [
          "approval_surface",
          "approval_surface",
          "approval_surface",
          "approval_surface",
          "approval",
          "approval_surface",
          "select_conversation",
        ],
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({
          colorScheme,
          width,
          cssZoom: zoom,
          reducedMotion: true,
          keyboardFocus: true,
          retry: true,
          stopDuringResponse: true,
        }),
      );
    } finally {
      releaseApproval?.();
      releaseStop?.();
      await context.close();
    }
  }
} finally {
  await browser.close();
}
