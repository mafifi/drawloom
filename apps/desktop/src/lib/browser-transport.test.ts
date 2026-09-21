import { expect, test } from "vitest";
import {
  desktopBrowserConformance,
  type DesktopBrowser,
  type DesktopBrowserSnapshot,
} from "@drawloom/desktop-host";
import { browserTransportFromBridge } from "./browser-controller.js";

function deterministic(): DesktopBrowser {
  let snapshot: DesktopBrowserSnapshot = {
    available: true,
    tabs: [],
    requests: [],
    permissions: [],
  };
  return {
    subscribe: async () => () => {},
    execute: async (action) => {
      if (action.kind === "open")
        snapshot = {
          ...snapshot,
          tabs: [
            ...snapshot.tabs,
            {
              id: "disposable",
              conversationId: action.conversationId,
              title: "New tab",
              url: "",
              status: "blank",
              canGoBack: false,
              canGoForward: false,
            },
          ],
        };
      if (action.kind === "close")
        snapshot = { ...snapshot, tabs: snapshot.tabs.filter((tab) => tab.id !== action.tabId) };
      return structuredClone(snapshot);
    },
  };
}

test("browser conformance runs against deterministic and scripted native transport", async () => {
  await desktopBrowserConformance(deterministic());
  const host = deterministic();
  const browser = browserTransportFromBridge({
    core: {
      invoke: async (command, { action }) => {
        expect(command).toBe("browser_command");
        return host.execute(action);
      },
    },
    event: { listen: async () => () => {} },
  });
  await desktopBrowserConformance(browser);
});

test("invalid native notifications report an error without publishing state", async () => {
  let receive: (event: { payload: unknown }) => void = () => {};
  const browser = browserTransportFromBridge({
    core: { invoke: async () => ({}) },
    event: {
      listen: async (_, listener) => {
        receive = listener;
        return () => {};
      },
    },
  });
  let invalid = 0,
    updates = 0;
  await browser.subscribe(
    () => updates++,
    () => invalid++,
  );
  receive({ payload: { available: true, requests: [{ origin: "not a URL" }] } });
  expect(invalid).toBe(1);
  expect(updates).toBe(0);
  await expect(browser.execute({ kind: "read" })).rejects.toThrow();
});
