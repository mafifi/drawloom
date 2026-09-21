import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDesktopApplication } from "../apps/desktop/host/application.ts";
import { serveDesktop } from "../apps/desktop/host/server.ts";

// Disposable public UI fixture. No user installation, provider connection or download.
const root = await mkdtemp(join(tmpdir(), "drawloom-replacement-ui-"));
await mkdir(join(root, "working"));
const app = await createDesktopApplication(join(root, "data"));
await app.command({ kind: "add_project", directory: join(root, "working") });
await app.command({ kind: "create_conversation", workbenchId: "text", provider: "synthetic" });
const server = await serveDesktop(app, resolve("apps/desktop/build"));
console.log(JSON.stringify({ url: server.url, fixture: "Public synthetic replacement UI" }));
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    if (closing) return;
    closing = true;
    void server
      .close()
      .then(() => rm(root, { recursive: true, force: true }))
      .then(() => process.exit(0));
  });
