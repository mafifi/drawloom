# Nightloom

Nightloom coordinates knowledge maintenance: it decides when a backlog of
repair units is worth an assessment run, and carries that run through to
publication. Read this if you are wiring up automatic or manual maintenance
dispatch, or tuning how much of the assessment budget a host is willing to
spend.

Nightloom is portable: it declares the deterministic workflow and typed task
handlers for the host-selected Temporal orchestrator, but does not choose a
storage engine, orchestration provider, clock, identity source, fingerprint
implementation, or assessment model. Live scheduling, local SQLite store
adapters, authenticated subject derivation, model configuration, and UI
controls all belong to the host composition root, not to this package.

## When a run starts

Automatic dispatch is due once 50 pending repair units have built up, or
once the oldest unit is an hour old — whichever comes first. It requires
explicit Temporal readiness and has no fallback engine.

By default, one provider-issued batch of up to 50 pending work units
becomes one bounded assessment, so only one assessment runs at a time, with
a five-minute task timeout. Automatic dispatch is further capped at six
starts and 30 reserved minutes per UTC day, to bound how much of the host's
assessment budget maintenance can consume on its own. A manual "Run now"
bypasses an exhausted automatic budget, since a person asking for a run has
already decided it is worth it. Pausing prevents new automatic and manual
dispatch, but does not cancel or roll back a run already in progress.

## What survives an interruption

The coordinator saves a stable run identity before starting Temporal. The
task handler saves the assessment request identity before submitting to the
model, and saves the model outcome before publication. This lets
interrupted, running, and uncertain receipts be reconciled against that
identity on recovery, rather than resubmitted and risk duplicating work.

Evidence traversal is bounded and must complete; truncation, or a reference
that falls outside the supplied package, blocks publication rather than
publishing on partial evidence. Publishing an empty proposal list still
durably acknowledges the exact issued unit, so later and unissued repair
units remain pending rather than silently dropped.

`maxBytes` defaults to 900,000 bytes, keeping the evidence payload inside
the Temporal provider's one-MiB task-dispatch envelope with headroom to
spare. Evidence that would exceed it is reported as blocked rather than
silently truncated — a run should fail visibly, not publish against
incomplete evidence.

## Where this fits

The host persists coordinator settings, pause state, UTC budget, active run
intent, and assessment receipts through the narrow stores this package
exports. See [orchestration](../../orchestration/orchestration/README.md)
for the workflow interface Nightloom builds on, and
[knowledge](../knowledge/README.md) for the maintenance and assessment
contracts it coordinates.
