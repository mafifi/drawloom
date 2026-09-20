# ADR 0032: Preserve native delegation and independent conversation forks

- **Status:** Proposed
- **Date:** 2026-09-20
- **Decision owners:** Drawloom maintainers

## Context

The maintainer authorised exposing native child activity and independent forks.
Codex's model-facing delegation tools do not imply equivalent host RPCs. Its
parent-owned children reject ordinary direct input. Treating them as normal
conversations would misrepresent both interaction and execution ownership.

## Decision

Extend the agent contract with separate optional delegation and fork capabilities.
Codex owns native scheduling, context inheritance and continuation. Drawloom owns
fixed project binding, operation attribution, current tool authorization, approval
routing and retained presentation. Child identity is not an execution grant.

Delegation is initiated by the parent agent, including in response to ordinary
user requests. It is not a composer action. Child follow-up prepares editable
input for the parent; only Send submits it.
Child controls reflect verified provider support. Independent forks use native
history copying, the same project and explicit current setup; they neither create
worktrees nor start turns or inherit active goals. Unknown submissions are not
automatically repeated.

Every child operation requires its own admission and tool binding. Never lend the
parent's operation identity to a child. Native approvals retain their actual
requesting operation. Reconnect reconciles native descendants without recreating
them. A closed connection does not establish that native work stopped.

Keep native child snapshots distinct from terminal operation evidence. Preserve
one active operation per execution session, including concurrent child sessions.
Do not add a second scheduler, transcript store, team model or task board.

## Alternatives considered

- **Treat every child as an independent conversation:** rejected by inspected
  Codex parent-owned child restrictions; this was source-inspected, not live-tested.
- **Host-side spawn and continuation engine:** considered and rejected because it
  would compete with native delegation and change the requested semantics.
- **Render generic delegation observations only:** current behaviour loses child
  ownership, controls and actionable approval attribution.

## Evidence

The [delivery record](../plans/0032-native-delegation-and-forks.md) separates
source inspection, synthetic tests, installed verification and live-test limits.
The installed check caught a native writer-ownership defect: a fork submitted on
the parent's App Server could not be independently resumed while that writer
remained loaded. A short-lived fork connection now releases that writer without
closing the parent or its children. Confirmed identities and uncertain receipts
remain authoritative; releasing a connection never repeats the fork request.

Reference sources: the pinned Codex 0.153.4 App Server schema and implementation,
plus the [harness survey](../reference/harness-workbench-survey/README.md).
The inspected native contract supports independent `thread/fork`; delegation
tools belong to the parent model. Loaded child direct-input availability can be
unknown and must not be interpreted as permission.

The retained DeepSeek comparison inspected
[child continuation and inheritance](https://github.com/deepseek-ai/deepseek-harness/blob/b2e3b2a0125854567a4a5fcba75782e42fe84901/packages/subagent/subagent/src/continuation.ts):
its own runtime supports fresh and forked children with activation management.
Drawloom does not copy that scheduler into a Codex-backed host. Open Design's
[App Server session adapter](https://github.com/nexu-io/open-design/blob/81044a03ca717f77a5bde38947903a8ef222da8c/apps/daemon/src/agent-protocol/codex-app-server/session.ts#L200)
uses a narrower start/resume/turn subset, rejects native server requests and closes
after a turn. It is not evidence for child approval routing. These recorded
revisions are source findings, not fresh executions of either reference harness.
The maintainer-approved implementation plan explicitly chooses native Codex
semantics and Drawloom's existing authorization boundary where these differ.

## Consequences

Child tool and approval ownership is a release gate, not optional polish. Shared
conformance must cover supported and unsupported providers. Source inspection
does not replace disposable native tests, restart proof or installed review.
The existing installation and approved workbench viewer remain unchanged until
their updated integration is verified. ADR acceptance remains a separate decision.

## Scope and verification

This decision covers native children and independent same-project forks only.
Teams, shared task boards, automatic worktrees and additional production providers
remain excluded. The delivery record owns the test matrix and its outstanding
lanes; source inspection, scripted results and disposable native results are
separate evidence classes. No claim of completion follows from displaying child
activity alone.
