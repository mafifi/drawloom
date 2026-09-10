# ADR 0018: Standard plugin loading and runtime extensions

- **Status:** Accepted
- **Date:** 2026-09-10
- **Decision owners:** Drawloom maintainers
- **Related:** ADRs 0008, 0012–0017

## Decision and acceptance boundary

Accepted by the maintainer on 2026-09-10 after implementation and the migrated
consumer proof. The
[evidence record](../../knowledge/evidence/adr-0018-plugin-standards.md) distinguishes
public checks, live consumer observations, controlled transports and known limits.

Implement [Agent Plugins 1.0.0](https://agent-plugins.org/specification) as the
package format for standard skills and MCP servers. Add a small, optional,
trusted backend extension for Drawloom workbenches. Keep every browser UI on
standard MCP Apps.

Acceptance covers the demonstrated standard loading and bounded backend extension,
not production readiness or resolution of the native discovery latency.
The [delivery plan](../plans/adr-0018-implementation.md) and
[evidence record](../../knowledge/evidence/adr-0018-plugin-standards.md) distinguish
working slices, retained experiments, outstanding verification and limitations.
Do not infer completion from the presence of a loader or a passing demonstration.

Public contracts, loading, authentication and shared UI belong in Drawloom.
Proprietary tools, skills, recipes, compiled Svelte application and integration
scenarios remain in the private workbench repository.

## Why

Ordinary plugin authors should not need Drawloom factories, controllers or
private metadata merely to contribute skills or MCP tools. A package following
the supported standard should work through that standard path.

A workbench may additionally need Drawloom's project context, existing tool
gateway or accepted orchestration interface. Those backend dependencies are not
part of the package standard. A UI needing rich editing is not itself a reason
to add browser capabilities: MCP Apps remains the connection model.

Apply [architecture principles](../../ARCHITECTURE.md#decision-principles):
type safety, multi-provider support, replacement boundaries, accessible local
operation, proportional complexity, proven interfaces, safety, familiar
interaction and user empowerment. Installation must empower the user without
silently weakening execution permission or review.

## Standard package path

The supported metadata contract lives in
[@drawloom/plugins](../../packages/plugins/plugins/src/package.ts).
The Bun-hosted implementation is
[@drawloom/local-plugin-packages](../../packages/plugins/local-plugin-packages/README.md).
Retained spike code is evidence, never a runtime dependency.

1. Inspect an explicitly selected local directory. Read root `plugin.json`,
   standard `skills/` files and `mcp.json` using locally supported schemas.
   Do not import modules, start servers, fetch an unknown schema or inject
   instructions during inspection.
2. Preserve optional package versions without imposing Semantic Versioning.
   Diagnose invalid siblings and unknown extensions without hiding valid
   standard components. A malformed root manifest still rejects that package.
3. Record an installation identity and selected configuration under the chosen
   Drawloom data directory. New installations are inactive. Server activation
   and backend process trust are separate choices; neither grants tool access.
4. At startup, activate selected stdio or Streamable HTTP connections. Diagnose
   legacy SSE as unsupported. Standard `PLUGIN_ROOT` and `PLUGIN_DATA`
   substitutions follow the specification, with persistent data per installation.
5. Discover standard MCP tools/resources and project them into existing host
   discovery, execution and presentation. Bounded reads validate cursor progress.
   Equal tool names from different origins remain distinct; calls retain the
   original name on the server's wire.
6. Select skills deliberately. Supporting files retain their package-relative
   base. Being installed or discoverable does not put every skill into a prompt.

Package path containment, real-path checks and launch validation are not a
sandbox. Executable packages run with the selected host's process authority.
No automatic dependency installation, marketplace, arbitrary remote package
download or hot replacement is introduced. Configuration changes requiring
replacement take effect after restart.

### Identity and tool authority

Keep schema version, optional package version, installation identity and workflow
definition version separate. Browser selections carry host-issued identities,
not arbitrary native inputs.

Standard tools receive installation/server-qualified host aliases. The host
retains the alias-to-original-name mapping; aliases do not alter the server API.
Dependency metadata uses origin-qualified identities, not an unqualified tool
name that could accidentally bind another package. Ambiguous or unavailable
requirements fail the dependent enhancement rather than guessing.

The existing tool gateway still owns independent grants and execution evidence.
Codex native review still governs the exposed model call. Read-only annotations
describe behavior; they never grant permission. App-only tools cannot enter the
model gateway. Direct human MCP App editing keeps its established route.

A standard MCP error must remain a failed operation when projected through
Drawloom. Reconnection never automatically retries an invocation with an
uncertain outcome.

### Resources and working files

Reusable media, narration, brand and generation packages use validated local
files within configured working folders. They own their permitted-file checks,
output preservation and recovery records. They return standard MCP resources;
they do not require a running Drawloom asset library or treatment schema.

The workbench coordinates useful files and owns candidate revisions and business
acceptance. Drawloom handles authenticated viewing and ADR 0014's historical
media cache. A returned URI is a source-bound reference, not authority for an
arbitrary filesystem or network read. Reopening a package or conversation must
not recapture settled historical media.

## Authentication is owned by the connection host

Drawloom-owned HTTP connections use the MCP SDK's
[authorization facilities](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
Codex-owned integrations use Codex's native
[MCP sign-in operation](https://learn.chatgpt.com/docs/app-server).
Drawloom must not copy native provider credentials into its own store.

For Drawloom-owned connections:

- Discover protected-resource and authorization-server metadata. Bind the resource,
  issuer, installation and server; validate URLs and reject credential forwarding
  to unrelated origins.
- Support preconfigured registration, client-metadata documents and advertised
  dynamic registration through the SDK. Preserve the selected client
  authentication method through token refresh and restart.
- Explicit Connect starts browser authorization with PKCE. A short-lived,
  single-use state binds the callback to that exact flow and loopback listener.
  Cancel, denial, expiration, callback substitution and refresh failure remain
  visible. Late callbacks cannot resurrect a cancelled authorization.
- Keep tokens and private client information in the operating-system credential
  store. When unavailable, report session-only authentication. Never fall back
  silently to plaintext files, plugin configuration, browser state or history.
- Preserve one in-flight refresh per connection within the host. Disconnect
  drops the local MCP session and local credentials; this is not a claim of
  upstream OAuth token revocation.
- Authentication does not execute a tool, grant access or approve business work.
  A new connection/catalogue requiring registry replacement waits for restart.

The non-secret client-metadata document is at
[Drawloom OAuth client metadata](https://mafifi.github.io/drawloom/oauth/client.json).
It declares a public client and loopback callback path `/oauth/callback`.
The actual host callback uses its bound loopback port. Publication authorization
covers this metadata only, not journal edits or private material.

## Minimal Drawloom extension

Agent Plugins permits client-namespaced metadata. Drawloom interprets only
version 1 of `io.github.mafifi.drawloom`. Other clients can ignore it and continue
loading the package's standard components.

Example shape (illustrative public document workbench):

```json
{
  "extensions": {
    "io.github.mafifi.drawloom": {
      "version": 1,
      "backend": { "entrypoint": "./backend.mjs" },
      "requires": [{ "kind": "capability", "id": "host" }],
      "workbenches": [{
        "id": "document-reference",
        "title": "Document reference",
        "placement": "workbench",
        "openingTool": { "server": "editor", "tool": "open_editor" }
      }]
    }
  }
}
```

The [metadata schema](../../packages/plugins/plugins/src/package.ts) is
authoritative. The [backend contracts](../../packages/desktop/desktop-host/src/index.ts)
extend the existing desktop host seam; they do not introduce a second registry.

The backend is a package-relative, prebuilt JavaScript module with a default
factory. Validate metadata, containment, trust and required dependencies before
importing it. Activate it once, supply only the selected supported interfaces,
and retain its cleanup.

The context includes installation identity, package/data locations and selected
configuration. Its optional interfaces are the existing host context, tool gateway
and orchestration contract. The desktop does not invent a memory interface or
supply Temporal merely because a package asks for orchestration.

The backend returns existing contributions/controllers and may add named MCP
server connections. It cannot override or double-start a server declared in
standard `mcp.json`. Placement must belong to that installation's registered
workbench/view and match the opening tool's actual MCP App resource. Missing
requirements disable the enhancement, not unrelated standard components.

The maintainer approved a clean cutover: remove the earlier startup composition
factory and wrapper rather than retaining a compatibility path. Disposable WIP
state needs no migration; new installation state must remain durable.

The extension may declare optional tool/skill dependencies alongside `requires`.
The backend receives a startup presence report for declared dependencies only.
Missing optional contributions disable related operations, not the workbench;
presence is neither authentication, readiness nor permission. Optional injected
capabilities and capability-provider registration are not introduced. Backend
results expose contributions, controllers, named MCP connections and cleanup
directly. Host JSON keys are scoped by installation. These are explicit Drawloom
extensions, not claims about standard MCP or Codex interfaces.

Backend trust is process-level trust. Selecting interfaces constrains the
supported API, not malicious code. There is no browser-side capability injection,
new Drawloom wire protocol, proprietary service marketplace or dynamic dependency
injection framework.

## Reference comparison and deliberate differences

| Reference | What is reused | What it does not establish |
| --- | --- | --- |
| Agent Plugins 1.0.0 and Agent Skills | Manifest, component layout, loading, supporting files, launch rules | Workbench placement or Drawloom backend capabilities |
| MCP / MCP Apps | Tools, resources, connection negotiation, authentication and UI communication | Drawloom installation policy, grants or business acceptance |
| DeepSeek Harness | Trusted backend composition and lifecycle using supplied host services | Universal compatibility with this extension, or a need to import Cordis/in-process React modules |
| OpenAI / Rosalind | Rich isolated UI and host entrypoint placement as a reference | A general third-party privileged backend API; its first-party bridge is not adopted |
| Open Design | Multi-provider workbench integration and host-owned authentication lessons | Its implementation is not a security standard or a reason to persist plaintext credentials |

The detailed [composition comparison](../reference/plugin-composition-evidence.md),
[MCP Apps comparison](../reference/mcp-apps-host-evidence.md) and
[harness/workbench survey](../reference/harness-workbench-survey/README.md)
retain provenance. The namespace is an explicitly approved Drawloom extension,
not a claim that Codex or DeepSeek implements the same contract.

Rejected alternatives: factory-only ordinary plugins; a universal capability
provider marketplace; proprietary browser APIs; replacing the existing video
implementation with a separate demonstration; promoting Temporal into the desktop.

## Migration and required evidence

Migrate the private editorial pack, media, narration, brand and Veo to standard
packages. The treatment workbench adds the approved backend extension and keeps
the existing compiled Svelte MCP App, recipe, selections and reviews.

Preserve Veo's bound approval, allowance reservation and ambiguous-submission
recovery across the new process boundary. Preserve narration voice authorization.
No model-supplied argument can grant these permissions.

Build self-contained artifacts and run them outside the source checkout.
Use a generic MCP client against reusable plugins, real local FFmpeg and scripted
narration/Veo transports. Keep proprietary fixtures and consumer evidence private.

Public tests must cover inspection without execution, transport/component
isolation, origin collisions, trust/dependencies, resource authority, OAuth
failure/restart/cancellation, independent grants, app-only visibility and cleanup.
An unrelated public enhanced package challenges the extension. The retained
orchestration proof must use this entrypoint with the portable ADR 0017 contract;
Temporal and executable demonstrations remain under spikes.

The existing video UI must open through package loading, discover skills/tools,
inspect references, revise through native approval, save directly without AI and
restore after restart. Verify denial/revoked grants, cached media, keyboard,
light/dark and connection errors. Run both canonical gates and public dependency
and UI-policy checks. Record actual versus scripted outcomes separately.

No paid media generation, model downloads, production migration or private
publication is authorized. The maintainer reviewed the interfaces and evidence
and authorised acceptance and local commits; pushing or publication is separate.

### Follow-up: logging, observability and instrumentation

The observed 8,006 ms native-discovery fallback is a display deadline, not a
successful catalogue fetch or a performance target. Local results currently wait
on optional native discovery; the native categories are read sequentially. The
slow individual request has not been identified by per-request measurements.

The maintainer selected logging, observability and instrumentation as the next
ADR topic. Build on the existing observability ownership and authoritative
history/tool evidence, then return to this latency with measured timings. This
follow-up does not select a telemetry backend, add capability interfaces or
authorise exporting user content. Acceptance here does not treat the timeout
as a completed performance fix.

## Effect on accepted decisions

### Maintainer decision: standalone paid-generation consent

The private migration exposed a real process boundary: the existing paid-generation
policy uses trusted in-process callbacks to bind reviewed inputs, exact bytes,
provider route/pricing and the current allowance before atomically reserving spend.
Ordinary MCP arguments do not carry that authority. An agent-supplied approval
flag or an unprotected underlying submission tool would weaken existing controls.

The maintainer selected independent Veo operation: its package owns exact-request
spend consent, allowance accounting and uncertain-submission recovery. The treatment
workbench owns its recipe, selections and business acceptance. A standalone Veo
generation does not accept or change treatment material. No treatment veto or
cross-plugin spending authority is added to the generic provider package.

Use [standard MCP elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
for user confirmation, with standard capability negotiation and request/response
schemas. Drawloom supplies host-side presentation and request lifetime handling,
not a proprietary approval protocol. Responses must be source-bound, cancelable
and unable to release another invocation. Unsupported interaction is explicit and
fails closed. Native execution review and independent tool grants remain necessary;
delegated review does not answer ordinary user elicitation automatically.

The initial implementation supports form-mode elicitation from explicitly bound
package tool calls. Standard incoming MCP requests do not reliably expose their
parent tool-call identity over stdio, so Drawloom serializes requests per server
connection and binds the form to that call's existing operation/invocation.
Other server connections remain concurrent. An outstanding form can delay other
requests to its server; no duplicate server or proprietary correlation field is
introduced. Cancellation or uncertain completion retires the connection so an
abandoned request cannot acquire a later call's context. Reconnection never
replays the tool call.

Form-capable calls have a five-minute total deadline, including server work;
an outer native caller may cancel sooner. URL/task-associated elicitation and
unbound MCP App/resource calls are explicitly unsupported in this slice. These
are current host limits, not changes to the standard or evidence that the
standard cannot support them. A future extension still requires joint review.

Veo binds consent to its retained exact inputs, settings, pricing and allowance,
revalidates before atomic reservation, and retains uncertain reservations without
automatic resubmission. Elicitation itself is neither the ledger nor an acceptance
transfer. The same standard package must be exercised by a generic MCP client and
Drawloom. If this proof needs a non-standard interface, stop for a concrete joint
design before implementing it. The installed replacement passed verification;
the legacy composition route is removed, with no compatibility adapter.

### Existing ADRs

This ADR extends ADR 0013's factory-only delivery with standard package
loading and the bounded backend entrypoint. It extends ADR 0016 discovery with
explicit installation/activation and connection authentication. It does not
silently rewrite those accepted ADRs.

ADRs 0008, 0014 and 0015 retain tool authority, cached history/media, working
material ownership and native review. ADR 0017's accepted contract/conformance
may be published as a portable package; its Temporal implementation remains
retained proof, not an accepted desktop backend.
