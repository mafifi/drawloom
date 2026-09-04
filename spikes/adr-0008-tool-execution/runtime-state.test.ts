import { expect, test } from "bun:test";
import { z } from "zod";
import { describeFailure, ProofFailure } from "./runtime-state.ts";

test("failure reports retain only trusted assertions, never provider payloads", () => {
  const privatePayload = '{"providerThreadId":"private-sentinel","token":"private-value"}';
  for (const error of [new Error(privatePayload), privatePayload, { message: privatePayload },
    z.enum(["public"]).safeParse("private-value").error]) {
    const description = describeFailure(error);
    expect(description).not.toContain("private");
    expect(description).not.toContain("providerThreadId");
  }
  expect(describeFailure(new ProofFailure("Controlled assertion failed"))).toBe("Controlled assertion failed");
});
