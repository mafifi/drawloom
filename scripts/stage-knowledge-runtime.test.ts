import { expect, test } from "bun:test";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stageKnowledgeRuntime } from "./stage-knowledge-runtime.js";

test("knowledge staging includes the managed sidecar and Nightloom without checkout links", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-stage-"));
  const destination = join(root, "out", "knowledge");
  async function pkg(
    path: string,
    name: string,
    file: string,
    dependencies: Record<string, string> = {},
  ) {
    await mkdir(join(path, "dist"), { recursive: true });
    await writeFile(
      join(path, "package.json"),
      JSON.stringify({ name, version: "0.0.0", files: ["dist"], dependencies }),
    );
    await writeFile(join(path, "dist", file), name);
  }
  try {
    await mkdir(join(root, "node_modules"), { recursive: true });
    await pkg(
      join(root, "packages/knowledge/local-knowledge-runtime"),
      "@drawloom/local-knowledge-runtime",
      "sidecar.js",
      { "@drawloom/local-embeddings": "0.0.0" },
    );
    await pkg(join(root, "packages/knowledge/nightloom"), "@drawloom/nightloom", "workflows.js");
    const embeddings = join(root, "node_modules/@drawloom/local-embeddings");
    await mkdir(join(embeddings, "dist"), { recursive: true });
    await mkdir(join(embeddings, "src"), { recursive: true });
    await writeFile(
      join(embeddings, "package.json"),
      JSON.stringify({
        name: "@drawloom/local-embeddings",
        version: "0.0.0",
        files: ["dist", "src"],
        dependencies: {},
      }),
    );
    await writeFile(join(embeddings, "dist/index.js"), "gguf provider");
    await writeFile(join(embeddings, "src/llama-worker.ts"), "JavaScript worker");
    await stageKnowledgeRuntime({ repositoryRoot: root, destination });
    expect(
      await readFile(
        join(destination, "node_modules/@drawloom/local-knowledge-runtime/dist/sidecar.js"),
        "utf8",
      ),
    ).toContain("local-knowledge-runtime");
    expect(
      await readFile(
        join(destination, "node_modules/@drawloom/nightloom/dist/workflows.js"),
        "utf8",
      ),
    ).toContain("nightloom");
    expect(
      await readFile(
        join(destination, "node_modules/@drawloom/local-embeddings/src/llama-worker.ts"),
        "utf8",
      ),
    ).toBe("JavaScript worker");
    expect(
      access(join(destination, "node_modules/@drawloom/local-embeddings/python")),
    ).rejects.toThrow();
    expect(
      access(
        join(destination, "node_modules/@drawloom/local-embeddings/Qwen3-Embedding-0.6B-Q8_0.gguf"),
      ),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
