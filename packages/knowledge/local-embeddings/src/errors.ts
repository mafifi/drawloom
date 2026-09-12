export class LocalEmbeddingsError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "LocalEmbeddingsError";
  }
}
