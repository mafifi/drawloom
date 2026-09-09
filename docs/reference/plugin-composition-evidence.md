# Plugin composition comparison

Inspected 2026-09-09. This note informs
[ADR 0013](../adr/0013-plugin-boundaries-and-host-integration.md); it does not
adopt another product's runtime or claim interoperability.

## DeepSeek Harness

Local checkout inspected at commit `4e84901e6471b79ec0338099867ebb4606d12bb5`.
Source was read, not copied or executed. Paths below are relative to that
checkout; line numbers are specific to this revision.

| Observed mechanism | Source | Lesson, not a requirement |
|---|---|---|
| Named plugin with validated configuration, declared service injection and tool registration | `packages/todo/tool-todo/src/index.ts:22`, `:128` | Related contributions can have one owner; Drawloom need not adopt dependency injection |
| Separate host and client exports plus `dsh.client` manifest metadata | `packages/client/ui-skill/package.json` | UI build output is part of a plugin, not a separate application |
| Typed skill queries from browser UI | `packages/client/ui-skill/src/client/index.ts:108` | Keep typed operations and validate them at their owner |
| Host resolves session scope for skill metadata | `packages/api/session-controller/src/skill-catalog.ts:20` | Client-provided arguments do not establish authority |
| Selected generated remote-service contributions | `packages/api/remotes/src/client/index.ts:143` | Browser access is explicitly assembled, not automatically every host service |
| Client loader appends a script to `document.head` | `packages/client/modules/src/client/system.ts:15` | Independent packaging does not itself mean isolation |

Its Cordis lifecycle, service injection, reversible registration, profile trees,
dynamic client bundling, generated RPC and hot reload solve broader needs than
Drawloom's current explicit startup composition. They are alternatives to assess,
not prerequisites to integrate the first video plugin.

## Comparison with Codex/Rosalind

[Rosalind's observed integration](mcp-apps-host-evidence.md) uses separately
packaged HTML resources and capability-gated host calls. DeepSeek's inspected
loader executes client modules inside the host document. Neither packaging
alone proves an isolation guarantee; neither implies that Drawloom must use
React or a particular transport.

The useful common boundary is plugin-owned behaviour and presentation, with
host-owned registration and explicitly available services. Drawloom's proof
should therefore load the private plugin's actual built view in the public host,
alongside its existing tools, skills and controller. A private demo host would
not establish that integration.

Do not generalise the video controller into a public business service, nor hide
unrestricted access behind an untyped dispatcher. The small initial navigation
bridge is a proof step. Continuous shared editing and agent handoff remain
separate evidence obligations under the same plugin boundary.
