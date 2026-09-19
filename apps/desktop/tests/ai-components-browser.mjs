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
      { name: `drawloom_${url.port}`, value: url.searchParams.get("token"), url: url.origin },
    ]);
    const snapshot = (await (await context.request.get(url.origin + "/api/state")).json()).sections;
    snapshot.views = [];
    const page = await context.newPage(),
      errors = [],
      commands = [];
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
        json: { kind: "snapshot", token: "presentation-test", sections: snapshot, removed: [] },
      }),
    );
    await page.route("**/api/command", (route) => {
      commands.push(route.request().postDataJSON());
      return route.fulfill({ json: snapshot });
    });
    await page.goto(url.origin);
    await page.locator("[data-history-id]").last().waitFor();
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
