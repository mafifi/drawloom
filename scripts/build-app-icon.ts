import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
/** Node signals child completion with an "exit" event; there is no awaitable `exited`. */
const exitCodeOf = async (child: ChildProcess): Promise<number> =>
  (await once(child, "exit"))[0] as number;

// Apple compiles the editable Icon Composer source, including the older-macOS
// ICNS fallback. Keep this independent from signing and notarisation.
const icons = new URL("../apps/desktop/src-tauri/icons/", import.meta.url).pathname;
const temporary = await mkdtemp(join(tmpdir(), "drawloom-icon-build-"));
try {
  await mkdir(icons, { recursive: true });
  const command = spawn(
    "xcrun",
    [
      "actool",
      join(icons, "Drawloom.icon"),
      "--compile",
      icons,
      "--platform",
      "macosx",
      "--minimum-deployment-target",
      "14.0",
      "--app-icon",
      "Drawloom",
      "--output-partial-info-plist",
      join(temporary, "icon.plist"),
      "--target-device",
      "mac",
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  if ((await exitCodeOf(command)) !== 0) throw Error("Icon Composer asset compilation failed");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
