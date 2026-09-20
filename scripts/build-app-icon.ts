import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Apple compiles the editable Icon Composer source, including the older-macOS
// ICNS fallback. Keep this independent from signing and notarisation.
const icons = new URL("../apps/desktop/src-tauri/icons/", import.meta.url).pathname;
const temporary = await mkdtemp(join(tmpdir(), "drawloom-icon-build-"));
try {
  await mkdir(icons, { recursive: true });
  await copyFile(
    new URL("../publishing/site/public/artwork/drawloom/mark.png", import.meta.url),
    join(icons, "Drawloom.icon/Assets/mark.png"),
  );
  const command = Bun.spawn(
    [
      "xcrun",
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
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await command.exited) !== 0) throw Error("Icon Composer asset compilation failed");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
