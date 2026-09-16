# ADR NNNN: Title

- **Status:** Proposed
- **Date:** YYYY-MM-DD
- **Decision owners:**

## Context

What forces require a decision? Describe the problem and the constraints a
reader needs before the decision makes sense. Say what prompted it now.

## Decision

What will the repository do? State it plainly enough that someone can tell
whether a future change complies.

## Alternatives considered

Which credible alternatives were rejected, and why? Distinguish an alternative
that was **evaluated** from one that was only **considered** — an untested
option is a judgement, not a result.

## Evidence

What was verified, what was not, and where the detail lives. Link to the record
in `knowledge/evidence/` rather than repeating it here; this section summarises
findings and their limits, and is not a place for run-by-run narration.

State the limits as plainly as the findings. An accepted decision is not a claim
that every workload was tested.

## Consequences

What becomes easier, harder, required, or deliberately unsupported? Include the
obligations this decision places on future work.

---

## Writing an ADR

Use the six sections above, in that order. They are the four from Michael
Nygard's original format plus **Evidence**, which Drawloom adds because its
decisions are evidence-led ([ADR 0006](0006-evidence-led-architecture-principles.md)).
Without a standard home, that material previously scattered across seven
different ad-hoc headings.

**Status** is one of `Proposed`, `Accepted`, `Deprecated` or `Superseded`. Add
`- **Accepted:** YYYY-MM-DD` when a decision is accepted, and record partial
supersession on the status line:

```text
- **Status:** Accepted; partially superseded by ADR 0026 and ADR 0027
```

Write for someone who was not in the room. Explain why before what. Keep
evidence in evidence files and decisions in the record.

An accepted ADR is not rewritten to reflect a later decision — a new ADR
supersedes it and links back. Editorial revision that preserves every claim is
permitted and must be identified as such; see [`docs/AGENTS.md`](../AGENTS.md).
