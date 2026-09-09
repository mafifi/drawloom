import { AssetSchema } from "@drawloom/host";
import { z } from "zod";

const nonEmptyId = z.string().min(1);
const safeInteger = z.number().int().safe();
const revision = safeInteger.nonnegative();
export const HistoryPositionSchema = z.readonly(z.tuple([safeInteger, safeInteger]));
export type HistoryPosition = z.infer<typeof HistoryPositionSchema>;

export const HistoryEntrySchema = z.strictObject({
  id: nonEmptyId,
  position: HistoryPositionSchema,
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  assets: z.array(AssetSchema),
  operationId: nonEmptyId.optional(),
  state: z.enum(["partial", "complete", "interrupted"]),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const HistorySyncStateSchema = z.enum(["idle", "syncing", "unavailable", "error", "unsupported"]);
export type HistorySyncState = z.infer<typeof HistorySyncStateSchema>;
export const ConversationHistoryStatusSchema = z.strictObject({
  revision,
  sync: HistorySyncStateSchema,
  hasOlder: z.boolean(),
  message: z.string().max(512).optional(),
});
export type ConversationHistoryStatus = z.infer<typeof ConversationHistoryStatusSchema>;

export const HistoryPageOptionsSchema = z.strictObject({ before: z.string().min(1).optional(), limit: z.number().int().min(1).max(200).optional() });
export type HistoryPageOptions = z.infer<typeof HistoryPageOptionsSchema>;
export const HistoryChangeOptionsSchema = z.strictObject({ after: z.string().min(1).optional(), limit: z.number().int().min(1).max(200).optional() });
export type HistoryChangeOptions = z.infer<typeof HistoryChangeOptionsSchema>;
export const HistoryPageSchema = z.strictObject({
  entries: z.array(HistoryEntrySchema),
  olderCursor: z.string().min(1).optional(),
  hasOlder: z.boolean(),
  changeCursor: z.string().min(1),
  status: ConversationHistoryStatusSchema,
});
export type HistoryPage = z.infer<typeof HistoryPageSchema>;
export const HistoryChangesSchema = z.strictObject({
  entries: z.array(HistoryEntrySchema),
  cursor: z.string().min(1),
  hasMore: z.boolean(),
  status: ConversationHistoryStatusSchema,
});
export type HistoryChanges = z.infer<typeof HistoryChangesSchema>;

export const HistoryCheckpointUpdateSchema = z.strictObject({ namespace: nonEmptyId, key: nonEmptyId, value: z.json() });
export type HistoryCheckpointUpdate = z.infer<typeof HistoryCheckpointUpdateSchema>;
export const HistorySyncUpdateSchema = z.strictObject({ sync: HistorySyncStateSchema, hasOlder: z.boolean().optional(), message: z.string().max(512).optional() });
export type HistorySyncUpdate = z.infer<typeof HistorySyncUpdateSchema>;
export const HistoryCommitInputSchema = z.strictObject({
  expectedRevision: revision,
  entries: z.array(HistoryEntrySchema).optional(),
  checkpoints: z.array(HistoryCheckpointUpdateSchema).optional(),
  sync: HistorySyncUpdateSchema.optional(),
});
export type HistoryCommitInput = z.infer<typeof HistoryCommitInputSchema>;

export const HistoryStoreErrorCodeSchema = z.enum(["invalid_input", "invalid_cursor", "conflict", "unavailable", "unsupported_version"]);
export type HistoryStoreErrorCode = z.infer<typeof HistoryStoreErrorCodeSchema>;
export class HistoryStoreError extends Error {
  readonly code: HistoryStoreErrorCode;
  constructor(code: HistoryStoreErrorCode, message: string) {
    super(message.slice(0, 512));
    this.name = "HistoryStoreError";
    this.code = HistoryStoreErrorCodeSchema.parse(code);
  }
}

export interface ConversationHistoryStore {
  page(conversationId: string, options?: HistoryPageOptions): Promise<HistoryPage>;
  changes(conversationId: string, options?: HistoryChangeOptions): Promise<HistoryChanges>;
  status(conversationId: string): Promise<ConversationHistoryStatus>;
  checkpoint(conversationId: string, namespace: string, key: string): Promise<unknown | undefined>;
  get(conversationId: string, id: string): Promise<HistoryEntry | undefined>;
  commit(conversationId: string, input: HistoryCommitInput): Promise<ConversationHistoryStatus>;
  close(): Promise<void>;
}

/** Read-only adapter state. Native identifiers and cursors never reach UI pages. */
export interface HistoryReadContext {
  checkpoint(key: string): Promise<unknown | undefined>;
  get(id: string): Promise<HistoryEntry | undefined>;
}
export const HistoryReadBatchSchema = z.strictObject({
  entries: z.array(HistoryEntrySchema).max(200),
  checkpoints: z.array(z.strictObject({ key: nonEmptyId, value: z.json() })),
  hasOlder: z.boolean(),
  /** Continue bounded latest reconciliation, never an instruction to import older history eagerly. */
  hasMore: z.boolean().optional(),
});
export type HistoryReadBatch = z.infer<typeof HistoryReadBatchSchema>;
/** Separate from execution signals: the host commits each bounded batch atomically. */
export interface ConversationHistoryReader {
  readonly namespace: string;
  read(context: HistoryReadContext, options: { direction: 'latest' | 'older'; limit: number }): Promise<HistoryReadBatch>;
}
export class HistoryReadError extends Error {
  constructor(readonly status: 'unsupported' | 'unavailable' | 'error', message: string) {
    super(message.slice(0, 512)); this.name = 'HistoryReadError';
  }
}
