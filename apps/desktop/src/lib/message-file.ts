import { workingFileReference } from "./working-file.js";

/** Only presentation: the existing host file route still enforces physical containment. */
export function messageFile(path: string, conversationId: string, directory: string) {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\0\\?#]/.test(path) ||
    path.split("/").some((part) => part === "." || part === "..")
  )
    return;
  const uri = "file://" + path.split("/").map(encodeURIComponent).join("/");
  return workingFileReference(
    { id: "message-link", title: path, source: "history", status: "unavailable", uri },
    conversationId,
    directory,
  );
}
