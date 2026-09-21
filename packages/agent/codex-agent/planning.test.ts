import { expect, test } from "vitest";
import { recorded } from "./driver.test.js";
import { agentPlanningConformance } from "@drawloom/agent/planning-conformance";

test("scripted native planning runs shared supported and unsupported conformance", async () => {
  for (const supported of [true, false])
    await agentPlanningConformance(async () => {
      const f = recorded();
      const request = f.transport.request.bind(f.transport);
      f.transport.request = async (method, params) =>
        method === "collaborationMode/list" && supported
          ? {
              data: [
                { mode: "plan", model: "small-model" },
                { mode: "default", model: "small-model" },
              ],
            }
          : request(method, params);
      const opened = await f.driver.openSession({
        sessionId: "conformance",
        context: { text: "" },
        tools: { id: "none", tools: [] },
      });
      if (opened.status !== "ok") throw Error("open failed");
      return opened.value;
    }, supported);
});

test("native mode selection uses native presets without changing original input", async () => {
  const f = recorded();
  const request = f.transport.request.bind(f.transport);
  f.transport.request = async (method, params) =>
    method === "collaborationMode/list"
      ? {
          data: [
            { name: "Plan", mode: "plan", model: "small-model", reasoning_effort: "low" },
            { name: "Default", mode: "default", model: "small-model" },
          ],
        }
      : request(method, params);
  const opened = await f.driver.openSession({
    sessionId: "planning",
    context: { text: "Trusted context" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error("open failed");
  const s = opened.value;
  s.signals();
  expect(s.modes).toEqual(["default", "plan"]);
  expect(await s.execute({ operationId: "p", text: "Inspect first", mode: "plan" })).toEqual({
    status: "ok",
    value: { operationId: "p" },
  });
  expect(f.requests.find((r) => r.method === "turn/start")?.params).toMatchObject({
    collaborationMode: {
      mode: "plan",
      settings: { model: "small-model", reasoning_effort: "low", developer_instructions: null },
    },
    input: [{ type: "text", text: "Inspect first" }],
  });
  await s.close();
});

test("completed proposal replaces streamed text and ignores late deltas", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "proposal",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error();
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of opened.value.signals()) signals.push(signal);
  })();
  await opened.value.execute({ operationId: "p", text: "Inspect" });
  const params = { threadId: "private-thread", turnId: "private-turn", itemId: "proposal-private" };
  f.emit({ method: "item/plan/delta", params: { ...params, delta: "Draft" } });
  f.emit({
    method: "item/completed",
    params: {
      ...params,
      item: { type: "plan", id: "proposal-private", text: "Authoritative plan" },
    },
  });
  f.emit({ method: "item/plan/delta", params: { ...params, delta: " stale" } });
  await f.complete();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await opened.value.close();
  await drain;
  const proposals = signals.filter((s) => s.kind === "plan.proposed");
  expect(proposals).toHaveLength(2);
  expect(proposals[0]).toMatchObject({ operationId: "p", text: "Draft", state: "partial" });
  expect(proposals[1]).toMatchObject({
    operationId: "p",
    text: "Authoritative plan",
    state: "complete",
  });
  expect(proposals[0]?.proposalId).toBe(proposals[1]?.proposalId);
  expect(proposals[0]?.proposalId).not.toBe("proposal-private");
});

test("unsupported planning rejects before native submission", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "unsupported-plan",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error();
  opened.value.signals();
  expect(
    (await opened.value.execute({ operationId: "p", text: "Inspect", mode: "plan" })).status,
  ).toBe("rejected");
  expect(f.requests.some((r) => r.method === "turn/start")).toBe(false);
  await opened.value.close();
});
