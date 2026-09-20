# Build and install a plugin package

A plugin package brings skills and MCP servers into Drawloom. A workbench can
also add a trusted backend to use Drawloom's capabilities and open its own UI.
Start with the standard package format; add Drawloom-specific files only when
your workbench needs them.

[ADR 0018](../adr/0018-plugin-standards-and-runtime-extensions.md) records the
accepted loading design. Its [evidence](../../knowledge/evidence/adr-0018-plugin-standards.md)
separates public tests, private consumer observations and remaining limitations.

## Standard package

### Display names and icons

Declare branding under `extensions.org.drawloom.presentation`, not as invented
standard manifest fields. Technical package identity and grants do not change.

```json
{
  "org.drawloom": {
    "version": 1,
    "presentation": {
      "displayName": "Document tools",
      "icon": {
        "light": "./assets/icon.svg",
        "dark": "./assets/icon-dark.svg"
      }
    }
  }
}
```

The example is the `extensions` object. Icons are optional package-relative
SVG, PNG, JPEG or WebP files, at most 256 KiB each. The host checks canonical
package containment and rejects leaf symlinks, escaped paths, active/external SVG content and
non-image bytes. Missing/unreadable icons fall back without affecting execution.
Keep SVG self-contained, with explicit colours suitable for each declared theme.
The host supplies bounded image data; shared UI renders it through image-only
blob URLs and releases those URLs on unmount. No inline SVG or remote icon fetch.
The native agent discovery contract has equivalent optional `presentation`
metadata; Codex maps declared names and host-confined installed plugin images.
Author names take precedence over display-only fallback formatting. Selection
always uses the original opaque identity and technical name.

Use an Agent Plugins 1.0.0 `plugin.json` at the package root. Put skills and their
supporting files under `skills/`, and declare MCP servers in an optional root
`mcp.json`. Skills and servers require neither a Drawloom dependency nor extension
metadata. Package version is optional.

For example, this is a complete minimal manifest, though it contributes nothing
until you add a skill or MCP server:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "example-workbench",
  "description": "An example package for local development."
}
```

The [local package implementation](../../packages/plugins/local-plugin-packages/README.md)
exposes `inspectPackage`, `readSkill`, `readSupportingFile` and `activatePackage`.
Shared metadata and tests live in `@drawloom/plugins`. The loader supports stdio
and Streamable HTTP. Legacy SSE reports an error without disabling healthy servers.

### Install without confusing access and permission

Add the inspected folder in Plugins, then explicitly enable it and restart.
Inspection reads metadata and checks paths; it does not start servers, import
backend code, fetch schemas or load instructions into the model.

Installing a package, enabling it, trusting its backend, signing in and granting
tool access are separate actions. A server is a trusted local program, not a
sandboxed package. The host does not install its executables, dependencies or
models automatically. Document those prerequisites for your users.

The host preserves tool names on the MCP connection. It uses separate aliases
to distinguish installations and servers. Display labels never change permission
identities. Inputs are validated before dispatch; model-visible tools still need
Drawloom grants and native review. An MCP error is a failed tool result even when
the network request succeeded. Discovery calls no tool and repeats no execution.

### Keep installation and project data separate

Installation records hold identity, package root, non-secret configuration and
activation choices. `PLUGIN_ROOT` points to the package; `PLUGIN_DATA` points to
its data directory. Do not overwrite these reserved variables.

Installation, trust, configuration and OAuth are global. Working connections,
backend instances and backend JSON storage are activated for a particular project.
The backend receives a fixed `project: {id, directory}`. `PLUGIN_DATA` is scoped
to the installation/project activation. The host does not silently rewrite a
standard server's launch declaration to change its working folder; the author
must configure that explicitly. See [ADR 0020](../adr/0020-directory-backed-projects-and-file-delivery.md).

Installation Settings has a separate lifetime: its server receives shared
configuration and installation data, but no project directory. It can therefore
explain missing setup before a conversation or optional model exists. See
[plugin and workbench Settings](plugin-settings.md) for registration, allowed
tools and setup recovery. This does not change project-bound working views.

For project-bound desktop activation, Drawloom also supplies two reserved
environment variables: `DRAWLOOM_PLUGIN_CONFIG_DIR` is the installation's shared
configuration directory, and `DRAWLOOM_PROJECT_DIR` is the conversation's fixed
project directory. Servers can use these to share setup without sharing execution
records or outputs. Neither variable changes the declared process working directory
or grants permission to invoke tools. Keep project state under `PLUGIN_DATA`;
do not copy configuration into each project. Other MCP hosts need to supply their
own explicit configuration.

## Resources and credentials

Resources are files or content a server advertises or returns. Drawloom keeps
their source identity when listing, reading and saving display references.
Selecting one is not permission to read arbitrary files or URLs. Tools may return
resource links that were never listed. Refresh and upstream change notifications
update the cached catalogue. See [discovery and resources](discovery-and-resources.md).

For Drawloom-owned HTTP connections, the MCP SDK handles OAuth using configured
registration, client metadata or advertised dynamic registration. The browser
receives a sign-in URL and safe status, not tokens, client secrets or package
headers. Credentials are scoped to installation, server, resource and issuer in
the OS credential store. If storage fails, sign-in is explicitly session-only.

Connect, Cancel, Reconnect and Disconnect use the connection's startup configuration.
Editing package files during a session cannot redirect sign-in. Changed tool
declarations and connections serving an MCP App require restart. Reconnect never
repeats uncertain calls. Disconnect removes local credentials; it does not claim
to revoke remote tokens. Global disconnect/client replacement closes the affected
server connection in every already-created project.

Codex-owned integrations use the adapter's optional `authenticate(selection)`
method instead. Codex owns that login and its credentials. Unsupported native
authentication is reported, not replaced with a competing credential flow.

## Trusted enhancement

Use `extensions["org.drawloom"]` only for Drawloom-specific backend, workflow,
dependency and workbench declarations. Keep standard skills, root `mcp.json` and
MCP Apps resources on their standard paths.

An illustrative extension, to be placed inside the root manifest:

```json
{
  "extensions": {
    "org.drawloom": {
      "version": 1,
      "backend": { "entrypoint": "./org.drawloom/backend.js" },
      "optional": [{ "kind": "capability", "id": "orchestration" }]
    }
  }
}
```

This requires a real, prebuilt backend at the declared path. Drawloom-only modules
and their packaged dependencies belong under top-level `org.drawloom/`. Backend
and workflow paths must start `./org.drawloom/` and end in `.js` or `.mjs`.
Inspection and activation both require regular files physically inside that
directory, including after resolving symlinks.

The schema identity is
`https://drawloom.org/schemas/1.0.0/plugin-extension.schema.json`. It is generated
from the contract definition; loading validates locally and never fetches it.
The namespace remains stable if the website moves. There are no namespace aliases
or alternate directories. Reinstall packages using this layout. Unknown extensions
are ignored; invalid Drawloom metadata disables only the enhancement, not valid
standard skills or servers.

### Supply a backend

The module's default export is a `PluginBackendFactory` from `@drawloom/desktop-host`.
It receives installation identity, package/data paths, configuration, fixed project
context, dependency availability and explicitly requested capabilities. It returns
contributions, optional controllers, named MCP transports and task handlers, plus
`dispose()` for cleanup. It cannot override a server declared in `mcp.json`.

Capabilities can include host storage/assets, tools, orchestration and evaluation.
Backend JSON keys are installation/project-scoped. Required tool identities use
`package:<package-name>:<server-name>:<tool-name>`; skills use
`package:<package-name>:skill:<skill-name>`. Ambiguous installations cannot satisfy
a dependency. App-only tools and tools with unsupported schemas cannot satisfy
model-tool requirements. The supplied gateway preserves the actual grants,
operation identity and execution records behind these names.

A missing required dependency disables the enhancement; a missing optional one
leaves unrelated operations usable. Only orchestration/evaluation capabilities
can currently be optional; tool and skill dependencies can also be optional.
Availability means the dependency exists, not that a service is ready or permission
has been granted. `orchestrationReadiness()` separately reports `ready`,
`configuration_required` or `unavailable`.

Backend trust means trusting code in the host process. The supplied API is the
supported integration route, not containment against malicious filesystem or
process access. Configuration changes apply after restart, subject to unfinished
work protection. No former startup-factory route is supported.

### Add workflows and evaluation

`workflows: {entrypoint: "./org.drawloom/workflows.js"}` declares a separate module
whose default export is a registry produced by `defineWorkflowModule` from
`@drawloom/orchestration`. It contains task/workflow definitions, not handlers or
Temporal imports. The backend supplies handlers using `registerTaskHandler`;
`matchTaskHandlers` checks exact identity/version matches and definition schemas.
Task `startToCloseTimeoutMs` defaults to 30 seconds when omitted.

The desktop's local Temporal integration checks missing prerequisites explicitly.
Its installed bundle checks and unfinished-run guards prevent changing code still
needed by saved work. Inspection alone proves none of this: it never imports or
runs a workflow. Read the [orchestration guide](../design/orchestration-contract.md)
for activation, recovery and verified limits under ADR 0021.

Evaluation receives fixed installation/project bindings at startup. Its composer
connects targets and scorers to existing orchestration handlers; it is not an agent
driver or browser service. Include the portable evaluation registry in installed
workflow definitions. Saved results can be read without running orchestration;
starting an experiment requires it. See the [evaluation guide](../design/evaluation.md).

### Open the workbench UI

Workbench placement names an MCP server and opening tool. It must match a workbench
and registered resource supplied by that backend; a manifest cannot claim another
package's view. The browser uses standard MCP Apps, not host capability objects or
a Drawloom-specific browser protocol. Compiled Svelte HTML is suitable. Test the
packed files outside their source checkout so workspace imports cannot hide missing
dependencies.

The host collects declared `resourceDomains` and recognised image/audio/video
link origins into a shared media policy. Installation media settings and
`DRAWLOOM_MEDIA_ORIGINS` can seed it. Inspection does not change the policy.
It stores origins and declaring identities, not signed URLs, and retains declarations
for offline references. Every workbench can load media from the shared origins;
this is a host choice, not a general MCP Apps guarantee or content-safety endorsement.

An open UI with outdated policy offers Reopen instead of silently restarting and
losing work. Media permission does not permit scripts, API connections, nested
frames or new iframe privileges. Fonts/styles remain limited to that UI's own
declarations. Relative media uses the view's project-bound URL; a returned URI
does not create a general host proxy. Integrations own URL renewal, credentials
and preservation. See the [desktop host guide](../design/desktop-host.md).

### Parallel calls and interactive forms

Local settings can allow parallel calls for a server by disabling its interactive
forms. The host setting is `elicitationDisabledServers` (default `[]`), not package
metadata. It accepts distinct selected server names with supported transports.
Changes use normal restart and unfinished-work checks.

Those connections omit MCP elicitation and reject unexpected form requests. Other
connections serialize forms to associate answers with the right invocation.
Tool grants, native approval and timeouts still apply. A broken or cancelled
connection can interrupt concurrent siblings; uncertain effects do not permit retry.

### Preconfigured OAuth clients

In remote connection settings, expand **Preconfigured OAuth client** and select
a local JSON file with `issuer` and `information` (the MCP SDK client information,
including `client_id` and optional secret/registration metadata). Import disconnects
the previous connection and stores the registration; then choose Connect.

Files must be regular, non-symlink files no larger than 64 KiB. The browser never
receives their contents or secrets. Drawloom neither deletes nor manages the original
file. Session-only storage remains explicit when the OS credential store fails.
