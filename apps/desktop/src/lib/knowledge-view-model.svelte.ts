import {
  LearningCurationResultSchema,
  LearningControlResultSchema,
} from "@drawloom/knowledge/learning";
import { z } from "zod";
import type { LearningFeature } from "@drawloom/knowledge/consent";
import {
  SearchResultSchema,
  EvidenceResultSchema,
  KnowledgeExportResultSchema,
  type RecordRef,
  type SearchResult,
  type KnowledgeRecord,
  type KnowledgeLink,
} from "@drawloom/knowledge";
import {
  LearningCommandSchema,
  LearningStatusSchema,
  type LearningCommand,
  type LearningStatus,
} from "./learning-protocol.js";
import {
  knowledgeCopy,
  describeProcessing,
  type KnowledgePresentation,
  type KnowledgeActions,
} from "./knowledge-presentation.js";
import { telemetryFetch } from "./telemetry.js";
import { serializeKnowledgeExport } from "./knowledge-export.js";

async function send(command: LearningCommand, signal?: AbortSignal): Promise<unknown> {
  const response = await telemetryFetch("/api/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LearningCommandSchema.parse(command)),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw Error("Knowledge is unavailable. Refresh status for setup details.");
  return response.json();
}
function outcomeMessage(value: { kind: string; code?: string }): string {
  if (value.kind === "denied")
    return "You do not have permission to read or change this knowledge.";
  if (value.kind === "invalid_cursor" || value.kind === "invalidated")
    return "Knowledge changed. Start from the first page again.";
  if (value.code === "too_large")
    return "This evidence exceeds the page limit. Inspect a smaller part of the chain.";
  return "Knowledge is unavailable. Your existing records have not been replaced.";
}
const readableError = (cause: unknown) =>
  cause instanceof z.ZodError
    ? "Knowledge returned an unexpected response. Refresh status and try again."
    : cause instanceof Error
      ? cause.message
      : "Knowledge is unavailable.";
export function createKnowledgeViewModel(
  options: { send?: typeof send; download?: (text: string) => void } = {},
) {
  const request = options.send ?? send;
  let query = $state(""),
    results = $state<Extract<SearchResult, { kind: "ok" }>["items"]>([]);
  let evidence = $state<{ records: KnowledgeRecord[]; links: KnowledgeLink[] }>();
  let selected = $state<RecordRef>(),
    status = $state<LearningStatus>();
  let learningDraft = $state<{
    captureOutcomes: boolean;
    automaticContext: boolean;
    automaticCuration: boolean;
  }>();
  let error = $state(""),
    notice = $state(""),
    searchStatus = $state(""),
    searched = $state(false);
  let statusError = $state("");
  let manualConsent = $state(false);
  let searchPending = $state(false),
    evidencePending = $state(false),
    statusPending = $state(false),
    pendingAction = $state<string>();
  let resultCursor: string | undefined, evidenceCursor: string | undefined;
  let hasMoreResults = $state(false),
    hasMoreEvidence = $state(false);
  let epoch = 0,
    statusVersion = 0,
    searchVersion = 0,
    evidenceVersion = 0,
    searchRead = new AbortController(),
    evidenceRead = new AbortController();
  const fail = (cause: unknown) => {
    error = readableError(cause);
  };
  async function refresh() {
    if (statusPending) return;
    const version = epoch,
      readVersion = statusVersion;
    statusPending = true;
    try {
      const next = LearningStatusSchema.parse(await request({ action: "status" }));
      if (version === epoch && readVersion === statusVersion) {
        status = next;
        statusError = "";
      }
    } catch (cause) {
      if (version === epoch && readVersion === statusVersion) statusError = readableError(cause);
    } finally {
      if (version === epoch) statusPending = false;
    }
  }
  async function command(value: LearningCommand, key: string = value.action) {
    if (pendingAction) return;
    const version = epoch,
      actionKey = key;
    statusVersion++;
    pendingAction = actionKey;
    notice = "";
    try {
      const raw = await request(value);
      let next;
      if (value.action === "run" || value.action === "pause") {
        const result =
          value.action === "run"
            ? LearningCurationResultSchema.parse(raw)
            : LearningControlResultSchema.parse(raw);
        if (version !== epoch) return;
        manualConsent = result.kind === "consent_required";
        notice =
          result.kind === "consent_required"
            ? "Review and confirm how assessment uses your knowledge before running it."
            : result.kind === "cancelled"
              ? "The request was cancelled."
              : result.kind === "unavailable"
                ? "This action is unavailable with the current learning service."
                : result.kind === "uncertain"
                  ? "The earlier assessment is unconfirmed. No replacement was started."
                  : result.kind === "busy"
                    ? "Curation is already running."
                    : result.kind === "paused"
                      ? "Resume curation before starting a run."
                      : result.kind === "budget_exhausted"
                        ? "The automatic daily limit has been reached."
                        : result.kind === "started"
                          ? "Curation started."
                          : result.kind === "idle"
                            ? "No pending evidence needs assessment."
                            : "";
        next = LearningStatusSchema.parse(await request({ action: "status" }));
      } else next = LearningStatusSchema.parse(raw);
      if (version === epoch && pendingAction === actionKey) {
        statusVersion++;
        status = next;
        error = "";
      }
    } catch (cause) {
      if (version === epoch && pendingAction === actionKey) {
        if (value.action === "source" && value.enabled)
          error =
            "Collection could not start. Choose a project with an installed Git source, then connect it.";
        else fail(cause);
      }
    } finally {
      if (version === epoch && pendingAction === actionKey) pendingAction = undefined;
    }
  }
  const actions: KnowledgeActions = {
    setLearning(key, enabled) {
      if (pendingAction || !status) return;
      learningDraft = {
        captureOutcomes: status.consent.features.captureOutcomes.preferred,
        automaticContext: status.consent.features.automaticContext.preferred,
        automaticCuration: status.consent.features.automaticCuration.preferred,
        ...learningDraft,
        [key]: enabled,
      };
    },
    async saveLearning() {
      if (pendingAction || !status || !learningDraft) return;
      const life = epoch;
      await command({ action: "preferences", preferences: learningDraft }, "preferences");
      if (life === epoch && !error) learningDraft = undefined;
    },
    setQuery(value) {
      query = value;
    },
    async search(more = false) {
      if (!query.trim() || (more && !resultCursor)) return;
      searchRead.abort();
      searchRead = new AbortController();
      const version = ++searchVersion,
        life = epoch;
      searchPending = true;
      error = "";
      try {
        const result = SearchResultSchema.parse(
          await request(
            {
              action: "search",
              request: {
                query: query.trim(),
                mode: "best_available",
                limit: 20,
                maxBytes: 128 * 1024,
                ...(more && resultCursor ? { cursor: resultCursor as never } : {}),
              },
            },
            searchRead.signal,
          ),
        );
        if (version !== searchVersion || life !== epoch) return;
        if (result.kind !== "ok") {
          results = [];
          resultCursor = undefined;
          hasMoreResults = false;
          throw Error(outcomeMessage(result));
        }
        results = result.items;
        resultCursor = result.cursor;
        hasMoreResults = Boolean(result.cursor);
        searched = true;
        searchStatus =
          result.mode === "hybrid" ? "Matched by words and meaning" : "Matched by words";
      } catch (cause) {
        if (version === searchVersion && life === epoch) fail(cause);
      } finally {
        if (version === searchVersion && life === epoch) searchPending = false;
      }
    },
    async inspect(ref, more = false) {
      if (more && !evidenceCursor) return;
      evidenceRead.abort();
      evidenceRead = new AbortController();
      const version = ++evidenceVersion,
        life = epoch;
      if (!more) {
        evidence = undefined;
        evidenceCursor = undefined;
        hasMoreEvidence = false;
      }
      selected = ref;
      evidencePending = true;
      error = "";
      try {
        const result = EvidenceResultSchema.parse(
          await request(
            {
              action: "evidence",
              request: {
                root: ref,
                direction: "forward",
                maxDepth: 32,
                maxRecords: 20,
                maxLinks: 40,
                maxBytes: 256 * 1024,
                ...(more && evidenceCursor ? { cursor: evidenceCursor as never } : {}),
              },
            },
            evidenceRead.signal,
          ),
        );
        if (version !== evidenceVersion || life !== epoch) return;
        if (result.kind !== "ok") {
          evidence = undefined;
          evidenceCursor = undefined;
          hasMoreEvidence = false;
          throw Error(outcomeMessage(result));
        }
        evidence = { records: result.records, links: result.links };
        evidenceCursor = result.cursor;
        hasMoreEvidence = Boolean(result.cursor);
      } catch (cause) {
        if (version === evidenceVersion && life === epoch) fail(cause);
      } finally {
        if (version === evidenceVersion && life === epoch) evidencePending = false;
      }
    },
    refresh,
    async confirmConsent(feature, scope) {
      await command({ action: "confirm", feature, scope }, "confirm:" + feature);
      if (!error) manualConsent = false;
    },
    run: (overrideBudget) => command({ action: "run", overrideBudget }),
    source: (enabled) =>
      command({ action: "source", enabled }, enabled ? "source:start" : "source:stop"),
    pause: (paused) => command({ action: "pause", paused }),
    async export() {
      if (!evidence?.records.length || pendingAction) return;
      const life = epoch;
      pendingAction = "export";
      error = "";
      try {
        const value = KnowledgeExportResultSchema.parse(
          await request({
            action: "export",
            request: {
              format: "okf",
              refs: evidence.records.map((record) => record.ref),
              maxBytes: 1024 * 1024,
            },
          }),
        );
        if (life !== epoch) return;
        if (value.kind !== "ok") throw Error(outcomeMessage(value));
        const content = await serializeKnowledgeExport(value);
        if (life !== epoch) return;
        if (options.download) options.download(content);
        else {
          const url = URL.createObjectURL(
            new Blob([content], { type: "text/markdown;charset=utf-8" }),
          );
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = "drawloom-knowledge.okf.md";
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch (cause) {
        if (life === epoch) fail(cause);
      } finally {
        if (life === epoch) pendingAction = undefined;
      }
    },
  };
  const presentation: KnowledgePresentation = {
    get learning() {
      const saved = {
        captureOutcomes: status?.consent.features.captureOutcomes.preferred ?? false,
        automaticContext: status?.consent.features.automaticContext.preferred ?? false,
        automaticCuration: status?.consent.features.automaticCuration.preferred ?? false,
      };
      const draft = learningDraft ?? saved;
      return {
        ...draft,
        dirty:
          draft.captureOutcomes !== saved.captureOutcomes ||
          draft.automaticContext !== saved.automaticContext ||
          draft.automaticCuration !== saved.automaticCuration,
      };
    },
    copy: knowledgeCopy,
    get recoveryNotices() {
      return [
        status?.sourceWarning ||
          (status?.source?.state === "unavailable" ? status.source.message : ""),
        status?.curation && ["uncertain", "failed", "unavailable"].includes(status.curation.state)
          ? status.curation.message
          : "",
      ].filter(Boolean);
    },
    get query() {
      return query;
    },
    get results() {
      return results;
    },
    get evidence() {
      return evidence;
    },
    get selected() {
      return selected;
    },
    get searched() {
      return searched;
    },
    get searchPending() {
      return searchPending;
    },
    get evidencePending() {
      return evidencePending;
    },
    get statusPending() {
      return statusPending;
    },
    get pendingAction() {
      return pendingAction;
    },
    get status() {
      return status;
    },
    get hasMoreResults() {
      return hasMoreResults;
    },
    get hasMoreEvidence() {
      return hasMoreEvidence;
    },
    get error() {
      return error || statusError;
    },
    get notice() {
      return notice;
    },
    get searchStatus() {
      return searchStatus;
    },
    get consentRequests() {
      if (!status) return [];
      return (
        Object.entries(status.consent.features) as [
          LearningFeature,
          typeof status.consent.features.captureOutcomes,
        ][]
      )
        .filter(
          ([feature, value]) =>
            value.state === "consent_required" ||
            (feature === "automaticCuration" && manualConsent),
        )
        .map(([feature, value]) => ({
          feature,
          scope: $state.snapshot(value.scope),
          title: knowledgeCopy[feature],
          ...describeProcessing(value.scope),
        }));
    },
  };
  return {
    presentation,
    actions,
    open: refresh,
    close() {
      epoch++;
      searchVersion++;
      evidenceVersion++;
      searchRead.abort();
      evidenceRead.abort();
      results = [];
      evidence = undefined;
      selected = undefined;
      learningDraft = undefined;
      manualConsent = false;
      status = undefined;
      error = "";
      statusError = "";
      notice = "";
      statusPending = false;
      searchPending = false;
      evidencePending = false;
      pendingAction = undefined;
    },
  };
}
