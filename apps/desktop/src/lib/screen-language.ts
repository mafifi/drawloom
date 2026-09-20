/** Display-only labels; execution always uses the original identity. */
const labels: Record<string, string> = {
  "synthetic.text": "Text studio",
  "drawloom.local-knowledge": "Knowledge",
  "text.word_count": "Count words",
  "knowledge.search": "Search knowledge",
  "knowledge.evidence": "Inspect evidence",
  "knowledge.contribute": "Contribute knowledge",
};
export const readableName = (name: string): string => labels[name] ?? name;
/** Author metadata takes precedence; fallback formatting never changes selection identity. */
export const discoveryName = (entry: PluginListEntry): string =>
  entry.presentation?.displayName ??
  labels[entry.name] ??
  entry.name.replaceAll(/[-_.]+/g, " ").replace(/^\p{L}/u, (c) => c.toUpperCase());
export const archiveCopy = {
  introduction: "Bring a conversation back to its project whenever you need it.",
  search: "Search archived conversations",
  placeholder: "Search archived conversations…",
  restore: "Restore",
  noMatches: "No matching conversations",
  empty: "No archived conversations",
  tryAgain: "Try a different title or project name.",
  help: "Conversations you archive will appear here. Nothing is deleted.",
} as const;
export const pluginDescription = (entry: PluginListEntry): string =>
  ({
    "synthetic.text": "Write, revise and inspect documents.",
    "drawloom.local-knowledge": "Find what you’ve learned and follow its evidence.",
  })[entry.name] ??
  entry.description ??
  entry.origin;
export interface PluginListEntry {
  id: string;
  name: string;
  kind: string;
  description?: string;
  origin: string;
  ownerId?: string;
  presentation?: { displayName?: string };
}
export interface PluginGroup<T extends PluginListEntry> {
  entry: T;
  children: T[];
}
export function pluginGroups<T extends PluginListEntry>(
  entries: readonly T[],
  query: string,
): PluginGroup<T>[] {
  const owners = new Set(
    entries.filter((e) => e.kind === "plugin" || e.kind === "app").map((e) => e.id),
  );
  const needle = query.trim().toLowerCase();
  return entries
    .filter((e) => owners.has(e.id) || !e.ownerId || !owners.has(e.ownerId))
    .map((entry) => ({ entry, children: entries.filter((e) => e.ownerId === entry.id) }))
    .filter((group) =>
      [group.entry, ...group.children].some((e) =>
        [discoveryName(e), e.name, e.description, e.origin]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      ),
    );
}
