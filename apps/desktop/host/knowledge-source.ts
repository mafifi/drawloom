import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { GitBatchSchema } from "@drawloom/git-knowledge-source/protocol";
import type { ToolDefinition } from "@drawloom/tools";
import type { InstalledGitKnowledgeFeed } from "./knowledge-host.js";

type Presentation = { name: string; origin: string; ownerId: string; available: boolean };

export function createInstalledGitKnowledgeFeed(options: {
  projectId: string;
  tools: readonly ToolDefinition[];
  presentation: ReadonlyMap<string, Presentation>;
}): InstalledGitKnowledgeFeed {
  const candidates = [...options.presentation].filter(([, value]) => value.available && (value.name === "git.changes" || value.name === "git.acknowledge"));
  const pairs = candidates.flatMap(([changesName, changes]) => changes.name !== "git.changes" ? [] : candidates
    .filter(([, acknowledgement]) => acknowledgement.name === "git.acknowledge" && acknowledgement.ownerId === changes.ownerId && acknowledgement.origin === changes.origin)
    .map(([acknowledgeName]) => ({ changesName, acknowledgeName, identity: changes })));
  if (pairs.length !== 1) throw Error("Installed Git knowledge source unavailable");
  const pair = pairs[0]!;
  const changes = options.tools.find((tool) => tool.name === pair.changesName);
  const acknowledge = options.tools.find((tool) => tool.name === pair.acknowledgeName);
  if (!changes || !acknowledge) throw Error("Installed Git knowledge source unavailable");
  const sourceId = `git:${createHash("sha256").update(JSON.stringify([options.projectId, pair.identity.ownerId, pair.identity.origin])).digest("hex").slice(0, 48)}`;
  async function invoke(tool: ToolDefinition, value: unknown) {
    const input = tool.parseInput(value);
    const output = await tool.execute(input, { invocationId: randomUUID(), operationId: `knowledge-source:${sourceId}`, signal: new AbortController().signal });
    return z.record(z.string(), z.unknown()).parse(tool.parseOutput(output));
  }
  return {
    sourceId,
    async changes() {
      const result = await invoke(changes, {});
      return GitBatchSchema.parse(result.structuredContent);
    },
    async acknowledge(token) { await invoke(acknowledge, { token }); },
  };
}
