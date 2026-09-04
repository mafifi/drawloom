import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { CodexSpikeDriver } from "./adapter.ts";
import { StdioCodexTransport } from "./app-server-client.ts";
import type {
  AgentSession,
  AgentSessionSignal,
  CompiledContext,
} from "./contract.ts";
import { inspectProtocolSchema } from "./protocol.ts";

type GateName =
  | "protocol"
  | "memoryAndContext"
  | "singleOperationAndOrdering"
  | "steering"
  | "interruption"
  | "approval"
  | "requestedInput"
  | "multiplePendingInteractions"
  | "safeObservations"
  | "providerDelegation"
  | "privateResume"
  | "toolBoundary"
  | "cleanup";

type GateResults = Record<GateName, boolean>;

const gates: GateResults = {
  protocol: false,
  memoryAndContext: false,
  singleOperationAndOrdering: false,
  steering: false,
  interruption: false,
  approval: false,
  requestedInput: false,
  multiplePendingInteractions: false,
  safeObservations: false,
  providerDelegation: false,
  privateResume: false,
  toolBoundary: false,
  cleanup: false,
};

const requireExecutable = (name: string): string => {
  const executable = Bun.which(name);
  if (!executable) throw new Error(`${name} executable not found`);
  return executable;
};

const assertEvidence: (
  condition: unknown,
  message: string,
) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(`Evidence gate failed: ${message}`);
};

const context = (name: string, value: string): CompiledContext => ({
  [`drawloom.${name}`]: { kind: "application", value },
});

const isTerminal = (signal: AgentSessionSignal): boolean =>
  signal.kind === "operation.completed" ||
  signal.kind === "operation.failed" ||
  signal.kind === "operation.interrupted";

const nextWithTimeout = async (
  iterator: AsyncIterator<AgentSessionSignal>,
): Promise<IteratorResult<AgentSessionSignal>> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Timed out waiting for an agent signal")),
          180_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const collectUntilTerminal = async (
  iterator: AsyncIterator<AgentSessionSignal>,
  onSignal?: (signal: AgentSessionSignal) => Promise<void>,
): Promise<AgentSessionSignal[]> => {
  const signals: AgentSessionSignal[] = [];
  while (true) {
    const next = await nextWithTimeout(iterator);
    assertEvidence(!next.done, "signal stream closed before terminal outcome");
    signals.push(next.value);
    await onSignal?.(next.value);
    if (isTerminal(next.value)) return signals;
  }
};

const completedText = (signals: readonly AgentSessionSignal[]): string =>
  signals
    .filter(
      (
        signal,
      ): signal is Extract<AgentSessionSignal, { kind: "message.completed" }> =>
        signal.kind === "message.completed",
    )
    .map((signal) => signal.text)
    .join("\n");

const openSession = async (
  codex: string,
  cwd: string,
  continuityStore: Map<string, string>,
  bun: string,
): Promise<{
  readonly session: AgentSession;
  readonly iterator: AsyncIterator<AgentSessionSignal>;
  readonly transport: StdioCodexTransport;
}> => {
  const transport = new StdioCodexTransport(codex, cwd);
  await transport.initialize("drawloom-adr-0007-evidence-spike");
  const driver = new CodexSpikeDriver({ transport, continuityStore, cwd });
  const opened = await driver.openSession({
    sessionId: "drawloom-session",
    context: context("session", "SESSION_CONTEXT_SENTINEL_7A91"),
    tools: {
      mcpServers: {
        drawloom_adr_0007: {
          command: bun,
          args: [join(import.meta.dir, "mcp-interaction-server.ts")],
          default_tools_approval_mode: "approve",
          required: true,
        },
      },
    },
  });
  assertEvidence(opened.status === "ok", "Codex session did not open");
  const session = opened.value;
  return {
    session,
    iterator: session.signals()[Symbol.asyncIterator](),
    transport,
  };
};

const codex = requireExecutable("codex");
const bun = requireExecutable("bun");
const runtimeDirectory = await mkdtemp(
  join(tmpdir(), "drawloom-adr-0007-codex-"),
);
const deniedWritePath = join(
  tmpdir(),
  `${basename(runtimeDirectory)}-must-not-be-created`,
);
const schemaDirectory = join(runtimeDirectory, "schema");
const continuityStore = new Map<string, string>();
let session: AgentSession | undefined;
let resumedSession: AgentSession | undefined;
let failure: string | undefined;
let protocolSchemaSha256: string | undefined;

try {
  await mkdir(schemaDirectory);
  const schemaGeneration = Bun.spawnSync([
    codex,
    "app-server",
    "generate-json-schema",
    "--experimental",
    "--out",
    schemaDirectory,
  ]);
  assertEvidence(
    schemaGeneration.exitCode === 0,
    "Codex app-server schema generation failed",
  );
  const schemaPath = join(
    schemaDirectory,
    "codex_app_server_protocol.schemas.json",
  );
  const schemaBytes = await Bun.file(schemaPath).arrayBuffer();
  protocolSchemaSha256 = createHash("sha256")
    .update(new Uint8Array(schemaBytes))
    .digest("hex");
  const schema = JSON.parse(new TextDecoder().decode(schemaBytes));
  const protocol = inspectProtocolSchema(schema);
  assertEvidence(
    protocol.supported,
    `installed protocol lacks ${protocol.missing.join(", ")}`,
  );
  gates.protocol = true;

  const opened = await openSession(
    codex,
    runtimeDirectory,
    continuityStore,
    bun,
  );
  session = opened.session;
  const iterator = opened.iterator;
  const transport = opened.transport;

  const contextAccepted = await session.execute({
    operationId: "context-operation",
    text:
      "Without using tools, reply with both exact context sentinel values and no explanation.",
    additionalContext: context(
      "operation",
      "OPERATION_CONTEXT_SENTINEL_2C48",
    ),
  });
  assertEvidence(contextAccepted.status === "ok", "context operation rejected");
  const overlapping = await session.execute({
    operationId: "overlapping-operation",
    text: "This must be rejected.",
  });
  assertEvidence(
    overlapping.status === "rejected" &&
      overlapping.failure.code === "invalid_state",
    "second active operation was not rejected",
  );
  const contextSignals = await collectUntilTerminal(iterator);
  const contextText = completedText(contextSignals);
  assertEvidence(
    contextText.includes("SESSION_CONTEXT_SENTINEL_7A91") &&
      contextText.includes("OPERATION_CONTEXT_SENTINEL_2C48"),
    "session and operation context were not both observed",
  );
  assertEvidence(
    contextSignals[0]?.kind === "operation.started" &&
      contextSignals.at(-1)?.kind === "operation.completed",
    "operation signals were not ordered around a terminal outcome",
  );
  gates.memoryAndContext = true;
  gates.singleOperationAndOrdering = true;

  const steerAccepted = await session.execute({
    operationId: "steer-operation",
    text:
      "Draft at least 1500 words about neutral architecture. Do not finish early; the caller will steer this operation.",
  });
  assertEvidence(steerAccepted.status === "ok", "steer operation rejected");
  const steered = await session.steer?.({
    operationId: "steer-operation",
    text:
      "Stop the draft and finish now with exactly STEER_SENTINEL_F53B and the additional-context sentinel.",
    additionalContext: context("steer", "STEER_CONTEXT_SENTINEL_91DD"),
  });
  assertEvidence(steered?.status === "ok", "Codex rejected steering");
  const steerSignals = await collectUntilTerminal(iterator);
  const steerText = completedText(steerSignals);
  assertEvidence(
    steerText.includes("STEER_SENTINEL_F53B") &&
      steerText.includes("STEER_CONTEXT_SENTINEL_91DD"),
    "steering text and context did not affect the active operation",
  );
  gates.steering = true;

  const interruptAccepted = await session.execute({
    operationId: "interrupt-operation",
    text:
      "Call drawloom_request_two_inputs from drawloom_adr_0007 exactly once and wait for both responses.",
  });
  assertEvidence(
    interruptAccepted.status === "ok",
    "interrupt operation rejected",
  );
  let interruptedInputId: string | undefined;
  const interruptSignals = await collectUntilTerminal(iterator, async (signal) => {
    if (signal.kind !== "input.requested" || interruptedInputId) return;
    interruptedInputId = signal.request.requestId;
    const interrupted = await session!.interrupt?.("interrupt-operation");
    assertEvidence(interrupted?.status === "ok", "Codex rejected interruption");
  });
  assertEvidence(
    interruptedInputId !== undefined &&
      interruptSignals.at(-1)?.kind === "operation.interrupted",
    "interruption did not preserve its terminal signal",
  );
  const staleInput = await session.respondToInput({
    requestId: interruptedInputId,
    action: "cancel",
  });
  assertEvidence(
    staleInput.status === "rejected" &&
      staleInput.failure.code === "invalid_interaction",
    "interruption did not invalidate its pending interaction",
  );
  gates.interruption = true;

  const pendingInputs: Array<
    Extract<AgentSessionSignal, { kind: "input.requested" }>["request"]
  > = [];
  const inputSignals: AgentSessionSignal[] = [];
  for (let attempt = 1; attempt <= 3 && pendingInputs.length !== 2; attempt += 1) {
    pendingInputs.splice(0);
    const inputAccepted = await session.execute({
      operationId: `input-operation-${attempt}`,
      text:
        "You must call drawloom_request_two_inputs from drawloom_adr_0007 exactly once. Do not describe or simulate it. Wait for both responses, then report the tool acknowledgement.",
    });
    assertEvidence(inputAccepted.status === "ok", "input operation rejected");
    inputSignals.push(
      ...(await collectUntilTerminal(iterator, async (signal) => {
        if (signal.kind !== "input.requested") return;
        pendingInputs.push(signal.request);
        if (pendingInputs.length !== 2) return;
        for (const [index, request] of pendingInputs.entries()) {
          const resolved = await session!.respondToInput({
            requestId: request.requestId,
            action: "submit",
            value: { value: index === 0 ? "first-value" : "second-value" },
          });
          assertEvidence(resolved.status === "ok", "input response was rejected");
        }
      })),
    );
  }
  assertEvidence(
    pendingInputs.length === 2 &&
      new Set(pendingInputs.map((request) => request.requestId)).size === 2,
    "two independently correlated input requests were not pending together",
  );
  assertEvidence(
    inputSignals.filter((signal) => signal.kind === "input.resolved").length ===
      2,
    "both input resolutions were not signalled",
  );
  gates.requestedInput = true;
  gates.multiplePendingInteractions = true;

  let approvalOptions: readonly string[] = [];
  for (let attempt = 1; attempt <= 3 && approvalOptions.length === 0; attempt += 1) {
    const approvalAccepted = await session.execute({
      operationId: `approval-operation-${attempt}`,
      text: `You must use the terminal tool, not prose, to run exactly: touch ${deniedWritePath}. Set sandbox_permissions to require_escalated so the command must be presented for approval. Wait for the decision; if declined, do not retry and finish briefly.`,
    });
    assertEvidence(approvalAccepted.status === "ok", "approval operation rejected");
    await collectUntilTerminal(iterator, async (signal) => {
      if (signal.kind !== "approval.requested") return;
      approvalOptions = signal.request.options.map((option) => option.optionId);
      const deny = signal.request.options.find(
        (option) =>
          option.optionId === "decline" ||
          option.optionId === "cancel" ||
          option.optionId === "denied" ||
          option.optionId === "abort",
      );
      assertEvidence(deny, "approval did not preserve a deny choice");
      const resolved = await session!.resolveApproval({
        approvalId: signal.request.approvalId,
        optionId: deny.optionId,
      });
      assertEvidence(resolved.status === "ok", "approval response was rejected");
    });
  }
  assertEvidence(
    approvalOptions.length >= 2 &&
      approvalOptions.some((option) =>
        ["decline", "cancel", "denied", "abort"].includes(option),
      ),
    `Codex approval choices were not preserved losslessly; observed server request methods: ${transport.diagnostics().serverRequestMethods.join(", ") || "none"}`,
  );
  assertEvidence(
    !(await Bun.file(deniedWritePath).exists()),
    "declined command unexpectedly wrote the file",
  );
  gates.approval = true;

  const delegationSignals: AgentSessionSignal[] = [];
  const delegationSentinel = "DELEGATION_SENTINEL_7F2A";
  for (
    let attempt = 1;
    attempt <= 3 && !gates.providerDelegation;
    attempt += 1
  ) {
    const delegationAccepted = await session.execute({
      operationId: `delegation-operation-${attempt}`,
      text:
        `Use the provider-native spawn_agent tool exactly once to delegate a tiny task. ` +
        `Ask the child to return exactly ${delegationSentinel}. Wait for it, then include ` +
        `that exact sentinel in your final response. Do not use MCP or terminal tools.`,
    });
    assertEvidence(
      delegationAccepted.status === "ok",
      "delegation operation rejected",
    );
    const attemptSignals = await collectUntilTerminal(iterator);
    delegationSignals.push(...attemptSignals);
    gates.providerDelegation =
      attemptSignals.some(
        (signal) =>
          signal.kind === "provider.observation" &&
          signal.name === "delegation",
      ) && completedText(attemptSignals).includes(delegationSentinel);
  }
  assertEvidence(
    gates.providerDelegation,
    "Codex did not expose completed provider-native delegation through the bounded adapter observation",
  );

  const continuityMarker = "PRIVATE_CONTINUITY_SENTINEL_44C2";
  const rememberAccepted = await session.execute({
    operationId: "remember-operation",
    text: `Remember ${continuityMarker} in this thread transcript, then reply ACK.`,
  });
  assertEvidence(rememberAccepted.status === "ok", "continuity setup rejected");
  const observationSignals = [
    ...contextSignals,
    ...steerSignals,
    ...inputSignals,
    ...delegationSignals,
    ...(await collectUntilTerminal(iterator)),
  ];
  assertEvidence(
    observationSignals.some(
      (signal) =>
        signal.kind === "provider.observation" &&
        (signal.name === "usage" || signal.name === "reasoning-summary"),
    ),
    "Codex emitted no bounded usage or reasoning observation",
  );
  assertEvidence(
    observationSignals
      .filter((signal) => signal.kind === "provider.observation")
      .every(
        (signal) =>
          Object.keys(signal).every((key) =>
            ["kind", "operationId", "name", "summary", "evidence"].includes(
              key,
            ),
          ),
      ),
    "a provider observation exposed an unbounded field",
  );
  gates.safeObservations = true;

  await session.close();
  session = undefined;

  const resumed = await openSession(
    codex,
    runtimeDirectory,
    continuityStore,
    bun,
  );
  resumedSession = resumed.session;
  const resumedAccepted = await resumedSession.execute({
    operationId: "resume-operation",
    text:
      "Reply with the exact private continuity marker I asked you to remember earlier in this thread.",
  });
  assertEvidence(resumedAccepted.status === "ok", "resumed operation rejected");
  const resumeSignals = await collectUntilTerminal(resumed.iterator);
  assertEvidence(
    completedText(resumeSignals).includes(continuityMarker),
    "adapter-private thread resume did not preserve transcript continuity",
  );
  gates.privateResume = true;

  const toolSpike = Bun.spawnSync(
    [bun, "run", join(import.meta.dir, "../adr-0005-tool-exposure/run-live-spike.ts")],
    { cwd: runtimeDirectory, stdout: "pipe", stderr: "pipe" },
  );
  assertEvidence(
    toolSpike.exitCode === 0,
    "retained MCP tool-boundary spike failed",
  );
  gates.toolBoundary = true;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  let archivedThread = false;
  let removedRuntimeArtifacts = false;
  try {
    await session?.close();
    await resumedSession?.close();
  } catch {
    failure ??= "Evidence cleanup failed while closing an adapter session.";
    process.exitCode = 1;
  }
  const providerThreadId = continuityStore.get("drawloom-session");
  if (providerThreadId) {
    const cleanupTransport = new StdioCodexTransport(codex, runtimeDirectory);
    try {
      await cleanupTransport.initialize("drawloom-adr-0007-cleanup");
      await cleanupTransport.request("thread/archive", {
        threadId: providerThreadId,
      });
      archivedThread = true;
    } catch {
      failure ??= "Evidence cleanup failed while archiving the Codex thread.";
      process.exitCode = 1;
    } finally {
      try {
        await cleanupTransport.close();
      } catch {
        failure ??= "Evidence cleanup failed while closing cleanup transport.";
        process.exitCode = 1;
      }
    }
  }
  try {
    await rm(runtimeDirectory, { recursive: true, force: true });
    await rm(deniedWritePath, { force: true });
    removedRuntimeArtifacts = true;
  } catch {
    failure ??= "Evidence cleanup failed while removing runtime artifacts.";
    process.exitCode = 1;
  }
  gates.cleanup = archivedThread && removedRuntimeArtifacts;
}

const codexVersion = new TextDecoder()
  .decode(Bun.spawnSync([codex, "--version"]).stdout)
  .trim();

console.log(
  JSON.stringify(
    {
      status: Object.values(gates).every(Boolean) ? "passed" : "failed",
      environment: {
        bun: Bun.version,
        codex: codexVersion,
        protocolSchemaSha256,
      },
      gates,
      ...(failure ? { failure } : {}),
    },
    null,
    2,
  ),
);
