import {
  AgentCommandFailureSchema,
  type AgentApprovalResolution,
  type AgentResult,
} from "@drawloom/agent";
import {
  ApprovalPresentationRequestSchema,
  type ApprovalPresentationRequest,
  type ApprovalPresenter,
  type ApprovalSurfaceState,
} from "@drawloom/agent/approval-presentation";

type Entry = {
  input: ApprovalPresentationRequest;
  surface: ApprovalSurfaceState;
  lifetime: AbortController;
  presentationId: string;
  retire?: (result: AgentResult<void>) => void;
  submitting: boolean;
};
const rejected = (): AgentResult<void> => ({
  status: "rejected",
  failure: {
    code: "invalid_interaction",
    message: "This approval is no longer available.",
  },
});
const unavailable = (): AgentResult<void> => ({
  status: "rejected",
  failure: {
    code: "provider_unavailable",
    message: "The approval response could not be delivered.",
  },
});

/** Owns presentation lifetime only; native adapter validates and resolves the approval. */
export function createApprovalPresentationHost(options: {
  presenter: ApprovalPresenter;
  owns(conversationId: string, operationId: string): boolean;
  resolve(conversationId: string, resolution: AgentApprovalResolution): Promise<AgentResult<void>>;
  stop(conversationId: string, operationId: string): Promise<AgentResult<void>>;
}) {
  const entries = new Map<string, Entry>();
  const key = (conversationId: string, approvalId: string) =>
    JSON.stringify([conversationId, approvalId]);
  const current = (entry: Entry, lifetime = entry.lifetime) =>
    entries.get(key(entry.input.conversationId, entry.input.request.approvalId)) === entry &&
    entry.lifetime === lifetime &&
    !lifetime.signal.aborted &&
    options.owns(entry.input.conversationId, entry.input.request.operationId);
  async function choose(
    entry: Entry,
    optionId: string,
    lifetime = entry.lifetime,
  ): Promise<AgentResult<void>> {
    if (
      !current(entry, lifetime) ||
      entry.surface !== "pending" ||
      entry.submitting ||
      !entry.input.request.options.some((option) => option.optionId === optionId)
    )
      return rejected();
    entry.submitting = true;
    try {
      const retired = new Promise<AgentResult<void>>((resolve) => {
        entry.retire = resolve;
      });
      const result = await Promise.race([
        retired,
        options.resolve(entry.input.conversationId, {
          approvalId: entry.input.request.approvalId,
          optionId,
        }),
      ]);
      // A native resolved event may remove this entry before resolve() returns.
      if (result?.status === "ok") return { status: "ok", value: undefined };
      const parsed = AgentCommandFailureSchema.safeParse(
        result?.status === "rejected" ? result.failure : undefined,
      );
      if (current(entry, lifetime)) entry.submitting = false;
      return parsed.success ? { status: "rejected", failure: parsed.data } : unavailable();
    } catch {
      if (current(entry, lifetime)) entry.submitting = false;
      return unavailable();
    } finally {
      delete entry.retire;
    }
  }
  async function stop(entry: Entry, lifetime = entry.lifetime): Promise<AgentResult<void>> {
    if (!current(entry, lifetime)) return rejected();
    try {
      return await options.stop(entry.input.conversationId, entry.input.request.operationId);
    } catch {
      return unavailable();
    }
  }
  function present(entry: Entry) {
    const lifetime = entry.lifetime;
    const failed = () => {
      if (current(entry, lifetime)) entry.surface = "failed";
    };
    try {
      const presentation = options.presenter.present(
        structuredClone(entry.input),
        {
          choose: (optionId) => choose(entry, optionId, lifetime),
          dismiss: () => {
            if (current(entry, lifetime)) entry.surface = "dismissed";
          },
          failed,
          stop: () => stop(entry, lifetime),
        },
        { signal: lifetime.signal },
      );
      void Promise.resolve(presentation).catch(failed);
    } catch {
      failed();
    }
  }
  return {
    admit(raw: ApprovalPresentationRequest) {
      const input = ApprovalPresentationRequestSchema.parse(raw);
      if (!options.owns(input.conversationId, input.request.operationId))
        throw Error("Approval has no active owner");
      const id = key(input.conversationId, input.request.approvalId);
      if (entries.has(id)) throw Error("Approval is already pending");
      const entry: Entry = {
        input,
        surface: "pending",
        lifetime: new AbortController(),
        presentationId: crypto.randomUUID(),
        submitting: false,
      };
      entries.set(id, entry);
      present(entry);
    },
    pending(conversationId: string) {
      return [...entries.values()]
        .filter((entry) => entry.input.conversationId === conversationId)
        .map((entry) => ({
          ...structuredClone(entry.input),
          surface: entry.surface,
          submitting: entry.submitting,
          presentationId: entry.presentationId,
        }));
    },
    represent(conversationId: string, approvalId: string, presentationId: string) {
      const entry = entries.get(key(conversationId, approvalId));
      if (
        !entry ||
        entry.presentationId !== presentationId ||
        !current(entry) ||
        entry.submitting ||
        entry.surface === "pending"
      )
        throw Error("Approval presentation is not available to reopen");
      entry.lifetime.abort();
      entry.lifetime = new AbortController();
      entry.presentationId = crypto.randomUUID();
      entry.surface = "pending";
      present(entry);
    },
    dismiss(conversationId: string, approvalId: string, presentationId: string) {
      const entry = entries.get(key(conversationId, approvalId));
      if (
        !entry ||
        entry.presentationId !== presentationId ||
        !current(entry) ||
        entry.submitting ||
        entry.surface !== "pending"
      )
        throw Error("Approval presentation is not available to dismiss");
      entry.surface = "dismissed";
    },
    choose(
      conversationId: string,
      approvalId: string,
      optionId: string,
      presentationId: string,
    ): Promise<AgentResult<void>> {
      const entry = entries.get(key(conversationId, approvalId));
      return entry && entry.presentationId === presentationId
        ? choose(entry, optionId)
        : Promise.resolve(rejected());
    },
    stop(conversationId: string, approvalId: string, presentationId: string) {
      const entry = entries.get(key(conversationId, approvalId));
      return entry && entry.presentationId === presentationId
        ? stop(entry)
        : Promise.resolve(rejected());
    },
    invalidate(conversationId: string, approvalId?: string, resolved = false) {
      for (const [id, entry] of entries) {
        if (
          entry.input.conversationId !== conversationId ||
          (approvalId !== undefined && entry.input.request.approvalId !== approvalId)
        )
          continue;
        entries.delete(id);
        entry.retire?.(resolved ? { status: "ok", value: undefined } : rejected());
        entry.lifetime.abort();
      }
    },
    close() {
      const active = [...entries.values()];
      entries.clear();
      for (const entry of active) {
        entry.retire?.(rejected());
        entry.lifetime.abort();
      }
    },
  };
}
