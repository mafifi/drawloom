# @drawloom/evaluation-presentation

Portable presentation state for a scoped evaluation service. It owns bounded
page selection, stale-read protection, start/cancel/save command state, exact
baseline compatibility, and advisory feedback drafts. It does not select a
provider, scope, model, tool, scheduler, acceptance state, or MCP transport.

Consumers adapt their standard MCP App tools to `EvaluationPresentationClient`
and pass the returned `{ presentation, actions }` to the shared
`EvaluationWorkbench` view. Opening and browsing perform reads only. A start is
an explicit action with one stable request identity; closing never cancels work.

Baseline comparison permits different definitions, targets and supplied outputs.
It requires the same case identity/revision, structurally identical case input
and expected material, and identical scorer identity/revision/configuration.
Unavailable combined detail remains visible as a saved summary; the user may
inspect one retained scorer checkpoint at a time.
