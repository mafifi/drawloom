# Local plugin packages

Bun implementation of the package inspection contract exported by
`@drawloom/plugins`. This bounded subsystem consumes local Agent Plugins 1.0.0
directories. It does not install packages, compose a workbench, grant tools,
load executable Drawloom backends, or inject skill instructions.

`inspectPackage(root)` validates the manifest against locally recognized rules,
then inventories valid skills and MCP servers independently. Unknown extension
data remains available as raw metadata; only the known Drawloom extension is
parsed. Invalid required/known manifest fields reject inspection. Component and
extension errors produce diagnostics while valid siblings remain available.
Skill paths are package-relative. `readSkill(inventory, name)` and
`readSupportingFile(inventory, name, relativePath)` explicitly read source files
within the resolved package root. Supporting references resolve from the skill
directory. Inspection executes no backend/server and fetches no remote schema.

`activatePackage(inventory, options)` is explicit trusted execution. Options
require `dataRoot`, `installationId`, and `selectedServers`. Stdio uses a
single executable token and separate opaque arguments; it provides the standard
root/data substitutions, constrained working directory, and persistent
installation-specific data. The SDK's limited default environment is inherited,
not arbitrary ambient credentials. This is not an operating-system sandbox.

Streamable HTTP preserves declared transport and original wire tool names.
The optional `authProviderFor(server)` supplies the MCP SDK OAuth client
provider. `fetch` is a host-owned network policy hook used for MCP and OAuth.
`packageFetch` scopes configured headers to the endpoint origin, lets generated
SDK headers take precedence, rejects redirects, and prevents SDK authentication
from replaying uncertain tool calls. Hosts must not make their fetch hook follow
redirects automatically; explicit redirect/auth integration belongs to the host.
OAuth browser flow and credential persistence are not implemented here.

Activation returns `servers`, a map of `{ client, close }` handles. Each handle
shares its close promise across overlapping shutdown calls.
The optional `clientCapabilities` passes composition-selected MCP capabilities
to initialization, including a host's MCP Apps support; defaults remain empty.

Activation also returns ordered
per-server `statuses`: `connected`, `failed`, or `auth-required`. The package
handle's `close()` disposes every successful connection independently. A
handshake defaults to 10 seconds and may be configured from 1 to 60,000 ms.
Failures wait for SDK transport/process cleanup, which may add up to the SDK's
graceful-exit and termination intervals. No tool/model invocation occurs during
activation. An explicit later caller owns discovery, invocation and grants.

Legacy SSE is reported and skipped. Same-origin redirects are also rejected;
the host must resolve a new endpoint explicitly. Resolved containment is
rechecked on reads and launch, but concurrent mutation by trusted package code
or another process remains outside this filesystem policy. Installation IDs
are host-selected, stable across updates, and must be unique in their data root.

The provider runs the portable `packageInspectionConformance` suite plus local
stdio/loopback HTTP tests. Those bounded results do not claim full standards
conformance, non-Bun portability, or full application integration.
