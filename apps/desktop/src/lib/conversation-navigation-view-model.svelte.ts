import {
  ConversationSearchResultSchema,
  type ConversationSearchItem,
  type DesktopCommand,
} from "./protocol.js";
import { telemetryFetch as fetch } from "./telemetry.js";

type Dependencies = {
  selectConversation?: (id: string) => Promise<boolean>;
  openAround?: (conversationId: string, entryId: string) => Promise<boolean>;
  command?: (value: DesktopCommand) => Promise<boolean>;
  commandError?: () => string;
};

export function createConversationNavigationViewModel(dependencies: Dependencies = {}) {
  let searchOpen = $state(false),
    query = $state(""),
    projectId = $state(""),
    archived = $state<"active" | "archived" | "all">("active");
  let results = $state<ConversationSearchItem[]>([]),
    cursor = $state<string>(),
    hasMore = $state(false),
    loading = $state(false),
    searchError = $state("");
  let renameOpen = $state(false),
    renameDraft = $state(""),
    renameTarget = $state<{ id: string; title: string }>(),
    managementError = $state("");
  let epoch = 0,
    read = new AbortController(),
    timer: ReturnType<typeof setTimeout> | undefined;
  function cancelRead() {
    epoch++;
    read.abort();
    read = new AbortController();
    loading = false;
    clearTimeout(timer);
  }
  async function body(response: Response) {
    const value: unknown = await response.json().catch(() => undefined);
    if (!response.ok)
      throw Error(
        value && typeof value === "object" && "error" in value
          ? String(value.error)
          : "Conversation search is unavailable.",
      );
    return value;
  }
  async function search(more = false) {
    const trimmed = query.trim();
    if (!searchOpen || !trimmed || loading) {
      if (!trimmed) {
        results = [];
        cursor = undefined;
        hasMore = false;
        searchError = "";
      }
      return;
    }
    const version = ++epoch;
    read.abort();
    read = new AbortController();
    loading = true;
    searchError = "";
    const params = new URLSearchParams({ q: trimmed, archived, limit: "25" });
    if (projectId) params.set("projectId", projectId);
    if (more && cursor) params.set("cursor", cursor);
    try {
      const response = await fetch("/api/conversations/search?" + params, { signal: read.signal });
      if (response.status === 409 && more && version === epoch) {
        loading = false;
        cursor = undefined;
        hasMore = false;
        results = [];
        return search(false);
      }
      const page = ConversationSearchResultSchema.parse(await body(response));
      if (version !== epoch) return;
      results = more ? [...results, ...page.items] : page.items;
      cursor = page.cursor;
      hasMore = page.hasMore;
    } catch (cause) {
      if (version === epoch)
        searchError =
          cause instanceof Error ? cause.message : "Conversation search is unavailable.";
    } finally {
      if (version === epoch) loading = false;
    }
  }
  function schedule() {
    cancelRead();
    results = [];
    cursor = undefined;
    hasMore = false;
    searchError = "";
    if (searchOpen && query.trim()) timer = setTimeout(() => void search(), 200);
  }
  return {
    get searchOpen() {
      return searchOpen;
    },
    set searchOpen(value: boolean) {
      value ? this.openSearch() : this.closeSearch();
    },
    get query() {
      return query;
    },
    set query(value: string) {
      query = value;
      schedule();
    },
    get projectId() {
      return projectId;
    },
    set projectId(value: string) {
      projectId = value;
      schedule();
    },
    get archived() {
      return archived;
    },
    set archived(value: typeof archived) {
      archived = value;
      schedule();
    },
    get results() {
      return results;
    },
    get loading() {
      return loading;
    },
    get searchError() {
      return searchError;
    },
    get hasMore() {
      return hasMore;
    },
    openSearch() {
      searchOpen = true;
      schedule();
    },
    closeSearch() {
      searchOpen = false;
      cancelRead();
    },
    dispose() {
      searchOpen = false;
      cancelRead();
    },
    more() {
      return hasMore ? search(true) : undefined;
    },
    async openResult(item: ConversationSearchItem) {
      if (!(await dependencies.selectConversation?.(item.conversationId))) return false;
      if (
        item.match === "message" &&
        item.entryId &&
        !(await dependencies.openAround?.(item.conversationId, item.entryId))
      ) {
        searchError = "The matching message could not be opened. Search results remain available.";
        return false;
      }
      this.closeSearch();
      return true;
    },
    get renameOpen() {
      return renameOpen;
    },
    set renameOpen(value: boolean) {
      renameOpen = value;
      if (!value) managementError = "";
    },
    get renameDraft() {
      return renameDraft;
    },
    set renameDraft(value: string) {
      renameDraft = value;
      managementError = "";
    },
    get managementError() {
      return managementError;
    },
    beginRename(target: { id: string; title: string }) {
      renameTarget = target;
      renameDraft = target.title;
      managementError = "";
      renameOpen = true;
    },
    async saveRename() {
      const title = renameDraft.trim();
      if (!renameTarget || !title) {
        managementError = "Enter a conversation title.";
        return false;
      }
      const ok =
        (await dependencies.command?.({
          kind: "rename_conversation",
          conversationId: renameTarget.id,
          title,
        })) ?? false;
      if (ok) {
        renameOpen = false;
        managementError = "";
      } else managementError = dependencies.commandError?.() || "The title could not be saved.";
      return ok;
    },
  };
}
export type ConversationNavigationViewModel = ReturnType<
  typeof createConversationNavigationViewModel
>;
