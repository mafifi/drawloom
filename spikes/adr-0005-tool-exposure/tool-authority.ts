export type ActiveOperationGrant = {
  exposureId: string;
  grantId: string;
  operationId: string;
  allowedTools: readonly string[];
};

type ToolExposure = {
  exposureId: string;
  toolSetId: string;
  revision: string;
  tools: readonly {
    name: string;
    description: string;
  }[];
};

type ToolAuthorityOptions = {
  exposure: ToolExposure;
  readActiveGrant: () => Promise<ActiveOperationGrant>;
};

type ToolDecision =
  | {
      status: "allowed";
      exposureId: string;
      grantId: string;
      operationId: string;
      toolName: string;
      value: string;
    }
  | {
      status: "denied";
      exposureId: string;
      grantId: string;
      operationId: string;
      toolName: string;
      reason: "exposure_mismatch" | "tool_not_granted";
    };

export const createToolAuthority = ({
  exposure,
  readActiveGrant,
}: ToolAuthorityOptions) => {
  const catalogue = exposure.tools.map((tool) => ({ ...tool }));

  return {
    listTools: () => catalogue.map((tool) => ({ ...tool })),
    invoke: async (
      toolName: string,
      input: { value: string },
    ): Promise<ToolDecision> => {
      const grant = await readActiveGrant();
      const common = {
        exposureId: exposure.exposureId,
        grantId: grant.grantId,
        operationId: grant.operationId,
        toolName,
      };

      if (grant.exposureId !== exposure.exposureId) {
        return { status: "denied", ...common, reason: "exposure_mismatch" };
      }
      if (!grant.allowedTools.includes(toolName)) {
        return { status: "denied", ...common, reason: "tool_not_granted" };
      }
      return { status: "allowed", ...common, value: input.value };
    },
  };
};
