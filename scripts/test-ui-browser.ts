import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createDesktopApplication } from "../apps/desktop/host/application.js";
import { serveDesktop } from "../apps/desktop/host/server.js";
import { createSqliteConversationHistory } from "@drawloom/sqlite-conversation-history";
import type { HistoryEntry } from "@drawloom/conversation-history";

// Public synthetic acceptance, isolated from user installations and model providers.
const root = await mkdtemp(join(tmpdir(), "drawloom-ui-acceptance-"));
let app: Awaited<ReturnType<typeof createDesktopApplication>> | undefined;
let server: ReturnType<typeof serveDesktop> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const working = join(root, "working");
  await mkdir(working);
  const data = join(root, "data");
  app = await createDesktopApplication(data);
  await app.command({ kind: "add_project", directory: working });
  await app.command({ kind: "create_conversation", workbenchId: "text", provider: "synthetic" });
  const id = (await app.snapshot()).selectedId;
  await app.close();
  const history = createSqliteConversationHistory(join(data, "history.sqlite"));
  const entries: HistoryEntry[] = Array.from({ length: 90 }, (_, i) => ({
    id: `entry-${i}`,
    position: [i, 0],
    role: i % 2 ? "assistant" : "user",
    origin: { kind: i % 2 ? "assistant" : "user" },
    text: `Synthetic turn ${i}\n\n${"Readable public fixture. ".repeat(8)}`,
    assets: [],
    state: "complete",
  }));
  entries.push({
    id: "tool-before",
    position: [90, 0],
    role: "assistant",
    origin: {
      kind: "tool",
      source: "fixture",
      callId: "call-one",
      title: "Inspect document",
      outcome: "completed",
      format: "json",
    },
    text: JSON.stringify({
      finding: "uniquetoolsearchmarker",
      source: "x".repeat(2000),
      records: Array.from({ length: 50 }, (_, n) => n),
    }),
    assets: [],
    state: "complete",
  });
  entries.push({
    id: "answer-between",
    position: [91, 0],
    role: "assistant",
    origin: { kind: "assistant" },
    text:
      "**An answer between tool calls.**\n\nA long URL: https://example.invalid/" +
      "segment".repeat(120),
    assets: [],
    state: "complete",
  });
  entries.push({
    id: "tool-failed",
    position: [92, 0],
    role: "assistant",
    origin: {
      kind: "tool",
      source: "fixture",
      callId: "call-two",
      title: "Read unavailable source",
      outcome: "failed",
      format: "text",
    },
    text: "This source is unavailable. No retry occurred.",
    assets: [],
    state: "complete",
  });
  await history.commit(id, {
    expectedRevision: (await history.status(id)).revision,
    entries,
    sync: {
      sync: "unavailable",
      message: "Synthetic provider unavailable. Saved history remains readable.",
    },
  });
  await history.close();
  app = await createDesktopApplication(data);
  server = serveDesktop(app, resolve(process.env.DRAWLOOM_WEB_BUILD_DIR ?? "apps/desktop/build"));
  browser = await chromium.launch({
    headless: true,
    ...(process.env.DRAWLOOM_BROWSER_EXECUTABLE
      ? { executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.url);
  await page.locator('[data-history-id="tool-failed"]').waitFor();
  const scroll = page.locator(".conversation-scroll");
  await page.waitForFunction(() => {
    const el = document.querySelector(".conversation-scroll")!;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 4;
  });
  const append = async (entry: HistoryEntry) => {
    const writer = createSqliteConversationHistory(join(data, "history.sqlite"));
    try {
      await writer.commit(id, {
        expectedRevision: (await writer.status(id)).revision,
        entries: [entry],
      });
    } finally {
      await writer.close();
    }
  };
  const growing: HistoryEntry = {
    id: "growing",
    position: [93, 0],
    role: "assistant",
    origin: { kind: "assistant" },
    text: "Live content begins.",
    assets: [],
    state: "partial",
  };
  await append(growing);
  await page.locator('[data-history-id="growing"]').waitFor();
  await append({ ...growing, text: "Live content grows.\n\n".repeat(100), state: "complete" });
  await page.waitForFunction(() =>
    document.querySelector('[data-history-id="growing"]')?.textContent?.includes("grows"),
  );
  await page.waitForFunction(() => {
    const el = document.querySelector(".conversation-scroll")!;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 4;
  });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [1440, 970, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(
        await scroll.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
        `${colorScheme}/${width}: conversation overflow`,
      );
      assert.equal(
        await page.locator("body").evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
        `${colorScheme}/${width}: body overflow`,
      );
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Toggle artifact pane", exact: true }).click();
  for (const width of [1440, 970]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await scroll.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      true,
      `Docked ${width}: conversation overflow`,
    );
    assert.equal(
      await page.locator(".workspace-pane").evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      true,
      `Docked ${width}: viewer overflow`,
    );
  }
  await page.getByRole("button", { name: "Toggle artifact pane", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Tool activity · 1 completed", exact: true }).click();
  await page.locator('[data-history-id="tool-before"]').getByRole("button").first().click();
  assert.equal(
    await scroll.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    true,
    "Expanded diagnostics stay bounded",
  );
  assert.equal(
    await page.locator('[data-history-id="answer-between"] strong').innerText(),
    "An answer between tool calls.",
  );
  const order = await page
    .locator("[data-history-id]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-history-id")));
  assert.ok(
    order.indexOf("tool-before") < order.indexOf("answer-between") &&
      order.indexOf("answer-between") < order.indexOf("tool-failed"),
  );
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  assert.equal(
    await scroll.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    true,
    "200% zoom stays bounded",
  );
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
  await page
    .getByRole("navigation", { name: "Conversation turns in loaded history" })
    .getByRole("button")
    .first()
    .click();
  await page.waitForFunction(() => {
    const el = document.querySelector(".conversation-scroll")!;
    return el.scrollHeight - el.scrollTop - el.clientHeight > 100;
  });
  const readingTop = await scroll.evaluate((el) => el.scrollTop);
  await append({ ...growing, text: "Late content while reading earlier.\n\n".repeat(140) });
  await page.waitForFunction(() =>
    document.querySelector('[data-history-id="growing"]')?.textContent?.includes("Late content"),
  );
  assert.ok(
    Math.abs((await scroll.evaluate((el) => el.scrollTop)) - readingTop) < 4,
    "Late content preserves the older reading position",
  );
  const noticeGap = await page.evaluate(() => {
    const notice = document.querySelector(".conversation-notice");
    const first = document.querySelector("[data-history-id]");
    return notice && first
      ? first.getBoundingClientRect().top - notice.getBoundingClientRect().bottom
      : null;
  });
  assert.ok(noticeGap !== null && noticeGap > 0, "History notice is separated from first message");
  await page.getByRole("button", { name: "Load earlier", exact: true }).click();
  await page.locator('[data-history-id="entry-0"]').waitFor();
  assert.equal(
    await scroll.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight > 100),
    true,
    "Earlier paging does not jump to the tail",
  );
  await page.reload();
  await page.waitForFunction(() => {
    const el = document.querySelector(".conversation-scroll");
    return (
      !!el &&
      el.scrollHeight > el.clientHeight &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 4
    );
  });
  await page.getByRole("button", { name: "Search conversations", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Search conversations", exact: true })
    .fill("uniquetoolsearchmarker");
  await page.getByRole("option").filter({ hasText: "uniquetoolsearchmarker" }).click();
  await page.locator('[data-history-id="tool-before"][data-search-anchor="true"]').waitFor();
  assert.equal(
    await page
      .locator('[data-history-id="tool-before"]')
      .getByText("uniquetoolsearchmarker", { exact: false })
      .isVisible(),
    true,
    "Search reveals a completed tool result",
  );
  assert.equal(
    await page
      .locator('[data-history-id="tool-before"]')
      .evaluate((el) => el === document.activeElement),
    true,
    "Search focuses its matching tool result",
  );
  // Render native approval states through the normal state protocol. These are
  // presentation fixtures, not permission or provider-execution acceptance.
  for (const surface of ["pending", "dismissed", "failed"] as const) {
    await page.route("**/api/state*", async (route) => {
      const response = await route.fetch();
      if (response.status() === 204) return route.fulfill({ response });
      const update = await response.json();
      update.sections.approvals = [
        {
          conversationId: id,
          presentationId: "fixture-surface",
          surface,
          submitting: false,
          presentation: "desktop",
          request: {
            approvalId: "fixture-approval",
            operationId: "fixture-operation",
            summary: "Review a bounded synthetic action " + "long-name-".repeat(60),
            options: [{ optionId: "native-choice", label: "Allow this action once" }],
          },
        },
      ];
      await route.fulfill({ response, json: update });
    });
    await page.reload();
    await page.getByRole("heading", { name: "Execution approval" }).waitFor();
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(
      await scroll.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      true,
      `${surface} approval is bounded`,
    );
    assert.equal(
      await page.getByRole("button", { name: "Allow this action once", exact: true }).count(),
      surface === "pending" ? 1 : 0,
    );
    const stop = page.getByRole("button", { name: "Stop", exact: true });
    assert.equal(await stop.isEnabled(), true, `${surface}: Stop remains available`);
    await stop.focus();
    assert.equal(await stop.evaluate((el) => el === document.activeElement), true);
    if (surface !== "pending") {
      assert.equal(
        await page
          .getByRole("button", {
            name: surface === "failed" ? "Show again" : "Reopen approval",
            exact: true,
          })
          .isEnabled(),
        true,
      );
    }
    await page.unroute("**/api/state*");
  }
  assert.deepEqual(errors, []);
  console.log(
    "Public UI acceptance: light/dark, narrow layouts, JSON expansion, chronology, initial/reload tail and 200% zoom passed.",
  );
} finally {
  await browser?.close();
  if (server) await server.close();
  else await app?.close();
  await rm(root, { recursive: true, force: true });
}
