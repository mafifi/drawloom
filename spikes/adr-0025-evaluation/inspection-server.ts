import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  inspectionDocumentSchema,
  inspectionFeedbackTool,
  inspectionOpenResultSchema,
  inspectionOpeningTool,
  inspectionResourceUri,
  inspectionSaveInputSchema,
  inspectionSaveResultSchema,
  persistedFeedbackDocumentSchema,
  type InspectionDocument,
  type InspectionSaveInput,
  type PersistedFeedback,
} from "./inspection-contract.ts";

type Store = {
  load(): Promise<PersistedFeedback[]>;
  save(input: InspectionSaveInput): Promise<PersistedFeedback>;
};

async function boundedRead(path: string, maxBytes: number): Promise<string> {
  const size = (await stat(path)).size;
  if (size > maxBytes) throw Error(`Installed inspection file exceeds ${maxBytes} bytes`);
  return readFile(path, "utf8");
}

function feedbackStore(path: string, resultIds: ReadonlySet<string>): Store {
  let queue: Promise<unknown> = Promise.resolve();
  const load = async (): Promise<PersistedFeedback[]> => {
    try {
      const feedback = persistedFeedbackDocumentSchema.parse(JSON.parse(await boundedRead(path, 1024 * 1024))).feedback;
      if (feedback.some(entry => !resultIds.has(entry.resultId))) throw Error("Persisted feedback targets a result outside this installed inspection document");
      return feedback;
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  };
  return {
    load,
    save(input) {
      const operation = queue.then(async () => {
        const value = inspectionSaveInputSchema.parse(input);
        if (!resultIds.has(value.resultId)) throw Error("Feedback result identity is not present in this installed inspection document");
        const existing = await load();
        const feedback = persistedFeedbackDocumentSchema.shape.feedback.element.parse({
          ...value,
          sequence: (existing.at(-1)?.sequence ?? 0) + 1,
          savedAt: new Date().toISOString(),
        });
        const document = persistedFeedbackDocumentSchema.parse({ schemaVersion: 1, feedback: [...existing, feedback] });
        const serialized = `${JSON.stringify(document, null, 2)}\n`;
        if (Buffer.byteLength(serialized) > 1024 * 1024) throw Error("Feedback file has reached its 1 MiB proof bound");
        const temporary = `${path}.tmp`;
        await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
        await rename(temporary, path);
        return feedback;
      });
      queue = operation.catch(() => undefined);
      return operation;
    },
  };
}

export async function createInspectionServer(options: { packageRoot: string; dataRoot: string }): Promise<McpServer> {
  const packageRoot = resolve(options.packageRoot);
  const dataRoot = resolve(options.dataRoot);
  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  const document: InspectionDocument = inspectionDocumentSchema.parse(JSON.parse(await boundedRead(resolve(packageRoot, "inspection.json"), 4 * 1024 * 1024)));
  const html = await boundedRead(resolve(packageRoot, "app.html"), 2 * 1024 * 1024);
  const resultIds = new Set(document.results.map(result => result.evaluation.id));
  if (resultIds.size !== document.results.length) throw Error("Inspection result identities must be unique");
  const store = feedbackStore(resolve(dataRoot, "feedback.json"), resultIds);
  const server = new McpServer({ name: "drawloom-knowledge-inspection", version: "1.0.0" });

  registerAppResource(server, "Evaluation findings", inspectionResourceUri, {}, async () => ({
    contents: [{ uri: inspectionResourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
  }));
  registerAppTool(server, inspectionOpeningTool, {
    title: "Open evaluation findings",
    description: "Open the installed, read-only knowledge evaluation findings.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: inspectionResourceUri } },
  }, async () => ({
    content: [],
    structuredContent: inspectionOpenResultSchema.parse({ document, feedback: await store.load() }),
  }));
  registerAppTool(server, inspectionFeedbackTool, {
    title: "Save advisory evaluation feedback",
    description: "Save attributed advisory feedback for one exact installed result. This does not accept work or change scores.",
    inputSchema: inspectionSaveInputSchema.shape,
    _meta: { ui: { visibility: ["app"] } },
  }, async input => {
    try {
      const feedback = await store.save(input);
      return { content: [], structuredContent: inspectionSaveResultSchema.parse({ feedback }) };
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Feedback could not be saved" }] };
    }
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const packageRoot = process.env.PLUGIN_ROOT;
  const dataRoot = process.env.PLUGIN_DATA;
  if (!packageRoot || !dataRoot) throw Error("PLUGIN_ROOT and PLUGIN_DATA are required");
  const server = await createInspectionServer({ packageRoot, dataRoot });
  await server.connect(new StdioServerTransport());
}
