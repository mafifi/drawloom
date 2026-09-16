# `@drawloom/braintrust-assessment`

A Node-hosted individual-assessment provider for `@drawloom/evaluation`. Read
this before registering a Braintrust scorer, before adding an agent-judged
rubric, or before relying on this package for scheduling—it does not do that.

Braintrust wraps exactly one already-selected scorer invocation, with
`trialCount: 1`, `maxConcurrency: 1`, no-send logging and disabled cache.
Drawloom orchestration remains the only case scheduler, and Braintrust SDK
types never cross the public evaluation contract. If vendor cancellation
races an already-active selected scorer, the provider waits for that
scorer's settlement and preserves its outcome before returning; the existing
orchestration task deadline remains the outer bound.

## Built-in scorers

The frozen built-in catalog includes the Autoevals exact-match and
Levenshtein scorers. A host may add its own built-ins; duplicate ID/revision
pairs are rejected. Installed code may select a declared scorer identity and
bounded configuration, but it never receives an `AgentDriver`.

## Agent-judged rubrics

`createAgentRubricScorer` is optional and host-owned. It is unavailable
unless both an explicit configured-model label and an `AgentDriver` are
supplied—the host must already have composed that driver, since the current
agent contract neither commands a specific model nor measures the actual
model used. For that reason the label is recorded only as `model.requested`,
and no cost is fabricated from it.

Agent judging opens a fresh bounded session, requests no tools, and asks the
model not to use tools or take actions. It treats any observable approval,
input request, artifact or unexpected provider activity as failure: it
attaches the native signal stream before submission and interrupts unexpected
activity without resolving or approving it, so a missing terminal
confirmation stays visibly uncertain rather than being read as success.
Provider disconnects after submission likewise remain uncertain. Empty
Drawloom tool exposure does not prove native ambient-tool isolation—native
permissions and review remain authoritative. Every opened judge is closed in
an outer cleanup path; cleanup is retried without repeating model work, and
unresolved cleanup is retained beside the original outcome.

See [`@drawloom/evaluation`](../evaluation/README.md) for the scorer contract
this package implements.
