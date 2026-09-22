import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { test } from "vitest";
import { createDesktopApplication } from "../apps/desktop/host/application.ts";
import { serveDesktop } from "../apps/desktop/host/server.ts";
import { createSqliteConversationHistory } from "@drawloom/sqlite-conversation-history";
import type { HistoryEntry } from "@drawloom/conversation-history";
import { verifyBrowserPanel } from "./browser-panel-ui.fixture.ts";
import { build as esbuild } from "esbuild";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createInstallationStore } from "../apps/desktop/host/plugin-installations.ts";
import { createTestDesktopApplication } from "../apps/desktop/host/test-project.fixture.ts";

// Public synthetic acceptance, isolated from user installations and model providers.
// Runs under a dedicated Vitest project (see vitest.config.ui.ts) so it never
// joins the default `pnpm run test` sweep; `pnpm run test:ui` runs this file alone.
test("desktop UI acceptance: themes, narrow layouts, scrolling, zoom, native-task actions", {
  timeout: 120_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-ui-acceptance-"));
  let app: Awaited<ReturnType<typeof createDesktopApplication>> | undefined;
  let server: Awaited<ReturnType<typeof serveDesktop>> | undefined;
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
    server = await serveDesktop(
      app,
      resolve(process.env.DRAWLOOM_WEB_BUILD_DIR ?? "apps/desktop/build"),
    );
    browser = await chromium.launch({
      headless: true,
      ...(process.env.DRAWLOOM_BROWSER_EXECUTABLE
        ? { executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE }
        : {}),
    });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/state*", (route) => route.abort("connectionfailed"));
    await page.goto(server.url);
    const composer = page.locator("form.composer textarea");
    const send = page.getByRole("button", { name: "Send message", exact: true });
    assert.equal(
      (await send.count()) === 0 || (await send.isDisabled()),
      true,
      "Send starts unavailable without host authority",
    );
    await page.unroute("**/api/state*");
    await composer.waitFor();
    await composer.fill("Keep this draft through host recovery.");
    await send.waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        !(document.querySelector('button[aria-label="Send message"]') as HTMLButtonElement | null)
          ?.disabled,
    );
    assert.equal(await composer.isEnabled(), true, "Validated state enables draft editing");
    assert.equal(await send.isEnabled(), true, "Validated state enables live composer actions");
    await page.route("**/api/state*", (route) => route.abort("connectionfailed"));
    await page.waitForFunction(
      () =>
        (document.querySelector('button[aria-label="Send message"]') as HTMLButtonElement | null)
          ?.disabled === true,
    );
    assert.equal(await composer.isEnabled(), true, "Cached conversation remains inspectable");
    assert.equal(await composer.inputValue(), "Keep this draft through host recovery.");
    await page.unroute("**/api/state*");
    await page.waitForFunction(
      () =>
        !(document.querySelector('button[aria-label="Send message"]') as HTMLButtonElement | null)
          ?.disabled,
    );
    assert.equal(await composer.inputValue(), "Keep this draft through host recovery.");
    await composer.fill("");
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
        await page
          .locator(".workspace-pane")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
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
    assert.ok(
      noticeGap !== null && noticeGap > 0,
      "History notice is separated from first message",
    );
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
        assert.equal(
          await page.getByRole("option").filter({ hasText: "Delegate task" }).count(),
          0,
        );
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
        assert.equal(
          await page.getByRole("option").filter({ hasText: "Delegate task" }).count(),
          0,
        );
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
});

// A real installed public package supplies the rendered iframe. Browser routes
// only hold/reorder the host responses; they do not create a fake production API.
test("installed plugin view mounts, loads once, and closes its exact mount on conversation switch", {
  timeout: 120_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-ui-view-"));
  let app: Awaited<ReturnType<typeof createTestDesktopApplication>> | undefined;
  let server: Awaited<ReturnType<typeof serveDesktop>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const installations = await createInstallationStore(createNodeJsonStore(join(root, "state")));
    const pkg = join(root, "example");
    await mkdir(join(pkg, "org.drawloom"), { recursive: true });
    await esbuild({
      entryPoints: [
        resolve(import.meta.dirname, "../apps/desktop/host/example-backend.fixture.ts"),
      ],
      outfile: join(pkg, "org.drawloom", "backend.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
    });
    await writeFile(
      join(pkg, "plugin.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: "example",
        extensions: {
          "org.drawloom": {
            version: 1,
            backend: { entrypoint: "./org.drawloom/backend.mjs" },
            requires: [{ kind: "capability", id: "host" }],
            workbenches: [
              {
                id: "example",
                title: "Example",
                openingTool: { server: "editor", tool: "example.open" },
              },
            ],
          },
        },
      }),
    );
    const installationId = await installations.add(pkg);
    await installations.configure(installationId, {
      enabled: true,
      trustedBackend: true,
      servers: [],
      configuration: {},
    });
    app = await createTestDesktopApplication(root);
    await app.command({
      kind: "create_conversation",
      workbenchId: "example",
      provider: "synthetic",
    });
    const firstId = (await app.snapshot()).selectedId;
    await app.command({
      kind: "rename_conversation",
      conversationId: firstId,
      title: "First view conversation",
    });
    await app.command({
      kind: "create_conversation",
      workbenchId: "example",
      provider: "synthetic",
    });
    const secondId = (await app.snapshot()).selectedId;
    await app.command({
      kind: "rename_conversation",
      conversationId: secondId,
      title: "Second view conversation",
    });
    await app.command({ kind: "select_conversation", conversationId: firstId });
    server = await serveDesktop(
      app,
      resolve(process.env.DRAWLOOM_WEB_BUILD_DIR ?? "apps/desktop/build"),
    );
    browser = await chromium.launch({
      headless: true,
      ...(process.env.DRAWLOOM_BROWSER_EXECUTABLE
        ? { executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE }
        : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const sessionCalls: Array<{ action: string; conversationId: string; mountId?: string }> = [];
    const viewRequests: string[] = [];
    const bridgeRequests: Array<{ path: string; conversationId?: string }> = [];
    page.on("request", (request) => {
      if (/\/api\/(?:views\/|view-interaction|view-request)/.test(request.url()))
        viewRequests.push(request.url());
      if (/\/api\/(?:view-interaction|view-request)$/.test(new URL(request.url()).pathname)) {
        const body = request.postDataJSON() as { conversationId?: string };
        bridgeRequests.push({
          path: new URL(request.url()).pathname,
          ...(body.conversationId !== undefined ? { conversationId: body.conversationId } : {}),
        });
      }
    });
    let holdNextOpen = false;
    let releaseHeld: (() => void) | undefined;
    let heldStartedResolve: (() => void) | undefined;
    await page.route("**/api/view-session", async (route) => {
      const body = route.request().postDataJSON() as {
        action: string;
        conversationId: string;
        mountId?: string;
      };
      sessionCalls.push(body);
      if (body.action === "open" && holdNextOpen) {
        holdNextOpen = false;
        const response = await route.fetch();
        await new Promise<void>((resolve) => {
          releaseHeld = resolve;
          heldStartedResolve?.();
        });
        await route.fulfill({ response });
      } else await route.continue();
    });
    await page.goto(server.url);
    await page.getByRole("button", { name: "Toggle artifact pane" }).click();
    const frame = page.locator('iframe[title="Example view"]');
    await frame.waitFor();
    await page.frameLocator('iframe[title="Example view"]').getByText("Public fixture").waitFor();
    await page.frameLocator('iframe[title="Example view"]').getByText("Bridge ready").waitFor();
    assert.equal(
      await page.getByText("The view navigated away and was disconnected.").count(),
      0,
      "initial iframe load must not disconnect",
    );
    assert.equal(
      sessionCalls.filter((call) => call.action === "open" && call.conversationId === firstId)
        .length,
      1,
    );
    const oldFrame = await frame.elementHandle();
    await page.getByRole("button", { name: "Second view conversation", exact: true }).click();
    await page.waitForTimeout(3500);
    assert.equal(
      await oldFrame?.evaluate((el) => el.isConnected),
      false,
      "conversation switch removes old frame",
    );
    assert.equal(
      sessionCalls.filter((call) => call.action === "close" && call.conversationId === firstId)
        .length,
      1,
      "one close for first mount",
    );
    assert.deepEqual(
      bridgeRequests.filter((request) => request.conversationId === firstId),
      [],
      "destroyed rendered bridge cannot deliver its delayed message or tool request",
    );
    if ((await frame.count()) === 0)
      await page.getByRole("button", { name: "Toggle artifact pane" }).click();
    await page.frameLocator('iframe[title="Example view"]').getByText("Public fixture").waitFor();
    assert.equal(
      sessionCalls.filter((call) => call.action === "open" && call.conversationId === secondId)
        .length,
      1,
      "new conversation has one mount",
    );
    assert.equal(
      viewRequests.filter((url) => url.includes("/api/views/")).length,
      2,
      "each mounted frame navigates exactly once",
    );
    assert.equal(
      await page.getByText("The view navigated away and was disconnected.").count(),
      0,
      "one real navigation is still safe",
    );
    await frame.evaluate((el) => {
      (el as HTMLIFrameElement).src = "about:blank#second-load";
    });
    await page
      .getByText("The view navigated away and was disconnected.", { exact: false })
      .waitFor();
    assert.equal(await frame.isHidden(), true, "second iframe load is disconnected and hidden");

    // A later mount response must not navigate a frame that was destroyed by
    // another conversation selection. The close belongs to that exact mount.
    holdNextOpen = true;
    const heldStarted = new Promise<void>((resolve) => {
      heldStartedResolve = resolve;
    });
    await page.getByRole("button", { name: "First view conversation", exact: true }).click();
    await heldStarted;
    const navigationCount = viewRequests.filter((url) => url.includes("/api/views/")).length;
    await page.getByRole("button", { name: "Second view conversation", exact: true }).click();
    releaseHeld?.();
    await page.waitForTimeout(700);
    assert.equal(
      viewRequests.filter((url) => url.includes("/api/views/")).length,
      navigationCount + 1,
      "only the current conversation navigates after a held open",
    );
    assert.equal(
      sessionCalls.filter((call) => call.action === "close" && call.conversationId === firstId)
        .length,
      2,
      "each old mount closes exactly once",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server) await server.close();
    else await app?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("rendered Codex model choices ignore an older response after conversation switch", {
  timeout: 120_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-ui-models-"));
  let app: Awaited<ReturnType<typeof createDesktopApplication>> | undefined;
  let server: Awaited<ReturnType<typeof serveDesktop>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const working = join(root, "working");
    await mkdir(working);
    app = await createDesktopApplication(join(root, "data"));
    await app.command({ kind: "add_project", directory: working });
    await app.command({ kind: "create_conversation", workbenchId: "text", provider: "codex" });
    const firstId = (await app.snapshot()).selectedId;
    await app.command({
      kind: "rename_conversation",
      conversationId: firstId,
      title: "First model conversation",
    });
    await app.command({ kind: "create_conversation", workbenchId: "text", provider: "codex" });
    const secondId = (await app.snapshot()).selectedId;
    await app.command({
      kind: "rename_conversation",
      conversationId: secondId,
      title: "Second model conversation",
    });
    await app.command({ kind: "select_conversation", conversationId: firstId });
    server = await serveDesktop(
      app,
      resolve(process.env.DRAWLOOM_WEB_BUILD_DIR ?? "apps/desktop/build"),
    );
    browser = await chromium.launch({
      headless: true,
      ...(process.env.DRAWLOOM_BROWSER_EXECUTABLE
        ? { executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE }
        : {}),
    });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let modelCalls = 0;
    let releaseFirst: (() => void) | undefined;
    let firstStartedResolve: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      firstStartedResolve = resolve;
    });
    let secondStartedResolve: (() => void) | undefined;
    const secondStarted = new Promise<void>((resolve) => {
      secondStartedResolve = resolve;
    });
    await page.route("**/api/models", async (route) => {
      modelCalls++;
      if (modelCalls === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
          firstStartedResolve?.();
        });
        await route.fulfill({
          json: { models: [{ id: "stale-model", title: "Stale model", efforts: ["low"] }] },
        });
      } else {
        secondStartedResolve?.();
        await route.fulfill({
          json: { models: [{ id: "current-model", title: "Current model", efforts: ["low"] }] },
        });
      }
    });
    const commands: Array<{ kind: string; conversationId?: string }> = [];
    await page.route("**/api/command", async (route) => {
      commands.push(route.request().postDataJSON() as { kind: string; conversationId?: string });
      await route.continue();
    });
    await page.goto(server.url);
    await page.getByRole("button", { name: "Model", exact: true }).click();
    await firstStarted;
    await page.getByRole("button", { name: "Second model conversation", exact: true }).click();
    await page.getByRole("heading", { name: "Second model conversation", exact: true }).waitFor();
    await page.getByRole("button", { name: "Model", exact: true }).click();
    await secondStarted;
    await page
      .locator(".viewport-menu")
      .getByRole("button", { name: "Codex default", exact: true })
      .click();
    await page.getByText("Current model", { exact: true }).waitFor();
    releaseFirst?.();
    await page.waitForTimeout(100);
    assert.equal(
      modelCalls,
      2,
      "the keyed selector starts a separate request for the new conversation",
    );
    assert.equal(
      await page.getByText("Stale model", { exact: true }).count(),
      0,
      "late old model is not visible after the keyed switch",
    );
    assert.equal(
      await page
        .getByText("Models unavailable. Check the Codex connection.", { exact: true })
        .count(),
      0,
      "old settlement cannot add an error to the new selector",
    );
    assert.equal(
      await page.getByText("Current model", { exact: true }).isVisible(),
      true,
      "new options remain after old settlement",
    );
    await page.getByText("Current model", { exact: true }).click();
    assert.ok(
      commands.some(
        (command) => command.kind === "set_model" && command.conversationId === secondId,
      ),
      "selection targets current conversation",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server) await server.close();
    else await app?.close();
    await rm(root, { recursive: true, force: true });
  }
});
