# ADR 0013: Define plugin contributions, dependencies and host integration

- **Status:** Accepted
- **Date:** 2026-09-09
- **Decision owners:** Drawloom maintainers

## Context

Plugins compose tools, skills, capability implementations and specialist
workbenches. Backend contributions and UI need one ownership decision, not
separate extension frameworks. A specialist editor must own its product
documents and interactions without teaching the public shell its business rules.

The maintainer selected the private video workbench as the proving consumer,
Rosalind as the rich-UI benchmark, and DeepSeek Harness as a composition
reference. The maintainer explicitly chose MCP Apps rather than in-process
client modules, then authorised acceptance after a bounded working proof.
Richer needs can be revisited in a future ADR as the workbench develops.

## Decision

A plugin is a versioned package of contributions, not a new platform capability.
Public capability contracts remain authoritative regardless of which package
implements them. Registration, activation and permission are separate.

### Contributions and ownership

| Contribution | Owner and boundary |
|---|---|
| Tools | Typed definitions and handlers under ADR 0008; model invocation passes through the existing gateway and policy |
| Skills | Instructions referring to available capabilities/tools; instructions cannot grant authority |
| Workbench | Composition and product-owned state/rules; not another agent loop |
| UI resources | Plugin-built MCP Apps HTML/JS/CSS; Drawloom owns placement, hosting and access to host services |
| Capability implementation | Implements an established public capability; the composition root selects and wires it |

The last row is an ownership rule, not a requirement to add eleven provider
slots. Add registration support when an implemented capability needs it.
Plugin-owned payload schemas do not become proprietary platform capability
interfaces or cross-plugin service protocols.

Public Drawloom owns the shell, shared UI, generic hosting and conformance.
Private `drawloom-workbenches` owns only its WIP plugins, product logic, skills,
build pipeline and business tests. It supplies no second shell or bridge host.
Public CI and the default application work without the private repository.
No private source, fixtures, screenshots, prompts or assets are copied here.

### Dependencies, configuration and activation

Declare requirements on public capability identities or named tools/skills.
Prefer a capability over a particular provider plugin. A specific tool or skill
dependency is reasonable when its behaviour is essential. Do not depend on
another plugin's private memory, orchestration or service interface.

Use Bun package resolution and the root catalog for versions. The startup
registry validates required identities, duplicate contributions, configuration
and ownership; it is not another package manager or dependency-injection system.
Dependency order must not become implicit service injection. Private build-time
package dependencies do not create new runtime host capabilities.

Activation uses explicit trusted startup composition. No marketplace, automatic
dependency fetching, hot replacement, mid-session unload or remote install API
is added. Credentials remain in trusted host setup, outside UI resources,
project documents and model-visible context.

### Standard MCP Apps connection

A plugin supplies an MCP server connection using the SDK `Transport` and an
opening tool. Drawloom advertises MCP Apps support, discovers tools and reads
the HTML resource identified by the opening tool's `_meta.ui.resourceUri`.
Tool metadata and resource identity must agree. Unsupported resource permissions
and origins are rejected rather than silently granted.

Use upstream `App`, `AppBridge` and `PostMessageTransport` for initialization,
host context, tool calls/results, messaging and teardown. The implementation
uses ext-apps 1.7.5 and MCP SDK 1.x through the root catalog. No custom UI wire
protocol or Rosalind first-party bridge extension is introduced.

Plugins may compile Svelte components and `@drawloom/ui` into a self-contained
HTML resource. View/ViewModel separation and ADR 0012 remain applicable. The
plugin does not join the host component tree or require public business types.

| Interaction | Accepted boundary |
|---|---|
| Read and inspect | Standard `tools/call` to app-visible tools on the server bound to the view; plugin-owned input/result schemas |
| Theme and lifecycle | Standard host context and bounded teardown; no custom lifecycle protocol |
| Selected model context | `ui/update-model-context`; replaces ephemeral reference material without invoking a model |
| Request assistance | Explicit `ui/message` in the current conversation, through the existing agent adapter |

The video server exposes app-only read/inspect tools. They are not added to
agent tool exposure. Inspection is navigation, not candidate acceptance,
output selection, permission or spend approval. Existing product validation
remains authoritative. Do not expose the full controller command union.

Selected context is untrusted reference material, not developer instructions or
permission. Text is the initial advertised modality; structured JSON context is
validated. Later updates replace earlier context, empty updates clear it, and
navigation/view closure removes it. Unsupported or oversized requests fail.

The authenticated parent captures conversation/view routing. Assistance calls
also use a host-issued mount identity, so old callbacks cannot become valid
after reopening and delayed teardown cannot clear replacement context. That
identity is internal host routing, not an MCP App field or method. View navigation
must keep supplied context consistent with the visible inspected material.

The host may reject a message if the agent is busy. No implicit steering,
queueing, retry, new-task API or raw provider session is exposed. Sending a
message is not permission to save or accept its reply, generate paid media or
perform business writes. Codex retains its transcript; project state is not a
duplicate transcript or a new memory system.

### Host enforcement and limits

The public browser host uses a script-enabled iframe without same-origin
privilege, a restrictive resource CSP and source-bound message transport.
It grants no Tauri, filesystem or process API. Calls are checked against the
active conversation/workbench and bound server. Timeouts do not automatically
retry mutations. Teardown cannot roll back an already dispatched operation.

These are trusted-plugin controls, not a hostile-code isolation guarantee.
A frame may navigate itself and disclose data through a URL; CPU use is not
bounded. Exact enforcement and cleanup limits live in the
[desktop host boundary](../design/desktop-host.md#provisional-plugin-view-hosting).

## Reference comparison and alternatives

The authoritative escalation rule is
[reference-led changes and approval](../../ARCHITECTURE.md#reference-led-changes-and-approval).
Apply it to registration, dependencies, authority, ownership, lifecycle and UI,
not only additional bridge methods. Method counts alone do not measure authority.

| Boundary | Reference evidence and decision |
|---|---|
| UI connection | Rosalind serves MCP HTML; DeepSeek loads client modules into its host. MCP Apps is explicitly selected instead of in-process UI. |
| Product data | Rosalind returns application-owned payloads; DeepSeek client code consumes its owning service's types. Drawloom likewise imposes no `OperatorSnapshot` or controller requirement on the bridge. |
| Composition | DeepSeek's contributions are a reference. Its Cordis service registry, hot lifecycle and dynamic bundling are not adopted. Use explicit startup composition and established contracts. |
| Placement | Rosalind declares home/settings entrypoints; DeepSeek uses UI contributions/slots. Drawloom's one-view-per-owning-workbench restriction is proof scaffolding, not an accepted general layout API. General placement is deferred. |
| Assistance | Standard context updates and messaging cover the current-conversation proof. This is not Rosalind's first-party `startTask({title,prompt})`; no new-task extension is approved. |
| Richer authority | Read/inspect remains app-only. Review, grants and paid generation are not exposed by migration; their future UI authority mapping needs explicit review. |

The [Rosalind evidence note](../reference/mcp-apps-host-evidence.md) distinguishes
actual application calls from bundled SDK support. Its inspected launcher is
not proof of concurrent editing or every possible renderer. The
[DeepSeek comparison](../reference/plugin-composition-evidence.md) records the
contrasting composition model. Neither is a shopping list of host features.

Persist with standard MCP Apps until a concrete interaction proves it
insufficient. Before departing from either reference or adding an extension,
bring the maintainer the interaction, observed equivalents/evidence gaps,
smallest standard-only alternative, authority and maintenance cost. Obtain an
explicit decision before implementation and record changed boundaries in a
future ADR. No first-party extension has been approved by this decision.

## Proof and acceptance

Accepted after the maintainer-authorised proof on 2026-09-09:

- The real private Svelte workbench loads its populated synthetic project in
  the public host through upstream MCP Apps. Inspection and restart retain state.
- Selection supplies context without model execution. An explicit revision
  request reached live Codex and its response appeared in the current
  conversation. The private project file remained byte-for-byte unchanged.
- A separate public counter/editor fixture exercises different payloads without
  a private controller. Tests cover protocol calls, denial, ownership,
  context replacement, stale mounts and cleanup. Public/private gates pass.

The [proof record](../../knowledge/evidence/adr-0013-plugin-host-integration.md)
owns exact versions, counts and evidence. It distinguishes protocol tests,
browser interaction and live provider execution. No paid media generation,
model download, patient data or publication was part of this slice.

Acceptance covers plugin boundaries and the standard connection, not a finished
video workbench or every MCP Apps feature. General placement, live candidate
updates, concurrent editing, review/spend UI, media access and native Tauri
verification remain follow-up work. Those deferred interfaces are not silently
approved. Measure startup, interaction latency, memory and realistic project
size before optimising; no performance conclusion is claimed here.

## Consequences and related decisions

Specialist plugins can own rich interfaces without product-specific core types.
They incur a separate UI build and a message boundary. High-frequency visual
work should remain in the plugin UI rather than crossing the bridge per frame.
Functional proof supports this choice; realistic performance still needs measurement.

ADR 0011 remains Proposed for the broader supported foundation implementation.
This ADR consolidates its plugin ownership/startup decisions and supersedes the
initial declarative-only UI restriction for the bounded trusted-host integration.
ADR 0008 still owns tool execution; ADR 0012 still owns shared components.
Future changed boundaries require a new ADR, not retroactive expansion of this one.
