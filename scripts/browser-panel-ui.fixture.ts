import assert from "node:assert/strict";
import type { Page } from "playwright";

/** Synthetic native transport only: verifies UI, never claims WKWebView isolation. */
export async function verifyBrowserPanel(page: Page, origin: string) {
  await page.addInitScript(() => {
    const snapshot = {
      available: true,
      tabs: [] as Record<string, unknown>[],
      requests: [] as Record<string, unknown>[],
      permissions: [] as Record<string, unknown>[],
    };
    const commands: Record<string, unknown>[] = [];
    const listeners: ((event: { payload: unknown }) => void)[] = [];
    const emit = () =>
      listeners.forEach((listener) => listener({ payload: structuredClone(snapshot) }));
    const bridge = {
      core: {
        invoke: async (_command: string, { action }: { action: Record<string, unknown> }) => {
          commands.push(action);
          if (action.kind === "open")
            snapshot.tabs.push({
              id: `browser-tab-${snapshot.tabs.length + 1}`,
              conversationId: action.conversationId,
              title: "New tab",
              url: "",
              status: "blank",
              canGoBack: false,
              canGoForward: false,
            });
          if (action.kind === "navigate") {
            Object.assign(snapshot.tabs.find((tab) => tab.id === action.tabId)!, {
              url: action.url,
              title: "Example website",
              status: "ready",
            });
          }
          if (action.kind === "decide") {
            if (action.choice === "allow")
              snapshot.permissions.push({
                origin: "https://camera.example",
                permission: "camera",
                decision: "allow",
              });
            snapshot.requests = [];
          }
          if (action.kind === "forget") {
            snapshot.permissions = [];
            Object.assign(snapshot.tabs[0]!, { status: "unloaded" });
          }
          if (action.kind === "close")
            snapshot.tabs = snapshot.tabs.filter((tab) => tab.id !== action.tabId);
          if (action.kind !== "place") emit();
          return structuredClone(snapshot);
        },
      },
      event: {
        listen: async (_event: string, callback: (event: { payload: unknown }) => void) => {
          listeners.push(callback);
          return () => {
            const index = listeners.indexOf(callback);
            if (index >= 0) listeners.splice(index, 1);
          };
        },
      },
    };
    Object.assign(window, {
      __TAURI__: bridge,
      __browserFixture: {
        commands,
        request: () => {
          snapshot.requests = [
            {
              id: "request",
              tabId: "browser-tab-1",
              documentId: "document",
              origin: "https://camera.example",
              topOrigin: "https://camera.example",
              permissions: ["camera"],
            },
          ];
          emit();
        },
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin);
  const composer = page.locator("form.composer textarea");
  await composer.fill("/");
  await page.getByRole("option").filter({ hasText: "Open browser" }).click();
  const address = page.getByRole("textbox", { name: "Website address" });
  await address.waitFor();
  const tabList = page.getByRole("tablist", { name: "Workspace tabs" });
  assert.equal(await tabList.getAttribute("data-variant"), "line");
  assert.equal(
    await tabList.evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  assert.equal(await address.inputValue(), "");
  assert.equal(await address.evaluate((element) => element === document.activeElement), true);
  assert.equal(await composer.inputValue(), "");
  const commands = () =>
    page.evaluate(
      () =>
        (window as unknown as { __browserFixture: { commands: { kind: string }[] } })
          .__browserFixture.commands,
    );
  assert.equal(
    (await commands()).some((action) => action.kind === "navigate"),
    false,
  );
  await address.fill("https://example.org");
  await address.press("Enter");
  await page.getByRole("tab", { name: "Example website", exact: true }).waitFor();
  const beforeSwitch = (await commands()).length;
  await page.getByRole("button", { name: "Add workspace tab", exact: true }).click();
  await page.getByRole("menuitem", { name: "Browser", exact: true }).click();
  await page.waitForFunction((beforeSwitch) => {
    const commands = (
      window as unknown as { __browserFixture: { commands: Record<string, unknown>[] } }
    ).__browserFixture.commands;
    return commands
      .slice(beforeSwitch)
      .some(
        (command) =>
          command.kind === "place" &&
          command.tabId === "browser-tab-1" &&
          command.visible === false,
      );
  }, beforeSwitch);
  await page.getByRole("button", { name: "Close New tab", exact: true }).click();
  await page.getByRole("tab", { name: "New tab", exact: true }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Close Workbench tab", exact: true }).click();
  await page.getByRole("tab", { name: "Workbench", exact: true }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Add workspace tab", exact: true }).click();
  await page.getByRole("menuitem", { name: "Workbench", exact: true }).click();
  await page.getByRole("tab", { name: "Example website", exact: true }).click();
  await page.getByRole("tab", { name: "Workbench", exact: true }).click();
  await page.getByRole("tab", { name: "Example website", exact: true }).click();
  await page.getByRole("button", { name: "Expand workspace", exact: true }).click();
  await page.getByRole("button", { name: "Restore workspace", exact: true }).click();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [970, 390]) {
      await page.setViewportSize({ width, height: 866 });
      assert.equal(
        await page.locator("body").evaluate((el) => el.scrollWidth <= window.innerWidth),
        true,
      );
      await address.waitFor();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() =>
    (window as unknown as { __browserFixture: { request(): void } }).__browserFixture.request(),
  );
  await page.getByRole("dialog").filter({ hasText: "Website permission" }).waitFor();
  await page.getByRole("button", { name: "Always allow for this site", exact: true }).click();
  const settings = page.getByRole("button", { name: "Settings and more", exact: true });
  if (!(await settings.isVisible()))
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).first().click();
  await settings.click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Browser", exact: true }).click();
  await page.getByRole("heading", { name: "Site permissions", exact: true }).waitFor();
  await page.getByText("https://camera.example", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Reset to Ask", exact: true }).click();
  await page.getByText("No saved site permissions", { exact: true }).waitFor();
  await page.getByRole("button", { name: "← Back to app", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Reload", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Go", exact: true }).isEnabled(), true);
}
