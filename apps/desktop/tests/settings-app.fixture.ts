import { App } from "@modelcontextprotocol/ext-apps";
const app = new App({ name: "Public counter preferences", version: "1" });
app.onhostcontextchanged = (context) => {
  if (context.theme) document.documentElement.style.colorScheme = context.theme;
};
document.documentElement.style.backgroundColor = "Canvas";
document.documentElement.style.color = "CanvasText";
document.body.innerHTML =
  '<main><h1>Counter preferences</h1><label>Starting value <input type="number" min="0" id="value"></label><button id="save">Save preferences</button><p role="status" id="status"></p></main>';
let revision = 0;
const value = document.querySelector<HTMLInputElement>("#value")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
function display(result: Awaited<ReturnType<typeof app.callServerTool>>) {
  if (result.isError)
    throw Error(result.content.map((block) => (block.type === "text" ? block.text : "")).join(" "));
  const state = result.structuredContent;
  if (!state || typeof state.revision !== "number" || typeof state.value !== "number")
    throw Error("Preferences unavailable");
  revision = state.revision;
  value.value = String(state.value);
}
save.onclick = async () => {
  save.disabled = true;
  status.textContent = "Saving…";
  try {
    display(
      await app.callServerTool({
        name: "preferences.save",
        arguments: { revision, value: Number(value.value) },
      }),
    );
    status.textContent = "Preferences saved";
  } catch (error) {
    status.textContent = String(error);
  } finally {
    save.disabled = false;
  }
};
await app.connect();
document.documentElement.style.colorScheme = app.getHostContext()?.theme ?? "light dark";
try {
  display(await app.callServerTool({ name: "preferences.open", arguments: {} }));
} catch (error) {
  status.textContent = String(error);
}
