import { test, expect } from "vitest";
import { build as esbuild } from "esbuild";
test("managed MOV export is authenticated, byte exact and offered as an attachment", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-mov-test-"));
  const bytes = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 113, 116, 32, 32]);
  const app = await installedMedia(root, true);
  await app.command({
    kind: "create_conversation",
    workbenchId: "media-example",
    provider: "synthetic",
  });
  const content = (await app.snapshot()).operator.artifacts[0]!.content;
  if (content.kind !== "asset") throw Error("Expected registered media");
  const { key } = content.asset;
  const server = await serveDesktop(app, resolve("apps/desktop/build"));
  try {
    expect((await fetch(server.origin + "/api/assets/" + key)).status).toBe(401);
    const boot = await fetch(server.url, { redirect: "manual" });
    const cookie = boot.headers.get("set-cookie")!.split(";")[0]!;
    const response = await fetch(server.origin + "/api/assets/" + key, { headers: { cookie } });
    expect(response.headers.get("content-type")).toBe("video/quicktime");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${key}.mov"`);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  } finally {
    await server.close();
  }
});
test("managed JSON is authenticated, byte exact and always offered as a download", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-json-download-test-"));
  const app = await installedMedia(root, false, true);
  await app.command({
    kind: "create_conversation",
    workbenchId: "media-example",
    provider: "synthetic",
  });
  const content = (await app.snapshot()).operator.artifacts[0]!.content;
  if (content.kind !== "asset") throw Error("Expected managed JSON");
  const server = await serveDesktop(app, resolve("apps/desktop/build"));
  try {
    const boot = await fetch(server.url, { redirect: "manual" });
    const cookie = boot.headers.get("set-cookie")!.split(";")[0]!;
    const response = await fetch(server.origin + "/api/assets/" + content.asset.key, {
      headers: { cookie },
    });
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="${content.asset.key}.json"`,
    );
    expect(await response.text()).toBe('{"status":"managed"}');
  } finally {
    await server.close();
  }
});
import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTestDesktopApplication as createDesktopApplication } from "./test-project.fixture.js";
import { serveDesktop } from "./server.js";
import { assetLibraryConformance } from "@drawloom/host/conformance";
import { createDesktopAssets } from "./assets.js";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createInstallationStore } from "./plugin-installations.js";
import { text as readText } from "node:stream/consumers";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
/** Bun exposed `child.exited`; Node signals completion with an "exit" event. */
const exitCodeOf = async (child: ChildProcess): Promise<number> =>
  (await once(child, "exit"))[0] as number;
test("cold native discovery may exceed the HTTP idle default without blocking state reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-slow-discovery-"));
  const app = await createDesktopApplication(root);
  const id = (await app.snapshot()).selectedId;
  const server = await serveDesktop(
    {
      ...app,
      async discover(...args) {
        await new Promise((resolve) => setTimeout(resolve, 21_000));
        return app.discover(...args);
      },
    },
    resolve("apps/desktop/build"),
  );
  try {
    const boot = await fetch(server.url, { redirect: "manual" });
    const headers = { cookie: boot.headers.get("set-cookie")!.split(";")[0]! };
    const discovery = fetch(`${server.origin}/api/discovery?conversationId=${id}`, { headers });
    expect((await fetch(server.origin + "/api/state", { headers })).status).toBe(200);
    const discovered = await discovery;
    expect(discovered.status, await discovered.clone().text()).toBe(200);
  } finally {
    await server.close();
  }
}, 30_000);
async function installedMedia(root: string, mov = false, json = false) {
  const pkg = join(root, "media");
  await mkdir(join(pkg, "org.drawloom"), { recursive: true });
  // Built the way a package producer builds a backend. The previous separate
  // process existed only to dodge a Bun 1.2 resolver-cache bug on repeated
  // in-process builds of this graph; esbuild has no such constraint.
  await esbuild({
    entryPoints: [resolve(import.meta.dirname, "media-backend.fixture.ts")],
    outfile: join(pkg, "org.drawloom", "backend.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
  });
  await writeFile(
    join(pkg, "plugin.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "media-example",
      extensions: {
        "org.drawloom": {
          version: 1,
          backend: { entrypoint: "./org.drawloom/backend.mjs" },
          requires: [{ kind: "capability", id: "host" }],
        },
      },
    }),
  );
  const installed = await createInstallationStore(createNodeJsonStore(join(root, "state")));
  const id = await installed.add(pkg);
  await installed.configure(id, {
    enabled: true,
    trustedBackend: true,
    servers: [],
    configuration: { mov, json },
  });
  return createDesktopApplication(root);
}
test("trusted media package shares managed assets without a private dependency or synthetic fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-extension-test-"));
  const app = await installedMedia(root);
  try {
    const before = await app.snapshot();
    await app.command({
      kind: "create_conversation",
      workbenchId: "media-example",
      provider: "synthetic",
    });
    const media = await app.snapshot();
    const artifact = media.operator.artifacts[0]!;
    expect(artifact.operationId).toBe("media-operation");
    if (artifact.content.kind !== "asset") throw Error("Expected media");
    expect(await app.authorizedAsset(artifact.content.asset.key)).toEqual(artifact.content.asset);
    expect(artifact.content.asset.size).toBe(17 * 1024 * 1024);
    expect((await app.assets.read(artifact.content.asset.key)).length).toBe(17 * 1024 * 1024);
    await expect(
      app.command({
        kind: "send",
        conversationId: media.selectedId,
        text: "Do not route this into Text studio",
        attachmentKeys: [],
        contextArtifactIds: [],
      }),
    ).rejects.toThrow("Synthetic mode is available only");
    const imported = await app.importAsset(
      new Uint8Array([1, 2, 3]),
      "video/mp4",
      "Independent import",
    );
    const afterImport = await app.snapshot();
    expect(
      afterImport.operator.artifacts.some(
        (a) =>
          a.operationId?.startsWith("import-") &&
          a.content.kind === "asset" &&
          a.content.asset.key === imported.key,
      ),
    ).toBe(true);
    expect(afterImport.operator.grants).toEqual(media.operator.grants);
    expect(afterImport.operator.candidates.at(-1)?.status).toBe("draft");
    await app.command({ kind: "select_conversation", conversationId: before.selectedId });
    expect((await app.snapshot()).operator.artifacts).toEqual([]);
  } finally {
    await app.close();
  }
});
test("managed desktop assets run shared library conformance", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-assets-test-"));
  await assetLibraryConformance(async () => createDesktopAssets(root));
});
test("trusted large image registration does not raise the native image-input bound", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-image-limit-test-"));
  const assets = createDesktopAssets(root);
  const image = await assets.put(new Uint8Array(17 * 1024 * 1024), "image/png");
  await expect(assets.imageInput(image)).rejects.toThrow("Unsupported or oversized file");
});
test("legacy JSON/base64 upload transport is refused without registering assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-upload-limit-test-"));
  const app = await createDesktopApplication(root);
  const server = await serveDesktop(app, resolve("apps/desktop/build"));
  try {
    const boot = await fetch(server.url, { redirect: "manual" });
    const cookie = boot.headers.get("set-cookie")!.split(";")[0]!;
    const response = await fetch(server.origin + "/api/import", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json", origin: server.origin },
      body: JSON.stringify({
        name: "too-large.mp4",
        mediaType: "video/mp4",
        base64: Buffer.alloc(17 * 1024 * 1024).toString("base64"),
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Use streamed file upload" });
    expect((await app.snapshot()).operator.artifacts).toEqual([]);
  } finally {
    await server.close();
  }
});
test("authenticated UI channel, durable revisions and no duplicate transcript", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-host-test-"));
  const app = await createDesktopApplication(root);
  const server = await serveDesktop(app, resolve("apps/desktop/build"));
  try {
    expect((await fetch(server.origin + "/api/state")).status).toBe(401);
    const boot = await fetch(server.url, { redirect: "manual" });
    const cookie = boot.headers.get("set-cookie")!.split(";")[0]!;
    expect(boot.status).toBe(303);
    expect(boot.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    expect((await fetch(server.url, { redirect: "manual" })).status).toBe(401);
    const headers = { cookie, "Content-Type": "application/json", origin: server.origin };
    const before = await app.snapshot();
    const body = JSON.stringify({
      kind: "send",
      conversationId: before.selectedId,
      text: "First revision",
      attachmentKeys: [],
      contextArtifactIds: [],
    });
    expect(
      (
        await fetch(server.origin + "/api/command", {
          method: "POST",
          headers: { ...headers, origin: "https://evil.invalid" },
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(server.origin + "/api/command", { method: "POST", headers, body })).status,
    ).toBe(200);
    for (let n = 0; n < 20 && !(await app.snapshot()).operator.candidates.length; n++)
      await new Promise((r) => setTimeout(r, 5));
    const draft = await app.snapshot();
    const candidate = draft.operator.candidates[0]!;
    await app.command({
      kind: "operator",
      conversationId: before.selectedId,
      workbenchId: "text",
      command: {
        kind: "revise_document",
        candidateId: candidate.id,
        artifactId: candidate.artifactIds[0],
        text: "Second revision",
      },
    });
    const saved = await app.snapshot();
    expect(saved.operator.candidates.length).toBe(2);
    expect(saved.operator.artifacts[0]?.content).toEqual({ kind: "text", text: "First revision" });
    const reopened = await createDesktopApplication(root);
    expect((await reopened.snapshot()).operator.candidates.length).toBe(2);
    expect(await reopened.snapshot()).not.toHaveProperty("messages");
    expect(
      (await reopened.historyPage(before.selectedId)).entries.some(
        (entry) => entry.text === "First revision",
      ),
    ).toBe(true);
    const project = JSON.parse(await readFile(join(root, "state/project.json"), "utf8"));
    expect(project).not.toHaveProperty("messages");
    const html = await fetch(server.origin, { headers: { cookie } });
    expect(html.headers.get("content-security-policy")).toContain("'nonce-");
    expect(await html.text()).toContain("<script nonce=");
    const asset = await app.importAsset(
      new TextEncoder().encode("<script>alert(1)</script>"),
      "text/plain",
      "example.txt",
    );
    const file = await fetch(server.origin + "/api/assets/" + asset.key, { headers: { cookie } });
    expect(file.headers.get("content-security-policy").startsWith("sandbox;")).toBe(true);
    expect(
      (await fetch(server.origin + "/api/assets/..%2Foutside", { headers: { cookie } })).status,
    ).toBe(400);
    await reopened.close();
  } finally {
    await server.close();
  }
});
