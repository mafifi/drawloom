# Local plugin packages

Node implementation of the package inspection contract exported by
`@drawloom/plugins`. Read this if you are inspecting or activating a local
Agent Plugins 1.0.0 package. This is a bounded subsystem: it does not
install packages, compose a workbench, grant tools, load executable
Drawloom backends, or inject skill instructions — those decisions belong
to the host.

## Inspecting a package

`inspectPackage(root)` validates the manifest against locally recognized
rules, then inventories valid skills and MCP servers independently, so one
broken skill does not hide the rest of a package. Unknown extension data
remains available as raw metadata; only the known Drawloom extension is
parsed. Invalid required or known manifest fields reject inspection.
Component and extension errors produce diagnostics while valid siblings
remain available. Skill paths are package-relative. `readSkill(inventory,
name)` and `readSupportingFile(inventory, name, relativePath)` explicitly
read source files within the resolved package root, and supporting
references resolve from the skill directory. Inspection executes no
backend or server and fetches no remote schema — it only reads what is
already on disk.

## Activating a package

`activatePackage(inventory, options)` is explicit trusted execution.
Options require `dataRoot`, `installationId`, and `selectedServers`. Stdio
uses a single executable token and separate opaque arguments; it provides
the standard root/data substitutions, a constrained working directory, and
persistent installation-specific data. The SDK's limited default
environment is inherited, not arbitrary ambient credentials — but this is
not an operating-system sandbox, so treat activation as trusted execution,
not containment.

Streamable HTTP preserves the declared transport and original wire tool
names. The optional `authProviderFor(server)` supplies the MCP SDK OAuth
client provider. `fetch` is a host-owned network policy hook used for MCP
and OAuth. `packageFetch` scopes configured headers to the endpoint
origin, lets generated SDK headers take precedence, rejects redirects, and
prevents SDK authentication from replaying uncertain tool calls. Hosts
must not make their own fetch hook follow redirects automatically —
explicit redirect and auth integration belongs to the host, not this
package. OAuth browser flow and credential persistence are not
implemented here.

Activation returns `servers`, a map of `{ client, close }` handles; each
handle shares its close promise across overlapping shutdown calls. The
optional `clientCapabilities` passes composition-selected MCP capabilities
to initialization, including a host's MCP Apps support, and defaults to
empty.

Activation also returns ordered per-server `statuses`: `connected`,
`failed`, or `auth-required`. The package handle's `close()` disposes
every successful connection independently. A handshake defaults to 10
seconds and may be configured from 1 to 60,000 ms. Failures wait for SDK
transport/process cleanup, which may add up to the SDK's graceful-exit and
termination intervals. No tool or model invocation happens during
activation — an explicit later caller owns discovery, invocation and
grants.

## Other boundaries worth knowing

Legacy SSE is reported and skipped rather than silently upgraded.
Same-origin redirects are also rejected; the host must resolve a new
endpoint explicitly. Resolved containment is rechecked on reads and
launch, but concurrent mutation by trusted package code or another
process remains outside this filesystem policy. Installation IDs are
host-selected, stable across updates, and must be unique in their data
root.

## Testing

The provider runs the portable `packageInspectionConformance` suite,
exported by `@drawloom/plugins`, plus local stdio/loopback HTTP tests.
Those bounded results do not claim full standards conformance, portability
beyond this Node provider, or full application integration. See
[packages/README.md](../../README.md) for how a contract package like
`@drawloom/plugins` relates to an implementation like this one.
