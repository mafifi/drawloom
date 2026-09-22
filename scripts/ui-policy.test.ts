import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkUiSource,
  checkSemanticMappings,
  isMaintainedUiSource,
  scanUiPolicy,
} from "./ui-policy.ts";

describe("shared UI boundary", () => {
  test("shared controls map static dimensions to the scale too", () => {
    expect(
      checkUiSource(
        "packages/ui/ui/src/components/example.svelte",
        '<div class="rounded-[12px] min-h-[44px]"></div>',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      checkUiSource(
        "packages/ui/ui/src/components/example.svelte",
        '<div class="rounded-xl min-h-11"></div>',
      ),
    ).toEqual([]);
  });
  test("every exposed semantic colour has explicit light and dark mappings", () => {
    const styles = "@theme inline { --color-background: var(--background); }";
    expect(checkSemanticMappings(":root { --background: var(--dl-white); }", styles)).toHaveLength(
      1,
    );
    expect(
      checkSemanticMappings(
        ":root { --background: var(--dl-white); } @media (prefers-color-scheme: dark) { :root { --background: var(--dl-black); } }",
        styles,
      ),
    ).toEqual([]);
  });
  test("component colour opacity belongs to semantic state mappings", () => {
    expect(
      checkUiSource("apps/demo/src/View.svelte", '<div class="from-primary/80 to-muted/50"></div>')
        .length,
    ).toBeGreaterThan(0);
    expect(
      checkUiSource(
        "packages/ui/ui/src/components/example.svelte",
        '<div class="bg-primary/80 ring-ring/50"></div>',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      checkUiSource(
        "packages/ui/ui/src/components/example.svelte",
        '<div class="bg-control-background opacity-50"></div>',
      ),
    ).toEqual([]);
  });
  test("retired settings compositions cannot reintroduce local layout owners", () => {
    for (const name of [
      "settings-section",
      "workbench-setting-row",
      "workbench-setting-controls",
    ]) {
      expect(
        checkUiSource("apps/demo/src/View.svelte", `<section class="${name}">Settings</section>`),
      ).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "theme-token" })]));
    }
    expect(
      checkUiSource(
        "apps/demo/src/View.svelte",
        '<section class="settings-group"><div class="settings-row">Settings</div></section>',
      ),
    ).toEqual([]);
  });
  test("derived colours belong to semantics even when expressions reference tokens", () => {
    for (const source of [
      '<p class="bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)]">Text</p>',
      "<style>p { color: oklch(from var(--primary) 0.3 c h); }</style>",
      '<script lang="ts">const variants = { hover: "hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)]" };</script><p class={variants.hover}>Text</p>',
    ]) {
      expect(checkUiSource("packages/ui/ui/src/Example.svelte", source)).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "theme-token" })]),
      );
    }
    expect(
      checkUiSource(
        "packages/ui/ui/src/theme/semantic.css",
        ":root { --secondary-hover: color-mix(in oklch, var(--secondary), var(--foreground) 5%); }",
      ),
    ).toEqual([]);
  });
  test("theme guidance rejects local raw colours and arbitrary typography without scanning content", () => {
    for (const source of [
      '<p class="bg-[#fff]">Hi</p>',
      '<p class="hover:text-blue-600">Hi</p>',
      '<p style="color: rgb(1 2 3)">Hi</p>',
      '<p class="text-[15px]">Hi</p>',
      "<style>p { font-size: 15px; }</style>",
      "<style>p { color: #fff; }</style>",
    ]) {
      expect(checkUiSource("apps/demo/src/View.svelte", source)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "theme-token",
            message: expect.stringContaining("semantic"),
          }),
        ]),
      );
    }
    expect(
      checkUiSource(
        "apps/demo/src/View.svelte",
        '<p class="text-body bg-background p-4" style="color:var(--foreground)">Example #fff</p>',
      ),
    ).toEqual([]);
    expect(
      checkUiSource(
        "apps/demo/src/View.svelte",
        '<script>const content="#fff";</script><p>{content}</p><!-- color: red -->',
      ),
    ).toEqual([]);
  });
  test("CSS is checked; only primitive definitions may hold raw palette values", () => {
    expect(isMaintainedUiSource("apps/demo/src/app.css")).toBe(true);
    expect(checkUiSource("apps/demo/src/app.css", ".panel { color: #fff; }")[0]).toMatchObject({
      kind: "theme-token",
      line: 1,
    });
    expect(
      checkUiSource("packages/ui/ui/src/theme/primitives.css", ":root { --dl-white: #fff; }"),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "theme-token" })]));
    expect(
      checkUiSource(
        "packages/ui/ui/src/theme/primitives.css",
        ":root { --dl-white: oklch(1 0 0); }",
      ),
    ).toEqual([]);
    expect(
      checkUiSource(
        "packages/ui/ui/src/theme/semantic.css",
        ":root { --background: var(--dl-white); }",
      ),
    ).toEqual([]);
    expect(
      checkUiSource("apps/demo/src/app.css", ".panel { color: var(--dl-white); }")[0]?.kind,
    ).toBe("theme-token");
    expect(
      checkUiSource("apps/demo/src/app.css", ".panel {color:var(--foreground);padding:17px;}"),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "theme-token" })]));
    expect(checkUiSource("publishing/site/src/app.css", ".panel {color:#fff;}")).toEqual([]);
  });
  test("Views cannot choose arbitrary layout measurements", () => {
    for (const source of [
      '<div class="gap-[17px]"></div>',
      '<div style="padding: 17px"></div>',
      "<style>.panel { margin: 1.4rem; }</style>",
    ]) {
      expect(checkUiSource("apps/demo/src/View.svelte", source)).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "theme-token" })]),
      );
    }
    expect(
      checkUiSource(
        "apps/demo/src/View.svelte",
        '<div class="gap-stack w-full" style="aspect-ratio:16/9"></div>',
      ),
    ).toEqual([]);
  });
  test("facts use the shared composition rather than competing local grids", () => {
    for (const name of ["consent-facts", "model-facts"]) {
      expect(
        checkUiSource("apps/demo/src/View.svelte", `<dl class="${name}"></dl>`)[0]?.message,
      ).toContain("facts-list");
    }
    expect(checkUiSource("apps/demo/src/View.svelte", '<dl class="facts-list"></dl>')).toEqual([]);
  });
  test("conversation primitives cannot be recreated as native data-slot markup in consumers", () => {
    for (const [slot, component] of [
      ["attachment", "Attachment"],
      ["message", "ChatMessage"],
      ["bubble", "ChatMessage"],
      ["marker", "Marker"],
    ]) {
      const issues = checkUiSource(
        "apps/example/src/View.svelte",
        `<div data-slot="${slot}">Content</div>`,
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]?.message).toContain(component!);
    }
    expect(
      checkUiSource(
        "apps/example/src/View.svelte",
        "<article>Ordinary editorial content</article>",
      ),
    ).toEqual([]);
    expect(
      checkUiSource(
        "packages/ui/ui/src/components/prompt-kit/message/message.svelte",
        '<div data-slot="bubble">Content</div>',
      ),
    ).toEqual([]);
    expect(
      checkUiSource(
        "apps/example/src/View.svelte",
        '<script>import { ChatMessage } from "@drawloom/ui";</script><ChatMessage.Root>Text</ChatMessage.Root>',
      ),
    ).toEqual([]);
  });
  test("scans maintained source and ignores generated and journal trees", async () => {
    const root = await mkdtemp(join(tmpdir(), "drawloom-ui-policy-"));
    try {
      for (const path of ["apps/demo/src", "apps/demo/build", "publishing/site/src"])
        await mkdir(join(root, path), { recursive: true });
      await writeFile(join(root, "apps/demo/src/View.svelte"), "<button>Send</button>");
      await writeFile(join(root, "apps/demo/src/app.css"), ".panel { color: #fff; }");
      await writeFile(join(root, "apps/demo/build/View.svelte"), "<button>Generated</button>");
      await writeFile(join(root, "publishing/site/src/View.svelte"), "<button>Journal</button>");
      const result = await scanUiPolicy(root);
      expect(result.files).toBe(2);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "apps/demo/src/View.svelte" }),
          expect.objectContaining({ path: "apps/demo/src/app.css", kind: "theme-token" }),
        ]),
      );
      expect(result.issues).toHaveLength(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  test.each([
    "<button>Send</button>",
    '<input type="file" />',
    '<select><option>One</option><optgroup label="More" /></select>',
    "<textarea />",
    "<label>Name</label>",
    "<details><summary>More</summary></details>",
    "<hr />",
    "<dialog>Confirm</dialog>",
  ])("rejects native controls: %s", (source) => {
    const issues = checkUiSource("apps/example/src/View.svelte", source);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toContain("@drawloom/ui");
    expect(issues[0]?.line).toBe(1);
  });

  test.each(["button", "checkbox", "combobox", "tab", "switch", "dialog"])(
    "rejects a native element recreating role=%s",
    (role) => {
      expect(
        checkUiSource("packages/example/view/src/View.svelte", `<div role="${role}">Content</div>`),
      ).toHaveLength(1);
    },
  );

  test("finds nested controls but not strings, comments or component props", () => {
    const source = `<script lang="ts">
      import { onMount } from 'svelte';
      import { Button } from '@drawloom/ui';
      const example: string = '<button>Example</button>';
    </script>
    <!-- <button>Example</button> -->
    {#if example}<section><button>Real control</button></section>{/if}
    <Button role="button">Shared</Button>`;
    const issues = checkUiSource("apps/example/src/View.svelte", source);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.line).toBe(7);
  });

  test("allows semantic content, ordinary links and native media", () => {
    expect(
      checkUiSource(
        "apps/example/src/View.svelte",
        `
      <main><nav><a href="/settings">Settings</a></nav>
      <h1>Content</h1><p>Text</p><ul><li>Item</li></ul>
      <table><tbody><tr><td>Cell</td></tr></tbody></table>
      <img src="/example.png" alt="Example" /><audio controls />
      <video controls /><iframe title="Document" sandbox="" />
      <div role="status">Ready</div></main>`,
      ),
    ).toEqual([]);
  });

  test("fails closed when Svelte cannot be parsed", () => {
    const issues = checkUiSource("apps/example/src/View.svelte", "{#if open}<p>Oops");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe("parse-error");
  });

  test("does not honour a blanket suppression comment", () => {
    expect(
      checkUiSource(
        "apps/example/src/View.svelte",
        "<!-- ui-policy-ignore --><button>Send</button>",
      ),
    ).toHaveLength(1);
  });

  test.each([
    ["apps/example/src/View.svelte", `<script>import { Button } from 'bits-ui';</script>`],
    [
      "apps/example/src/View.svelte",
      `<script module>export { Button } from 'shadcn-svelte';</script>`,
    ],
    ["apps/example/src/view.ts", `export { Button } from '$lib/components/ui/button';`],
    ["packages/example/view/src/index.js", `const ui = import('bits-ui/button');`],
    ["apps/example/src/view.ts", `import Button from './components/ui/button/index.js';`],
  ])("rejects direct primitive imports in %s", (path, source) => {
    expect(checkUiSource(path, source)).toEqual([
      expect.objectContaining({
        kind: "import-boundary",
        message: expect.stringContaining("@drawloom/ui"),
      }),
    ]);
  });

  test("permits public UI and standard Svelte imports", () => {
    expect(
      checkUiSource(
        "apps/example/src/view.ts",
        `
      import { tick } from 'svelte';
      import { writable } from 'svelte/store';
      import { Button } from '@drawloom/ui';
      import '@drawloom/ui/styles.css';
    `,
      ),
    ).toEqual([]);
  });

  test.each(["aria-busy={vm.busy}", "pending={pending}", "isLoading", "{pending}"])(
    "requires StatefulButton for explicit loading prop %s",
    (attribute) => {
      const issues = checkUiSource(
        "apps/example/src/View.svelte",
        `<script>import { Button } from '@drawloom/ui';</script>\n<Button ${attribute}>Save</Button>`,
      );
      expect(issues).toEqual([
        expect.objectContaining({
          kind: "stateful-control",
          line: 2,
          message: expect.stringContaining("StatefulButton"),
        }),
      ]);
      expect(issues[0]?.message).toContain("pending");
    },
  );

  test.each([
    ["import { Button as Action } from '@drawloom/ui';", "Action"],
    ["import * as UI from '@drawloom/ui';", "UI.Button"],
  ])("recognises shared Button aliases: %s", (declaration, component) => {
    expect(
      checkUiSource(
        "apps/example/src/View.svelte",
        `<script>${declaration}</script><${component} aria-busy={busy}>Save</${component}>`,
      ),
    ).toEqual([expect.objectContaining({ kind: "stateful-control" })]);
  });

  test("allows eligibility and concurrent-work disabling without inventing loading feedback", () => {
    expect(
      checkUiSource(
        "apps/example/src/View.svelte",
        `<script>
      import { Button, StatefulButton, Select, SidebarMenuButton } from '@drawloom/ui';
    </script>
    <Button disabled>Unavailable</Button>
    <Button disabled={!vm.canSave}>Save</Button>
    <Button disabled={vm.busy || isLoading || pending}>Cancel</Button>
    <Button onclick={async () => vm.execute()}>Reviewed separately</Button>
    <StatefulButton pending={vm.busy}>Save</StatefulButton>
    <Select.Trigger disabled={vm.busy}>Choose</Select.Trigger>
    <SidebarMenuButton aria-busy={vm.busy}>Navigation</SidebarMenuButton>`,
      ),
    ).toEqual([]);
  });

  test("does not treat unrelated components, strings or comments as shared Button usage", () => {
    expect(
      checkUiSource(
        "apps/example/src/View.svelte",
        `<script>
      import { Button as SharedButton } from '@drawloom/ui';
      import Button from './Button.svelte';
      const example = '<SharedButton pending />';
    </script>
    <!-- <SharedButton pending /> -->
    <Button pending />
    <SharedButton title="pending isLoading aria-busy">Save</SharedButton>`,
      ),
    ).toEqual([]);
  });

  test.each([
    "../../../../packages/ui/ui/src/components/button/button.svelte",
    "../../../../packages/ui/ui/dist/components/button/button.svelte",
    "../../../../packages/ui/ui/src/../dist/index.js",
    fileURLToPath(
      new URL("../packages/ui/ui/src/components/button/button.svelte", import.meta.url),
    ),
    fileURLToPath(new URL("../packages/ui/ui/dist/index.js", import.meta.url)),
    "@drawloom/ui/input",
    "@drawloom/ui/src/components/button/button.svelte",
    "@drawloom/ui/dist/index.js",
  ])("rejects shared UI internal import %s", (specifier) => {
    expect(
      checkUiSource(
        "apps/desktop/src/lib/View.svelte",
        `<script>import Button from ${JSON.stringify(specifier)};</script>`,
      ),
    ).toEqual([expect.objectContaining({ kind: "import-boundary" })]);
  });

  test("resolves internal imports relative to the importing module", () => {
    expect(
      checkUiSource(
        "apps/desktop/src/view.ts",
        `export { Button } from '../../../packages/ui/ui/dist/index.js';`,
      ),
    ).toHaveLength(1);
    expect(
      checkUiSource(
        "apps/desktop/src/lib/View.svelte",
        `<script>
      import Example from '../../../../packages/ui/ui-copy/src/Example.svelte';
      import Local from './packages/ui/ui/src/Example.svelte';
    </script>`,
      ),
    ).toEqual([]);
  });

  test("preserves imports within the shared UI source implementation", () => {
    expect(
      checkUiSource(
        "packages/ui/ui/src/index.ts",
        `export { default as Button } from './components/button/button.svelte';`,
      ),
    ).toEqual([]);
  });

  test("only exempts exact shared UI source path", () => {
    expect(checkUiSource("packages/ui/ui/src/button.svelte", "<button />")).toEqual([]);
    expect(checkUiSource("packages/ui/ui-copy/src/button.svelte", "<button />")).toHaveLength(1);
    expect(checkUiSource("packages/ui/ui/examples/button.svelte", "<button />")).toHaveLength(1);
  });

  test.each([
    "publishing/site/src/Example.svelte",
    "spikes/example/Example.svelte",
    "apps/example/node_modules/ui/Button.svelte",
    "apps/example/.svelte-kit/generated/View.svelte",
    "apps/example/build/View.svelte",
    "packages/example/view/dist/View.svelte",
    "packages/example/view/.generated/View.svelte",
  ])("excludes unmaintained source %s", (path) => {
    expect(isMaintainedUiSource(path)).toBe(false);
    expect(checkUiSource(path, "<button />")).toEqual([]);
  });
});

describe("views do not own service access or validation", () => {
  const view = (body: string) => `<script lang="ts">\n${body}\n</script>\n<p>ok</p>\n`;
  const kinds = (source: string) =>
    checkUiSource("apps/desktop/src/lib/Probe.svelte", source).map((issue) => issue.kind);

  test("a direct request from a view is a violation", () => {
    expect(kinds(view("async function f(){ await fetch('/api/models'); }"))).toContain(
      "view-responsibility",
    );
  });

  test("other service constructors are caught too", () => {
    for (const service of ["new EventSource('/x')", "new WebSocket('/x')"])
      expect(kinds(view(`const s = ${service};`)), service).toContain("view-responsibility");
  });

  test("validating a response against an imported schema is a violation", () => {
    expect(
      kinds(
        view(
          "import { AgentModelSchema } from '@drawloom/agent';\nconst v = AgentModelSchema.parse({});",
        ),
      ),
    ).toContain("view-responsibility");
  });

  test("importing zod into a view is a violation on its own", () => {
    expect(kinds(view("import { z } from 'zod';"))).toContain("view-responsibility");
  });

  test("ordinary parsing is not a violation", () => {
    // The rule is targeted for a reason: a check that fires on correct code
    // gets suppressed, and then it protects nothing.
    const source = view(
      "const a = JSON.parse('{}');\nconst b = parseInt('1', 10);\nconst c = Date.parse('2026-01-01');",
    );
    expect(kinds(source)).not.toContain("view-responsibility");
  });

  test("a view model is not a view, and may do both", () => {
    const issues = checkUiSource(
      "apps/desktop/src/lib/example-view-model.svelte.ts",
      "import { z } from 'zod';\nexport async function load(){ return z.object({}).parse(await (await fetch('/api/x')).json()); }",
    );
    expect(issues.map((issue) => issue.kind)).not.toContain("view-responsibility");
  });
});
