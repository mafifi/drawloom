import "@drawloom/ui/styles.css";
import { App } from "@modelcontextprotocol/ext-apps";
import { mount } from "svelte";
import InspectionApp from "./InspectionApp.svelte";
import { inspectionFeedbackTool, inspectionOpenResultSchema, inspectionOpeningTool, inspectionSaveResultSchema } from "../inspection-contract.ts";
import type { InspectionClient } from "./inspection-view-model.ts";

const app = new App({ name: "drawloom-knowledge-inspection", version: "1.0.0" }, {}, { autoResize: true });
const connected = app.connect();
const toolError = (result: Awaited<ReturnType<typeof app.callServerTool>>) => {
  const text = result.content?.find(item => item.type === "text");
  return text?.type === "text" ? text.text : "The inspection server rejected the request";
};
const client: InspectionClient = {
  async open() {
    await connected;
    const result = await app.callServerTool({ name: inspectionOpeningTool, arguments: {} });
    if (result.isError) throw Error(toolError(result));
    return inspectionOpenResultSchema.parse(result.structuredContent);
  },
  async save(input) {
    await connected;
    const result = await app.callServerTool({ name: inspectionFeedbackTool, arguments: input });
    if (result.isError) throw Error(toolError(result));
    return inspectionSaveResultSchema.parse(result.structuredContent);
  },
};

mount(InspectionApp, { target: document.body, props: { client } });
