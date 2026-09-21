export class LocalEmbeddingsError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LocalEmbeddingsError";
    this.code = code;
  }
}
