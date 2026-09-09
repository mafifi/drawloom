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
export interface AssetStore {
  read(key: string): Promise<Uint8Array>;
  write(key: string, bytes: Uint8Array): Promise<void>;
}
/**
 * Host-managed media identity: callers submit bytes, never filesystem paths.
 * Implementations declare a finite byte limit; put/read are whole-buffer APIs,
 * not streaming. Trusted desktop composition accepts at most 256 MiB per asset;
 * untrusted import and agent input may enforce smaller independent limits.
 */
export interface AssetLibrary {
  put(bytes: Uint8Array, mediaType: string): Promise<Asset>;
  read(key: string): Promise<Uint8Array>;
}
