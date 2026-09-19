import type { ConversationHistoryStore } from "@drawloom/conversation-history";

/** A submission receipt, not another proposal store. No automatic replay after uncertainty. */
export async function reservePlanImplementation(
  store: ConversationHistoryStore,
  conversationId: string,
  proposalId: string,
) {
  const status = await store.status(conversationId);
  let before: string | undefined;
  let latest;
  do {
    const page = await store.page(conversationId, { limit: 200, ...(before ? { before } : {}) });
    latest = [...page.entries].reverse().find((entry) => entry.origin.kind === "proposal");
    before = page.hasOlder ? page.olderCursor : undefined;
  } while (!latest && before);
  if (!latest || latest.id !== proposalId)
    throw Error("Only the latest proposal can be implemented.");
  if (latest.state !== "complete" || !latest.text.trim())
    throw Error("Wait for a completed proposal before implementing.");
  if (await store.checkpoint(conversationId, "plan-implementation", proposalId))
    throw Error(
      "This proposal was already submitted or its submission is uncertain. Inspect the conversation; no retry occurred.",
    );
  await store.commit(conversationId, {
    expectedRevision: status.revision,
    checkpoints: [{ namespace: "plan-implementation", key: proposalId, value: { reserved: true } }],
  });
  return latest.text;
}
