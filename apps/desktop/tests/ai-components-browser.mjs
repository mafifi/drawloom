// Uses a running host for assets/read-only history. Commands are intercepted:
// this never sends a prompt, resolves a live approval, or changes host state.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_UI_URL, DRAWLOOM_UI_EVIDENCE_DIR } = process.env;
if (!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_UI_URL || !DRAWLOOM_UI_EVIDENCE_DIR)
  throw Error("Supply browser runtime, authenticated host URL and evidence directory");
const { chromium } = await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE,
});
const url = new URL(DRAWLOOM_UI_URL);
await mkdir(DRAWLOOM_UI_EVIDENCE_DIR, { recursive: true });
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
    });
    await context.addCookies([
      {
        name: `drawloom_${url.port}`,
        value: url.searchParams.get("token"),
        url: url.origin,
      },
    ]);
    const snapshot = (await (await context.request.get(url.origin + "/api/state")).json()).sections;
    snapshot.views = [];
    snapshot.modes = ["default", "plan"];
    snapshot.goal = {
      supported: true,
      snapshot: {
        revision: "synthetic-goal-1",
        objective: "Verify the shared goal and plan presentation",
        status: "active",
        timeUsedSeconds: 125,
      },
    };
    const historyUrl = new URL("/api/history", url.origin);
    historyUrl.searchParams.set("conversationId", snapshot.selectedId);
    historyUrl.searchParams.set("limit", "50");
    const historyPage = await (await context.request.get(historyUrl.href)).json();
    snapshot.activeOperation = "synthetic-stream";
    historyPage.entries.push({
      id: "synthetic-stream",
      position: [Number.MAX_SAFE_INTEGER - 2, 0],
      role: "assistant",
      origin: { kind: "assistant" },
      operationId: "synthetic-stream",
      state: "partial",
      assets: [],
      text: "Live assistant words use the existing streaming component.",
    });
    historyPage.entries.push({
      id: "synthetic-plan",
      position: [Number.MAX_SAFE_INTEGER - 1, 0],
      role: "assistant",
      origin: {
        kind: "plan",
        plan: {
          explanation: "A bounded synthetic plan for presentation acceptance.",
          steps: [
            { text: "Inspect the contract", status: "completed" },
            { text: "Exercise keyboard disclosure", status: "in_progress" },
          ],
        },
      },
      text: "Inspect the contract\nExercise keyboard disclosure",
      assets: [],
      operationId: "synthetic-plan-operation",
      state: "complete",
    });
    const page = await context.newPage(),
      errors = [],
      commands = [];
    historyPage.entries.push({
      id: "synthetic-proposal",
      position: [Number.MAX_SAFE_INTEGER, 0],
      role: "assistant",
      origin: { kind: "proposal" },
      text: "## Proposed approach\n\nInspect the contract, then report findings.",
      assets: [],
      operationId: "synthetic-plan-operation",
      state: "complete",
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/discovery?*", (route) =>
      route.fulfill({
        json: {
          entries: [
            {
              id: "component-proof",
              kind: "skill",
              name: "Component proof skill",
              origin: "synthetic",
              description: "Keyboard selection fixture",
              scope: "session",
              availability: "available",
              selectable: true,
              revision: "r1",
            },
          ],
          categories: [],
          experimentalPluginDiscovery: false,
        },
      }),
    );
    await page.route("**/api/state*", (route) =>
      route.fulfill({
        json: {
          kind: "snapshot",
          token: "presentation-test",
          sections: snapshot,
          removed: [],
        },
      }),
    );
    await page.route("**/api/history?*", (route) => route.fulfill({ json: historyPage }));
    await page.route("**/api/history/changes?*", (route) => route.fulfill({ status: 204 }));
    let commandError = false;
    await page.route("**/api/command", (route) => {
      commands.push(route.request().postDataJSON());
      if (commandError)
        return route.fulfill({
          status: 400,
          json: { error: "Synthetic goal failure" },
        });
      return route.fulfill({ json: snapshot });
    });
    await page.goto(url.origin);
    await page.locator("[data-history-id]").last().waitFor();
    const goal = page.getByRole("region", { name: "Goal", exact: true });
    await goal.waitFor();
    const goalBox = await goal.boundingBox();
    const inputBox = await page.locator("form.composer").boundingBox();
    assert.ok(inputBox, "Shared prompt input exists");
    assert.ok(
      Math.abs(goalBox.y + goalBox.height - inputBox.y) < 2,
      "Goal is attached to the composer without a gap",
    );
    assert.ok(
      goalBox.width < inputBox.width,
      "Attached goal strip is inset from the composer edges",
    );
    assert.equal(await goal.evaluate((el) => getComputedStyle(el).borderBottomLeftRadius), "0px");
    const shoulderRadius = await page
      .locator("form.composer .rounded-3xl")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
    assert.ok(
      goalBox.x - inputBox.x >= shoulderRadius,
      "Shared strip clears the composer's rounded shoulders",
    );
    const clock = goal.locator("[data-goal-clock]");
    const stream = page.locator('[data-history-id="synthetic-stream"]');
    assert.equal(
      await stream.locator("[data-streamdown-animate]").count(),
      0,
      "Reduced motion disables decorative text reveal",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await stream.locator("[data-streamdown-animate]").first().waitFor();
    assert.equal(
      await page.locator('[data-history-id="synthetic-plan"] [data-streamdown-animate]').count(),
      0,
      "Retained text does not animate",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    const ticks = () =>
      clock.evaluate((el) => Number(getComputedStyle(el).getPropertyValue("--goal-ticks")));
    const beforeTick = await ticks();
    await page.waitForFunction(() => {
      const el = document.querySelector("[data-goal-clock]");
      return el && Number(getComputedStyle(el).getPropertyValue("--goal-ticks")) >= 127;
    });
    assert.ok(
      (await ticks()) > beforeTick,
      "CSS clock advances with no new accounting snapshot, including reduced motion",
    );
    snapshot.goal.snapshot = {
      ...snapshot.goal.snapshot,
      revision: "paused-proof",
      status: "paused",
      timeUsedSeconds: 3599,
    };
    await page.waitForFunction(() => {
      const el = document.querySelector("[data-goal-clock]");
      return el && getComputedStyle(el).animationPlayState === "paused";
    });
    const pausedTicks = await ticks();
    await page.waitForTimeout(1100);
    assert.equal(await ticks(), pausedTicks, "Paused clock never advances");
    snapshot.goal.snapshot = {
      ...snapshot.goal.snapshot,
      revision: "resumed-proof",
      status: "active",
    };
    await page.waitForFunction(() => {
      const el = document.querySelector("[data-goal-clock]");
      return el && Number(getComputedStyle(el).getPropertyValue("--goal-ticks")) >= 3600;
    });
    snapshot.goal.snapshot = {
      ...snapshot.goal.snapshot,
      revision: "restored-proof",
      timeUsedSeconds: 125,
    };
    delete snapshot.activeOperation;
    try {
      await goal.waitFor();
    } catch (error) {
      await page.screenshot({
        path: `${DRAWLOOM_UI_EVIDENCE_DIR}/goal-missing.png`,
      });
      console.error(
        JSON.stringify({
          pageErrors: errors,
          goalTextPresent: await page
            .getByText("Verify the shared goal and plan presentation", {
              exact: true,
            })
            .count(),
        }),
      );
      throw error;
    }
    assert.ok(
      await goal
        .getByText("Verify the shared goal and plan presentation", {
          exact: true,
        })
        .isVisible(),
    );
    await goal.getByRole("button", { name: /Last reported: 125 seconds used/ }).waitFor();
    const objectiveDisclosure = goal.getByRole("button", {
      name: "Goal objective: Verify the shared goal and plan presentation",
      exact: true,
    });
    await objectiveDisclosure.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    try {
      await page
        .getByRole("tooltip")
        .filter({ hasText: "Verify the shared goal and plan presentation" })
        .waitFor({ timeout: 3000 });
    } catch (error) {
      await page.screenshot({
        path: `${DRAWLOOM_UI_EVIDENCE_DIR}/tooltip-state.png`,
      });
      console.error(
        await objectiveDisclosure.evaluate((element) => ({
          attributes: [...element.attributes].map((a) => [a.name, a.value]),
          focused: element === document.activeElement,
          tooltips: [...document.querySelectorAll('[data-slot="tooltip-content"]')].map((e) => ({
            text: e.textContent,
            role: e.getAttribute("role"),
          })),
          errors: [],
        })),
      );
      throw error;
    }
    await goal.getByRole("button", { name: "Edit goal", exact: true }).focus();
    await page.keyboard.press("Enter");
    const goalInput = goal.getByRole("textbox", {
      name: "Goal objective",
      exact: true,
    });
    await goalInput.waitFor();
    assert.equal(await goalInput.inputValue(), "Verify the shared goal and plan presentation");
    await goalInput.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      isComposing: true,
      bubbles: true,
    });
    assert.equal(commands.length, 0, "IME Enter never saves a goal edit");
    await goalInput.press("Escape");
    assert.equal(
      await goal
        .getByRole("button", { name: "Edit goal", exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
      "Cancelling goal edit restores the edit trigger focus",
    );
    if (width === 390) {
      snapshot.goal.error = "Synthetic goal reconciliation failed.";
      const goalNotice = page
        .getByRole("alert")
        .filter({ hasText: "Synthetic goal reconciliation failed." });
      await goalNotice.waitFor();
      assert.equal(await goal.count(), 0, "Unreconciled goals expose no mutation controls");
      assert.ok(
        await goalNotice.getByRole("button", { name: "Refresh goal", exact: true }).isVisible(),
      );
    }
    const plan = page.locator('[data-history-id="synthetic-plan"]');
    snapshot.goal = { supported: true, snapshot: null };
    await goal.waitFor({ state: "hidden" });
    assert.equal(await page.getByText("No goal set", { exact: true }).count(), 0);
    const existingDraft = await page
      .getByRole("combobox", { name: "Message", exact: true })
      .inputValue();
    await page.getByRole("button", { name: "Add to message", exact: true }).click();
    assert.equal(
      await page.getByRole("combobox", { name: "Message", exact: true }).inputValue(),
      existingDraft,
      "Opening + does not modify the message",
    );
    const addOptions = page
      .getByRole("listbox", { name: "Add context", exact: true })
      .getByRole("option");
    await page.getByRole("option", { name: /Create goal/ }).waitFor();
    assert.match(await addOptions.nth(0).innerText(), /Choose files/);
    assert.match(await addOptions.nth(1).innerText(), /Create goal/);
    await page.getByRole("option", { name: /Create goal/ }).click();
    await page.getByRole("textbox", { name: "Goal objective", exact: true }).waitFor();
    await page.getByRole("textbox", { name: "Goal objective", exact: true }).press("Escape");
    await goal.waitFor({ state: "hidden" });
    assert.equal(commands.length, 0, "Opening and dismissing goal creation sends no command");
    const slashInput = page.getByRole("combobox", {
      name: "Message",
      exact: true,
    });
    await slashInput.fill("/");
    const actionList = page.getByRole("listbox", {
      name: "Actions and skills",
      exact: true,
    });
    await actionList.waitFor();
    assert.ok(await actionList.getByRole("option", { name: /Create goal/ }).isVisible());
    assert.ok(await actionList.getByRole("option", { name: /Component proof skill/ }).isVisible());
    await slashInput.fill("/goal");
    await actionList.getByRole("option", { name: /Create goal/ }).click();
    await page.getByRole("textbox", { name: "Goal objective", exact: true }).waitFor();
    await page.getByRole("textbox", { name: "Goal objective", exact: true }).press("Escape");
    assert.equal(
      await slashInput.inputValue(),
      "",
      "Choosing action consumes only the slash command",
    );
    assert.equal(commands.length, 0, "Slash selection opens editor, never submits a turn");
    await slashInput.fill("/goal Inspect this project without changing any files.");
    await slashInput.press("Enter");
    await page.waitForFunction(() => document.querySelector("#message-draft")?.value === "");
    assert.equal(commands.length, 1);
    assert.deepEqual(commands[0], {
      kind: "goal",
      conversationId: snapshot.selectedId,
      command: {
        action: "create",
        objective: "Inspect this project without changing any files.",
      },
    });
    commandError = true;
    await slashInput.fill("/goal Preserve my objective after failure.");
    await slashInput.press("Enter");
    const composerError = page.locator(".composer-area [role=alert]");
    await composerError.waitFor();
    const errorBox = await composerError.boundingBox();
    const composerBox = await page.locator("form.composer").boundingBox();
    assert.ok(
      composerBox.y > errorBox.y + errorBox.height,
      "Composer feedback uses shared stack spacing",
    );
    assert.equal(await slashInput.inputValue(), "/goal Preserve my objective after failure.");
    commandError = false;
    await slashInput.press("Enter");
    await composerError.waitFor({ state: "hidden" });
    commands.length = 0; // Intercepted goal command verified; later checks prohibit further writes.
    await slashInput.fill("/plan");
    await actionList.getByRole("option", { name: /Plan mode/ }).click();
    await page.waitForFunction(() => document.querySelector("#message-draft")?.value === "");
    assert.deepEqual(commands, [
      { kind: "set_mode", conversationId: snapshot.selectedId, mode: "plan" },
    ]);
    commands.length = 0;
    const proposal = page.locator('[data-history-id="synthetic-proposal"]');
    await proposal.getByRole("button", { name: "Implement plan", exact: true }).click();
    await page.waitForTimeout(100);
    assert.deepEqual(commands, [
      {
        kind: "implement_plan",
        conversationId: snapshot.selectedId,
        proposalId: "synthetic-proposal",
      },
    ]);
    commands.length = 0;
    await plan.waitFor();
    await plan.getByText("Exercise keyboard disclosure", { exact: true }).waitFor();
    const planTrigger = plan.getByRole("button", {
      name: "Toggle plan",
      exact: true,
    });
    await planTrigger.focus();
    await page.keyboard.press("Enter");
    await plan
      .getByText("Exercise keyboard disclosure", { exact: true })
      .waitFor({ state: "hidden" });
    await page.keyboard.press("Enter");
    await plan.getByText("Exercise keyboard disclosure", { exact: true }).waitFor();
    const userText = page.locator("[data-user-turn] .markdown-content").first();
    assert.equal(
      await userText
        .locator("p")
        .first()
        .evaluate((e) => getComputedStyle(e).color),
      await userText.evaluate((e) => getComputedStyle(e.parentElement).color),
      "User Markdown inherits its bubble foreground in both themes",
    );
    if (zoom !== 1)
      await page.evaluate((value) => {
        document.documentElement.style.zoom = String(value);
      }, zoom);
    const scroll = page.locator(".conversation-scroll");
    // Long resource names must shrink inside a docked conversation, not force
    // a horizontal scrollbar. Check the scrollport, not just the outer page.
    await page.getByRole("button", { name: "Toggle artifact pane", exact: true }).click();
    assert.ok(
      await scroll.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      "Docked conversation contains resource cards without horizontal overflow",
    );
    await page.getByRole("button", { name: "Close artifact pane", exact: true }).click();
    await page.waitForFunction(() => {
      const e = document.querySelector(".conversation-scroll");
      return e && e.scrollHeight - e.clientHeight - e.scrollTop < 8;
    });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "No page overflow",
    );
    const draft = page.getByRole("combobox", { name: "Message", exact: true });
    await draft.fill("Review draft");
    await draft.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      isComposing: true,
      bubbles: true,
    });
    assert.equal(commands.length, 0, "IME Enter never submits");
    await draft.press("Shift+Enter");
    assert.ok((await draft.inputValue()).includes("\n"), "Shift+Enter retains newline");
    assert.equal(commands.length, 0);
    await draft.fill("@Component");
    await page.getByRole("option", { name: /Component proof skill/ }).waitFor();
    await draft.press("Enter");
    await page.getByRole("button", { name: /Remove Component proof skill/ }).waitFor();
    assert.equal(commands.length, 0, "Mention Enter selects context, not submission");
    await draft.fill("Review draft");
    const card = page.locator(".interaction").filter({ hasText: "Execution approval" });
    if (await card.count())
      assert.ok(
        await card.evaluate((e) => e.scrollWidth <= e.clientWidth),
        "Approval content fits",
      );
    await page.screenshot({
      path: `${DRAWLOOM_UI_EVIDENCE_DIR}/conversation-${colorScheme}-${width}-${zoom}x.png`,
    });
    await scroll.hover();
    await page.mouse.wheel(0, -900);
    await page.waitForFunction(() => {
      const e = document.querySelector(".conversation-scroll");
      return e.scrollHeight - e.clientHeight - e.scrollTop > 100;
    });
    const before = await scroll.evaluate((e) => e.scrollTop);
    // A new observation need not mean a new response. Re-rendering must not drag
    // someone reading earlier history back to the tail.
    await draft.fill("Keep my reading position");
    assert.ok(Math.abs((await scroll.evaluate((e) => e.scrollTop)) - before) < 8);
    await page.getByRole("button", { name: "Scroll to bottom", exact: true }).click();
    await page.waitForFunction(() => {
      const e = document.querySelector(".conversation-scroll");
      return e.scrollHeight - e.clientHeight - e.scrollTop < 8;
    });
    assert.deepEqual(errors, []);
    assert.equal(commands.length, 0);
    console.log(
      JSON.stringify({
        colorScheme,
        width,
        zoom,
        tail: true,
        readingPosition: true,
        ime: true,
        noHostWrites: true,
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
