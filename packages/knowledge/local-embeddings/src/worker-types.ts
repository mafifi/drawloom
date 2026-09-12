import { z } from "zod";

export const EmbedRequestSchema = z.strictObject({ role: z.enum(["query", "document"]), items: z.array(z.string().min(1).max(32_768)).min(1).max(50) })
  .refine((value) => Buffer.byteLength(JSON.stringify(value)) <= 256 * 1024, "Embedding request exceeds its byte budget");
export type EmbedRequest = z.output<typeof EmbedRequestSchema>;
export interface EmbedOptions { readonly signal?: AbortSignal; readonly timeoutMs?: number; }
export interface EmbeddingWorker { embed(input: EmbedRequest, options?: EmbedOptions): Promise<readonly (readonly number[])[]>; close(): Promise<void>; }
