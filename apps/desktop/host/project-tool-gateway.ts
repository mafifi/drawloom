import type { ToolEvidence, ToolResult } from "@drawloom/tools";

type ForegroundOwner = {
  conversationId: string;
  projectId?: string;
  workbenchId: string;
};

export function createProjectToolGatewayAccess(options: {
  projectId: string;
  workbenchIds: readonly string[];
  grants: ReadonlyMap<string, ReadonlySet<string>>;
  ownerForOperation(operationId: string): ForegroundOwner | undefined;
  evidenceFor(conversationId: string): Promise<{ record(record: ToolEvidence): Promise<void> }>;
  recoveryFor(conversationId: string): Promise<{ record(result: ToolResult): Promise<void> }>;
}) {
  function owner(operationId: string | undefined) {
    if (!operationId) return undefined;
    const current = options.ownerForOperation(operationId);
    return current &&
      current.projectId === options.projectId &&
      options.workbenchIds.includes(current.workbenchId)
      ? current
      : undefined;
  }

  return {
    allowed(operationId: string, toolName: string) {
      const current = owner(operationId);
      return Boolean(current && options.grants.get(current.workbenchId)?.has(toolName));
    },
    async record(record: ToolEvidence) {
      const operationId =
        record.kind === "started" ? record.operationId : record.result.operationId;
      const current = owner(operationId);
      if (!current) throw Error("No active operation owns this tool invocation");
      await (await options.evidenceFor(current.conversationId)).record(record);
      if (record.kind === "finished")
        await (await options.recoveryFor(current.conversationId)).record(record.result);
    },
  };
}
