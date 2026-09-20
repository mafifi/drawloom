import { DesktopBrowserSnapshotSchema, type DesktopBrowser } from "./browser.js";

/** Read-only and blank-tab conformance; requires a disposable host instance. */
export async function desktopBrowserConformance(browser: DesktopBrowser): Promise<void> {
  const check = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const initial = DesktopBrowserSnapshotSchema.parse(await browser.execute({ kind: "read" }));
  if (!initial.available) {
    check(Boolean(initial.reason), "Unavailable browsing must explain why");
    return;
  }
  const existing = new Set(initial.tabs.map((tab) => tab.id));
  const opened = DesktopBrowserSnapshotSchema.parse(
    await browser.execute({ kind: "open", conversationId: "browser-conformance" }),
  );
  const tab = opened.tabs.find((tab) => !existing.has(tab.id));
  check(
    tab?.conversationId === "browser-conformance",
    "New tabs must preserve the owning conversation",
  );
  check(tab?.status === "blank" && tab.url === "", "Opening a tab must not navigate");
  if (!tab) throw new Error("Missing new tab");
  const closed = DesktopBrowserSnapshotSchema.parse(
    await browser.execute({ kind: "close", tabId: tab.id }),
  );
  check(!closed.tabs.some((value) => value.id === tab.id), "Closing must remove the exact tab");
  check(
    initial.tabs.every((value) => closed.tabs.some((current) => current.id === value.id)),
    "Closing must preserve unrelated tabs",
  );
}
