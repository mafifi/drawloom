import {
  AuthZenEntitySchema,
  AuthorizationResultSchema,
  type Authorizer,
  type AuthZenEntity,
  type AuthorizationEvaluationOptions,
} from "@drawloom/authorization";
import {
  IntakeInputSchema,
  SearchRequestSchema,
  EvidenceRequestSchema,
  KnowledgeExportRequestSchema,
  type KnowledgeRecord,
  type KnowledgeLink,
  type RecordRef,
} from "@drawloom/knowledge";
import type { LearningService } from "@drawloom/knowledge/learning";

/** Bounded public synthetic consumer, not a durable storage replacement. No setup,
 * downloads, background work or model calls. All data belongs to one fixture scope.
 * It rejects oversized requests rather than pretending a truncated page is complete. */
export function createDeterministicLearningService(options: {
  subject: AuthZenEntity;
  authorizer: Authorizer;
}): LearningService {
  const subject = AuthZenEntitySchema.parse(options.subject);
  const records = new Map<string, KnowledgeRecord>();
  // Current revision identity survives deletion independently of retained bodies.
  const current = new Map<string, RecordRef>();
  const fingerprints = new Map<string, string>();
  const links = new Map<string, KnowledgeLink>();
  let closed = false;
  const identity = (ref: RecordRef) => JSON.stringify([ref.type, ref.origin, ref.id]);
  const key = (ref: RecordRef) => JSON.stringify([ref.type, ref.origin, ref.id, ref.revision]);
  const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const failed = (
    code:
      | "invalid"
      | "too_large"
      | "unavailable"
      | "cancelled"
      | "budget_exhausted"
      | "rejected"
      | "malformed_result",
  ) => ({ kind: "failure" as const, code });
  const stopped = (operation?: AuthorizationEvaluationOptions) => {
    if (closed) return failed("unavailable");
    if (operation?.signal.aborted) return failed("cancelled");
    if (operation) {
      let remaining = 0;
      try {
        remaining = operation.remainingMs();
      } catch {}
      if (!Number.isFinite(remaining) || remaining <= 0) return failed("budget_exhausted");
    }
    return undefined;
  };
  async function permitted(action: string, operation?: AuthorizationEvaluationOptions) {
    const stop = stopped(operation);
    if (stop) return stop;
    const deadline = Date.now() + 2000;
    const evaluation = operation ?? {
      signal: new AbortController().signal,
      remainingMs: () => deadline - Date.now(),
    };
    try {
      const result = AuthorizationResultSchema.safeParse(
        await options.authorizer.authorize(
          {
            subject: structuredClone(subject),
            action: { name: action },
            resource: {
              type: "learning-example",
              id: "synthetic-records",
              properties: { scope: "public-example" },
            },
          },
          evaluation,
        ),
      );
      const cancelled = stopped(evaluation);
      if (cancelled) return cancelled;
      if (!result.success) return failed("malformed_result");
      if (!("decision" in result.data)) return result.data;
      return result.data.decision ? undefined : { kind: "denied" as const };
    } catch {
      return stopped(evaluation) ?? failed("rejected");
    }
  }
  const material = (
    selected: KnowledgeRecord[],
    selectedLinks: KnowledgeLink[],
    maxBytes: number,
  ) => {
    const bytes = size({ records: selected, links: selectedLinks });
    return bytes > maxBytes
      ? failed("too_large")
      : {
          kind: "ok" as const,
          records: structuredClone(selected),
          links: structuredClone(selectedLinks),
          bytes,
        };
  };
  return {
    capabilities: {},
    async status() {
      return {
        availability: closed ? "unavailable" : "ready",
        message: "Synthetic example: data lasts only for this process.",
        retrieval: closed ? "unavailable" : "lexical",
      };
    },
    async ingest(raw, operation) {
      const refusal = await permitted("write", operation);
      if (refusal) return refusal;
      const parsed = IntakeInputSchema.safeParse(raw);
      if (!parsed.success) return failed("invalid");
      const input = parsed.data;
      const ref = input.operation === "delete" ? input.ref : input.record.ref;
      const id = identity(ref),
        at = current.get(id);
      if (at?.revision === ref.revision) {
        return fingerprints.get(id) === JSON.stringify(input)
          ? { kind: "duplicate", revision: ref.revision }
          : { kind: "conflict" };
      }
      if ((at?.revision ?? null) !== input.expectedRevision || records.has(key(ref)))
        return { kind: "conflict" };
      // Tombstones count toward the identity bound; deletion never resets CAS.
      if (!at && current.size >= 128) return failed("too_large");
      if (input.operation === "delete") {
        for (const [recordId, record] of records)
          if (identity(record.ref) === id) records.delete(recordId);
        for (const [linkId, link] of links)
          if (identity(link.from) === id || identity(link.to) === id) links.delete(linkId);
      } else {
        if (input.links.some((link) => key(link.from) !== key(ref) || !records.has(key(link.to))))
          return { kind: "conflict" };
        if (records.size >= 128 || links.size + input.links.length > 256)
          return failed("too_large");
        records.set(key(ref), structuredClone(input.record));
        for (const link of input.links) links.set(JSON.stringify(link), structuredClone(link));
      }
      current.set(id, structuredClone(ref));
      fingerprints.set(id, JSON.stringify(input));
      return { kind: "accepted", revision: ref.revision };
    },
    async search(raw, operation) {
      const refusal = await permitted("read", operation);
      if (refusal) return refusal;
      const parsed = SearchRequestSchema.safeParse(raw);
      if (!parsed.success) return failed("invalid");
      const request = parsed.data;
      if (request.cursor) return { kind: "invalid_cursor" };
      const words = request.query.toLowerCase().split(/\s+/u);
      const items = [...current.values()].flatMap((ref) => {
        const record = records.get(key(ref));
        return record?.status === "active" &&
          words.every((word) => record.body.toLowerCase().includes(word))
          ? [{ record, relevance: 1 }]
          : [];
      });
      const bytes = size(items);
      if (items.length > request.limit || bytes > request.maxBytes) return failed("too_large");
      return {
        kind: "ok",
        mode: "lexical",
        semantic: { status: "unavailable" },
        items: structuredClone(items),
        bytes,
      };
    },
    async evidence(raw, operation) {
      const refusal = await permitted("read", operation);
      if (refusal) return refusal;
      const parsed = EvidenceRequestSchema.safeParse(raw);
      if (!parsed.success) return failed("invalid");
      const request = parsed.data;
      if (request.cursor) return { kind: "invalid_cursor" };
      const selected = new Map<string, KnowledgeRecord>(),
        selectedLinks = new Map<string, KnowledgeLink>();
      let frontier = [key(request.root)];
      for (let depth = 0; depth <= request.maxDepth && frontier.length; depth++) {
        const next: string[] = [];
        for (const id of frontier) {
          if (selected.has(id)) continue;
          const record = records.get(id);
          if (!record) continue;
          selected.set(id, record);
          if (depth === request.maxDepth) continue;
          for (const [linkId, link] of links) {
            const from = request.direction === "forward" ? link.from : link.to;
            const to = request.direction === "forward" ? link.to : link.from;
            if (key(from) === id && records.has(key(to))) {
              selectedLinks.set(linkId, link);
              next.push(key(to));
            }
          }
        }
        frontier = next;
      }
      if (selected.size > request.maxRecords || selectedLinks.size > request.maxLinks)
        return failed("too_large");
      return material([...selected.values()], [...selectedLinks.values()], request.maxBytes);
    },
    async export(raw, operation) {
      const refusal = await permitted("read", operation);
      if (refusal) return refusal;
      const parsed = KnowledgeExportRequestSchema.safeParse(raw);
      if (!parsed.success) return failed("invalid");
      const request = parsed.data,
        selected = new Map<string, KnowledgeRecord>();
      for (const ref of request.refs) {
        const record = records.get(key(ref));
        if (record) selected.set(key(ref), record);
      }
      return material(
        [...selected.values()],
        [...links.values()].filter(
          (link) => selected.has(key(link.from)) && selected.has(key(link.to)),
        ),
        request.maxBytes,
      );
    },
    async close() {
      closed = true;
      records.clear();
      current.clear();
      fingerprints.clear();
      links.clear();
    },
  };
}
