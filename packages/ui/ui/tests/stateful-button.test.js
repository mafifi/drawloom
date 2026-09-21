import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { createRawSnippet } from "svelte";
import { render } from "svelte/server";

// Compile actual component markup for behavioural SSR checks without a DOM
// dependency. Svelte check additionally verifies event and ref prop types.
import { StatefulButton } from "@drawloom/ui";

const children = createRawSnippet(() => ({ render: () => "<span>Save</span>" }));
const markup = (props = {}) => render(StatefulButton, { props: { children, ...props } }).body;

describe("StatefulButton controlled presentation", () => {
  test("keeps ordinary button content and attributes while idle", () => {
    const html = markup({
      type: "submit",
      name: "intent",
      value: "save",
      "aria-label": "Save settings",
    });
    expect(html).toContain('type="submit"');
    expect(html).toContain('name="intent"');
    expect(html).toContain('value="save"');
    expect(html).toContain('aria-label="Save settings"');
    expect(html).toContain("<span>Save</span>");
    expect(html).not.toMatch(/\sdisabled(?:\s|=|>)/);
    expect(html).not.toContain('aria-busy="true"');
  });

  test("disables pending actions and announces the default pending label", () => {
    const html = markup({ pending: true, "aria-label": "Save settings" });
    expect(html).toMatch(/\sdisabled(?:\s|=|>)/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Working"');
    expect(html).toContain("Working");
    expect(html).not.toContain("<span>Save</span>");
    expect(html).toContain("motion-reduce:animate-none");
  });

  test("keeps icon-only pending labels visually hidden", () => {
    const html = markup({
      pending: true,
      pendingLabel: "Sending",
      iconOnly: true,
      size: "icon",
      "aria-label": "Send",
    });
    expect(html).toContain('aria-label="Sending"');
    expect(html).toContain('class="sr-only">Sending</span>');
    expect(html).toContain("size-8");
    expect(html).not.toContain("<span>Save</span>");
  });

  test("respects explicit disabled state after pending ends", () => {
    expect(markup({ pending: false, disabled: true })).toMatch(/\sdisabled(?:\s|=|>)/);
    expect(markup({ pending: false })).not.toMatch(/\sdisabled(?:\s|=|>)/);
  });

  test("preserves link semantics and removes the destination while pending", () => {
    expect(markup({ href: "/settings" })).toContain('href="/settings"');
    const html = markup({ href: "/settings", pending: true });
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('href="/settings"');
  });
});
