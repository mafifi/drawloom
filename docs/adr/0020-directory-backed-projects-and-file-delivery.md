# ADR 0020: Directory-backed projects and efficient file delivery

- **Status:** Accepted
- **Date:** 2026-09-11
- **Accepted:** 2026-09-11, following maintainer review of implementation and evidence
- **Decision owners:** Drawloom maintainers
- **Related:** ADRs 0013–0016, 0018–0019
- **Delivery:** [implementation plan](../plans/0020-projects-and-file-delivery.md)
- **Evidence:** [implementation, measurements and browser checks](../../knowledge/evidence/adr-0020-projects-file-delivery.md)

## Context

Projects establish which working files Drawloom may present. A project binds a
directory; different workbenches may operate within it. A conversation belongs
to a project and a workbench, not to whichever directory is currently selected
in the sidebar.

Before this implementation, the desktop had one global application-state record named `project`.
Its Codex subprocess starts in the Drawloom data directory. That directory also
contains internal state and must not become a browser-accessible project root.
The previous asset interfaces returned whole buffers, and HTTP range handling read
the entire asset before slicing it. Browser import uses JSON/base64 and a 16 MiB
limit, separately from the 256 MiB managed-asset ceiling. These are implementation
constraints, not a reason to transfer file ownership to Drawloom.

Apply [architecture principles](../../ARCHITECTURE.md#decision-principles):
proportional efficiency, proven boundaries, safe defaults and familiar user
control. This is supported implementation work, not a new throwaway demonstration.

## Agreed direction

### File ownership remains unchanged

- Provider-managed working files remain in their working directory. Viewing a
  file does not import it, preserve historical bytes or accept it into a workflow.
- Plugins own their files, domain state, revisions and preservation choices.
- ADR 0014 continues to own captured conversation media and capture-once/cache
  semantics. History is neither a backup of all working files nor model memory.

R2, cross-machine synchronization, Git/worktree management, transcoding and a
universal artifact framework are excluded. Standard MCP resources are not a
streaming byte protocol; their bounded whole-content semantics remain unchanged.

### Directory-backed projects

Require a selected or newly created directory before a new conversation starts.
Store project identity and directory binding separately from application state.
Bind each conversation to its project permanently during normal navigation.
Use that directory for agent execution and project-scoped discovery.

Reject filesystem roots, Drawloom's internal data directory and directories
encompassing its private state. Resolve working-file reads within the bound
project, rejecting traversal, escaping symlinks and unsupported file kinds.
Browser input does not grant arbitrary absolute-path access.

The Node file store can receive the host's recorded directory identity. Check
that identity on its first open as well as subsequent reads, so replacing a
directory between project validation and file opening does not silently change
the file root. This is provider-specific validation, not a browser capability.

Unavailable directories prevent new execution and live file access, not cached
history reads. Preserve legacy records and assets; do not move files or expose
the former process directory automatically. Explicit project assignment precedes
further execution, and native continuation directory compatibility must be checked.

Use the existing shared sidebar/components, native folder selection where
available and validated host-local path entry for browser-hosted use.

### Efficient byte delivery

Amend the existing portable host contracts with metadata inspection, ranged
streaming reads and streamed writes, using byte iterables and cancellation.
Keep bounded whole-buffer helpers for small callers; large paths must not use
them as a fallback. Inspect and read from the same validated open file handle.

Serve authenticated HTTP full responses, HEAD and single byte ranges, including
suffix ranges, with truthful 206/416 responses. Honour cancellation/backpressure.
Keep immutable captured assets distinct from mutable working-file caching.
Unknown preview types remain downloadable; active content must not execute in
the application origin.

Explicit imports stream into temporary files, calculating hashes and enforcing
actual byte counts. Publish complete content-addressed assets atomically and
never register cancelled or failed partial uploads. Browser media admission uses
the existing 256 MiB ceiling; native image/model-input/RPC limits stay separate.

### MCP Apps and resource origins

The maintainer approved a shared declared-media policy after the initial local
delivery implementation. One host-owned module validates and persists declared
media origins with their source identities. Installation records configuration
without executing packages; activation submits MCP App resource-domain
declarations. Recognised MCP linked/embedded media results submit their URL's
origin through the same module. Merely inspecting a package, ordinary chat text,
arbitrary JSON and browser-supplied URLs never register a source. Enabled trusted
integrations declare sources without a second per-workbench approval prompt.

All Drawloom workbenches and shared media viewers consume this same policy.
Sharing source permission does not broadcast file references, signed URLs or
credentials. Store only origins and source identities in the policy; resource
records retain their own URLs. The owner handles URL refresh and preservation.
Loading does not establish that content is safe, grant script execution or
enable general network access. No arbitrary URL proxy or storage provider is
introduced. HTTPS sources and explicit loopback HTTP development sources are
supported; wildcards and credential-bearing URLs are rejected. The Drawloom
application origin itself must not become a shared media origin.

The policy retains origin/source metadata across restarts, including for cached
resource references. Per-result validation remains bounded; a cumulative
installation does not stop accepting history after an arbitrary lifetime count
of declarations. The remote viewer uses the same source list as MCP frames, so
redirects to another declared CDN work without proxying or permitting undeclared
destinations. Expired links produce visible feedback, not a generation retry.

MCP frames receive the current shared media sources when opened. A change to the
effective origin set changes its revision; duplicate declarations do not. The
host reports this revision through the existing application state. A Sonner
notification, exposed through `@drawloom/ui`, offers an explicit reopen action
for an outdated workbench UI. It never silently discards unsaved edits or restarts
agent/plugin processes. Installation changes requiring a full restart keep their
separate existing handling. Global sharing is Drawloom's host policy, not a new
MCP message or a universal MCP Apps guarantee.

Provide scoped host URLs for authorised project files by default, not access to
the host's entire origin. Opaque-origin frames must not obtain host credentials
or another project's file access. Plugin HTTP delivery retains plugin-owned
authorization; Drawloom is not an arbitrary URL proxy.

Use URL-based shared viewers with on-demand loading and cancellation when a
view is replaced. Viewing a file does not imply the model can consume it.

For the local project, the host supplies a scoped HTML base URL. Ordinary
relative media URLs resolve beneath the bound project directory. A fresh random
read-only URL scope belongs to one open MCP App mount and is revoked when that
mount closes or navigation selects another conversation. It cannot authorise
commands, another project or the host's internal state. This uses browser URL
resolution, not a new MCP Apps method or injected JavaScript capability.

The media-only profile is deliberately narrower than the upstream
`resourceDomains` mapping: shared domains permit images and audio/video. A UI's
own declared domains may also supply fonts/stylesheets, but never remote scripts.
General connections, nested frames and
additional iframe permissions remain unsupported. Self-contained compiled
Svelte HTML keeps its existing inline-script allowance. See the official
[CSP conventions](https://apps.extensions.modelcontextprotocol.io/api/documents/csp-and-cors.html).

## Project-scoped activation — maintainer approved

The implementation plan explicitly required maintainer review if project
isolation needed a new backend activation lifecycle. Initial source inspection,
before this change, reached that gate:

- [Backend loader](../../apps/desktop/host/plugin-backend.ts) caches activation
  by installation identity only and supplies one fixed context to the factory.
- [Backend contract](../../packages/desktop/desktop-host/src/index.ts) returns
  controllers and MCP transports once; neither has a project binding.
- [Desktop composition](../../apps/desktop/host/application.ts) keeps controller
  and MCP App registries globally by workbench/view identity, with installation-
  scoped persistence. Conversation project IDs alone cannot isolate this state.

The maintainer clarified: installation is global; activation belongs to a
project's working directory. Activate an enhanced backend once per
installation/project pair, with a fixed project identity/directory and
installation/project-scoped host persistence. Reuse that instance across the
project's conversations and retain it until host shutdown; navigation does not
dispose or retarget it. Scope backend-created MCP connections and controllers to
the same pair. Keep standard package identity, installation trust, OAuth ownership
global. Running MCP connections are project-scoped too; a connection cannot
silently switch working directories as the user navigates. Package files,
installation choices and authentication are not copied into each project.

This explicitly amends ADR 0018's once-per-installation activation semantics.
The backend context gains a fixed `project: { id, directory }`; its data directory
and JSON store are scoped to that installation/project pair. This is a trusted
backend addition, not an MCP Apps browser capability. The alternative was an
explicitly project-aware singleton backend with
context on every relevant operation; merely attaching context to UI calls would
not cover autonomous tool calls or background work. Do not introduce hidden
ambient project state, new browser methods or silent sharing as a workaround.

The desktop always supplies `project`; it remains optional for headless backend
consumers such as the retained orchestration proof. An absent directory permits
cached display, not installed-code activation. Activate only when the original
validated directory returns. A live runtime is never retargeted or replaced by
normal navigation. Existing-operation controls remain usable if its directory
subsequently disappears.

## Reference comparison

The [survey](../reference/harness-workbench-survey/README.md) records DeepSeek
`b2e3b2a` and Open Design `81044a03`; the local reference revisions remain those
revisions at initial inspection. DeepSeek separates streamed attachment storage
from workspace-scoped file presentation; Open Design separates mutable working
files from product-selected historical evidence. These support efficient reads
without automatic import, not a universal Drawloom storage framework.

[ADR 0018](0018-plugin-standards-and-runtime-extensions.md#reference-comparison-and-deliberate-differences)
records the deliberate backend extension and OpenAI/Rosalind comparison.
Neither Rosalind's first-party integration nor DeepSeek's scoped composition
establishes compatibility with the proposed Drawloom project activation contract.
MCP Apps remains the browser boundary; this ADR does not adopt their client kernels.

The local DeepSeek revision was rechecked for the shared-media decision. Its
Markdown renderer admits HTTP(S) image URLs directly; its authenticated
`session-controller/media-references.ts` route uses bounded whole-file reads
without HTTP ranges. Its client extensions run in-process rather than as MCP
Apps. Rosalind's inspected resource metadata declares empty resource domains;
it does not prove a shared domain policy. Drawloom's central source list and
explicit UI reopen are approved differences required by the chosen isolated UI.

## Verification and acceptance

Write failing tests for each implementation slice and share conformance across
the supported providers. Cover two-project isolation; unavailable directories;
traversal and symlink escapes; bounded range reads; cancelled streams/uploads;
partial-write cleanup; approved and denied origins; cross-project URLs; legacy
history preservation; unchanged media capture; and independent model-input limits.

Public tests use independently generated media. Realistic private samples remain
private and must not be copied into public code, fixtures or screenshots.
Measure bytes read/transferred, latency, cancellation and peak memory using
existing observability; verify actual browser behaviour in light/dark and narrow
layouts. Run canonical checks, shared conformance and UI-policy guards.

Accepted after maintainer review of the implementation and evidence. Acceptance
covers the demonstrated boundaries, not remote storage, live-provider validation
or a packaged desktop release. Actual checks and limitations remain in the linked
evidence. Legacy workbench state is retained in its original storage; no
automatic copying of a global controller into every assigned project occurs.
