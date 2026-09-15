import { test, expect } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopAssessment, evaluationCodexCommand } from "./evaluation-assessment.js";
import type { RpcTransport, RpcMessage } from "@drawloom/host";

test("native rubric is opt-in and configuring it does not start a session", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-evaluation-settings-"));
  let connections = 0;
  const options = {
    dataDirectory: root,
    scope: { installationId: "documents", projectId: "first" },
    workingDirectory: root,
    connect: async () => {
      connections++;
      throw Error("No session should open during configuration");
    },
  };
  try {
    const deterministic = await createDesktopAssessment(options);
    expect(deterministic.scorers?.map((s) => s.id)).not.toContain("drawloom.agent-rubric");
    const native = await createDesktopAssessment({ ...options, model: "configured-small-model" });
    expect(native.scorers?.map((s) => s.id)).toContain("drawloom.agent-rubric");
    expect(connections).toBe(0);
    expect(await readdir(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("judge command binds an explicit model without replacing native controls", () => {
  const command = evaluationCodexCommand("configured-small-model");
  expect(command.command).toBe("codex");
  expect(command.args).toContain('model="configured-small-model"');
  expect(command.args).toContain("mcp_servers={}");
  expect(command.args).toContain("plugins={}");
  expect(command.args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  for (const value of ["", "   ", "model\nextra", "x".repeat(257)])
    expect(() => evaluationCodexCommand(value)).toThrow();
});

test("same judge invocation in different owners cannot resume another owners native session", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-judge-owners-"));
  const requests: { method: string; params: unknown }[] = [];
  let ordinal = 0;
  const connect = async (): Promise<RpcTransport> => {
    const threadId = `owned-${++ordinal}`;
    let emit: (message: RpcMessage) => void = () => {};
    return {
      async request(method, params) {
        requests.push({ method, params });
        if (method === "initialize") return { userAgent: "codex/0.153.4" };
        if (method === "thread/start")
          return { thread: { id: threadId, cwd: root }, approvalsReviewer: "user" };
        if (method === "thread/resume" || method === "thread/read")
          throw Error("Another owner session must not be read or resumed");
        if (method === "turn/start") {
          setTimeout(() => {
            emit({
              method: "item/completed",
              params: {
                threadId,
                turnId: "turn",
                item: {
                  id: "answer",
                  type: "agentMessage",
                  phase: "final_answer",
                  text: '{"score":1,"explanation":"Matches the supplied criterion."}',
                },
              },
            });
            emit({
              method: "turn/completed",
              params: { threadId, turn: { id: "turn", status: "completed" } },
            });
          }, 0);
          return { turn: { id: "turn" } };
        }
        return {};
      },
      notify() {},
      respond() {},
      subscribe(listener) {
        emit = listener;
        return () => {
          emit = () => {};
        };
      },
      async close() {},
    };
  };
  try {
    for (const scope of [
      { installationId: "first", projectId: "one" },
      { installationId: "second", projectId: "one" },
      { installationId: "first", projectId: "two" },
    ]) {
      const assessment = await createDesktopAssessment({
        dataDirectory: root,
        workingDirectory: root,
        scope,
        model: "configured-small-model",
        connect,
      });
      const judge = assessment.scorers!.find((s) => s.id === "drawloom.agent-rubric")!;
      const result = await assessment.assess(
        judge,
        {
          input: "question",
          output: "answer",
          references: [],
          configuration: { rubric: "Answer the question." },
        },
        {
          runId: "same-run",
          invocationId: "same-invocation",
          operationId: "same-operation",
          signal: new AbortController().signal,
        },
      );
      expect(result.outcome).toBe("succeeded");
    }
    expect(requests.filter((r) => r.method === "thread/start")).toHaveLength(3);
    expect(
      requests.filter((r) => r.method === "thread/resume" || r.method === "thread/read"),
    ).toHaveLength(0);
    expect(requests.filter((r) => r.method === "thread/archive").map((r) => r.params)).toEqual([
      { threadId: "owned-1" },
      { threadId: "owned-2" },
      { threadId: "owned-3" },
    ]);
    for (const start of requests.filter((r) => r.method === "thread/start"))
      expect(start.params).toMatchObject({
        cwd: root,
        sandbox: "read-only",
        approvalPolicy: "on-request",
        approvalsReviewer: "user",
      });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
