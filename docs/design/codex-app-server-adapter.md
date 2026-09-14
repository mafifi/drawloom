# How Drawloom connects to Codex

Drawloom uses Codex's app-server to run conversations, receive progress and
handle requests for approval or information. `@drawloom/codex-agent` translates
that protocol into the shared [agent interface](agent-execution-contract.md).
It does not run a second agent loop or replace Codex's native conversation.

Use this guide when working on the integration itself. Workbench authors
normally use the shared interface instead. The
[implementation](../../packages/agent/codex-agent/src/index.ts) is separate from
the original experiments supporting
[ADR 0007](../adr/0007-provider-neutral-agent-execution.md).

## What the host supplies

`createCodexDriver` receives an app-server connection factory and a `JsonStore`
for private session mappings. The host can also supply:

- A fixed, validated project directory.
- The MCP configuration that exposes Drawloom tools.
- Callbacks that bind accepted Codex turns to Drawloom operations.
- Trusted readers and capture functions for image input and returned media.
- Display-history capture, separate from tool execution permission.

The driver does not discover arbitrary files, choose a user's project or
install Codex itself. Project checks compare the native conversation directory
with the supplied directory before resuming; a mismatch rejects the session.

The host owns transport setup and shutdown. See the
[desktop host guide](desktop-host.md) for application wiring and the
[agent contract source](../../packages/agent/agent/src/index.ts) for public inputs.

## Accepted mapping

The adapter keeps Codex identifiers private and translates the following calls:

| Drawloom action | Codex request or notification |
| --- | --- |
| Open or resume a session | `thread/start` or `thread/resume` |
| Submit work | `turn/start` |
| Steer active work | `turn/steer` with `expectedTurnId` |
| Request interruption | `turn/interrupt` |
| Add per-operation context | `additionalContext` |
| Advertise Drawloom tools | MCP server configuration |
| Receive the final outcome | `turn/completed` |
| Handle approval or requested input | Matching app-server request and response |
| Describe native delegated work | Bounded provider observations |

Tool calls still go through Drawloom's gateway. The host maps the exact native
thread/turn pair to the originating Drawloom operation; it must not use whichever
operation happens to be current when a delayed call arrives. Tool result
correlation uses explicit identifiers preserved through MCP, not matching names,
text or timestamps. See [tool execution](tool-execution-contract.md).

## Native review addition (ADR 0015)

The adapter supports human and delegated review through `reviewerModes` and the
operation's `reviewer` selection. These map to Codex's `user` and `auto_review`
reviewers. Human review is the default.

Codex 0.153.4 is the recorded minimum for the native MCP review mapping. The
adapter checks the reported version and rejects tool-bearing sessions without
that support. It confirms the human reviewer at startup and supplies the chosen
reviewer on each turn. A newer version passing that check is not, by itself,
proof that every upstream protocol change is compatible.

For Drawloom MCP tools, approval defaults to `prompt`. Tools trusted by the
host as read-only may use `approve`; their annotations are hints, not grants.
The gateway independently checks permission on every invocation.

Native MCP approval is recognised through
`_meta.codex_approval_kind: mcp_tool_call`. Ordinary form elicitation remains a
request for information, not approval. Each approval is tied to its session,
turn and request, and expires when resolved or when that operation ends.

Delegated-review notifications produce bounded `approval-review` observations.
Review starting is not the same as an approval decision; denial, timeout and
cancellation remain distinct. The adapter does not introduce a second reviewer,
tool record store or mandatory plugin preview.
[ADR 0015](../adr/0015-working-material-ownership-and-edit-approval.md) records
the decision and tested limits.

## Context and native conversation history

Codex owns its native transcript and compaction. Drawloom disables Codex
cross-thread memory for its managed sessions and supplies selected context
through session instructions and per-operation `additionalContext`. It does
not write compiled memory back through `thread/inject_items`.

The adapter saves the private native-thread mapping so an existing Drawloom
session can resume. That is not a promise to recover every in-flight action
after a crash. Lost or incompatible state must not cause a silent repeat of
possibly completed work.

Drawloom captures display history separately. Completed native items can help
populate it, but native history cannot guarantee replay of every lost text delta.
See [conversation history](../reference/conversation-history.md) for capture,
pagination and asset handling.

## Models, discovery and media

Explicit model selection applies to the next turn. The adapter reads Codex's
model list and rejects unsupported models or effort settings before dispatch.
Steering cannot change the active turn's model.

Discovery lists what Codex reports, with availability and revision information.
Listing an integration does not prove that it can execute, grant it permission
or copy its resources into context. Resource reads and provider-owned
authentication follow the
[discovery interface](../reference/discovery-and-resources.md).

Image input and returned images use host-supplied asset functions. Provider
paths do not become portable asset identities, and a model-supplied path is not
permission to read a local file. Tool content uses standard MCP content and the
existing host viewers rather than a new provider-specific browser protocol.

## Native tools and their permissions

The driver requests read-only sandboxing and on-request approval at thread
startup. Drawloom's advertised MCP catalogue stays fixed during a session,
while the gateway's allow/deny decisions can change between calls.

Do not infer complete isolation from empty plugin, app or MCP configuration
maps. The [ADR 0015 live run](../reference/adr-0015-native-edit-review.md#boundaries-and-follow-up)
found ambient integrations still listed on Codex 0.153.4. That observation proves
neither that they were callable nor that they bypassed approval.

The maintainer's 2026-09-10 clarification favours retaining authorised native
tools with their existing controls, not excluding them merely because Drawloom
does not own them. See the
[architecture principle](../../ARCHITECTURE.md#application-to-native-tools-and-integrations).
Verify actual access and review coverage before claiming either isolation or
safe support. Drawloom's tool grants do not govern every native action.

## Progress, failure and cleanup

Attach the single signal consumer before starting work. The adapter translates
ordered messages, interactions and terminal outcomes, without replaying old
notifications or assigning late messages to a later operation. Raw provider
envelopes, credentials and hidden reasoning do not belong in these signals.

Native delegated workers remain observations within the parent operation.
They are not independent Drawloom sessions with their own controls. Likewise,
token usage is provider-reported information, not a cost guarantee.

Closing releases the connection and active session resources. The optional
`archiveOnClose` setting is for dedicated managed sessions and requires a fresh
thread with an exact native terminal-turn signal. It is not a general cleanup
policy for user conversations. Live tests must keep exact creation receipts and
clean up only their own disposable tasks, following
[AGENTS.md](../../AGENTS.md).

## Initial tool-boundary evidence

The 2026-09-04 tool-exposure experiment used Codex app-server 0.149.0. One MCP
server remained attached across three operations while the gateway allowed,
denied and allowed calls. It verified schema projection and explicit Drawloom
result correlation, including a denied invocation.

The [evidence record](../../knowledge/evidence/adr-0005-tool-exposure.md) retains
the exact version, protocol digest and results; the
[experiment](../../spikes/adr-0005-tool-exposure/) remains outside supported
packages. Its isolation observations apply to that test setup, not all later
Codex versions.

## Current evidence boundary

The [ADR 0007 evidence](../../knowledge/evidence/adr-0007-codex-app-server.md)
records the original live tests for lifecycle, context, steering, interruption,
approvals, requested input, resumption and bounded native-delegation observations.

Those tests supported the design decision. They do not replace the current
[provider tests](../../packages/agent/codex-agent/driver.test.ts) or establish
transparent recovery after every provider or host failure. Scripted transport
tests check Drawloom's handling; they do not constitute a new live-model result.

The recorded Codex Desktop smoke test discovered and invoked the MCP server,
but declined single and concurrent form requests without displaying them.
Retain that host limitation alongside the successful app-server tests.
Do not describe it as universal form support or as a requirement that Drawloom's
own app-server client must inherit the limitation.

## Compared integrations

The original work compared Codex app-server integration with Open Design's
multi-provider runtime. Both informed how to keep connection handling, provider
state and message translation out of application code. The comparison and
revision-bound sources are retained in the
[harness and workbench survey](../reference/harness-workbench-survey/README.md).

These references informed the implementation; they do not justify moving
memory, orchestration, business approval or content-bearing telemetry into
the Codex adapter.
