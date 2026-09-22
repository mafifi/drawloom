import { z } from "zod";
import {
  HistoryAroundOptionsSchema,
  HistoryChangeOptionsSchema,
  HistoryPageOptionsSchema,
  HistoryStoreError,
  type ConversationHistoryStore,
  type HistoryAroundOptions,
  type HistoryChangeOptions,
  type HistoryPageOptions,
} from "@drawloom/conversation-history";
import type { AgentSession } from "@drawloom/agent";
import type { ProjectSchema } from "../src/lib/protocol.js";

const conversationSearchSchema = z.strictObject({
  query: z.string().trim().min(1).max(500),
  projectId: z.string().min(1).max(256).optional(),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

type Project = Pick<
  z.infer<typeof ProjectSchema>,
  "metadataRevision" | "conversations" | "projects"
>;

export function createHistoryApplication(options: {
  history: ConversationHistoryStore;
  project: () => Project;
  recoverResources(conversationId: string): Promise<boolean>;
  synchronizeHistory(
    conversationId: string,
    reader: AgentSession["history"],
    direction?: "latest" | "older",
  ): Promise<void>;
  live: { get(conversationId: string): { session: AgentSession } | undefined };
  writer(conversationId: string): { error?: string; syncing: boolean };
  observeCache(hit: boolean, entries?: number): void;
}) {
  const hasConversation = (conversationId: string) =>
    options.project().conversations.some((conversation) => conversation.id === conversationId);

  return {
    async historyPage(conversationId: string, raw: HistoryPageOptions = {}) {
      if (!hasConversation(conversationId)) throw Error("Conversation unavailable");
      const pageOptions = HistoryPageOptionsSchema.parse(raw);
      await options.recoverResources(conversationId);
      let page = await options.history.page(conversationId, pageOptions);
      let cacheHit = true;
      if (
        pageOptions.before &&
        page.entries.length < (pageOptions.limit ?? 50) &&
        page.status.hasOlder
      ) {
        const session = options.live.get(conversationId)?.session;
        if (session?.history) {
          cacheHit = false;
          await options.synchronizeHistory(conversationId, session.history, "older");
          page = await options.history.page(conversationId, pageOptions);
        }
      }
      options.observeCache(cacheHit, page.entries.length);
      const writer = options.writer(conversationId);
      return writer.error
        ? {
            ...page,
            status: {
              ...page.status,
              sync: "error" as const,
              message: writer.error,
            },
          }
        : writer.syncing
          ? { ...page, status: { ...page.status, sync: "syncing" as const } }
          : page;
    },
    async historyChanges(conversationId: string, raw: HistoryChangeOptions = {}) {
      if (!hasConversation(conversationId)) throw Error("Conversation unavailable");
      const changes = await options.history.changes(
        conversationId,
        HistoryChangeOptionsSchema.parse(raw),
      );
      const writer = options.writer(conversationId);
      return writer.error
        ? {
            ...changes,
            status: {
              ...changes.status,
              sync: "error" as const,
              message: writer.error,
            },
          }
        : writer.syncing
          ? {
              ...changes,
              status: { ...changes.status, sync: "syncing" as const },
            }
          : changes;
    },
    async historyAround(conversationId: string, raw: HistoryAroundOptions) {
      if (!hasConversation(conversationId)) throw Error("Conversation unavailable");
      return options.history.around(conversationId, HistoryAroundOptionsSchema.parse(raw));
    },
    async searchConversations(raw: unknown) {
      const input = conversationSearchSchema.parse(raw);
      const project = options.project();
      const scope = JSON.stringify([
        project.metadataRevision,
        input.query,
        input.projectId ?? null,
        input.archived,
      ]);
      let titleOffset = 0,
        historyCursor: string | undefined;
      if (input.cursor)
        try {
          const parsed = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as {
            scope: string;
            titleOffset: number;
            historyCursor?: string;
          };
          if (
            parsed.scope !== scope ||
            !Number.isSafeInteger(parsed.titleOffset) ||
            parsed.titleOffset < 0
          )
            throw Error();
          titleOffset = parsed.titleOffset;
          historyCursor = parsed.historyCursor;
        } catch {
          throw new HistoryStoreError(
            "invalid_cursor",
            "Conversation search cursor is invalid for this search",
          );
        }
      const eligible = project.conversations.filter(
        (conversation) =>
          (!input.projectId || conversation.projectId === input.projectId) &&
          (input.archived === "all" ||
            (conversation.archived === true) === (input.archived === "archived")),
      );
      const titleMatches = eligible
        .filter((conversation) =>
          conversation.title.toLocaleLowerCase().includes(input.query.toLocaleLowerCase()),
        )
        .sort(
          (left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
        );
      const eligibleById = new Map(eligible.map((conversation) => [conversation.id, conversation]));
      const metadata = (conversationId: string) => {
        const conversation = eligibleById.get(conversationId)!;
        return {
          conversationId: conversation.id,
          title: conversation.title,
          projectId: conversation.projectId,
          projectName: project.projects.find((entry) => entry.id === conversation.projectId)?.name,
          workbenchId: conversation.workbenchId,
          provider: conversation.provider,
          archived: conversation.archived === true,
        };
      };
      const items: Array<Record<string, unknown>> = titleMatches
        .slice(titleOffset, titleOffset + input.limit)
        .map((conversation) => ({
          ...metadata(conversation.id),
          match: "title",
        }));
      titleOffset += items.length;
      let messageHasMore = false,
        searchedMessages = false;
      if (items.length < input.limit && titleOffset >= titleMatches.length) {
        searchedMessages = true;
        const message = await options.history.search({
          query: input.query,
          conversationIds: eligible.map((conversation) => conversation.id),
          ...(historyCursor ? { cursor: historyCursor } : {}),
          limit: input.limit - items.length,
        });
        items.push(
          ...message.items.map((hit) => ({
            ...metadata(hit.conversationId),
            match: "message",
            entryId: hit.entryId,
            role: hit.role,
            snippet: hit.snippet,
            position: hit.position,
          })),
        );
        historyCursor = message.cursor;
        messageHasMore = message.hasMore;
      }
      const hasMore =
        titleOffset < titleMatches.length ||
        messageHasMore ||
        (!searchedMessages && items.length === input.limit && titleOffset === titleMatches.length);
      return {
        items,
        ...(hasMore
          ? {
              cursor: Buffer.from(
                JSON.stringify({
                  scope,
                  titleOffset,
                  ...(historyCursor ? { historyCursor } : {}),
                }),
              ).toString("base64url"),
            }
          : {}),
        hasMore,
      };
    },
  };
}
