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
      contents: compile(await readFile(path, "utf8"), { filename: path, generate: "server" }).js.code,
      loader: "js",
    }));
    build.onLoad({ filter: /\.svelte\.js$/ }, async ({ path }) => ({
      contents: compileModule(await readFile(path, "utf8"), { filename: path, generate: "server" }).js.code,
      loader: "js",
    }));
  },
});

let Attachment;
let Bubble;
let Marker;
let Message;
let Spinner;
let Button;

beforeAll(async () => {
  ({ Attachment, Bubble, Marker, Message, Spinner, Button } = await import("@drawloom/ui"));
});

const children = (text) => createRawSnippet(() => ({ render: () => text }));

describe("conversation primitive public boundary", () => {
  test('semantic body sizes coexist with foreground colours and permit consumer size overrides',()=>{
    const coloured=render(Message.Root,{props:{class:'text-primary',children:children('Text')}}).body;
    expect(coloured).toContain('text-body');
    expect(coloured).toContain('text-primary');
    const resized=render(Message.Root,{props:{class:'text-base',children:children('Text')}}).body;
    expect(resized).toContain('text-base');
    expect(resized).not.toContain('text-body');
    const rounded=render(Bubble.Content,{props:{class:'rounded-lg',children:children('Text')}}).body;
    expect(rounded).toContain('rounded-lg');
    expect(rounded).not.toContain('rounded-bubble');
  });
  test('small primary buttons preserve their foreground alongside semantic sizing',()=>{
    const html=render(Button,{props:{size:'sm',children:children('Save')}}).body;
    expect(html).toContain('text-primary-foreground');
    expect(html).toContain('text-small-control');
  });
  test("exports the complete component namespaces and spinner", () => {
    for (const name of ["Action", "Actions", "Content", "Description", "Group", "Media", "Root", "Title", "Trigger"]) {
      expect(Attachment[name]).toBeTypeOf("function");
    }
    for (const name of ["Content", "Group", "Reactions", "Root"]) expect(Bubble[name]).toBeTypeOf("function");
    for (const name of ["Content", "Icon", "Root"]) expect(Marker[name]).toBeTypeOf("function");
    for (const name of ["Avatar", "Content", "Footer", "Group", "Header", "Root"]) {
      expect(Message[name]).toBeTypeOf("function");
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
    const bubble = render(Bubble.Root, {
      props: { variant: "secondary", align: "end", "data-consumer": "bubble", children: children("Hello") },
    }).body;
    const message = render(Message.Root, {
      props: { align: "end", "data-consumer": "message", children: children("Hello") },
    }).body;
    const marker = render(Marker.Root, {
      props: { variant: "separator", role: "status", "data-consumer": "marker", children: children("Thinking") },
    }).body;

    expect(bubble).toContain('data-variant="secondary"');
    expect(bubble).toContain('data-align="end"');
    expect(bubble).toContain('data-consumer="bubble"');
    expect(message).toContain('data-align="end"');
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
