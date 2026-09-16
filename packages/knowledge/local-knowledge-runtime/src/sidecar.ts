import { z } from "zod";
import { createStdioTransport, codexCommand } from "@drawloom/node-host";
import { serveLocalKnowledgeWorker } from "./worker-server.js";

const launch = z
  .strictObject({ root: z.string().min(1), workingDirectory: z.string().min(1) })
  .parse(JSON.parse(process.argv[2] ?? "null"));
await serveLocalKnowledgeWorker({
  ...launch,
  connectCodex: async () =>
    createStdioTransport({
      ...codexCommand(),
      cwd: launch.workingDirectory,
      maxMessageBytes: 1024 * 1024,
      requestTimeoutMs: 300_000,
    }),
});
