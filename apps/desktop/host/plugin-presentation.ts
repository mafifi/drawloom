import { open, realpath, lstat } from "node:fs/promises";

/** File-open seam. Production always uses `node:fs/promises`. Tests substitute
 * `open` to replace the resolved path between resolution and open — precisely
 * the race the post-open inode comparison below exists to defeat. */
export type FileOpen = { open: typeof open };
import { constants } from "node:fs";
import { resolve, extname, join } from "node:path";
import { containsPath } from "./path-containment.js";
import { homedir } from "node:os";
import { DiscoveryPresentationSchema, type DiscoveryPresentation } from "@drawloom/agent";
import type { DrawloomPackageExtension } from "@drawloom/plugins";

const maxIconBytes = 256 * 1024;
/** Read-only host boundary. No remote fetching or provider paths in browser data. */
export async function readPluginIcon(
  root: string,
  path: string,
  files: FileOpen = { open },
): Promise<string | undefined> {
  try {
    const base = await realpath(root);
    const unresolved = resolve(base, path);
    // Refuse anything that is not a regular file before resolving it. `lstat`
    // does not follow the final link, so a FIFO, device or symlink is rejected
    // here rather than opened or resolved through.
    if (!(await lstat(unresolved)).isFile()) return;
    const target = await realpath(unresolved);
    // Containment, plus this caller's own rule: an icon is a file inside the
    // root, never the root itself.
    if (target === base || !containsPath(base, target)) return;
    const mime = {
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    }[extname(target).toLowerCase()];
    if (!mime) return;
    const rootInfo = await lstat(base);
    const file = await files.open(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size === 0 || info.size > maxIconBytes) return;
      const verified = await realpath(target);
      // Re-checked after opening, against the same rule as above: the file may
      // have been replaced between the first check and the open.
      if (verified === base || !containsPath(base, verified)) return;
      const pathInfo = await lstat(verified),
        currentRoot = await lstat(await realpath(root));
      if (
        !pathInfo.isFile() ||
        pathInfo.dev !== info.dev ||
        pathInfo.ino !== info.ino ||
        currentRoot.dev !== rootInfo.dev ||
        currentRoot.ino !== rootInfo.ino
      )
        return;
      const bytes = Buffer.alloc(maxIconBytes + 1);
      let bytesRead = 0;
      while (bytesRead < bytes.length) {
        const read = await file.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
        if (!read.bytesRead) break;
        bytesRead += read.bytesRead;
      }
      if (bytesRead !== info.size || bytesRead > maxIconBytes) return;
      const data = bytes.subarray(0, bytesRead);
      if (mime === "image/svg+xml") {
        const svg = data.toString("utf8");
        // Image-only SVG: no scripts, embedded HTML, external resources or event handlers.
        if (
          !/<svg[\s>]/i.test(svg) ||
          /<(?:script|foreignObject|iframe|object|embed|image|use)\b|\bon\w+\s*=|\b(?:href|src)\s*=|url\s*\(|<!ENTITY|<!DOCTYPE|@import/i.test(
            svg,
          )
        )
          return;
      } else if (
        mime === "image/png"
          ? data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
          : mime === "image/jpeg"
            ? data[0] !== 255 || data[1] !== 216 || data[2] !== 255
            : data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP"
      )
        return;
      return `data:${mime};base64,${data.toString("base64")}`;
    } finally {
      await file.close();
    }
  } catch {
    return undefined;
  }
}

export async function packagePresentation(
  root: string,
  declaration: DrawloomPackageExtension["presentation"],
): Promise<DiscoveryPresentation | undefined> {
  if (!declaration) return undefined;
  const light = declaration.icon && (await readPluginIcon(root, declaration.icon.light));
  const dark = declaration.icon?.dark && (await readPluginIcon(root, declaration.icon.dark));
  return DiscoveryPresentationSchema.parse({
    ...(declaration.displayName ? { displayName: declaration.displayName } : {}),
    ...(light ? { icon: { light, ...(dark ? { dark } : {}) } } : {}),
  });
}

/** Native plugin/list paths must remain within the installed native plugin cache. */
export async function nativePluginIcon(path: string): Promise<string | undefined> {
  return readPluginIcon(
    join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "plugins", "cache"),
    path,
  );
}
