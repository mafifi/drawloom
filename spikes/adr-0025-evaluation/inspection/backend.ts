import type { PluginBackendFactory } from "@drawloom/desktop-host";
import { inspectionResourceUri, inspectionWorkbenchId } from "../inspection-contract.ts";

const backend: PluginBackendFactory = async () => ({
  contributions: {
    workbenches: [{
      id: inspectionWorkbenchId,
      title: "Evaluation findings",
      description: "Inspect saved knowledge evaluation findings and record advisory feedback.",
      tools: [],
      skills: [],
    }],
    views: [{ id: "evaluation-inspection.view", workbenchId: inspectionWorkbenchId, title: "Evaluation findings", entrypoint: inspectionResourceUri }],
  },
  async dispose() {},
});

export default backend;
