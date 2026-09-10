import { agentTasks } from "./owned-agent.ts";
import { parse, StepFailure, type TaskContext } from "./contract.ts";
import type { createAgentBridge } from "./agent-bridge.ts";

type Bridge = ReturnType<typeof createAgentBridge>;
const cancellationSignals = new WeakMap<Bridge, WeakSet<AbortSignal>>();
function certain<T extends { status: string }>(receipt: T): T {
  if (receipt.status === "unknown" || receipt.status === "submitting")
    throw new StepFailure("unknown", "Agent outcome is unresolved");
  if (receipt.status === "denied")
    throw new StepFailure("denied", "Agent rejected the operation");
  if (receipt.status === "failed" || receipt.status === "interrupted")
    throw new StepFailure("invalid", "Agent operation did not complete");
  return receipt;
}
/** Host-selected bridge is already bound to the run; task input cannot choose owner. */
export async function dispatchAgentTask(
  bridge: Bridge,
  task: string,
  input: unknown,
  context: TaskContext,
): Promise<unknown> {
  if (context.taskVersion !== "1")
    throw new StepFailure("invalid", "Unregistered agent task version");
  const cancel = () => {
    void bridge.requestCancellation();
  };
  if (context.signal.aborted) {
    await bridge.requestCancellation();
    throw new StepFailure("unknown", "Agent task cancellation requested");
  }
  let bound = cancellationSignals.get(bridge);
  if (!bound) {
    bound = new WeakSet();
    cancellationSignals.set(bridge, bound);
  }
  if (!bound.has(context.signal)) {
    context.signal.addEventListener("abort", cancel, { once: true });
    bound.add(context.signal);
  }
  try {
    return await execute();
  } finally {
    if (context.signal.aborted) await bridge.requestCancellation();
  }
  async function execute(): Promise<unknown> {
    switch (task) {
      case "agent.create":
        return bridge.create(parse(agentTasks.create.input, input));
      case "agent.submit": {
        const value = parse(agentTasks.submit.input, input);
        return certain(await bridge.submit(value.sessionId, value.operation));
      }
      case "agent.inspect": {
        const value = parse(agentTasks.inspect.input, input);
        return bridge.inspect(value.sessionId, value.operationId);
      }
      case "agent.result": {
        const value = parse(agentTasks.result.input, input);
        return certain(await bridge.result(value.sessionId, value.operationId));
      }
      case "agent.steer": {
        const value = parse(agentTasks.steer.input, input);
        await bridge.steer(value.sessionId, value.operation);
        return null;
      }
      case "agent.interrupt": {
        const value = parse(agentTasks.interrupt.input, input);
        await bridge.interrupt(value.sessionId, value.operationId);
        return null;
      }
      case "agent.resolveApproval": {
        const value = parse(agentTasks.resolveApproval.input, input);
        await bridge.resolveApproval(value.sessionId, value.resolution);
        return null;
      }
      case "agent.respondToInput": {
        const value = parse(agentTasks.respondToInput.input, input);
        await bridge.respondToInput(value.sessionId, value.resolution);
        return null;
      }
      default:
        throw new StepFailure("invalid", "Unregistered agent task");
    }
  }
}
