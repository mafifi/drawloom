import { describe, expect, test } from "bun:test";

import {
  createToolAuthority,
  type ActiveOperationGrant,
} from "./tool-authority";

describe("session exposure and operation grants", () => {
  test("changes execution authority without changing the exposed catalogue", async () => {
    let grant: ActiveOperationGrant = {
      exposureId: "exposure-1",
      grantId: "grant-1",
      operationId: "operation-1",
      allowedTools: ["drawloom_probe"],
    };
    const authority = createToolAuthority({
      exposure: {
        exposureId: "exposure-1",
        toolSetId: "probe-tools",
        revision: "1",
        tools: [
          {
            name: "drawloom_probe",
            description: "Return operation-correlated probe evidence.",
          },
        ],
      },
      readActiveGrant: async () => grant,
    });

    const initialCatalogue = authority.listTools();
    const allowed = await authority.invoke("drawloom_probe", { value: "alpha" });

    grant = {
      exposureId: "exposure-1",
      grantId: "grant-2",
      operationId: "operation-2",
      allowedTools: [],
    };

    const denied = await authority.invoke("drawloom_probe", { value: "beta" });

    expect(authority.listTools()).toEqual(initialCatalogue);
    expect(allowed).toEqual({
      status: "allowed",
      exposureId: "exposure-1",
      grantId: "grant-1",
      operationId: "operation-1",
      toolName: "drawloom_probe",
      value: "alpha",
    });
    expect(denied).toEqual({
      status: "denied",
      exposureId: "exposure-1",
      grantId: "grant-2",
      operationId: "operation-2",
      toolName: "drawloom_probe",
      reason: "tool_not_granted",
    });
  });

  test("fails closed when a grant belongs to another exposure", async () => {
    const authority = createToolAuthority({
      exposure: {
        exposureId: "exposure-1",
        toolSetId: "probe-tools",
        revision: "1",
        tools: [
          {
            name: "drawloom_probe",
            description: "Return operation-correlated probe evidence.",
          },
        ],
      },
      readActiveGrant: async () => ({
        exposureId: "exposure-other",
        grantId: "grant-1",
        operationId: "operation-1",
        allowedTools: ["drawloom_probe"],
      }),
    });

    await expect(
      authority.invoke("drawloom_probe", { value: "alpha" }),
    ).resolves.toEqual({
      status: "denied",
      exposureId: "exposure-1",
      grantId: "grant-1",
      operationId: "operation-1",
      toolName: "drawloom_probe",
      reason: "exposure_mismatch",
    });
  });
});
