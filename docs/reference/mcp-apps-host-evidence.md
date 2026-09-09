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
`ui/openai/first-party-plugin-bridge`. Observed actions include `startTask`,
`getPluginInfo`, `openPluginDetails` and `openAuthenticatedChatGptWebview`, with
capability/version checks. These observations do not establish a supported
third-party API or permission to reuse its implementation.

## Supported surface versus open questions

[Official MCP UI documentation](https://developers.openai.com/plugins/build/chatgpt-ui)
documents resource-linked UI, initialization, tool results, tool calls,
messages and context updates. This is a concrete portable integration candidate.
It does not establish third-party access to Rosalind's first-party bridge or
top-level Codex placement. Absence of documentation is not proof of absence.

The blanket claim that custom workbench UI cannot run inside Codex is therefore
too broad. A narrower proof is needed: install an ordinary local MCP Apps plugin,
render its own UI, call a synthetic tool, and test available conversation/context
integration and persistence without first-party capabilities. Record what the
actual Codex host exposes and which permissions it requires.

Until that proof, retain provider-neutral backend contracts and reusable UI
components. Do not replace the desktop shell or introduce first-party bridge
dependencies merely because a first-party example can use them. This is a
potential alternative host for a workbench, not a new agent loop.
