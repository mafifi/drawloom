import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as staging from "./stage-temporal-runtime.js";

test("runtime staging preserves nested dependency versions and native resources without checkout symlinks", async () => {
  expect(Reflect.get(staging, "stageTemporalRuntime")).toBeFunction();
  const root = await mkdtemp(join(tmpdir(), "drawloom-runtime-stage-"));
  const destination = join(root, "out", "orchestration");
  async function pkg(
    path: string,
    name: string,
    version: string,
    dependencies: Record<string, string>,
  ) {
    await mkdir(join(path, "dist"), { recursive: true });
    await writeFile(
      join(path, "package.json"),
      JSON.stringify({ name, version, dependencies, files: ["dist"] }),
    );
    await writeFile(join(path, "dist", "index.js"), `export default '${version}';`);
  }
  try {
    await pkg(
      join(root, "packages/orchestration/temporal-orchestration"),
      "@drawloom/temporal-orchestration",
      "0.0.0",
      { first: "1.0.0", second: "1.0.0" },
    );
    await pkg(join(root, "node_modules/first"), "first", "1.0.0", { second: "2.0.0" });
    await pkg(join(root, "node_modules/second"), "second", "1.0.0", {});
    await pkg(join(root, "node_modules/first/node_modules/second"), "second", "2.0.0", {});
    await writeFile(join(root, "node_modules/first/dist/addon.node"), "native bytes");
    await staging.stageTemporalRuntime({ repositoryRoot: root, destination });
    expect(
      await readFile(join(destination, "node_modules/second/dist/index.js"), "utf8"),
    ).toContain("1.0.0");
    expect(
      await readFile(
        join(destination, "node_modules/first/node_modules/second/dist/index.js"),
        "utf8",
      ),
    ).toContain("2.0.0");
    expect(await readFile(join(destination, "node_modules/first/dist/addon.node"), "utf8")).toBe(
      "native bytes",
    );
    expect(
      await readFile(
        join(destination, "node_modules/@drawloom/temporal-orchestration/dist/index.js"),
        "utf8",
      ),
    ).toContain("0.0.0");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime staging keeps only the exact Temporal bridge platform payload and its legal source", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-runtime-platform-stage-"));
  const destination = join(root, "out", "orchestration");
  const bridge = join(root, "node_modules/@temporalio/core-bridge");
  const supported =
    process.platform === "darwin" && process.arch === "arm64"
      ? "aarch64-apple-darwin"
      : process.platform === "darwin" && process.arch === "x64"
        ? "x86_64-apple-darwin"
        : process.platform === "linux" && process.arch === "arm64"
          ? "aarch64-unknown-linux-gnu"
          : "x86_64-unknown-linux-gnu";
  try {
    await mkdir(join(root, "packages/orchestration/temporal-orchestration/dist"), {
      recursive: true,
    });
    await writeFile(
      join(root, "packages/orchestration/temporal-orchestration/package.json"),
      JSON.stringify({
        name: "@drawloom/temporal-orchestration",
        version: "0.0.0",
        files: ["dist"],
        dependencies: { "@temporalio/core-bridge": "1.0.0" },
      }),
    );
    await writeFile(join(root, "packages/orchestration/temporal-orchestration/dist/index.js"), "");
    for (const triple of [supported, "x86_64-pc-windows-msvc"]) {
      await mkdir(join(bridge, "releases", triple), { recursive: true });
      await writeFile(join(bridge, "releases", triple, "index.node"), triple);
    }
    await mkdir(join(bridge, "sdk-core", "crates"), { recursive: true });
    await writeFile(join(bridge, "sdk-core", "LICENSE.txt"), "MIT fixture");
    await writeFile(join(bridge, "sdk-core", "crates", "source.rs"), "source fixture");
    await writeFile(join(bridge, "index.js"), "bridge fixture");
    await writeFile(
      join(bridge, "package.json"),
      JSON.stringify({
        name: "@temporalio/core-bridge",
        version: "1.0.0",
      }),
    );

    await staging.stageTemporalRuntime({ repositoryRoot: root, destination });
    const staged = join(destination, "node_modules/@temporalio/core-bridge");
    expect(await readFile(join(staged, "releases", supported, "index.node"), "utf8")).toBe(
      supported,
    );
    expect(await readFile(join(staged, "sdk-core", "LICENSE.txt"), "utf8")).toBe("MIT fixture");
    expect(await readFile(join(staged, "sdk-core", "crates", "source.rs"), "utf8")).toBe(
      "source fixture",
    );
    await expect(access(join(staged, "releases", "x86_64-pc-windows-msvc"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
