import { expect, test } from "bun:test";
import { BrowserController, type BrowserTransport } from "./browser-controller.js";

test("late geometry for a closed tab does not invoke native placement or show an error", async () => {
  const browser = new BrowserController(
    {
      execute: async () => {
        throw new Error("closed tab");
      },
      subscribe: async () => () => {},
    },
    () => {},
  );
  await browser.place("closed", { x: 0, y: 0, width: 1, height: 1 }, false);
  expect(browser.error).toBe("");
});

test("closing selected tab chooses a neighbour in the same conversation only after success", async () => {
  const tabs = ["a", "b", "c"].map((id) => ({
    id,
    conversationId: "conversation",
    title: id,
    url: "",
    status: "blank" as const,
    canGoBack: false,
    canGoForward: false,
  }));
  let fail = true;
  const browser = new BrowserController(
    {
      execute: async (action) => {
        if (action.kind === "close" && fail) throw new Error("rejected");
        return {
          available: true,
          tabs: action.kind === "close" ? tabs.filter((t) => t.id !== action.tabId) : tabs,
          requests: [],
          permissions: [],
        };
      },
      subscribe: async () => () => {},
    },
    () => {},
  );
  await browser.start();
  browser.select("b");
  expect(await browser.close("b")).toBe(false);
  expect(browser.selectedId).toBe("b");
  fail = false;
  expect(await browser.close("b")).toBe(true);
  expect(browser.selectedId).toBe("c");
});

test("unavailable native browsing is explicit and never invokes a command", async () => {
  const browser = new BrowserController(undefined, () => {});
  await browser.start();
  await browser.open("conversation");
  expect(browser.snapshot.available).toBe(false);
  expect(browser.error).toContain("native");
});

test("closing inactive or last tab never selects a different conversation", async () => {
  let tabs = ["a", "b", "other"].map((id) => ({
    id,
    conversationId: id === "other" ? "different" : "conversation",
    title: id,
    url: "",
    status: "blank" as const,
    canGoBack: false,
    canGoForward: false,
  }));
  const browser = new BrowserController(
    {
      execute: async (action) => {
        if (action.kind === "close") tabs = tabs.filter((t) => t.id !== action.tabId);
        return { available: true, tabs, requests: [], permissions: [] };
      },
      subscribe: async () => () => {},
    },
    () => {},
  );
  await browser.start();
  browser.select("a");
  expect(await browser.close("b")).toBe(true);
  expect(browser.selectedId).toBe("a");
  expect(await browser.close("a")).toBe(true);
  expect(browser.selectedId).toBe("");
  expect(browser.snapshot.tabs.map((t) => t.id)).toEqual(["other"]);
});

test("open is blank and conversation-bound; only explicit navigation sends a URL", async () => {
  const commands: unknown[] = [];
  const snapshot = {
    available: true,
    tabs: [
      {
        id: "tab",
        conversationId: "conversation",
        title: "New tab",
        url: "",
        status: "blank",
        canGoBack: false,
        canGoForward: false,
      },
    ],
    requests: [],
    permissions: [],
  };
  const transport: BrowserTransport = {
    execute: async (action) => {
      commands.push(action);
      return snapshot;
    },
    subscribe: async () => () => {},
  };
  const browser = new BrowserController(transport, () => {});
  await browser.open("conversation");
  expect(commands).toEqual([{ kind: "open", conversationId: "conversation" }]);
  expect(browser.selectedId).toBe("tab");
  await browser.navigate("https://example.org");
  expect(commands[1]).toEqual({ kind: "navigate", tabId: "tab", url: "https://example.org/" });
});

test("malformed native snapshots do not replace known state", async () => {
  const browser = new BrowserController(
    { execute: async () => ({ available: true }), subscribe: async () => () => {} },
    () => {},
  );
  await browser.start();
  expect(browser.snapshot.available).toBe(false);
  expect(browser.error).not.toBe("");
});

test("a late read after disposal cannot republish native state", async () => {
  let resolve!: (value: unknown) => void;
  const browser = new BrowserController(
    {
      execute: () =>
        new Promise((done) => {
          resolve = done;
        }),
      subscribe: async () => () => {},
    },
    () => {},
  );
  const started = browser.start();
  await Promise.resolve();
  browser.dispose();
  resolve({ available: true, tabs: [], requests: [], permissions: [] });
  await started;
  expect(browser.snapshot.available).toBe(false);
});
