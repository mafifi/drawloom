import { z } from "zod";
import {
  AgentOperationInputSchema,
  AgentApprovalResolutionSchema,
  AgentInputResolutionSchema,
} from "@drawloom/agent";
import type { WorkflowContext } from "./index.js";

// Ordinary typed task definitions: native session objects never enter workflow state.
const id = z.string().min(1);
const operation = z.strictObject({ sessionId: id, operationId: id });
const receipt = z.strictObject({
  sessionId: id,
  operationId: id,
  fingerprint: z.string(),
  status: z.enum([
    "submitting",
    "running",
    "completed",
    "failed",
    "interrupted",
    "unknown",
    "denied",
  ]),
});
export const agentTasks = {
  create: { id: "agent.create", version: "1", input: id, output: id },
  submit: {
    id: "agent.submit",
    version: "1",
    input: z.strictObject({
      sessionId: id,
      operation: AgentOperationInputSchema,
    }),
    output: receipt,
  },
  inspect: {
    id: "agent.inspect",
    version: "1",
    input: operation,
    output: receipt,
  },
  result: {
    id: "agent.result",
    version: "1",
    input: operation,
    output: receipt,
  },
  steer: {
    id: "agent.steer",
    version: "1",
    input: z.strictObject({
      sessionId: id,
      operation: AgentOperationInputSchema,
    }),
    output: z.null(),
  },
  interrupt: {
    id: "agent.interrupt",
    version: "1",
    input: operation,
    output: z.null(),
  },
  resolveApproval: {
    id: "agent.resolveApproval",
    version: "1",
    input: z.strictObject({
      sessionId: id,
      resolution: AgentApprovalResolutionSchema,
    }),
    output: z.null(),
  },
  respondToInput: {
    id: "agent.respondToInput",
    version: "1",
    input: z.strictObject({
      sessionId: id,
      resolution: AgentInputResolutionSchema,
    }),
    output: z.null(),
  },
};
/** Authoring convenience only. Every effect uses a named serializable task. */
export function ownedAgents(context: WorkflowContext) {
  return {
    create: (step: string, name: string) =>
      context.task(step, agentTasks.create, name),
    submit: (step: string, input: z.infer<typeof agentTasks.submit.input>) =>
      context.task(step, agentTasks.submit, input),
    inspect: (step: string, input: z.infer<typeof operation>) =>
      context.task(step, agentTasks.inspect, input),
    result: (step: string, input: z.infer<typeof operation>) =>
      context.task(step, agentTasks.result, input),
    steer: (step: string, input: z.infer<typeof agentTasks.steer.input>) =>
      context.task(step, agentTasks.steer, input),
    interrupt: (step: string, input: z.infer<typeof operation>) =>
      context.task(step, agentTasks.interrupt, input),
    resolveApproval: (
      step: string,
      input: z.infer<typeof agentTasks.resolveApproval.input>,
    ) => context.task(step, agentTasks.resolveApproval, input),
    respondToInput: (
      step: string,
      input: z.infer<typeof agentTasks.respondToInput.input>,
    ) => context.task(step, agentTasks.respondToInput, input),
  };
}
