# Nightloom

Portable knowledge-maintenance coordination for the host-selected Temporal
orchestrator. Nightloom declares the deterministic workflow and typed task
handlers; it does not select a storage engine, orchestration provider, clock,
identity source, fingerprint implementation, or assessment model.

Automatic dispatch is due at 50 pending repair units or when the oldest unit is
one hour old. It requires explicit Temporal readiness and has no fallback engine.
The host persists coordinator settings, pause state, UTC budget, active run intent,
and assessment receipts through the narrow stores exported by this package.

Defaults allow one provider-issued work unit per run and therefore one assessment
at a time, with a five-minute task timeout. At most six automatic starts and 30
reserved automatic minutes are allowed per UTC day. A manual Run now bypasses an
exhausted automatic budget; Pause prevents new automatic and manual dispatch but
does not claim to cancel or roll back an active run.

The coordinator saves a stable run identity before starting Temporal. The task
handler saves the assessment request identity before model submission and saves
the model outcome before publication. Interrupted, running, and uncertain receipts
are reconciled with that identity rather than resubmitted. Evidence traversal is
bounded and must complete; truncation and references outside the supplied package
block publication. Publishing an empty proposal list still durably acknowledges
the exact issued unit, while later and unissued repair units remain pending.

`maxBytes` defaults to 900,000 bytes so the evidence payload retains headroom
inside the Temporal provider's one-MiB task-dispatch envelope. Larger evidence is
reported as blocked rather than silently truncated. Live scheduling, local SQLite
store adapters, authenticated subject derivation, model configuration, and UI
controls belong to the host composition root.
