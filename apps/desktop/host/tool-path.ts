import { statSync } from "node:fs";
import { delimiter, join } from "node:path";

/** launchd's default for an app started from Finder or the Dock. */
export const launchdDefaultPath = "/usr/bin:/bin:/usr/sbin:/sbin";

/**
 * The PATH the host and every child it starts should search.
 *
 * An app launched from Finder or the Dock does not inherit a shell's PATH; it
 * gets launchd's default, which contains none of the places Codex installs to.
 * The packaged app therefore could not start `codex` at all, although the same
 * build worked when launched from a terminal -- which is how every acceptance
 * run had started it.
 *
 * The standard user tool directories that exist are APPENDED, never prepended:
 * a PATH inherited from a terminal keeps its order, and nothing added here can
 * shadow a system binary. No shell profile is executed. A tool installed
 * anywhere else is found only when Drawloom is started from a shell whose PATH
 * contains it.
 */
export function userToolPath(
  path: string | undefined,
  home: string,
  isDirectory: (path: string) => boolean = directoryExists,
): string {
  const entries = (path || launchdDefaultPath).split(delimiter).filter(Boolean);
  for (const directory of [join(home, ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin"])
    if (!entries.includes(directory) && isDirectory(directory)) entries.push(directory);
  return entries.join(delimiter);
}

function directoryExists(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
