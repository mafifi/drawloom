import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createDesktopApplication } from "../apps/desktop/host/application.js";
import { serveDesktop } from "../apps/desktop/host/server.js";
import { createSqliteConversationHistory } from "@drawloom/sqlite-conversation-history";
import type { HistoryEntry } from "@drawloom/conversation-history";
import { verifyBrowserPanel } from "./browser-panel-ui.fixture.js";

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
  // Native task controls use only synthetic snapshots and intercepted commands.
  // The fixture must never start provider work or mutate the installed app.
  const child = {
    id: "synthetic-child",
    parentId: null,
    revision: "current-child",
    label: "Documentation reviewer",
    status: "running" as const,
    result: { state: "available" as const, text: "**Review result:** one bounded finding." },
    controls: { interrupt: "available" as const },
  };
  await append({
    id: "native-child",
    position: [94, 0],
    role: "assistant",
    origin: { kind: "delegation", child },
    operationId: "child-operation",
    text: child.label,
    assets: [],
    state: "complete",
  });
  const taskSnapshot = await app.snapshot();
  taskSnapshot.delegation = { supported: true, children: [child] };
  taskSnapshot.forking = { supported: true };
  const taskCommands: unknown[] = [];
  const brandIcon =
    "data:image/svg+xml;base64," +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="orange"/></svg>',
    ).toString("base64");
  await page.route("**/api/discovery?*", (route) =>
    route.fulfill({
      json: {
        entries: [
          {
            id: "branded-plugin",
            name: "technical-plugin-name",
            origin: "synthetic",
            kind: "plugin",
            description: "Public branding fixture",
            scope: "session",
            availability: "available",
            selectable: true,
            revision: "branding",
            presentation: {
              displayName: "Friendly Plugin",
              icon: { light: brandIcon, dark: brandIcon },
            },
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
        token: "task-presentation",
        sections: taskSnapshot,
        removed: [],
      },
    }),
  );
  await page.route("**/api/command", (route) => {
    taskCommands.push(route.request().postDataJSON());
    return route.fulfill({ json: taskSnapshot });
  });
  await page.reload();
  const task = page.locator('[data-history-id="native-child"]');
  await task.getByRole("button", { name: "Follow up", exact: true }).waitFor();
  const composer = page.locator("form.composer textarea");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await composer.fill("Preserve this draft.");
      await task.getByRole("button", { name: "Follow up", exact: true }).click();
      assert.match(
        await composer.inputValue(),
        /^Preserve this draft\.\n\nPlease follow up with Documentation reviewer:/,
      );
      assert.equal(await composer.evaluate((el) => el === document.activeElement), true);
      assert.equal(taskCommands.length, 0, "Preparing delegation never sends a command");
      assert.equal(await scroll.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
      await composer.fill("/fork");
      await page.getByRole("option").filter({ hasText: "Fork conversation" }).waitFor();
      await composer.press("Enter");
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("heading", { name: "Fork conversation" }).waitFor();
      assert.equal(await dialog.getByText(/Project files remain shared/).isVisible(), true);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(taskCommands.length, 0, "Cancelling fork never submits");
      await composer.fill("Keep these notes.");
      await page.getByRole("button", { name: "Add to message", exact: true }).click();
      const branded = page.getByRole("option").filter({ hasText: "Friendly Plugin" });
      await branded.waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[role="option"] img')].some(
          (el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0,
        ),
      );
      assert.equal(
        await page.getByRole("option").filter({ hasText: "technical-plugin-name" }).count(),
        0,
      );
      assert.equal(await page.getByRole("option").filter({ hasText: "Delegate task" }).count(), 0);
      assert.equal(
        await page
          .locator(
            '[role="option"][id^="mention-document"], [role="option"][id^="mention-conversation"]',
          )
          .count(),
        0,
      );
      assert.equal(await page.getByText("Files and chats", { exact: true }).isVisible(), true);
      assert.equal(
        await page.getByText("Type to search files or chats", { exact: true }).isVisible(),
        true,
      );
      assert.equal(
        await page
          .getByText(
            "You review actions when required. Saving work does not accept it as finished.",
          )
          .count(),
        0,
      );
      await page.getByRole("option").filter({ hasText: "Type to search files or chats" }).click();
      await page.getByRole("listbox", { name: "Files and chats", exact: true }).waitFor();
      assert.equal(await composer.inputValue(), "Keep these notes. @");
      assert.equal(await composer.evaluate((el) => el === document.activeElement), true);
      assert.equal(await page.getByRole("option").count(), 0);
      assert.equal(
        await page.getByText("Type to search files or chats", { exact: true }).isVisible(),
        true,
      );
      await composer.fill("Keep these notes. @no-such-context-9281");
      await page.getByText("No matching items", { exact: true }).waitFor();
      assert.equal(await page.getByRole("option").count(), 0);
      await composer.press("Escape");
      assert.equal(await composer.inputValue(), "Keep these notes. @no-such-context-9281");
      assert.equal(
        await page.locator(".workspace-conversation").evaluate((el) => {
          el.scrollTop = 108;
          return el.scrollTop;
        }),
        0,
        "the outer conversation must not scroll and leave a gap below the composer",
      );
      await composer.fill("/");
      await page.getByRole("option").filter({ hasText: "Fork conversation" }).waitFor();
      assert.equal(await page.getByRole("option").filter({ hasText: "Delegate task" }).count(), 0);
      await composer.press("Escape");
      assert.equal(taskCommands.length, 0, "Inspecting action menus never submits");
    }
  }
  await verifyBrowserPanel(page, new URL(server.url).origin);
  assert.deepEqual(errors, []);
  console.log(
    "Public UI acceptance: themes, narrow layouts, JSON, chronology, scrolling, zoom, native-task actions and scripted browser panel/settings passed.",
  );
} finally {
  await browser?.close();
  if (server) await server.close();
  else await app?.close();
  await rm(root, { recursive: true, force: true });
}
