# MCP Apps host evidence: Rosalind

Inspected on 2026-09-09. This is an integration research note, not an accepted
change to Drawloom's desktop or plugin execution boundary.

## What was observed

The locally distributed Rosalind Workbench plugin, version
`0.2.5-research-preview`, contains a bundled JavaScript MCP server and a bundled
React HTML application. The distribution is inspectable; original source and
an open-source licence for Rosalind itself were not established. No Rosalind
implementation was copied into Drawloom or executed for this inspection.

The server serves home/settings HTML resources using MCP Apps metadata and
the `text/html;profile=mcp-app` resource type. The UI receives host context and
tool results and supports fullscreen presentation. It also advertises global
and settings entrypoints through OpenAI-specific metadata.

Its deeper integration negotiates `openai/first-party-plugin-bridge` and uses
`ui/openai/first-party-plugin-bridge`, with capability/version checks. These
observations do not establish a supported third-party API or permission to reuse
its implementation.

### Application-used baseline

The following are calls or declarations in the application itself, not merely
methods included in its bundled SDK. Locations refer to the installed version
above: `mcp/server.cjs` and `mcp/dist/mcp-app.html`. Bundled line numbers are
version-specific, and the HTML contains long minified lines.

| Surface | Observed behaviour | Location |
|---|---|---|
| Registration | Home/settings resources load the same bundled HTML; app-visible tools advertise global/settings entrypoints | Server lines 30955–31097 |
| Presentation | Advertises fullscreen, disables automatic resize; tool results select launcher/settings view | HTML line 170 |
| Host context | Applies theme, CSS variables and font styles; handles context changes | HTML line 170 |
| Navigation | Standard `openLink` opens a settings deep link | HTML line 170 |
| Task handoff | First-party `startTask({ title, prompt })`; older-host fallback uses `window.openai.sendFollowUpMessage` | HTML line 170 |
| Plugin information | First-party `getPluginInfo` supplies names/logos; `openPluginDetails` opens a plugin page | HTML line 170 |
| Account UI | First-party `openAuthenticatedChatGptWebview` opens model access settings | HTML line 170 |
| Feedback and tracking | First-party `submitFeedback` and `trackSurfaceInteraction`, version gated | HTML lines 130 and 170 |
| Logging | Separate capability-gated `openai/logging/message` used for app diagnostics | HTML lines 92 and 170 |

The bridge capability is checked before connecting; `getVersion` gates task
creation at version 2, feedback at 4 and interaction tracking at 5. These numbers
describe that bridge, not MCP or Drawloom versions.

The server requests empty `connectDomains` and `resourceDomains` and no
`ui.permissions`. This is declared resource policy, not verification of effective
network denial or browser isolation. We have not inspected Codex's renderer or
verified its frame/webview configuration, effective CSP or permission prompts.
Nothing here establishes filesystem isolation for the plugin's Node server.

Bundled SDK definitions for tool calls, resource reads, model-context updates,
sampling, downloads and display-mode requests are not evidence that Rosalind's
application exercises them. The inspected UI primarily launches tasks and
provides plugin discovery/settings. It does not prove concurrent editing,
selection persistence, operation subscriptions or document recovery.

## Supported surface versus open questions

[Official MCP UI documentation](https://developers.openai.com/plugins/build/chatgpt-ui)
documents resource-linked UI, initialization, tool results, tool calls,
messages and context updates. This is a concrete portable integration candidate.
It does not establish third-party access to Rosalind's first-party bridge or
top-level Codex placement. Absence of documentation is not proof of absence.

The blanket claim that custom workbench UI cannot run inside Codex is therefore
too broad. Whether an ordinary third-party plugin receives the same Codex host
features remains a separate compatibility question, not the next Drawloom proof.

## Use as Drawloom's benchmark

The maintainer selected the actual private video workbench as the next proving
consumer, alongside [ADR 0013](../adr/0013-plugin-boundaries-and-host-integration.md).
Do not replace that consumer with a toy editor or make a Codex installation test
a prerequisite. Public contracts and conformance remain independently testable;
private business UI, code and fixtures remain private.

Use the baseline above to ask whether a proposed bridge interaction is already
demonstrated, a documented protocol possibility, or a new consumer requirement.
Reading a controller snapshot, selecting a candidate and reopening persisted
state are new proof obligations, not demonstrated Rosalind behaviours. They can
reuse existing Drawloom controller/persistence owners without introducing new
platform capabilities.

Rosalind's first-party methods are not a shopping list. The video proof does not
need plugin discovery, an authenticated account webview or a telemetry service
merely because Rosalind has them. Conversely, a growing generic dispatch method
must not conceal authority beyond the narrow services shown here. ADR 0013 owns
the maintainer escalation rule. Retain provider-neutral contracts and do not
introduce dependencies on the first-party bridge.
