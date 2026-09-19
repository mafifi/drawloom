import { expect, test } from "bun:test";
import { createContinuationAdmission } from "./continuation-admission.js";

test("native continuation receives new ownership only after source verification", async () => {
  const state: { active?: string } = {};
  const events: string[] = [];
  const admit = createContinuationAdmission({
    running: () => true,
    state: () => state,
    verify: async () => {
      events.push("verified");
    },
    begin: () => {
      events.push("begun");
    },
  });
  const result = await admit();
  expect(result.status).toBe("ok");
  expect(events).toEqual(["verified", "begun"]);
  expect(state.active).toBeDefined();
  expect((await admit()).status).toBe("rejected");
});
test("shutdown during verification prevents native continuation admission", async () => {
  const state: { active?: string } = {};
  let running = true;
  let begun = false;
  const result = await createContinuationAdmission({
    running: () => running,
    state: () => state,
    verify: async () => {
      running = false;
    },
    begin: () => {
      begun = true;
    },
  })();
  expect(result.status).toBe("rejected");
  expect(state.active).toBeUndefined();
  expect(begun).toBe(false);
});
