# Plugin and workbench Settings integration

This reference accompanies [Accepted ADR 0029](../adr/0029-plugin-and-workbench-settings.md).
It explains how to add a page and records the references behind the implementation.

## Why MCP Apps remains the rendering boundary

On 17 September 2026, the installed Rosalind distribution
`0.2.5-research-preview` was reinspected. In `mcp/server.cjs`, lines 30955–31110,
it registers `ui://rosalind/settings.html`, an app-only `rosalind.settings` tool,
and `openai/ui.entrypoints` with `type: "settings"`. Its HTML is supplied through
the standard MCP Apps resource format. This establishes a concrete settings
placement pattern, not a portable OpenAI placement API or permission to copy its
implementation. No Rosalind code was executed or copied. The
[earlier inspection](mcp-apps-host-evidence.md) records its first-party bridge limits.

DeepSeek's clean local checkout was inspected at
`c291e7961a515f6d7af9304e7fd1d257929aef26`, newer than the broad harness survey.
Only the affected settings paths were refreshed; the older survey's claims and
revision remain unchanged. No upstream tests or builds were run.

| Source at that revision | Relevant observation |
| --- | --- |
| `packages/client/ui-settings-general/src/client/index.ts` | The shell derives navigation from feature-owned `settings.section` registrations. |
| `packages/client/ui-settings/src/client/settings-contract.ts` | A settings scope exposes loading/readiness, values, revisions and explicit mutations. |
| `packages/settings/settings/src/index.ts` | Owners register schemas; writes validate and can reject stale revisions; live/restart application is explicit. |
| `packages/client/modules/src/client/system.ts` | Client bundles execute as scripts in the parent document. Drawloom does not adopt this trust boundary. |

The [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
was also consulted on 17 September 2026. It describes HTML resources, forms,
host-mediated tools and framework-independent presentation. It does not define
Drawloom's navigation, storage, consent or installation lifecycle.

## Why Settings has its own lifetime

Before this change, custom views had three relevant constraints:

- `PluginViewFrame.svelte` requires a conversation and mounts through the
  conversation view routes.
- `application.ts` resolves a project runtime before a view request.
- `PrimaryView.svelte` renders the current conversation's workbench configuration.

Settings now uses a separately admitted installation session, not a fake conversation.
The general MCP App client admits app-visible tools on a connection; Settings
narrows that set to the page's declared operations. App visibility alone is
not authority to manage configuration or run a model.

## Ownership

Drawloom lists a page beneath its owning plugin or workbench. The owner supplies
the MCP App and validated operations. The host binds installation, page, connection
and mount lifetime; the frame cannot choose those bindings through tool arguments.
Only admitted settings tools are available. Conversation messages and context
updates are unavailable on this surface.

Plugin installation/setup and workbench preferences are separate pages. A workbench
can direct the user to its dependency's Settings entry but does not get permission
to edit that dependency. Each package retains one configuration owner. Settings
changes must not silently grant tool execution, authorise a voice or change selected
episode revisions.

## Declare a Settings page

This fragment belongs inside `plugin.json`. The named `setup` server must also
exist in the package's root `mcp.json`. These are illustrative names, not built-in
Drawloom tools:

```json
{
  "extensions": {
    "org.drawloom": {
      "version": 1,
      "settings": [
        {
          "id": "preferences",
          "title": "Preferences",
          "openingTool": { "server": "setup", "tool": "settings.open" },
          "allowedTools": ["settings.open", "settings.read", "settings.save"]
        }
      ]
    }
  }
}
```

Without `workbenchId`, the page belongs to its plugin. To place it under a
workbench, add that workbench's exact identifier; the same extension must declare
the workbench. This does not activate its project backend.

The opening tool supplies the standard MCP Apps resource URI. Every tool in
`allowedTools`, including the opening tool, must be app-only through
`_meta.ui.visibility: ["app"]`. All belong to the same opening server. Adding a
tool to a manifest does not make an unrelated server or model-visible tool
available to the page. Package authors must still validate arguments and enforce
the operation's own consent requirements.

## Build setup independently of the optional runtime

The setup server must be able to show missing prerequisites without importing or
loading the model it installs. Drawloom supplies installation data in `PLUGIN_DATA`
and shared configuration in `DRAWLOOM_PLUGIN_CONFIG_DIR`. A Settings server does
not receive `DRAWLOOM_PROJECT_DIR`; do not infer a project from its working folder.

MCP subprocesses do not inherit arbitrary environment variables from Drawloom.
Declare required non-secret environment values in the server's supported `mcp.json`
configuration. Do not document a host-process environment override unless the
package explicitly carries it into that configuration. Never embed credentials in
a generated package.

Use a short start operation that returns a retained job identity, a status
operation that reports measured progress, and an explicit cancel operation.
Downloading inside a single long browser call makes page closure and lost replies
ambiguous. Keep the job with the installation server, not the iframe. On restart,
report unfinished work as interrupted; do not silently repeat it.

Keep preference saves separate from setup and from permission grants. Return only
the fields that the page owns, together with a revision. Reject stale saves rather
than overwriting a newer change or unrelated configuration. Explain whether a
saved setting applies immediately, on the next operation, or after restart.

Package-owned settings do not mutate the host's installation record or an
existing backend's `context.configuration`. If the assistant needs package-owned
defaults, expose a separate normal read-only MCP tool for those values. Keep it
outside the page's app-only allowlist, and keep save/setup operations unavailable
to the model. Do not derive the host's filesystem layout to reach another owner.

The shared host provides isolation and navigation, not a universal form model.
Authors may compile shared UI components into their self-contained page. Do not
import a package's component directly into Drawloom's parent document.

## Verification status

Reference inspection and public implementation checks are recorded in the
[evidence record](../../knowledge/evidence/adr-0029-plugin-settings.md), including
review corrections and browser-test limits. The canonical repository gate and
separate private installed-consumer checks passed on 17 September 2026. The
[delivery plan](../plans/0029-plugin-settings.md) is the current execution record.
Do not treat concept images, retained recordings or test doubles as proof of
installed narration/model setup.
