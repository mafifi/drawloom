import { beforeAll, describe, expect, test } from "bun:test";
import { plugin } from "bun";
import { readFile } from "node:fs/promises";
import { compile, compileModule } from "svelte/compiler";
import { createRawSnippet } from "svelte";
import { render } from "svelte/server";

plugin({
  name: "conversation-server-components",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
      contents: compile(await readFile(path, "utf8"), { filename: path, generate: "server" }).js
        .code,
      loader: "js",
    }));
    build.onLoad({ filter: /\.svelte\.js$/ }, async ({ path }) => ({
      contents: compileModule(await readFile(path, "utf8"), { filename: path, generate: "server" })
        .js.code,
      loader: "js",
    }));
  },
});

let Attachment;
let Marker;
let Spinner;
let Button;
let DownloadProgress;
let Accordion;
let Markdown;
let Confirmation;
let PromptInput;
let ChatMessage;
let SystemMessage;
let PromptSuggestion;
let Sources;

beforeAll(async () => {
  ({
    Attachment,
    Marker,
    Spinner,
    Button,
    DownloadProgress,
    Accordion,
    Markdown,
    Confirmation,
    PromptInput,
    ChatMessage,
    SystemMessage,
    PromptSuggestion,
    Sources,
  } = await import("@drawloom/ui"));
});

const children = (text) => createRawSnippet(() => ({ render: () => text }));

describe("conversation primitive public boundary", () => {
  test("public conversation API has one message composition without legacy aliases", async () => {
    const ui = await import("@drawloom/ui");
    expect(ui.ChatMessage.Root).toBeTypeOf("function");
    expect(ui.Message).toBeUndefined();
    expect(ui.Bubble).toBeUndefined();
  });
  test("message composition exposes speaker and forwards Markdown accessibility attributes", () => {
    const user = render(ChatMessage.Root, {
      props: { speaker: "user", children: children("Question") },
    }).body;
    expect(user).toContain('data-speaker="user"');
    const answer = render(ChatMessage.Root, {
      props: { children: children("Answer") },
    }).body;
    expect(answer).toContain('data-speaker="assistant"');
    const content = render(ChatMessage.Content, {
      props: { markdown: true, content: "**Answer**", "aria-label": "Answer content" },
    }).body;
    expect(content).toContain('aria-label="Answer content"');
    expect(content).toContain("<strong");
  });
  test("Markdown never embeds remote media or enables raw HTML", () => {
    const html = render(Markdown, {
      props: {
        text: '![tracking](https://example.org/pixel.png)\n\n<iframe src="https://example.org"></iframe>\n\n[unresolved](/private/file.wav)',
      },
    }).body;
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain('href="/private/');
  });
  test("source links preserve the consumer evidence identity for keyboard navigation", () => {
    const html = render(Sources.Item, {
      props: {
        href: "https://example.org/evidence",
        "data-source": "claim-source",
        title: "Retained evidence",
      },
    }).body;
    expect(html).toContain('data-source="claim-source"');
    expect(html).toContain('href="https://example.org/evidence"');
    expect(html).toContain("Retained evidence");
  });
  test("AI presentation forwards consumer content and suggestion eligibility", () => {
    expect(PromptInput?.Root).toBeTypeOf("function");
    expect(ChatMessage?.Root).toBeTypeOf("function");
    const message = render(ChatMessage.Root, {
      props: { "aria-label": "Saved answer", children: children("Evidence available") },
    }).body;
    expect(message).toContain('aria-label="Saved answer"');
    expect(message).toContain("Evidence available");
    expect(
      render(SystemMessage, {
        props: { variant: "warning", role: "status", children: children("Connection lost") },
      }).body,
    ).toContain("Connection lost");
    const suggestion = render(PromptSuggestion, {
      props: { disabled: true, children: children("Inspect sources") },
    }).body;
    expect(suggestion).toContain("disabled");
    expect(suggestion).toContain("Inspect sources");
  });
  test("confirmation preserves a long consumer question and hides pre-approval input states", () => {
    expect(Confirmation?.Root).toBeTypeOf("function");
    const props = {
      approval: { id: "native-request" },
      state: "approval-requested",
      children: children("Review this long tool request"),
      "aria-label": "Native approval",
    };
    const html = render(Confirmation.Root, { props }).body;
    expect(html).toContain("Review this long tool request");
    expect(html).toContain('aria-label="Native approval"');
    expect(
      render(Confirmation.Root, { props: { ...props, state: "input-streaming" } }).body,
    ).not.toContain("Review this long tool request");
  });
  test("Markdown renders emphasis and lists while rejecting executable links and raw HTML", () => {
    const html = render(Markdown, {
      props: {
        text: "Created **draft**.\n\n- One [recording](/work/audio.wav)\n- `code`\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\n[source](https://example.com)",
        resolveFile: (url) => (url === "/work/audio.wav" ? "/api/files?path=audio.wav" : undefined),
      },
    }).body;
    expect(html.replace(/<!--[\s\S]*?-->/g, "")).toContain("<strong>draft</strong>");
    expect(html).toMatch(/<ul(?:\s|>)/);
    expect(html).toContain("/api/files?path=audio.wav");
    expect(html).toContain("https://example.com");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
  });
  test("exports the complete accordion with consumer-owned expansion and attributes", () => {
    expect(Accordion).toBeDefined();
    for (const part of ["Root", "Item", "Trigger", "Content"])
      expect(Accordion[part]).toBeDefined();
    const html = render(Accordion.Root, {
      props: {
        type: "multiple",
        value: ["notes"],
        "aria-label": "Document notes",
        children: children("Consumer content"),
      },
    }).body;
    expect(html).toContain('data-slot="accordion"');
    expect(html).toContain('aria-label="Document notes"');
    expect(html).toContain("Consumer content");
  });
  test("download progress exposes measured current-file bytes and bounded accessible progress", () => {
    const html = render(DownloadProgress, {
      props: { received: 524288, total: 1048576, label: "Weights file" },
    }).body;
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('aria-label="Weights file"');
    expect(html).toContain("0.5 / 1.0 MiB");
    expect(render(DownloadProgress, { props: { received: 200, total: 100 } }).body).toContain(
      'aria-valuenow="100"',
    );
    expect(render(DownloadProgress, { props: { received: 0, total: 0 } }).body).not.toContain(
      "aria-valuenow=",
    );
  });
  test("small primary buttons preserve their foreground alongside semantic sizing", () => {
    const html = render(Button, { props: { size: "sm", children: children("Save") } }).body;
    expect(html).toContain("text-primary-foreground");
    expect(html).toContain("text-small-control");
  });
  test("exports the complete component namespaces and spinner", () => {
    for (const name of [
      "Action",
      "Actions",
      "Content",
      "Description",
      "Group",
      "Media",
      "Root",
      "Title",
      "Trigger",
    ]) {
      expect(Attachment[name]).toBeTypeOf("function");
    }
    for (const name of ["Content", "Icon", "Root"]) expect(Marker[name]).toBeTypeOf("function");
    for (const name of ["Content", "Actions", "Root"]) {
      expect(ChatMessage[name]).toBeTypeOf("function");
    }
    expect(Marker.markerVariants).toBeTypeOf("function");
    expect(Spinner).toBeTypeOf("function");
  });

  test("forwards attachment state, orientation and consumer attributes", () => {
    const html = render(Attachment.Root, {
      props: {
        state: "uploading",
        size: "sm",
        orientation: "vertical",
        title: "Upload in progress",
        "data-consumer": "attachment",
        children: children("report.pdf"),
      },
    }).body;

    expect(html).toContain('data-state="uploading"');
    expect(html).toContain('data-size="sm"');
    expect(html).toContain('data-orientation="vertical"');
    expect(html).toContain('title="Upload in progress"');
    expect(html).toContain('data-consumer="attachment"');
    expect(html).toContain("report.pdf");
  });

  test("forwards conversation presentation props without owning message content", () => {
    const message = render(ChatMessage.Root, {
      props: { speaker: "user", "data-consumer": "message", children: children("Hello") },
    }).body;
    const marker = render(Marker.Root, {
      props: {
        variant: "separator",
        role: "status",
        "data-consumer": "marker",
        children: children("Thinking"),
      },
    }).body;

    expect(message).toContain('data-speaker="user"');
    expect(message).toContain('data-consumer="message"');
    expect(marker).toContain('data-variant="separator"');
    expect(marker).toContain('role="status"');
    expect(marker).toContain('data-consumer="marker"');
  });

  test("forwards spinner svg attributes through the public component", () => {
    const html = render(Spinner, {
      props: { title: "Loading", "data-consumer": "spinner" },
    }).body;

    expect(html).toContain('title="Loading"');
    expect(html).toContain('data-consumer="spinner"');
  });
});
