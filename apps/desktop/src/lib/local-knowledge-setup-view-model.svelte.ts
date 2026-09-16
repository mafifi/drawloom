import { z } from "zod";
import {
  LocalLearningSetupCommandSchema,
  LocalLearningSetupStatusSchema,
  LocalLearningConfigurationSchema,
  type LocalLearningSetupStatus,
} from "./local-knowledge-setup-protocol.js";
import {
  localKnowledgeCopy,
  type LocalKnowledgeSetupPresentation,
  type LocalKnowledgeSetupActions,
} from "./local-knowledge-setup-presentation.js";
import { telemetryFetch } from "./telemetry.js";
type Command = z.infer<typeof LocalLearningSetupCommandSchema>;
async function send(command: Command): Promise<unknown> {
  const response = await telemetryFetch("/api/knowledge/local-setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LocalLearningSetupCommandSchema.parse(command)),
  });
  if (!response.ok) throw Error("Local setup is unavailable. Your knowledge is unchanged.");
  return response.json();
}
export function createLocalKnowledgeSetupViewModel(options: { send?: typeof send } = {}) {
  const request = options.send ?? send;
  let status = $state<LocalLearningSetupStatus>(),
    pendingAction = $state<string>(),
    statusPending = $state(false),
    error = $state(""),
    statusError = $state(""),
    notice = $state("");
  let epoch = 0,
    revision = 0;
  const parse = (value: unknown) =>
    z.strictObject({ kind: z.literal("unavailable") }).safeParse(value).success
      ? undefined
      : LocalLearningSetupStatusSchema.parse(value);
  async function refresh() {
    if (statusPending) return;
    const life = epoch,
      version = revision;
    statusPending = true;
    try {
      const next = parse(await request({ action: "status" }));
      if (life === epoch && version === revision) {
        status = next;
        statusError = "";
      }
    } catch {
      if (life === epoch && version === revision)
        statusError = "Local setup is unavailable. Your knowledge is unchanged.";
    } finally {
      if (life === epoch) statusPending = false;
    }
  }
  async function command(value: Command, key: string = value.action) {
    if (pendingAction && value.action !== "cancel_download") return;
    const life = epoch,
      version = ++revision;
    pendingAction = key;
    notice = "";
    error = "";
    try {
      const next = parse(await request(value));
      if (life !== epoch || version !== revision) return;
      status = next;
      statusError = "";
      if (!next) error = "Local installation controls are not available for this learning service.";
      else if (value.action === "cleanup_obsolete" && next.obsoleteRuntimePresent === false)
        notice =
          "Previous runtime files are no longer present. Your knowledge and evidence are unchanged.";
    } catch {
      if (life === epoch && version === revision)
        error =
          value.action === "cleanup_obsolete"
            ? "Could not complete cleanup safely. Your knowledge is unchanged."
            : "Local setup could not complete. Your knowledge is unchanged.";
    } finally {
      if (life === epoch && version === revision) {
        revision++;
        pendingAction = undefined;
      }
    }
  }
  const actions: LocalKnowledgeSetupActions = {
    refresh,
    async configure(configuration) {
      try {
        await command({
          action: "configure",
          configuration: LocalLearningConfigurationSchema.parse(configuration),
        });
      } catch {
        error = "Check the local settings and try again.";
      }
    },
    download: (model) => command({ action: "download", model, consent: true }, "download:" + model),
    cancelDownload: (model) =>
      command({ action: "cancel_download", model }, "cancel_download:" + model),
    cleanupObsolete: () => command({ action: "cleanup_obsolete", consent: true }),
  };
  const presentation: LocalKnowledgeSetupPresentation = {
    copy: localKnowledgeCopy,
    get status() {
      return status;
    },
    get configuration() {
      return status?.configuration;
    },
    get pendingAction() {
      return pendingAction;
    },
    get statusPending() {
      return statusPending;
    },
    get error() {
      return error || statusError;
    },
    get notice() {
      return notice;
    },
  };
  return {
    presentation,
    actions,
    open: refresh,
    close() {
      epoch++;
      revision++;
      status = undefined;
      pendingAction = undefined;
      statusPending = false;
      error = "";
      statusError = "";
      notice = "";
    },
  };
}
