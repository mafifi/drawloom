import { expect, test } from "vitest";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
/** Node signals child completion with an "exit" event; there is no awaitable `exited`. */
const exitCodeOf = async (child: ChildProcess): Promise<number> =>
  (await once(child, "exit"))[0] as number;

test("a failed worktree add never removes staging owned by another build", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-llama-build-race-"));
  try {
    const repository = join(root, "drawloom");
    const source = join(root, "llama.cpp");
    const tools = join(root, "tools");
    const log = join(root, "git.log");
    await mkdir(join(repository, "scripts", "patches"), { recursive: true });
    await mkdir(join(repository, "apps", "desktop", "src-tauri"), { recursive: true });
    await mkdir(source);
    await mkdir(tools);
    await writeFile(
      join(repository, "scripts", "build-llama-runtime.sh"),
      await readFile(join(import.meta.dirname, "build-llama-runtime.sh")),
    );
    await writeFile(
      join(repository, "scripts", "patches", "llama-server-embedding-only.patch"),
      "fixture",
    );
    await writeFile(
      join(repository, "apps", "desktop", "src-tauri", "tauri.conf.json"),
      JSON.stringify({ bundle: { macOS: { minimumSystemVersion: "14.0" } } }),
    );
    await writeFile(
      join(tools, "uname"),
      `#!/bin/sh
case "$1" in
  -s) echo Darwin ;;
  -m) echo arm64 ;;
  *) exit 1 ;;
esac
`,
    );
    await writeFile(
      join(tools, "git"),
      `#!/bin/sh
printf '%s\\n' "$*" >> "${log}"
case "$*" in
  *"rev-parse HEAD"*) echo 2f539596c6e9a977e91b6bc6344650422c6bc3b0 ;;
  *"status --porcelain"*) ;;
  *"worktree add"*)
    staging="${repository}/dist/.llama-source-2f539596c6e9a977e91b6bc6344650422c6bc3b0"
    mkdir -p "$staging"
    echo other-build > "$staging/owner"
    exit 1
    ;;
esac
`,
    );
    await Promise.all([chmod(join(tools, "uname"), 0o700), chmod(join(tools, "git"), 0o700)]);
    const child = spawn("/bin/sh", [join(repository, "scripts", "build-llama-runtime.sh")], {
      env: {
        ...globalThis.process.env,
        PATH: `${tools}:/usr/bin:/bin`,
        DRAWLOOM_MACOSX_DEPLOYMENT_TARGET: "14.0",
        DRAWLOOM_LLAMA_SOURCE: source,
        DRAWLOOM_LLAMA_OUTPUT: join(root, "output"),
      },
    });
    expect(await exitCodeOf(child)).not.toBe(0);
    expect(
      await readFile(
        join(repository, "dist", ".llama-source-2f539596c6e9a977e91b6bc6344650422c6bc3b0", "owner"),
        "utf8",
      ),
    ).toBe("other-build\n");
    expect(await readFile(log, "utf8")).not.toContain("worktree remove");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the runtime build requires and propagates one explicit macOS deployment target", async () => {
  const script = await readFile(join(import.meta.dirname, "build-llama-runtime.sh"), "utf8");
  const config = JSON.parse(
    await readFile(join(import.meta.dirname, "../apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
  );
  expect(config.bundle.macOS.minimumSystemVersion).toBe("14.0");
  expect(script).toContain(
    'tauri_config="$repository_root/apps/desktop/src-tauri/tauri.conf.json"',
  );
  expect(script).toContain("deployment_target=$(sed -n");
  expect(script).toContain('-DCMAKE_OSX_DEPLOYMENT_TARGET="$deployment_target"');
  expect(script).toContain('-DGGML_METAL_MACOSX_VERSION_MIN="$deployment_target"');
});
