import type { ToolElicitationRequest, ToolElicitationResult } from "@drawloom/tools";
import type { DesktopViewModel } from "./view-model.svelte.js";

export type ElicitationFormPresentation = Readonly<{
  busy: boolean;
  pendingAccept: boolean;
  pendingDecline: boolean;
  pendingCancel: boolean;
}>;

export type ElicitationFormActions = Readonly<{
  choice(name: string, fallback?: string): string;
  choose(name: string, value: string): void;
  submit(form: FormData): Promise<boolean>;
  resolve(action: "decline" | "cancel"): Promise<boolean>;
}>;

export function elicitationFormPresentation(
  vm: DesktopViewModel,
  requestId: string,
): ElicitationFormPresentation {
  const pending = (action: string) =>
    vm.pendingCommand?.kind === "elicitation" &&
    vm.pendingCommand.requestId === requestId &&
    vm.pendingCommand.result.action === action;
  return {
    busy: vm.busy,
    pendingAccept: pending("accept"),
    pendingDecline: pending("decline"),
    pendingCancel: pending("cancel"),
  };
}

export function elicitationFormActions(
  vm: DesktopViewModel,
  requestId: string,
): ElicitationFormActions {
  return {
    choice: (name, fallback = "") => vm.elicitationChoice(requestId, name, fallback),
    choose: (name, value) => vm.chooseElicitation(requestId, name, value),
    submit: (form) => vm.submitElicitation(requestId, form),
    resolve: (action) =>
      vm.state
        ? vm.command({
            kind: "elicitation",
            conversationId: vm.state.selectedId,
            requestId,
            result: { action },
          })
        : Promise.resolve(false),
  };
}

export function elicitationContent(
  params: ToolElicitationRequest["params"],
  form: FormData,
): NonNullable<ToolElicitationResult["content"]> {
  const entries: [string, string | number | boolean | string[]][] = [];
  for (const [name, field] of Object.entries(params.requestedSchema.properties)) {
    const raw = form.get(name),
      required = params.requestedSchema.required?.includes(name);
    if (field.type === "boolean") entries.push([name, raw === "on"]);
    else if (field.type === "array") {
      const values = form.getAll(name).map((value) => {
        if (typeof value !== "string") throw Error("Expected a choice");
        return value;
      });
      if (values.length || required) entries.push([name, values]);
    } else {
      if ((raw === null || raw === "") && !required) continue;
      if (typeof raw !== "string") throw Error("Complete the requested information");
      if (field.type === "number" || field.type === "integer") {
        if (!raw.trim() || !Number.isFinite(Number(raw))) throw Error("Enter a valid number");
        entries.push([name, Number(raw)]);
      } else entries.push([name, raw]);
    }
  }
  return Object.fromEntries(entries);
}
