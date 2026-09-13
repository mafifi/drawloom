import "@drawloom/ui/styles.css";
import { App } from "@modelcontextprotocol/ext-apps";
import { createEvaluationViewModel } from "@drawloom/evaluation-presentation";
import { mount } from "svelte";
import { createKnowledgeEvaluationPresentationClient } from "../client.js";
import AppView from "./App.svelte";

const app = new App({ name: "drawloom-knowledge-evaluation", version: "0.0.0" }, {}, { autoResize: true });
const connected = app.connect();
const toolError = (result: Awaited<ReturnType<typeof app.callServerTool>>) => {
  const item = result.content?.find(value => value.type === "text");
  return item?.type === "text" ? item.text : "Knowledge evaluation request failed";
};
const client = createKnowledgeEvaluationPresentationClient(async (operation, input) => {
  await connected;
  const result = await app.callServerTool({ name: "evaluation.request", arguments: { operation, input } });
  if (result.isError) throw new Error(toolError(result));
  if (!result.structuredContent) throw new Error("Knowledge evaluation response omitted structured content");
  return result.structuredContent;
});
const viewModel = createEvaluationViewModel({ client });
mount(AppView, { target: document.body, props: { viewModel } });
