# Local Agent Plugins packages

Implementation reference for **Accepted** [ADR 0018](../adr/0018-plugin-standards-and-runtime-extensions.md).
The [evidence record](../../knowledge/evidence/adr-0018-plugin-standards.md) distinguishes
verified public behavior from private consumer evidence and untested deployment claims.

## Standard package

Use an Agent Plugins 1.0.0 root `plugin.json`, optional `mcp.json`, and skills with
their supporting files under `skills/`. Neither a Drawloom package dependency nor
extension metadata is required for skills and MCP servers. Package version is
optional. Drawloom preserves original tool names on the MCP connection; separate
host aliases disambiguate installations and servers.
The desktop snapshot carries display-only tool titles/origins for grant controls;
changing a label never changes the alias submitted for a permission decision.
Discovery returns registered local contributions immediately. Native connection,
native categories and package resources report loading independently; the UI
refreshes pending results without restarting requests. Native app pagination is
explicit and cached. See the [discovery API](discovery-and-resources.md).
Discovery executes no tool and replays no invocation.

Inspection parses metadata and checks contained paths. It does not start a
process, import a backend, fetch a declared schema or load skill instructions into
the model. Add the inspected folder in Plugins, then explicitly enable it and
restart. Installing, enabling, trusting backend code, signing in and granting tool
execution permission are separate actions.

The Bun-hosted `@drawloom/local-plugin-packages` exposes `inspectPackage`,
`readSkill`, `readSupportingFile` and `activatePackage`. Portable metadata and
shared package conformance live in `@drawloom/plugins`. Stdio and Streamable HTTP
are supported; legacy SSE fails visibly without disabling healthy siblings.
Executable servers remain trusted local programs, not sandboxed packages.

Data lives below the selected Drawloom data directory. Installation records retain
identity, root, non-secret configuration and activation choices. `PLUGIN_ROOT`
refers to the package, and `PLUGIN_DATA` to that installation's data directory.
The host does not install executables, dependencies or models on the user's behalf.
Package authors own executable prerequisites and their configuration contract.

Proposed [ADR 0020](../adr/0020-directory-backed-projects-and-file-delivery.md)
keeps installation/trust/configuration and OAuth global while activating
connections and backend instances for each selected project. `PLUGIN_DATA` and
backend JSON keys are installation/project-scoped. The backend's fixed
`project` context supplies the validated working directory. Standard server
launch declarations are not silently rewritten; authors still own their paths
and explicit working-folder configuration. Global OAuth disconnect/client
replacement closes the server connection in every already-created project.

Tool input schemas are validated before dispatch. Model-visible tools still need
Drawloom grants and native review; app-only tools remain outside model exposure.
An MCP error result is failed execution evidence, not a successful output merely
because the network request succeeded.

## Resources and credentials

Listed resources use bounded metadata reads and cached source-bound receipts.
Explicit refresh and upstream list-change notifications invalidate the catalogue.
Reading one selection never authorizes arbitrary filesystem or network access.
Tool-returned links can appear without having been listed. Captured display media
uses the existing authenticated asset/history path; reconnect is not an import.

Drawloom-owned HTTP connections use the MCP SDK's OAuth implementation, with
preconfigured registration, client-metadata documents or advertised dynamic
registration. The browser sees a sign-in URL and safe connection status, not
tokens, client credentials or package headers. Credentials are scoped to the
installation, server, resource and issuer in the OS credential store. If that
store is unavailable, authentication is visibly session-only.

Connect, Cancel, Reconnect and Disconnect act on the connection's startup
configuration. Editing a package during a session cannot redirect its sign-in.
Changed tool declarations and connections currently serving an MCP App require
restart; reconnection does not replay uncertain calls. Disconnect removes local
credentials but is not a claim of remote token revocation.

Codex-owned integrations instead use the adapter's optional discovery
`authenticate(selection)` operation. The host passes a validated catalogue
identity, and Codex owns login and credentials. Unsupported native authentication
is reported rather than replaced by a Drawloom credential flow.

## Trusted enhancement

The optional `extensions["io.github.mafifi.drawloom"]` object declares version 1,
a package-relative prebuilt `.js`/`.mjs` backend, required public capabilities or
tool/skill identities, optional tool/skill identities, and workbench placement
with an MCP App opening tool.

The default export has type `PluginBackendFactory` from `@drawloom/desktop-host`.
Its context contains installation identity, package/data paths, non-secret
configuration, a declared-dependency startup availability report and explicitly supplied `capabilities`. These may include existing
host, tool or orchestration interfaces; the desktop does not install a Temporal
provider. A backend returns contributions and cleanup, optionally contributing
MCP server transports. It must not duplicate a standard server declaration.

Required tools use `package:<package-name>:<server-name>:<tool-name>`; skills use
`package:<package-name>:skill:<skill-name>`. Multiple installations with an
ambiguous package identity cannot satisfy that dependency. App-only tools and
tools rejected during schema projection cannot satisfy model tool requirements.
The supplied gateway exposes these declared identities while retaining the actual
host aliases, grants, active operation ownership and evidence underneath.

Missing required dependencies disable the dependent enhancement, not standard siblings.
Missing optional dependencies leave unrelated operations usable. The report is
presence information, not a grant or a provider-readiness guarantee. Backend
results directly contain `contributions`, optional `controllers`, named `servers`
and `dispose`. JSON storage keys are scoped by installation.
Placement must match a workbench and view contributed by that backend, including
its registered resource URI. A manifest cannot take over another package's view.

Backend trust is process-level trust. An injected API is a supported boundary,
not containment against malicious filesystem/process access. Backend configuration
replacement applies after restart. The old startup factory and composition
environment-variable route are removed; there is no compatibility adapter.

The browser receives only MCP Apps messages and resources. Compiled Svelte HTML
is suitable, but it must not import these host capability objects or rely on a
Drawloom-specific browser protocol. Build artifacts must work outside the source
checkout; workspace imports do not demonstrate distributable packages.

The ADR 0020 host collects exact `resourceDomains` during activation and origins
from recognised MCP image/audio/video resource links into one global media policy.
No second workbench approval is required. Existing installation media settings
and `DRAWLOOM_MEDIA_ORIGINS` provide explicit seeds. Inspection executes nothing
and does not change the list. The policy stores origins and declaring identities,
not signed file URLs. It persists declarations for cached/offline references.
Its revision changes only when the effective origin set changes. Every workbench
can load media from these origins; reference sharing still belongs to the workflow.
An outdated open UI offers an explicit reopen action, never a silent restart.
Shared permission does not allow external scripts, network API connections, frame
origins or new iframe permissions. Fonts/styles remain limited to the UI's own
declarations. The integration owns URL renewal, credentials and preservation.
Relative media URLs resolve through the open view's project-only base URL;
ordinary standard MCP resource reads remain bounded whole-content reads. Neither
a returned URI nor a declared origin creates a general host proxy. Unknown prose
URLs and arbitrary JSON do not register sources. “Declared” is not a content-safety
certification. The shared-domain policy is a Drawloom host choice, not an MCP
Apps portability guarantee.

### Preconfigured OAuth clients

In a remote connection's settings, expand **Preconfigured OAuth client** and
select a local JSON file containing `issuer` and `information` (the MCP SDK OAuth
client information shape, including `client_id` and optional client secret and
registration metadata). Import disconnects the old connection and stores the
registration in the host credential store; then use Connect. The browser receives
neither the file contents nor client secret. Files must be regular, non-symlink
files no larger than 64 KiB. The original file is not deleted or managed by
Drawloom. Session-only credential storage remains explicit when OS storage fails.
