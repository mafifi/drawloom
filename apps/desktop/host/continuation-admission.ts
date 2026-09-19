import type { AgentResult } from "@drawloom/agent";
export function createContinuationAdmission(options: {
  running(): boolean;
  state(): { active?: string } | undefined;
  verify(): Promise<void>;
  begin(operationId: string): void;
}) {
  return async (): Promise<AgentResult<{ operationId: string }>> => {
    const denied = (): AgentResult<{ operationId: string }> => ({
      status: "rejected",
      failure: {
        code: "provider_unavailable",
        message: "Native continuation could not be bound to an available conversation",
      },
    });
    const state = options.state();
    if (!state || state.active || !options.running()) return denied();
    try {
      await options.verify();
    } catch {
      return denied();
    }
    if (options.state() !== state || state.active || !options.running()) return denied();
    const operationId = crypto.randomUUID();
    state.active = operationId;
    try {
      options.begin(operationId);
    } catch {
      delete state.active;
      return denied();
    }
    return { status: "ok", value: { operationId } };
  };
}
