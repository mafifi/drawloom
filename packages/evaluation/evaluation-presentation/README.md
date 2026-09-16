# `@drawloom/evaluation-presentation`

Portable presentation state for a scoped evaluation service. Read this before
building a view or MCP App over `@drawloom/evaluation`, or before comparing a
result against a baseline.

It owns bounded page selection, stale-read protection, start/cancel/save
command state, exact baseline compatibility and advisory feedback drafts. It
does not select a provider, scope, model, tool, scheduler, acceptance state
or MCP transport—those stay with the host and the consuming application.

## Using it

Adapt your standard MCP App tools to `EvaluationPresentationClient`, then pass
the returned `{ presentation, actions }` to the shared `EvaluationWorkbench`
view from [`@drawloom/ui`](../../ui/ui/README.md). Opening and browsing
perform reads only; a start is an explicit action with one stable request
identity, and closing the view never cancels the underlying work.

## Comparing against a baseline

Baseline comparison permits different definitions, targets and supplied
outputs—what has to match is narrower and more precise: the same case
identity and revision, structurally identical case input and expected
material, and identical scorer identity, revision and configuration.
Unavailable combined detail still shows as a saved summary, and a user can
inspect one retained scorer checkpoint at a time.
