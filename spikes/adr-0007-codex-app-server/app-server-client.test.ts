import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StdioCodexTransport } from "./app-server-client.ts";

test("rejects pending requests and reports failure when app-server exits", async () => {
  const command = Bun.which("false");
  if (!command) throw new Error("The false executable is required by this spike test");
  const transport = new StdioCodexTransport(command, process.cwd(), 1_000);
  const failures: string[] = [];
  transport.onFailure((error) => failures.push(error.message));

  await expect(transport.request("initialize", {})).rejects.toThrow(
    "App-server transport closed",
  );
  expect(failures).toHaveLength(1);
  await transport.close();
});

test("times out a request when app-server remains silent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "drawloom-silent-transport-"));
  const command = join(directory, "silent-app-server");
  await Bun.write(command, "#!/bin/sh\nsleep 10\n");
  await chmod(command, 0o700);
  const transport = new StdioCodexTransport(command, process.cwd(), 10);

  try {
    await expect(transport.request("initialize", {})).rejects.toThrow(
      "App-server request timed out: initialize",
    );
  } finally {
    await transport.close();
    await rm(directory, { recursive: true, force: true });
  }
});
