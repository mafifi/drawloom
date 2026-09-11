import { z } from "zod";
export const JsonValueSchema = z.json();
export type JsonValue = z.infer<typeof JsonValueSchema>;
export type RpcMessage = {
  method: string;
  params: unknown;
  id?: string | number;
};
/** Protocol code only: provider error messages/data must not escape the transport. */
export class RpcRequestError extends Error {
  constructor(readonly code: number) {
    super("Provider request rejected");
    this.name = "RpcRequestError";
  }
}
export interface RpcTransport {
  request(method: string, params: unknown): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  respond(id: string | number, result: unknown): void;
  subscribe(
    message: (message: RpcMessage) => void,
    failure: () => void,
  ): () => void;
  close(): Promise<void>;
}
export interface JsonStore {
  get(key: string): Promise<JsonValue | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
}
export const AssetSchema = z.strictObject({
  key: z.string().min(1),
  mediaType: z.string().min(1),
  size: z.number().int().nonnegative(),
});
export type Asset = z.infer<typeof AssetSchema>;
/** Safe display reference; a URI alone grants no read or execution authority. */
export const ResourceReferenceSchema = z.strictObject({
  id: z.string().min(1), source: z.string().min(1), title: z.string().max(512),
  uri: z.string().max(4096).optional(), mimeType: z.string().max(256).optional(),
  asset: AssetSchema.optional(), status: z.enum(['ready', 'readable', 'unavailable']),
  /** Opaque provider-owned read receipt, never a native path or tool permission. */
  retrieval: z.strictObject({ id: z.string().min(1), revision: z.string().min(1) }).optional(),
});
export type ResourceReference = z.infer<typeof ResourceReferenceSchema>;
export interface AssetReadOptions {
  start?: number;
  endExclusive?: number;
  signal?: AbortSignal;
}
export interface AssetReader {
  readonly size: number;
  stream(options?: AssetReadOptions): AsyncIterable<Uint8Array>;
  close(): Promise<void>;
}
export interface AssetStore {
  open(key: string): Promise<AssetReader>;
  writeStream(
    key: string,
    chunks: AsyncIterable<Uint8Array>,
    options: { maxBytes: number; signal?: AbortSignal },
  ): Promise<void>;
  read(key: string): Promise<Uint8Array>;
  write(key: string, bytes: Uint8Array): Promise<void>;
}
/**
 * Host-managed media identity: callers submit bytes, never filesystem paths.
 * Whole-buffer helpers remain bounded compatibility APIs; streaming callers use
 * putStream/open. Trusted desktop composition accepts at most 256 MiB per asset;
 * untrusted import and agent input may enforce smaller independent limits.
 */
export interface AssetLibrary {
  open(key: string): Promise<AssetReader>;
  putStream(
    chunks: AsyncIterable<Uint8Array>,
    mediaType: string,
    options?: { signal?: AbortSignal },
  ): Promise<Asset>;
  put(bytes: Uint8Array, mediaType: string): Promise<Asset>;
  read(key: string): Promise<Uint8Array>;
}
