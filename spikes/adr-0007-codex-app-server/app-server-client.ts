export type JsonRpcId = number | string;
export type JsonRecord = Record<string, unknown>;

export type CodexNotification = {
  readonly method: string;
  readonly params: unknown;
};

export type CodexServerRequest = CodexNotification & {
  readonly id: JsonRpcId;
};

export interface CodexTransport {
  request(method: string, params: unknown): Promise<unknown>;
  respond(id: JsonRpcId, result: unknown): void;
  onNotification(
    handler: (notification: CodexNotification) => void,
  ): () => void;
  onRequest(handler: (request: CodexServerRequest) => void): () => void;
  onFailure(handler: (error: Error) => void): () => void;
  close(): Promise<void>;
}

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class StdioCodexTransport implements CodexTransport {
  private nextId = 1;
  private readonly pending = new Map<
    JsonRpcId,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly process;
  private notificationHandler:
    | ((notification: CodexNotification) => void)
    | undefined;
  private requestHandler: ((request: CodexServerRequest) => void) | undefined;
  private failureHandler: ((error: Error) => void) | undefined;
  private readonly notificationMethods = new Set<string>();
  private readonly serverRequestMethods = new Set<string>();
  private closed = false;
  private failure: Error | undefined;
  private stderr = "";

  public constructor(
    command: string,
    cwd: string,
    private readonly requestTimeoutMs = 30_000,
  ) {
    this.process = Bun.spawn(
      [
        command,
        "app-server",
        "--stdio",
        "-c",
        "mcp_servers={}",
        "-c",
        "plugins={}",
        "-c",
        "apps={}",
        "--disable",
        "memories",
      ],
      {
        cwd,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    void this.readStdout().catch((error: unknown) =>
      this.fail(error instanceof Error ? error : new Error(String(error))),
    );
    void this.readStderr();
    void this.process.exited.then((exitCode) => {
      if (!this.closed) {
        this.fail(new Error(`App-server exited with code ${exitCode}`));
      }
    });
  }

  public request(method: string, params: unknown): Promise<unknown> {
    if (this.closed || this.failure) {
      return Promise.reject(
        this.failure ?? new Error("App-server is closed"),
      );
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error(`App-server request timed out: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public respond(id: JsonRpcId, result: unknown): void {
    if (this.closed || this.failure) return;
    try {
      this.send({ id, result });
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public onNotification(
    handler: (notification: CodexNotification) => void,
  ): () => void {
    this.notificationHandler = handler;
    return () => {
      if (this.notificationHandler === handler) this.notificationHandler = undefined;
    };
  }

  public onRequest(handler: (request: CodexServerRequest) => void): () => void {
    this.requestHandler = handler;
    return () => {
      if (this.requestHandler === handler) this.requestHandler = undefined;
    };
  }

  public onFailure(handler: (error: Error) => void): () => void {
    this.failureHandler = handler;
    if (this.failure) queueMicrotask(() => handler(this.failure!));
    return () => {
      if (this.failureHandler === handler) this.failureHandler = undefined;
    };
  }

  public async initialize(clientName: string): Promise<unknown> {
    const result = await this.request("initialize", {
      clientInfo: {
        name: clientName,
        title: "Drawloom retained Codex evidence spike",
        version: "0.0.0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        extensions: null,
      },
    });
    this.send({ method: "initialized" });
    return result;
  }

  public diagnostics(): {
    readonly stderr: string;
    readonly notificationMethods: readonly string[];
    readonly serverRequestMethods: readonly string[];
  } {
    return {
      stderr: this.stderr,
      notificationMethods: [...this.notificationMethods],
      serverRequestMethods: [...this.serverRequestMethods],
    };
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      this.process.stdin.end();
      this.process.kill();
    } catch {
      // The process may already have exited after a reported transport failure.
    }
    await this.process.exited;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("App-server closed before responding"));
    }
    this.pending.clear();
  }

  private send(value: unknown): void {
    this.process.stdin.write(`${JSON.stringify(value)}\n`);
    this.process.stdin.flush();
  }

  private async readStdout(): Promise<void> {
    const reader = this.process.stdout.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (!this.closed) this.fail(new Error("App-server stdout reached EOF"));
        break;
      }
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleMessage(JSON.parse(line));
      }
    }
  }

  private async readStderr(): Promise<void> {
    this.stderr = await new Response(this.process.stderr).text();
  }

  private handleMessage(value: unknown): void {
    if (!isRecord(value)) return;
    if ("id" in value && !("method" in value)) {
      const id = value.id;
      if (typeof id !== "number" && typeof id !== "string") return;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      if (isRecord(value.error)) {
        pending.reject(
          new Error(`App-server rejected request: ${JSON.stringify(value.error)}`),
        );
      } else {
        pending.resolve(value.result);
      }
      return;
    }
    if (typeof value.method !== "string") return;
    if ("id" in value) {
      const id = value.id;
      if (typeof id !== "number" && typeof id !== "string") return;
      this.serverRequestMethods.add(value.method);
      this.requestHandler?.({ id, method: value.method, params: value.params });
      return;
    }
    this.notificationMethods.add(value.method);
    this.notificationHandler?.({ method: value.method, params: value.params });
  }

  private fail(error: Error): void {
    if (this.closed || this.failure) return;
    this.failure = new Error(`App-server transport closed: ${error.message}`);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.failure);
    }
    this.pending.clear();
    this.failureHandler?.(this.failure);
  }
}
