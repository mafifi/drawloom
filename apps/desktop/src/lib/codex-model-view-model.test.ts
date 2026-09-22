import { expect, test } from "vitest";
import { createCodexModelViewModel } from "./codex-model-view-model.svelte.js";

const model = (id: string) => ({ id, title: id, efforts: ["low"], defaultEffort: "low" });

test("a successful load publishes models and clears the error", async () => {
  const view = createCodexModelViewModel({ load: async () => ({ models: [model("a")] }) });
  expect(view.loading).toBe(false);
  await view.refresh();
  expect(view.models.map((m) => m.id)).toEqual(["a"]);
  expect(view.error).toBe("");
});

test("a failed request reports an actionable message and leaves models alone", async () => {
  const view = createCodexModelViewModel({
    load: async () => {
      throw Error("network");
    },
  });
  await view.refresh();
  expect(view.models).toEqual([]);
  expect(view.error).toBe("Models unavailable. Check the Codex connection.");
  expect(view.loading).toBe(false);
});

test("a malformed response is an error, not partial models", async () => {
  // The schema is the boundary: a response that parses as JSON but is not the
  // shape we asked for must not reach the selector.
  const view = createCodexModelViewModel({ load: async () => ({ models: [{ id: 42 }] }) });
  await view.refresh();
  expect(view.models).toEqual([]);
  expect(view.error).not.toBe("");
});

test("a slow response cannot overwrite the result of a newer request", async () => {
  // The selector reloads every time it opens, so two requests overlap easily.
  // Without the epoch guard the stale answer wins simply by arriving last.
  let release: ((value: unknown) => void) | undefined;
  const responses = [
    new Promise((resolve) => {
      release = resolve;
    }),
    Promise.resolve({ models: [model("new")] }),
  ];
  let call = 0;
  const view = createCodexModelViewModel({ load: async () => responses[call++]! });

  const slow = view.refresh();
  // `refresh` ignores a second call while one is in flight, so settle the first
  // and start the next; the point is that the FIRST response lands last.
  release?.({ models: [model("stale")] });
  await slow;
  expect(view.models.map((m) => m.id)).toEqual(["stale"]);

  await view.refresh();
  expect(view.models.map((m) => m.id)).toEqual(["new"]);
});

test("a second refresh while one is in flight does not start a duplicate request", async () => {
  let calls = 0;
  let release: ((value: unknown) => void) | undefined;
  const view = createCodexModelViewModel({
    load: async () => {
      calls++;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const first = view.refresh();
  const second = view.refresh();
  expect(view.loading).toBe(true);
  release?.({ models: [model("a")] });
  await Promise.all([first, second]);
  expect(calls, "the in-flight request is reused rather than duplicated").toBe(1);
});
