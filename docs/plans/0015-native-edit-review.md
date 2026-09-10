# ADR 0015 implementation: native edit review

Status: completed on 2026-09-09. Implements the maintainer-approved plan.
[ADR 0015](../adr/0015-working-material-ownership-and-edit-approval.md) is accepted;
durable results and explicit limitations are in the
[implementation evidence](../reference/adr-0015-native-edit-review.md).

## Outcome and constraints

Use Codex's native human/automatic reviewer in the existing desktop and private
video plugin. Keep Drawloom tool grants and evidence independent. No second
reviewer, agent loop, approval service, bridge extension, demo or spike. Work
in the existing checkouts. No production migration, paid media, model downloads
or publication. Private implementation and fixtures stay private.

## Tasks

1. Align the ADR; add optional standard MCP annotations to typed tools and MCP
   exposure. Annotations never grant permission. Add optional human/delegated
   operation reviewer selection and explicit supported modes, defaulting old
   callers to human and rejecting unsupported selections.
2. Implement native Codex MCP approval, native automatic-review summaries and
   request cleanup. Retain exact provider choices privately; distinguish ordinary
   elicitation. Bind controls to session/turn/request; reject late responses.
   Keep sandbox, approval policy, organisation requirements and global config.
3. Persist Ask me / Approve for me per conversation, idle changes for next turn;
   use shared composer/approval UI. Default MCP review for mutating/unclassified
   tools, only explicit read-only bypass. Grants independently enforced.
4. In private drawloom-workbenches, expose recipe.revise_document targeting an
   existing candidate/artifact/text through existing revision logic; save an
   unaccepted candidate only. Enable agent revision from the existing MCP App,
   and direct edit/Save via a narrow app-only tool with no model/AI approval.
   Refresh view/context; stale handling stays private. Prepare public packages
   using the existing private dependency workflow.
5. Run public conformance and both canonical check:ci gates; exercise the existing
   desktop/video app in light/dark with synthetic material and live Codex. Record
   actual approve/deny/edit/restart outcomes separately from simulated denial,
   timeout and cancellation. Accept ADR only when required checks pass.

## Acceptance coverage

- Denial invokes no edit handler; approval invokes the exact edit once.
- Automatic review actually runs; deterministic approval/denial/timeout/cancel
  tests accompany honest live outcomes.
- Changed arguments, stale or cross-conversation responses cannot reuse approval.
- Native review cannot override missing or revoked Drawloom grants.
- No preview required; direct Save invokes no model or AI approval.
- Saved unaccepted revisions survive restart; authentication/routing still apply.
- No automatic working-file import; ADR 0014 captured media/history regressions pass.
- Public tests require no private package or credentials.

## Stop condition

If native review or standard MCP Apps cannot support the real interaction,
bring the concrete limitation to the maintainer before designing an alternative.
Retain durable results in the ADR and reference evidence; archive this execution
plan when complete under the plans convention.
