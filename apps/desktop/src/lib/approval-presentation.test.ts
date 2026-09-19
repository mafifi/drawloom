import { expect, test } from "bun:test";
import { approvalCard } from "./approval-presentation.js";

const entry = {
  presentationId: "surface",
  conversationId: "c",
  request: {
    approvalId: "a",
    operationId: "op",
    summary: "Native question",
    options: [{ optionId: "native", label: "Allow once" }],
  },
  surface: "pending" as const,
  submitting: false,
  presentation: "desktop" as const,
};
test("known native tool aliases get readable labels without altering the native question or choices", () => {
  const request = {
    ...entry.request,
    summary: 'Allow the drawloom MCP server to run tool "pkg_123"?',
  };
  const card = approvalCard({ ...entry, request }, undefined, false, undefined, [
    { toolName: "pkg_123", title: "Render graphics", origin: "motion" },
  ]);
  expect(card.summary).toBe('Allow the drawloom MCP server to run tool "Render graphics"?');
  expect(card.details).toContain(request.summary);
  expect(card.options[0]?.optionId).toBe("native");
  expect(approvalCard({ ...entry, request }, undefined, false).summary).toBe(request.summary);
});
test("Stop feedback is scoped to the card lifetime for initial and overlapping actions", () => {
  const stop = {
    kind: "approval_surface" as const,
    conversationId: "c",
    approvalId: "a",
    presentationId: "surface",
    action: "stop" as const,
  };
  expect(approvalCard(entry, stop, true).stopping).toBe(true);
  expect(approvalCard(entry, stop, true).stopPendingLabel).toBe("Stopping");
  expect(approvalCard(entry, undefined, true, stop).stopping).toBe(true);
  expect(approvalCard({ ...entry, presentationId: "new" }, stop, true, stop).stopping).toBe(false);
  expect(approvalCard({ ...entry, conversationId: "other" }, stop, true, stop).stopping).toBe(
    false,
  );
});
test("approval presentation separates native choice from dismissed and failed recovery", () => {
  expect(approvalCard(entry, undefined, false).options).toEqual([
    { optionId: "native", label: "Allow once", pending: false },
  ]);
  for (const surface of ["dismissed", "failed"] as const) {
    const card = approvalCard({ ...entry, surface }, undefined, false);
    expect(card.options).toEqual([]);
    expect(card.reopen).toBe(true);
    expect(card.message).not.toBe("");
  }
  const external = approvalCard({ ...entry, presentation: "external" }, undefined, false);
  expect(external.options).toEqual([]);
  expect(external.message).toContain("another");
});
test("only selected native choice is pending; submitting disables duplicate choices", () => {
  const card = approvalCard(
    { ...entry, submitting: true },
    {
      kind: "approval",
      conversationId: "c",
      presentationId: "surface",
      resolution: { approvalId: "a", optionId: "native" },
    },
    true,
  );
  expect(card.options[0]?.pending).toBe(true);
  expect(card.disabled).toBe(true);
  expect(card.dismiss).toBe(false);
});
