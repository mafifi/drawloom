# `@drawloom/braintrust-assessment`

Node-hosted individual-assessment provider for `@drawloom/evaluation`. Braintrust
wraps exactly one already-selected scorer invocation with `trialCount: 1`,
`maxConcurrency: 1`, no-send logging and disabled cache. Drawloom orchestration
remains the only case scheduler. Braintrust SDK types do not cross the public
evaluation contract.
If vendor cancellation races an already-active selected scorer, the provider
waits for that scorer's settlement and preserves its outcome before returning;
the existing orchestration task deadline remains the outer bound.

The frozen built-in catalog includes Autoevals exact match and Levenshtein
scorers. A host may add its own built-ins; duplicate ID/revision pairs are
rejected. Installed code may select a declared scorer identity and bounded
configuration, but never receives an `AgentDriver`.

`createAgentRubricScorer` is optional and host-owned. It is unavailable unless
both an explicit configured-model label and an `AgentDriver` are supplied. The
driver must already be composed by the host to use that selection: the current
agent contract neither commands a model nor measures the actual model. The label
is therefore recorded only as `model.requested`. No cost is fabricated.

Agent judging opens a fresh bounded session, requests no tools, asks the model not
to use tools or take actions, and treats observable approvals, input requests,
artifacts or unexpected provider activity as failure. It attaches the native
signal stream before submission and interrupts unexpected activity without
resolving or approving it; missing terminal confirmation remains uncertain.
Provider disconnects after submission likewise remain uncertain. Empty Drawloom tool exposure
does not prove native ambient-tool isolation; native permissions and review remain
authoritative. Every opened judge is closed in an outer cleanup path. Cleanup is
retried without repeating model work and unresolved cleanup is retained beside
the original outcome.
