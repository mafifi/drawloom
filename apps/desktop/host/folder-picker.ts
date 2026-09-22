import { text as readText } from "node:stream/consumers";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
/** Node signals child completion with an "exit" event; there is no awaitable `exited`. */
const exitCodeOf = async (child: ChildProcess): Promise<number> =>
  (await once(child, "exit"))[0] as number;
/** Native macOS dialog without exposing a Tauri capability to remote web content. */
export async function pickMacProjectDirectory(signal: AbortSignal): Promise<string | undefined> {
  signal.throwIfAborted();
  // The script is constant. Browser strings never become shell or AppleScript.
  const child = spawn(
    "/usr/bin/osascript",
    [
      "-e",
      'try\nPOSIX path of (choose folder with prompt "Choose a Drawloom project folder")\non error number -128\nreturn ""\nend try',
    ],
    { stdio: ["pipe", "pipe", "ignore"] },
  );
  const cancel = () => child.kill();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const [text, status] = await Promise.all([readText(child.stdout!), exitCodeOf(child)]);
    signal.throwIfAborted();
    if (status !== 0) throw Error("Native folder selection failed");
    return text.trim() || undefined;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
