import { test, expect } from "bun:test";
import { AuthZenRequestSchema, AuthorizationResultSchema } from "./src/index.js";
test("request byte bound counts UTF-8 and result rejects unknown affirmative fields", () => {
  const request = {
    subject: { type: "user", id: "owner", properties: {} },
    action: { name: "read" },
    resource: { type: "record", id: "one", properties: { text: "é".repeat(33000) } },
  };
  expect(AuthZenRequestSchema.safeParse(request).success).toBe(false);
  expect(AuthorizationResultSchema.safeParse({ decision: true, code: "unavailable" }).success).toBe(
    false,
  );
});
